"""
Element loading functions for the Pyglet Display Engine.

This module provides a mixin class with methods to load different element types
(video, image, text, token, area, line, cone, gif, bar) from configuration.
"""

import os
import traceback
from typing import Dict, Any

import pyglet
from pyglet import shapes
from pyglet.media import Player, load as media_load

from parsing_utils import parse_dimension, parse_font_size, resolve_font_name, parse_color
from debug_stats import debug_stats


class ElementLoaderMixin:
    """
    Mixin class that provides element loading functionality.

    Classes using this mixin must have:
    - self.window: Pyglet window
    - self.batch: Pyglet graphics batch
    - self.sprites: Dict for sprite storage
    - self.video_players: Dict for video player storage
    - self.shapes: Dict for shape storage
    - self.animations: Dict for animation storage
    - self.scale_x, self.scale_y: Resolution scaling factors
    - self.reference_height: Reference height for scaling
    """

    def load_elements(self):
        """Load all elements from configuration."""
        elements = self.config.get('elements', [])

        for element in elements:
            element_type = element.get('type')
            element_id = element.get('id', f'{element_type}_{id(element)}')

            try:
                if element_type == 'video':
                    self.load_video_element(element_id, element)
                elif element_type == 'image':
                    self.load_image_element(element_id, element)
                elif element_type == 'text':
                    self.load_text_element(element_id, element)
                elif element_type == 'token':
                    self.load_token_element(element_id, element)
                elif element_type == 'area':
                    self.load_area_element(element_id, element)
                elif element_type == 'line':
                    self.load_line_element(element_id, element)
                elif element_type == 'cone':
                    self.load_cone_element(element_id, element)
                elif element_type == 'gif':
                    self.load_gif_element(element_id, element)
                elif element_type == 'bar':
                    self.load_bar_element(element_id, element)
                else:
                    print(f"⚠️  Unknown element type: {element_type}")
            except Exception as e:
                print(f"Error loading element {element_id}: {e}")
                traceback.print_exc()

    def load_video_element(self, element_id: str, element: Dict[str, Any]):
        """
        Load a video element with hardware-accelerated playback.

        Pyglet natively supports video with alpha channels!
        """
        video_path = element.get('src')

        if not video_path or not os.path.exists(video_path):
            print(f"Video file not found: {video_path}")
            return

        # Parse dimensions (support percentages and relative values)
        window_width = self.window.width
        window_height = self.window.height

        # Apply resolution scaling to x/y coordinates
        x = parse_dimension(element.get('x', 0), window_width) * self.scale_x
        # Flip Y coordinate (Pyglet: bottom-left origin, Web: top-left origin)
        y = window_height - (parse_dimension(element.get('y', 0), window_height) * self.scale_y)

        width = None
        height = None
        if 'width' in element:
            width = parse_dimension(element.get('width'), window_width)
        if 'height' in element:
            height = parse_dimension(element.get('height'), window_height)

        try:
            # Load video source
            source = media_load(video_path)

            # Create player
            player = Player()

            # Set up looping if requested (default: True)
            loop = element.get('loop', True)
            if loop:
                player.loop = True  # Enable built-in looping

            player.queue(source)

            # Get video texture
            # Note: Pyglet handles alpha channels automatically!
            video_format = source.video_format

            if video_format:
                print(f"✓ Loaded video: {element_id}")
                print(f"  File: {video_path}")
                print(f"  Resolution: {video_format.width}x{video_format.height}")
                print(f"  FPS: {source.video_format.frame_rate if hasattr(source.video_format, 'frame_rate') else 'unknown'}")

                # Calculate scaling
                if width and height:
                    scale_x = width / video_format.width
                    scale_y = height / video_format.height
                elif width:
                    scale_x = scale_y = width / video_format.width
                elif height:
                    scale_x = scale_y = height / video_format.height
                else:
                    scale_x = scale_y = 1.0

                # Get opacity (0-100 or 0.0-1.0)
                opacity = element.get('opacity', 100)
                if opacity > 1.0:
                    opacity = opacity / 100.0

                # Get rotation (degrees)
                rotation = element.get('rotation', 0)

                # Get invisible flag (default: False)
                invisible = element.get('invisible', False)

                # Store player and metadata
                self.video_players[element_id] = {
                    'player': player,
                    'source': source,
                    'element': element,
                    'x': x,
                    'y': y,
                    'scale_x': scale_x,
                    'scale_y': scale_y,
                    'opacity': int(255 * opacity),
                    'rotation': rotation,
                    'video_format': video_format,  # Store format for anchor calculations
                    'invisible': invisible,
                }

                # Start playback
                player.play()
                debug_stats.videos_created += 1

            else:
                print(f"⚠️  No video format found in {video_path}")

        except Exception as e:
            print(f"Error loading video {video_path}: {e}")
            traceback.print_exc()

    def load_image_element(self, element_id: str, element: Dict[str, Any]):
        """Load a static image element."""
        image_path = element.get('src')

        if not image_path or not os.path.exists(image_path):
            print(f"Image file not found: {image_path}")
            return

        # Parse dimensions (support percentages and relative values)
        window_width = self.window.width
        window_height = self.window.height

        # Apply resolution scaling to x/y coordinates
        x = parse_dimension(element.get('x', 0), window_width) * self.scale_x
        # Flip Y coordinate (Pyglet: bottom-left origin, Web: top-left origin)
        y = window_height - (parse_dimension(element.get('y', 0), window_height) * self.scale_y)

        width = None
        height = None
        if 'width' in element:
            width = parse_dimension(element.get('width'), window_width)
        if 'height' in element:
            height = parse_dimension(element.get('height'), window_height)

        rotation = element.get('rotation', 0)
        opacity = element.get('opacity', 100)

        try:
            # Check if invisible (default: False)
            invisible = element.get('invisible', False)

            # Load image
            image = pyglet.image.load(image_path)

            # Calculate scaling
            scale_x = 1.0
            scale_y = 1.0

            if width and height:
                scale_x = width / image.width
                scale_y = height / image.height
            elif width:
                scale = width / image.width
                scale_x = scale_y = scale
            elif height:
                scale = height / image.height
                scale_x = scale_y = scale

            # Set anchor on the IMAGE (not sprite) for center rotation
            image.anchor_x = image.width // 2
            image.anchor_y = image.height // 2

            # Calculate center position using SCALED dimensions
            # (y is TOP of element after Y flip, so subtract half height to get center)
            scaled_width = image.width * scale_x
            scaled_height = image.height * scale_y

            # Only add to batch if not invisible
            sprite = pyglet.sprite.Sprite(
                image,
                x=x + scaled_width / 2,
                y=y - scaled_height / 2,  # Subtract because y is top in Pyglet bottom-left coords
                batch=self.batch if not invisible else None
            )

            # Apply scaling
            sprite.scale_x = scale_x
            sprite.scale_y = scale_y

            # Apply rotation (negated for opposite direction)
            sprite.rotation = -rotation

            # Apply opacity (0-100 or 0.0-1.0)
            if opacity > 1.0:
                opacity = opacity / 100.0
            sprite.opacity = int(255 * opacity)

            self.sprites[element_id] = sprite
            debug_stats.sprites_created += 1

            print(f"✓ Loaded image: {element_id} ({image.width}x{image.height}){' [INVISIBLE]' if invisible else ''}")

        except Exception as e:
            print(f"Error loading image {image_path}: {e}")
            traceback.print_exc()

    def load_text_element(self, element_id: str, element: Dict[str, Any]):
        """Load a text element."""
        text_content = element.get('text', 'Sample Text')

        # Parse dimensions (support percentages and relative values)
        window_width = self.window.width
        window_height = self.window.height

        # Apply resolution scaling to x/y coordinates
        x = parse_dimension(element.get('x', 0), window_width) * self.scale_x
        # Flip Y coordinate (Pyglet: bottom-left origin, Web: top-left origin)
        y = window_height - (parse_dimension(element.get('y', 0), window_height) * self.scale_y)

        font_name_raw = element.get('font', 'Arial')
        font_name = resolve_font_name(font_name_raw)
        # Parse font size with special handling (matches original Pygame version)
        raw_size = element.get('size', 24)
        font_size = parse_font_size(raw_size, window_height, self.reference_height)
        color_str = element.get('color', '#ffffff')
        alignment = element.get('alignment', 'left')
        rotation = element.get('rotation', 0)

        # Parse color (hex to RGB)
        color = parse_color(color_str)

        try:
            # Check if invisible (default: False)
            invisible = element.get('invisible', False)

            # Only add to batch if not invisible
            batch = self.batch if not invisible else None

            # Create label
            # Note: y is now the TOP of element (after Y flip), so use anchor_y='top'
            label = pyglet.text.Label(
                text_content,
                font_name=font_name,
                font_size=font_size,
                x=x,
                y=y,
                color=color,
                anchor_x=alignment,
                anchor_y='top',  # Changed from 'bottom' to match web top-left positioning
                batch=batch
            )

            # Apply rotation (negated for opposite direction)
            label.rotation = -rotation

            self.sprites[element_id] = label
            debug_stats.sprites_created += 1

            print(f"✓ Loaded text: {element_id} (font: {font_name}){' [INVISIBLE]' if invisible else ''}")

        except Exception as e:
            print(f"Error loading text element: {e}")
            traceback.print_exc()

    def load_token_element(self, element_id: str, element: Dict[str, Any]):
        """Load a token element (circular marker)."""
        window_width = self.window.width
        window_height = self.window.height

        # Get raw coordinates from config
        raw_x = element.get('x', 0)
        raw_y = element.get('y', 0)
        raw_size = element.get('size', 50)

        # Token position in config is top-left corner, but we need center for Pyglet Circle
        # So add half the size BEFORE scaling to get center position
        center_x_ref = raw_x + (raw_size / 2)  # Center X in reference space
        center_y_ref = raw_y + (raw_size / 2)  # Center Y in reference space

        # Apply resolution scaling to center coordinates
        x = parse_dimension(center_x_ref, window_width) * self.scale_x
        # Flip Y coordinate (Pyglet: bottom-left origin, Web: top-left origin)
        y = window_height - (parse_dimension(center_y_ref, window_height) * self.scale_y)
        # Scale token size
        size = parse_dimension(raw_size, window_width) * self.scale_x
        radius = size // 2
        color_str = element.get('color', '#ffffff')
        color = parse_color(color_str)

        print(f"  Token {element_id}: config=({raw_x}, {raw_y}, size={raw_size:.1f}) → center=({center_x_ref:.1f}, {center_y_ref:.1f}) → pyglet=({x:.1f}, {y:.1f}, radius={radius:.1f})")

        try:
            # Check if invisible (default: False)
            invisible = element.get('invisible', False)

            # Only add to batch if not invisible
            batch = self.batch if not invisible else None

            # Create circle for token
            circle = shapes.Circle(
                x, y, radius,
                color=color[:3],
                batch=batch
            )

            # Create border (slightly larger circle with outline only)
            border = shapes.Circle(
                x, y, radius,
                color=(0, 0, 0),
                batch=batch
            )
            border.opacity = 0  # Make fill transparent
            # Note: Pyglet doesn't support outline-only circles directly,
            # so we'll draw an Arc instead
            border = shapes.Arc(
                x, y, radius,
                color=(0, 0, 0),
                batch=batch
            )

            self.shapes[element_id] = {'circle': circle, 'border': border, 'element': element}

            # Add label if present and labelDisplay is not False
            if element.get('label') and element.get('labelDisplay', True):
                label_text = element.get('label')
                # Position label above the token (8px above the top edge)
                label_y = y + radius + int(8 * self.scale_y)

                label = pyglet.text.Label(
                    label_text,
                    font_name='Arial',
                    font_size=int(14 * self.scale_y),
                    x=x,
                    y=label_y,
                    color=(255, 255, 255, 255),
                    anchor_x='center',
                    anchor_y='bottom',
                    batch=batch
                )
                label.bold = True

                # Store label in sprites dict so it gets rendered
                self.sprites[f"{element_id}_label"] = label
                print(f"  Added label to token: '{label_text}'")

            print(f"✓ Loaded token: {element_id}{' [INVISIBLE]' if invisible else ''}")

        except Exception as e:
            print(f"Error loading token: {e}")
            traceback.print_exc()

    def load_area_element(self, element_id: str, element: Dict[str, Any]):
        """Load an area element (rectangle or circle)."""
        window_width = self.window.width
        window_height = self.window.height

        # Apply resolution scaling to x/y coordinates
        x = parse_dimension(element.get('x', 0), window_width) * self.scale_x
        # Flip Y coordinate (Pyglet: bottom-left origin, Web: top-left origin)
        y = window_height - (parse_dimension(element.get('y', 0), window_height) * self.scale_y)
        # Scale width and height (they might be absolute pixels)
        width = parse_dimension(element.get('width', 100), window_width) * self.scale_x
        height = parse_dimension(element.get('height', 100), window_height) * self.scale_y
        color_str = element.get('color', 'rgba(255,255,255,0.3)')
        color = parse_color(color_str)
        # Check for separate alpha value (0-100 percentage)
        if 'alpha' in element:
            alpha_percent = element.get('alpha', 30)
            alpha_value = int((alpha_percent / 100.0) * 255)
            # Replace alpha in color tuple
            if len(color) >= 3:
                color = (color[0], color[1], color[2], alpha_value)
        shape_type = element.get('shape', 'rectangle')  # 'rectangle' or 'circle'

        try:
            # Check if invisible (default: False)
            invisible = element.get('invisible', False)

            # Only add to batch if not invisible
            batch = self.batch if not invisible else None

            if shape_type == 'circle':
                # Circular area - x, y is center
                radius = width // 2
                area = shapes.Circle(
                    x, y, radius,
                    color=color[:3],
                    batch=batch
                )
                if len(color) == 4:
                    area.opacity = color[3]
            else:
                # Rectangular area - x, y are TOP-LEFT corner (like pygame version)
                # After Y-flip, y is the position of the TOP edge in Pyglet coords
                # Rectangle needs BOTTOM-LEFT corner, so subtract height from y
                area = shapes.Rectangle(
                    x,  # Left edge (same in both coordinate systems)
                    y - height,  # Bottom edge = top edge - height
                    width,
                    height,
                    color=color[:3],
                    batch=batch
                )
                if len(color) == 4:
                    area.opacity = color[3]

            self.shapes[element_id] = {'shape': area, 'element': element}

            # Add label if present and labelDisplay is not False
            if element.get('label') and element.get('labelDisplay', True):
                label_text = element.get('label')

                # Calculate label position based on shape type
                if shape_type == 'circle':
                    # Circle: x,y is center, position label above radius
                    radius = width // 2
                    label_x = x
                    label_y = y + radius + int(8 * self.scale_y)
                else:
                    # Rectangle: x is left edge, y is top edge (after Y-flip)
                    # Position label at horizontal center and above the top edge
                    label_x = x + (width // 2)
                    label_y = y + int(8 * self.scale_y)

                label = pyglet.text.Label(
                    label_text,
                    font_name='Arial',
                    font_size=int(14 * self.scale_y),
                    x=label_x,
                    y=label_y,
                    color=(255, 255, 255, 255),
                    anchor_x='center',
                    anchor_y='bottom',
                    batch=batch
                )
                label.bold = True

                # Store label in sprites dict so it gets rendered
                self.sprites[f"{element_id}_label"] = label
                print(f"  Added label to area: '{label_text}'")

            print(f"✓ Loaded area: {element_id} ({shape_type}){' [INVISIBLE]' if invisible else ''}")

        except Exception as e:
            print(f"Error loading area: {e}")
            traceback.print_exc()

    def load_line_element(self, element_id: str, element: Dict[str, Any]):
        """Load a line element."""
        window_width = self.window.width
        window_height = self.window.height

        # Apply resolution scaling to coordinates
        x1 = parse_dimension(element.get('x', 0), window_width) * self.scale_x
        y1_config = parse_dimension(element.get('y', 0), window_height) * self.scale_y
        # Flip Y coordinate (Pyglet: bottom-left origin, Web: top-left origin)
        y1 = window_height - y1_config

        x2 = parse_dimension(element.get('endX', x1 + 100), window_width) * self.scale_x
        y2_config = parse_dimension(element.get('endY', y1_config + 100), window_height) * self.scale_y
        # Flip Y coordinate (Pyglet: bottom-left origin, Web: top-left origin)
        y2 = window_height - y2_config
        # Scale thickness as well
        thickness = element.get('thickness', 3) * self.scale_x
        color_str = element.get('color', '#000000')
        color = parse_color(color_str)

        try:
            # Check if invisible (default: False)
            invisible = element.get('invisible', False)

            # Only add to batch if not invisible
            batch = self.batch if not invisible else None

            # Create line (width is a positional parameter in Pyglet)
            line = shapes.Line(
                x1, y1, x2, y2, thickness,
                color=color[:3],
                batch=batch
            )

            self.shapes[element_id] = {'line': line, 'element': element}

            # Add label if present and labelDisplay is not False
            if element.get('label') and element.get('labelDisplay', True):
                label_text = element.get('label')

                # Calculate midpoint of the line for label position
                mid_x = (x1 + x2) / 2
                mid_y = (y1 + y2) / 2

                # Position label above the midpoint
                label_y = mid_y + int(8 * self.scale_y)

                label = pyglet.text.Label(
                    label_text,
                    font_name='Arial',
                    font_size=int(14 * self.scale_y),
                    x=mid_x,
                    y=label_y,
                    color=(255, 255, 255, 255),
                    anchor_x='center',
                    anchor_y='bottom',
                    batch=batch
                )
                label.bold = True

                # Store label in sprites dict so it gets rendered
                self.sprites[f"{element_id}_label"] = label
                print(f"  Added label to line: '{label_text}'")

            print(f"✓ Loaded line: {element_id}{' [INVISIBLE]' if invisible else ''}")

        except Exception as e:
            print(f"Error loading line: {e}")
            traceback.print_exc()

    def load_cone_element(self, element_id: str, element: Dict[str, Any]):
        """Load a cone element (sector/pie shape)."""
        window_width = self.window.width
        window_height = self.window.height

        # Apply resolution scaling to x/y coordinates
        x = parse_dimension(element.get('x', 0), window_width) * self.scale_x
        # Flip Y coordinate (Pyglet: bottom-left origin, Web: top-left origin)
        y = window_height - (parse_dimension(element.get('y', 0), window_height) * self.scale_y)
        # Scale radius to match resolution
        radius = parse_dimension(element.get('radius', 50), window_width) * self.scale_x
        angle_degrees = element.get('angle', 45)  # Cone width in degrees
        direction_degrees = element.get('direction', 0)  # Cone direction
        rotation_degrees = element.get('rotation', 0)  # Additional rotation
        color_str = element.get('color', 'rgba(255,165,0,0.5)')
        color = parse_color(color_str)
        # Check for separate alpha value (0-100 percentage)
        if 'alpha' in element:
            alpha_percent = element.get('alpha', 50)
            alpha_value = int((alpha_percent / 100.0) * 255)
            # Replace alpha in color tuple
            if len(color) >= 3:
                color = (color[0], color[1], color[2], alpha_value)

        try:
            # Check if invisible (default: False)
            invisible = element.get('invisible', False)

            # Only add to batch if not invisible
            batch = self.batch if not invisible else None

            # Calculate start and end angles for the sector
            # Web coordinates: 0° = up, 90° = right, 180° = down, 270° = left
            # Pyglet coordinates: 0° = right, 90° = up, 180° = left, 270° = down

            # Apply rotation to direction (like pygame version)
            total_direction = direction_degrees + rotation_degrees

            # Convert web direction (0=up) to Pyglet direction (0=right)
            # Web 0° (up) = Pyglet 90°, then apply 90° clockwise
            pyglet_direction = 90 - total_direction - 90  # Subtract 90 for clockwise
            start_angle = pyglet_direction - angle_degrees / 2

            print(f"Cone debug: direction={direction_degrees}°, angle={angle_degrees}°, pyglet_dir={pyglet_direction}°, start={start_angle}°, radius={radius}")

            # Create sector (filled arc)
            # Pyglet Sector expects angles in DEGREES (not radians!)
            sector = shapes.Sector(
                x, y, radius,
                angle=angle_degrees,  # Pass degrees directly
                start_angle=start_angle,  # Pass degrees directly
                color=color[:3],
                batch=batch
            )

            print(f"  Sector created with angle={angle_degrees}°, start_angle={start_angle}°")

            if len(color) == 4:
                sector.opacity = color[3]

            self.shapes[element_id] = {'sector': sector, 'element': element}

            # Add label if present and labelDisplay is not False
            if element.get('label') and element.get('labelDisplay', True):
                label_text = element.get('label')

                # Position label above the cone apex (x, y are the center/apex)
                label_y = y + radius + int(8 * self.scale_y)

                label = pyglet.text.Label(
                    label_text,
                    font_name='Arial',
                    font_size=int(14 * self.scale_y),
                    x=x,
                    y=label_y,
                    color=(255, 255, 255, 255),
                    anchor_x='center',
                    anchor_y='bottom',
                    batch=batch
                )
                label.bold = True

                # Store label in sprites dict so it gets rendered
                self.sprites[f"{element_id}_label"] = label
                print(f"  Added label to cone: '{label_text}'")

            print(f"✓ Loaded cone: {element_id}{' [INVISIBLE]' if invisible else ''}")

        except Exception as e:
            print(f"Error loading cone: {e}")
            traceback.print_exc()

    def load_gif_element(self, element_id: str, element: Dict[str, Any]):
        """Load an animated GIF element."""
        gif_path = element.get('src')

        if not gif_path or not os.path.exists(gif_path):
            print(f"GIF file not found: {gif_path}")
            return

        window_width = self.window.width
        window_height = self.window.height

        # Apply resolution scaling to x/y coordinates
        x = parse_dimension(element.get('x', 0), window_width) * self.scale_x
        # Flip Y coordinate (Pyglet: bottom-left origin, Web: top-left origin)
        y = window_height - (parse_dimension(element.get('y', 0), window_height) * self.scale_y)

        width = None
        height = None
        if 'width' in element:
            width = parse_dimension(element.get('width'), window_width)
        if 'height' in element:
            height = parse_dimension(element.get('height'), window_height)

        rotation = element.get('rotation', 0)
        opacity = element.get('opacity', 100)

        try:
            # Check if invisible (default: False)
            invisible = element.get('invisible', False)

            # Load animated GIF
            animation = pyglet.image.load_animation(gif_path)

            # Calculate scaling first
            anim_width = animation.get_max_width()
            anim_height = animation.get_max_height()

            scale_x = 1.0
            scale_y = 1.0
            if width and height:
                scale_x = width / anim_width
                scale_y = height / anim_height
            elif width:
                scale = width / anim_width
                scale_x = scale_y = scale
            elif height:
                scale = height / anim_height
                scale_x = scale_y = scale

            # Set anchor on all animation frames for center rotation
            for frame in animation.frames:
                frame.image.anchor_x = frame.image.width // 2
                frame.image.anchor_y = frame.image.height // 2

            # Calculate center position using SCALED dimensions
            scaled_width = anim_width * scale_x
            scaled_height = anim_height * scale_y

            # Only add to batch if not invisible
            sprite = pyglet.sprite.Sprite(
                animation,
                x=x + scaled_width / 2,
                y=y - scaled_height / 2,  # Subtract because y is top in Pyglet bottom-left coords
                batch=self.batch if not invisible else None
            )

            # Apply scaling
            sprite.scale_x = scale_x
            sprite.scale_y = scale_y

            # Apply rotation (negated for opposite direction)
            sprite.rotation = -rotation

            # Apply opacity
            if opacity > 1.0:
                opacity = opacity / 100.0
            sprite.opacity = int(255 * opacity)

            self.animations[element_id] = sprite

            print(f"✓ Loaded GIF: {element_id}{' [INVISIBLE]' if invisible else ''}")

        except Exception as e:
            print(f"Error loading GIF {gif_path}: {e}")
            traceback.print_exc()

    def load_bar_element(self, element_id: str, element: Dict[str, Any]):
        """Load a bar element (progress bar with currentValue/maxValue)."""
        window_width = self.window.width
        window_height = self.window.height

        # Apply resolution scaling to x/y coordinates
        x = parse_dimension(element.get('x', 0), window_width) * self.scale_x
        # Flip Y coordinate (Pyglet: bottom-left origin, Web: top-left origin)
        y = window_height - (parse_dimension(element.get('y', 0), window_height) * self.scale_y)

        # Scale width and height
        width = parse_dimension(element.get('width', 200), window_width) * self.scale_x
        height = parse_dimension(element.get('height', 20), window_height) * self.scale_y

        # Get bar values
        current_value = element.get('currentValue', 50)
        max_value = element.get('maxValue', 100)
        if max_value <= 0:
            max_value = 100

        # Calculate fill percentage
        fill_percent = min(current_value / max_value, 1.0)
        fill_width = width * fill_percent

        # Get bar color (for the filled portion)
        bar_color_str = element.get('barColor', '#4CAF50')
        bar_color = parse_color(bar_color_str)

        # Background color (light gray)
        bg_color = (238, 238, 238, 255)

        # Get transparency (0-100)
        transparency = element.get('transparency', 0)
        opacity = int(255 * (1 - transparency / 100.0))

        # Get grayscale (0-100) - affects bar color
        grayscale = element.get('grayscale', 0)
        if grayscale > 0:
            # Convert bar color to grayscale
            r, g, b = bar_color[:3]
            gray = int(0.299 * r + 0.587 * g + 0.114 * b)
            # Blend between original and grayscale
            blend = grayscale / 100.0
            r = int(r * (1 - blend) + gray * blend)
            g = int(g * (1 - blend) + gray * blend)
            b = int(b * (1 - blend) + gray * blend)
            bar_color = (r, g, b, bar_color[3] if len(bar_color) > 3 else 255)

        try:
            # Check if invisible (default: False)
            invisible = element.get('invisible', False)

            # Only add to batch if not invisible
            batch = self.batch if not invisible else None

            # Create background rectangle (y is TOP edge after Y-flip, so subtract height)
            background = shapes.Rectangle(
                x, y - height, width, height,
                color=bg_color[:3],
                batch=batch
            )
            background.opacity = opacity

            # Create fill rectangle (same position, but width based on fill percentage)
            fill = shapes.Rectangle(
                x, y - height, fill_width, height,
                color=bar_color[:3],
                batch=batch
            )
            fill.opacity = opacity

            self.shapes[element_id] = {
                'background': background,
                'fill': fill,
                'element': element
            }

            print(f"✓ Loaded bar: {element_id} ({current_value}/{max_value} = {fill_percent*100:.0f}%){' [INVISIBLE]' if invisible else ''}")

        except Exception as e:
            print(f"Error loading bar: {e}")
            traceback.print_exc()
