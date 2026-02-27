#!/home/amorgan/GitHub/ScreenSage/python-env/bin/python3
"""
Display Engine - Main Application
A high-performance display engine for interactive visual presentations with live JSON reloading.
Perfect for tabletop gaming, digital signage, presentations, and projection mapping.

Features:
- Live JSON configuration reloading
- Multi-monitor support with fullscreen and borderless modes
- Video backgrounds with MP4, AVI, MOV support
- Element types: tokens, areas, lines, cones, GIFs, videos
- Linux window management with always-on-top functionality
- Real-time element resizing and repositioning

Usage:
    python display_engine.py config.json

Requirements:
    pip install pygame opencv-python numpy pillow watchdog
    sudo apt install wmctrl xdotool  # Linux window management (optional)

Author: Display Engine Team
Version: 2.0
"""
import sys
import time
import json
import os
import signal
import atexit
from threading import Lock
import pygame
from watchdog.observers import Observer
from config_watcher import ConfigWatcher
from display_manager import DisplayManager
from background_manager import BackgroundManager
from fog_manager import FogManager
from event_handler import EventHandler
from ui_manager import UIManager
from element_renderer import MediaElementRenderer
from zoom_manager import ZoomManager

# OpenGL support for hardware-accelerated video
try:
    import moderngl
    from gl_video_player import GLVideoRenderer
    MODERNGL_AVAILABLE = True
except ImportError:
    MODERNGL_AVAILABLE = False
    print("ModernGL not available - transparent video acceleration disabled")
    print("Install with: pip install moderngl")

# Global reference for signal handling
_display_engine_instance = None


