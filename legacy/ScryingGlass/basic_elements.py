#!/usr/bin/env python3
"""
Enhanced Basic Elements Module with Texture Support

This module handles rendering of basic geometric elements including tokens, 
areas, lines, and cones with rotation support, transparent backgrounds, and texture support.

Classes:
    BasicElementRenderer: Enhanced renderer with texture capabilities
"""

import math
import pygame
from texture_manager import TextureManager


class BasicElementRenderer:
    """
    Enhanced renderer for basic geometric elements with texture support.
    
    Handles drawing of tokens (circles), areas (rectangles), lines, and cones
    using pygame's built-in drawing primitives with rotation capabilities and textures.
    """
    
    def __init__(self, screen):
        """
        Initialize the basic element renderer.
        
        Args:
            screen (pygame.Surface): The pygame display surface to draw on
        """
        self.screen = screen
        self.texture_manager = TextureManager()
    
    def parse_color(self, color_str, default_alpha=255):
        """
        Parse color string to pygame color tuple.
        
        Supports both hex colors (#RRGGBB) and rgba() format.
        
        Args:
            color_str (str): Color string in hex or rgba format
            default_alpha (int): Default alpha value for hex colors
            
        Returns:
            tuple: (R, G, B, A) color tuple
        """
        if color_str.startswith('rgba('):
            # Parse rgba(r, g, b, a) format
            rgba = color_str[5:-1].split(',')
            r = int(rgba[0].strip())
            g = int(rgba[1].strip())
            b = int(rgba[2].strip())
            a = int(float(rgba[3].strip()) * 255)
            return (r, g, b, a)
        elif color_str.startswith('#'):
            # Parse hex color #RRGGBB
            hex_color = color_str[1:]
            if len(hex_color) == 6:
                r = int(hex_color[0:2], 16)
                g = int(hex_color[2:4], 16)
                b = int(hex_color[4:6], 16)
                return (r, g, b, default_alpha)
        
        # Fallback colors for common named colors
        color_map = {
            '#3498db': (52, 152, 219),
            '#e74c3c': (231, 76, 60),
            '#ff0000': (255, 0, 0),
            '#ff7700': (255, 119, 0),
        }
        return color_map.get(color_str, (255, 255, 255))
    
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
    
    def _calculate_rotated_position(self, x, y, original_size, rotated_size):
        """
        Calculate the position adjustment needed for rotated elements to maintain center.
        
        Args:
            x, y (int): Original center position
            original_size (tuple): (width, height) of original surface
            rotated_size (tuple): (width, height) of rotated surface
            
        Returns:
            tuple: (adjusted_x, adjusted_y) for top-left positioning
        """
        orig_w, orig_h = original_size
        rot_w, rot_h = rotated_size
        
        # Calculate offset to maintain center position
        offset_x = (rot_w - orig_w) // 2
        offset_y = (rot_h - orig_h) // 2
        
        # Adjust position (assuming x,y is center for tokens, top-left for areas)
        return x - offset_x, y - offset_y
    
    def draw_token(self, element):
        """
        Draw a circular token element with optional rotation and texture.
        
        Tokens are circular markers typically used to represent players,
        NPCs, or other game pieces on a map or battlefield.
        
        Args:
            element (dict): Token element configuration
                - x, y: Center coordinates
                - size: Diameter of the token
                - color: Fill color
                - rotation: Rotation angle in degrees (optional)
                - texture: Texture configuration (optional)
                - label: Optional text label below token
                - invisible: Hide/show flag
        """
        if element.get('invisible', False):
            return
            
        x = int(element['x'])
        y = int(element['y'])
        size = element.get('size', 50)
        radius = size // 2
        color = self.parse_color(element.get('color', '#ffffff'))[:3]  # Remove alpha for circle
        rotation = element.get('rotation', 0)
        texture_config = element.get('texture')
        
        if rotation == 0 and not texture_config:
            # No rotation or texture, draw directly to screen for better performance
            pygame.draw.circle(self.screen, color, (x, y), radius)
            pygame.draw.circle(self.screen, (0, 0, 0), (x, y), radius, 2)
        else:
            # Create surface with alpha channel for rotation/texture
            token_surface = pygame.Surface((size, size), pygame.SRCALPHA)
            
            # Draw base token on surface (center of surface)
            pygame.draw.circle(token_surface, color, (radius, radius), radius)
            
            # Apply texture if specified
            if texture_config:
                try:
                    texture_path = texture_config.get('src')
                    tile_mode = texture_config.get('tileMode', 'stretch')
                    opacity = texture_config.get('opacity', 1.0)
                    
                    if texture_path:
                        # Get circular texture
                        texture_surface = self.texture_manager.get_texture(
                            texture_path, size, size, tile_mode
                        )
                        
                        # Create circular mask for texture
                        mask_surface = pygame.Surface((size, size), pygame.SRCALPHA)
                        pygame.draw.circle(mask_surface, (255, 255, 255, 255), (radius, radius), radius)
                        
                        # Apply mask to texture
                        texture_surface.blit(mask_surface, (0, 0), special_flags=pygame.BLEND_RGBA_MULT)
                        
                        # Apply opacity if needed
                        if opacity < 1.0:
                            alpha_value = int(255 * opacity)
                            texture_surface.set_alpha(alpha_value)
                        
                        # Blend texture onto token
                        token_surface.blit(texture_surface, (0, 0), special_flags=pygame.BLEND_ALPHA_SDL2)
                        
                except Exception as e:
                    print(f"Error applying texture to token: {e}")
            
            # Draw border
            pygame.draw.circle(token_surface, (0, 0, 0), (radius, radius), radius, 2)
            
            # Rotate if needed
            if rotation != 0:
                token_surface = self._rotate_surface_transparent(token_surface, rotation)
            
            # Calculate position to maintain center point
            rot_size = token_surface.get_size()
            pos_x, pos_y = self._calculate_rotated_position((x - radius, y - radius), (size, size), rot_size)
            
            # Blit the token
            self.screen.blit(token_surface, (pos_x, pos_y))
        
        # Draw label if present
        if 'label' in element:
            font = pygame.font.Font(None, 24)
            text = font.render(element['label'], True, (0, 0, 0))
            # Position label below the token (accounting for rotation bounds)
            if rotation != 0:
                # Use expanded bounds for rotated elements
                rot_radius = int(radius * 1.5)  # Approximate expanded radius
                text_rect = text.get_rect(center=(x, y + rot_radius + 15))
            else:
                text_rect = text.get_rect(center=(x, y + radius + 15))
            self.screen.blit(text, text_rect)
    
    def draw_area(self, element):
        """
        Draw a rectangular area element with optional rotation, transparency, and texture.
        
        Areas represent zones, rooms, terrain features, or any rectangular
        region of interest. Supports transparency, rotation, and textures.
        
        Args:
            element (dict): Area element configuration
                - x, y: Top-left corner coordinates (or center if rotated)
                - width, height: Dimensions
                - color: Fill color (supports rgba for transparency)
                - rotation: Rotation angle in degrees (optional)
                - texture: Texture configuration (optional)
                - label: Optional text label in top-left corner
                - invisible: Hide/show flag
        """
        if element.get('invisible', False):
            return
            
        x = int(element['x'])
        y = int(element['y'])
        width = int(element.get('width', 100))
        height = int(element.get('height', 100))
        color = self.parse_color(element.get('color', 'rgba(255,255,255,0.3)'))
        rotation = element.get('rotation', 0)
        texture_config = element.get('texture')
        
        if rotation == 0 and not texture_config:
            # No rotation or texture, draw directly to screen
            if len(color) == 4:
                surf = pygame.Surface((width, height), pygame.SRCALPHA)
                surf.fill(color)
                self.screen.blit(surf, (x, y))
            else:
                pygame.draw.rect(self.screen, color[:3], (x, y, width, height))
            
            # Draw border if specified
            border_color = element.get('borderColor')
            border_width = element.get('borderWidth', 0)
            if border_color and border_width > 0:
                border_col = self.parse_color(border_color)[:3]
                pygame.draw.rect(self.screen, border_col, (x, y, width, height), border_width)
        else:
            # Create surface with alpha channel for rotation/texture
            area_surface = pygame.Surface((width, height), pygame.SRCALPHA)
            
            # Fill with base color (handles both RGB and RGBA)
            area_surface.fill(color)
            
            # Apply texture if specified
            if texture_config:
                try:
                    texture_path = texture_config.get('src')
                    tile_mode = texture_config.get('tileMode', 'stretch')
                    opacity = texture_config.get('opacity', 1.0)
                    
                    if texture_path:
                        # Get texture for area dimensions
                        texture_surface = self.texture_manager.get_texture(
                            texture_path, width, height, tile_mode
                        )
                        
                        # Apply opacity if needed
                        if opacity < 1.0:
                            alpha_value = int(255 * opacity)
                            texture_surface.set_alpha(alpha_value)
                        
                        # Blend texture onto area
                        area_surface.blit(texture_surface, (0, 0), special_flags=pygame.BLEND_ALPHA_SDL2)
                        
                except Exception as e:
                    print(f"Error applying texture to area: {e}")
            
            # Draw border if specified
            border_color = element.get('borderColor')
            border_width = element.get('borderWidth', 0)
            if border_color and border_width > 0:
                border_col = self.parse_color(border_color)[:3]
                pygame.draw.rect(area_surface, border_col, (0, 0, width, height), border_width)
            
            # Rotate if needed
            if rotation != 0:
                area_surface = self._rotate_surface_transparent(area_surface, rotation)
            
            # For areas, treat x,y as center when rotating (more intuitive)
            if rotation != 0:
                rot_size = area_surface.get_size()
                center_x, center_y = x + width // 2, y + height // 2
                pos_x = center_x - rot_size[0] // 2
                pos_y = center_y - rot_size[1] // 2
            else:
                pos_x, pos_y = x, y
            
            # Blit the area
            self.screen.blit(area_surface, (pos_x, pos_y))
        
        # Draw label if present
        if 'label' in element:
            font = pygame.font.Font(None, 24)
            text = font.render(element['label'], True, (0, 0, 0))
            if rotation == 0:
                self.screen.blit(text, (x + 5, y + 5))
            else:
                # For rotated areas, position label at original x,y
                self.screen.blit(text, (x + 5, y + 5))
    
    def draw_line(self, element):
        """
        Draw a line element with optional arrow head and rotation.
        
        Lines can represent movement paths, connections, borders, or
        any linear feature. Arrow heads can indicate direction.
        
        Args:
            element (dict): Line element configuration
                - x, y: Start coordinates
                - endX, endY: End coordinates
                - thickness: Line width in pixels
                - color: Line color
                - rotation: Additional rotation in degrees (optional)
                - arrow: Boolean, whether to draw arrow head
                - label: Optional text label at midpoint
                - invisible: Hide/show flag
        """
        if element.get('invisible', False):
            return
            
        x1 = int(element['x'])
        y1 = int(element['y'])
        x2 = int(element.get('endX', x1 + 100))
        y2 = int(element.get('endY', y1 + 100))
        thickness = int(element.get('thickness', 3))
        color = self.parse_color(element.get('color', '#000000'))[:3]
        rotation = element.get('rotation', 0)
        
        if rotation == 0:
            # No additional rotation, draw directly
            # Draw black outline first (thicker line)
            if thickness > 1:
                pygame.draw.line(self.screen, (0, 0, 0), (x1, y1), (x2, y2), thickness + 2)
            
            # Draw main line on top
            pygame.draw.line(self.screen, color, (x1, y1), (x2, y2), thickness)
            
            # Draw arrow head if specified
            if element.get('arrow', False):
                self._draw_arrow_head(x1, y1, x2, y2, color)
        else:
            # For rotated lines, create a surface and rotate it
            # Calculate line bounds
            min_x, max_x = min(x1, x2), max(x1, x2)
            min_y, max_y = min(y1, y2), max(y1, y2)
            line_width = max_x - min_x + thickness * 2
            line_height = max_y - min_y + thickness * 2
            
            # Create surface with padding
            line_surface = pygame.Surface((line_width, line_height), pygame.SRCALPHA)
            
            # Adjust coordinates relative to surface
            rel_x1 = x1 - min_x + thickness
            rel_y1 = y1 - min_y + thickness
            rel_x2 = x2 - min_x + thickness
            rel_y2 = y2 - min_y + thickness
            
            # Draw outline first (thicker black line)
            if thickness > 1:
                pygame.draw.line(line_surface, (0, 0, 0), (rel_x1, rel_y1), (rel_x2, rel_y2), thickness + 2)
            
            # Draw main line on top
            pygame.draw.line(line_surface, color, (rel_x1, rel_y1), (rel_x2, rel_y2), thickness)
            
            # Draw arrow if specified
            if element.get('arrow', False):
                angle = math.atan2(rel_y2 - rel_y1, rel_x2 - rel_x1)
                arrow_size = 15
                ax1 = rel_x2 - arrow_size * math.cos(angle - 0.5)
                ay1 = rel_y2 - arrow_size * math.sin(angle - 0.5)
                ax2 = rel_x2 - arrow_size * math.cos(angle + 0.5)
                ay2 = rel_y2 - arrow_size * math.sin(angle + 0.5)
                
                # Draw black outline for arrow head
                pygame.draw.polygon(line_surface, (0, 0, 0), [(rel_x2, rel_y2), (ax1, ay1), (ax2, ay2)])
                pygame.draw.polygon(line_surface, (0, 0, 0), [(rel_x2, rel_y2), (ax1, ay1), (ax2, ay2)], 2)
                
                # Draw main arrow head
                pygame.draw.polygon(line_surface, color, [(rel_x2, rel_y2), (ax1, ay1), (ax2, ay2)])
            
            # Rotate the surface
            rotated_surface = self._rotate_surface_transparent(line_surface, rotation)
            
            # Calculate center and position
            center_x = (x1 + x2) // 2
            center_y = (y1 + y2) // 2
            rot_size = rotated_surface.get_size()
            pos_x = center_x - rot_size[0] // 2
            pos_y = center_y - rot_size[1] // 2
            
            # Blit the rotated line
            self.screen.blit(rotated_surface, (pos_x, pos_y))
        
        # Draw label if present
        if 'label' in element:
            font = pygame.font.Font(None, 20)
            text = font.render(element['label'], True, (0, 0, 0))
            mid_x = (x1 + x2) // 2
            mid_y = (y1 + y2) // 2
            text_rect = text.get_rect(center=(mid_x, mid_y))
            self.screen.blit(text, text_rect)
    
    def _draw_arrow_head(self, x1, y1, x2, y2, color):
        """Helper method to draw arrow heads with black outline."""
        angle = math.atan2(y2 - y1, x2 - x1)
        arrow_size = 15
        
        # Calculate arrow head points
        ax1 = x2 - arrow_size * math.cos(angle - 0.5)
        ay1 = y2 - arrow_size * math.sin(angle - 0.5)
        ax2 = x2 - arrow_size * math.cos(angle + 0.5)
        ay2 = y2 - arrow_size * math.sin(angle + 0.5)
        
        # Draw black outline for arrow head
        outline_points = []
        for px, py in [(x2, y2), (ax1, ay1), (ax2, ay2)]:
            outline_points.append((px, py))
        
        # Draw outline (slightly larger)
        pygame.draw.polygon(self.screen, (0, 0, 0), outline_points)
        pygame.draw.polygon(self.screen, (0, 0, 0), outline_points, 2)
        
        # Draw main arrow head
        pygame.draw.polygon(self.screen, color, [(x2, y2), (ax1, ay1), (ax2, ay2)])
    
    def draw_cone(self, element):
        """
        Draw a cone/sector element with rotation support and texture.
        
        Cones are sector-shaped areas used for spell effects, vision ranges,
        light sources, or any directional area of effect. Now supports textures.
        
        Args:
            element (dict): Cone element configuration
                - x, y: Origin point (tip of cone)
                - radius: Maximum range of cone
                - angle: Cone width in degrees
                - direction: Cone direction in degrees (0 = right, 90 = down)
                - rotation: Additional rotation in degrees (optional)
                - color: Fill color (supports rgba for transparency)
                - borderColor: Border color
                - texture: Texture configuration (optional)
                - label: Optional text label at center
                - invisible: Hide/show flag
        """
        if element.get('invisible', False):
            return
            
        x = int(element['x'])
        y = int(element['y'])
        radius = int(element.get('radius', 50))
        angle = math.radians(element.get('angle', 45))
        direction = math.radians(element.get('direction', 0))
        additional_rotation = element.get('rotation', 0)
        color = self.parse_color(element.get('color', 'rgba(255,165,0,0.5)'))
        border_color = self.parse_color(element.get('borderColor', '#ff7700'))[:3]
        texture_config = element.get('texture')
        
        # Apply additional rotation to direction
        if additional_rotation != 0:
            direction += math.radians(additional_rotation)
        
        # Calculate cone boundaries
        start_angle = direction - angle / 2
        end_angle = direction + angle / 2
        
        # Generate polygon points for the cone
        points = [(x, y)]  # Center point (tip of cone)
        
        # Generate arc points along the circumference
        steps = max(8, int(math.degrees(angle)))
        for i in range(steps + 1):
            current_angle = start_angle + (end_angle - start_angle) * i / steps
            px = x + radius * math.cos(current_angle)
            py = y + radius * math.sin(current_angle)
            points.append((px, py))
        
        if not texture_config:
            # Draw filled polygon with alpha blending if specified (no texture)
            if len(color) == 4:
                # Create temporary surface for alpha blending
                temp_surf = pygame.Surface((radius * 2 + 10, radius * 2 + 10), pygame.SRCALPHA)
                adjusted_points = [(px - x + radius + 5, py - y + radius + 5) for px, py in points]
                pygame.draw.polygon(temp_surf, color, adjusted_points)
                self.screen.blit(temp_surf, (x - radius - 5, y - radius - 5))
            else:
                pygame.draw.polygon(self.screen, color[:3], points)
        else:
            # Create textured cone
            try:
                texture_path = texture_config.get('src')
                tile_mode = texture_config.get('tileMode', 'stretch')
                opacity = texture_config.get('opacity', 1.0)
                
                if texture_path:
                    # Create textured cone surface
                    textured_cone = self.texture_manager.create_textured_cone_surface(
                        radius, angle, texture_path, tile_mode, opacity
                    )
                    
                    # Position the textured cone
                    surface_size = radius * 2 + 10
                    cone_x = x - surface_size // 2
                    cone_y = y - surface_size // 2
                    
                    # Apply rotation if needed
                    if additional_rotation != 0:
                        textured_cone = self._rotate_surface_transparent(textured_cone, math.degrees(additional_rotation))
                        # Recalculate position for rotated surface
                        rot_size = textured_cone.get_size()
                        cone_x = x - rot_size[0] // 2
                        cone_y = y - rot_size[1] // 2
                    
                    self.screen.blit(textured_cone, (cone_x, cone_y))
                    
            except Exception as e:
                print(f"Error applying texture to cone: {e}")
                # Fallback to regular cone
                if len(color) == 4:
                    temp_surf = pygame.Surface((radius * 2 + 10, radius * 2 + 10), pygame.SRCALPHA)
                    adjusted_points = [(px - x + radius + 5, py - y + radius + 5) for px, py in points]
                    pygame.draw.polygon(temp_surf, color, adjusted_points)
                    self.screen.blit(temp_surf, (x - radius - 5, y - radius - 5))
                else:
                    pygame.draw.polygon(self.screen, color[:3], points)
        
        # Draw border
        pygame.draw.polygon(self.screen, border_color, points, 2)
        
        # Draw label if present
        if 'label' in element:
            font = pygame.font.Font(None, 20)
            text = font.render(element['label'], True, (0, 0, 0))
            label_x = x + (radius // 2) * math.cos(direction)
            label_y = y + (radius // 2) * math.sin(direction)
            text_rect = text.get_rect(center=(int(label_x), int(label_y)))
            self.screen.blit(text, text_rect)
    
    def get_element_bounds(self, element):
        """
        Get the bounding rectangle of a basic element, accounting for rotation.
        
        Args:
            element (dict): Element configuration
            
        Returns:
            pygame.Rect: Bounding rectangle of the element
        """
        element_type = element.get('type', '')
        x = int(element.get('x', 0))
        y = int(element.get('y', 0))
        rotation = element.get('rotation', 0)
        
        if element_type == 'token':
            size = element.get('size', 50)
            radius = size // 2
            
            if rotation == 0:
                return pygame.Rect(x - radius, y - radius, size, size)
            else:
                # Approximate rotated bounds (could be more precise)
                expanded_size = int(size * 1.42)  # sqrt(2) expansion
                return pygame.Rect(x - expanded_size//2, y - expanded_size//2, expanded_size, expanded_size)
                
        elif element_type == 'area':
            width = int(element.get('width', 100))
            height = int(element.get('height', 100))
            
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
                
        elif element_type == 'line':
            x2 = int(element.get('endX', x + 100))
            y2 = int(element.get('endY', y + 100))
            thickness = element.get('thickness', 3)
            
            # Simple bounds calculation (rotation affects would be complex)
            min_x, max_x = min(x, x2) - thickness, max(x, x2) + thickness
            min_y, max_y = min(y, y2) - thickness, max(y, y2) + thickness
            return pygame.Rect(min_x, min_y, max_x - min_x, max_y - min_y)
            
        elif element_type == 'cone':
            radius = int(element.get('radius', 50))
            return pygame.Rect(x - radius, y - radius, radius * 2, radius * 2)
        
        # Default bounds for unknown types
        return pygame.Rect(x, y, 50, 50)
    
    def cleanup(self):
        """Clean up renderer resources."""
        if self.texture_manager:
            self.texture_manager.cleanup()
        print("✓ Basic element renderer cleanup complete")

# Updated utility functions

def validate_basic_element(element):
    """
    Validate a basic element configuration including rotation and texture support.
    
    Args:
        element (dict): Element configuration to validate
        
    Returns:
        list: List of validation error messages (empty if valid)
    """
    errors = []
    element_type = element.get('type', '')
    
    # Common validations for basic elements
    if element_type in ['token', 'area', 'line', 'cone']:
        if 'x' not in element:
            errors.append(f"{element_type} missing required 'x' coordinate")
        if 'y' not in element:
            errors.append(f"{element_type} missing required 'y' coordinate")
    
    # Type-specific validations
    if element_type == 'line':
        if 'endX' not in element:
            errors.append("Line missing required 'endX' coordinate")
        if 'endY' not in element:
            errors.append("Line missing required 'endY' coordinate")
    
    # Numeric field validation (including rotation)
    numeric_fields = ['x', 'y', 'endX', 'endY', 'width', 'height', 'size', 'radius', 
                     'thickness', 'angle', 'direction', 'rotation']
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
    
    # Texture validation
    if 'texture' in element:
        from texture_manager import validate_texture_config
        texture_errors = validate_texture_config(element['texture'])
        errors.extend([f"Texture: {error}" for error in texture_errors])
    
    return errors

def create_basic_element_template(element_type, x=100, y=100):
    """
    Create a template for basic elements with rotation and texture support.
    
    Args:
        element_type (str): Type of element to create template for
        x (int): Default x coordinate
        y (int): Default y coordinate
        
    Returns:
        dict: Template element configuration
    """
    from texture_manager import create_texture_template
    
    base_template = {
        "type": element_type,
        "id": f"new_{element_type}",
        "x": x,
        "y": y,
        "rotation": 0,
        "invisible": False
    }
    
    templates = {
        "token": {
            **base_template,
            "size": 50,
            "color": "#3498db",
            "label": "",
            "texture": create_texture_template()  # Optional texture
        },
        "area": {
            **base_template,
            "width": 200,
            "height": 150,
            "color": "rgba(0, 255, 0, 0.3)",
            "borderColor": "",  # No border by default
            "borderWidth": 0,
            "label": "",
            "texture": create_texture_template()  # Optional texture
        },
        "line": {
            **base_template,
            "endX": x + 100,
            "endY": y + 100,
            "thickness": 3,
            "color": "#000000",
            "arrow": False,
            "label": ""
        },
        "cone": {
            **base_template,
            "radius": 100,
            "angle": 45,
            "direction": 0,
            "color": "rgba(255, 165, 0, 0.5)",
            "borderColor": "#ff7700",
            "label": "",
            "texture": create_texture_template()  # Optional texture
        }
    }
    
    return templates.get(element_type, base_template)