#!/usr/bin/env python3
import argparse
import json
import os
from PIL import Image, ImageDraw, ImageFont, ImageOps
import requests
from io import BytesIO
import sys
import traceback

def apply_transparency(color, transparency=0):
    """Apply transparency to a color
    
    Args:
        color: RGB or RGBA tuple
        transparency: How much transparency to apply (0-100)
                      0 = fully opaque, 100 = fully transparent
    """
    if transparency <= 0:
        # No transparency adjustment needed
        if len(color) == 3:  # RGB to RGBA with full opacity
            return color + (255,)
        return color
    
    # Calculate alpha based on transparency (0-255)
    # 0 transparency = 255 alpha (fully opaque)
    # 100 transparency = 0 alpha (fully transparent)
    alpha = int(255 * (1 - transparency / 100))
    
    if len(color) == 4:  # RGBA
        r, g, b, a = color
        # Apply new alpha, but don't make it more opaque than it already is
        new_alpha = min(a, alpha)
        return (r, g, b, new_alpha)
    elif len(color) == 3:  # RGB
        r, g, b = color
        return (r, g, b, alpha)
    
    return color  # Return original if not RGB/RGBA

def convert_to_grayscale(color, intensity=100):
    """Convert a color to grayscale while maintaining alpha
    
    Args:
        color: RGB or RGBA tuple
        intensity: How much grayscale to apply (0-100)
                  0 = original color, 100 = full grayscale
    """
    if intensity <= 0:
        return color
        
    if len(color) == 4:  # RGBA
        r, g, b, a = color
        # Standard luminance formula: 0.299*R + 0.587*G + 0.114*B
        gray = int(0.299 * r + 0.587 * g + 0.114 * b)
        
        # Mix original color with grayscale based on intensity
        if intensity < 100:
            mix_ratio = intensity / 100.0
            new_r = int(r * (1 - mix_ratio) + gray * mix_ratio)
            new_g = int(g * (1 - mix_ratio) + gray * mix_ratio)
            new_b = int(b * (1 - mix_ratio) + gray * mix_ratio)
            return (new_r, new_g, new_b, a)
        else:
            return (gray, gray, gray, a)
    elif len(color) == 3:  # RGB
        r, g, b = color
        # Calculate grayscale value
        gray = int(0.299 * r + 0.587 * g + 0.114 * b)
        
        # Mix original color with grayscale based on intensity
        if intensity < 100:
            mix_ratio = intensity / 100.0
            new_r = int(r * (1 - mix_ratio) + gray * mix_ratio)
            new_g = int(g * (1 - mix_ratio) + gray * mix_ratio)
            new_b = int(b * (1 - mix_ratio) + gray * mix_ratio)
            return (new_r, new_g, new_b)
        else:
            return (gray, gray, gray)
    return color  # Return original if not RGB/RGBA

def hex_to_rgb(hex_color):
    """Convert hex color string to RGB tuple"""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

