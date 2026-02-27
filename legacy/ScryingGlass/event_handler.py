#!/usr/bin/env python3
"""
Event Handler Module
Handles pygame events, mouse interactions, and keyboard shortcuts.
Enhanced with JSON-controlled fog clearing.
"""
import pygame

class EventHandler:
    """
    Handles all pygame events including mouse clicks, keyboard input, and system events.
    """

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
    
    def handle_events(self, config, config_path, config_lock, reload_callback):
        """
        Process all pygame events.
        
        Args:
            config (dict): Current configuration
            config_path (str): Path to configuration file
            config_lock (Lock): Thread lock for config access
            reload_callback (callable): Function to call for manual reload
            
        Returns:
            bool: True if application should continue running, False to quit
        """
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self.running = False
                
            elif event.type == pygame.KEYDOWN:
                self._handle_keydown(event, reload_callback)
                
            elif event.type == pygame.MOUSEBUTTONDOWN:
                self._handle_mouse_button_down(event, config, config_path, config_lock)
                
            elif event.type == pygame.MOUSEBUTTONUP:
                self._handle_mouse_button_up(event)
                
            elif event.type == pygame.MOUSEMOTION:
                self._handle_mouse_motion(event, config)
        
        return self.running
    
    def _handle_keydown(self, event, reload_callback):
        """
        Handle keyboard input events.
        
        Args:
            event (pygame.Event): Keyboard event
            reload_callback (callable): Function to call for manual reload
        """
        if event.key == pygame.K_ESCAPE or event.key == pygame.K_q:
            print("🛑 ESC/Q pressed - initiating shutdown...")
            self.running = False
            
        elif event.key == pygame.K_F11:
            # Toggle fullscreen
            pygame.display.toggle_fullscreen()
            
        elif event.key == pygame.K_r:
            # Manual reload
            print("🔄 Manual reload requested")
            reload_callback()
            
        elif event.key == pygame.K_c:
            # Clear all fog
            self.fog_manager.clear_all_fog()
            
        elif event.key == pygame.K_t:
            # Toggle fog clear mode (for testing - would normally be in JSON)
            print("⚠️  Use JSON config to control fog clear mode")
    
    def _handle_mouse_button_down(self, event, config, config_path, config_lock):
        """
        Handle mouse button press events.
        
        Args:
            event (pygame.Event): Mouse button event
            config (dict): Current configuration
            config_path (str): Path to configuration file
            config_lock (Lock): Thread lock for config access
        """
        if event.button == 1:  # Left mouse button
            self.fog_manager.start_dragging()
            self._handle_mouse_click(event.pos, event.button, config, config_path, config_lock)
    
    def _handle_mouse_button_up(self, event):
        """
        Handle mouse button release events.
        
        Args:
            event (pygame.Event): Mouse button event
        """
        if event.button == 1:  # Left mouse button
            self.fog_manager.stop_dragging()
    
    def _handle_mouse_motion(self, event, config):
        """
        Handle mouse motion events.

        Args:
            event (pygame.Event): Mouse motion event
            config (dict): Current configuration
        """
        # Transform screen coordinates to world coordinates when zoom is active
        if self.zoom_manager and self.zoom_manager.zoom_level != 1.0:
            x, y = event.pos
            world_x, world_y = self.zoom_manager.screen_to_world(x, y)
            transformed_pos = (world_x, world_y)
        else:
            transformed_pos = event.pos

        self.fog_manager.handle_mouse_motion(transformed_pos, config)
    
    def _handle_mouse_click(self, pos, button, config, config_path, config_lock):
        """
        Handle mouse click events including fog clearing and external interactions.

        Args:
            pos (tuple): Mouse position (x, y) in screen coordinates
            button (int): Mouse button number
            config (dict): Current configuration
            config_path (str): Path to configuration file
            config_lock (Lock): Thread lock for config access
        """
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
    
    def is_running(self):
        """
        Check if the application should continue running.
        
        Returns:
            bool: True if running, False if should quit
        """
        return self.running
    
    def stop(self):
        """Stop the event handler (quit application)."""
        self.running = False