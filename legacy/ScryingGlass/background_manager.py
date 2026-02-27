#!/usr/bin/env python3
"""
Background Manager Module
Handles background video and image rendering for the display engine.
Enhanced with portrait-to-landscape rotation and aspect ratio preservation.
"""
import os
import pygame
import numpy as np
from video_players import VideoPlayer


class BackgroundManager:
    """
    Manages background video and image rendering with aspect ratio preservation.
    """
    
    def __init__(self, window_width, window_height):
        """
        Initialize background manager.
        
        Args:
            window_width (int): Window width in pixels
            window_height (int): Window height in pixels
        """
        self.window_width = window_width
        self.window_height = window_height
        self.background_video = None
        self.background_surface = None
        self.reload_requested = False
        self.force_landscape = True  # Force portrait content to landscape
        self.preserve_aspect_ratio = True  # NEW: Preserve aspect ratio by default
        self.background_color = (0, 0, 0)  # Color for letterbox/pillarbox bars
    
    def _is_portrait(self, width, height):
        """
        Check if content is in portrait orientation (taller than wide).
        
        Args:
            width (int): Content width
            height (int): Content height
            
        Returns:
            bool: True if portrait (height > width), False if landscape
        """
        return height > width
    
    def _calculate_aspect_ratio_fit(self, content_width, content_height, target_width, target_height):
        """
        Calculate dimensions to fit content within target while preserving aspect ratio.
        
        Args:
            content_width (int): Original content width
            content_height (int): Original content height
            target_width (int): Target container width
            target_height (int): Target container height
            
        Returns:
            tuple: (scaled_width, scaled_height, x_offset, y_offset)
        """
        # Calculate scaling factors for both dimensions
        scale_x = target_width / content_width
        scale_y = target_height / content_height
        
        # Use the smaller scale to fit entirely within target
        scale = min(scale_x, scale_y)
        
        # Calculate new dimensions
        new_width = int(content_width * scale)
        new_height = int(content_height * scale)
        
        # Calculate centering offsets (letterbox/pillarbox)
        x_offset = (target_width - new_width) // 2
        y_offset = (target_height - new_height) // 2
        
        return new_width, new_height, x_offset, y_offset
    
    def _rotate_surface_to_landscape(self, surface):
        """
        Rotate a pygame surface 90 degrees clockwise to convert from portrait to landscape.
        
        Args:
            surface (pygame.Surface): Surface to rotate
            
        Returns:
            pygame.Surface: Rotated surface in landscape orientation
        """
        return pygame.transform.rotate(surface, -90)  # -90 = clockwise rotation
    
    def _rotate_frame_to_landscape(self, frame):
        """
        Rotate a numpy frame array 90 degrees to convert from portrait to landscape.
        
        Args:
            frame (numpy.ndarray): Frame array to rotate
            
        Returns:
            numpy.ndarray: Rotated frame in landscape orientation
        """
        # Rotate the frame 90 degrees clockwise: (H, W, C) -> (W, H, C)
        return np.rot90(frame, k=-1)  # k=-1 for clockwise rotation
    
    def init_background(self, config):
        """
        Initialize background video or image from configuration with portrait handling
        and aspect ratio preservation.
        
        Args:
            config (dict): Configuration dictionary containing background settings
        """
        if 'background' in config and 'src' in config['background']:
            bg_path = config['background']['src']
            
            # Check for aspect ratio preservation setting in config
            self.preserve_aspect_ratio = config['background'].get('preserveAspectRatio', True)
            
            # Get background color for letterbox/pillarbox
            bg_color_str = config['background'].get('backgroundColor', '#000000')
            self.background_color = self._parse_background_color(bg_color_str)
            
            # Updated to include WebM support
            if bg_path.endswith(('.mp4', '.avi', '.mov', '.mkv', '.webm')):
                if os.path.exists(bg_path):
                    print(f"Loading video background: {bg_path}")
                    self.background_video = VideoPlayer(bg_path)
                    self.background_video.start()
                    
                    # Check if video is portrait and log the rotation plan
                    if hasattr(self.background_video, 'cap') and self.background_video.cap.isOpened():
                        video_width = int(self.background_video.cap.get(3))  # CV_CAP_PROP_FRAME_WIDTH
                        video_height = int(self.background_video.cap.get(4))  # CV_CAP_PROP_FRAME_HEIGHT
                        
                        if self.force_landscape and self._is_portrait(video_width, video_height):
                            print(f"  📱➡️🖥️  Portrait video detected ({video_width}x{video_height}) - will rotate to landscape")
                            # After rotation, dimensions swap
                            display_width, display_height = video_height, video_width
                        else:
                            print(f"  🖥️  Landscape video ({video_width}x{video_height})")
                            display_width, display_height = video_width, video_height
                        
                        # Show aspect ratio preservation info
                        if self.preserve_aspect_ratio:
                            scale_w, scale_h, offset_x, offset_y = self._calculate_aspect_ratio_fit(
                                display_width, display_height, self.window_width, self.window_height
                            )
                            print(f"  📐 Aspect ratio preserved: {display_width}x{display_height} → {scale_w}x{scale_h}")
                            if offset_x > 0:
                                print(f"     Pillarbox: {offset_x}px on each side")
                            if offset_y > 0:
                                print(f"     Letterbox: {offset_y}px top and bottom")
                        else:
                            print(f"  ⚠️  Video will be stretched to {self.window_width}x{self.window_height}")
                else:
                    print(f"Video file not found: {bg_path}")
            else:
                # Load as image
                if os.path.exists(bg_path):
                    original_surface = pygame.image.load(bg_path)
                    orig_width, orig_height = original_surface.get_size()
                    
                    # Check if image is portrait and should be rotated
                    if self.force_landscape and self._is_portrait(orig_width, orig_height):
                        print(f"  📱➡️🖥️  Portrait image detected ({orig_width}x{orig_height}) - rotating to landscape")
                        rotated_surface = self._rotate_surface_to_landscape(original_surface)
                        orig_width, orig_height = rotated_surface.get_size()
                        original_surface = rotated_surface
                    else:
                        print(f"  🖥️  Landscape image ({orig_width}x{orig_height})")
                    
                    # Apply aspect ratio preservation or stretching
                    if self.preserve_aspect_ratio:
                        scale_w, scale_h, offset_x, offset_y = self._calculate_aspect_ratio_fit(
                            orig_width, orig_height, self.window_width, self.window_height
                        )
                        
                        # Create surface with background color for letterbox/pillarbox
                        self.background_surface = pygame.Surface((self.window_width, self.window_height))
                        self.background_surface.fill(self.background_color)
                        
                        # Scale and center the image
                        scaled_surface = pygame.transform.scale(original_surface, (scale_w, scale_h))
                        self.background_surface.blit(scaled_surface, (offset_x, offset_y))
                        
                        print(f"  📐 Aspect ratio preserved: {orig_width}x{orig_height} → {scale_w}x{scale_h}")
                        if offset_x > 0:
                            print(f"     Pillarbox: {offset_x}px on each side")
                        if offset_y > 0:
                            print(f"     Letterbox: {offset_y}px top and bottom")
                    else:
                        # Stretch to fill entire window
                        self.background_surface = pygame.transform.scale(
                            original_surface, (self.window_width, self.window_height))
                        print(f"  ⚠️  Image stretched to {self.window_width}x{self.window_height}")
                    
                    print(f"Loaded background image: {bg_path}")
                else:
                    print(f"Background file not found: {bg_path}")
        else:
            print("No background specified")
    
    def _parse_background_color(self, color_str):
        """
        Parse background color string to RGB tuple.
        
        Args:
            color_str (str): Color in hex format (#RRGGBB) or named color
            
        Returns:
            tuple: (R, G, B) color tuple
        """
        if color_str.startswith('#'):
            hex_color = color_str[1:]
            if len(hex_color) == 6:
                r = int(hex_color[0:2], 16)
                g = int(hex_color[2:4], 16)
                b = int(hex_color[4:6], 16)
                return (r, g, b)
        
        # Named colors
        color_map = {
            'black': (0, 0, 0),
            'white': (255, 255, 255),
            'gray': (128, 128, 128),
            'grey': (128, 128, 128)
        }
        return color_map.get(color_str.lower(), (0, 0, 0))
    
    def draw_background(self, screen):
        """
        Draw the background (video or image) to the screen with aspect ratio preservation.
        
        Args:
            screen (pygame.Surface): The pygame screen surface to draw on
        """
        if self.background_video:
            frame = self.background_video.get_frame()
            if frame is not None:
                # Check if frame is portrait and should be rotated
                frame_height, frame_width = frame.shape[:2]
                
                if self.force_landscape and self._is_portrait(frame_width, frame_height):
                    # Rotate portrait frame to landscape
                    frame = self._rotate_frame_to_landscape(frame)
                    frame_height, frame_width = frame.shape[:2]  # Update dimensions after rotation
                
                # Convert numpy array to pygame surface
                frame = np.rot90(frame)
                frame = np.flipud(frame)
                surface = pygame.surfarray.make_surface(frame)
                
                # Apply aspect ratio preservation or stretch
                if self.preserve_aspect_ratio:
                    # Fill screen with background color first
                    screen.fill(self.background_color)
                    
                    # Calculate fitted dimensions
                    scale_w, scale_h, offset_x, offset_y = self._calculate_aspect_ratio_fit(
                        frame_width, frame_height, self.window_width, self.window_height
                    )
                    
                    # Scale and center the video frame
                    scaled_surface = pygame.transform.scale(surface, (scale_w, scale_h))
                    screen.blit(scaled_surface, (offset_x, offset_y))
                else:
                    # Stretch to fill entire window
                    surface = pygame.transform.scale(surface, (self.window_width, self.window_height))
                    screen.blit(surface, (0, 0))
            else:
                screen.fill(self.background_color)  # Fallback
        elif self.background_surface:
            screen.blit(self.background_surface, (0, 0))
        else:
            screen.fill((0, 0, 0))  # Black background
    
    def set_force_landscape(self, enabled):
        """
        Enable or disable automatic portrait-to-landscape rotation.
        
        Args:
            enabled (bool): Whether to force portrait content to landscape
        """
        self.force_landscape = enabled
        print(f"Portrait-to-landscape rotation: {'ENABLED' if enabled else 'DISABLED'}")
        
        # If we're changing this setting and have content loaded, request a reload
        if self.background_video or self.background_surface:
            self.reload_requested = True
    
    def set_preserve_aspect_ratio(self, enabled):
        """
        Enable or disable aspect ratio preservation.
        
        Args:
            enabled (bool): Whether to preserve aspect ratio (True) or stretch (False)
        """
        self.preserve_aspect_ratio = enabled
        print(f"Aspect ratio preservation: {'ENABLED' if enabled else 'DISABLED (stretch)'}")
        
        # Request reload to apply new setting
        if self.background_video or self.background_surface:
            self.reload_requested = True
    
    def request_reload(self):
        """Request a background reload on the next update cycle."""
        self.reload_requested = True
    
    def handle_background_reload(self, config):
        """
        Handle background video/image reload when configuration changes.
        
        Args:
            config (dict): New configuration dictionary
        """
        if not self.reload_requested:
            return
        
        # Stop existing background video
        if self.background_video:
            self.background_video.stop()
            self.background_video = None
        
        # Clear background surface
        self.background_surface = None
        
        # Reload background
        self.init_background(config)
        self.reload_requested = False
    
    def check_background_change(self, old_config, new_config):
        """
        Check if background source or settings changed between configurations.
        
        Args:
            old_config (dict): Previous configuration
            new_config (dict): New configuration
            
        Returns:
            bool: True if background needs reloading
        """
        old_background = old_config.get('background', {}) if old_config else {}
        new_background = new_config.get('background', {})
        
        old_src = old_background.get('src')
        new_src = new_background.get('src')
        
        old_force_landscape = old_background.get('forceLandscape', True)
        new_force_landscape = new_background.get('forceLandscape', True)
        
        old_preserve_aspect = old_background.get('preserveAspectRatio', True)
        new_preserve_aspect = new_background.get('preserveAspectRatio', True)
        
        old_bg_color = old_background.get('backgroundColor', '#000000')
        new_bg_color = new_background.get('backgroundColor', '#000000')
        
        source_changed = old_src != new_src
        rotation_changed = old_force_landscape != new_force_landscape
        aspect_changed = old_preserve_aspect != new_preserve_aspect
        color_changed = old_bg_color != new_bg_color
        
        # Update internal settings if they changed
        if rotation_changed:
            self.force_landscape = new_force_landscape
            print(f"Background rotation setting updated: {'ENABLED' if new_force_landscape else 'DISABLED'}")
        
        if aspect_changed:
            self.preserve_aspect_ratio = new_preserve_aspect
            print(f"Aspect ratio preservation updated: {'ENABLED' if new_preserve_aspect else 'DISABLED'}")
        
        if color_changed:
            self.background_color = self._parse_background_color(new_bg_color)
            print(f"Background color updated: {new_bg_color}")
        
        return source_changed or rotation_changed or aspect_changed or color_changed
    
    def get_background_info(self):
        """
        Get information about the current background and settings.
        
        Returns:
            dict: Background information including aspect ratio settings
        """
        info = {
            'has_video': self.background_video is not None,
            'has_image': self.background_surface is not None,
            'force_landscape': self.force_landscape,
            'preserve_aspect_ratio': self.preserve_aspect_ratio,
            'background_color': self.background_color,
            'window_size': (self.window_width, self.window_height)
        }
        
        if self.background_video and hasattr(self.background_video, 'cap') and self.background_video.cap.isOpened():
            video_width = int(self.background_video.cap.get(3))
            video_height = int(self.background_video.cap.get(4))
            
            is_portrait = self._is_portrait(video_width, video_height)
            will_rotate = self.force_landscape and is_portrait
            
            # Calculate effective dimensions after rotation
            if will_rotate:
                effective_width, effective_height = video_height, video_width
            else:
                effective_width, effective_height = video_width, video_height
            
            # Calculate scaling info
            if self.preserve_aspect_ratio:
                scale_w, scale_h, offset_x, offset_y = self._calculate_aspect_ratio_fit(
                    effective_width, effective_height, self.window_width, self.window_height
                )
                scaling_info = {
                    'scaled_size': (scale_w, scale_h),
                    'offset': (offset_x, offset_y),
                    'letterbox_top_bottom': offset_y if offset_y > 0 else 0,
                    'pillarbox_left_right': offset_x if offset_x > 0 else 0
                }
            else:
                scaling_info = {
                    'scaled_size': (self.window_width, self.window_height),
                    'offset': (0, 0),
                    'stretched': True
                }
            
            info['video_info'] = {
                'original_size': (video_width, video_height),
                'is_portrait': is_portrait,
                'will_rotate': will_rotate,
                'effective_size': (effective_width, effective_height),
                'fps': self.background_video.fps,
                'scaling': scaling_info
            }
        
        if self.background_surface:
            surface_width, surface_height = self.background_surface.get_size()
            info['image_info'] = {
                'surface_size': (surface_width, surface_height),
                'matches_window': (surface_width == self.window_width and surface_height == self.window_height)
            }
        
        return info
    
    def cleanup(self):
        """Clean up background resources."""
        if self.background_video:
            try:
                # Just signal to stop, don't wait for resource cleanup
                self.background_video.playing = False
                if hasattr(self.background_video, 'stop_event'):
                    self.background_video.stop_event.set()
            except Exception:
                pass
            self.background_video = None
        self.background_surface = None
        print("✓ Background resources cleaned up")