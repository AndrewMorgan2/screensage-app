#!/usr/bin/env python3
"""
Enhanced Media Elements Renderer Module for Display Engine

This module handles rendering of complex media elements including GIFs, videos,
and text with full typography support and rotation capabilities.

Classes:
    MediaElementRenderer: Enhanced renderer with rotation support for all element types
"""

import math
import pygame
import os
import time
from threading import Lock
from gif_player import GifPlayer
from video_players import VideoElementPlayer
from basic_elements import BasicElementRenderer
from screen_relative import ScreenRelativeHelper

# OpenGL support for hardware-accelerated transparent videos
try:
    from gl_video_player import GLVideoPlayer
    GL_VIDEO_AVAILABLE = True
except ImportError:
    GL_VIDEO_AVAILABLE = False


class MediaElementRenderer:
    """
    Enhanced media element renderer with rotation support.
    
    Handles rendering of animated GIFs, video elements, and text with full
    typography support and rotation capabilities. Manages media lifecycle 
    and text formatting with transparent backgrounds.
    """
    
    def __init__(self, screen, gl_context=None, gl_video_renderer=None):
        """
        Initialize the media element renderer.

        Args:
            screen (pygame.Surface): The pygame display surface to draw on
            gl_context (moderngl.Context, optional): OpenGL context for hardware-accelerated video
            gl_video_renderer (GLVideoRenderer, optional): OpenGL video renderer
        """
        self.screen = screen
        self.gif_players = {}  # Store GIF players by element ID
        self.video_players = {}  # Store video element players by element ID (pygame-based)
        self.gl_video_players = {}  # Store GL video players by element ID (OpenGL-based)
        self.basic_renderer = BasicElementRenderer(screen)  # For basic elements
        self.screen_helper = ScreenRelativeHelper(screen.get_width(), screen.get_height())

        # OpenGL support
        self.gl_context = gl_context
        self.gl_video_renderer = gl_video_renderer
        self.use_gl_video = (gl_context is not None and
                             gl_video_renderer is not None and
                             GL_VIDEO_AVAILABLE)
    
    def parse_color(self, color_str, default_alpha=255):
        """Parse color string to pygame color tuple."""
        return self.basic_renderer.parse_color(color_str, default_alpha)
    
    def _rotate_surface_transparent(self, surface, angle):
        """
        Rotate a surface with transparent background instead of black.
        
        Args:
            surface (pygame.Surface): Surface to rotate
            angle (float): Rotation angle in degrees
            
        Returns:
            pygame.Surface: Rotated surface with transparent background
        """
        if angle == 0:
            return surface
            
        # Ensure surface has alpha channel for transparency
        if not surface.get_flags() & pygame.SRCALPHA:
            surface = surface.convert_alpha()
        
        # Rotate the surface (automatically uses transparent background)
        return pygame.transform.rotate(surface, angle)
    
    def _calculate_rotated_position(self, x, y, original_size, rotated_size, center_anchor=True):
        """
        Calculate position adjustment for rotated elements.
        
        Args:
            x, y (int): Original position
            original_size (tuple): (width, height) of original surface
            rotated_size (tuple): (width, height) of rotated surface
            center_anchor (bool): If True, maintain center position; if False, maintain top-left
            
        Returns:
            tuple: (adjusted_x, adjusted_y) for positioning
        """
        orig_w, orig_h = original_size
        rot_w, rot_h = rotated_size
        
        if center_anchor:
            # Maintain center position
            offset_x = (rot_w - orig_w) // 2
            offset_y = (rot_h - orig_h) // 2
            return x - offset_x, y - offset_y
        else:
            # Top-left positioning
            return x, y
    
    def draw_gif(self, element):
        """
        Draw an animated GIF element with rotation support and live dimension updating.
        
        Args:
            element (dict): GIF element configuration with rotation support
                - rotation: Rotation angle in degrees (optional)
        """
        if element.get('invisible', False):
            return
            
        element_id = element.get('id', 'unknown')
        gif_src = element.get('src')
        
        if not gif_src:
            print(f"Warning: GIF element {element_id} has no src")
            return
        
        # Use screen helper to handle numeric or percentage-based coordinates
        x = self.screen_helper.get_x(element.get('x', 0))
        y = self.screen_helper.get_y(element.get('y', 0))

        width = element.get('width')
        height = element.get('height')

        if width is not None:
            width = self.screen_helper.get_x(width)
        if height is not None:
            height = self.screen_helper.get_y(height)
            
        rotation = element.get('rotation', 0)
        
        # Check if GIF player needs recreation due to dimension or source changes
        needs_recreation = False
        if element_id in self.gif_players:
            existing_player = self.gif_players[element_id]
            if (existing_player.width != width or 
                existing_player.height != height or
                existing_player.gif_path != gif_src):
                # Dimensions or source changed, recreate player
                existing_player.stop()
                del self.gif_players[element_id]
                needs_recreation = True
                print(f"🔄 GIF dimensions/source changed: {element_id}")
        else:
            needs_recreation = True
        
        # Create new GIF player if needed
        if needs_recreation:
            if os.path.exists(gif_src):
                self.gif_players[element_id] = GifPlayer(gif_src, width, height)
            else:
                print(f"GIF file not found: {gif_src}")
                return
        
        # Get current frame
        gif_player = self.gif_players[element_id]
        current_frame = gif_player.get_current_frame()
        
        if current_frame:
            if rotation == 0:
                # No rotation, blit directly
                self.screen.blit(current_frame, (x, y))
            else:
                # Rotate the frame
                rotated_frame = self._rotate_surface_transparent(current_frame, rotation)
                
                # Calculate position to maintain center
                original_size = current_frame.get_size()
                rotated_size = rotated_frame.get_size()
                center_x = x + original_size[0] // 2
                center_y = y + original_size[1] // 2
                pos_x = center_x - rotated_size[0] // 2
                pos_y = center_y - rotated_size[1] // 2
                
                # Blit the rotated frame
                self.screen.blit(rotated_frame, (pos_x, pos_y))
        
        # Draw label if present
        if 'label' in element:
            font = pygame.font.Font(None, 24)
            text = font.render(element['label'], True, (255, 255, 255))
            # Position label below the GIF (accounting for rotation)
            if rotation != 0 and current_frame:
                # Use expanded bounds for rotated elements
                rotated_size = self._rotate_surface_transparent(current_frame, rotation).get_size()
                label_y = y + rotated_size[1] + 5
            else:
                label_y = y + (height or current_frame.get_height() if current_frame else 100) + 5
            
            text_rect = text.get_rect(center=(x + (width or current_frame.get_width() if current_frame else 100) // 2, label_y))
            self.screen.blit(text, text_rect)
    
    def draw_image(self, element):
        """
        Draw a static image element with rotation support, caching, and opacity.
        
        Args:
            element (dict): Image element configuration
                - id: Unique identifier for caching
                - src: Path to image file
                - x, y: Position coordinates
                - width, height: Optional dimensions (preserves aspect ratio if only one specified)
                - rotation: Rotation angle in degrees (optional)
                - opacity: Alpha transparency 0-100 or 0.0-1.0 (optional, default 100)
                - label: Optional text label
                - invisible: Hide/show flag
        """
        if element.get('invisible', False):
            return
            
        element_id = element.get('id', 'unknown')
        image_src = element.get('src')
        
        if not image_src:
            print(f"Warning: Image element {element_id} has no src")
            return
        
        if not os.path.exists(image_src):
            print(f"Image file not found: {image_src}")
            self._draw_missing_image_placeholder(element)
            return
        
        # Use screen helper to handle numeric or percentage-based coordinates
        x = self.screen_helper.get_x(element.get('x', 0))
        y = self.screen_helper.get_y(element.get('y', 0))

        width = element.get('width')
        height = element.get('height')

        if width is not None:
            width = self.screen_helper.get_x(width)
        if height is not None:
            height = self.screen_helper.get_y(height)
        
        rotation = element.get('rotation', 0)
        
        # Parse opacity - support both 0-100 and 0.0-1.0 ranges
        opacity = element.get('opacity', 100)
        if opacity > 1.0:
            # Assume 0-100 range, convert to 0.0-1.0
            opacity = opacity / 100.0
        opacity = max(0.0, min(1.0, opacity))  # Clamp to valid range
        
        # Initialize image cache if it doesn't exist
        if not hasattr(self, '_image_cache'):
            self._image_cache = {}
        
        # Create cache key based on source, dimensions, and rotation (NOT opacity)
        # We cache the base image and apply opacity at render time
        cache_key = f"{image_src}_{width}_{height}_{rotation}"
        
        # Check if we need to load/process the image
        if cache_key not in self._image_cache:
            try:
                # Load the image
                original_surface = pygame.image.load(image_src)
                
                # Get original dimensions
                orig_width, orig_height = original_surface.get_size()
                
                # Calculate target dimensions
                if width and height:
                    # Both specified - use exact dimensions
                    target_width, target_height = width, height
                elif width and not height:
                    # Width specified - maintain aspect ratio
                    target_width = width
                    target_height = int(width * orig_height / orig_width)
                elif height and not width:
                    # Height specified - maintain aspect ratio
                    target_height = height
                    target_width = int(height * orig_width / orig_height)
                else:
                    # Neither specified - use original size
                    target_width, target_height = orig_width, orig_height
                
                # Resize if needed
                if (target_width != orig_width or target_height != orig_height):
                    processed_surface = pygame.transform.scale(original_surface, (target_width, target_height))
                else:
                    processed_surface = original_surface
                
                # Convert to surface with alpha for rotation and opacity support
                processed_surface = processed_surface.convert_alpha()
                
                # Apply rotation if needed
                if rotation != 0:
                    processed_surface = self._rotate_surface_transparent(processed_surface, rotation)
                
                # Cache the processed surface
                self._image_cache[cache_key] = processed_surface
                
                print(f"🖼️ Loaded and cached image: {element_id} ({orig_width}x{orig_height} → {target_width}x{target_height})")
                
            except Exception as e:
                print(f"Error loading image {image_src}: {e}")
                self._draw_missing_image_placeholder(element)
                return
        
        # Get the cached surface
        image_surface = self._image_cache[cache_key]
        
        # Apply opacity if not fully opaque
        if opacity < 1.0:
            # Create a copy and apply alpha
            display_surface = image_surface.copy()
            alpha_value = int(255 * opacity)
            display_surface.set_alpha(alpha_value)
        else:
            # Use cached surface directly for full opacity
            display_surface = image_surface
        
        # Calculate position
        if rotation == 0:
            # No rotation - simple positioning
            self.screen.blit(display_surface, (x, y))
        else:
            # Rotated - center the image at the specified position
            surface_width, surface_height = display_surface.get_size()
            
            # Calculate original dimensions for centering
            if width and height:
                orig_center_x = x + width // 2
                orig_center_y = y + height // 2
            else:
                # Use the actual surface dimensions
                orig_center_x = x + surface_width // 2
                orig_center_y = y + surface_height // 2
            
            pos_x = orig_center_x - surface_width // 2
            pos_y = orig_center_y - surface_height // 2
            
            self.screen.blit(display_surface, (pos_x, pos_y))
        
        # Draw label if present
        if 'label' in element:
            font = pygame.font.Font(None, 24)
            text = font.render(element['label'], True, (255, 255, 255))
            
            # Position label below the image
            surface_width, surface_height = display_surface.get_size()
            if rotation != 0:
                label_y = y + surface_height + 5
            else:
                label_y = y + (height or surface_height) + 5
            
            text_rect = text.get_rect(center=(x + (width or surface_width) // 2, label_y))
            self.screen.blit(text, text_rect)
    
    def _draw_missing_image_placeholder(self, element):
        """Draw a placeholder for missing image files."""
        # Use screen helper to handle numeric or percentage-based coordinates
        x = self.screen_helper.get_x(element.get('x', 0))
        y = self.screen_helper.get_y(element.get('y', 0))

        width = element.get('width', 100)
        height = element.get('height', 100)

        if width is not None:
            width = self.screen_helper.get_x(width)
        if height is not None:
            height = self.screen_helper.get_y(height)
        rotation = element.get('rotation', 0)
        
        # Create placeholder surface
        placeholder_surface = pygame.Surface((width, height), pygame.SRCALPHA)
        
        # Draw a broken image icon
        placeholder_surface.fill((128, 128, 128, 180))  # Semi-transparent gray
        pygame.draw.rect(placeholder_surface, (255, 255, 255), (0, 0, width, height), 2)
        
        # Draw an X to indicate missing image
        pygame.draw.line(placeholder_surface, (255, 0, 0), (10, 10), (width-10, height-10), 3)
        pygame.draw.line(placeholder_surface, (255, 0, 0), (width-10, 10), (10, height-10), 3)
        
        # Draw "Missing Image" text if space allows
        if width > 80 and height > 30:
            font = pygame.font.Font(None, 20)
            text = font.render("Missing", True, (255, 255, 255))
            text_rect = text.get_rect(center=(width//2, height//2 - 10))
            placeholder_surface.blit(text, text_rect)
            
            text2 = font.render("Image", True, (255, 255, 255))
            text2_rect = text2.get_rect(center=(width//2, height//2 + 10))
            placeholder_surface.blit(text2, text2_rect)
        
        # Apply rotation if needed
        if rotation != 0:
            placeholder_surface = self._rotate_surface_transparent(placeholder_surface, rotation)
            
            # Calculate centered position
            rotated_size = placeholder_surface.get_size()
            center_x = x + width // 2
            center_y = y + height // 2
            pos_x = center_x - rotated_size[0] // 2
            pos_y = center_y - rotated_size[1] // 2
            
            self.screen.blit(placeholder_surface, (pos_x, pos_y))
        else:
            self.screen.blit(placeholder_surface, (x, y))

    def draw_video(self, element):
        """
        Draw a video element with rotation support and live dimension updating.
        Uses hardware-accelerated GL rendering for transparent WebM videos.

        Args:
            element (dict): Video element configuration with rotation support
                - rotation: Rotation angle in degrees (optional)
                - use_gl: Force GL rendering (optional, default: auto-detect WebM)
        """
        if element.get('invisible', False):
            return

        element_id = element.get('id', 'unknown')
        video_src = element.get('src')

        if not video_src:
            print(f"Warning: Video element {element_id} has no src")
            return

        # Use screen helper to handle numeric or percentage-based coordinates
        x = self.screen_helper.get_x(element.get('x', 0))
        y = self.screen_helper.get_y(element.get('y', 0))

        width = element.get('width')
        height = element.get('height')

        if width is not None:
            width = self.screen_helper.get_x(width)
        if height is not None:
            height = self.screen_helper.get_y(height)
        rotation = element.get('rotation', 0)

        # Determine if we should use GL rendering
        # Use GL for transparent WebM files if available
        is_webm = video_src.lower().endswith('.webm')
        force_gl = element.get('use_gl', False)
        use_gl_for_this_video = self.use_gl_video and (is_webm or force_gl)

        if use_gl_for_this_video and rotation == 0:
            # Use GL rendering (rotation not yet supported for GL videos)
            self._draw_video_gl(element, element_id, video_src, x, y, width, height)
        else:
            # Use pygame rendering (fallback or non-WebM)
            if use_gl_for_this_video and rotation != 0:
                print(f"Note: Rotation not supported for GL videos, using pygame for {element_id}")
            self._draw_video_pygame(element, element_id, video_src, x, y, width, height, rotation)

    def _draw_video_gl(self, element, element_id, video_src, x, y, width, height):
        """Draw video using OpenGL hardware acceleration (for transparent WebM)."""
        # Check if GL video player needs recreation
        needs_recreation = False
        if element_id in self.gl_video_players:
            existing_player = self.gl_video_players[element_id]
            if (existing_player.width != width or
                existing_player.height != height or
                existing_player.video_path != video_src):
                existing_player.stop()
                del self.gl_video_players[element_id]
                needs_recreation = True
                print(f"🔄 GL video dimensions/source changed: {element_id}")
        else:
            needs_recreation = True

        # Create new GL video player if needed
        if needs_recreation:
            if os.path.exists(video_src):
                try:
                    self.gl_video_players[element_id] = GLVideoPlayer(
                        self.gl_context,
                        video_src,
                        width,
                        height
                    )
                    self.gl_video_players[element_id].start()
                except Exception as e:
                    print(f"Error creating GL video player: {e}")
                    print(f"Falling back to pygame rendering for {element_id}")
                    # Fall back to pygame rendering
                    self._draw_video_pygame(element, element_id, video_src, x, y, width, height, 0)
                    return
            else:
                print(f"Video file not found: {video_src}")
                return

        # Render using GL (read back to pygame surface for hybrid rendering)
        video_player = self.gl_video_players[element_id]

        try:
            # Render GL texture to pygame surface (with hardware-accelerated alpha processing)
            video_surface = self.gl_video_renderer.render_video_to_pygame_surface(
                video_player, width, height
            )

            # Blit the surface to screen
            if video_surface:
                self.screen.blit(video_surface, (x, y))

        except Exception as e:
            print(f"Error rendering GL video: {e}")
            import traceback
            traceback.print_exc()

        # Draw label if present (using pygame)
        if 'label' in element:
            font = pygame.font.Font(None, 24)
            text = font.render(element['label'], True, (255, 255, 255))
            label_y = y + video_player.target_height + 5
            text_rect = text.get_rect(center=(x + video_player.target_width // 2, label_y))
            self.screen.blit(text, text_rect)

    def _draw_video_pygame(self, element, element_id, video_src, x, y, width, height, rotation):
        """Draw video using pygame software rendering (fallback)."""
        # Check if video player needs recreation due to dimension or source changes
        needs_recreation = False
        if element_id in self.video_players:
            existing_player = self.video_players[element_id]
            if (existing_player.width != width or
                existing_player.height != height or
                existing_player.video_path != video_src):
                # Dimensions or source changed, recreate player
                existing_player.stop()
                del self.video_players[element_id]
                needs_recreation = True
                print(f"🔄 Video dimensions/source changed: {element_id}")
        else:
            needs_recreation = True

        # Create new video player if needed
        if needs_recreation:
            if os.path.exists(video_src):
                self.video_players[element_id] = VideoElementPlayer(video_src, width, height)
                self.video_players[element_id].start()
            else:
                print(f"Video file not found: {video_src}")
                return

        # Get current frame
        video_player = self.video_players[element_id]
        current_frame_surface = video_player.get_current_frame_surface()

        if current_frame_surface:
            if rotation == 0:
                # No rotation, blit directly
                self.screen.blit(current_frame_surface, (x, y))
            else:
                # Rotate the frame
                rotated_frame = self._rotate_surface_transparent(current_frame_surface, rotation)

                # Calculate position to maintain center
                original_size = current_frame_surface.get_size()
                rotated_size = rotated_frame.get_size()
                center_x = x + original_size[0] // 2
                center_y = y + original_size[1] // 2
                pos_x = center_x - rotated_size[0] // 2
                pos_y = center_y - rotated_size[1] // 2

                # Blit the rotated frame
                self.screen.blit(rotated_frame, (pos_x, pos_y))

        # Draw label if present
        if 'label' in element:
            font = pygame.font.Font(None, 24)
            text = font.render(element['label'], True, (255, 255, 255))
            # Position label below the video (accounting for rotation)
            if rotation != 0:
                # Use expanded bounds for rotated elements
                expanded_height = int(video_player.target_height * 1.42)  # Approximate expansion
                label_y = y + expanded_height + 5
            else:
                label_y = y + video_player.target_height + 5

            text_rect = text.get_rect(center=(x + video_player.target_width // 2, label_y))
            self.screen.blit(text, text_rect)
    
    def draw_text(self, element):
        """
        Draw a text element with full typography options and rotation support.

        Supports relative positioning:
        - x/y can be absolute pixels (int), relative (0.0-1.0), or percentage strings ("50%")
        - size (font) can be absolute pixels, relative, percentage, or scaled ("24scaled")

        Args:
            element (dict): Text element configuration with rotation support
                - x: X coordinate (int, float 0-1, or percentage string)
                - y: Y coordinate (int, float 0-1, or percentage string)
                - size: Font size (int, float 0-1, percentage, or "24scaled")
                - rotation: Rotation angle in degrees (optional)
        """
        if element.get('invisible', False):
            return

        # Update screen dimensions in case window was resized
        self.screen_helper.update_dimensions(self.screen.get_width(), self.screen.get_height())

        # Required fields - now with relative coordinate support
        text_content = element.get('text', 'Sample Text')
        x = self.screen_helper.get_x(element.get('x', 0))
        y = self.screen_helper.get_y(element.get('y', 0))
        rotation = element.get('rotation', 0)

        # Typography options - font size can now scale with screen
        font_family = element.get('font', 'Arial')
        font_size = self.screen_helper.get_font_size(element.get('size', 24))
        font_style = element.get('style', 'normal')
        color = self.parse_color(element.get('color', '#ffffff'))[:3]
        
        # Layout options
        alignment = element.get('alignment', 'left')
        max_width = element.get('maxWidth')
        line_spacing = element.get('lineSpacing', 1.2)
        
        # Background options
        background_color = element.get('backgroundColor')
        background_padding = element.get('backgroundPadding', 5)
        
        # Border options
        border_color = element.get('borderColor')
        border_width = element.get('borderWidth', 2)
        
        # Shadow/outline options
        shadow_color = element.get('shadowColor')
        shadow_offset = element.get('shadowOffset', (2, 2))
        outline_color = element.get('outlineColor')
        outline_width = element.get('outlineWidth', 1)
        
        try:
            # Create font object
            font = self._get_font(font_family, font_size, font_style)
            
            # Handle text wrapping
            if max_width:
                lines = self._wrap_text(text_content, font, max_width)
            else:
                lines = text_content.split('\n')
            
            # Calculate text dimensions
            line_height = int(font_size * line_spacing)
            text_surfaces = []
            max_line_width = 0
            
            for line in lines:
                if line.strip():
                    # Create text with outline if specified
                    if outline_color:
                        text_surface = self._create_outlined_text(line, font, color, outline_color, outline_width)
                    else:
                        text_surface = font.render(line, True, color)
                else:
                    # Create empty surface for blank lines
                    text_surface = pygame.Surface((1, line_height), pygame.SRCALPHA)
                
                text_surfaces.append(text_surface)
                max_line_width = max(max_line_width, text_surface.get_width())
            
            total_height = len(lines) * line_height
            
            if rotation == 0:
                # No rotation, draw directly to screen
                self._draw_text_direct(x, y, text_surfaces, lines, line_height, max_line_width, 
                                     total_height, alignment, background_color, background_padding,
                                     border_color, border_width, shadow_color, shadow_offset, font)
            else:
                # Create surface for text and rotate it
                self._draw_text_rotated(x, y, rotation, text_surfaces, lines, line_height, 
                                      max_line_width, total_height, alignment, background_color, 
                                      background_padding, border_color, border_width, 
                                      shadow_color, shadow_offset, font)
            
            # Draw label if present (for debugging/identification)
            if element.get('label'):
                self._draw_text_debug_label(element, x, y, max_line_width, total_height, rotation)
                
        except Exception as e:
            print(f"Error rendering text element {element.get('id', 'unknown')}: {e}")
            self._draw_text_error_placeholder(x, y, text_content)
    
    def _draw_text_direct(self, x, y, text_surfaces, lines, line_height, max_line_width, 
                         total_height, alignment, background_color, background_padding,
                         border_color, border_width, shadow_color, shadow_offset, font):
        """Draw text directly to screen without rotation."""
        # Calculate alignment offset
        alignment_offset = self._calculate_text_alignment(alignment, max_line_width)
        
        # Draw background if specified
        if background_color:
            bg_color = self.parse_color(background_color)
            bg_rect = pygame.Rect(
                x + alignment_offset - background_padding,
                y - background_padding,
                max_line_width + (background_padding * 2),
                total_height + (background_padding * 2)
            )
            
            if len(bg_color) == 4:
                bg_surface = pygame.Surface((bg_rect.width, bg_rect.height), pygame.SRCALPHA)
                bg_surface.fill(bg_color)
                self.screen.blit(bg_surface, bg_rect)
            else:
                pygame.draw.rect(self.screen, bg_color[:3], bg_rect)
            
            # Draw border if specified
            if border_color:
                border_col = self.parse_color(border_color)[:3]
                pygame.draw.rect(self.screen, border_col, bg_rect, border_width)
        
        # Draw each line of text
        current_y = y
        for i, (line, surface) in enumerate(zip(lines, text_surfaces)):
            if line.strip():
                line_width = surface.get_width()
                
                # Calculate x position based on alignment
                if alignment == 'center':
                    line_x = x - (line_width // 2)
                elif alignment == 'right':
                    line_x = x - line_width
                else:  # left alignment
                    line_x = x
                
                # Draw shadow if specified
                if shadow_color:
                    shadow_col = self.parse_color(shadow_color)[:3]
                    shadow_surface = font.render(line, True, shadow_col)
                    shadow_x = line_x + shadow_offset[0]
                    shadow_y = current_y + shadow_offset[1]
                    self.screen.blit(shadow_surface, (shadow_x, shadow_y))
                
                # Draw the main text
                self.screen.blit(surface, (line_x, current_y))
            
            current_y += line_height
    
    def _draw_text_rotated(self, x, y, rotation, text_surfaces, lines, line_height, 
                          max_line_width, total_height, alignment, background_color, 
                          background_padding, border_color, border_width, 
                          shadow_color, shadow_offset, font):
        """Draw text on a surface and rotate it."""
        # Create surface large enough for text with padding
        padding = max(background_padding, 10)
        surface_width = max_line_width + (padding * 2)
        surface_height = total_height + (padding * 2)
        text_surface = pygame.Surface((surface_width, surface_height), pygame.SRCALPHA)
        
        # Draw background if specified
        if background_color:
            bg_color = self.parse_color(background_color)
            if len(bg_color) == 4:
                text_surface.fill(bg_color)
            else:
                text_surface.fill(bg_color[:3] + (255,))
            
            # Draw border if specified
            if border_color:
                border_col = self.parse_color(border_color)[:3]
                pygame.draw.rect(text_surface, border_col, (0, 0, surface_width, surface_height), border_width)
        
        # Draw each line of text on the surface
        current_y = padding
        for i, (line, surface) in enumerate(zip(lines, text_surfaces)):
            if line.strip():
                line_width = surface.get_width()
                
                # Calculate x position based on alignment
                if alignment == 'center':
                    line_x = padding + (max_line_width - line_width) // 2
                elif alignment == 'right':
                    line_x = padding + max_line_width - line_width
                else:  # left alignment
                    line_x = padding
                
                # Draw shadow if specified
                if shadow_color:
                    shadow_col = self.parse_color(shadow_color)[:3]
                    shadow_surface = font.render(line, True, shadow_col)
                    shadow_x = line_x + shadow_offset[0]
                    shadow_y = current_y + shadow_offset[1]
                    text_surface.blit(shadow_surface, (shadow_x, shadow_y))
                
                # Draw the main text
                text_surface.blit(surface, (line_x, current_y))
            
            current_y += line_height
        
        # Rotate the text surface
        rotated_surface = self._rotate_surface_transparent(text_surface, rotation)
        
        # Calculate position to maintain original x,y as reference point
        rotated_size = rotated_surface.get_size()
        
        # Position based on alignment for rotated text
        if alignment == 'center':
            pos_x = x - rotated_size[0] // 2
            pos_y = y - rotated_size[1] // 2
        elif alignment == 'right':
            pos_x = x - rotated_size[0]
            pos_y = y
        else:  # left alignment
            pos_x = x
            pos_y = y
        
        # Blit the rotated text
        self.screen.blit(rotated_surface, (pos_x, pos_y))
    
    def _get_font(self, font_family, font_size, font_style):
        """Get a pygame font object with the specified properties."""
        # Cache fonts to improve performance
        cache_key = f"{font_family}_{font_size}_{font_style}"
        if not hasattr(self, '_font_cache'):
            self._font_cache = {}
        
        if cache_key in self._font_cache:
            return self._font_cache[cache_key]
        
        # Try to load system font
        font = None
        
        # Handle font styles
        bold = font_style in ['bold', 'bold_italic']
        italic = font_style in ['italic', 'bold_italic']
        
        # Try different font loading methods
        try:
            # Method 1: Try system font by name
            font = pygame.font.SysFont(font_family, font_size, bold=bold, italic=italic)
        except:
            try:
                # Method 2: Try loading font file if it exists
                if os.path.exists(font_family):
                    font = pygame.font.Font(font_family, font_size)
                else:
                    # Method 3: Fall back to default font
                    font = pygame.font.Font(None, font_size)
            except:
                # Method 4: Last resort - pygame default
                font = pygame.font.Font(None, font_size)
        
        # Cache the font
        self._font_cache[cache_key] = font
        return font
    
    def _wrap_text(self, text, font, max_width):
        """Wrap text to fit within the specified width."""
        words = text.split(' ')
        lines = []
        current_line = []
        
        for word in words:
            # Handle manual line breaks
            if '\n' in word:
                word_parts = word.split('\n')
                current_line.append(word_parts[0])
                
                # Add current line and start new ones
                test_line = ' '.join(current_line)
                if font.size(test_line)[0] <= max_width:
                    lines.append(test_line)
                else:
                    # Word is too long, add previous words and start new line
                    if len(current_line) > 1:
                        lines.append(' '.join(current_line[:-1]))
                        lines.append(word_parts[0])
                    else:
                        lines.append(word_parts[0])  # Single long word
                
                # Add remaining parts as separate lines
                for part in word_parts[1:]:
                    if part:
                        lines.append(part)
                
                current_line = []
                continue
            
            # Test if adding this word exceeds width
            test_line = ' '.join(current_line + [word])
            if font.size(test_line)[0] <= max_width:
                current_line.append(word)
            else:
                # Line would be too long, wrap here
                if current_line:
                    lines.append(' '.join(current_line))
                current_line = [word]
                
                # Check if single word is too long
                if font.size(word)[0] > max_width:
                    # Break long word
                    broken_word = self._break_long_word(word, font, max_width)
                    lines.extend(broken_word[:-1])
                    current_line = [broken_word[-1]] if broken_word else []
        
        # Add remaining words
        if current_line:
            lines.append(' '.join(current_line))
        
        return lines
    
    def _break_long_word(self, word, font, max_width):
        """Break a single word that's too long to fit on one line."""
        if font.size(word)[0] <= max_width:
            return [word]
        
        fragments = []
        current_fragment = ""
        
        for char in word:
            test_fragment = current_fragment + char
            if font.size(test_fragment)[0] <= max_width:
                current_fragment = test_fragment
            else:
                if current_fragment:
                    fragments.append(current_fragment)
                current_fragment = char
        
        if current_fragment:
            fragments.append(current_fragment)
        
        return fragments
    
    def _calculate_text_alignment(self, alignment, text_width):
        """Calculate x-offset for text alignment."""
        if alignment == 'center':
            return -text_width // 2
        elif alignment == 'right':
            return -text_width
        else:  # left
            return 0
    
    def _create_outlined_text(self, text, font, text_color, outline_color, outline_width):
        """Create text with an outline effect."""
        outline_col = self.parse_color(outline_color)[:3]

        # Render the main text once to get dimensions
        text_surface = font.render(text, True, text_color)
        text_rect = text_surface.get_rect()

        # Create surface large enough for outline
        surface_width = text_rect.width + (outline_width * 2)
        surface_height = text_rect.height + (outline_width * 2)
        surface = pygame.Surface((surface_width, surface_height), pygame.SRCALPHA)

        # Draw outline by rendering text in multiple positions
        for dx in range(-outline_width, outline_width + 1):
            for dy in range(-outline_width, outline_width + 1):
                if dx != 0 or dy != 0:
                    outline_surface = font.render(text, True, outline_col)
                    surface.blit(outline_surface, (outline_width + dx, outline_width + dy))

        # Draw main text on top
        surface.blit(text_surface, (outline_width, outline_width))

        return surface

    
    def _draw_text_debug_label(self, element, x, y, width, height, rotation):
        """Draw a debug label for text elements."""
        label = element.get('label', '')
        if not label:
            return
        
        # Draw bounding box (approximate for rotated text)
        if rotation == 0:
            pygame.draw.rect(self.screen, (255, 255, 0), (x - 2, y - 2, width + 4, height + 4), 1)
        else:
            # For rotated text, draw a larger approximate box
            expanded_width = int(width * 1.42)
            expanded_height = int(height * 1.42)
            pygame.draw.rect(self.screen, (255, 255, 0), 
                           (x - expanded_width//2, y - expanded_height//2, expanded_width, expanded_height), 1)
        
        # Draw label
        label_font = pygame.font.Font(None, 16)
        label_surface = label_font.render(f"Text: {label}", True, (255, 255, 0))
        self.screen.blit(label_surface, (x, y - 20))
    
    def _draw_text_error_placeholder(self, x, y, text_content):
        """Draw an error placeholder when text rendering fails."""
        # Draw error background
        error_rect = pygame.Rect(x, y, 200, 50)
        pygame.draw.rect(self.screen, (255, 0, 0), error_rect)
        pygame.draw.rect(self.screen, (255, 255, 255), error_rect, 2)
        
        # Draw error message
        error_font = pygame.font.Font(None, 20)
        error_text = error_font.render("TEXT ERROR", True, (255, 255, 255))
        self.screen.blit(error_text, (x + 5, y + 5))
        
        # Show original text truncated
        original_truncated = (text_content[:20] + "...") if len(text_content) > 20 else text_content
        original_surface = error_font.render(original_truncated, True, (255, 255, 255))
        self.screen.blit(original_surface, (x + 5, y + 25))
    
    def _draw_unknown_element(self, element):
        """Draw a placeholder for unknown element types."""
        if element.get('invisible', False):
            return
            
        # Use screen helper to handle numeric or percentage-based coordinates
        x = self.screen_helper.get_x(element.get('x', 0))
        y = self.screen_helper.get_y(element.get('y', 0))

        rotation = element.get('rotation', 0)
        
        if rotation == 0:
            # Draw placeholder directly
            font = pygame.font.Font(None, 48)
            text = font.render('?', True, (255, 255, 0))
            
            # Draw background circle
            pygame.draw.circle(self.screen, (255, 0, 0), (x, y), 25)
            pygame.draw.circle(self.screen, (255, 255, 255), (x, y), 25, 2)
            
            # Center the question mark
            text_rect = text.get_rect(center=(x, y))
            self.screen.blit(text, text_rect)
        else:
            # Create surface and rotate it
            placeholder_surface = pygame.Surface((50, 50), pygame.SRCALPHA)
            
            # Draw on surface
            pygame.draw.circle(placeholder_surface, (255, 0, 0), (25, 25), 25)
            pygame.draw.circle(placeholder_surface, (255, 255, 255), (25, 25), 25, 2)
            
            font = pygame.font.Font(None, 48)
            text = font.render('?', True, (255, 255, 0))
            text_rect = text.get_rect(center=(25, 25))
            placeholder_surface.blit(text, text_rect)
            
            # Rotate and position
            rotated_surface = self._rotate_surface_transparent(placeholder_surface, rotation)
            rotated_size = rotated_surface.get_size()
            pos_x = x - rotated_size[0] // 2
            pos_y = y - rotated_size[1] // 2
            self.screen.blit(rotated_surface, (pos_x, pos_y))
        
        # Draw warning label
        label_font = pygame.font.Font(None, 20)
        label_text = label_font.render('Unknown Element', True, (255, 255, 0))
        label_rect = label_text.get_rect(center=(x, y + 35))
        self.screen.blit(label_text, label_rect)
    
    def get_element_bounds(self, element):
        """Get the bounding rectangle of an element, accounting for rotation."""
        element_type = element.get('type', '')
        # Use screen helper to handle numeric or percentage-based coordinates
        x = self.screen_helper.get_x(element.get('x', 0))
        y = self.screen_helper.get_y(element.get('y', 0))
        rotation = element.get('rotation', 0)
        
        # Delegate to basic renderer for basic elements
        if element_type in ['token', 'area', 'line', 'cone']:
            return self.basic_renderer.get_element_bounds(element)
        
        elif element_type in ['gif', 'video', 'image']:
            # Try to get actual dimensions from player or cache
            if element_type == 'gif' and element.get('id') in self.gif_players:
                player = self.gif_players[element.get('id')]
                width, height = player.get_dimensions()
            elif element_type == 'video' and element.get('id') in self.video_players:
                player = self.video_players[element.get('id')]
                width, height = player.target_width, player.target_height
            elif element_type == 'image':
                # For images, check cache or estimate from specified dimensions
                width = element.get('width', 100)
                height = element.get('height', 100)
                
                # Try to get actual dimensions from cache
                if hasattr(self, '_image_cache'):
                    image_src = element.get('src', '')
                    rotation = element.get('rotation', 0)
                    cache_key = f"{image_src}_{width}_{height}_{rotation}"
                    if cache_key in self._image_cache:
                        cached_surface = self._image_cache[cache_key]
                        width, height = cached_surface.get_size()
            else:
                # Fallback to specified or default dimensions
                width = element.get('width', 100)
                height = element.get('height', 100)
            
            if rotation == 0:
                return pygame.Rect(x, y, width, height)
            else:
                # Calculate rotated bounds
                angle_rad = math.radians(rotation)
                cos_a = abs(math.cos(angle_rad))
                sin_a = abs(math.sin(angle_rad))
                new_width = int(width * cos_a + height * sin_a)
                new_height = int(width * sin_a + height * cos_a)
                center_x, center_y = x + width // 2, y + height // 2
                return pygame.Rect(center_x - new_width//2, center_y - new_height//2, new_width, new_height)
            
        elif element_type == 'text':
            # Estimate text dimensions
            font_size = element.get('size', 24)
            text_content = element.get('text', 'Sample Text')
            max_width = element.get('maxWidth', len(text_content) * font_size // 2)
            
            # Rough estimation - actual bounds would require font rendering
            lines = len(text_content.split('\n'))
            if element.get('maxWidth'):
                # Account for text wrapping
                estimated_chars_per_line = max_width // (font_size // 2)
                lines = max(lines, len(text_content) // estimated_chars_per_line + 1)
            
            width = min(max_width, len(text_content) * font_size // 2)
            height = lines * int(font_size * element.get('lineSpacing', 1.2))
            
            if rotation == 0:
                return pygame.Rect(x, y, width, height)
            else:
                # Approximate rotated bounds
                angle_rad = math.radians(rotation)
                cos_a = abs(math.cos(angle_rad))
                sin_a = abs(math.sin(angle_rad))
                new_width = int(width * cos_a + height * sin_a)
                new_height = int(width * sin_a + height * cos_a)
                return pygame.Rect(x - new_width//2, y - new_height//2, new_width, new_height)
        
        # Default bounds for unknown types
        return pygame.Rect(x, y, 50, 50)
    
    def cleanup_unused_elements(self, config):
        """Clean up media players for elements that no longer exist."""
        if not config or 'elements' not in config:
            return

        # Get current element IDs
        current_gif_ids = set()
        current_video_ids = set()

        for element in config['elements']:
            if element.get('type') == 'gif' and 'id' in element:
                current_gif_ids.add(element['id'])
            elif element.get('type') == 'video' and 'id' in element:
                current_video_ids.add(element['id'])

        # Remove unused GIF players
        to_remove_gifs = []
        for gif_id in self.gif_players:
            if gif_id not in current_gif_ids:
                to_remove_gifs.append(gif_id)

        for gif_id in to_remove_gifs:
            self.gif_players[gif_id].stop()
            del self.gif_players[gif_id]
            print(f"🗑️  Removed unused GIF: {gif_id}")

        # Remove unused pygame video players
        to_remove_videos = []
        for video_id in self.video_players:
            if video_id not in current_video_ids:
                to_remove_videos.append(video_id)

        for video_id in to_remove_videos:
            self.video_players[video_id].stop()
            del self.video_players[video_id]
            print(f"🗑️  Removed unused pygame video: {video_id}")

        # Remove unused GL video players
        to_remove_gl_videos = []
        for gl_video_id in self.gl_video_players:
            if gl_video_id not in current_video_ids:
                to_remove_gl_videos.append(gl_video_id)

        for gl_video_id in to_remove_gl_videos:
            self.gl_video_players[gl_video_id].stop()
            del self.gl_video_players[gl_video_id]
            print(f"🗑️  Removed unused GL video: {gl_video_id}")
    
    def draw_elements(self, config):
        """Draw all elements from the configuration with rotation support."""
        if not config or 'elements' not in config:
            return
        
        # Clean up unused elements
        self.cleanup_unused_elements(config)
        
        # Draw each element based on its type
        for element in config['elements']:
            element_type = element.get('type', '')
            
            # Basic elements - delegate to enhanced basic renderer
            if element_type == 'token':
                self.basic_renderer.draw_token(element)
            elif element_type == 'area':
                self.basic_renderer.draw_area(element)
            elif element_type == 'line':
                self.basic_renderer.draw_line(element)
            elif element_type == 'cone':
                self.basic_renderer.draw_cone(element)
            
            # Media elements - handle with rotation support
            elif element_type == 'gif':
                self.draw_gif(element)
            elif element_type == 'video':
                self.draw_video(element)
            elif element_type == 'image':
                self.draw_image(element)
            elif element_type == 'text':
                self.draw_text(element)
            else:
                # Unknown element type - draw a placeholder
                if element_type:  # Only warn if type is specified but unknown
                    print(f"⚠️  Unknown element type: {element_type} for element {element.get('id', 'unknown')}")
                self._draw_unknown_element(element)
    
    def find_elements_at_point(self, point, config):
        """Find all elements that contain the specified point."""
        if not config or 'elements' not in config:
            return []
        
        elements_at_point = []
        px, py = point
        
        for element in config['elements']:
            if element.get('invisible', False):
                continue
                
            bounds = self.get_element_bounds(element)
            if bounds.collidepoint(px, py):
                element_id = element.get('id', f"unnamed_{element.get('type', 'unknown')}")
                elements_at_point.append(element_id)
        
        return elements_at_point
    
    def get_element_info(self, element_id, config):
        """Get detailed information about a specific element."""
        if not config or 'elements' not in config:
            return None
        
        for element in config['elements']:
            if element.get('id') == element_id:
                info = element.copy()
                
                # Add runtime information
                info['bounds'] = self.get_element_bounds(element)
                
                # Add player status for media elements
                element_type = element.get('type')
                if element_type == 'gif' and element_id in self.gif_players:
                    player = self.gif_players[element_id]
                    info['gif_info'] = {
                        'frame_count': player.get_frame_count(),
                        'current_frame': player.current_frame_index,
                        'dimensions': player.get_dimensions(),
                        'playing': player.playing
                    }
                elif element_type == 'video' and element_id in self.video_players:
                    player = self.video_players[element_id]
                    info['video_info'] = {
                        'original_size': (player.original_width, player.original_height),
                        'target_size': (player.target_width, player.target_height),
                        'fps': player.fps,
                        'playing': player.playing
                    }
                
                return info
        
        return None
    
    def get_statistics(self):
        """Get renderer statistics for debugging and monitoring."""
        return {
            'gif_players': {
                'count': len(self.gif_players),
                'active': sum(1 for p in self.gif_players.values() if p.playing),
                'ids': list(self.gif_players.keys())
            },
            'video_players': {
                'count': len(self.video_players),
                'active': sum(1 for p in self.video_players.values() if p.playing),
                'ids': list(self.video_players.keys())
            },
            'memory_usage': {
                'gif_frames': sum(len(p.frames) for p in self.gif_players.values()),
                'total_players': len(self.gif_players) + len(self.video_players)
            }
        }
    
    def pause_all_media(self):
        """Pause all GIF and video playback."""
        for player in self.gif_players.values():
            player.playing = False
        
        for player in self.video_players.values():
            player.playing = False
        
        print("⏸️  All media playback paused")
    
    def resume_all_media(self):
        """Resume all GIF and video playback."""
        for player in self.gif_players.values():
            player.playing = True
        
        for player in self.video_players.values():
            player.playing = True
        
        print("▶️  All media playback resumed")
    
    def cleanup(self):
        """Clean up all resources when shutting down."""
        print("Cleaning up media element renderer...")

        # Signal all GIF players to stop (don't wait for cleanup)
        gif_count = len(self.gif_players)
        for gif_player in self.gif_players.values():
            try:
                # Just signal to stop, don't wait
                gif_player.playing = False
                if hasattr(gif_player, 'stop_event'):
                    gif_player.stop_event.set()
            except Exception:
                pass
        self.gif_players.clear()

        # Signal all pygame video players to stop (don't wait for cleanup)
        video_count = len(self.video_players)
        for video_player in self.video_players.values():
            try:
                # Just signal to stop, don't wait for resource cleanup
                video_player.playing = False
                if hasattr(video_player, 'stop_event'):
                    video_player.stop_event.set()
            except Exception:
                pass
        self.video_players.clear()

        # Signal all GL video players to stop
        gl_video_count = len(self.gl_video_players)
        for gl_video_player in self.gl_video_players.values():
            try:
                gl_video_player.stop()
            except Exception:
                pass
        self.gl_video_players.clear()

        # Clear font cache
        if hasattr(self, '_font_cache'):
            self._font_cache.clear()

        # Clear image cache
        if hasattr(self, '_image_cache'):
            image_count = len(self._image_cache)
            self._image_cache.clear()
            print(f"✓ Cleared {image_count} cached images")

        print(f"✓ Media element renderer cleanup complete ({gif_count} GIFs, {video_count} pygame videos, {gl_video_count} GL videos signaled to stop)")

# Updated utility functions for element validation and templates

def validate_element_config(element):
    """Validate an element configuration for common errors including rotation."""
    errors = []
    
    # Check required fields
    if 'type' not in element:
        errors.append("Element missing required 'type' field")
        return errors  # Can't validate further without type
    
    element_type = element['type']
    
    # Import basic element validation
    from basic_elements import validate_basic_element
    
    # Use basic validation for basic elements
    if element_type in ['token', 'area', 'line', 'cone']:
        return validate_basic_element(element)
    
    # Media and text element validation
    if element_type in ['gif', 'video', 'text', 'image']:
        if 'x' not in element:
            errors.append(f"{element_type} missing required 'x' coordinate")
        if 'y' not in element:
            errors.append(f"{element_type} missing required 'y' coordinate")
    
    # Media element validation (including images)
    if element_type in ['gif', 'video', 'image']:
        if 'src' not in element:
            errors.append(f"{element_type} missing required 'src' field")
        elif not os.path.exists(element['src']):
            errors.append(f"{element_type} source file not found: {element['src']}")
        
        if element_type in ['gif', 'video'] and 'id' not in element:
            errors.append(f"{element_type} missing required 'id' field")
    
    # Text element validation
    if element_type == 'text':
        if 'text' not in element:
            errors.append("Text element missing required 'text' field")
    
    # Numeric field validation (including rotation)
    numeric_fields = ['x', 'y', 'width', 'height', 'size', 'lineSpacing', 'backgroundPadding', 
                     'borderWidth', 'outlineWidth', 'rotation']
    for field in numeric_fields:
        if field in element:
            try:
                float(element[field])
            except (ValueError, TypeError):
                errors.append(f"Field '{field}' must be numeric, got: {element[field]}")
    
    # Rotation-specific validation
    if 'rotation' in element:
        rotation = element['rotation']
        if not isinstance(rotation, (int, float)):
            errors.append("Rotation must be a number")
        elif rotation < -360 or rotation > 360:
            errors.append("Rotation should be between -360 and 360 degrees")
    
    return errors

def create_element_template(element_type, x=100, y=100):
    """Create a template element configuration for the specified type with rotation support."""
    base_template = {
        "type": element_type,
        "id": f"new_{element_type}",
        "x": x,
        "y": y,
        "rotation": 0,  # Add rotation support to all templates
        "invisible": False
    }
    
    # Import basic templates
    from basic_elements import create_basic_element_template
    
    # Use basic templates for basic elements
    if element_type in ['token', 'area', 'line', 'cone']:
        return create_basic_element_template(element_type, x, y)
    
    # Media and text templates with rotation support
    templates = {
        "gif": {
            **base_template,
            "src": "/path/to/animation.gif",
            "width": 100,
            "height": 100,
            "label": "New GIF"
        },
        "video": {
            **base_template,
            "src": "/path/to/video.mp4",
            "width": 200,
            "height": 150,
            "label": "New Video"
        },
        "image": {
            **base_template,
            "src": "/path/to/image.png",
            "width": 100,
            "height": 100,
            "label": "New Image"
        },
        "text": {
            **base_template,
            "text": "Sample Text",
            "font": "Arial",
            "size": 24,
            "color": "#ffffff",
            "alignment": "left",
            "style": "normal",
            "backgroundColor": "rgba(0, 0, 0, 0.5)",
            "backgroundPadding": 10
        }
    }
    
    return templates.get(element_type, base_template)