class SDLDisplayEngine:
    """
    Main display engine class.
    
    Manages the pygame display, configuration loading, file watching,
    background rendering, and element management.
    """
    
    def __init__(self):
        """Initialize the display engine with default values."""
        # Configuration
        self.config = None
        self.config_path = None
        self.config_lock = Lock()
        self.file_observer = None

        # Core managers
        self.display_manager = None
        self.background_manager = None
        self.fog_manager = None
        self.event_handler = None
        self.zoom_manager = None
        self.ui_manager = UIManager()

        # Pygame components
        self.screen = None
        self.element_renderer = None
        self.clock = pygame.time.Clock()

        # OpenGL components (for hardware-accelerated video)
        self.gl_context = None
        self.gl_video_renderer = None
        self.use_opengl = MODERNGL_AVAILABLE

        # State
        self.show_help = False
        self.poll_counter = 0
    
    def load_config(self, config_path):
        """
        Load configuration from JSON file.
        
        Args:
            config_path (str): Path to the JSON configuration file
            
        Returns:
            bool: True if config loaded successfully, False otherwise
        """
        try:
            self.config_path = config_path
            with open(config_path, 'r') as f:
                new_config = json.load(f)
            
            with self.config_lock:
                self.config = new_config
            
            print(f"Config loaded successfully from {config_path}")
            return True
        except Exception as e:
            print(f"Error loading config: {e}")
            return False
    
    def reload_config(self):
        """
        Reload configuration from file (called by file watcher).
        """
        try:
            with open(self.config_path, 'r') as f:
                new_config = json.load(f)
            
            with self.config_lock:
                old_config = self.config.copy() if self.config else None
                self.config = new_config
            
            # Check if background needs reloading
            if self.background_manager:
                if self.background_manager.check_background_change(old_config, new_config):
                    self.background_manager.request_reload()
            
            # Reload zoom configuration (ADD THIS)
            if self.zoom_manager:
                self.zoom_manager.load_config(new_config)
            
            print(f"✔ Config reloaded at {time.strftime('%H:%M:%S')}")
            
        except Exception as e:
            print(f"Error reloading config: {e}")
    
    def start_file_watcher(self):
        """Start watching the config file for changes."""
        if self.config_path and self.file_observer is None:
            config_dir = os.path.dirname(os.path.abspath(self.config_path))
            event_handler = ConfigWatcher(self.config_path, self.reload_config)
            
            self.file_observer = Observer()
            self.file_observer.schedule(event_handler, config_dir, recursive=False)
            self.file_observer.start()
            print(f"📁 Watching for changes: {self.config_path}")
    
    def stop_file_watcher(self):
        """Stop watching the config file."""
        if self.file_observer:
            try:
                self.file_observer.stop()
                # Don't join - let it die on its own
            except Exception:
                pass
            self.file_observer = None

    def _auto_populate_screen_dimensions(self, detected_width, detected_height):
        """
        Auto-populate screen dimensions in config if missing or different from detected.

        Args:
            detected_width (int): Detected screen width from pygame
            detected_height (int): Detected screen height from pygame
        """
        try:
            # Ensure screen section exists
            if 'screen' not in self.config:
                self.config['screen'] = {}

            current_width = self.config['screen'].get('width')
            current_height = self.config['screen'].get('height')

            # Set fullscreen to true by default if not specified
            if 'fullscreen' not in self.config['screen']:
                self.config['screen']['fullscreen'] = True

            # Check if dimensions are missing or different
            needs_update = (
                current_width is None or
                current_height is None or
                current_width != detected_width or
                current_height != detected_height
            )

            if needs_update:
                # Update config with detected dimensions
                self.config['screen']['width'] = detected_width
                self.config['screen']['height'] = detected_height

                # Save updated config back to file
                self._save_config()

                if current_width is None or current_height is None:
                    print(f"✓ Auto-populated screen dimensions: {detected_width}x{detected_height}")
                else:
                    print(f"✓ Updated screen dimensions: {current_width}x{current_height} → {detected_width}x{detected_height}")
            else:
                print(f"✓ Screen dimensions already correct: {detected_width}x{detected_height}")

        except Exception as e:
            print(f"Warning: Could not auto-populate screen dimensions: {e}")

    def _save_config(self):
        """
        Save the current configuration back to the JSON file.
        """
        try:
            if not self.config_path:
                return

            with open(self.config_path, 'w') as f:
                json.dump(self.config, f, indent=2)

            print(f"💾 Configuration saved to {self.config_path}")

        except Exception as e:
            print(f"Error saving config: {e}")

    def init_display(self):
        """
        Initialize all display components and managers.
        """
        if not self.config:
            print("No configuration loaded!")
            return False

        # Initialize display manager
        self.display_manager = DisplayManager(self.config)
        self.screen = self.display_manager.init_display()

        # Get window dimensions
        window_width, window_height = self.display_manager.dimensions

        # Auto-populate screen dimensions if missing or incorrect
        self._auto_populate_screen_dimensions(window_width, window_height)

        # Initialize OpenGL context for hardware-accelerated video (if available)
        if self.use_opengl:
            try:
                # Create ModernGL context from the current OpenGL context
                # Note: pygame creates an OpenGL context automatically when using OPENGL flag
                # However, DisplayManager doesn't use OPENGL flag, so we need to check
                # if we can create a context
                self.gl_context = moderngl.create_context()
                self.gl_video_renderer = GLVideoRenderer(
                    self.gl_context,
                    window_width,
                    window_height
                )
                print("✓ OpenGL context initialized for hardware-accelerated video")
                print(f"  OpenGL version: {self.gl_context.version_code}")
            except Exception as e:
                print(f"Warning: Could not initialize OpenGL context: {e}")
                print("  Falling back to software video rendering")
                self.use_opengl = False
                self.gl_context = None
                self.gl_video_renderer = None

        # Initialize zoom manager (add after other manager initializations)
        self.zoom_manager = ZoomManager(window_width, window_height)

        # Load zoom configuration from JSON
        self.zoom_manager.load_config(self.config)

        # Initialize other managers
        self.background_manager = BackgroundManager(window_width, window_height)
        self.fog_manager = FogManager(window_width, window_height)
        self.event_handler = EventHandler(self.fog_manager, self.zoom_manager)

        # Initialize element renderer (pass GL components if available)
        self.element_renderer = MediaElementRenderer(
            self.screen,
            gl_context=self.gl_context,
            gl_video_renderer=self.gl_video_renderer
        )

        # Initialize background
        self.background_manager.init_background(self.config)

        # Start file watcher
        self.start_file_watcher()

        return True
    
    def _on_config_reload(self, old_config, new_config):
        """
        Handle configuration reload events.
        
        Args:
            old_config (dict): Previous configuration
            new_config (dict): New configuration
        """
        # This method is no longer needed since we handle it directly in reload_config()
        pass
    
    def run(self):
        """
        Main application loop with zoom support.
        """
        if not self.init_display():
            return
        
        print("🚀 Display Engine started - Press H for help, ESC/Q to quit")
        
        try:
            while self.event_handler.is_running():
                # Handle pygame events
                with self.config_lock:
                    current_config = self.config.copy() if self.config else None
                
                # Process events - need to handle zoom BEFORE event_handler
                events = pygame.event.get()
                
                for event in events:
                    # Handle mouse wheel zoom
                    if event.type == pygame.MOUSEWHEEL:
                        self.zoom_manager.handle_mouse_wheel(event)
                        
                    # Handle middle mouse button for panning
                    elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 2:
                        self.zoom_manager.start_mouse_pan(event.pos)
                        
                    elif event.type == pygame.MOUSEBUTTONUP and event.button == 2:
                        self.zoom_manager.stop_mouse_pan()
                        
                    elif event.type == pygame.MOUSEMOTION:
                        self.zoom_manager.handle_mouse_pan(event.pos)
                
                # Now process events for event_handler (reprocess the events list)
                for event in events:
                    if event.type == pygame.QUIT:
                        self.event_handler.running = False
                    elif event.type == pygame.KEYDOWN:
                        self.event_handler._handle_keydown(event, self.reload_config)
                    elif event.type == pygame.MOUSEBUTTONDOWN and event.button != 2:
                        self.event_handler._handle_mouse_button_down(event, current_config, self.config_path, self.config_lock)
                    elif event.type == pygame.MOUSEBUTTONUP and event.button != 2:
                        self.event_handler._handle_mouse_button_up(event)
                    elif event.type == pygame.MOUSEMOTION:
                        self.event_handler._handle_mouse_motion(event, current_config)
                
                # Handle keyboard input for zoom (ADD THIS)
                keys = pygame.key.get_pressed()
                self.zoom_manager.handle_keyboard(keys)
                
                # Handle additional keyboard shortcuts
                self._handle_additional_keys()
                
                # Update zoom interpolation (ADD THIS)
                self.zoom_manager.update()
                
                # Handle background changes
                with self.config_lock:
                    self.background_manager.handle_background_reload(self.config)
                
                # CREATE A BASE SURFACE TO DRAW EVERYTHING ON (ADD THIS)
                base_surface = pygame.Surface((self.display_manager.window_width, 
                                            self.display_manager.window_height))
                
                # Draw everything to base surface instead of screen
                self.background_manager.draw_background(base_surface)
                
                # Draw elements using thread-safe config access
                with self.config_lock:
                    # Temporarily replace screen with base_surface for element renderer
                    original_screen = self.element_renderer.screen
                    self.element_renderer.screen = base_surface
                    self.element_renderer.basic_renderer.screen = base_surface
                    
                    self.element_renderer.draw_elements(self.config)
                    
                    # Restore original screen
                    self.element_renderer.screen = original_screen
                    self.element_renderer.basic_renderer.screen = original_screen
                
                # Draw fog overlay on base surface
                with self.config_lock:
                    # Check if fog should be cleared based on config flag
                    self.fog_manager.check_and_handle_clear_flag(self.config)
                    # Then draw fog
                    self.fog_manager.draw_fog_overlay(base_surface, self.config)
                
                # APPLY ZOOM TRANSFORMATION (ADD THIS)
                zoomed_surface = self.zoom_manager.create_zoomed_surface(base_surface)
                self.screen.blit(zoomed_surface, (0, 0))
                
                # Draw UI info (on top of zoom)
                self.ui_manager.draw_ui_info(
                    self.screen, 
                    self.clock, 
                    self.config_path,
                    self.element_renderer
                )
                
                # Draw zoom info overlay (ADD THIS)
                self.zoom_manager.draw_zoom_info(self.screen)
                
                # Draw help overlay if requested
                if self.show_help:
                    self.ui_manager.draw_help_overlay(self.screen)
                
                pygame.display.flip()
                self.clock.tick(60)  # 60 FPS
                
        finally:
            print("🔄 Main loop exited, starting cleanup...")
            self._cleanup()
    def _handle_additional_keys(self):
        """Handle additional keyboard shortcuts not covered by event handler."""
        keys = pygame.key.get_pressed()
        
        if keys[pygame.K_h]:
            if not hasattr(self, '_h_pressed'):
                self._h_pressed = True
                self.show_help = not self.show_help
                print(f"Help overlay: {'ON' if self.show_help else 'OFF'}")
        else:
            self._h_pressed = False
        
        if keys[pygame.K_d]:
            if not hasattr(self, '_d_pressed'):
                self._d_pressed = True
                self.ui_manager.toggle_debug()
        else:
            self._d_pressed = False
    
    def _cleanup(self):
        """Clean up all resources before shutdown."""
        print("🧹 Cleaning up resources...")

        # Stop file watcher
        print("  → Stopping file watcher...")
        self.stop_file_watcher()

        # Clean up background (non-blocking)
        print("  → Cleaning background...")
        try:
            if self.background_manager:
                self.background_manager.cleanup()
        except Exception as e:
            print(f"Background cleanup error (ignoring): {e}")

        # Clean up element renderer (non-blocking)
        print("  → Cleaning elements...")
        try:
            if self.element_renderer:
                self.element_renderer.cleanup()
        except Exception as e:
            print(f"Element renderer cleanup error (ignoring): {e}")

        # Clean up OpenGL resources
        print("  → Cleaning OpenGL...")
        try:
            if self.gl_video_renderer:
                self.gl_video_renderer.cleanup()
            if self.gl_context:
                self.gl_context.release()
        except Exception as e:
            print(f"OpenGL cleanup error (ignoring): {e}")

        # Quit pygame immediately - daemon threads will terminate automatically
        print("  → Quitting pygame...")
        try:
            pygame.quit()
        except Exception:
            pass
        print("✓ Cleanup complete")

        # Force immediate exit - no waiting for anything
        print("  → Forcing exit with os._exit(0)...")
        import os
        os._exit(0)


