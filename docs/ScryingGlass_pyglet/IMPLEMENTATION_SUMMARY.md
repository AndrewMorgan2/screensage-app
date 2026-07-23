---
title: "Display Engine Internals"
---

# ScryingGlass — Display Engine Internals

ScryingGlass is a Python/Pyglet OpenGL application that renders a scene described by a JSON config file onto a fullscreen window. It runs as a separate process launched by the Rust backend (or manually), and watches its config file for changes — when you save a scene edit in the browser, the display updates automatically.

---

## How It Fits In

```
Browser edits JSON  →  Rust saves to storage/scrying_glasses/
                                      ↓
               watchdog detects file change
                                      ↓
               display_engine_pyglet.py reloads & rerenders
```

One ScryingGlass process = one screen. Launch multiple processes (with different JSON files) for multiple player screens.

---

## File Structure

| File | Purpose |
|------|---------|
| `display_engine_pyglet.py` | Main engine (~1100 lines) — renders all element types |
| `fog_manager_pyglet.py` | Fog of war system (~485 lines) |
| `touch_input.py` | Raw multitouch input via evdev, independent of Pyglet's mouse events |

---

## Rendering Pipeline

Pyglet uses OpenGL under the hood. All rendering goes through a **batch** — Pyglet draws everything in the batch in one GPU call per frame.

