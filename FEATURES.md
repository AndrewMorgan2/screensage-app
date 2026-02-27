# Screen Sage Features Guide

Comprehensive guide to all Screen Sage features, with implementation details and usage examples.

## Table of Contents
- [VTT Coordinate Systems](#vtt-coordinate-systems)
- [Fog of War System](#fog-of-war-system)
- [Display Controls](#display-controls)
- [Preview System](#preview-system)
- [Recent Implementations](#recent-implementations)

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

**Full Documentation:** [PERCENTAGE_COORDINATES_IMPLEMENTATION.md](PERCENTAGE_COORDINATES_IMPLEMENTATION.md)

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
- Fixed in [display_engine.py:274](ScryingGlass/display_engine.py#L274)

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

**Full Documentation:** [FOG_TEMPLATE_SYSTEM.md](FOG_TEMPLATE_SYSTEM.md)

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

The VTT preview includes a zoom control for the preview area:

- **Slider**: Adjust from 10% to 200%
- **Display**: Shows current percentage
- **Reset Button**: Return to 100%

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

## Recent Implementations

### 2024 Q4 Features

#### JavaScript Module Refactoring ✅
- Consolidated VTT modules
- Reduced code by 318 lines (70% reduction)
- Improved maintainability
- Added comprehensive documentation

**Files:**
- `static/js/vtt/vtt-main.js`
- `static/js/vtt/display-main.js`
- `static/js/vtt/vtt-initializer.js`
- `static/js/vtt/vtt-controls-module.js`
- `static/js/vtt/vtt-preview-module.js`
- `static/js/vtt/vtt-draggable-module.js`

#### Percentage Coordinate System ✅
- Support for three coordinate formats
- All element types updated
- Preview rendering enhanced
- Python backend compatible

**Implementation:** [PERCENTAGE_COORDINATES_IMPLEMENTATION.md](PERCENTAGE_COORDINATES_IMPLEMENTATION.md)

#### Percentage Slider Toggles ✅
- Toggle between px and % modes
- Automatic value conversion
- Visual feedback (blue/green)
- Per-property memory

**Location:** [vtt-controls-module.js:411-584](static/js/vtt/vtt-controls-module.js#L411-L584)

#### Fog System Improvements ✅
- Template loading system
- Add/Remove buttons
- Clear property fix
- Zoom coordinate transformation

**Files Modified:**
- `static/js/vtt/vtt-initializer.js` (fog buttons)
- `ScryingGlass/display_engine.py` (clear flag check)
- `ScryingGlass/event_handler.py` (zoom transformation)

#### Display Tab Fixes ✅
- Fixed button IDs mismatch
- Added debug logging
- Template integration
- Fog controls

**Fix:** [DISPLAY_BUTTONS_FIX.md](DISPLAY_BUTTONS_FIX.md)

#### Preview Scale Persistence ✅
- localStorage integration
- Per-tab independence
- Auto-restoration
- UI synchronization

**Implementation:**
- [vtt-preview-module.js:51-55](static/js/vtt/vtt-preview-module.js#L51-L55) - Load from storage
- [vtt-preview-module.js:67-68](static/js/vtt/vtt-preview-module.js#L67-L68) - Save to storage
- [vtt-initializer.js:144-152](static/js/vtt/vtt-initializer.js#L144-L152) - Restore on load

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

- [Main README](README.md) - Project overview
- [Installation Guide](INSTALLATION.md) - Setup instructions
- [TODO / Roadmap](TODO.md) - Development plans
- [VTT Documentation](static/js/vtt/PERCENTAGE_COORDINATES.md) - Detailed coordinate guide
- [Fog Template System](FOG_TEMPLATE_SYSTEM.md) - Fog configuration guide

## Feature Requests

Have ideas for new features? See [TODO.md](TODO.md) or open an issue on GitHub!

---

*Last updated: 2024-10-13*
