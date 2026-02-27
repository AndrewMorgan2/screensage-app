"""
Configuration file handling for the Pyglet Display Engine.

Includes file watching for live reload and graphics grouping.
"""

import os
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from pyglet.graphics import Group


class ConfigFileHandler(FileSystemEventHandler):
    """Handle config file changes for live reloading."""

    def __init__(self, engine, config_path: str):
        """
        Initialize the config file handler.

        Args:
            engine: Reference to the PygletDisplayEngine instance
            config_path: Path to the configuration JSON file
        """
        self.engine = engine
        self.config_path = os.path.abspath(config_path)

    def on_modified(self, event):
        """Called when a file is modified."""
        if os.path.abspath(event.src_path) == self.config_path:
            print(f"📝 Config file changed (modified): {event.src_path}")
            self.engine.needs_reload = True

    def on_created(self, event):
        """Called when a file is created (some editors save by creating a new file)."""
        if os.path.abspath(event.src_path) == self.config_path:
            print(f"📝 Config file changed (created): {event.src_path}")
            self.engine.needs_reload = True

    def on_moved(self, event):
        """Called when a file is moved (some editors save by moving a temp file)."""
        if hasattr(event, 'dest_path') and os.path.abspath(event.dest_path) == self.config_path:
            print(f"📝 Config file changed (moved): {event.dest_path}")
            self.engine.needs_reload = True


class ViewTransformGroup(Group):
    """Custom graphics group that applies zoom and pan transformations."""

    def __init__(self, zoom: float = 1.0, pan_x: float = 0.0, pan_y: float = 0.0,
                 window_width: int = 0, window_height: int = 0, parent=None):
        """
        Initialize the view transform group.

        Args:
            zoom: Zoom level (1.0 = 100%)
            pan_x: Horizontal pan offset in pixels
            pan_y: Vertical pan offset in pixels
            window_width: Window width for calculations
            window_height: Window height for calculations
            parent: Parent graphics group
        """
        super().__init__(parent=parent)
        self.zoom = zoom
        self.pan_x = pan_x
        self.pan_y = pan_y
        self.window_width = window_width
        self.window_height = window_height

    def set_state(self):
        """Apply the view transformation when this group is rendered."""
        # For Pyglet 2.x, we can't use deprecated OpenGL functions
        # So we'll just not apply any transformation here
        # The transformation will be handled differently
        pass

    def unset_state(self):
        """Restore the previous state."""
        pass


def start_file_watcher(engine, config_path: str) -> Observer:
    """
    Start watching the config file for changes.

    Args:
        engine: Reference to the PygletDisplayEngine instance
        config_path: Path to the configuration file

    Returns:
        Observer instance or None if failed
    """
    try:
        config_dir = os.path.dirname(os.path.abspath(config_path))
        event_handler = ConfigFileHandler(engine, config_path)
        observer = Observer()
        observer.schedule(event_handler, config_dir, recursive=False)
        observer.start()
        print(f"✓ Watching config file for changes: {config_path}")
        return observer
    except Exception as e:
        print(f"Warning: Could not start file watcher: {e}")
        return None


def stop_file_watcher(observer: Observer):
    """
    Stop the file watcher.

    Args:
        observer: Observer instance to stop
    """
    if observer:
        observer.stop()
        observer.join()
