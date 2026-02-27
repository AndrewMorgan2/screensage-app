"""
Parsing utilities for dimensions, colors, and fonts.

Used by the display engine to convert config values to usable formats.
"""

import re
from typing import Tuple, Union

import pyglet


def parse_dimension(value: Union[int, float, str], reference_size: int) -> int:
    """
    Parse dimension value (can be pixels, percentage, or relative).

    Args:
        value: Can be int, float, or string like "50%"
        reference_size: Reference size for percentage calculations

    Returns:
        int: Pixel value
    """
    if isinstance(value, str):
        if value.endswith('%'):
            # Percentage value
            percent = float(value.rstrip('%'))
            return int(reference_size * percent / 100.0)
        else:
            # Try to parse as number
            return int(float(value))
    elif isinstance(value, float) and 0 <= value <= 1:
        # Relative value (0.0 to 1.0)
        return int(reference_size * value)
    else:
        # Direct pixel value
        return int(value)


def parse_font_size(value: Union[int, float, str], window_height: int,
                    reference_height: int = 1080) -> int:
    """
    Parse font size with special handling (matches original Pygame version).

    Supports:
    - Absolute pixels (int): 24 → 24px
    - Relative (float 0.0-1.0): 0.02 → 2% of screen height
    - Percentage string: "2%" → 2% of screen height
    - Auto-scaled (str with 'scaled'): "24scaled" → 24px scaled to screen

    Args:
        value: Font size value (int, float, or string)
        window_height: Current window height
        reference_height: Reference height for scaling (default 1080)

    Returns:
        int: Absolute font size in pixels
    """
    # Correction factor: pyglet renders fonts larger than CSS at same pixel size
    # This makes display engine match the web preview (5/6 ≈ 0.833)
    font_correction = 0.72

    if isinstance(value, str):
        if 'scaled' in value.lower():
            # Extract base size and scale it: "24scaled" → scale 24px
            base_size = int(''.join(filter(str.isdigit, value)))
            # Scale based on current height vs reference height (1080)
            scale_factor = window_height / reference_height
            return int(base_size * scale_factor * font_correction)
        elif value.endswith('%'):
            # Percentage of screen height
            percent = float(value.rstrip('%'))
            return int(window_height * percent / 100.0 * font_correction)
        else:
            # Try to parse as number
            return int(float(value) * font_correction)
    elif isinstance(value, float) and 0.0 <= value <= 1.0:
        # Relative to screen height
        return int(window_height * value * font_correction)
    else:
        # Absolute pixel value
        return int(value * font_correction)


def resolve_font_name(font_name: str) -> str:
    """
    Resolve font name to system font, with fallbacks.

    Supports common web fonts and maps them to system equivalents.
    Falls back to Arial if font not found.

    Args:
        font_name: Font name from config (e.g., 'Arial', 'Times New Roman')

    Returns:
        str: Resolved font name that pyglet can use
    """
    # Common font name mappings (case-insensitive lookup)
    font_mappings = {
        'arial': 'Arial',
        'times new roman': 'Times New Roman',
        'times': 'Times New Roman',
        'courier new': 'Courier New',
        'courier': 'Courier New',
        'georgia': 'Georgia',
        'verdana': 'Verdana',
        'comic sans': 'Comic Sans MS',
        'comic sans ms': 'Comic Sans MS',
        'trebuchet': 'Trebuchet MS',
        'trebuchet ms': 'Trebuchet MS',
        'impact': 'Impact',
        'lucida console': 'Lucida Console',
        'tahoma': 'Tahoma',
        'palatino': 'Palatino Linotype',
        'garamond': 'Garamond',
        # Linux equivalents
        'liberation sans': 'Liberation Sans',
        'liberation serif': 'Liberation Serif',
        'liberation mono': 'Liberation Mono',
        'dejavu sans': 'DejaVu Sans',
        'dejavu serif': 'DejaVu Serif',
        'dejavu sans mono': 'DejaVu Sans Mono',
        'freesans': 'FreeSans',
        'freeserif': 'FreeSerif',
        'freemono': 'FreeMono',
    }

    # Try case-insensitive lookup
    font_lower = font_name.lower().strip()
    resolved = font_mappings.get(font_lower, font_name)

    # Try to verify font exists using pyglet
    try:
        # Attempt to load the font to verify it exists
        pyglet.font.load(resolved)
        return resolved
    except Exception:
        # Font not found, try fallbacks
        fallbacks = ['Arial', 'Liberation Sans', 'DejaVu Sans', 'FreeSans']
        for fallback in fallbacks:
            try:
                pyglet.font.load(fallback)
                print(f"  ⚠️ Font '{font_name}' not found, using '{fallback}'")
                return fallback
            except Exception:
                continue

        # If all fallbacks fail, return original and let pyglet handle it
        print(f"  ⚠️ Font '{font_name}' not found, no fallback available")
        return font_name


def parse_color(color_str: str) -> Tuple[int, int, int, int]:
    """
    Parse color string to RGBA tuple.

    Supports:
    - Hex colors: #RRGGBB or #RRGGBBAA
    - RGBA format: rgba(r, g, b, a)
    - RGB format: rgb(r, g, b)

    Args:
        color_str: Color string to parse

    Returns:
        Tuple of (r, g, b, a) with values 0-255
    """
    if color_str.startswith('#'):
        # Hex color
        color_str = color_str.lstrip('#')
        if len(color_str) == 6:
            r = int(color_str[0:2], 16)
            g = int(color_str[2:4], 16)
            b = int(color_str[4:6], 16)
            return (r, g, b, 255)
        elif len(color_str) == 8:
            r = int(color_str[0:2], 16)
            g = int(color_str[2:4], 16)
            b = int(color_str[4:6], 16)
            a = int(color_str[6:8], 16)
            return (r, g, b, a)
    elif color_str.startswith('rgba') or color_str.startswith('rgb'):
        # rgba(r, g, b, a) or rgb(r, g, b) format
        match = re.match(r'rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)', color_str)
        if match:
            r, g, b, a = match.groups()
            a = float(a) if a else 1.0
            return (int(r), int(g), int(b), int(a * 255))

    # Default to white
    return (255, 255, 255, 255)
