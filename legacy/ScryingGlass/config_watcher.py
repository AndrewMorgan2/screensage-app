#!/usr/bin/env python3
"""
Config File Watcher Module
Enhanced file system event handler that works with sed and other tools.
Combines file system events with periodic polling to ensure changes are always detected.
"""
import os
import time
import hashlib
from watchdog.events import FileSystemEventHandler


class ConfigWatcher(FileSystemEventHandler):
    """
    Enhanced file system event handler that works with sed and other tools.
    
    Combines file system events with periodic polling to ensure changes
    are always detected, regardless of how the file is modified.
    """
    
    def __init__(self, config_path, reload_callback):
        """
        Initialize the config file watcher.
        
        Args:
            config_path (str): Path to the JSON configuration file to watch
            reload_callback (callable): Function to call when file changes are detected
        """
        super().__init__()
        self.config_path = os.path.abspath(config_path)
        self.reload_callback = reload_callback
        self.last_modified = 0
        self.last_hash = self._get_file_hash()
        self.last_mtime = self._get_file_mtime()
            
    def _get_file_hash(self):
        """Get MD5 hash of the config file content."""
        try:
            with open(self.config_path, 'rb') as f:
                return hashlib.md5(f.read()).hexdigest()
        except Exception:
            return None
    
    def _get_file_mtime(self):
        """Get file modification time."""
        try:
            return os.path.getmtime(self.config_path)
        except Exception:
            return None
    
    def _trigger_reload(self, reason):
        """Trigger config reload with debouncing."""
        current_time = time.time()
        if current_time - self.last_modified > 0.1:  # 100ms debounce
            self.last_modified = current_time
            print(f"Config file changed ({reason}): {os.path.basename(self.config_path)}")
            # Small delay to ensure file write is complete
            time.sleep(0.05)
            
            # Update our tracking values
            self.last_hash = self._get_file_hash()
            self.last_mtime = self._get_file_mtime()
            
            self.reload_callback()
    
    def check_for_changes(self):
        """
        Manually check if file has changed (polling method).
        
        This catches changes that file system events might miss,
        such as those made by sed, vim, or other tools that
        create temporary files.
        """
        current_hash = self._get_file_hash()
        current_mtime = self._get_file_mtime()
        
        # Check if content changed (most reliable)
        if current_hash and current_hash != self.last_hash:
            self._trigger_reload("content hash")
            return True
        
        # Check if modification time changed (backup method)
        if current_mtime and current_mtime != self.last_mtime:
            self._trigger_reload("mtime")
            return True
        
        return False
    
    # Event handlers for file system events
    def on_modified(self, event):
        """Handle file modification events."""
        self._handle_event(event, "modified")
    
    def on_moved(self, event):
        """Handle file move events (sed -i, vim, etc.)."""
        if hasattr(event, 'dest_path'):
            # Check if our file was the destination of a move
            if os.path.abspath(event.dest_path) == self.config_path:
                self._trigger_reload("moved")
    
    def on_created(self, event):
        """Handle file creation events (some editors recreate files)."""
        self._handle_event(event, "created")
    
    def _handle_event(self, event, event_type):
        """Common handler for file system events."""
        if event.is_directory:
            return
            
        # Check if it's our config file
        if os.path.abspath(event.src_path) == self.config_path:
            self._trigger_reload(f"fs event: {event_type}")