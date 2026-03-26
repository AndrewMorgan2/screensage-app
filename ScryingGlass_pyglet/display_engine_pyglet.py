#!/usr/bin/env python3
"""
Pyglet Display Engine - Hardware-Accelerated Alternative to Pygame

This is a complete reimplementation of the display engine using Pyglet for
native OpenGL rendering and transparent video support.

Key advantages over pygame:
- Hardware-accelerated OpenGL rendering by default
- Native video support with transparency (via pyglet.media)
- Better performance for alpha blending
- No CPU/GPU transfer overhead

Usage:
    python display_engine_pyglet.py config.json
"""

import sys
import json
import os
import time
import gc
import threading
import traceback as tb
from typing import Optional

import pyglet
from pyglet import gl
from pyglet.window import Window
from pyglet.media import Player, load as media_load

# Local imports
from debug_stats import debug_stats, logger, log_dir, log_file
from monitor_utils import (
    get_monitor_dimensions,
    get_hyprland_workspace_for_monitor,
    switch_hyprland_workspace,
    get_current_hyprland_workspace
)
from config_handler import start_file_watcher, stop_file_watcher
from element_loaders import ElementLoaderMixin
from parsing_utils import parse_color, get_optimal_video_path
from fog_manager_pyglet import FogManagerPyglet, MAX_FOG_CLEARED_AREAS


