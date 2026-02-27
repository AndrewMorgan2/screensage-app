import socket
import sys
import argparse
from PIL import Image
import numpy as np

# Prepare the image
def prepare_image(image_path, target_width, target_height):
    # Open and resize the image
    image = Image.open(image_path)
    image = image.resize((target_width, target_height))
    
    # Convert to black and white (1-bit)
    image = image.convert('1')  # Convert to 1-bit black and white
    
    # Convert to a binary format suitable for e-ink display
    # Get image data as a binary array
    image_data = np.array(image)
    
    # Convert 2D array to 1D bits
    bits = image_data.flatten() > 0
    
    # Pack bits into bytes
    # 8 bits per byte, MSB first
    bytes_needed = (len(bits) + 7) // 8
    packed_bytes = bytearray(bytes_needed)
    
    for i in range(len(bits)):
        if bits[i]:
            packed_bytes[i // 8] |= (1 << (7 - (i % 8)))
    
    return packed_bytes

# Connect to device and send image
def send_image(ip_address, port, image_bytes):
    try:
        # Create a socket connection
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect((ip_address, port))
        
        # Send the image data
        sock.sendall(image_bytes)
        
        # Wait for confirmation (optional)
        try:
            sock.settimeout(2.0)
            response = sock.recv(1024)
            print(f"Device response: {response}")
        except socket.timeout:
            # No response is fine for many devices
            pass
        
        # Close the connection
        sock.close()
        
        print(f"Image sent to {ip_address}:{port}! {len(image_bytes)} bytes transferred.")
        return True
        
    except Exception as e:
        print(f"Error sending image: {e}")
        return False

# Main function
def main():
    # Set up command line argument parsing
    parser = argparse.ArgumentParser(description='Send an image to a device at a specified IP address.')
    parser.add_argument('ip_address', help='IP address of the target device')
    parser.add_argument('image_path', help='Path to the image file to send')
    parser.add_argument('--port', type=int, default=8080, help='Port to connect to (default: 8080)')
    parser.add_argument('--width', type=int, default=400, help='Target width for the image (default: 400)')
    parser.add_argument('--height', type=int, default=300, help='Target height for the image (default: 300)')
    
    args = parser.parse_args()
    
    # Prepare the image
    print(f"Preparing image: {args.image_path}")
    try:
        image_bytes = prepare_image(args.image_path, args.width, args.height)
    except Exception as e:
        print(f"Error preparing image: {e}")
        sys.exit(1)
    
    # Send the image
    print(f"Sending image to {args.ip_address}:{args.port}...")
    if not send_image(args.ip_address, args.port, image_bytes):
        sys.exit(1)

if __name__ == "__main__":
    main()
