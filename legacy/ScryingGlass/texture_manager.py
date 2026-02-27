#!/usr/bin/env python3
"""
Texture Manager Module for Display Engine

This module handles texture loading, caching, and rendering for areas and cones.
Supports static images, animated GIFs, and texture tiling/scaling.

Classes:
    TextureManager: Manages texture loading, caching, and animated texture playback
"""

import os
import pygame
import time
import hashlib
from threading import Lock
from PIL import Image, ImageSequence
import math


class AnimatedTexture:
    """
    Handles animated texture playback (primarily for GIFs).
    """
    
    def __init__(self, texture_path):
        """
        Initialize animated texture.
        
        Args:
            texture_path (str): Path to animated texture file (GIF)
        """
        self.texture_path = texture_path
        self.frames = []
        self.frame_durations = []
        self.current_frame_index = 0
        self.last_frame_time = 0
        self.playing = True
        self.load_animated_texture()
    
    def load_animated_texture(self):
        """Load animated texture frames and timing information."""
        try:
            with Image.open(self.texture_path) as gif:
                for frame in ImageSequence.Iterator(gif):
                    # Convert to RGBA for proper transparency support
                    frame = frame.convert('RGBA')
                    
                    # Convert PIL image to pygame surface
                    frame_data = frame.tobytes()
                    frame_surface = pygame.image.fromstring(frame_data, frame.size, 'RGBA')
                    self.frames.append(frame_surface)
                    
                    # Get frame duration from GIF metadata (in milliseconds)
                    duration = frame.info.get('duration', 100)  # Default 100ms if not specified
                    self.frame_durations.append(duration / 1000.0)  # Convert to seconds
                    
            print(f"Loaded animated texture: {self.texture_path} ({len(self.frames)} frames)")
                    
        except Exception as e:
            print(f"Error loading animated texture {self.texture_path}: {e}")
            # Create a placeholder frame if loading fails
            placeholder = pygame.Surface((64, 64), pygame.SRCALPHA)
            placeholder.fill((255, 0, 255, 128))  # Magenta placeholder
            self.frames = [placeholder]
            self.frame_durations = [0.1]
    
    def get_current_frame(self):
        """
        Get the current frame and advance animation based on timing.
        
        Returns:
            pygame.Surface: Current frame as pygame surface
        """
        if not self.frames:
            return None
            
        current_time = time.time()
        frame_duration = self.frame_durations[self.current_frame_index]
        
        # Check if it's time to advance to the next frame
        if self.playing and current_time - self.last_frame_time >= frame_duration:
            self.current_frame_index = (self.current_frame_index + 1) % len(self.frames)
            self.last_frame_time = current_time
        
        return self.frames[self.current_frame_index]
    
    def reset(self):
        """Reset animation to first frame."""
        self.current_frame_index = 0
        self.last_frame_time = time.time()
    
    def pause(self):
        """Pause animation."""
        self.playing = False
    
    def resume(self):
        """Resume animation."""
        self.playing = True


