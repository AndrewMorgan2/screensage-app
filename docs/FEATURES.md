---
title: "Features Guide"
---

# Screen Sage Features Guide

Comprehensive guide to all Screen Sage features, with implementation details and usage examples.

## Table of Contents
- [Navigation & Command Center](#navigation--command-center)
- [VTT Coordinate Systems](#vtt-coordinate-systems)
- [Element Types](#element-types)
- [Fog of War System](#fog-of-war-system)
- [Walls & Doors](#walls--doors)
- [Display Controls](#display-controls)
- [Preview System](#preview-system)
- [Draw Page](#draw-page)
- [SageSlate Player Aid Manager](#sageslate-player-aid-manager)
- [Rules Assistant](#rules-assistant)
- [Kindle Character Sheets](#kindle-character-sheets)

## Navigation & Command Center

### Scrollable Top Bar
The main nav bar (`.navbar-container` in `static/css/styles.css`) scrolls horizontally instead of wrapping or overflowing when there are more tabs than fit on screen. This keeps the bar usable on narrow/kiosk displays regardless of how many tabs are enabled.

### Tab Visibility
The Commands page (`/`) has a **Tab Visibility** section that lets you enable/disable which tabs appear in the top nav bar. "Commands" itself can't be hidden, since that's where this control lives.

- State is stored in `storage/nav_config.json` as `{"tabs": {"<tab_id>": true|false}}`. A tab missing from the file defaults to enabled.
- The nav bar links are built server-side per request in `build_nav_links()` (`src/template_loader.rs`), which reads `nav_config.json` and skips any tab marked `false`. The tab ID list there (`NAV_TABS`) must stay in sync with the `NAV_TABS` array in `src/templates/command_center.html`.
- The toggle UI reads/writes `nav_config.json` through the existing generic `/json/read` and `/json/save` endpoints (the same ones used for battlemap/display screen config), rather than a dedicated API.
- Disabling a tab only hides it from the nav bar — the route itself is still reachable directly by URL.
- Toggling a checkbox takes effect on the next page load (nav links aren't re-rendered live across other open tabs).

## VTT Coordinate Systems

### Percentage Coordinates

Screen Sage supports three coordinate formats for resolution-independent layouts:

#### Supported Formats

1. **Absolute Pixels** (number): `100` → 100px
2. **Percentage Strings** (string): `"50%"` → 50% of dimension
3. **Relative Floats** (0.0-1.0): `0.5` → 50% of dimension

#### Example Usage

```json
{
  "type": "text",
  "x": "50%",
  "y": "10%",
  "size": "5%",
  "text": "Centered Text"
}
```

#### Supported Elements

All element types support percentage coordinates:
- Tokens (x, y, size)
- Areas (x, y, width, height)
- Text (x, y, size)
- Videos (x, y, width, height)
- GIFs (x, y, width, height)
- Images (x, y, width, height)
- SVGs (x, y, width, height)
- Lines (x, y, endX, endY, thickness)
- Cones (x, y, radius)

#### Percentage Slider Controls

The VTT interface includes toggle buttons for each slider:

- **Blue "px" button**: Absolute pixel mode
- **Green "%" button**: Percentage mode
- Click to toggle between modes
- Automatic value conversion
- Per-property mode memory

**Features:**
- Smart reference dimension selection (width vs height)
- Preserves value proportions when switching
- Works with all position and size properties
- Excludes opacity, rotation, and angle properties

**Full Documentation:** PERCENTAGE_COORDINATES_IMPLEMENTATION.md

## Element Types

### Area

Rectangular overlay region, typically used for spell effects, zones, or highlighted areas.

| Property | Type | Description |
|---|---|---|
| `x`, `y` | number/% | Top-left position |
| `width`, `height` | number/% | Dimensions |
| `color` | hex string | Fill color |
| `alpha` | 0–100 | Fill opacity percentage |
| `rotation` | 0–360 | Rotation in degrees (around center) |
| `label` | string | Optional label text |
| `labelDisplay` | boolean | Show/hide label |
| `keepAspectRatio` | boolean | Lock aspect ratio when resizing |

```json
{
  "type": "area",
  "x": 200, "y": 150,
  "width": 300, "height": 200,
  "color": "#2ecc71",
  "alpha": 30,
  "rotation": 45,
  "label": "Danger Zone"
}
```

### Cone

Triangular/wedge overlay for area-of-effect spells and abilities.

| Property | Type | Description |
|---|---|---|
| `x`, `y` | number/% | Tip position |
| `radius` | number/% | Cone length |
| `angle` | 0–360 | Direction in degrees |
| `spread` | number | Width angle in degrees |
| `color` | hex string | Fill color |
| `alpha` | 0–100 | Fill opacity percentage |

```json
{
  "type": "cone",
  "x": 960, "y": 540,
  "radius": 200,
  "angle": 45,
  "spread": 60,
  "color": "#ff6600",
  "alpha": 40
}
```

## Fog of War System

### Overview

Interactive fog system with advanced features for battlemap visibility control.

### Features

- **Wall-Blocked Reveal**: Fog clearing stops at walls drawn on the [Walls page](#walls--doors) instead of passing through them
- **Interactive Clearing**: Click to clear fog areas during gameplay
- **Persistent State**: Cleared areas saved to JSON configuration
- **Zoom Support**: Fog clearing works correctly when zoomed in/out
- **Template System**: Customizable default fog settings

### Configuration

#### Basic Fog Setup

```json
{
  "fog": {
    "enabled": true,
    "opacity": 0.7,
    "color": "#000000",
    "clearMode": true,
    "clearRadius": 40,
    "clear_polygons": []
  }
}
```

#### Properties

- **enabled** (boolean): Enable/disable fog
- **opacity** (0.0-1.0 or 0-255): Fog transparency
- **color** (hex string): Fog color (e.g., "#000000")
- **clearMode** (boolean): Enable interactive clearing
- **clearRadius** (number): Radius of clearing circle in pixels
- **clear** (boolean): Reset all cleared areas when true
- **clear_polygons** (array): Stored cleared area shapes

### Fog Template System

Create custom fog presets in `storage/scrying_glasses/fog_template.json`:

```json
{
  "fog": {
    "enabled": true,
    "opacity": 0.4,
    "color": "#000000",
    "clearMode": true,
    "clearRadius": 40,
    "clear_polygons": []
  }
}
```

### Add/Remove Fog Buttons

**VTT and Display tabs** include fog management buttons:

- **Add Fog**: Loads template and adds fog to configuration
- **Remove Fog**: Removes fog from configuration

### Fog with Zoom

The fog system correctly handles coordinate transformation when zoomed:

- Mouse clicks transformed from screen to world space
- Clearing works accurately at any zoom level
- Fixed in display_engine.py:274

### Clear Property

Set `"clear": true` to reset all cleared fog areas:

```json
{
  "fog": {
    "enabled": true,
    "clear": true
  }
}
```

The system checks this flag each frame and resets `clear_polygons` when true.

**Full Documentation:** FOG_TEMPLATE_SYSTEM.md

## Walls & Doors

### Overview

The **Walls** tab (`/walls`) is a standalone page for drawing wall segments that block fog reveal on the live display. It's deliberately separate from the VTT/Display element editors — no element types, no drag handles, just a canvas for drawing lines over the active battlemap.

Unlike the polygon-based `clear_polygons` fog data, walls are simple line segments with no "door" concept of their own — to open a gap in a wall (e.g. a door), just delete the segment there. Re-draw it to close it back up.

### Editing the Active Battlemap

The Walls page always reads and writes `storage/scrying_glasses/battlemap.json` directly — the same file ScryingGlass's Battlemap display reads. There's no file picker: whatever you draw takes effect on the next fog reload with no extra save step (every change autosaves immediately).

### Toolbar

- **Draw Wall**: click points on the map to place connected wall segments. Each click after the first commits a segment and immediately starts the next one from that same point, so you can trace a room's perimeter in one pass. Clicking near an existing endpoint snaps to it, so walls actually connect at corners. Escape or double-click ends the current chain.
- **Select / Delete**: click a segment to select it (highlighted), then **Delete Selected** or press Delete/Backspace to remove it.
- **Clear All**: removes every wall on the map (confirms first).
- **Wall color**: sets the color used for new segments; also recolors the currently selected segment.

### Data Model

Walls are stored in the config's `walls` array, as coordinates given as **fractions (0–1) of the screen** (not absolute pixels) — this keeps them correct across zoom and portrait/landscape rotation without needing to know pixel dimensions:

```json
{
  "walls": [
    { "id": "wall_abc123", "x1": 0.3, "y1": 0.2, "x2": 0.3, "y2": 0.6, "color": "#c0392b" }
  ]
}
```

If the background art is portrait and gets auto-rotated to fill a landscape screen (see [VTT Coordinate Systems](#vtt-coordinate-systems)), the Walls page mirrors that same rotation in its preview so wall coordinates line up with what's actually shown live.

### How Walls Block Fog

On the display engine side (see [ScryingGlass Display Engine](ScryingGlass_pyglet/README.md)), each wall segment is used as a simple line-of-sight occluder: for every point on the edge of the fog-clearing circle, a ray is cast back to the light/touch position, and if it crosses a wall, that point gets pulled back to the crossing instead of its original position. This clips the revealed area to stop at the wall — no shadow-polygon or wall-thickness math needed, and it's independent of the older `isWall`-flagged-element shadow-casting mechanism.

A debug aid is available directly on the display: with debug mode on (default), every click/drag shows a numbered circle at the exact point being used for fog clearing, so you can visually confirm touch position lines up with wall placement. Press **C** to clear the markers.

## Display Controls

### Button System

Both VTT and Display tabs include standardized controls:

#### Element Addition Buttons

- Add Token
- Add Area
- Add Text
- Add Video
- Add GIF
- Add Image
- Add SVG
- Add Line
- Add Cone

#### Utility Buttons

- **Add Fog**: Add fog configuration from template
- **Remove Fog**: Remove fog from configuration
- **Collapse All**: Collapse all control sections

### Display Tab Button IDs

Display tab uses "2" suffix for all element IDs to avoid conflicts with VTT tab:

- `addTextBtn2`, `addImageBtn2`, etc.
- `jsonInput2`, `parseButton2`, etc.
- Both tabs share the same JavaScript modules

### Template System

Buttons load element templates from JSON files instead of hardcoded values:

- **Fog Template**: `storage/scrying_glasses/fog_template.json`
- **Element Templates**: Customizable defaults for each element type

## Preview System

### Preview Scale

The VTT preview includes a zoom control for the preview area.

#### Scale Limits Per Tab

Each tab has its own maximum scale setting:

| Tab | Min | Max | Notes |
|---|---|---|---|
| Battlemap (VTT) | 10% | 150% | Standard display scale |
| Display | 10% | 150% | Mirrors Battlemap range |
| SageSlate | 10% | 250% | Higher max for small e-ink canvas |

#### Controls

- **Slider**: Drag to adjust scale within the tab's range
- **Display**: Shows current percentage next to slider
- **Minimize Button**: Collapse the scale panel to save space

### Scale Persistence

Preview scale is saved to localStorage:

- **VTT Tab**: Uses key `vtt_preview_scale`
- **Display Tab**: Uses key `display_preview_scale`
- **Restoration**: Automatically restores on page load
- **Independence**: Each tab remembers its own scale

### Preview Features

- **Live Rendering**: See changes immediately
- **Element Selection**: Click elements to edit
- **Drag and Drop**: Move elements visually
- **Coordinate Display**: Shows position and size
- **Grid Overlay**: Optional alignment grid

## Draw Page

The Draw page (`/draw`) provides a live annotation overlay for the active battlemap or display output. Changes made here are broadcast via WebSocket and rendered on top of the configured background.

### Live Sync with Battlemap/Display

The draw page listens for WebSocket refresh events from the server. When the active config on the Battlemap or Display tab is changed, the draw page automatically reloads its element list to stay in sync.

- Refresh messages with `source: "draw_tab"` or `source: "draw_clear"` are ignored to prevent feedback loops
- The draw page reconnects automatically if the WebSocket drops (2 second retry)
- The target (Battlemap vs Display) is determined by the dropdown at the top of the draw page

### Coordinate Handling

The draw canvas is always rendered at 1920×1080. Elements defined with smaller `screen.width`/`screen.height` values in the config are scaled up proportionally using:

```
scaleX = canvas.width  / config.screen.width   (default 1920)
scaleY = canvas.height / config.screen.height  (default 1080)
```

All three coordinate formats are supported and handled identically to the display engine:

| Format | Example | Interpretation |
|---|---|---|
| Absolute pixels (integer) | `200` | 200px |
| Percentage string | `"50%"` | 50% of the relevant dimension |
| Relative float (0.0–1.0) | `0.5` | 50% of the relevant dimension |

Values that are non-integer floats between 0 and 1 are treated as relative fractions, matching the `parse_dimension()` logic in the Python display engine.

### Alpha Transparency

Both `area` and `cone` elements honour the `alpha` property on the draw canvas:

- `alpha` is stored as an integer 0–100 in the JSON
- Converted to 0.0–1.0 when composing the canvas `fillStyle`
- Hex colour values are decomposed to `rgba(r, g, b, alpha)` before drawing

### Clear Button Behaviour

The **Clear** button on the draw page:

1. Sends a clear command to the server to wipe the draw overlay from the active config
2. Immediately removes the `draw_overlay` entry from the in-memory element list
3. Redraws the canvas so the overlay disappears without a page reload

## SageSlate Player Aid Manager

The SageSlate tab includes a Player Aid Manager for composing images to send to e-ink displays. Its layout follows the same pattern as the Battlemap and Display tabs.

### Layout Structure

```
element-buttons toolbar
  └─ Add Box | Add Circle | Add Text | Add Bar | Collapse All
Send Image button + device selector (above preview)
previewArea  (position: relative, scales up to 250%)
lastMovedSection  (appears on element drag, shows inline controls)
<details> Elements        (collapsible)
<details> JSON Editor     (collapsible)
<details> Saved JSONs     (collapsible)
```

### Element Types

The Player Aid Manager supports a simplified element set suited for black-and-white e-ink rendering:

- **Box** — filled or outlined rectangle
- **Circle** — filled or outlined circle
- **Text** — label with configurable font size and colour
- **Bar** — progress/resource bar (e.g. HP tracker)

Fog buttons are not present in the SageSlate tab — fog of war is a Battlemap/Display-only feature.

### Invisible Property

The **Invisible** checkbox available in the Battlemap and Display element controls is suppressed in the SageSlate Player Aid Manager. E-ink layouts do not use the invisible toggle.

### Sending to a Device

Select a device number (0–4) from the dropdown next to **Send Image**, then click **Send Image** to push the current canvas render to that e-ink display over the network.

### Preview Scale

The SageSlate preview slider ranges from **10% to 250%** (higher than the 150% maximum on the Battlemap and Display tabs) because the e-ink canvas is typically much smaller than a 1080p screen and benefits from extra zoom for editing detail.

## Rules Assistant

The Rules Assistant (`/rules`) is a voice-controlled reference tool for calling out condition and rule text mid-session without touching a keyboard.

### How It Works

- Uses the browser's `SpeechRecognition` API — requires Chrome or Edge (a Google-backed Chromium build). Open-source Chromium builds without a Google API key will show a "network" error on start.
- Click **Start Listening**, then say a trigger phrase (e.g. "grappled"). The matched rule's name, category, and description appear in a card and stay visible until a different rule is triggered.
- The **Repeat delay** dropdown (10s–2min) sets a per-rule cooldown so the same rule doesn't re-trigger the moment it's said again.
- The **System** dropdown filters which rule file is active; selecting "All Systems" disables matching entirely. Switching systems clears the current match and resets cooldown timers.

### Rule Files

One JSON file per game system, stored in `storage/rules/<system>.json`. Drop a new file in and it appears automatically in the System dropdown — `GET /api/rules/systems` lists available systems by filename (no server restart needed).

```json
{
  "rules": [
    {
      "id": "grappled",
      "category": "Condition",
      "name": "Grappled",
      "keywords": ["grapple", "grappled", "grappling"],
      "description": "Speed becomes 0 and can't benefit from any bonus to speed. Ends if the grappler is incapacitated, or if an effect removes the grappled creature from the grappler's reach."
    }
  ]
}
```

- `keywords` are matched as whole-word, case-insensitive regexes against the live speech transcript
- `category` and `description` are shown in the matched-rule card; `id` must be unique within the file (used for cooldown tracking)

### Troubleshooting

- **"Speech recognition isn't supported"** — switch to Chrome or Edge.
- **"network" error on Start Listening** — same root cause: the browser build lacks Google's speech-to-text API key.
- **Microphone permission denied** — click the mic/lock icon in the address bar, allow access for the site, then try again.

## Kindle Character Sheets

A touch-friendly DCC/TTRPG character sheet, originally built as a standalone project for a jailbroken Kindle Paperwhite running fully offline over a laptop WiFi hotspot. It's now also served directly from ScreenSage, so it runs from the same `cargo run` process as everything else.

### Pages

- **`/kindle`** — character picker (no `?char=` query) or a specific character's sheet (`/kindle?char=grix`)
- **`/kindle/status`** — party status page: every *enabled* character with a live HP readout, tap through to any character's sheet
- **`/characters`** — GM-facing admin page (the "Characters" tab in the main nav) to enable/disable which characters appear in the picker and status page above

### Character Sheet Layout

- Stats and combat numbers sit in a fixed grid at the top.
- Abilities are collapsible accordion items below the stats — tap an ability's header to expand it and reveal its description, remaining uses, and **Use**/**Reset** buttons inline; tap again to collapse.
- Depleted abilities (0 uses remaining) are grayed out but stay expandable so they can still be Reset.
- HP has +/- buttons at the top of the sheet; every change is written to disk immediately, no save step.
- The frontend (`static/kindle/`) is deliberately plain ES5 + `XMLHttpRequest` — no `fetch()`, no arrow functions — written defensively for the Kindle's browser.

### Character Data

One JSON file per character in `storage/kindle_characters/<id>.json`:

```json
{
  "name": "Grix Stonejaw",
  "class": "Warrior",
  "level": 1,
  "enabled": true,
  "hp": { "current": 6, "max": 8 },
  "stats": { "Strength": "16 (+2)" },
  "combat": { "AC": "14" },
  "abilities": [
    {
      "id": "mighty-deed",
      "name": "Mighty Deed of Arms",
      "type": "Any melee/ranged attack",
      "description": "Roll the Deed Die alongside your attack die...",
      "uses": null
    }
  ]
}
```

- `enabled` (boolean, defaults to `true` if omitted) controls visibility in the picker/status page. Toggled from `/characters` — this hides the character, it doesn't delete the file.
- `uses: null` marks a passive/at-will ability with no Use/Reset buttons; `uses: {"current": n, "max": m}` adds them.
- To add a new character: drop a new `<id>.json` file into `storage/kindle_characters/`. It appears automatically — character files are read fresh on every request, no server restart needed.

### API

| Route | Method | Purpose |
|---|---|---|
| `/api/kindle/characters` | GET | List enabled characters (id, name, class, level, hp) |
| `/api/kindle/character?char=<id>` | GET | Full character data |
| `/api/kindle/hp?char=<id>` | POST | Body `{"delta": n}` — adjust HP, clamped to `[0, max]` |
| `/api/kindle/ability/<id>/<use\|reset>?char=<id>` | POST | Decrement or reset an ability's uses |
| `/api/kindle/admin/characters` | GET | List **all** characters including disabled ones (used by `/characters`) |
| `/api/kindle/admin/character/<id>/toggle` | POST | Flip a character's `enabled` flag |

### Standalone Kindle Deployment

The original standalone project (`~/Projects/kindle-sheet`, outside this repo) still exists and works independently on port 8000 — useful for a laptop-hotspot-only setup with no other ScreenSage dependencies. See its own `SETUP.md` for the Kindle jailbreak and hotspot walkthrough. The version integrated here runs on ScreenSage's normal port (8080) alongside every other tab, with its own copy of the character data under `storage/kindle_characters/`.

### KOReader Plugin

For Kindles running **KOReader** instead of the stock browser, `koreader-plugin/charactersheet.koplugin/` is a native alternative to the `/kindle` browser page — same data, rendered as native KOReader menus/dialogs instead of an HTML page. See [KOReader Plugin for Kindle](KOREADER_KINDLE_PLUGIN.md) for how it's built, jailbreak/KOReader setup links, and install steps.

## Usage Examples

### Creating a Responsive Layout

```json
{
  "screen": {
    "width": 1920,
    "height": 1080
  },
  "elements": [
    {
      "type": "text",
      "x": "50%",
      "y": "5%",
      "size": "4%",
      "text": "Campaign Title",
      "color": "#FFFFFF"
    },
    {
      "type": "image",
      "x": "10%",
      "y": "10%",
      "width": "80%",
      "height": "80%",
      "src": "background.jpg"
    },
    {
      "type": "token",
      "x": "50%",
      "y": "50%",
      "size": "5%",
      "label": "Player 1"
    }
  ]
}
```

This layout works on any screen resolution!

### Setting Up Fog of War

```json
{
  "fog": {
    "enabled": true,
    "opacity": 0.8,
    "color": "#0a0a0a",
    "clearMode": true,
    "clearRadius": 50,
    "clear_polygons": []
  },
  "walls": [
    { "id": "wall_1", "x1": 0.1, "y1": 0.1, "x2": 0.3, "y2": 0.1, "color": "#c0392b" },
    { "id": "wall_2", "x1": 0.3, "y1": 0.1, "x2": 0.3, "y2": 0.4, "color": "#c0392b" }
  ]
}
```

Players can click to clear fog, and walls (drawn on the [Walls page](#walls--doors)) block visibility from reaching the other side.

### Using Percentage Sliders

1. Open VTT or Display tab
2. Load a configuration
3. Select an element
4. Find position/size sliders
5. Click the toggle button (px/%)
6. Adjust value in chosen mode
7. Values convert automatically when switching

## Troubleshooting

### Percentage Coordinates Not Working

**Check:**
- Server is running latest build
- Browser cache cleared (Ctrl+Shift+R)
- Console shows no errors
- JSON format is correct

### Fog Not Clearing at Zoom

**Solution:**
- Rebuild server: `cargo build --release`
- Restart server
- Zoom transformation implemented in event_handler.py

### Display Buttons Not Working

**Solution:**
- Restart server after template changes
- Check console for button registration messages
- Verify button IDs match JavaScript expectations

### Preview Scale Not Persisting

**Check:**
- localStorage is enabled in browser
- No private/incognito mode
- Browser developer tools → Application → Local Storage

## Related Documentation

- [Overview](index.md) - Project overview
- [Installation Guide](INSTALLATION.md) - Setup instructions
- [TODO / Roadmap](TODO.md) - Development plans
- VTT Documentation - Detailed coordinate guide
- Fog Template System - Fog configuration guide

## Feature Requests

Have ideas for new features? See [TODO.md](TODO.md) or open an issue on GitHub!

---
