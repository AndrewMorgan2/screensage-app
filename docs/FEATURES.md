---
title: "Features Guide"
---

# Screen Sage Features Guide

Comprehensive guide to all Screen Sage features, with implementation details and usage examples.

## Table of Contents
- [VTT Coordinate Systems](#vtt-coordinate-systems)
- [Element Types](#element-types)
- [Fog of War System](#fog-of-war-system)
- [Display Controls](#display-controls)
- [Preview System](#preview-system)
- [Draw Page](#draw-page)
- [SageSlate Player Aid Manager](#sageslate-player-aid-manager)

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

- **Wall Shadows**: Fog respects wall polygons for realistic line-of-sight
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
    {
      "points": [[100, 100], [500, 100], [500, 500], [100, 500]]
    }
  ]
}
```

Players can click to clear fog, and walls block visibility.

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
