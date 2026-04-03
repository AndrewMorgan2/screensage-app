"""
Parsing utilities for dimensions, colors, fonts, and video resolution checks.

Used by the display engine to convert config values to usable formats.
"""

import os
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
        # Font not found — try platform-appropriate fallbacks first
        import sys
        if sys.platform == 'win32':
            platform_fallbacks = ['Segoe UI', 'Calibri', 'Arial']
        elif sys.platform == 'darwin':
            platform_fallbacks = ['Helvetica Neue', 'Helvetica', 'Arial']
        else:
            platform_fallbacks = ['Liberation Sans', 'DejaVu Sans', 'FreeSans']
        fallbacks = platform_fallbacks + ['Arial', 'Liberation Sans', 'DejaVu Sans', 'FreeSans']
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


def get_optimal_video_path(video_path: str, display_width: int, display_height: int,
                            video_width: int = None, video_height: int = None) -> str:
    """
    Check if a video is oversized for the display and return the best path to load.

    When video native resolution significantly exceeds the display (ratio > 1.5x),
    checks for a pre-downscaled version named <original>_display.<ext> and returns
    it if found. Otherwise logs a prominent warning with the ffmpeg command to fix it.

    Args:
        video_path: Original video file path
        display_width: Display/window width in pixels
        display_height: Display/window height in pixels
        video_width: Known video width from video_format (skips ffprobe if provided)
        video_height: Known video height from video_format (skips ffprobe if provided)

    Returns:
        Path to load — may be a pre-converted version if one exists.
    """
    # If dimensions weren't provided, try ffprobe
    if video_width is None or video_height is None:
        try:
            import subprocess
            import json as _json
            result = subprocess.run(
                ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_streams', video_path],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                probe = _json.loads(result.stdout)
                for stream in probe.get('streams', []):
                    if stream.get('codec_type') == 'video':
                        video_width = int(stream.get('width', 0))
                        video_height = int(stream.get('height', 0))
                        break
        except Exception:
            pass

    if not video_width or not video_height:
        return video_path  # Can't determine dimensions — use original

    # Check if video significantly exceeds display resolution
    ratio_w = video_width / display_width
    ratio_h = video_height / display_height
    max_ratio = max(ratio_w, ratio_h)

    if max_ratio <= 1.5:
        return video_path  # Close enough, no action needed

    # Video is too large for display — check for a pre-converted version
    base, ext = os.path.splitext(video_path)
    candidates = [
        f"{base}_display{ext}",
        f"{base}_display.mp4",
        f"{base}_1080p{ext}",
        f"{base}_1080p.mp4",
    ]

    for candidate in candidates:
        if os.path.exists(candidate):
            print(f"  ✓ Found pre-converted version: {os.path.basename(candidate)}")
            print(f"    (original {video_width}x{video_height} → display {display_width}x{display_height})")
            return candidate

    # No pre-converted version — warn with the fix command
    sep = "!" * 62
    print(f"\n{sep}")
    print(f"  WARNING: VIDEO RESOLUTION EXCEEDS DISPLAY ({max_ratio:.1f}x larger)")
    print(f"  File:    {os.path.basename(video_path)}")
    print(f"  Video:   {video_width}x{video_height}  |  Display: {display_width}x{display_height}")
    print(f"  Impact:  Severe lag — software decoder saturated on this GPU")
    print(f"")
    print(f"  Fix — run this once to create a display-resolution version:")
    print(f'    ffmpeg -i "{video_path}" \\')
    print(f'      -vf scale={display_width}:{display_height} \\')
    print(f'      -c:v libx264 -crf 23 -pix_fmt yuv420p -c:a copy \\')
    print(f'      "{base}_display{ext}"')
    print(f"  ScreenSage will auto-detect and use the _display version on next run.")
    print(f"{sep}\n")

    return video_path


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
