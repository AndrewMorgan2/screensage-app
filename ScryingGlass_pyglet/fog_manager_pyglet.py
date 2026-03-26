#!/usr/bin/env python3
"""
Pyglet Fog Manager Module with Shadow Polygon Support
Handles fog overlay effects with wall-blocking line-of-sight mechanics using OpenGL.
"""
import math
import logging
import time
from collections import deque

import pyglet
from pyglet import gl

try:
    import pyclipper
    CLIPPER_AVAILABLE = True
except ImportError:
    CLIPPER_AVAILABLE = False
    print("⚠️  pyclipper not available - install with: pip install pyclipper")
    print("⚠️  Falling back to simplified polygon operations")

# Set up logging for fog manager
fog_logger = logging.getLogger('ScreenSage.FogManager')

# =============================================================================
# FOG MANAGER CONFIGURATION - MEMORY LIMITS
# =============================================================================
# Maximum number of fog cleared areas to store
# After this limit, oldest areas are removed (LRU-style)
# This prevents unbounded memory growth during prolonged use
MAX_FOG_CLEARED_AREAS = 2000

# Minimum distance between fog clear positions to avoid duplicates
FOG_OVERLAP_THRESHOLD = 0.3  # 30% of radius
# =============================================================================


class FogManagerPyglet:
    """
    Manages fog overlay effects with interactive clearing capabilities and wall-blocking.
    Optimized for Pyglet with OpenGL rendering.

    MEMORY SAFETY: fog_cleared_areas is bounded to MAX_FOG_CLEARED_AREAS to prevent
    memory leaks during extended sessions. Oldest areas are automatically pruned.
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

        # MEMORY-BOUNDED: Use deque with maxlen for automatic LRU cleanup
        # When new areas are added beyond maxlen, oldest are automatically removed
        self.fog_cleared_areas = deque(maxlen=MAX_FOG_CLEARED_AREAS)

        self.mouse_dragging = False
        self.last_clear_position = None
        self.clear_radius = 40  # Default clear radius
        self._shadow_cache = {}
        self._cache_hits = 0

        # Pyglet-specific: Create vertex lists for cleared areas
        self.fog_polygons = []  # List of vertex lists for cleared polygons

        # Statistics for debugging
        self._areas_added = 0
        self._areas_pruned = 0
        self._last_prune_log = time.time()

        # Fog rendering cache — rebuilt only when fog areas change, not every frame
        self._stencil_dirty = True
        self._stencil_batch = pyglet.graphics.Batch()
        self._stencil_shapes = []  # Keep references to prevent GC
        self._fog_rect = None
        self._fog_rect_params = None  # (r, g, b, opacity_int) to detect color changes

        fog_logger.info(f"FogManager initialized: {window_width}x{window_height}, "
                       f"max_areas={MAX_FOG_CLEARED_AREAS}")

    def clear_fog_at_position(self, x, y, radius=30, config=None):
        """
        Clear fog in an area around the given position, respecting wall shadows.

        MEMORY SAFE: Uses bounded deque - oldest areas automatically pruned when limit reached.

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
            if distance < radius * FOG_OVERLAP_THRESHOLD:
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

        # Store the final visible polygon (deque automatically prunes oldest if at max)
        if clear_polygon and len(clear_polygon) >= 3:  # Valid polygon
            was_at_max = len(self.fog_cleared_areas) >= MAX_FOG_CLEARED_AREAS
            self.fog_cleared_areas.append(clear_polygon)
            self._areas_added += 1
            self._stencil_dirty = True  # Invalidate cached stencil geometry

            if was_at_max:
                self._areas_pruned += 1
                # Log periodically when pruning (not every time to avoid spam)
                current_time = time.time()
                if current_time - self._last_prune_log >= 10.0:
                    fog_logger.debug(f"Fog areas at max ({MAX_FOG_CLEARED_AREAS}), "
                                   f"auto-pruning oldest. Total added: {self._areas_added}, "
                                   f"pruned: {self._areas_pruned}")
                    self._last_prune_log = current_time

            self.last_clear_position = (x, y)
            wall_count = len([e for e in config.get('elements', []) if e.get('isWall', False)]) if config else 0
            fog_logger.debug(f"Cleared fog at ({x}, {y}) radius={radius}, "
                           f"walls={wall_count}, areas={len(self.fog_cleared_areas)}/{MAX_FOG_CLEARED_AREAS}")
        else:
            fog_logger.debug(f"No visible area after shadow calculations at ({x}, {y})")

    def _create_circle_polygon(self, cx, cy, radius, segments=32):
        """Create a polygon approximation of a circle."""
        polygon = []
        for i in range(segments):
            angle = 2 * math.pi * i / segments
            x = cx + radius * math.cos(angle)
            y = cy + radius * math.sin(angle)
            polygon.append((x, y))
        return polygon

    def _wall_could_affect_area(self, wall, light_pos, radius):
        """Quick check if a wall could potentially cast shadows into the clear area."""
        wall_bounds = self._get_element_bounds(wall)
        if not wall_bounds:
            return False

        lx, ly = light_pos
        max_distance = radius * 2
        min_dist = self._point_to_rect_distance(lx, ly, wall_bounds)
        return min_dist <= max_distance

    def _get_element_bounds(self, element):
        """Get bounding rectangle for any element type."""
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
        """Calculate minimum distance from point to rectangle."""
        rx, ry, rw, rh = rect
        dx = max(rx - px, 0, px - (rx + rw))
        dy = max(ry - py, 0, py - (ry + rh))
        return math.sqrt(dx*dx + dy*dy)

    def _calculate_shadow_polygon(self, wall, light_pos, shadow_length):
        """Calculate shadow polygon cast by a wall element."""
        element_type = wall.get('type', '')

        if element_type == 'area':
            return self._calculate_rect_shadow(wall, light_pos, shadow_length)
        elif element_type == 'line':
            return self._calculate_line_shadow(wall, light_pos, shadow_length)
        elif element_type == 'token':
            return self._calculate_circle_shadow(wall, light_pos, shadow_length)
        elif element_type in ['gif', 'video', 'image', 'text']:
            return self._calculate_rect_shadow(wall, light_pos, shadow_length)

        return None

    def _calculate_rect_shadow(self, wall, light_pos, shadow_length):
        """Calculate shadow polygon for rectangular wall."""
        x = wall.get('x', 0)
        y = wall.get('y', 0)
        width = wall.get('width', 100)
        height = wall.get('height', 100)

        corners = [
            (x, y),
            (x + width, y),
            (x + width, y + height),
            (x, y + height)
        ]

        return self._calculate_polygon_shadow(corners, light_pos, shadow_length)

    def _calculate_line_shadow(self, wall, light_pos, shadow_length):
        """Calculate shadow polygon for line wall."""
        x1 = wall.get('x', 0)
        y1 = wall.get('y', 0)
        x2 = wall.get('endX', x1 + 100)
        y2 = wall.get('endY', y1 + 100)
        thickness = wall.get('thickness', 3)

        dx = x2 - x1
        dy = y2 - y1
        length = math.sqrt(dx*dx + dy*dy)
        if length == 0:
            return None

        nx = -dy / length * thickness / 2
        ny = dx / length * thickness / 2

        corners = [
            (x1 + nx, y1 + ny),
            (x2 + nx, y2 + ny),
            (x2 - nx, y2 - ny),
            (x1 - nx, y1 - ny)
        ]

        return self._calculate_polygon_shadow(corners, light_pos, shadow_length)

    def _calculate_circle_shadow(self, wall, light_pos, shadow_length):
        """Calculate shadow polygon for circular wall (token)."""
        cx = wall.get('x', 0)
        cy = wall.get('y', 0)
        radius = wall.get('size', 50) / 2

        lx, ly = light_pos

        dx = cx - lx
        dy = cy - ly
        dist = math.sqrt(dx*dx + dy*dy)

        if dist <= radius:
            return None

        angle_to_center = math.atan2(dy, dx)
        angle_offset = math.asin(radius / dist)

        tangent1_angle = angle_to_center + angle_offset
        tangent2_angle = angle_to_center - angle_offset

        t1x = cx + radius * math.cos(tangent1_angle + math.pi/2)
        t1y = cy + radius * math.sin(tangent1_angle + math.pi/2)
        t2x = cx + radius * math.cos(tangent2_angle - math.pi/2)
        t2y = cy + radius * math.sin(tangent2_angle - math.pi/2)

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
            return [(t1x, t1y), (t2x, t2y), shadow_points[1], shadow_points[0]]

        return None

    def _calculate_polygon_shadow(self, corners, light_pos, shadow_length):
        """Calculate shadow polygon for any polygon wall."""
        lx, ly = light_pos

        silhouette_points = []

        for i in range(len(corners)):
            p1 = corners[i]
            p2 = corners[(i + 1) % len(corners)]

            edge_x = p2[0] - p1[0]
            edge_y = p2[1] - p1[1]
            to_light_x = lx - (p1[0] + p2[0]) / 2
            to_light_y = ly - (p1[1] + p2[1]) / 2

            cross = edge_x * to_light_y - edge_y * to_light_x

            if cross > 0:
                if not silhouette_points or silhouette_points[-1] != p1:
                    silhouette_points.append(p1)
                silhouette_points.append(p2)

        if len(silhouette_points) < 2:
            return None

        unique_silhouette = []
        for point in silhouette_points:
            if not unique_silhouette or unique_silhouette[-1] != point:
                unique_silhouette.append(point)

        if len(unique_silhouette) < 2:
            return None

        shadow_polygon = []
        shadow_polygon.extend(unique_silhouette)

        for i in range(len(unique_silhouette) - 1, -1, -1):
            px, py = unique_silhouette[i]
            dx = px - lx
            dy = py - ly
            dist = math.sqrt(dx*dx + dy*dy)

            if dist > 0:
                shadow_x = lx + (dx / dist) * shadow_length
                shadow_y = ly + (dy / dist) * shadow_length
                shadow_polygon.append((shadow_x, shadow_y))

        return shadow_polygon if len(shadow_polygon) >= 3 else None

    def _get_wall_solid_polygon(self, wall):
        """Get the solid area polygon of a wall element."""
        element_type = wall.get('type', '')

        if element_type == 'area':
            return self._get_rect_polygon(wall)
        elif element_type == 'line':
            return self._get_line_polygon(wall)
        elif element_type == 'token':
            return self._get_circle_polygon(wall)
        elif element_type in ['gif', 'video', 'image', 'text']:
            return self._get_rect_polygon(wall)

        return None

    def _get_rect_polygon(self, wall):
        """Get polygon for rectangular wall."""
        x = wall.get('x', 0)
        y = wall.get('y', 0)
        width = wall.get('width', 100)
        height = wall.get('height', 100)

        return [
            (x, y),
            (x + width, y),
            (x + width, y + height),
            (x, y + height)
        ]

    def _get_line_polygon(self, wall):
        """Get polygon for line wall."""
        x1 = wall.get('x', 0)
        y1 = wall.get('y', 0)
        x2 = wall.get('endX', x1 + 100)
        y2 = wall.get('endY', y1 + 100)
        thickness = wall.get('thickness', 3)

        dx = x2 - x1
        dy = y2 - y1
        length = math.sqrt(dx*dx + dy*dy)
        if length == 0:
            return None

        nx = -dy / length * thickness / 2
        ny = dx / length * thickness / 2

        return [
            (x1 + nx, y1 + ny),
            (x2 + nx, y2 + ny),
            (x2 - nx, y2 - ny),
            (x1 - nx, y1 - ny)
        ]

    def _get_circle_polygon(self, wall):
        """Get polygon approximation for circular wall."""
        cx = wall.get('x', 0)
        cy = wall.get('y', 0)
        radius = wall.get('size', 50) / 2

        return self._create_circle_polygon(cx, cy, radius, segments=16)

    def _subtract_polygon_clipper(self, subject_polygon, clip_polygon):
        """Subtract clip_polygon from subject_polygon using Clipper library."""
        if not CLIPPER_AVAILABLE:
            return self._subtract_polygon_simple(subject_polygon, clip_polygon)

        if not subject_polygon or not clip_polygon:
            return subject_polygon

        try:
            clipper = pyclipper.Pyclipper()
            scale_factor = 1000

            subject_scaled = [(int(x * scale_factor), int(y * scale_factor))
                            for x, y in subject_polygon]
            clip_scaled = [(int(x * scale_factor), int(y * scale_factor))
                         for x, y in clip_polygon]

            clipper.AddPath(subject_scaled, pyclipper.PT_SUBJECT, True)
            clipper.AddPath(clip_scaled, pyclipper.PT_CLIP, True)

            solution = clipper.Execute(pyclipper.CT_DIFFERENCE,
                                     pyclipper.PFT_EVENODD,
                                     pyclipper.PFT_EVENODD)

            if not solution:
                return []

            largest_polygon = []
            largest_area = 0

            for polygon in solution:
                scaled_polygon = [(x / scale_factor, y / scale_factor) for x, y in polygon]
                area = self._calculate_polygon_area(scaled_polygon)
                if area > largest_area:
                    largest_area = area
                    largest_polygon = scaled_polygon

            return largest_polygon

        except Exception as e:
            print(f"Clipper operation failed: {e}, using fallback")
            return self._subtract_polygon_simple(subject_polygon, clip_polygon)

    def _subtract_polygon_simple(self, polygon1, polygon2):
        """Simplified polygon subtraction fallback."""
        if not polygon1 or not polygon2:
            return polygon1

        result_points = []
        for point in polygon1:
            if not self._point_in_polygon(point, polygon2):
                result_points.append(point)

        return result_points if len(result_points) >= 3 else []

    def _calculate_polygon_area(self, polygon):
        """Calculate polygon area using shoelace formula."""
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
        """Test if point is inside polygon using ray casting."""
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
        """Handle mouse motion events for fog clearing while dragging."""
        if not self.mouse_dragging:
            return

        fog_config = config.get('fog', {}) if config else {}
        clear_mode = fog_config.get('clearMode', True)

        if clear_mode:
            x, y = pos
            clear_radius = fog_config.get('clearRadius', 30)
            self.clear_fog_at_position(x, y, radius=clear_radius, config=config)

    def handle_mouse_click(self, pos, config=None):
        """Handle mouse click events for fog clearing."""
        fog_config = config.get('fog', {}) if config else {}
        fog_enabled = fog_config.get('enabled', False)
        clear_mode = fog_config.get('clearMode', True)

        fog_logger.debug(f"Mouse click at {pos}, fog_enabled={fog_enabled}, clear_mode={clear_mode}")

        if fog_enabled and clear_mode:
            x, y = pos
            clear_radius = fog_config.get('clearRadius', 30)
            fog_logger.debug(f"Clearing fog at ({x}, {y}) with radius {clear_radius}")
            self.clear_fog_at_position(x, y, radius=clear_radius, config=config)

    def start_dragging(self):
        """Start mouse dragging mode for fog clearing."""
        self.mouse_dragging = True
        self.last_clear_position = None

    def stop_dragging(self):
        """Stop mouse dragging mode."""
        self.mouse_dragging = False
        self.last_clear_position = None

    def _rebuild_stencil_batch(self):
        """Rebuild the cached stencil geometry from current fog_cleared_areas."""
        from pyglet import shapes

        self._stencil_shapes.clear()
        self._stencil_batch = pyglet.graphics.Batch()

        for cleared_area in self.fog_cleared_areas:
            if len(cleared_area) >= 1:
                center_x = sum(x for x, y in cleared_area) / len(cleared_area)
                center_y = sum(y for x, y in cleared_area) / len(cleared_area)

                if len(cleared_area) > 1:
                    radius = max(
                        ((x - center_x)**2 + (y - center_y)**2)**0.5
                        for x, y in cleared_area
                    )
                else:
                    radius = self.clear_radius

                circle = shapes.Circle(
                    center_x, center_y, radius,
                    color=(255, 255, 255),
                    batch=self._stencil_batch
                )
                self._stencil_shapes.append(circle)

        self._stencil_dirty = False

    def draw_fog_overlay(self, config):
        """
        Draw fog overlay with polygon-based cleared areas using Pyglet shapes.

        Stencil geometry is cached and only rebuilt when fog areas change,
        not on every draw frame.

        Args:
            config (dict): Configuration dictionary containing fog settings
        """
        fog_config = config.get('fog')
        if not fog_config or not fog_config.get('enabled', False):
            return
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

        # Normalize opacity: support both 0-1 and 0-100 ranges
        if opacity > 1.0:
            opacity = opacity / 100.0
        opacity_int = int(opacity * 255)

        # Rebuild stencil batch only when fog areas have changed
        if self._stencil_dirty:
            self._rebuild_stencil_batch()

        # Rebuild fog rect only when color/opacity changes
        if self._fog_rect is None or self._fog_rect_params != (r, g, b, opacity_int):
            from pyglet import shapes
            self._fog_rect = shapes.Rectangle(
                0, 0, self.window_width, self.window_height,
                color=(r, g, b)
            )
            self._fog_rect.opacity = opacity_int
            self._fog_rect_params = (r, g, b, opacity_int)

        # Use stencil buffer to cut holes in fog
        gl.glEnable(gl.GL_STENCIL_TEST)
        gl.glClear(gl.GL_STENCIL_BUFFER_BIT)

        # First pass: Draw cleared areas to stencil buffer
        gl.glColorMask(gl.GL_FALSE, gl.GL_FALSE, gl.GL_FALSE, gl.GL_FALSE)
        gl.glStencilFunc(gl.GL_ALWAYS, 1, 0xFF)
        gl.glStencilOp(gl.GL_KEEP, gl.GL_KEEP, gl.GL_REPLACE)

        self._stencil_batch.draw()

        # Second pass: Draw fog only where stencil is 0
        gl.glColorMask(gl.GL_TRUE, gl.GL_TRUE, gl.GL_TRUE, gl.GL_TRUE)
        gl.glStencilFunc(gl.GL_EQUAL, 0, 0xFF)
        gl.glStencilOp(gl.GL_KEEP, gl.GL_KEEP, gl.GL_KEEP)

        self._fog_rect.draw()

        # Disable stencil test
        gl.glDisable(gl.GL_STENCIL_TEST)

    def clear_all_fog(self):
        """Clear all fog cleared areas and reset statistics."""
        areas_before = len(self.fog_cleared_areas)
        self.fog_cleared_areas.clear()
        self.last_clear_position = None
        self._shadow_cache.clear()  # Also clear shadow cache
        # Reset stencil cache
        self._stencil_shapes.clear()
        self._stencil_batch = pyglet.graphics.Batch()
        self._stencil_dirty = True
        fog_logger.info(f"All fog cleared: removed {areas_before} areas, "
                       f"lifetime stats: added={self._areas_added}, pruned={self._areas_pruned}")

    def get_cleared_areas_count(self):
        """Get the number of cleared fog areas."""
        return len(self.fog_cleared_areas)

    def get_fog_stats(self):
        """
        Get detailed fog manager statistics for debugging.

        Returns:
            dict: Statistics including counts, memory estimates, and lifecycle info
        """
        # Estimate memory usage (rough approximation)
        # Each polygon point is 2 floats (8 bytes each on 64-bit)
        total_points = sum(len(area) for area in self.fog_cleared_areas)
        estimated_mem_bytes = total_points * 16  # 2 floats * 8 bytes

        return {
            'cleared_areas_count': len(self.fog_cleared_areas),
            'max_areas': MAX_FOG_CLEARED_AREAS,
            'utilization_percent': (len(self.fog_cleared_areas) / MAX_FOG_CLEARED_AREAS) * 100,
            'total_points': total_points,
            'estimated_memory_kb': estimated_mem_bytes / 1024,
            'areas_added_lifetime': self._areas_added,
            'areas_pruned_lifetime': self._areas_pruned,
            'shadow_cache_size': len(self._shadow_cache),
            'cache_hits': self._cache_hits,
            'clipper_available': CLIPPER_AVAILABLE,
        }

    def get_fog_config_info(self, config):
        """Get current fog configuration information."""
        fog_config = config.get('fog', {}) if config else {}

        stats = self.get_fog_stats()
        return {
            'enabled': fog_config.get('enabled', False),
            'clear_mode': fog_config.get('clearMode', True),
            'clear_radius': fog_config.get('clearRadius', 30),
            'opacity': fog_config.get('opacity', 0.3),
            'color': fog_config.get('color', '#808080'),
            'cleared_areas_count': stats['cleared_areas_count'],
            'max_areas': stats['max_areas'],
            'areas_pruned': stats['areas_pruned_lifetime'],
            'wall_shadows': 'clipper' if CLIPPER_AVAILABLE else 'simple'
        }

    def check_and_handle_clear_flag(self, config):
        """
        Check if fog should be cleared based on config flag.

        Args:
            config (dict): Configuration dictionary containing fog settings

        Returns:
            str or False: 'clear' if cleared via clear flag, 'clearReset' if cleared via clearReset flag, False otherwise
        """
        if not config:
            return False

        fog_config = config.get('fog')
        if not fog_config:
            return False

        # Check for clearReset flag (clears fog and resets itself)
        if fog_config.get('clearReset', False):
            self.clear_all_fog()
            fog_logger.info("Fog cleared via clearReset flag")
            return 'clearReset'

        # Check for regular clear flag
        if fog_config.get('clear', False):
            self.clear_all_fog()
            fog_logger.info("Fog cleared via clear flag")
            return 'clear'

        return False
