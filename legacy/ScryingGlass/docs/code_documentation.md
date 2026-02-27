# Display Engine Architecture Documentation

Technical documentation for developers working on or extending the Display Engine.

## Overview

The Display Engine is a multi-threaded pygame application with modular architecture, real-time file watching, and efficient media management.

## Core Architecture

```
display_engine.py (Main)
├── DisplayManager     # Multi-monitor & window setup
├── BackgroundManager  # Video/image backgrounds
├── ElementRenderer    # Main rendering coordinator
├── BasicElementRenderer
├── GifPlayer(s)
├── VideoPlayer(s)
└── SVGRenderer
├── FogManager        # Interactive fog overlay
├── EventHandler      # Input processing
├── UIManager         # Debug overlays
└── ConfigWatcher     # File monitoring
```

## Threading Model

```
Main Thread:           60 FPS render loop
├── FileWatcher:       inotify/polling config changes
├── BackgroundVideo:   Video frame reading
├── ElementVideos:     Per-video playback threads
└── GIF Timers:        Frame timing per GIF
```

## Module Breakdown

### `display_engine.py` - Main Application

**Key Classes:**
- `SDLDisplayEngine` - Main application coordinator

**Responsibilities:**
- Initialization and cleanup
- Main render loop (60 FPS)
- Thread-safe config management
- Component coordination

**Key Methods:**
```python
def load_config(self, config_path)    # JSON loading with validation
def reload_config(self)               # Hot reload from file watcher
def init_display(self)                # Initialize all managers
def run(self)                         # Main game loop
```

### `display_manager.py` - Display Setup

**Key Classes:**
- `DisplayManager` - Multi-monitor and window management

**Responsibilities:**
- Monitor detection and selection
- Window positioning across displays
- Fullscreen/windowed mode switching
- Linux window management (wmctrl/xdotool)

**Multi-Monitor Logic:**
```python
# Method 1: xrandr for precise positioning
def _get_monitor_position_xrandr(self, target_monitor)

# Method 2: Cumulative width calculation
x_offset = sum(desktop_sizes[i][0] for i in range(target_monitor))
```

### `element_renderer.py` - Main Renderer

**Key Classes:**
- `MediaElementRenderer` - Main rendering coordinator

**Responsibilities:**
- Element type routing
- Media player lifecycle management
- Rotation and transformation handling
- Resource cleanup

**Rendering Pipeline:**
```python
def draw_elements(self, config):
    self.cleanup_unused_elements(config)  # Remove old players
    for element in config['elements']:
        # Route to appropriate renderer based on type
        if element_type == 'gif': self.draw_gif(element)
        elif element_type == 'video': self.draw_video(element)
        # etc.
```

### `basic_elements.py` - Geometric Rendering

**Key Classes:**
- `BasicElementRenderer` - Tokens, areas, lines, cones

**Rotation System:**
```python
def _rotate_surface_transparent(self, surface, angle):
    # Ensures alpha channel for transparency
    if not surface.get_flags() & pygame.SRCALPHA:
        surface = surface.convert_alpha()
    return pygame.transform.rotate(surface, angle)
```

**Element Types:**
- **Token**: Circular with center rotation
- **Area**: Rectangular with center-based rotation
- **Line**: Vector with arrow support
- **Cone**: Sector/fan shape with directional rotation

### `video_players.py` - Video Handling

**Key Classes:**
- `VideoPlayer` - Background videos (full-screen)
- `VideoElementPlayer` - Positioned video elements

**Threading Pattern:**
```python
def _play_loop(self):
    while self.playing:
        current_time = time.time()
        if current_time - self.last_frame_time >= self.frame_duration:
            ret, frame = self.cap.read()
            if not ret:
                self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)  # Loop
            # Process and store frame
```

**Frame Conversion:**
```python
# OpenCV BGR → RGB → pygame surface
frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
frame = np.rot90(frame)
frame = np.flipud(frame)
surface = pygame.surfarray.make_surface(frame)
```

### `gif_player.py` - GIF Animation

**Key Classes:**
- `GifPlayer` - Animated GIF with frame timing

**Frame Loading (PIL):**
```python
with Image.open(self.gif_path) as gif:
    for frame in ImageSequence.Iterator(gif):
        frame = frame.convert('RGBA')
        if self.width and self.height:
            frame = frame.resize((self.width, self.height))
        # Convert to pygame surface
        duration = frame.info.get('duration', 100)  # ms
```

### `config_watcher.py` - File Monitoring

**Key Classes:**
- `ConfigWatcher` - File system event handler

