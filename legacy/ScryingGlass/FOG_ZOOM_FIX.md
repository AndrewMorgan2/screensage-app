# Fog Clearing Zoom Coordinate Transformation Fix

## Problem
When the background was zoomed in, fog clearing detection was happening at the wrong location. The mouse clicks were using screen coordinates instead of world coordinates, causing fog to clear at incorrect positions when zoom was active.

## Root Cause
The mouse click coordinates in the event handler were being passed directly to the fog manager without accounting for the zoom transformation. When zoomed in:
- Screen coordinates (where you click on the display) don't match world coordinates (actual map positions)
- The zoom manager has transformation methods but they weren't being used for fog clearing

## Solution
Modified the event handler to transform mouse coordinates from screen space to world space when zoom is active.

### Files Changed

#### 1. ScryingGlass/event_handler.py
**Changes:**
- Added `zoom_manager` parameter to `__init__()` method
- Updated `_handle_mouse_click()` to transform coordinates when zoomed
- Updated `_handle_mouse_motion()` to transform coordinates when dragging
- Uses `zoom_manager.screen_to_world()` method for coordinate transformation
- Only transforms when `zoom_level != 1.0` (i.e., when zoomed)

**Key Code:**
```python
def __init__(self, fog_manager, zoom_manager=None):
    """
    Initialize event handler.

    Args:
        fog_manager (FogManager): Fog manager instance for mouse interactions
        zoom_manager (ZoomManager): Zoom manager for coordinate transformation (optional)
    """
    self.fog_manager = fog_manager
    self.zoom_manager = zoom_manager
    self.running = True
```

```python
def _handle_mouse_click(self, pos, button, config, config_path, config_lock):
    x, y = pos
    if button == 1:  # Left click
        # Transform screen coordinates to world coordinates when zoom is active
        if self.zoom_manager and self.zoom_manager.zoom_level != 1.0:
            world_x, world_y = self.zoom_manager.screen_to_world(x, y)
            print(f"Mouse clicked at screen ({x}, {y}), world ({world_x:.1f}, {world_y:.1f})")
            transformed_pos = (world_x, world_y)
        else:
            print(f"Mouse clicked at ({x}, {y})")
            transformed_pos = pos

        # Handle fog clearing based on JSON config using transformed coordinates
        self.fog_manager.handle_mouse_click(transformed_pos, config)
```

```python
def _handle_mouse_motion(self, event, config):
    # Transform screen coordinates to world coordinates when zoom is active
    if self.zoom_manager and self.zoom_manager.zoom_level != 1.0:
        x, y = event.pos
        world_x, world_y = self.zoom_manager.screen_to_world(x, y)
        transformed_pos = (world_x, world_y)
    else:
        transformed_pos = event.pos

    self.fog_manager.handle_mouse_motion(transformed_pos, config)
```

#### 2. ScryingGlass/display_engine.py
**Changes:**
- Updated EventHandler initialization to pass zoom_manager reference

**Before:**
```python
self.event_handler = EventHandler(self.fog_manager)
```

**After:**
```python
self.event_handler = EventHandler(self.fog_manager, self.zoom_manager)
```

## How It Works

1. **Normal Operation (zoom_level = 1.0):**
   - Mouse coordinates are used directly (no transformation needed)
   - Screen coordinates = World coordinates

2. **Zoomed Operation (zoom_level != 1.0):**
   - Mouse clicks provide screen coordinates (where you clicked on the display)
   - `zoom_manager.screen_to_world()` transforms to world coordinates (actual map position)
   - Fog clearing happens at the correct world position

3. **Coordinate Transformation:**
   - The `ZoomManager.screen_to_world()` method (line 276 of zoom_manager.py) accounts for:
     - Current zoom level
     - Pan offset (x, y)
     - Viewport dimensions
   - Formula applies inverse zoom transformation: `world = (screen - pan) / zoom`

## Testing
To test the fix:
1. Load a map with fog enabled
2. Zoom in on a portion of the map
3. Click to clear fog
4. Fog should clear at the exact position you clicked, not offset

## Debug Output
When zoomed and clicking, you'll see console output like:
```
Mouse clicked at screen (500, 300), world (1250.5, 750.2)
```

This shows both the screen coordinates (where you clicked) and the transformed world coordinates (where fog is actually cleared).

## Related Files
- [event_handler.py](event_handler.py) - Event handling and coordinate transformation
- [zoom_manager.py](zoom_manager.py) - Zoom/pan management and coordinate methods
- [display_engine.py](display_engine.py) - Main application initialization
- [fog_manager.py](fog_manager.py) - Fog rendering and clearing (receives transformed coordinates)

## Notes
- The zoom_manager parameter is optional (defaults to None) for backward compatibility
- Coordinate transformation only happens when zoom is active (zoom_level != 1.0)
- Both mouse clicks and mouse motion (dragging) are transformed
- The fog_manager doesn't need any changes - it just receives correct world coordinates