class PygletDisplayEngine(ElementLoaderMixin):
    """
    Main Pyglet-based display engine with hardware acceleration.
    """

    def __init__(self, config_path: str, monitor_override: Optional[int] = None):
        """
        Initialize the Pyglet display engine.

        Args:
            config_path: Path to JSON configuration file
            monitor_override: Override monitor number from config
        """
        logger.info("=" * 60)
        logger.info("INITIALIZING SCREENSAGE DISPLAY ENGINE")
        logger.info("=" * 60)
        logger.info(f"Config path: {config_path}")
        logger.info(f"Monitor override: {monitor_override}")

        self.config_path = config_path
        self.monitor_override = monitor_override
        self.config = None
        self.window = None
        self.batch = pyglet.graphics.Batch()

        # Element storage
        self.elements = {}  # id -> element data
        self.sprites = {}   # id -> sprite/drawable
        self.video_players = {}  # id -> (player, source)
        self.shapes = {}    # id -> shape objects
        self.animations = {}  # id -> animated sprites

        # Background
        self.background_video = None
        self.background_image = None
        self.background_color = None

        # Fog manager (will be initialized after window creation)
        self.fog_manager = None

        # Zoom and pan state (controlled via config file)
        self.zoom_level = 1.0
        self.pan_x = 0.0
        self.pan_y = 0.0
        self.min_zoom = 0.1
        self.max_zoom = 10.0

        # File watcher
        self.file_observer = None
        self.needs_reload = False

        # Resolution scaling
        self.reference_width = 1920
        self.reference_height = 1080
        self.scale_x = 1.0
        self.scale_y = 1.0

        # State
        self.running = True

        # Thread safety
        self._reload_lock = threading.RLock()
        self._is_reloading = False

        # Debug mode flag
        self.debug_mode = True

        # GC tracking
        self._last_gc_time = time.time()
        self._gc_interval = 60.0

        # Cached projection matrices — recalculated only when zoom/pan changes
        self._view_matrix = None
        self._default_matrix = None
        self._cached_zoom = None
        self._cached_pan = (None, None)
        self._cached_window_size = (None, None)

        logger.info("Thread safety initialized")

        # Load configuration
        self.load_config()

        # Create window
        self.create_window()

        # Set up OpenGL
        self.setup_opengl()

        # Initialize background
        self.init_background()

        # Load elements
        self.load_elements()

        # Start file watcher for live reload
        self.file_observer = start_file_watcher(self, self.config_path)

        logger.info("Display engine initialization complete")

    def load_config(self):
        """Load configuration from JSON file."""
        try:
            with open(self.config_path, 'r') as f:
                self.config = json.load(f)
            print(f"✓ Config loaded: {self.config_path}")

            # Load zoom settings from config
            zoom_config = self.config.get('zoom', {})
            self.zoom_level = zoom_config.get('level', 1.0)
            self.min_zoom = zoom_config.get('minZoom', 0.1)
            self.max_zoom = zoom_config.get('maxZoom', 10.0)

            # Load pan settings
            self.initial_pan_x = zoom_config.get('panX', 0)
            self.initial_pan_y = zoom_config.get('panY', 0)

        except Exception as e:
            print(f"Error loading config: {e}")
            sys.exit(1)

    def create_window(self):
        """Create the Pyglet window."""
        screen_config = self.config.get('screen', {})
        fullscreen = screen_config.get('fullscreen', True)
        monitor_idx = screen_config.get('monitor', 0)

        # Override monitor if specified on command line
        if self.monitor_override is not None:
            monitor_idx = self.monitor_override
            print(f"🎯 Monitor override: Using monitor {monitor_idx} (from command line)")

        # Get display for multi-monitor support
        screen = None
        width = screen_config.get('width', 1920)
        height = screen_config.get('height', 1080)

        # Set environment hints for multi-monitor
        if monitor_idx > 0:
            os.environ['SDL_VIDEO_FULLSCREEN_HEAD'] = str(monitor_idx)
            os.environ['SDL_VIDEO_FULLSCREEN_DISPLAY'] = str(monitor_idx)
            print(f"  Trying X11 display hint (monitor {monitor_idx})")

        # Get accurate dimensions from system tools
        system_dimensions = None
        if fullscreen:
            system_dimensions = get_monitor_dimensions(monitor_idx)
            if system_dimensions:
                width, height = system_dimensions[0], system_dimensions[1]
                print(f"Using system-detected dimensions for monitor {monitor_idx}: {width}x{height}")

        try:
            # Get screens using pyglet.display
            display = pyglet.display.get_display()
            screens = display.get_screens()

            if screens and len(screens) > 0:
                print(f"Found {len(screens)} pyglet display(s)")
                for i, s in enumerate(screens):
                    print(f"  Pyglet Display {i}: {s.width}x{s.height} at ({s.x}, {s.y})")

                if monitor_idx < len(screens):
                    screen = screens[monitor_idx]
                    if fullscreen and system_dimensions is None:
                        width = screen.width
                        height = screen.height
                        print(f"Using pyglet dimensions for monitor {monitor_idx}: {width}x{height}")
                else:
                    screen = screens[0]
                    if fullscreen and system_dimensions is None:
                        width = screen.width
                        height = screen.height
                    print(f"Monitor {monitor_idx} not found in pyglet, using primary")
            else:
                print("Could not enumerate pyglet screens, using detected/config dimensions")
        except Exception as e:
            print(f"Could not get pyglet screen info: {e}")
            import traceback
            traceback.print_exc()
            print(f"Using detected/config dimensions: {width}x{height}")

        # Update config file with detected screen dimensions
        if fullscreen and (screen_config.get('width') != width or screen_config.get('height') != height):
            print(f"  Updating config file with detected screen dimensions: {width}x{height}")
            self.config['screen']['width'] = width
            self.config['screen']['height'] = height
            try:
                with open(self.config_path, 'w') as f:
                    json.dump(self.config, f, indent=2)
                print(f"  ✓ Config file updated with screen dimensions")

                # Trigger refresh notification for web UI
                target = "display" if "display.json" in self.config_path else "vtt"
                try:
                    import requests
                    requests.post('http://localhost:8080/api/refresh/trigger',
                                json={"target": target, "source": "pyglet_startup"},
                                timeout=1)
                    print(f"  ✓ Refresh notification sent to {target} UI")
                except Exception as refresh_error:
                    print(f"  ⚠️ Could not send refresh notification: {refresh_error}")

            except Exception as e:
                print(f"  ⚠️ Warning: Could not update config file: {e}")

        # Hyprland workspace switching for multi-monitor fullscreen
        current_workspace = None
        if fullscreen:
            target_workspace = get_hyprland_workspace_for_monitor(monitor_idx)
            if target_workspace is not None:
                current_workspace = get_current_hyprland_workspace()

                print(f"  Switching to workspace {target_workspace} (monitor {monitor_idx})")
                if switch_hyprland_workspace(target_workspace):
                    time.sleep(0.2)

        # Create window
        if fullscreen and screen is not None:
            print(f"  Creating window on screen {monitor_idx} (windowed-first approach)")

            config = gl.Config(
                double_buffer=True,
                depth_size=0,       # Not needed for 2D rendering
                stencil_size=8,     # Needed for fog of war
                sample_buffers=0,   # No MSAA — pure overhead for video/sprite rendering
                samples=0,
            )

            self.window = Window(
                width=width,
                height=height,
                config=config,
                vsync=False,
                caption="ScreenSage Display Engine",
                resizable=False,
                screen=screen
            )

            self.window.set_location(screen.x + 100, screen.y + 100)
            print(f"  Window created at ({screen.x + 100}, {screen.y + 100})")

            time.sleep(0.1)

            self.window.set_fullscreen(True, screen=screen)
            print(f"  ✓ Set fullscreen on screen {monitor_idx}")
        else:
            config = gl.Config(
                double_buffer=True,
                depth_size=0,       # Not needed for 2D rendering
                stencil_size=8,     # Needed for fog of war
                sample_buffers=0,   # No MSAA — pure overhead for video/sprite rendering
                samples=0,
            )

            window_kwargs = {
                'width': width,
                'height': height,
                'config': config,
                'caption': "ScreenSage - Pyglet Display Engine",
                'vsync': True,
                'resizable': False
            }

            if fullscreen:
                window_kwargs['fullscreen'] = True
                print(f"  Creating fullscreen window on default screen")
            elif screen is not None:
                window_kwargs['screen'] = screen
                print(f"  Creating windowed mode on screen {monitor_idx}")

            self.window = Window(**window_kwargs)

        # Move windowed mode windows to correct screen position
        if not fullscreen and screen is not None:
            self.window.set_location(screen.x, screen.y)
            try:
                self.window.activate()
            except:
                pass

        print(f"✓ Window created: {width}x{height} (fullscreen={fullscreen})")

        # Calculate resolution scaling factors
        self.reference_width = screen_config.get('width', 1920)
        self.reference_height = screen_config.get('height', 1080)
        self.scale_x = self.window.width / self.reference_width
        self.scale_y = self.window.height / self.reference_height

        if self.scale_x != 1.0 or self.scale_y != 1.0:
            print(f"  Resolution scaling: {self.reference_width}x{self.reference_height} → {self.window.width}x{self.window.height}")
            print(f"  Scale factors: x={self.scale_x:.3f}, y={self.scale_y:.3f}")

        # Restore original workspace if we switched for Hyprland
        if current_workspace is not None:
            time.sleep(1.0)
            print(f"  Restoring workspace {current_workspace}")
            switch_hyprland_workspace(current_workspace)

        # Apply initial pan values from config
        if hasattr(self, 'initial_pan_x') and hasattr(self, 'initial_pan_y'):
            if isinstance(self.initial_pan_x, str) and self.initial_pan_x.endswith('%'):
                percent = float(self.initial_pan_x.rstrip('%'))
                self.pan_x = self.window.width * percent / 100.0
            else:
                self.pan_x = float(self.initial_pan_x) if self.initial_pan_x else 0.0

            if isinstance(self.initial_pan_y, str) and self.initial_pan_y.endswith('%'):
                percent = float(self.initial_pan_y.rstrip('%'))
                self.pan_y = self.window.height * percent / 100.0
            else:
                self.pan_y = float(self.initial_pan_y) if self.initial_pan_y else 0.0

            if self.pan_x != 0 or self.pan_y != 0:
                print(f"  Initial pan: ({self.pan_x:.0f}, {self.pan_y:.0f})")

        # Initialize fog manager
        self.fog_manager = FogManagerPyglet(width, height)

        # Register event handlers
        self.window.on_draw = self.on_draw
        self.window.on_close = self.on_close
        self.window.on_key_press = self.on_key_press
        self.window.on_mouse_press = self.on_mouse_press
        self.window.on_mouse_drag = self.on_mouse_drag
        self.window.on_mouse_release = self.on_mouse_release

    def setup_opengl(self):
        """Set up OpenGL state for proper alpha blending."""
        gl.glEnable(gl.GL_BLEND)
        gl.glBlendFunc(gl.GL_SRC_ALPHA, gl.GL_ONE_MINUS_SRC_ALPHA)
        gl.glDisable(gl.GL_DEPTH_TEST)   # Not needed for 2D rendering
        gl.glDisable(gl.GL_MULTISAMPLE)  # Disabled in GL config too, but be explicit
        gl.glEnable(gl.GL_LINE_SMOOTH)
        gl.glHint(gl.GL_LINE_SMOOTH_HINT, gl.GL_NICEST)

        print("✓ OpenGL initialized with alpha blending")
        print(f"  OpenGL version: {gl.gl_info.get_version()}")
        print(f"  Renderer: {gl.gl_info.get_renderer()}")

    def init_background(self):
        """Initialize background (auto-detect type from file extension or use as color)."""
        bg_config = self.config.get('background', {})

        if isinstance(bg_config, str):
            background = bg_config
        elif isinstance(bg_config, dict):
            background = bg_config.get('src') or bg_config.get('color', '#000000')
        else:
            background = '#000000'

        if os.path.exists(background):
            ext = os.path.splitext(background)[1].lower()

            # Image extensions
            if ext in ['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp']:
                try:
                    print(f"Loading background image: {background}")
                    image = pyglet.image.load(background)
                    orig_width = image.width
                    orig_height = image.height
                    print(f"  Original: {orig_width}x{orig_height}")

                    # Check if portrait and rotate to landscape
                    if orig_height > orig_width:
                        print(f"  📱➡️🖥️  Portrait detected - rotating to landscape")
                        flip = bg_config.get('flip', 1) if isinstance(bg_config, dict) else 1
                        rotation_degrees = 90 if flip == 1 else 270

                        texture = image.get_texture()
                        image = texture.get_transform(rotate=rotation_degrees)
                        print(f"  After rotation ({rotation_degrees}°): {image.width}x{image.height}")

                        image.anchor_x = 0
                        image.anchor_y = 0

                    # Calculate scale to fit window while preserving aspect ratio
                    scale_x = self.window.width / image.width
                    scale_y = self.window.height / image.height
                    scale = min(scale_x, scale_y)

                    # Calculate centered position
                    scaled_width = image.width * scale
                    scaled_height = image.height * scale
                    x_offset = (self.window.width - scaled_width) / 2
                    y_offset = (self.window.height - scaled_height) / 2

                    sprite = pyglet.sprite.Sprite(image, x=x_offset, y=y_offset)
                    sprite.scale = scale

                    print(f"  Scale: {scale:.3f} (preserving aspect ratio)")
                    print(f"  Scaled size: {scaled_width:.0f}x{scaled_height:.0f}")
                    print(f"  Centered at: ({x_offset:.0f}, {y_offset:.0f})")

                    self.background_image = sprite
                    print(f"✓ Loaded background image successfully")

                except Exception as e:
                    print(f"Error loading background image: {e}")
                    import traceback
                    traceback.print_exc()

            # Video extensions
            elif ext in ['.webm', '.mp4', '.avi', '.mov', '.mkv']:
                try:
                    print(f"Loading background video: {background}")
                    source = media_load(background)
                    actual_path = background

                    # Check if a display-resolution version exists for oversized videos
                    if source.video_format:
                        video_width = source.video_format.width
                        video_height = source.video_format.height
                        print(f"  Original: {video_width}x{video_height}")

                        optimal_path = get_optimal_video_path(
                            background, self.window.width, self.window.height,
                            video_width, video_height
                        )
                        if optimal_path != background:
                            source = media_load(optimal_path)
                            actual_path = optimal_path

                    # Determine rotation from the final source
                    needs_rotation = False
                    rotation_degrees = None
                    if source.video_format:
                        w = source.video_format.width
                        h = source.video_format.height
                        if h > w:
                            print(f"  📱➡️🖥️  Portrait detected - will rotate to landscape")
                            needs_rotation = True
                            flip = bg_config.get('flip', 1) if isinstance(bg_config, dict) else 1
                            rotation_degrees = 90 if flip == 1 else 270
                            print(f"  Will rotate {rotation_degrees}° (flip={flip})")
                        else:
                            print(f"  🖥️  Landscape video")

                    player = Player()
                    player.loop = True
                    player.queue(source)
                    player.play()

                    self.background_video = {
                        'player': player,
                        'source': source,
                        'needs_rotation': needs_rotation,
                        'rotation_degrees': rotation_degrees,
                    }
                    print(f"✓ Loaded background video: {actual_path}")

                except Exception as e:
                    print(f"Error loading background video: {e}")
                    import traceback
                    traceback.print_exc()
        else:
            self.background_color = background
            print(f"✓ Using background color: {background}")

    def reload_config(self):
        """Reload configuration and elements with thread safety."""
        logger.info("=" * 40)
        logger.info("RELOADING CONFIGURATION")
        logger.info("=" * 40)

        reload_start = time.time()
        debug_stats.reload_count += 1

        with self._reload_lock:
            self._is_reloading = True
            logger.debug("Reload lock acquired")

            try:
                # Track resources before cleanup
                sprites_before = len(self.sprites)
                videos_before = len(self.video_players)
                shapes_before = len(self.shapes)
                animations_before = len(self.animations)

                # Load new config
                self.load_config()

                # Apply updated zoom/pan values
                logger.debug(f"Updated zoom: {self.zoom_level:.2f}x")

                if hasattr(self, 'initial_pan_x') and hasattr(self, 'initial_pan_y'):
                    if isinstance(self.initial_pan_x, str) and self.initial_pan_x.endswith('%'):
                        percent = float(self.initial_pan_x.rstrip('%'))
                        self.pan_x = self.window.width * percent / 100.0
                    else:
                        self.pan_x = float(self.initial_pan_x) if self.initial_pan_x else 0.0

                    if isinstance(self.initial_pan_y, str) and self.initial_pan_y.endswith('%'):
                        percent = float(self.initial_pan_y.rstrip('%'))
                        self.pan_y = self.window.height * percent / 100.0
                    else:
                        self.pan_y = float(self.initial_pan_y) if self.initial_pan_y else 0.0

                    logger.debug(f"Updated pan: ({self.pan_x:.0f}, {self.pan_y:.0f})")

                # Clear existing elements
                logger.debug(f"Cleaning up {sprites_before} sprites...")
                deleted_sprites = 0
                for sprite in self.sprites.values():
                    if hasattr(sprite, 'delete'):
                        try:
                            sprite.delete()
                            deleted_sprites += 1
                            debug_stats.sprites_deleted += 1
                        except Exception as e:
                            logger.warning(f"Error deleting sprite: {e}")
                self.sprites.clear()
                logger.debug(f"Deleted {deleted_sprites} sprites")

                logger.debug(f"Cleaning up {shapes_before} shapes...")
                for shape_data in self.shapes.values():
                    if isinstance(shape_data, dict):
                        for shape in shape_data.values():
                            if hasattr(shape, 'delete'):
                                try:
                                    shape.delete()
                                except Exception as e:
                                    logger.warning(f"Error deleting shape: {e}")
                    elif hasattr(shape_data, 'delete'):
                        try:
                            shape_data.delete()
                        except Exception as e:
                            logger.warning(f"Error deleting shape: {e}")
                self.shapes.clear()

                logger.debug(f"Cleaning up {animations_before} animations...")
                self.animations.clear()

                # Stop existing video players
                logger.debug(f"Cleaning up {videos_before} video players...")
                for video_id, video_data in self.video_players.items():
                    try:
                        video_data['player'].pause()
                        video_data['player'].delete()
                        debug_stats.videos_deleted += 1
                    except Exception as e:
                        logger.warning(f"Error deleting video player {video_id}: {e}")
                self.video_players.clear()

                # Stop background video if exists
                if self.background_video:
                    try:
                        self.background_video['player'].pause()
                        self.background_video['player'].delete()
                        debug_stats.videos_deleted += 1
                    except Exception as e:
                        logger.warning(f"Error deleting background video: {e}")
                    self.background_video = None

                # Clear background image if exists
                if self.background_image:
                    try:
                        self.background_image.delete()
                        debug_stats.sprites_deleted += 1
                    except Exception as e:
                        logger.warning(f"Error deleting background image: {e}")
                    self.background_image = None

                self.background_color = None

                # Reinitialize background
                self.init_background()

                # Reload elements
                self.load_elements()

                reload_duration = time.time() - reload_start
                logger.info(f"Configuration reloaded successfully in {reload_duration*1000:.1f}ms")
                logger.info(f"Resources: {sprites_before}->{len(self.sprites)} sprites, "
                          f"{videos_before}->{len(self.video_players)} videos")

                # Force garbage collection
                gc_start = time.time()
                collected = gc.collect()
                gc_duration = time.time() - gc_start
                logger.debug(f"GC collected {collected} objects in {gc_duration*1000:.1f}ms")

            except Exception as e:
                stack_trace = tb.format_exc()
                debug_stats.record_error("RELOAD_ERROR", str(e), stack_trace)
                logger.error(f"Error reloading configuration: {e}")
                logger.error(stack_trace)
            finally:
                self._is_reloading = False
                logger.debug("Reload lock released")

    def apply_view_transform(self):
        """Apply zoom and pan transformations using window view projection."""
        width, height = self.window.width, self.window.height
        current_window_size = (width, height)

        # Only recalculate if zoom, pan, or window size changed
        if (self._view_matrix is None or
                self.zoom_level != self._cached_zoom or
                (self.pan_x, self.pan_y) != self._cached_pan or
                current_window_size != self._cached_window_size):

            view_width = width / self.zoom_level
            view_height = height / self.zoom_level

            center_x = width / 2 + self.pan_x / self.zoom_level
            center_y = height / 2 + self.pan_y / self.zoom_level

            left = center_x - view_width / 2
            right = center_x + view_width / 2
            bottom = center_y - view_height / 2
            top = center_y + view_height / 2

            self._view_matrix = pyglet.math.Mat4.orthogonal_projection(
                left, right, bottom, top, -1, 1
            )
            self._default_matrix = pyglet.math.Mat4.orthogonal_projection(
                0, width, 0, height, -1, 1
            )
            self._cached_zoom = self.zoom_level
            self._cached_pan = (self.pan_x, self.pan_y)
            self._cached_window_size = current_window_size

        self.window.projection = self._view_matrix

    def reset_view_transform(self):
        """Reset view transformation to default (uses cached matrix)."""
        if self._default_matrix is None:
            width, height = self.window.width, self.window.height
            self._default_matrix = pyglet.math.Mat4.orthogonal_projection(
                0, width, 0, height, -1, 1
            )
        self.window.projection = self._default_matrix

    def on_draw(self):
        """Draw all elements with thread safety and error handling."""
        if self._is_reloading:
            gl.glClearColor(0.0, 0.0, 0.0, 1.0)
            gl.glClear(gl.GL_COLOR_BUFFER_BIT)
            return

        try:
            # Clear color buffer only — no depth (unused in 2D) or stencil (fog handles its own)
            if hasattr(self, 'background_color') and self.background_color is not None:
                r, g, b, a = parse_color(self.background_color)
                gl.glClearColor(r/255.0, g/255.0, b/255.0, a/255.0)
            else:
                gl.glClearColor(0.0, 0.0, 0.0, 1.0)
            gl.glClear(gl.GL_COLOR_BUFFER_BIT)

            # Apply zoom and pan transformations
            self.apply_view_transform()

            # Draw background image if present
            if self.background_image:
                self.background_image.draw()

            # Draw background video if present
            if self.background_video:
                player = self.background_video['player']
                texture = player.texture
                needs_rotation = self.background_video.get('needs_rotation', False)
                rotation_degrees = self.background_video.get('rotation_degrees')

                if texture:
                    last_texture = self.background_video.get('_last_texture')
                    if texture is not last_texture:
                        # New video frame — update sprite
                        self.background_video['_last_texture'] = texture

                        if needs_rotation and rotation_degrees is not None:
                            texture = texture.get_transform(rotate=rotation_degrees)
                            texture.anchor_x = 0
                            texture.anchor_y = 0
                            self.background_video['_display_texture'] = texture
                        else:
                            self.background_video['_display_texture'] = texture

                        display_texture = self.background_video['_display_texture']

                        if 'sprite' not in self.background_video:
                            # Calculate scale once — video and window dimensions don't change
                            scale_x = self.window.width / display_texture.width
                            scale_y = self.window.height / display_texture.height
                            self.background_video['sprite'] = pyglet.sprite.Sprite(display_texture, x=0, y=0)
                            self.background_video['sprite'].scale_x = scale_x
                            self.background_video['sprite'].scale_y = scale_y
                        else:
                            # Only update image — scale never changes for a fixed video
                            self.background_video['sprite'].image = display_texture

                    if 'sprite' in self.background_video:
                        self.background_video['sprite'].draw()

            # Draw batch (images, text, shapes)
            self.batch.draw()

            # Draw videos (must be drawn separately)
            for video_id, video_data in self.video_players.items():
                if video_data.get('invisible', False):
                    continue

                player = video_data['player']
                x = video_data['x']
                y = video_data['y']
                scale_x = video_data['scale_x']
                scale_y = video_data['scale_y']
                opacity = video_data.get('opacity', 255)
                rotation = video_data.get('rotation', 0)

                texture = player.texture

                if texture:
                    if 'sprite' not in video_data:
                        texture.anchor_x = texture.width // 2
                        texture.anchor_y = texture.height // 2

                        scaled_width = texture.width * scale_x
                        scaled_height = texture.height * scale_y

                        video_data['sprite'] = pyglet.sprite.Sprite(
                            texture,
                            x=x + scaled_width / 2,
                            y=y - scaled_height / 2
                        )
                        video_data['sprite'].scale_x = scale_x
                        video_data['sprite'].scale_y = scale_y
                        video_data['sprite'].opacity = opacity
                        video_data['sprite'].rotation = -rotation
                        video_data['_last_texture'] = texture
                    else:
                        # Only update sprite when a new video frame is available
                        if texture is not video_data.get('_last_texture'):
                            video_data['sprite'].image = texture
                            video_data['_last_texture'] = texture
                        # Update dynamic properties only if changed
                        sprite = video_data['sprite']
                        if sprite.opacity != opacity:
                            sprite.opacity = opacity
                        if sprite.rotation != -rotation:
                            sprite.rotation = -rotation

                    video_data['sprite'].draw()

            # Reset view transform for fog
            self.reset_view_transform()

            # Draw fog overlay
            if self.fog_manager:
                self.fog_manager.draw_fog_overlay(self.config)

        except Exception as e:
            stack_trace = tb.format_exc()
            debug_stats.record_error("DRAW_ERROR", str(e), stack_trace)

    def on_close(self):
        """Handle window close event with final debug report."""
        logger.info("=" * 60)
        logger.info("SHUTTING DOWN DISPLAY ENGINE")
        logger.info("=" * 60)

        final_report = debug_stats.generate_report(self)
        logger.info("FINAL DEBUG REPORT:" + final_report)
        print("\nFINAL DEBUG REPORT:")
        print(final_report)

        self.running = False

        logger.debug("Stopping file watcher...")
        stop_file_watcher(self.file_observer)

        logger.debug(f"Cleaning up {len(self.video_players)} video players...")
        for video_id, video_data in self.video_players.items():
            try:
                video_data['player'].pause()
                video_data['player'].delete()
            except Exception as e:
                logger.warning(f"Error cleaning up video {video_id}: {e}")

        if self.background_video:
            try:
                self.background_video['player'].pause()
                self.background_video['player'].delete()
            except Exception as e:
                logger.warning(f"Error cleaning up background video: {e}")

        if self.fog_manager:
            fog_stats = self.fog_manager.get_fog_stats()
            logger.info(f"Fog Manager Final Stats: {fog_stats}")

        gc_start = time.time()
        collected = gc.collect()
        gc_duration = time.time() - gc_start
        logger.info(f"Final GC: collected {collected} objects in {gc_duration*1000:.1f}ms")

        logger.info("Display engine shutdown complete")
        self.window.close()

    def on_key_press(self, symbol, modifiers):
        """Handle keyboard events."""
        if symbol == pyglet.window.key.ESCAPE or symbol == pyglet.window.key.Q:
            self.on_close()
        elif symbol == pyglet.window.key.R:
            self.reload_config()
        elif symbol == pyglet.window.key.F11:
            self.window.set_fullscreen(not self.window.fullscreen)
        elif symbol == pyglet.window.key.D:
            self.debug_mode = not self.debug_mode
            logger.info(f"Debug mode {'ENABLED' if self.debug_mode else 'DISABLED'}")
            if self.debug_mode:
                report = debug_stats.generate_report(self)
                print(report)
        elif symbol == pyglet.window.key.P:
            report = debug_stats.generate_report(self)
            print(report)
            logger.info("Debug report printed (press P)")
        elif symbol == pyglet.window.key.G:
            gc_start = time.time()
            collected = gc.collect()
            gc_duration = time.time() - gc_start
            logger.info(f"Manual GC: collected {collected} objects in {gc_duration*1000:.1f}ms")

    def on_mouse_press(self, x, y, button, modifiers):
        """Handle mouse press events for fog clearing."""
        if button == pyglet.window.mouse.LEFT:
            if self.fog_manager and self.config:
                # Convert screen coordinates to world coordinates if zoomed/panned
                world_x, world_y = self._screen_to_world(x, y)
                logger.debug(f"Mouse press at screen ({x}, {y}) -> world ({world_x:.0f}, {world_y:.0f})")
                self.fog_manager.handle_mouse_click((world_x, world_y), self.config)
                self.fog_manager.start_dragging()

    def on_mouse_drag(self, x, y, dx, dy, buttons, modifiers):
        """Handle mouse drag events for continuous fog clearing."""
        if buttons & pyglet.window.mouse.LEFT:
            if self.fog_manager and self.config:
                world_x, world_y = self._screen_to_world(x, y)
                self.fog_manager.handle_mouse_motion((world_x, world_y), self.config)

    def on_mouse_release(self, x, y, button, modifiers):
        """Handle mouse release events."""
        if button == pyglet.window.mouse.LEFT:
            if self.fog_manager:
                self.fog_manager.stop_dragging()

    def _screen_to_world(self, screen_x, screen_y):
        """Convert screen coordinates to world coordinates accounting for zoom/pan."""
        # Calculate the view transformation inverse
        width, height = self.window.width, self.window.height

        view_width = width / self.zoom_level
        view_height = height / self.zoom_level

        center_x = width / 2
        center_y = height / 2

        scaled_pan_x = self.pan_x / self.zoom_level
        scaled_pan_y = self.pan_y / self.zoom_level
        center_x += scaled_pan_x
        center_y += scaled_pan_y

        left = center_x - view_width / 2
        bottom = center_y - view_height / 2

        # Convert screen coords to world coords
        world_x = left + (screen_x / width) * view_width
        world_y = bottom + (screen_y / height) * view_height

        return world_x, world_y

    def _reset_clear_reset_flag(self):
        """Reset the clearReset flag in the config file after fog has been cleared."""
        try:
            if self.config and 'fog' in self.config:
                self.config['fog']['clearReset'] = False
                with open(self.config_path, 'w') as f:
                    json.dump(self.config, f, indent=2)
                logger.debug("Reset clearReset flag in config file")
        except Exception as e:
            logger.warning(f"Could not reset clearReset flag: {e}")

    def update(self, dt):
        """Update function called every frame."""
        try:
            debug_stats.record_frame(dt)

            if self.needs_reload:
                self.needs_reload = False
                self.reload_config()

            if self.fog_manager:
                clear_result = self.fog_manager.check_and_handle_clear_flag(self.config)
                # If clearReset was triggered, reset it to false in the config file
                if clear_result == 'clearReset':
                    self._reset_clear_reset_flag()

            fog_areas = len(self.fog_manager.fog_cleared_areas) if self.fog_manager else 0
            debug_stats.update_resource_counts(
                sprites=len(self.sprites),
                videos=len(self.video_players),
                shapes=len(self.shapes),
                animations=len(self.animations),
                fog_areas=fog_areas
            )

            current_time = time.time()
            if current_time - self._last_gc_time >= self._gc_interval:
                self._last_gc_time = current_time
                gc_start = time.time()
                collected = gc.collect()
                gc_duration = time.time() - gc_start
                if collected > 0:
                    logger.debug(f"Periodic GC: collected {collected} objects in {gc_duration*1000:.1f}ms")

            if self.debug_mode:
                debug_stats.log_periodic_status(self)

        except Exception as e:
            stack_trace = tb.format_exc()
            debug_stats.record_error("UPDATE_ERROR", str(e), stack_trace)

    def run(self):
        """Start the main event loop."""
        logger.info("=" * 60)
        logger.info("SCREENSAGE DISPLAY ENGINE STARTED")
        logger.info("=" * 60)
        print("\n" + "=" * 60)
        print("SCREENSAGE DISPLAY ENGINE - RUNNING")
        print("=" * 60)
        print("CONTROLS:")
        print("   ESC/Q  - Quit")
        print("   R      - Reload config")
        print("   F11    - Toggle fullscreen")
        print("   D      - Toggle debug mode (periodic reports)")
        print("   P      - Print debug report now")
        print("   G      - Force garbage collection")
        print("")
        print("DEBUG:")
        print(f"   Log file: {log_dir / log_file.name if log_file else 'console only'}")
        print(f"   Report interval: {debug_stats.report_interval}s")
        print(f"   Max fog areas: {MAX_FOG_CLEARED_AREAS}")
        print("=" * 60 + "\n")

        pyglet.clock.schedule_interval(self.update, 1/60.0)

        try:
            pyglet.app.run()
        except Exception as e:
            stack_trace = tb.format_exc()
            debug_stats.record_error("FATAL_ERROR", str(e), stack_trace)
            logger.critical(f"Fatal error in main loop: {e}")
            logger.critical(stack_trace)
            raise


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Pyglet Display Engine - Hardware-Accelerated Alternative"
    )
    parser.add_argument("config", help="Path to config JSON file")
    parser.add_argument(
        "--monitor",
        type=int,
        default=None,
        help="Override monitor/display number from config (0, 1, 2, etc.)"
    )

    args = parser.parse_args()
    config_path = args.config

    if not os.path.exists(config_path):
        print(f"Error: Config file not found: {config_path}")
        sys.exit(1)

    try:
        engine = PygletDisplayEngine(config_path, monitor_override=args.monitor)
        engine.run()
    except KeyboardInterrupt:
        print("\n🛑 Interrupted by user")
    except Exception as e:
        print(f"💥 Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
