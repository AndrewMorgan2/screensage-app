#!/usr/bin/env python3
"""
Screen Relative Helper Module
Converts relative screen coordinates and sizes to absolute pixels.
"""

class ScreenRelativeHelper:
    """
    Helper class to convert relative screen coordinates (0.0-1.0 or percentages)
    to absolute pixel values based on screen dimensions.
    """

    def __init__(self, screen_width, screen_height):
        """
        Initialize with screen dimensions.

        Args:
            screen_width (int): Screen width in pixels
            screen_height (int): Screen height in pixels
        """
        self.screen_width = screen_width
        self.screen_height = screen_height
        self.reference_height = 1080  # Reference resolution for font scaling

    def update_dimensions(self, screen_width, screen_height):
        """
        Update screen dimensions (e.g., when window is resized).

        Args:
            screen_width (int): New screen width in pixels
            screen_height (int): New screen height in pixels
        """
        self.screen_width = screen_width
        self.screen_height = screen_height

    def get_x(self, value):
        """
        Convert x coordinate to absolute pixels.

        Supports:
        - Absolute pixels (int): 100 -> 100px
        - Relative (float 0.0-1.0): 0.5 -> 50% of screen width
        - Percentage string: "50%" -> 50% of screen width

        Args:
            value: X coordinate value (int, float, or string)

        Returns:
            int: Absolute x coordinate in pixels
        """
        if isinstance(value, str) and '%' in value:
            # Parse percentage string: "50%" -> 0.5
            percent = float(value.rstrip('%')) / 100.0
            return int(self.screen_width * percent)
        elif isinstance(value, float) and 0.0 <= value <= 1.0:
            # Relative value: 0.5 -> 50% of screen width
            return int(self.screen_width * value)
        else:
            # Absolute pixel value
            return int(value)

    def get_y(self, value):
        """
        Convert y coordinate to absolute pixels.

        Supports:
        - Absolute pixels (int): 100 -> 100px
        - Relative (float 0.0-1.0): 0.5 -> 50% of screen height
        - Percentage string: "50%" -> 50% of screen height

        Args:
            value: Y coordinate value (int, float, or string)

        Returns:
            int: Absolute y coordinate in pixels
        """
        if isinstance(value, str) and '%' in value:
            # Parse percentage string: "50%" -> 0.5
            percent = float(value.rstrip('%')) / 100.0
            return int(self.screen_height * percent)
        elif isinstance(value, float) and 0.0 <= value <= 1.0:
            # Relative value: 0.5 -> 50% of screen height
            return int(self.screen_height * value)
        else:
            # Absolute pixel value
            return int(value)

    def get_size(self, value, dimension='width'):
        """
        Convert size to absolute pixels.

        Supports:
        - Absolute pixels (int): 100 -> 100px
        - Relative (float 0.0-1.0): 0.5 -> 50% of screen dimension
        - Percentage string: "50%" -> 50% of screen dimension

        Args:
            value: Size value (int, float, or string)
            dimension (str): 'width' or 'height' for which dimension to use

        Returns:
            int: Absolute size in pixels
        """
        reference = self.screen_width if dimension == 'width' else self.screen_height

        if isinstance(value, str) and '%' in value:
            # Parse percentage string: "50%" -> 0.5
            percent = float(value.rstrip('%')) / 100.0
            return int(reference * percent)
        elif isinstance(value, float) and 0.0 <= value <= 1.0:
            # Relative value: 0.5 -> 50% of dimension
            return int(reference * value)
        else:
            # Absolute pixel value
            return int(value)

    def get_font_size(self, value):
        """
        Convert font size to absolute pixels with screen scaling.

        Supports:
        - Absolute pixels (int): 24 -> 24px
        - Relative (float 0.0-1.0): 0.02 -> 2% of screen height
        - Percentage string: "2%" -> 2% of screen height
        - Auto-scaled (str with 'scaled'): "24scaled" -> 24px scaled to screen

        Args:
            value: Font size value (int, float, or string)

        Returns:
            int: Absolute font size in pixels
        """
        if isinstance(value, str):
            if 'scaled' in value.lower():
                # Extract base size and scale it: "24scaled" -> scale 24px
                base_size = int(''.join(filter(str.isdigit, value)))
                scale_factor = self.screen_height / self.reference_height
                return int(base_size * scale_factor)
            elif '%' in value:
                # Percentage of screen height
                percent = float(value.rstrip('%')) / 100.0
                return int(self.screen_height * percent)
        elif isinstance(value, float) and 0.0 <= value <= 1.0:
            # Relative to screen height
            return int(self.screen_height * value)
        else:
            # Absolute pixel value
            return int(value)

    def is_relative(self, value):
        """
        Check if a value is using relative coordinates.

        Args:
            value: Value to check

        Returns:
            bool: True if value is relative (float 0-1 or percentage string)
        """
        if isinstance(value, str) and '%' in value:
            return True
        elif isinstance(value, float) and 0.0 <= value <= 1.0:
            return True
        return False
