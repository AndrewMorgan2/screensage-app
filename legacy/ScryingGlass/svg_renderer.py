import pygame
import os
import hashlib
from io import BytesIO
from threading import Lock
from PIL import Image

try:
    import cairosvg
    SVG_SUPPORT = True
except ImportError:
    SVG_SUPPORT = False
    print("⚠️  SVG support disabled: pip install cairosvg")


class SVGRenderer:
    """
    Complete SVG renderer with caching, color manipulation, and live updates.
    
    Features:
    - Intelligent caching based on file content and parameters
    - Dynamic color replacement and theming
    - Aspect ratio preservation
    - Live file watching and cache invalidation
    - Memory management for large SVG collections
    """
    
    def __init__(self, screen):
        """
        Initialize the SVG renderer.
        
        Args:
            screen (pygame.Surface): The pygame display surface to draw on
        """
        self.screen = screen
        self.svg_cache = {}  # Cache: {cache_key: (surface, file_hash, timestamp)}
        self.file_hashes = {}  # Track file modification: {filepath: hash}
        self.cache_lock = Lock()
        self.max_cache_size = 100  # Maximum cached SVGs
        self.cache_stats = {'hits': 0, 'misses': 0, 'invalidations': 0}
        
        if not SVG_SUPPORT:
            print("🚫 SVG rendering unavailable - install cairosvg: pip install cairosvg")
    
    def _get_file_hash(self, filepath):
        """
        Get MD5 hash of SVG file content for cache invalidation.
        
        Args:
            filepath (str): Path to SVG file
            
        Returns:
            str: MD5 hash of file content, or None if file doesn't exist
        """
        try:
            with open(filepath, 'rb') as f:
                return hashlib.md5(f.read()).hexdigest()
        except Exception:
            return None
    
    def _should_invalidate_cache(self, filepath, cache_key):
        """
        Check if cached SVG should be invalidated due to file changes.
        
        Args:
            filepath (str): Path to SVG file
            cache_key (str): Cache key for the SVG
            
        Returns:
            bool: True if cache should be invalidated
        """
        if not os.path.exists(filepath):
            return True
        
        # Check if we have cached data
        if cache_key not in self.svg_cache:
            return True
        
        # Get current file hash
        current_hash = self._get_file_hash(filepath)
        if not current_hash:
            return True
        
        # Compare with cached hash
        cached_data = self.svg_cache[cache_key]
        cached_hash = cached_data[1] if len(cached_data) > 1 else None
        
        return current_hash != cached_hash
    
    def _create_cache_key(self, filepath, width, height, color_overrides, rotation):
        """
        Create a unique cache key for SVG rendering parameters.
        
        Args:
            filepath (str): Path to SVG file
            width (int): Target width
            height (int): Target height  
            color_overrides (dict): Color replacement mapping
            rotation (float): Rotation angle in degrees
            
        Returns:
            str: Unique cache key
        """
        # Create deterministic key from parameters
        color_str = str(sorted(color_overrides.items())) if color_overrides else ""
        return f"{filepath}_{width}_{height}_{color_str}_{rotation}"
    
    def _apply_color_overrides(self, svg_content, color_overrides):
        """
        Apply color overrides to SVG content.
        
        Supports multiple color replacement strategies:
        - Direct hex color replacement
        - CSS class-based replacement
        - Attribute-based replacement
        
        Args:
            svg_content (str): Original SVG content
            color_overrides (dict): Color replacement mapping
            
        Returns:
            str: Modified SVG content with color overrides applied
        """
        if not color_overrides:
            return svg_content
        
        modified_content = svg_content
        
        for target, replacement in color_overrides.items():
            # Method 1: Direct color replacement
            if target.startswith('#') or target.startswith('rgb'):
                modified_content = modified_content.replace(f'fill="{target}"', f'fill="{replacement}"')
                modified_content = modified_content.replace(f'stroke="{target}"', f'stroke="{replacement}"')
                modified_content = modified_content.replace(f'color="{target}"', f'color="{replacement}"')
            
            # Method 2: CSS class replacement
            elif target.startswith('.'):
                class_name = target[1:]  # Remove dot
                # Replace CSS class definitions
                css_pattern = f'.{class_name}{{[^}}]*}}'
                import re
                modified_content = re.sub(
                    css_pattern, 
                    f'.{class_name}{{fill:{replacement};stroke:{replacement}}}', 
                    modified_content
                )
            
            # Method 3: ID-based replacement
            elif target.startswith('#') and not target[1:2].isdigit():
                element_id = target[1:]  # Remove hash
                # Find elements with this ID and modify their style
                id_pattern = f'id="{element_id}"[^>]*'
                import re
                matches = re.finditer(id_pattern, modified_content)
                for match in matches:
                    element = match.group()
                    if 'style=' in element:
                        # Modify existing style
                        modified_content = modified_content.replace(
                            element,
                            element.replace('style="', f'style="fill:{replacement};stroke:{replacement};')
                        )
                    else:
                        # Add style attribute
                        modified_content = modified_content.replace(
                            element,
                            element + f' style="fill:{replacement};stroke:{replacement};"'
                        )
        
        return modified_content
    
    def _render_svg_to_surface(self, filepath, width, height, color_overrides=None, rotation=0):
        """
        Render SVG file to pygame surface.
        
        Args:
            filepath (str): Path to SVG file
            width (int): Target width (None to preserve aspect ratio)
            height (int): Target height (None to preserve aspect ratio)
            color_overrides (dict): Color replacement mapping
            rotation (float): Rotation angle in degrees
            
        Returns:
            pygame.Surface: Rendered SVG as pygame surface
        """
        if not SVG_SUPPORT:
            return self._create_error_surface(width or 100, height or 100, "SVG support not installed")
        
        try:
            # Read SVG file
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                svg_content = f.read()
            
            # Apply color overrides
            if color_overrides:
                svg_content = self._apply_color_overrides(svg_content, color_overrides)
            
            # Apply rotation if specified
            if rotation != 0:
                # Wrap SVG content in a rotated group
                import xml.etree.ElementTree as ET
                try:
                    root = ET.fromstring(svg_content)
                    # Get SVG dimensions for rotation center
                    svg_width = int(root.get('width', 100))
                    svg_height = int(root.get('height', 100))
                    center_x, center_y = svg_width / 2, svg_height / 2
                    
                    # Create rotation transform
                    transform = f"rotate({rotation} {center_x} {center_y})"
                    
                    # Wrap content in transformed group
                    svg_content = svg_content.replace(
                        '<svg',
                        f'<svg><g transform="{transform}"><svg'
                    ).replace('</svg>', '</svg></g></svg>')
                except Exception as e:
                    print(f"Warning: Could not apply rotation to SVG: {e}")
            
            # Convert SVG to PNG in memory
            png_data = cairosvg.svg2png(
                bytestring=svg_content.encode('utf-8'),
                output_width=width,
                output_height=height
            )
            
            # Load PNG data as PIL image
            pil_image = Image.open(BytesIO(png_data))
            
            # Ensure RGBA format for proper transparency
            if pil_image.mode != "RGBA":
                pil_image = pil_image.convert("RGBA")
            
            # Convert to pygame surface
            raw = pil_image.tobytes()
            surface = pygame.image.fromstring(raw, pil_image.size, "RGBA")
            
            return surface
            
        except Exception as e:
            print(f"Error rendering SVG {filepath}: {e}")
            return self._create_error_surface(width or 100, height or 100, f"SVG Error: {str(e)[:30]}")
    
    def _create_error_surface(self, width, height, error_msg):
        """
        Create an error placeholder surface when SVG rendering fails.
        
        Args:
            width (int): Surface width
            height (int): Surface height
            error_msg (str): Error message to display
            
        Returns:
            pygame.Surface: Error placeholder surface
        """
        surface = pygame.Surface((width, height), pygame.SRCALPHA)
        
        # Draw error background
        pygame.draw.rect(surface, (255, 0, 0, 100), (0, 0, width, height))
        pygame.draw.rect(surface, (255, 255, 255), (0, 0, width, height), 2)
        
        # Draw error icon (X)
        center_x, center_y = width // 2, height // 2
        pygame.draw.line(surface, (255, 255, 255), (center_x - 10, center_y - 10), (center_x + 10, center_y + 10), 3)
        pygame.draw.line(surface, (255, 255, 255), (center_x - 10, center_y + 10), (center_x + 10, center_y - 10), 3)
        
        # Draw error text if space allows
        if width > 100 and height > 30:
            font = pygame.font.Font(None, 16)
            text_lines = [error_msg[i:i+15] for i in range(0, len(error_msg), 15)]
            for i, line in enumerate(text_lines[:3]):  # Max 3 lines
                text_surface = font.render(line, True, (255, 255, 255))
                text_rect = text_surface.get_rect(center=(center_x, center_y + 20 + i * 16))
                surface.blit(text_surface, text_rect)
        
        return surface
    
    def _manage_cache_size(self):
        """
        Manage cache size by removing oldest entries when limit is exceeded.
        Uses LRU (Least Recently Used) strategy.
        """
        if len(self.svg_cache) <= self.max_cache_size:
            return
        
        # Sort by timestamp (oldest first)
        sorted_items = sorted(
            self.svg_cache.items(),
            key=lambda x: x[1][2] if len(x[1]) > 2 else 0
        )
        
        # Remove oldest entries
        items_to_remove = len(self.svg_cache) - self.max_cache_size + 10  # Remove extra for buffer
        for i in range(items_to_remove):
            if i < len(sorted_items):
                cache_key = sorted_items[i][0]
                del self.svg_cache[cache_key]
                print(f"🗑️  Removed cached SVG: {cache_key[:50]}...")
    
    def draw_svg(self, element):
        """
        Draw an SVG element with full feature support.
        
        Args:
            element (dict): SVG element configuration
                Required:
                - src: Path to SVG file
                - x, y: Position coordinates
                Optional:
                - width, height: Target dimensions (maintains aspect ratio if only one given)
                - colorOverrides: Dict of color replacements
                - rotation: Rotation angle in degrees
                - scaleX, scaleY: Scaling factors
                - opacity: Alpha transparency (0.0-1.0)
                - label: Debug label
                - invisible: Hide/show flag
        """
        if element.get('invisible', False):
            return
        
        # Required parameters
        svg_src = element.get('src')
        if not svg_src:
            print(f"Warning: SVG element {element.get('id', 'unknown')} has no src")
            return
        
        if not os.path.exists(svg_src):
            print(f"Warning: SVG file not found: {svg_src}")
            return
        
        x = int(element['x'])
        y = int(element['y'])
        
        # Optional parameters with defaults
        width = element.get('width')
        height = element.get('height')
        color_overrides = element.get('colorOverrides', {})
        rotation = element.get('rotation', 0)
        scale_x = element.get('scaleX', 1.0)
        scale_y = element.get('scaleY', 1.0)
        opacity = element.get('opacity', 1.0)
        
        # Apply scaling to dimensions
        if width:
            width = int(width * scale_x)
        if height:
            height = int(height * scale_y)
        
        # Create cache key
        cache_key = self._create_cache_key(svg_src, width, height, color_overrides, rotation)
        
        # Check cache and file modifications
        surface = None
        with self.cache_lock:
            if cache_key in self.svg_cache and not self._should_invalidate_cache(svg_src, cache_key):
                # Cache hit
                surface = self.svg_cache[cache_key][0]
                self.cache_stats['hits'] += 1
                # Update timestamp for LRU
                cached_data = self.svg_cache[cache_key]
                self.svg_cache[cache_key] = (cached_data[0], cached_data[1], pygame.time.get_ticks())
            else:
                # Cache miss or invalidation
                if cache_key in self.svg_cache:
                    self.cache_stats['invalidations'] += 1
                else:
                    self.cache_stats['misses'] += 1
                
                # Render new surface
                surface = self._render_svg_to_surface(svg_src, width, height, color_overrides, rotation)
                
                # Cache the result with file hash and timestamp
                file_hash = self._get_file_hash(svg_src)
                timestamp = pygame.time.get_ticks()
                self.svg_cache[cache_key] = (surface, file_hash, timestamp)
                
                # Manage cache size
                self._manage_cache_size()
        
        if surface:
            # Apply opacity if specified
            if opacity < 1.0:
                # Create temporary surface for opacity
                temp_surface = surface.copy()
                alpha = int(255 * opacity)
                temp_surface.set_alpha(alpha)
                surface = temp_surface
            
            # Draw the SVG
            self.screen.blit(surface, (x, y))
            
            # Draw label if present (for debugging)
            if element.get('label'):
                self._draw_debug_label(element, x, y, surface.get_width(), surface.get_height())
    
    def _draw_debug_label(self, element, x, y, width, height):
        """Draw debug label for SVG elements."""
        label = element.get('label', '')
        if not label:
            return
        
        # Draw bounding box
        pygame.draw.rect(self.screen, (0, 255, 255), (x - 1, y - 1, width + 2, height + 2), 1)
        
        # Draw label background
        font = pygame.font.Font(None, 16)
        label_text = f"SVG: {label}"
        text_surface = font.render(label_text, True, (255, 255, 255))
        text_rect = text_surface.get_rect()
        text_rect.bottomleft = (x, y - 2)
        
        # Draw label background
        bg_rect = text_rect.inflate(4, 2)
        pygame.draw.rect(self.screen, (0, 0, 0, 180), bg_rect)
        self.screen.blit(text_surface, text_rect)
    
    def get_svg_bounds(self, element):
        """
        Get the bounding rectangle of an SVG element.
        
        Args:
            element (dict): SVG element configuration
            
        Returns:
            pygame.Rect: Bounding rectangle of the SVG element
        """
        x = int(element.get('x', 0))
        y = int(element.get('y', 0))
        
        # Try to get cached surface dimensions
        svg_src = element.get('src')
        if svg_src and os.path.exists(svg_src):
            width = element.get('width')
            height = element.get('height')
            color_overrides = element.get('colorOverrides', {})
            rotation = element.get('rotation', 0)
            
            cache_key = self._create_cache_key(svg_src, width, height, color_overrides, rotation)
            
            if cache_key in self.svg_cache:
                surface = self.svg_cache[cache_key][0]
                return pygame.Rect(x, y, surface.get_width(), surface.get_height())
        
        # Fallback to specified or default dimensions
        width = element.get('width', 100)
        height = element.get('height', 100)
        scale_x = element.get('scaleX', 1.0)
        scale_y = element.get('scaleY', 1.0)
        
        return pygame.Rect(x, y, int(width * scale_x), int(height * scale_y))
    
    def preload_svg(self, filepath, width=None, height=None, color_overrides=None):
        """
        Preload an SVG into cache for faster first render.
        
        Args:
            filepath (str): Path to SVG file
            width (int): Target width
            height (int): Target height
            color_overrides (dict): Color replacement mapping
        """
        if not os.path.exists(filepath):
            print(f"Cannot preload SVG: file not found: {filepath}")
            return
        
        cache_key = self._create_cache_key(filepath, width, height, color_overrides or {}, 0)
        
        if cache_key not in self.svg_cache:
            print(f"🔄 Preloading SVG: {os.path.basename(filepath)}")
            surface = self._render_svg_to_surface(filepath, width, height, color_overrides)
            file_hash = self._get_file_hash(filepath)
            timestamp = pygame.time.get_ticks()
            
            with self.cache_lock:
                self.svg_cache[cache_key] = (surface, file_hash, timestamp)
    
    def clear_cache(self):
        """Clear all cached SVG data."""
        with self.cache_lock:
            self.svg_cache.clear()
            self.cache_stats = {'hits': 0, 'misses': 0, 'invalidations': 0}
        print("🗑️  SVG cache cleared")
    
    def get_cache_stats(self):
        """
        Get cache performance statistics.
        
        Returns:
            dict: Cache statistics including hits, misses, size, etc.
        """
        with self.cache_lock:
            total_requests = self.cache_stats['hits'] + self.cache_stats['misses']
            hit_rate = self.cache_stats['hits'] / total_requests if total_requests > 0 else 0
            
            return {
                'cache_size': len(self.svg_cache),
                'max_cache_size': self.max_cache_size,
                'hits': self.cache_stats['hits'],
                'misses': self.cache_stats['misses'],
                'invalidations': self.cache_stats['invalidations'],
                'hit_rate': hit_rate * 100,  # Percentage
                'memory_usage': f"{len(self.svg_cache)} SVGs cached"
            }
    
    def cleanup(self):
        """Clean up SVG renderer resources."""
        with self.cache_lock:
            cache_size = len(self.svg_cache)
            self.svg_cache.clear()
            self.file_hashes.clear()
        
        print(f"✓ SVG renderer cleanup complete ({cache_size} cached SVGs cleared)")


