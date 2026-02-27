#!/usr/bin/env python3
"""
Enhanced Fog Manager Module with Shadow Polygon Support
Handles fog overlay effects with wall-blocking line-of-sight mechanics.
Uses Clipper library for accurate polygon operations.
"""
import pygame
import math

try:
    import pyclipper
    CLIPPER_AVAILABLE = True
except ImportError:
    CLIPPER_AVAILABLE = False
    print("⚠️  pyclipper not available - install with: pip install pyclipper")
    print("⚠️  Falling back to simplified polygon operations")


class FogManager:
    """
    Manages fog overlay effects with interactive clearing capabilities and wall-blocking.
    """
    
    def __init__(self, window_width, window_height):
        """
        Initialize fog manager.
        
        Args:
            window_width (int): Window width in pixels
            window_height (int): Window height in pixels
        """
        self.window_width = window_width
        self.window_height = window_height
        self.fog_cleared_areas = []  # Now stores polygons instead of circles
        self.mouse_dragging = False
        self.last_clear_position = None
        self._shadow_cache = {}
        self._cache_hits = 0
    
    def clear_fog_at_position(self, x, y, radius=30, config=None):
        """Optimized fog clearing with caching"""
        # Create cache key from position and walls
        cache_key = (x, y, radius, tuple(config.get('walls', [])) if config else ())
        
        # Check cache first
        if cache_key in self._shadow_cache:
            self._cache_hits += 1
            self.fog_cleared_areas.append(self._shadow_cache[cache_key])
            return
        """
        Clear fog in an area around the given position, respecting wall shadows.
        
        Args:
            x (int): X coordinate of light source
            y (int): Y coordinate of light source
            radius (int): Maximum radius of the cleared area
            config (dict): Configuration containing elements that might be walls
        """
        # Avoid duplicate clearing at the exact same position
        if self.last_clear_position:
            last_x, last_y = self.last_clear_position
            distance = ((x - last_x) ** 2 + (y - last_y) ** 2) ** 0.5
            if distance < radius * 0.3:  # Overlap threshold
                return
        
        light_pos = (x, y)
        
        # Create base circular clear area as polygon
        clear_polygon = self._create_circle_polygon(x, y, radius, segments=32)
        
        # Find all wall elements if config provided
        if config and 'elements' in config:
            walls = [elem for elem in config['elements'] 
                    if elem.get('isWall', False) and not elem.get('invisible', False)]
            
            # First, subtract the solid wall areas themselves (walls are opaque)
            for wall in walls:
                if self._wall_could_affect_area(wall, light_pos, radius):
                    wall_solid_area = self._get_wall_solid_polygon(wall)
                    if wall_solid_area:
                        clear_polygon = self._subtract_polygon_clipper(clear_polygon, wall_solid_area)
                        if not clear_polygon:
                            break
            
            # Then calculate shadows from each wall and subtract from remaining clear area
            if clear_polygon:  # Only if there's still area to clear
                for wall in walls:
                    # Only process walls that could potentially cast shadows into our area
                    if self._wall_could_affect_area(wall, light_pos, radius):
                        shadow_polygon = self._calculate_shadow_polygon(wall, light_pos, radius * 2)
                        if shadow_polygon:
                            clear_polygon = self._subtract_polygon_clipper(clear_polygon, shadow_polygon)
                            # If no area remains, break early
                            if not clear_polygon:
                                break
        
        # Store the final visible polygon
        if clear_polygon and len(clear_polygon) >= 3:  # Valid polygon
            self.fog_cleared_areas.append(clear_polygon)
            self.last_clear_position = (x, y)
            wall_count = len([e for e in config.get('elements', []) if e.get('isWall', False)]) if config else 0
            print(f"Cleared fog at ({x}, {y}) with radius {radius}, processed {wall_count} walls (including solid areas)")
        else:
            print(f"No visible area after shadow calculations at ({x}, {y})")
    
    def _create_circle_polygon(self, cx, cy, radius, segments=32):
        """
        Create a polygon approximation of a circle.
        
        Args:
            cx, cy (int): Circle center
            radius (int): Circle radius
            segments (int): Number of polygon segments (more = smoother)
            
        Returns:
            list: List of (x, y) tuples representing polygon vertices
        """
        polygon = []
        for i in range(segments):
            angle = 2 * math.pi * i / segments
            x = cx + radius * math.cos(angle)
            y = cy + radius * math.sin(angle)
            polygon.append((x, y))
        return polygon
    
    def _wall_could_affect_area(self, wall, light_pos, radius):
        """
        Quick check if a wall could potentially cast shadows into the clear area.
        
        Args:
            wall (dict): Wall element
            light_pos (tuple): Light source position
            radius (int): Clear radius
            
        Returns:
            bool: True if wall might affect the area
        """
        # Get wall bounds
        wall_bounds = self._get_element_bounds(wall)
        if not wall_bounds:
            return False
        
        # Check if wall is within reasonable distance of light + radius
        lx, ly = light_pos
        max_distance = radius * 2  # Generous buffer
        
        # Distance from light to closest point on wall
        min_dist = self._point_to_rect_distance(lx, ly, wall_bounds)
        return min_dist <= max_distance
    
    def _get_element_bounds(self, element):
        """
        Get bounding rectangle for any element type.
        
        Args:
            element (dict): Element configuration
            
        Returns:
            tuple: (x, y, width, height) or None if invalid
        """
        element_type = element.get('type', '')
        x = element.get('x', 0)
        y = element.get('y', 0)
        
        if element_type == 'area':
            width = element.get('width', 100)
            height = element.get('height', 100)
            return (x, y, width, height)
        
        elif element_type == 'line':
            x2 = element.get('endX', x + 100)
            y2 = element.get('endY', y + 100)
            thickness = element.get('thickness', 3)
            min_x, max_x = min(x, x2), max(x, x2)
            min_y, max_y = min(y, y2), max(y, y2)
            return (min_x - thickness, min_y - thickness, 
                   max_x - min_x + 2*thickness, max_y - min_y + 2*thickness)
        
        elif element_type == 'token':
            size = element.get('size', 50)
            return (x - size//2, y - size//2, size, size)
        
        elif element_type in ['gif', 'video', 'image', 'text']:
            width = element.get('width', 100)
            height = element.get('height', 100)
            return (x, y, width, height)
        
        return None
    
    def _point_to_rect_distance(self, px, py, rect):
        """
        Calculate minimum distance from point to rectangle.
        
        Args:
            px, py (float): Point coordinates
            rect (tuple): (x, y, width, height)
            
        Returns:
            float: Minimum distance
        """
        rx, ry, rw, rh = rect
        dx = max(rx - px, 0, px - (rx + rw))
        dy = max(ry - py, 0, py - (ry + rh))
        return math.sqrt(dx*dx + dy*dy)
    
    def _calculate_shadow_polygon(self, wall, light_pos, shadow_length):
        """
        Calculate shadow polygon cast by a wall element.
        
        Args:
            wall (dict): Wall element configuration
            light_pos (tuple): Light source position (x, y)
            shadow_length (float): How far to extend shadow
            
        Returns:
            list: Shadow polygon vertices or None if no shadow
        """
        element_type = wall.get('type', '')
        
        if element_type == 'area':
            return self._calculate_rect_shadow(wall, light_pos, shadow_length)
        elif element_type == 'line':
            return self._calculate_line_shadow(wall, light_pos, shadow_length)
        elif element_type == 'token':
            return self._calculate_circle_shadow(wall, light_pos, shadow_length)
        elif element_type in ['gif', 'video', 'image', 'text']:
            # Treat as rectangle using bounding box
            return self._calculate_rect_shadow(wall, light_pos, shadow_length)
        
        return None
    
    def _calculate_rect_shadow(self, wall, light_pos, shadow_length):
        """
        Calculate shadow polygon for rectangular wall (area, image, etc.).
        
        Args:
            wall (dict): Wall element
            light_pos (tuple): Light source position
            shadow_length (float): Shadow extension distance
            
        Returns:
            list: Shadow polygon vertices
        """
        x = wall.get('x', 0)
        y = wall.get('y', 0)
        width = wall.get('width', 100)
        height = wall.get('height', 100)
        
        # Rectangle corners
        corners = [
            (x, y),                    # Top-left
            (x + width, y),            # Top-right
            (x + width, y + height),   # Bottom-right
            (x, y + height)            # Bottom-left
        ]
        
        return self._calculate_polygon_shadow(corners, light_pos, shadow_length)
    
    def _calculate_line_shadow(self, wall, light_pos, shadow_length):
        """
        Calculate shadow polygon for line wall.
        
        Args:
            wall (dict): Line wall element
            light_pos (tuple): Light source position
            shadow_length (float): Shadow extension distance
            
        Returns:
            list: Shadow polygon vertices
        """
        x1 = wall.get('x', 0)
        y1 = wall.get('y', 0)
        x2 = wall.get('endX', x1 + 100)
        y2 = wall.get('endY', y1 + 100)
        thickness = wall.get('thickness', 3)
        
        # Create rectangle representation of thick line
        # Calculate perpendicular vector for thickness
        dx = x2 - x1
        dy = y2 - y1
        length = math.sqrt(dx*dx + dy*dy)
        if length == 0:
            return None
        
        # Normalize and get perpendicular
        nx = -dy / length * thickness / 2
        ny = dx / length * thickness / 2
        
        # Line corners (as thin rectangle)
        corners = [
            (x1 + nx, y1 + ny),
            (x2 + nx, y2 + ny),
            (x2 - nx, y2 - ny),
            (x1 - nx, y1 - ny)
        ]
        
        return self._calculate_polygon_shadow(corners, light_pos, shadow_length)
    
    def _calculate_circle_shadow(self, wall, light_pos, shadow_length):
        """
        Calculate shadow polygon for circular wall (token).
        
        Args:
            wall (dict): Token wall element
            light_pos (tuple): Light source position
            shadow_length (float): Shadow extension distance
            
        Returns:
            list: Shadow polygon vertices
        """
        cx = wall.get('x', 0)
        cy = wall.get('y', 0)
        radius = wall.get('size', 50) / 2
        
        lx, ly = light_pos
        
        # Calculate distance from light to circle center
        dx = cx - lx
        dy = cy - ly
        dist = math.sqrt(dx*dx + dy*dy)
        
        # If light is inside circle, no shadow
        if dist <= radius:
            return None
        
        # Calculate tangent points
        angle_to_center = math.atan2(dy, dx)
        angle_offset = math.asin(radius / dist)
        
        # Tangent points on circle
        tangent1_angle = angle_to_center + angle_offset
        tangent2_angle = angle_to_center - angle_offset
        
        t1x = cx + radius * math.cos(tangent1_angle + math.pi/2)
        t1y = cy + radius * math.sin(tangent1_angle + math.pi/2)
        t2x = cx + radius * math.cos(tangent2_angle - math.pi/2)
        t2y = cy + radius * math.sin(tangent2_angle - math.pi/2)
        
        # Extend tangent lines to create shadow
        shadow_points = []
        for tx, ty in [(t1x, t1y), (t2x, t2y)]:
            shadow_dx = tx - lx
            shadow_dy = ty - ly
            shadow_dist = math.sqrt(shadow_dx*shadow_dx + shadow_dy*shadow_dy)
            if shadow_dist > 0:
                shadow_x = lx + (shadow_dx / shadow_dist) * shadow_length
                shadow_y = ly + (shadow_dy / shadow_dist) * shadow_length
                shadow_points.append((shadow_x, shadow_y))
        
        if len(shadow_points) == 2:
            # Create shadow polygon: tangent1 -> tangent2 -> shadow2 -> shadow1
            return [(t1x, t1y), (t2x, t2y), shadow_points[1], shadow_points[0]]
        
        return None
    
    def _calculate_polygon_shadow(self, corners, light_pos, shadow_length):
        """
        Calculate shadow polygon for any polygon wall.
        
        Args:
            corners (list): List of polygon corner points
            light_pos (tuple): Light source position
            shadow_length (float): Shadow extension distance
            
        Returns:
            list: Shadow polygon vertices
        """
        lx, ly = light_pos
        
        # Find silhouette edges (edges facing away from light)
        silhouette_points = []
        
        for i in range(len(corners)):
            p1 = corners[i]
            p2 = corners[(i + 1) % len(corners)]
            
            # Check if edge faces away from light using cross product
            edge_x = p2[0] - p1[0]
            edge_y = p2[1] - p1[1]
            to_light_x = lx - (p1[0] + p2[0]) / 2  # Vector from edge center to light
            to_light_y = ly - (p1[1] + p2[1]) / 2
            
            # Cross product to determine if edge faces away from light
            cross = edge_x * to_light_y - edge_y * to_light_x
            
            # If edge faces away from light, include its endpoints in silhouette
            if cross > 0:  # Edge faces away from light
                if not silhouette_points or silhouette_points[-1] != p1:
                    silhouette_points.append(p1)
                silhouette_points.append(p2)
        
        if len(silhouette_points) < 2:
            return None
        
        # Remove duplicates while preserving order
        unique_silhouette = []
        for point in silhouette_points:
            if not unique_silhouette or unique_silhouette[-1] != point:
                unique_silhouette.append(point)
        
        if len(unique_silhouette) < 2:
            return None
        
        # Create shadow polygon by extending silhouette points
        shadow_polygon = []
        
        # Add silhouette points
        shadow_polygon.extend(unique_silhouette)
        
        # Add extended points (in reverse order to close polygon properly)
        for i in range(len(unique_silhouette) - 1, -1, -1):
            px, py = unique_silhouette[i]
            
            # Vector from light to point
            dx = px - lx
            dy = py - ly
            dist = math.sqrt(dx*dx + dy*dy)
            
            if dist > 0:
                # Extend to shadow_length
                shadow_x = lx + (dx / dist) * shadow_length
                shadow_y = ly + (dy / dist) * shadow_length
                shadow_polygon.append((shadow_x, shadow_y))
        
        return shadow_polygon if len(shadow_polygon) >= 3 else None
    
    def _get_wall_solid_polygon(self, wall):
        """
        Get the solid area polygon of a wall element (the wall itself, not its shadow).
        
        Args:
            wall (dict): Wall element configuration
            
        Returns:
            list: Wall solid area polygon vertices
        """
        element_type = wall.get('type', '')
        
        if element_type == 'area':
            return self._get_rect_polygon(wall)
        elif element_type == 'line':
            return self._get_line_polygon(wall)
        elif element_type == 'token':
            return self._get_circle_polygon(wall)
        elif element_type in ['gif', 'video', 'image', 'text']:
            # Treat as rectangle using bounding box
            return self._get_rect_polygon(wall)
        
        return None
    
    def _get_rect_polygon(self, wall):
        """Get polygon for rectangular wall (area, image, etc.)."""
        x = wall.get('x', 0)
        y = wall.get('y', 0)
        width = wall.get('width', 100)
        height = wall.get('height', 100)
        
        return [
            (x, y),                    # Top-left
            (x + width, y),            # Top-right
            (x + width, y + height),   # Bottom-right
            (x, y + height)            # Bottom-left
        ]
    
    def _get_line_polygon(self, wall):
        """Get polygon for line wall (thick line as rectangle)."""
        x1 = wall.get('x', 0)
        y1 = wall.get('y', 0)
        x2 = wall.get('endX', x1 + 100)
        y2 = wall.get('endY', y1 + 100)
        thickness = wall.get('thickness', 3)
        
        # Create rectangle representation of thick line
        dx = x2 - x1
        dy = y2 - y1
        length = math.sqrt(dx*dx + dy*dy)
        if length == 0:
            return None
        
        # Normalize and get perpendicular
        nx = -dy / length * thickness / 2
        ny = dx / length * thickness / 2
        
        return [
            (x1 + nx, y1 + ny),
            (x2 + nx, y2 + ny),
            (x2 - nx, y2 - ny),
            (x1 - nx, y1 - ny)
        ]
    
    def _get_circle_polygon(self, wall):
        """Get polygon approximation for circular wall (token)."""
        cx = wall.get('x', 0)
        cy = wall.get('y', 0)
        radius = wall.get('size', 50) / 2
        
        return self._create_circle_polygon(cx, cy, radius, segments=16)  # Fewer segments for solid walls
    
    def _subtract_polygon_clipper(self, subject_polygon, clip_polygon):
        """
        Subtract clip_polygon from subject_polygon using Clipper library.
        
        Args:
            subject_polygon (list): Base polygon vertices
            clip_polygon (list): Polygon to subtract
            
        Returns:
            list: Resulting polygon vertices (largest piece if multiple)
        """
        if not CLIPPER_AVAILABLE:
            # Fallback to simplified method
            return self._subtract_polygon_simple(subject_polygon, clip_polygon)
        
        if not subject_polygon or not clip_polygon:
            return subject_polygon
        
        try:
            # Create clipper instance
            clipper = pyclipper.Pyclipper()
            
            # Convert to integer coordinates (Clipper requirement)
            # Scale up by 1000 for better precision, then scale back down
            scale_factor = 1000
            
            subject_scaled = [(int(x * scale_factor), int(y * scale_factor)) 
                            for x, y in subject_polygon]
            clip_scaled = [(int(x * scale_factor), int(y * scale_factor)) 
                         for x, y in clip_polygon]
            
            # Add polygons to clipper
            clipper.AddPath(subject_scaled, pyclipper.PT_SUBJECT, True)
            clipper.AddPath(clip_scaled, pyclipper.PT_CLIP, True)
            
            # Execute difference operation
            solution = clipper.Execute(pyclipper.CT_DIFFERENCE, 
                                     pyclipper.PFT_EVENODD, 
                                     pyclipper.PFT_EVENODD)
            
            if not solution:
                return []  # No area remaining
            
            # Convert back to float coordinates and find largest polygon
            largest_polygon = []
            largest_area = 0
            
            for polygon in solution:
                # Scale back down
                scaled_polygon = [(x / scale_factor, y / scale_factor) for x, y in polygon]
                
                # Calculate area to find largest piece
                area = self._calculate_polygon_area(scaled_polygon)
                if area > largest_area:
                    largest_area = area
                    largest_polygon = scaled_polygon
            
            return largest_polygon
            
        except Exception as e:
            print(f"Clipper operation failed: {e}, using fallback method")
            return self._subtract_polygon_simple(subject_polygon, clip_polygon)
    
    def _subtract_polygon_simple(self, polygon1, polygon2):
        """
        Subtract polygon2 from polygon1 (simplified fallback implementation).
        
        Args:
            polygon1 (list): Base polygon vertices
            polygon2 (list): Polygon to subtract
            
        Returns:
            list: Resulting polygon vertices (simplified)
        """
        if not polygon1 or not polygon2:
            return polygon1
        
        # Simplified approach: remove points from polygon1 that are inside polygon2
        result_points = []
        
        for point in polygon1:
            if not self._point_in_polygon(point, polygon2):
                result_points.append(point)
        
        # This is a very simplified subtraction - in practice you'd want
        # a proper polygon clipping algorithm for accurate results
        return result_points if len(result_points) >= 3 else []
    
    def _calculate_polygon_area(self, polygon):
        """
        Calculate the area of a polygon using the shoelace formula.
        
        Args:
            polygon (list): Polygon vertices
            
        Returns:
            float: Polygon area (always positive)
        """
        if len(polygon) < 3:
            return 0
        
        area = 0
        n = len(polygon)
        for i in range(n):
            j = (i + 1) % n
            area += polygon[i][0] * polygon[j][1]
            area -= polygon[j][0] * polygon[i][1]
        
        return abs(area) / 2
    
    def _point_in_polygon(self, point, polygon):
        """
        Test if a point is inside a polygon using ray casting algorithm.
        
        Args:
            point (tuple): Point coordinates (x, y)
            polygon (list): Polygon vertices
            
        Returns:
            bool: True if point is inside polygon
        """
        if len(polygon) < 3:
            return False
        
        x, y = point
        n = len(polygon)
        inside = False
        
        p1x, p1y = polygon[0]
        for i in range(1, n + 1):
            p2x, p2y = polygon[i % n]
            if y > min(p1y, p2y):
                if y <= max(p1y, p2y):
                    if x <= max(p1x, p2x):
                        if p1y != p2y:
                            xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                        if p1x == p2x or x <= xinters:
                            inside = not inside
            p1x, p1y = p2x, p2y
        
        return inside
    
    def handle_mouse_motion(self, pos, config=None):
        """
        Handle mouse motion events for fog clearing while dragging.
        
        Args:
            pos (tuple): Mouse position (x, y)
            config (dict): Configuration dictionary containing fog settings
        """
        if not self.mouse_dragging:
            return
        
        # Check if fog clear mode is enabled in config
        fog_config = config.get('fog', {}) if config else {}
        clear_mode = fog_config.get('clearMode', True)
        
        if clear_mode:
            x, y = pos
            clear_radius = fog_config.get('clearRadius', 30)
            self.clear_fog_at_position(x, y, radius=clear_radius, config=config)
    
    def handle_mouse_click(self, pos, config=None):
        """
        Handle mouse click events for fog clearing.
        
        Args:
            pos (tuple): Mouse position (x, y)
            config (dict): Configuration dictionary containing fog settings
        """
        fog_config = config.get('fog', {}) if config else {}
        clear_mode = fog_config.get('clearMode', True)
        
        if clear_mode:
            x, y = pos
            clear_radius = fog_config.get('clearRadius', 30)
            self.clear_fog_at_position(x, y, radius=clear_radius, config=config)
    
    def start_dragging(self):
        """Start mouse dragging mode for fog clearing."""
        self.mouse_dragging = True
        self.last_clear_position = None
    
    def stop_dragging(self):
        """Stop mouse dragging mode."""
        self.mouse_dragging = False
        self.last_clear_position = None
    
    def draw_fog_overlay(self, screen, config):
        """
        Draw fog overlay with polygon-based cleared areas.
        
        Args:
            screen (pygame.Surface): The pygame screen surface to draw on
            config (dict): Configuration dictionary containing fog settings
        """
        if not config.get('fog', {}).get('enabled', False):
            return
        
        fog_config = config.get('fog', {})
        opacity = fog_config.get('opacity', 0.3)
        color = fog_config.get('color', '#808080')
        
        # Parse color
        if color.startswith('#'):
            hex_color = color[1:]
            r = int(hex_color[0:2], 16)
            g = int(hex_color[2:4], 16)
            b = int(hex_color[4:6], 16)
        else:
            r, g, b = 128, 128, 128
        
        # Create fog surface
        fog_surface = pygame.Surface((self.window_width, self.window_height), pygame.SRCALPHA)
        alpha = int(255 * opacity)
        fog_surface.fill((r, g, b, alpha))
        
        # Clear areas where fog has been removed (now polygons)
        for cleared_area in self.fog_cleared_areas:
            if len(cleared_area) >= 3:  # Valid polygon
                # Convert to integer coordinates for pygame
                int_points = [(int(x), int(y)) for x, y in cleared_area]
                try:
                    # Ensure polygon is valid for pygame
                    if len(int_points) >= 3:
                        pygame.draw.polygon(fog_surface, (0, 0, 0, 0), int_points)
                except (ValueError, TypeError):
                    # Skip invalid polygons
                    continue
        
        # Blit fog overlay to screen
        screen.blit(fog_surface, (0, 0))
        
        # Debug info
        if config.get('debug', {}).get('showFogSettings', False):
            self._draw_fog_debug_info(screen, fog_config)
    
    def _draw_fog_debug_info(self, screen, fog_config):
        """Draw debug information about fog settings."""
        font = pygame.font.Font(None, 24)
        
        clear_mode = fog_config.get('clearMode', True)
        clear_radius = fog_config.get('clearRadius', 30)
        opacity = fog_config.get('opacity', 0.3)
        
        debug_lines = [
            f"Fog Clear Mode: {'ON' if clear_mode else 'OFF'}",
            f"Clear Radius: {clear_radius}px",
            f"Opacity: {opacity:.1%}",
            f"Cleared Areas: {len(self.fog_cleared_areas)}",
            f"Wall Shadows: {'Clipper' if CLIPPER_AVAILABLE else 'Simple'}"
        ]
        
        debug_height = len(debug_lines) * 25 + 20
        debug_rect = pygame.Rect(screen.get_width() - 250, 10, 240, debug_height)
        pygame.draw.rect(screen, (0, 0, 0, 180), debug_rect)
        pygame.draw.rect(screen, (255, 255, 255), debug_rect, 1)
        
        for i, line in enumerate(debug_lines):
            color = (255, 255, 255)
            if i == 0:
                color = (0, 255, 0) if clear_mode else (255, 100, 100)
            elif i == 4:  # Wall shadows line
                color = (100, 255, 100)
            
            text = font.render(line, True, color)
            screen.blit(text, (debug_rect.x + 10, debug_rect.y + 10 + i * 25))
    
    def clear_all_fog(self):
        """Clear all fog cleared areas."""
        self.fog_cleared_areas.clear()
        self.last_clear_position = None
        print("All fog cleared areas reset")
    
    def get_cleared_areas_count(self):
        """Get the number of cleared fog areas."""
        return len(self.fog_cleared_areas)
    
    def get_fog_config_info(self, config):
        """Get current fog configuration information."""
        fog_config = config.get('fog', {}) if config else {}
        
        return {
            'enabled': fog_config.get('enabled', False),
            'clear_mode': fog_config.get('clearMode', True),
            'clear_radius': fog_config.get('clearRadius', 30),
            'opacity': fog_config.get('opacity', 0.3),
            'color': fog_config.get('color', '#808080'),
            'cleared_areas_count': len(self.fog_cleared_areas),
            'wall_shadows': 'clipper' if CLIPPER_AVAILABLE else 'simple'
        }
    # Add this method to the FogManager class

    def check_and_handle_clear_flag(self, config):
        """
        Check if fog should be cleared based on config flag.
        
        Args:
            config (dict): Configuration dictionary containing fog settings
            
        Returns:
            bool: True if fog was cleared, False otherwise
        """
        if not config:
            return False
        
        fog_config = config.get('fog', {})
        should_clear = fog_config.get('clear', False)
        
        if should_clear:
            # Clear the fog
            self.clear_all_fog()
            print("Fog cleared via config flag")
            return True
        
        return False