#!/usr/bin/env python3
"""
Zoom Manager Module for Display Engine

This module handles viewport zooming and panning functionality.
Supports JSON-configured zoom levels, keyboard/mouse controls, and smooth transitions.

Classes:
    ZoomManager: Manages zoom level, viewport transformation, and pan offsets
"""

import pygame
import math
import time


class ZoomManager:
    """
    Manages zoom and pan transformations for the display viewport.
    
    Provides smooth zooming, panning, and viewport management with
    configurable limits and interpolation.
    """
    
    def __init__(self, window_width, window_height):
        """
        Initialize zoom manager.

        Args:
            window_width (int): Window width in pixels
            window_height (int): Window height in pixels
        """
        self.window_width = window_width
        self.window_height = window_height

        # Current zoom state
        self.zoom_level = 1.0  # 1.0 = 100% (no zoom)
        self.pan_x = 0  # Horizontal pan offset
        self.pan_y = 0  # Vertical pan offset

        # Target zoom state (for smooth transitions)
        self.target_zoom = 1.0
        self.target_pan_x = 0
        self.target_pan_y = 0

        # Zoom configuration
        self.min_zoom = 0.1  # 10% minimum zoom
        self.max_zoom = 10.0  # 1000% maximum zoom
        self.zoom_speed = 0.1  # Zoom increment per scroll/key
        self.smooth_zoom = True  # Enable smooth zoom transitions
        self.interpolation_speed = 0.15  # Speed of smooth transitions

        # Pan configuration
        self.pan_speed = 20  # Pixels per arrow key press
        self.mouse_pan_sensitivity = 1.0

        # Mouse state for panning
        self.mouse_panning = False
        self.last_mouse_pos = None

        # Zoom center mode
        self.zoom_to_mouse = True  # Zoom towards mouse position
        self.zoom_center_x = window_width // 2
        self.zoom_center_y = window_height // 2

        # Debug info
        self.show_zoom_info = False

        print(f"✔ Zoom Manager initialized ({window_width}x{window_height})")

    def _parse_pan_value(self, value, dimension):
        """
        Parse pan value that can be either a number (pixels) or a percentage string.

        Args:
            value: The pan value (number or string like "50%")
            dimension (int): The reference dimension (width or height) for percentage calculation

        Returns:
            float: The pan value in pixels
        """
        if isinstance(value, str) and value.endswith('%'):
            # Convert percentage to pixels
            percentage = float(value.rstrip('%'))
            return (percentage / 100.0) * dimension
        else:
            # Already in pixels
            return float(value) if value is not None else 0
    
    def load_config(self, config):
        """
        Load zoom configuration from JSON config.
        
        Args:
            config (dict): Configuration dictionary containing zoom settings
        """
        if not config or 'zoom' not in config:
            return
        
        zoom_config = config['zoom']
        
        # Load zoom level
        if 'level' in zoom_config:
            self.zoom_level = zoom_config['level']
            self.set_zoom(zoom_config['level'])
            self.target_zoom = self.zoom_level
        
        # Load pan position (supports both pixels and percentages)
        if 'panX' in zoom_config:
            # Negate panX to flip the direction
            self.pan_x = -self._parse_pan_value(zoom_config['panX'], self.window_width)
            self.target_pan_x = self.pan_x
        if 'panY' in zoom_config:
            self.pan_y = self._parse_pan_value(zoom_config['panY'], self.window_height)
            self.target_pan_y = self.pan_y
        
        # Load zoom limits
        if 'minZoom' in zoom_config:
            self.min_zoom = max(0.1, zoom_config['minZoom'])
        if 'maxZoom' in zoom_config:
            self.max_zoom = min(20.0, zoom_config['maxZoom'])
        
        # Load behavior settings
        if 'zoomSpeed' in zoom_config:
            self.zoom_speed = zoom_config['zoomSpeed']
        if 'panSpeed' in zoom_config:
            self.pan_speed = zoom_config['panSpeed']
        if 'smoothZoom' in zoom_config:
            self.smooth_zoom = zoom_config['smoothZoom']
        if 'interpolationSpeed' in zoom_config:
            self.interpolation_speed = zoom_config['interpolationSpeed']
        if 'zoomToMouse' in zoom_config:
            self.zoom_to_mouse = zoom_config['zoomToMouse']
        
        # Load center point if specified
        if 'centerX' in zoom_config and 'centerY' in zoom_config:
            self.zoom_center_x = zoom_config['centerX']
            self.zoom_center_y = zoom_config['centerY']
            # Auto-center on specified point
            if 'autoCenter' in zoom_config and zoom_config['autoCenter']:
                self.center_on_point(self.zoom_center_x, self.zoom_center_y)
        
        # Load debug setting
        if 'showInfo' in zoom_config:
            self.show_zoom_info = zoom_config['showInfo']
        
        print(f"📐 Zoom config loaded: {self.zoom_level:.1f}x, pan({self.pan_x}, {self.pan_y})")
        
    def set_zoom(self, zoom_level, center_x=None, center_y=None):
        """
        Set zoom level with optional center point.
        
        Args:
            zoom_level (float): New zoom level (1.0 = 100%)
            center_x (int): X coordinate to zoom towards (optional)
            center_y (int): Y coordinate to zoom towards (optional)
        """
        old_zoom = self.zoom_level
        
        # Clamp zoom level
        new_zoom = max(self.min_zoom, min(self.max_zoom, zoom_level))
        
        if center_x is not None and center_y is not None:
            # Get current pan values
            current_pan_x = self.target_pan_x if self.smooth_zoom else self.pan_x
            current_pan_y = self.target_pan_y if self.smooth_zoom else self.pan_y
            
            # Convert screen point to world coordinates (relative to content, not window)
            # The content position on screen = center + pan
            world_x = (center_x - current_pan_x) / old_zoom
            world_y = (center_y - current_pan_y) / old_zoom
            
            # Calculate new pan to keep the same world point at the same screen position
            new_pan_x = center_x - world_x * new_zoom
            new_pan_y = center_y - world_y * new_zoom
            
            if self.smooth_zoom:
                self.target_pan_x = new_pan_x
                self.target_pan_y = new_pan_y
            else:
                self.pan_x = new_pan_x
                self.pan_y = new_pan_y
        
        if self.smooth_zoom:
            self.target_zoom = new_zoom
        else:
            self.zoom_level = new_zoom

    def zoom_in(self, center_x=None, center_y=None):
        """
        Zoom in by zoom_speed amount.
        
        Args:
            center_x (int): X coordinate to zoom towards (optional)
            center_y (int): Y coordinate to zoom towards (optional)
        """
        new_zoom = self.target_zoom if self.smooth_zoom else self.zoom_level
        new_zoom *= (1 + self.zoom_speed)
        
        # If no center specified, zoom toward the center of the window
        if center_x is None and center_y is None:
            center_x = self.window_width // 2
            center_y = self.window_height // 2
    
        self.set_zoom(new_zoom, center_x, center_y)

    def zoom_out(self, center_x=None, center_y=None):
        """
        Zoom out by zoom_speed amount.
        
        Args:
            center_x (int): X coordinate to zoom towards (optional)
            center_y (int): Y coordinate to zoom towards (optional)
        """
        new_zoom = self.target_zoom if self.smooth_zoom else self.zoom_level
        new_zoom /= (1 + self.zoom_speed)
        
        # If no center specified, zoom toward the center of the window
        if center_x is None and center_y is None:
            center_x = self.window_width // 2
            center_y = self.window_height // 2
        
        self.set_zoom(new_zoom, center_x, center_y)
    
    def reset_zoom(self):
        """Reset zoom to 100% and center the view."""
        if self.smooth_zoom:
            self.target_zoom = 1.0
            self.target_pan_x = 0
            self.target_pan_y = 0
        else:
            self.zoom_level = 1.0
            self.pan_x = 0
            self.pan_y = 0
        print("🔄 Zoom reset to 100%")
    
    def pan(self, dx, dy):
        """
        Pan the viewport by the specified amount.
        
        Args:
            dx (float): Horizontal pan amount in pixels
            dy (float): Vertical pan amount in pixels
        """
        if self.smooth_zoom:
            self.target_pan_x += dx
            self.target_pan_y += dy
        else:
            self.pan_x += dx
            self.pan_y += dy
    
    def center_on_point(self, world_x, world_y):
        """
        Center the viewport on a specific world coordinate.
        
        Args:
            world_x (float): World X coordinate to center on
            world_y (float): World Y coordinate to center on
        """
        # Calculate pan offset to center on the point
        new_pan_x = self.window_width / 2 - world_x * self.zoom_level
        new_pan_y = self.window_height / 2 - world_y * self.zoom_level
        
        if self.smooth_zoom:
            self.target_pan_x = new_pan_x
            self.target_pan_y = new_pan_y
        else:
            self.pan_x = new_pan_x
            self.pan_y = new_pan_y
    
    def update(self):
        """
        Update zoom and pan with smooth interpolation.
        Should be called every frame when smooth_zoom is enabled.
        """
        if not self.smooth_zoom:
            return
        
        # Interpolate zoom level
        if abs(self.target_zoom - self.zoom_level) > 0.001:
            self.zoom_level += (self.target_zoom - self.zoom_level) * self.interpolation_speed
        else:
            self.zoom_level = self.target_zoom
        
        # Interpolate pan position
        if abs(self.target_pan_x - self.pan_x) > 0.1:
            self.pan_x += (self.target_pan_x - self.pan_x) * self.interpolation_speed
        else:
            self.pan_x = self.target_pan_x
        
        if abs(self.target_pan_y - self.pan_y) > 0.1:
            self.pan_y += (self.target_pan_y - self.pan_y) * self.interpolation_speed
        else:
            self.pan_y = self.target_pan_y
    
    def screen_to_world(self, screen_x, screen_y):
        """
        Convert screen coordinates to world coordinates.
        
        Args:
            screen_x (int): Screen X coordinate
            screen_y (int): Screen Y coordinate
            
        Returns:
            tuple: (world_x, world_y) coordinates
        """
        world_x = (screen_x - self.window_width / 2 - self.pan_x) / self.zoom_level + self.window_width / 2
        world_y = (screen_y - self.window_height / 2 - self.pan_y) / self.zoom_level + self.window_height / 2
        return world_x, world_y
    
    def world_to_screen(self, world_x, world_y):
        """
        Convert world coordinates to screen coordinates.
        
        Args:
            world_x (float): World X coordinate
            world_y (float): World Y coordinate
            
        Returns:
            tuple: (screen_x, screen_y) coordinates
        """
        screen_x = (world_x - self.window_width / 2) * self.zoom_level + self.window_width / 2 + self.pan_x
        screen_y = (world_y - self.window_height / 2) * self.zoom_level + self.window_height / 2 + self.pan_y
        return int(screen_x)
    
    def create_zoomed_surface(self, original_surface):
        """
        Create a zoomed and panned surface from the original.
        
        Args:
            original_surface (pygame.Surface): Original unzoomed surface
            
        Returns:
            pygame.Surface: Transformed surface with zoom and pan applied
        """
        if self.zoom_level == 1.0 and self.pan_x == 0 and self.pan_y == 0:
            return original_surface
        
        # Create output surface
        zoomed_surface = pygame.Surface((self.window_width, self.window_height))
        zoomed_surface.fill((0, 0, 0))  # Black background
        
        if self.zoom_level != 1.0:
            # Scale the original surface
            scaled_width = int(self.window_width * self.zoom_level)
            scaled_height = int(self.window_height * self.zoom_level)
            scaled_surface = pygame.transform.scale(original_surface, (scaled_width, scaled_height))
            
            # Calculate position to center the scaled surface and apply pan
            # The scaled surface should be centered, then offset by pan
            pos_x = (self.window_width - scaled_width) // 2 + self.pan_x
            pos_y = (self.window_height - scaled_height) // 2 + self.pan_y
            
            zoomed_surface.blit(scaled_surface, (pos_x, pos_y))
        else:
            # Just pan without zoom - center the content then apply pan
            zoomed_surface.blit(original_surface, (-self.pan_x, -self.pan_y))
        
        return zoomed_surface
    def handle_mouse_wheel(self, event):
        """
        Handle mouse wheel events for zooming.
        
        Args:
            event (pygame.event.Event): Mouse wheel event
        """
        if event.type == pygame.MOUSEWHEEL:
            mouse_x, mouse_y = pygame.mouse.get_pos()
            
            if event.y > 0:  # Scroll up - zoom in
                if self.zoom_to_mouse:
                    self.zoom_in(mouse_x, mouse_y)
                else:
                    self.zoom_in(self.window_width // 2, self.window_height // 2)
            elif event.y < 0:  # Scroll down - zoom out
                if self.zoom_to_mouse:
                    self.zoom_out(mouse_x, mouse_y)
                else:
                    self.zoom_out(self.window_width // 2, self.window_height // 2)
    
    def handle_keyboard(self, keys):
        """
        Handle keyboard input for zoom and pan.
        
        Args:
            keys (pygame.key.ScancodeWrapper): Pressed keys from pygame.key.get_pressed()
        """
        # Zoom controls
        if keys[pygame.K_PLUS] or keys[pygame.K_EQUALS]:
            self.zoom_in(self.window_width // 2, self.window_height // 2)
        elif keys[pygame.K_MINUS]:
            self.zoom_out(self.window_width // 2, self.window_height // 2)
        elif keys[pygame.K_0]:
            self.reset_zoom()
        
        # Pan controls
        pan_amount = self.pan_speed
        if keys[pygame.K_LSHIFT] or keys[pygame.K_RSHIFT]:
            pan_amount *= 2  # Faster panning with shift
        
        if keys[pygame.K_LEFT]:
            self.pan(pan_amount, 0)
        elif keys[pygame.K_RIGHT]:
            self.pan(-pan_amount, 0)
        if keys[pygame.K_UP]:
            self.pan(0, pan_amount)
        elif keys[pygame.K_DOWN]:
            self.pan(0, -pan_amount)
    
    def start_mouse_pan(self, mouse_pos):
        """
        Start mouse panning (middle mouse button).
        
        Args:
            mouse_pos (tuple): Current mouse position (x, y)
        """
        self.mouse_panning = True
        self.last_mouse_pos = mouse_pos
    
    def stop_mouse_pan(self):
        """Stop mouse panning."""
        self.mouse_panning = False
        self.last_mouse_pos = None
    
    def handle_mouse_pan(self, mouse_pos):
        """
        Handle mouse panning motion.
        
        Args:
            mouse_pos (tuple): Current mouse position (x, y)
        """
        if not self.mouse_panning or not self.last_mouse_pos:
            return
        
        # Calculate mouse movement
        dx = (mouse_pos[0] - self.last_mouse_pos[0]) * self.mouse_pan_sensitivity
        dy = (mouse_pos[1] - self.last_mouse_pos[1]) * self.mouse_pan_sensitivity
        
        # Pan the viewport
        self.pan(dx, dy)
        
        # Update last mouse position
        self.last_mouse_pos = mouse_pos
    
    def draw_zoom_info(self, screen):
        """
        Draw zoom information overlay.
        
        Args:
            screen (pygame.Surface): Screen to draw on
        """
        if not self.show_zoom_info:
            return
        
        font = pygame.font.Font(None, 24)
        
        # Create info text
        zoom_percent = int(self.zoom_level * 100)
        info_lines = [
            f"Zoom: {zoom_percent}%",
            f"Pan: ({int(self.pan_x)}, {int(self.pan_y)})",
        ]
        
        # Add center point info if not at default
        if self.zoom_center_x != self.window_width // 2 or self.zoom_center_y != self.window_height // 2:
            info_lines.append(f"Center: ({self.zoom_center_x}, {self.zoom_center_y})")
        
        # Draw background
        y_offset = 10
        max_width = max(font.size(line)[0] for line in info_lines) + 20
        total_height = len(info_lines) * 25 + 10
        
        info_rect = pygame.Rect(screen.get_width() - max_width - 10, y_offset, 
                                max_width, total_height)
        pygame.draw.rect(screen, (0, 0, 0, 180), info_rect)
        pygame.draw.rect(screen, (100, 200, 100), info_rect, 1)
        
        # Draw text
        for i, line in enumerate(info_lines):
            color = (100, 255, 100) if i == 0 else (200, 200, 200)
            text = font.render(line, True, color)
            screen.blit(text, (info_rect.x + 10, info_rect.y + 5 + i * 25))
    
    def get_transform_matrix(self):
        """
        Get the transformation matrix for the current zoom and pan.
        
        Returns:
            dict: Transform parameters for manual transformation
        """
        return {
            'scale': self.zoom_level,
            'offset_x': self.pan_x,
            'offset_y': self.pan_y,
            'center_x': self.window_width / 2,
            'center_y': self.window_height / 2
        }
    
    def apply_transform_to_point(self, x, y):
        """
        Apply zoom and pan transformation to a point.
        
        Args:
            x (float): Original X coordinate
            y (float): Original Y coordinate
            
        Returns:
            tuple: (transformed_x, transformed_y)
        """
        # Translate to center, scale, translate back, then apply pan
        cx = self.window_width / 2
        cy = self.window_height / 2
        
        transformed_x = (x - cx) * self.zoom_level + cx + self.pan_x
        transformed_y = (y - cy) * self.zoom_level + cy + self.pan_y
        
        return transformed_x, transformed_y
    
    def apply_transform_to_rect(self, x, y, width, height):
        """
        Apply zoom and pan transformation to a rectangle.
        
        Args:
            x (float): Original X coordinate
            y (float): Original Y coordinate
            width (float): Original width
            height (float): Original height
            
        Returns:
            tuple: (transformed_x, transformed_y, transformed_width, transformed_height)
        """
        # Transform position
        tx, ty = self.apply_transform_to_point(x, y)
        
        # Scale dimensions
        tw = width * self.zoom_level
        th = height * self.zoom_level
        
        return tx, ty, tw, th
    
    def get_visible_bounds(self):
        """
        Get the world coordinates of the visible viewport.
        
        Returns:
            tuple: (min_x, min_y, max_x, max_y) in world coordinates
        """
        min_x, min_y = self.screen_to_world(0, 0)
        max_x, max_y = self.screen_to_world(self.window_width, self.window_height)
        return min_x, min_y, max_x, max_y
    
    def is_point_visible(self, world_x, world_y):
        """
        Check if a world point is visible in the current viewport.
        
        Args:
            world_x (float): World X coordinate
            world_y (float): World Y coordinate
            
        Returns:
            bool: True if point is visible
        """
        screen_x, screen_y = self.world_to_screen(world_x, world_y)
        return (0 <= screen_x <= self.window_width and 
                0 <= screen_y <= self.window_height)
    
    def get_zoom_info(self):
        """
        Get current zoom state information.
        
        Returns:
            dict: Current zoom state
        """
        return {
            'zoom_level': self.zoom_level,
            'zoom_percent': int(self.zoom_level * 100),
            'pan_x': self.pan_x,
            'pan_y': self.pan_y,
            'target_zoom': self.target_zoom,
            'target_pan_x': self.target_pan_x,
            'target_pan_y': self.target_pan_y,
            'min_zoom': self.min_zoom,
            'max_zoom': self.max_zoom,
            'smooth_zoom': self.smooth_zoom,
            'zoom_to_mouse': self.zoom_to_mouse
        }