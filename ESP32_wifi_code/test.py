import socket
import time
import numpy as np

# Configuration
ESP32_IP = "192.168.12.46"  # Replace with your ESP32's IP address
ESP32_PORT = 8080

# Create an all-black test pattern
def create_black_screen(width, height):
    # Calculate bytes needed (8 pixels per byte)
    bytes_needed = (width * height + 7) // 8
    
    # Create all black bitmap (fill with 0xFF for all black)
    # 1 = black in most e-ink displays
    bitmap = np.full(bytes_needed, 0xFF, dtype=np.uint8)
    
    return bitmap.tobytes()

# Connect to ESP32 and send image
def send_image(image_bytes):
    try:
        # Create a socket connection
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect((ESP32_IP, ESP32_PORT))
        
        # Send the image data
        sock.sendall(image_bytes)
        
        # Close the connection
        sock.close()
        
        print(f"All-black pattern sent! {len(image_bytes)} bytes transferred.")
        
    except Exception as e:
        print(f"Error sending pattern: {e}")

# Main function
if __name__ == "__main__":
    # Target dimensions for the 2.13" display (if using a different display, change these values)
    # For 2.13" display (EPD_dispIndex = 3): 122 x 250
    target_width = 250
    target_height = 122
    
    # Create the all-black screen
    image_bytes = create_black_screen(target_width, target_height)
    
    # Send the pattern
    send_image(image_bytes)