def signal_handler(sig, frame):
    """Handle termination signals to ensure clean exit."""
    global _display_engine_instance
    print("\n🛑 Received termination signal, shutting down...")
    if _display_engine_instance and hasattr(_display_engine_instance, 'event_handler'):
        _display_engine_instance.event_handler.running = False
    # Force immediate exit
    import os
    os._exit(0)


def main():

    import os
    os.environ['SDL_VIDEO_MINIMIZE_ON_FOCUS_LOSS'] = '0'
    """
    Main entry point for the display engine.
    
    Handles command line arguments and starts the application.
    """
    if len(sys.argv) != 2:
        print("Display Engine v2.0 - Interactive Visual Display System")
        print("=" * 55)
        print("Usage: python display_engine.py <config.json>")
        print("\nRequirements:")
        print("  pip install pygame opencv-python numpy pillow watchdog")
        print("\nLinux tools for perfect borderless display:")
        print("  sudo apt install wmctrl xdotool")
        print("\nDefault Mode:")
        print("  - Borderless fullscreen windowed (like F11 in browsers)")
        print("  - Can Alt+Tab to other windows")
        print("  - Cannot be minimized or closed except with ESC/Q")
        print("  - No title bar or window decorations")
        print("\nControls:")
        print("  ESC or Q  - Quit application")
        print("  F11       - Toggle between borderless windowed ↔ true fullscreen")
        print("  R         - Manual JSON reload")
        print("  H         - Toggle help overlay")
        print("  D         - Toggle debug info")
        print("  C         - Clear all fog")
        print("\nFeatures:")
        print("  ✓ Live JSON reloading - edit config and see changes instantly")
        print("  ✓ Multi-monitor support with automatic detection")
        print("  ✓ Video backgrounds (MP4, AVI, MOV, MKV, WebM)")
        print("  ✓ Element types: tokens, areas, lines, cones, GIFs, videos")
        print("  ✓ Real-time resizing and repositioning")
        print("  ✓ Linux window management with always-on-top")
        print("  ✓ Interactive fog overlay system")
        sys.exit(1)
    
    # Initialize and run display engine
    global _display_engine_instance
    engine = SDLDisplayEngine()
    _display_engine_instance = engine

    # Register signal handlers for clean exit
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Register cleanup function to run on exit
    atexit.register(lambda: engine.cleanup() if hasattr(engine, 'cleanup') else None)

    if not engine.load_config(sys.argv[1]):
        print("Failed to load configuration file")
        sys.exit(1)

    try:
        engine.run()
    except KeyboardInterrupt:
        print("\n🛑 Interrupted by user")
    except Exception as e:
        print(f"💥 Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        engine.cleanup()


if __name__ == "__main__":
    main()