**Frame loop:**
1. Clear screen
2. Draw background (image or video — stays fixed, doesn't zoom/pan)
3. Apply zoom/pan transformation (modify GL projection matrix)
4. Draw all scene elements via batch (sprites, shapes, text)
5. Apply fog overlay via stencil buffer
6. Flip

Pyglet pushes alpha blending to the GPU — transparent 1080p video runs at 60 FPS with ~10% CPU usage.

---

## Element Types

All elements are defined in the JSON config. The engine reads the type field and constructs the appropriate Pyglet object:

| Type | Pyglet object | Notes |
|------|--------------|-------|
| Image | `pyglet.sprite.Sprite` | PNG/JPG, supports opacity and rotation |
| Video | `pyglet.media.Player` + Sprite | WebM (transparent), MP4; hardware decoded |
| GIF | `pyglet.image.Animation` | Native frame timing |
| Text | `pyglet.text.Label` | TTF/system fonts, hex colour, alignment |
| Token | `pyglet.shapes.Circle` + Arc border | Circular marker with configurable colour |
| Area | `pyglet.shapes.Rectangle` / Circle | Transparent fill, colour, opacity |
| Line | `pyglet.shapes.Line` | Thickness as positional arg |
| Cone | Custom polygon | Sector shape for spell effects |
| Wall segment (`config['walls']`) | `pyglet.shapes.Line` | Loaded separately by `load_walls()`, not part of `elements` — see [Walls](#walls-configwalls) below |

Positions and sizes accept absolute pixels, percentage strings (`"50%"`), or relative floats (`0.5`).

---

## Zoom and Pan

Zoom and pan work by modifying the OpenGL projection matrix (`glOrtho`) rather than moving each element individually. This means:

- Zero CPU cost — it's a single matrix on the GPU
- All batched elements transform together automatically
- The background is drawn *before* the transform is applied, so it stays fixed

Controls: mouse wheel to zoom at cursor, right-click drag to pan, `+`/`-` keys, `H`/`Home` to reset. Zoom range is 0.1× to 10×.

Fog clearing is done in **world space** (before the transform) so it stays accurate when zoomed.

---

## Fog of War (`fog_manager_pyglet.py`)

The fog is a coloured overlay that covers the whole scene. Clicking/dragging on the map "clears" a circular area, revealing what's underneath.

**How clearing works:**
1. Click/touch coordinates are converted from screen space → world space via `_screen_to_world()` (accounts for zoom/pan). This is Pyglet-native space: bottom-left origin, y increasing upward.
2. A 32-point circle polygon is generated around that point.
3. Two independent wall-blocking passes run against it (see below).
4. The resulting polygon is **merged into `fog_cleared_areas`** via `_merge_and_store_area()` — unioned (using `pyclipper`) with any existing revealed area whose bounding box overlaps it, rather than simply appended.

**Why merge instead of append:** `fog_cleared_areas` used to be a `deque(maxlen=2000)` — every touch/drag appended a brand-new circle, and once the cap was hit, the *oldest* revealed areas were silently evicted (they'd re-fog). With multitouch, several simultaneous drags can each add a new circle every frame, so that cap was reached almost immediately in real play. Merging overlapping areas together means a continuously-dragged reveal collapses into a handful of polygons instead of one per touch event — e.g. 300 small overlapping touches along a dragged path merge into a single polygon — so revealed areas are permanent for the session (no eviction) *and* the per-frame redraw cost stays proportional to the number of distinct revealed regions, not the number of touches that ever happened. `MAX_FOG_CLEARED_AREAS` is now just a last-resort safety cap on genuinely disjoint regions, not a rolling window.

Note there's currently no on-disk persistence of `clear_polygons` at all (despite what `FEATURES.md`'s config reference implies) — revealed fog is session-only in memory and resets when the display engine process restarts.

**Rendering:** The fog uses the OpenGL **stencil buffer** — cleared-area polygons are written to the stencil via `_rebuild_stencil_batch()`, and the fog overlay is only drawn where the stencil is not set. Each polygon is rendered with `pyglet.shapes.Polygon` (which triangulates via ear-clipping), so concave shapes carved out by walls render correctly — an earlier version of this function approximated each cleared area with a bounding circle instead, which silently discarded any wall clipping (the circle around a wall-clipped polygon is roughly the same size as an unclipped one).

### Walls (`config['walls']`)

Segments drawn on the browser's [Walls page](../FEATURES.md#walls--doors) are a separate, simpler mechanism from the legacy `isWall`-flagged-element shadow casting below — no shadow polygons, no `pyclipper`.

- `load_walls()` (in `display_engine_pyglet.py`) draws each segment as a visible `pyglet.shapes.Line`, added to `self.wall_shapes` and cleaned up/recreated on every config reload alongside `load_elements()`.
- `FogManagerPyglet._gather_wall_segments_px()` converts each `{x1,y1,x2,y2}` fraction (0–1 of the screen) into Pyglet-native pixel coordinates — critically, **flipped the same way `load_walls()` flips them for rendering** (`y_px = window_height - frac_y * window_height`), so the invisible fog-blocking geometry matches where the wall is actually drawn. `config['elements']` raw x/y are left un-flipped by contrast (web/top-left convention) — a pre-existing inconsistency in the older `isWall` mechanism, not touched here.
- `FogManagerPyglet._clip_polygon_by_walls()` does the actual blocking: for every point on the fog-clear circle, cast a ray back to the light/touch position (`_ray_segment_intersection_t()`); if it crosses a wall segment, pull that point back to the crossing instead of its original position. This is a direct "is this point on the other side of a wall from the light" visibility test — no shadow-silhouette computation, no polygon boolean subtraction.

### Legacy wall shadows (`isWall`-flagged elements)

Any regular `elements` entry (area, line, token, image) with `isWall: true` and not `invisible` is treated as an opaque occluder by the older mechanism: `_get_wall_solid_polygon()` subtracts the element's own footprint from the clear circle, then `_calculate_shadow_polygon()` projects a shadow polygon from it and subtracts that too, using `pyclipper` for the polygon boolean ops (falls back to a much cruder simplified subtraction if `pyclipper` isn't installed — see Dependencies below).

Keyboard shortcuts: `R` reloads the config (picks up wall/fog changes). See [Debug Overlays](README.md#debug-overlays) (`W` to toggle, `C` to clear markers) for visually confirming click/wall alignment — off by default, since wall lines and touch markers are debugging aids, not something players should see during play.

---

## Multitouch Input (`touch_input.py`)

Pyglet's window only ever exposes a single OS-emulated mouse pointer (`on_mouse_press`/`on_mouse_drag`/`on_mouse_release`) — X11/Wayland collapse all simultaneous touches down to that one pointer regardless of what the touch hardware itself reports. For a touch-table setup where multiple minis or fingers can be on the board at once, that meant a second contact while the first was still down was simply invisible to the app.

`touch_input.MultiTouchReader` reads the touch device directly via `evdev` (Linux multitouch **Protocol B**: `ABS_MT_SLOT` selects which contact subsequent `ABS_MT_*` events apply to; `ABS_MT_TRACKING_ID` assigns/releases a stable id per contact), on a background thread, entirely independent of Pyglet's mouse events:

- `find_touchscreen_device()` auto-detects a suitable device from `evdev.list_devices()` — name must suggest a touchscreen and *not* a trackpad (laptop trackpads also report `ABS_MT_SLOT`), and must have both `ABS_MT_SLOT` and `ABS_MT_TRACKING_ID` capability.
- The reader thread pushes `('down'|'move'|'up', touch_id, raw_x, raw_y)` tuples into a thread-safe queue; `PygletDisplayEngine._process_touch_events()` drains it once per frame (from `update()`, the main/GL thread) and feeds each contact into `fog_manager.handle_mouse_click()` independently — `handle_mouse_click()` is used for both down *and* move (not `handle_mouse_motion()`, which gates on a single global `mouse_dragging` flag that can't represent "N touches, only some of them currently down").
- `MultiTouchReader.normalize()` converts the device's raw coordinate range (queried from its own `ABS_MT_POSITION_X/Y` capabilities, not assumed to match the window resolution) into Pyglet window pixel space, flipping y the same way `load_walls()` and `_gather_wall_segments_px()` do.
- Each touch gets its own persistent numbered [debug marker](README.md#debug-overlays) for its whole lifetime (namespaced separately from the single mouse pointer's marker), so simultaneous contacts are each visually distinguishable when debug overlays are on.

Falls back cleanly to mouse-only input if no touchscreen is found or `evdev` isn't installed (`MultiTouchReader.available` is `False`; nothing else in the engine needs to know).

---

## Live Config Reload

`watchdog` monitors the JSON file. On any file change event:

1. All current elements are cleaned up (videos stopped, sprites deleted, batches cleared)
2. JSON is re-read
3. All elements are recreated from scratch

This happens in under a second and is what makes the browser editor feel live.

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `pyglet` 2.0+ | OpenGL window and rendering |
| `watchdog` | File system monitoring |
| `Pillow` | Image handling |
| `pyclipper` | Polygon boolean ops: subtraction for the legacy `isWall`-element shadow casting, and union for merging overlapping revealed fog areas together (`_merge_and_store_area`). Without it, both fall back to cruder behavior — shadows barely block anything, and revealed areas can't merge (so long sessions grow one polygon per touch instead of one per distinct region). It was missing from `requirements.txt` for a long time; now required. The `config['walls']` ray-clipping mechanism itself doesn't need it. |
| `evdev` | Reads the touch device directly for real multitouch support — see [Multitouch Input](#multitouch-input-touch_inputpy). Linux-only; without it, `touch_input.MultiTouchReader.available` is `False` and the engine falls back to single-pointer mouse input. |

All are installed in the project's `python-env`.