# Validation and template functions for SVG elements

def validate_svg_element(element):
    """
    Validate SVG element configuration.
    
    Args:
        element (dict): SVG element configuration to validate
        
    Returns:
        list: List of validation error messages (empty if valid)
    """
    errors = []
    
    # Check required fields
    if 'src' not in element:
        errors.append("SVG element missing required 'src' field")
    elif not os.path.exists(element['src']):
        errors.append(f"SVG file not found: {element['src']}")
    elif not element['src'].lower().endswith('.svg'):
        errors.append(f"File is not an SVG: {element['src']}")
    
    if 'x' not in element:
        errors.append("SVG element missing required 'x' coordinate")
    if 'y' not in element:
        errors.append("SVG element missing required 'y' coordinate")
    
    # Validate numeric fields
    numeric_fields = ['x', 'y', 'width', 'height', 'rotation', 'scaleX', 'scaleY', 'opacity']
    for field in numeric_fields:
        if field in element:
            try:
                float(element[field])
            except (ValueError, TypeError):
                errors.append(f"Field '{field}' must be numeric, got: {element[field]}")
    
    # Validate opacity range
    if 'opacity' in element:
        opacity = float(element['opacity'])
        if opacity < 0.0 or opacity > 1.0:
            errors.append(f"Opacity must be between 0.0 and 1.0, got: {opacity}")
    
    # Validate color overrides
    if 'colorOverrides' in element:
        if not isinstance(element['colorOverrides'], dict):
            errors.append("colorOverrides must be a dictionary")
    
    return errors

