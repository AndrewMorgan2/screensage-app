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

The fog is a coloured overlay that covers the whole scene. Players click to "clear" areas, revealing what's underneath.

**How clearing works:**
1. Click coordinates are converted from screen space → world space
2. A circle polygon is subtracted from the fog shape using `pyclipper` (falls back to simple ops if not installed)
3. The resulting cleared polygons are stored in the JSON config and persisted across reloads

**Wall shadows:** If walls are defined in the config, the fog manager casts shadow polygons behind them using line-of-sight geometry. Areas behind walls stay fogged even if the surrounding area is cleared.

**Rendering:** The fog uses the OpenGL **stencil buffer** — cleared polygons are written to the stencil, and the fog overlay is only drawn where the stencil is not set. This gives pixel-perfect transparency with no texture overhead.

Keyboard shortcut: `C` clears all fog. `R` manually reloads the config.

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
| `pyclipper` | Precise polygon subtraction for fog (optional) |

All are installed in the project's `python-env`.
