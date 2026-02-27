// Add this to your JavaScript file to handle file uploads and image display

/**
 * Uploads an image to the server and returns the response
 * @param {File} file - The file to upload
 * @returns {Promise<Object>} - The server response
 */
async function uploadImageToServer(file) {
    try {
      // Show upload status if needed
      console.log("Uploading file...");
      
      // Send the file directly to the server
      const response = await fetch('/api/upload/image', {
        method: 'POST',
        body: file,
        headers: {
          'Content-Type': file.type
        }
      });
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      // Parse and return the response
      return await response.json();
    } catch (error) {
      console.error("Upload failed:", error);
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Updates the JSON data with the uploaded image path
   * @param {string} jsonInputId - The ID of the JSON textarea element
   * @param {string} imagePath - The path to the uploaded image
   * @param {number} width - The image width
   * @param {number} height - The image height
   */
  function updateJsonWithImagePath(jsonInputId, imagePath, width, height) {
    const jsonInput = document.getElementById(jsonInputId);
    if (!jsonInput) return;
    
    try {
      const jsonData = JSON.parse(jsonInput.value);
      
      // Update the image properties in the JSON
      jsonData.image = {
        src: imagePath,
        width: width,
        height: height
      };
      
      // Update the JSON textarea
      jsonInput.value = JSON.stringify(jsonData, null, 2);
      
      // Trigger a change event to notify any listeners
      const event = new Event('change', { bubbles: true });
      jsonInput.dispatchEvent(event);
      
      console.log("JSON updated with new image path");
    } catch (error) {
      console.error("Failed to update JSON:", error);
    }
  }
  
  /**
   * Creates an image element using your server's view endpoint
   * @param {string} path - The path to the image
   * @param {string} name - The name/alt text for the image
   * @returns {HTMLElement} - The image element
   */
  function createImageElement(path, name = "Uploaded image") {
    const img = document.createElement('img');
    img.src = `/api/images/view?path=${encodeURIComponent(path)}`;
    img.alt = name;
    img.className = "uploaded-image";
    return img;
  }
  
  /**
   * Updates the preview with the uploaded image
   * @param {string} previewContainerId - The ID of the preview container
   * @param {string} imagePath - The path to the image
   */
  function updatePreviewWithImage(previewContainerId, imagePath) {
    const container = document.getElementById(previewContainerId);
    if (!container) return;
    
    // Clear existing content
    container.innerHTML = '';
    
    // Create and add the image
    const img = createImageElement(imagePath);
    container.appendChild(img);
  }
  
  /**
   * Example usage:
   */
  document.addEventListener('DOMContentLoaded', function() {
    // Get elements
    const uploadBtn = document.getElementById('uploadImageBtn');
    const fileInput = document.getElementById('imageUpload');
    const previewArea = document.getElementById('previewArea');
    
    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', async function() {
        if (fileInput.files.length > 0) {
          const file = fileInput.files[0];
          
          // Upload the file
          const result = await uploadImageToServer(file);
          
          if (result.success && result.path) {
            // Update the JSON with the file path
            updateJsonWithImagePath('jsonInput', result.path, result.width, result.height);
            
            // Update the preview if needed
            if (previewArea) {
              // Method 1: Update background image (for editor preview)
              previewArea.style.backgroundImage = `url('/api/images/view?path=${encodeURIComponent(result.path)}')`;
              
              // Method 2: Add as img element (for thumbnail display)
              // updatePreviewWithImage('previewArea', result.path);
            }
            
            console.log("Image uploaded successfully:", result.path);
          } else {
            console.error("Upload failed:", result.message);
          }
        }
      });
    }
  });