def get_font(font_name, font_size):
    """Try to load a specified font or fall back to system fonts"""
    try:
        # Common font locations by OS
        font_locations = {
            # Linux
            'ubuntu': '/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf',
            'dejavu': '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
            'liberation': '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
            'freefont': '/usr/share/fonts/truetype/freefont/FreeSans.ttf',
            # macOS
            'helvetica': '/System/Library/Fonts/Helvetica.ttc',
            'arial': '/Library/Fonts/Arial.ttf',
            'times': '/Library/Fonts/Times New Roman.ttf',
            # Windows
            'arial-win': 'C:\\Windows\\Fonts\\arial.ttf',
            'times-win': 'C:\\Windows\\Fonts\\times.ttf',
            'verdana': 'C:\\Windows\\Fonts\\verdana.ttf',
            # Generic
            'sans-serif': '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
            'serif': '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',
            'monospace': '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
            'system-ui': '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        }
        
        # If specific font is requested
        if font_name and font_name.lower() in font_locations:
            font_path = font_locations[font_name.lower()]
            if os.path.exists(font_path):
                return ImageFont.truetype(font_path, font_size)
        
        # Try direct path (if provided)
        if font_name and os.path.exists(font_name):
            return ImageFont.truetype(font_name, font_size)
            
        # Try common locations if font_name not in our mapping
        for font_path in font_locations.values():
            if os.path.exists(font_path):
                return ImageFont.truetype(font_path, font_size)
                
        # If all else fails, use default
        return ImageFont.load_default()
            
    except Exception as e:
        print(f"Font loading error: {e}", file=sys.stderr)
        return ImageFont.load_default()

def main():
    try:
        # Parse command line arguments
        parser = argparse.ArgumentParser(description='Generate an image with overlays')
        parser.add_argument('--config', type=str, required=True, help='JSON configuration string')
        args = parser.parse_args()
        
        # Parse the JSON configuration
        config = json.loads(args.config)
        
        # Get the base image
        image_path = config.get('image', {}).get('src', '')
        width = config.get('image', {}).get('width', 800)
        height = config.get('image', {}).get('height', 600)
        
        # Create or load the base image
        if image_path and os.path.exists(image_path):
            # Local file
            img = Image.open(image_path)
        elif image_path and image_path.startswith(('http://', 'https://')):
            # Remote URL
            response = requests.get(image_path)
            img = Image.open(BytesIO(response.content))
        else:
            # Create a blank image
            img = Image.new('RGBA', (width, height), (255, 255, 255, 255))

        # Convert to RGBA for proper transparency support
        if img.mode != 'RGBA':
            img = img.convert('RGBA')

        # Resize if necessary
        if img.width != width or img.height != height:
            img = img.resize((width, height))
        
        # Process each element
        for element in config.get('elements', []):
            element_type = element.get('type', '')
            x = element.get('x', 0)
            y = element.get('y', 0)

            # Create a transparent layer for this element (for proper alpha blending)
            layer = Image.new('RGBA', (width, height), (0, 0, 0, 0))
            layer_draw = ImageDraw.Draw(layer)

            if element_type == 'box':
                box_width = element.get('width', 100)
                box_height = element.get('height', 100)

                # Apply grayscale directly as color (0-100 intensity)
                grayscale_intensity = element.get('grayscale', 0)
                if grayscale_intensity > 0:
                    # Calculate gray value (0-255) based on grayscale intensity
                    gray_value = int(255 * (1 - grayscale_intensity/100))
                    color = (gray_value, gray_value, gray_value, 255)
                else:
                    color = (255, 255, 255, 255)  # Solid white

                # Apply transparency
                transparency = element.get('transparency', 0)
                color_with_alpha = apply_transparency(color, transparency)

                # Draw rectangle on layer
                if transparency != 100:
                    layer_draw.rectangle([(x, y), (x + box_width, y + box_height)],
                            outline=None, fill=color_with_alpha)
                    # Composite the layer onto the main image
                    img = Image.alpha_composite(img, layer)
            
            elif element_type == 'circle':
                radius = element.get('radius', 50)

                # Apply grayscale directly as color (0-100 intensity)
                grayscale_intensity = element.get('grayscale', 0)
                if grayscale_intensity > 0:
                    # Calculate gray value (0-255) based on grayscale intensity
                    gray_value = int(255 * (1 - grayscale_intensity/100))
                    color = (gray_value, gray_value, gray_value, 255)
                else:
                    color = (255, 255, 255, 255)  # Solid white

                # Apply transparency
                transparency = element.get('transparency', 0)
                color_with_alpha = apply_transparency(color, transparency)

                # Draw circle on layer
                if transparency != 100:
                    layer_draw.ellipse([(x, y), (x + 2*radius, y + 2*radius)],
                                outline=None, fill=color_with_alpha)
                    # Composite the layer onto the main image
                    img = Image.alpha_composite(img, layer)
            
            elif element_type == 'text':
                content = element.get('content', '')
                font_size = element.get('fontSize', 16)
                font_name = element.get('font', '')  # Get the font parameter

                # Apply grayscale directly as color (0-100 intensity)
                grayscale_intensity = element.get('grayscale', 0)
                if grayscale_intensity > 0:
                    # Calculate gray value (0-255) based on grayscale intensity
                    # For text, we invert the scale (0=black, 100=white)
                    gray_value = int(255 * (grayscale_intensity/100))
                    text_color = (gray_value, gray_value, gray_value, 255)
                else:
                    text_color = (0, 0, 0, 255)  # Black with full opacity

                # Apply transparency
                transparency = element.get('transparency', 0)
                text_color_with_alpha = apply_transparency(text_color, transparency)

                # Get font using the new helper function
                font = get_font(font_name, font_size)

                # Draw text on layer
                if transparency != 100:
                    layer_draw.text((x, y), content, fill=text_color_with_alpha, font=font)
                    # Composite the layer onto the main image
                    img = Image.alpha_composite(img, layer)
            
            elif element_type == 'bar':
                bar_width = element.get('width', 200)
                bar_height = element.get('height', 20)
                current_value = element.get('currentValue', 0)
                max_value = element.get('maxValue', 100)
                bar_color = element.get('barColor', '#000000')
                grayscale_intensity = element.get('grayscale', 0)
                transparency = element.get('transparency', 0)

                # Background for empty part
                if grayscale_intensity > 0:
                    # Light gray background for empty part
                    bg_gray = 230  # Near white
                    bg_color = (bg_gray, bg_gray, bg_gray, 255)
                else:
                    bg_color = (238, 238, 238, 255)  # Light gray

                # Apply transparency to background
                bg_color_with_alpha = apply_transparency(bg_color, transparency)

                if transparency != 100:
                    layer_draw.rectangle([(x, y), (x + bar_width, y + bar_height)],
                                  outline="black", fill=bg_color_with_alpha)

                # Draw the filled portion with grayscale if needed
                fill_width = int((current_value / max_value) * bar_width)
                if fill_width > 0:
                    if grayscale_intensity > 0:
                        # Calculate gray value for the fill based on intensity
                        gray_value = int(255 * (1 - grayscale_intensity/100))
                        fill_color = (gray_value, gray_value, gray_value, 255)
                    else:
                        # Use the specified bar color
                        try:
                            r, g, b = hex_to_rgb(bar_color)
                            fill_color = (r, g, b, 255)
                        except Exception as e:
                            print(f"Color conversion error: {e}", file=sys.stderr)
                            fill_color = (0, 0, 0, 255)  # Default black

                    # Apply transparency to fill color
                    fill_color_with_alpha = apply_transparency(fill_color, transparency)

                    if transparency != 100:
                        layer_draw.rectangle([(x+1, y+1), (x + fill_width-1, y + bar_height-1)],
                                      outline=None, fill=fill_color_with_alpha)

                # Composite the layer onto the main image
                if transparency != 100:
                    img = Image.alpha_composite(img, layer)
        
        # Save the image with timestamp to ensure uniqueness
        import datetime
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        output_dir = "./storage/generated_images"
        os.makedirs(output_dir, exist_ok=True)
        output_path = f"{output_dir}/generated_image_{timestamp}.png"
        img.save(output_path, "PNG")
        print(f"Image saved to {output_path}")
        
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()