def create_svg_element_template(x=100, y=100):
    """
    Create a template SVG element configuration.
    
    Args:
        x (int): Default x coordinate
        y (int): Default y coordinate
        
    Returns:
        dict: Template SVG element configuration
    """
    return {
        "type": "svg",
        "id": "new_svg",
        "src": "/path/to/icon.svg",
        "x": x,
        "y": y,
        "width": 64,
        "height": 64,
        "colorOverrides": {
            "#000000": "#3498db",  # Replace black with blue
            "#ffffff": "#ecf0f1"   # Replace white with light gray
        },
        "rotation": 0,
        "scaleX": 1.0,
        "scaleY": 1.0,
        "opacity": 1.0,
        "label": "New SVG",
        "invisible": False
    }

# Example configurations for common SVG use cases

def create_icon_svg(icon_path, x, y, size=32, color="#ffffff"):
    """Create a simple icon SVG configuration."""
    return {
        "type": "svg",
        "id": f"icon_{os.path.basename(icon_path).split('.')[0]}",
        "src": icon_path,
        "x": x,
        "y": y,
        "width": size,
        "height": size,
        "colorOverrides": {"#000000": color},
        "invisible": False
    }

def create_logo_svg(logo_path, x, y, width, height=None):
    """Create a logo SVG configuration with aspect ratio preservation."""
    config = {
        "type": "svg",
        "id": f"logo_{os.path.basename(logo_path).split('.')[0]}",
        "src": logo_path,
        "x": x,
        "y": y,
        "width": width,
        "invisible": False
    }
    
    if height:
        config["height"] = height
    
    return config

def create_animated_svg(svg_path, x, y, rotation_speed=1.0):
    """Create an SVG that can be animated through rotation.""" 
    return {
        "type": "svg",
        "id": f"animated_{os.path.basename(svg_path).split('.')[0]}",
        "src": svg_path,
        "x": x,
        "y": y,
        "width": 64,
        "height": 64,
        "rotation": 0,  # This would be updated by animation system
        "label": f"Animated SVG (speed: {rotation_speed})",
        "invisible": False
    }