**Multi-Method Detection:**
```python
def check_for_changes(self):
    # Method 1: Content hash comparison
    current_hash = self._get_file_hash()
    if current_hash != self.last_hash:
        self._trigger_reload("content hash")
    
    # Method 2: Modification time (backup)
    current_mtime = self._get_file_mtime()
    if current_mtime != self.last_mtime:
        self._trigger_reload("mtime")
```

### `fog_manager.py` - Interactive Fog

**Key Classes:**
- `FogManager` - Fog overlay with mouse interaction

**Fog Rendering:**
```python
def draw_fog_overlay(self, screen, config):
    fog_surface = pygame.Surface((width, height), pygame.SRCALPHA)
    fog_surface.fill((r, g, b, alpha))
    
    # Clear areas where fog removed
    for clear_x, clear_y, radius in self.fog_cleared_areas:
        pygame.draw.circle(fog_surface, (0, 0, 0, 0), (clear_x, clear_y), radius)
```

### `svg_renderer.py` - Vector Graphics (Optional)

**Key Classes:**
- `SVGRenderer` - SVG rendering with caching

**Caching Strategy:**
```python
def _create_cache_key(self, filepath, width, height, color_overrides, rotation):
    color_str = str(sorted(color_overrides.items()))
    return f"{filepath}_{width}_{height}_{color_str}_{rotation}"
```

**Color Override System:**
```python
def _apply_color_overrides(self, svg_content, color_overrides):
    # Method 1: Direct color replacement
    # Method 2: CSS class replacement  
    # Method 3: ID-based replacement
```

## Data Flow

### Configuration Loading
```
JSON File → validate → parse → thread-safe storage → render loop
```

### Live Reloading
```
File Change → FileWatcher → hash comparison → reload trigger → 
background check → element update → render
```

### Element Rendering
```
Config → element loop → type routing → media player check → 
dimension validation → rotation transform → screen blit
```

## Memory Management

### Caching Systems
- **Images**: `{path_width_height_rotation: surface}`
- **SVGs**: `{path_params_hash: (surface, file_hash, timestamp)}`
- **Fonts**: `{family_size_style: font_object}`

### Resource Cleanup
```python
def cleanup_unused_elements(self, config):
    current_ids = {e['id'] for e in config['elements'] if e.get('type') == 'gif'}
    for player_id in list(self.gif_players.keys()):
        if player_id not in current_ids:
            self.gif_players[player_id].stop()
            del self.gif_players[player_id]
```

## Performance Optimizations

### Thread Safety
- Config access protected by `threading.Lock`
- Media frame buffers use separate locks
- Atomic operations for player state

### Efficient Rendering
- Direct blitting for non-rotated elements
- Surface caching for rotated elements
- Lazy loading of media resources

### Frame Rate Management
```python
# 60 FPS target with frame skipping
self.clock.tick(60)

# Video frame timing
if current_time - self.last_frame_time >= self.frame_duration:
    # Process next frame
```

## Extension Points

### Adding New Element Types

1. **Create renderer method:**
```python
def draw_my_element(self, element):
    # Implement drawing logic
    pass
```

2. **Add to main dispatcher:**
```python
elif element_type == 'my_element':
    self.draw_my_element(element)
```

3. **Add validation:**
```python
def validate_my_element(element):
    # Return list of error messages
    return errors
```

### Custom Event Handlers

Create `mouse_interactions.py`:
```python
def handle_click(x, y, config, config_path, config_lock):
    # Custom click logic
    pass
```

### Background Processors

Extend background manager for custom background types:
```python
class CustomBackgroundManager(BackgroundManager):
    def draw_custom_background(self, screen):
        # Custom background logic
        pass
```

## Error Handling

### Graceful Degradation
- Missing files → placeholder graphics
- Invalid configs → validation errors + continue
- Threading issues → safe fallbacks

### Debug Information
- Console logging with timestamps
- Debug overlay (`D` key) with statistics
- Error surfaces for failed media loads

## Platform Differences

### Linux
- Full window management (wmctrl, xdotool)
- xrandr for precise monitor positioning
- inotify file watching

### Windows/macOS
- Basic window management
- Cumulative monitor positioning
- Polling-based file watching fallback

## Testing Considerations

### Performance Testing
```python
# Monitor frame rate drops
if clock.get_fps() < 50:
    print("Performance warning: FPS drop")

# Memory usage tracking
stats = element_renderer.get_statistics()
```

### Configuration Validation
```python
from element_renderer import validate_element_config
errors = validate_element_config(element)
assert len(errors) == 0, f"Validation failed: {errors}"
```