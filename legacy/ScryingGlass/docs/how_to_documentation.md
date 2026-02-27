# Display Engine Documentation

A high-performance display system for interactive visual presentations, perfect for tabletop gaming, digital signage, and projection mapping.

## Quick Start

### Installation
python-env should have these already installed!

```bash
pip install pygame opencv-python numpy pillow watchdog
```

### Basic Usage
```bash
../python-env/bin/python display_engine.py config.json
```

## Configuration

### Basic Config Structure
```json
{
  "screen": {
    "monitor": 0,
    "fullscreen": false
  },
  "background": {
    "src": "/path/to/background.mp4"
  },
  "fog": {
    "enabled": true,
    "opacity": 0.4,
    "color": "#000000",
    "clearMode": true,
    "clearRadius": 40
  },
  "elements": [...]
}
```

### Zoom config
```json
  "zoom": {
    "autoCenter": false,
    "centerX": 960,
    "centerY": 540,
    "interpolationSpeed": 0.15,
    "level": 1,
    "maxZoom": 5,
    "minZoom": 0.25,
    "panSpeed": 20,
    "panX": 0,
    "panY": 0,
    "showInfo": true,
    "smoothZoom": true,
    "zoomSpeed": 0.1,
    "zoomToMouse": true
  },
```
### To clear the fog
```json
{
  "screen": {
    "monitor": 0,
    "fullscreen": false
  },
  "background": {
    "src": "/path/to/background.mp4"
  },
  "fog": {
    "clear": true,
    "enabled": true,
    "opacity": 0.4,
    "color": "#000000",
    "clearMode": true,
    "clearRadius": 40
  },
  "elements": [...]
}

## Element Types

### Texture
Tile Modes
"stretch" (Default)
Scales the texture to exactly fit the element dimensions.
```json
"texture": {
  "src": "/textures/carpet.png",
  "tileMode": "stretch"
}
```

Best for: Single images, carpets, signs, decorative elements
"tile"
Repeats the texture in a grid pattern to fill the area.
```json
"texture": {
  "src": "/textures/stone_wall.png",
  "tileMode": "tile"
}
```
Best for: Seamless patterns, walls, floors, terrain
"fit"
Scales the texture while maintaining aspect ratio, centered in the area.
```json
"texture": {
  "src": "/textures/emblem.png",
  "tileMode": "fit"
}
```

Also supports opacity:
```json
"texture": {
  "src": "/textures/emblem.png",
  "tileMode": "fit",
  "opacity": 0.8
}
```

Best for: Logos, emblems, maintaining proportions

### Token (Circular markers)
```json
{
  "type": "token",
  "id": "player1",
  "x": 100, "y": 100,
  "size": 50,
  "color": "#3498db",
  "rotation": 45,
  "label": "Player"
}
```

### Area (Rectangular zones)
```json
{
  "type": "area",
  "id": "room1",
  "x": 100, "y": 100,
  "width": 200, "height": 150,
  "color": "rgba(255, 0, 0, 0.3)",
  "rotation": 30
}
```

### Line (Connections)
```json
{
  "type": "line",
  "id": "path1",
  "x": 100, "y": 100,
  "endX": 300, "endY": 200,
  "thickness": 5,
  "color": "#000000",
  "arrow": true
}
```

### Cone (Directional areas)
```json
{
  "type": "cone",
  "id": "spell1",
  "x": 200, "y": 200,
  "radius": 100,
  "angle": 60,
  "direction": 45,
  "color": "rgba(255, 165, 0, 0.5)"
}
```

### GIF Animation
```json
{
  "type": "gif",
  "id": "animation1",
  "src": "/path/to/animation.gif",
  "x": 100, "y": 100,
  "width": 150, "height": 100
}
```

### Video Element
```json
{
  "type": "video",
  "id": "video1",
  "src": "/path/to/video.mp4",
  "x": 100, "y": 100,
  "width": 320, "height": 240
}
```

### Text
```json
{
  "type": "text",
  "id": "label1",
  "text": "Hello World",
  "x": 100, "y": 100,
  "font": "Arial",
  "size": 24,
  "color": "#ffffff",
  "alignment": "center",
  "backgroundColor": "rgba(0, 0, 0, 0.7)"
}
```

### Image
```json
{
  "type": "image",
  "id": "img1",
  "src": "/path/to/image.png",
  "x": 100, "y": 100,
  "width": 200,
  "rotation": 45
}
```

## Controls

| Key | Action |
|-----|--------|
| `ESC/Q` | Quit |
| `F11` | Toggle fullscreen |
| `R` | Reload config |
| `H` | Show help |
| `D` | Toggle debug |
| `C` | Clear fog |

**Mouse:** Click/drag to clear fog

## Features

- **Live Reloading** - Edit JSON and see changes instantly
- **Multi-monitor** - Target specific displays
- **Rotation Support** - All elements can be rotated
- **Interactive Fog** - Mouse-clearable fog overlay
- **Video Backgrounds** - MP4, AVI, MOV, MKV, WebM
- **60 FPS** - Smooth performance

## Common Properties

All elements support:
- `x`, `y` - Position coordinates
- `rotation` - Rotation in degrees (-360 to 360)
- `invisible` - Hide/show toggle
- `label` - Optional text label

## Multi-Monitor Setup

```json
{
  "screen": {
    "monitor": 1,  // 0 = primary, 1 = secondary, etc.
    "fullscreen": false
  }
}
```

## Example: Gaming Setup

```json
{
  "screen": {"monitor": 1, "fullscreen": false},
  "background": {"src": "dungeon_map.jpg"},
  "fog": {"enabled": true, "opacity": 0.9},
  "elements": [
    {
      "type": "token", "id": "player",
      "x": 400, "y": 300, "size": 40,
      "color": "#3498db", "label": "Hero"
    },
    {
      "type": "cone", "id": "spell",
      "x": 450, "y": 300, "radius": 100,
      "angle": 45, "direction": 90,
      "color": "rgba(255, 0, 0, 0.4)"
    }
  ]
}
```