class TextureManager:
    """
    Manages texture loading, caching, and rendering for areas and cones.
    
    Supports static images, animated GIFs, texture tiling, scaling, and rotation.
    """
    
    def __init__(self):
        """Initialize texture manager."""
        self.static_textures = {}  # Cache for static textures
        self.animated_textures = {}  # Cache for animated textures
        self.texture_lock = Lock()
        self.supported_formats = {
            'static': ['.png', '.jpg', '.jpeg', '.bmp', '.tga'],
            'animated': ['.gif']
        }
    
    def _get_cache_key(self, texture_path, width, height, tile_mode='stretch'):
        """
        Create cache key for texture based on path and parameters.
        
        Args:
            texture_path (str): Path to texture file
            width (int): Target width
            height (int): Target height
            tile_mode (str): Texture tiling mode
            
        Returns:
            str: Cache key
        """
        return f"{texture_path}_{width}_{height}_{tile_mode}"
    
    def _is_animated_texture(self, texture_path):
        """
        Check if texture file is animated.
        
        Args:
            texture_path (str): Path to texture file
            
        Returns:
            bool: True if animated, False otherwise
        """
        if not texture_path:
            return False
        
        ext = os.path.splitext(texture_path.lower())[1]
        return ext in self.supported_formats['animated']
    
    def _load_static_texture(self, texture_path, width, height, tile_mode='stretch'):
        """
        Load and process static texture.
        
        Args:
            texture_path (str): Path to texture file
            width (int): Target width
            height (int): Target height
            tile_mode (str): How to handle texture sizing ('stretch', 'tile', 'fit')
            
        Returns:
            pygame.Surface: Processed texture surface
        """
        try:
            # Load the image
            original_surface = pygame.image.load(texture_path).convert_alpha()
            orig_width, orig_height = original_surface.get_size()
            
            if tile_mode == 'stretch':
                # Stretch texture to exact dimensions
                return pygame.transform.scale(original_surface, (width, height))
            
            elif tile_mode == 'tile':
                # Tile texture to fill dimensions
                texture_surface = pygame.Surface((width, height), pygame.SRCALPHA)
                
                # Calculate how many tiles we need
                tiles_x = (width // orig_width) + 1
                tiles_y = (height // orig_height) + 1
                
                # Draw tiles
                for tx in range(tiles_x):
                    for ty in range(tiles_y):
                        x = tx * orig_width
                        y = ty * orig_height
                        
                        # Clip tile if it extends beyond boundaries
                        if x < width and y < height:
                            # Calculate the portion of the tile to draw
                            tile_width = min(orig_width, width - x)
                            tile_height = min(orig_height, height - y)
                            
                            if tile_width > 0 and tile_height > 0:
                                tile_rect = pygame.Rect(0, 0, tile_width, tile_height)
                                texture_surface.blit(original_surface, (x, y), tile_rect)
                
                return texture_surface
            
            elif tile_mode == 'fit':
                # Scale texture to fit while maintaining aspect ratio
                scale_x = width / orig_width
                scale_y = height / orig_height
                scale = min(scale_x, scale_y)
                
                new_width = int(orig_width * scale)
                new_height = int(orig_height * scale)
                
                scaled_surface = pygame.transform.scale(original_surface, (new_width, new_height))
                
                # Center the scaled texture
                texture_surface = pygame.Surface((width, height), pygame.SRCALPHA)
                x_offset = (width - new_width) // 2
                y_offset = (height - new_height) // 2
                texture_surface.blit(scaled_surface, (x_offset, y_offset))
                
                return texture_surface
            
            else:
                # Default to stretch
                return pygame.transform.scale(original_surface, (width, height))
                
        except Exception as e:
            print(f"Error loading static texture {texture_path}: {e}")
            return self._create_error_texture(width, height)
    
    def _create_error_texture(self, width, height):
        """
        Create an error texture when loading fails.
        
        Args:
            width (int): Texture width
            height (int): Texture height
            
        Returns:
            pygame.Surface: Error texture surface
        """
        texture = pygame.Surface((width, height), pygame.SRCALPHA)
        
        # Create checkerboard pattern
        tile_size = min(width // 8, height // 8, 16)
        if tile_size < 4:
            tile_size = 4
        
        for x in range(0, width, tile_size):
            for y in range(0, height, tile_size):
                # Alternate colors for checkerboard
                if (x // tile_size + y // tile_size) % 2 == 0:
                    color = (255, 0, 255, 180)  # Magenta
                else:
                    color = (128, 0, 128, 180)  # Dark magenta
                
                rect = pygame.Rect(x, y, 
                                 min(tile_size, width - x), 
                                 min(tile_size, height - y))
                pygame.draw.rect(texture, color, rect)
        
        # Draw X to indicate error
        pygame.draw.line(texture, (255, 255, 255), (0, 0), (width, height), 2)
        pygame.draw.line(texture, (255, 255, 255), (width, 0), (0, height), 2)
        
        return texture
    
    def get_texture(self, texture_path, width, height, tile_mode='stretch'):
        """
        Get texture surface (static or current frame of animated).
        
        Args:
            texture_path (str): Path to texture file
            width (int): Target width
            height (int): Target height
            tile_mode (str): Texture tiling mode ('stretch', 'tile', 'fit')
            
        Returns:
            pygame.Surface: Texture surface ready for use
        """
        if not texture_path or not os.path.exists(texture_path):
            return self._create_error_texture(width, height)
        
        with self.texture_lock:
            if self._is_animated_texture(texture_path):
                # Handle animated texture
                if texture_path not in self.animated_textures:
                    self.animated_textures[texture_path] = AnimatedTexture(texture_path)
                
                animated_texture = self.animated_textures[texture_path]
                current_frame = animated_texture.get_current_frame()
                
                if current_frame:
                    # Apply the same processing as static textures
                    frame_width, frame_height = current_frame.get_size()
                    
                    if tile_mode == 'stretch':
                        return pygame.transform.scale(current_frame, (width, height))
                    elif tile_mode == 'tile':
                        return self._tile_surface(current_frame, width, height)
                    elif tile_mode == 'fit':
                        return self._fit_surface(current_frame, width, height)
                    else:
                        return pygame.transform.scale(current_frame, (width, height))
                else:
                    return self._create_error_texture(width, height)
            
            else:
                # Handle static texture
                cache_key = self._get_cache_key(texture_path, width, height, tile_mode)
                
                if cache_key not in self.static_textures:
                    self.static_textures[cache_key] = self._load_static_texture(
                        texture_path, width, height, tile_mode
                    )
                
                return self.static_textures[cache_key]
    
    def _tile_surface(self, surface, width, height):
        """Helper method to tile a surface to fill dimensions."""
        orig_width, orig_height = surface.get_size()
        texture_surface = pygame.Surface((width, height), pygame.SRCALPHA)
        
        tiles_x = (width // orig_width) + 1
        tiles_y = (height // orig_height) + 1
        
        for tx in range(tiles_x):
            for ty in range(tiles_y):
                x = tx * orig_width
                y = ty * orig_height
                
                if x < width and y < height:
                    tile_width = min(orig_width, width - x)
                    tile_height = min(orig_height, height - y)
                    
                    if tile_width > 0 and tile_height > 0:
                        tile_rect = pygame.Rect(0, 0, tile_width, tile_height)
                        texture_surface.blit(surface, (x, y), tile_rect)
        
        return texture_surface
    
    def _fit_surface(self, surface, width, height):
        """Helper method to fit surface while maintaining aspect ratio."""
        orig_width, orig_height = surface.get_size()
        scale_x = width / orig_width
        scale_y = height / orig_height
        scale = min(scale_x, scale_y)
        
        new_width = int(orig_width * scale)
        new_height = int(orig_height * scale)
        
        scaled_surface = pygame.transform.scale(surface, (new_width, new_height))
        texture_surface = pygame.Surface((width, height), pygame.SRCALPHA)
        
        x_offset = (width - new_width) // 2
        y_offset = (height - new_height) // 2
        texture_surface.blit(scaled_surface, (x_offset, y_offset))
        
        return texture_surface
    
    def apply_texture_to_surface(self, target_surface, texture_path, tile_mode='stretch', opacity=1.0):
        """
        Apply texture to an existing surface.
        
        Args:
            target_surface (pygame.Surface): Surface to apply texture to
            texture_path (str): Path to texture file
            tile_mode (str): Texture tiling mode
            opacity (float): Texture opacity (0.0 to 1.0)
            
        Returns:
            pygame.Surface: Surface with texture applied
        """
        if not texture_path:
            return target_surface
        
        width, height = target_surface.get_size()
        texture_surface = self.get_texture(texture_path, width, height, tile_mode)
        
        if opacity < 1.0:
            # Apply opacity to texture
            alpha_value = int(255 * opacity)
            texture_surface.set_alpha(alpha_value)
        
        # Create result surface and blend texture
        result_surface = target_surface.copy()
        result_surface.blit(texture_surface, (0, 0), special_flags=pygame.BLEND_ALPHA_SDL2)
        
        return result_surface
    
    def create_textured_cone_surface(self, radius, angle, texture_path, tile_mode='stretch', opacity=1.0):
        """
        Create a textured cone surface.
        
        Args:
            radius (int): Cone radius
            angle (float): Cone angle in radians
            texture_path (str): Path to texture file
            tile_mode (str): Texture tiling mode
            opacity (float): Texture opacity
            
        Returns:
            pygame.Surface: Textured cone surface
        """
        # Create cone surface
        surface_size = radius * 2 + 10
        cone_surface = pygame.Surface((surface_size, surface_size), pygame.SRCALPHA)
        
        # Get texture
        texture_surface = self.get_texture(texture_path, surface_size, surface_size, tile_mode)
        
        if opacity < 1.0:
            alpha_value = int(255 * opacity)
            texture_surface.set_alpha(alpha_value)
        
        # Create cone mask
        mask_surface = pygame.Surface((surface_size, surface_size), pygame.SRCALPHA)
        center = surface_size // 2
        
        # Generate cone points
        points = [(center, center)]  # Start at center
        steps = max(8, int(math.degrees(angle)))
        start_angle = -angle / 2
        end_angle = angle / 2
        
        for i in range(steps + 1):
            current_angle = start_angle + (end_angle - start_angle) * i / steps
            px = center + radius * math.cos(current_angle)
            py = center + radius * math.sin(current_angle)
            points.append((px, py))
        
        # Draw cone shape on mask
        pygame.draw.polygon(mask_surface, (255, 255, 255, 255), points)
        
        # Apply mask to texture
        texture_surface.blit(mask_surface, (0, 0), special_flags=pygame.BLEND_RGBA_MULT)
        
        return texture_surface
    
    def preload_texture(self, texture_path, sizes=None, tile_modes=None):
        """
        Preload texture in common sizes for better performance.
        
        Args:
            texture_path (str): Path to texture file
            sizes (list): List of (width, height) tuples to preload
            tile_modes (list): List of tile modes to preload
        """
        if not sizes:
            sizes = [(64, 64), (128, 128), (256, 256)]
        
        if not tile_modes:
            tile_modes = ['stretch', 'tile']
        
        print(f"Preloading texture: {os.path.basename(texture_path)}")
        
        for width, height in sizes:
            for tile_mode in tile_modes:
                self.get_texture(texture_path, width, height, tile_mode)
    
    def clear_cache(self):
        """Clear all cached textures."""
        with self.texture_lock:
            self.static_textures.clear()
            
            # Stop animated textures
            for animated_texture in self.animated_textures.values():
                animated_texture.pause()
            self.animated_textures.clear()
        
        print("🗑️  Texture cache cleared")
    
    def get_cache_stats(self):
        """
        Get texture cache statistics.
        
        Returns:
            dict: Cache statistics
        """
        with self.texture_lock:
            return {
                'static_textures': len(self.static_textures),
                'animated_textures': len(self.animated_textures),
                'total_cached': len(self.static_textures) + len(self.animated_textures),
                'supported_formats': self.supported_formats
            }
    
    def cleanup(self):
        """Clean up texture manager resources."""
        with self.texture_lock:
            static_count = len(self.static_textures)
            animated_count = len(self.animated_textures)
            
            self.static_textures.clear()
            
            for animated_texture in self.animated_textures.values():
                animated_texture.pause()
            self.animated_textures.clear()
        
        print(f"✓ Texture manager cleanup complete ({static_count} static, {animated_count} animated)")


def validate_texture_config(texture_config):
    """
    Validate texture configuration.
    
    Args:
        texture_config (dict): Texture configuration to validate
        
    Returns:
        list: List of validation errors (empty if valid)
    """
    errors = []
    
    if not isinstance(texture_config, dict):
        errors.append("Texture config must be a dictionary")
        return errors
    
    # Check required fields
    if 'src' not in texture_config:
        errors.append("Texture missing required 'src' field")
    elif not os.path.exists(texture_config['src']):
        errors.append(f"Texture file not found: {texture_config['src']}")
    
    # Validate tile mode
    valid_tile_modes = ['stretch', 'tile', 'fit']
    tile_mode = texture_config.get('tileMode', 'stretch')
    if tile_mode not in valid_tile_modes:
        errors.append(f"Invalid tile mode: {tile_mode}. Valid modes: {valid_tile_modes}")
    
    # Validate opacity
    opacity = texture_config.get('opacity', 1.0)
    try:
        opacity = float(opacity)
        if opacity < 0.0 or opacity > 1.0:
            errors.append("Texture opacity must be between 0.0 and 1.0")
    except (ValueError, TypeError):
        errors.append("Texture opacity must be a number")
    
    return errors


def create_texture_template():
    """
    Create a template texture configuration.
    
    Returns:
        dict: Template texture configuration
    """
    return {
        "src": "/path/to/texture.png",
        "tileMode": "stretch",  # 'stretch', 'tile', 'fit'
        "opacity": 1.0
    }