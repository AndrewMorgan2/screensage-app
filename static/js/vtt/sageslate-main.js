/**
 * Sageslate Main - Entry point for the Sageslate (Player Aid) tool
 *
 * This file initializes the Sageslate interface using the unified
 * VTT initializer system, adapted for e-ink static image generation.
 *
 * @requires vtt-initializer.js
 * @requires vtt-controls-module.js
 * @requires vtt-preview-module.js
 * @requires vtt-draggable-module.js
 */

document.addEventListener('DOMContentLoaded', function () {
    // Sageslate Configuration
    const config = {
        basePath: './storage/sageslate_configs',
        defaultMapWidth: 400,
        defaultMapHeight: 300,
        maxPreviewWidth: 400,
        maxPreviewHeight: 300,
        defaultConfig: './storage/sageslate_configs/sageslate_config.json',
        defaultFilename: 'sageslate_config.json',
        moduleName: 'Sageslate',
        storageKey: 'sageslate_preview_scale',
        // Override the save path for Sageslate
        saveBasePath: './storage/sageslate_configs'
    };

    // Element IDs for Sageslate tab
    const elementIds = {
        jsonInput: 'jsonInput',
        parseButton: 'parseButton',
        jsonError: 'jsonError',
        controlsArea: 'controlsArea',
        previewArea: 'previewArea',
        imagePath: 'imagePath',
        usePathBtn: 'usePathBtn',
        hideEffectsBtn: null,  // Not used in sageslate
        showEffectsBtn: null,  // Not used in sageslate
        imageDimensions: 'imageDimensions',
        fileBrowser: 'fileBrowser',
        saveFilename: 'saveFilename',
        saveFileBtn: 'saveFileBtn',
        previewScaleSlider: 'previewScaleSlider',
        previewScaleDisplay: 'previewScaleDisplay',
        resetScaleBtn: 'resetScaleBtn',
        minimizeScaleBtn: 'minimizeScaleBtn',
        previewScalePanel: 'previewScalePanel',
        previewScaleContent: 'previewScaleContent',
        collapseAllBtn: 'collapseAllBtn',
        addButtons: {
            box: 'addBoxBtn',
            circle: 'addCircleBtn',
            text: 'addTextBtn',
            bar: 'addBarBtn'
        }
    };

    // Initialize VTT modules for Sageslate
    const modules = initializeVTT(config, elementIds);

    // Expose for the lastMovedSection script in sageslate.html
    window.sageslateControlsModule = modules.controlsModule;

    console.log('Sageslate initialized with VTT modules successfully', modules);

    // Set up background image handling
    setupBackgroundImageHandling(modules.previewModule, modules.controlsModule);

    // Add Sageslate-specific functionality
    setupSageslateSpecifics(modules);

    // Set up auto-update for preview when JSON changes
    setupAutoUpdatePreview(modules);

    // Load default template or initialize with empty config
    initializeSageslateConfig(modules);
});

/**
 * Set up background image handling for Sageslate
 * @private
 */
function setupBackgroundImageHandling(previewModule, controlsModule) {
    const imageDimensions = document.getElementById('imageDimensions');
    const previewArea = document.getElementById('previewArea');
    const jsonInput = document.getElementById('jsonInput');

    // Initialize preview area with default background styling
    previewArea.style.setProperty('background-color', '#1a1a1a', 'important');
    previewArea.style.setProperty('background-size', 'contain', 'important');
    previewArea.style.setProperty('background-repeat', 'no-repeat', 'important');
    previewArea.style.setProperty('background-position', 'center', 'important');

    // Store current background image URL for persistence
    let currentBackgroundUrl = '';

    // Function to apply background image styles
    const applyBackgroundImage = (imageUrl) => {
        if (!imageUrl) return;

        currentBackgroundUrl = imageUrl;
        previewArea.style.setProperty('background-image', `url('${imageUrl}')`, 'important');
        previewArea.style.setProperty('background-size', 'contain', 'important');
        previewArea.style.setProperty('background-repeat', 'no-repeat', 'important');
        previewArea.style.setProperty('background-position', 'center', 'important');
        previewArea.style.setProperty('background-color', '#1a1a1a', 'important');
        console.log('✓ Background image applied:', imageUrl);
    };

    // Override updatePreviewAreaSize to preserve background
    const originalUpdateSize = previewModule.updatePreviewAreaSize.bind(previewModule);
    previewModule.updatePreviewAreaSize = function() {
        originalUpdateSize();
        if (currentBackgroundUrl) {
            applyBackgroundImage(currentBackgroundUrl);
        }
    };

    // Shared function to load and apply background image
    const loadBackgroundImage = (path) => {
        if (!path) {
            alert("Please enter a valid image path");
            return;
        }

        const imageUrl = `/api/images/view?path=${encodeURIComponent(path)}`;
        console.log('Loading background image from:', imageUrl);

        const img = new Image();
        img.onload = function() {
            console.log('✓ Image loaded successfully, dimensions:', img.width, 'x', img.height);

            // Update dimensions
            const imageWidth = img.width;
            const imageHeight = img.height;

            // Update preview module map size
            previewModule.mapWidth = imageWidth;
            previewModule.mapHeight = imageHeight;
            previewModule.updatePreviewAreaSize();
            console.log('✓ Preview module dimensions updated');

            // Apply background image (will be preserved on future updates)
            applyBackgroundImage(imageUrl);

            // Update dimensions display
            if (imageDimensions) {
                imageDimensions.textContent = `${imageWidth} × ${imageHeight}`;
            }

            // Update JSON with new image details
            try {
                const jsonData = JSON.parse(jsonInput.value);
                jsonData.image = {
                    src: path,
                    width: imageWidth,
                    height: imageHeight
                };
                jsonInput.value = JSON.stringify(jsonData, null, 2);
                console.log('✓ JSON updated with image details');
            } catch(e) {
                console.error("Failed to update JSON with new image path:", e);
            }
        };

        img.onerror = function() {
            console.error('✗ Failed to load image from:', imageUrl);
            alert("Could not load image from the specified path. Please check the URL and try again.");
        };

        img.src = imageUrl;
    };

























    // Make loadBackgroundImage globally available for image browser integration
    window.sageslateSetBackgroundImage = loadBackgroundImage;
}

/**
 * Initialize Sageslate with default configuration
 * @private
 */
function initializeSageslateConfig(modules) {
    const jsonInput = document.getElementById('jsonInput');

    // Initialize with empty structure if no content
    const currentValue = jsonInput.value.trim();
    if (!currentValue || currentValue === '') {
        const defaultConfig = {
            elements: [],
            image: {
                src: '',
                width: 400,
                height: 300
            }
        };
        jsonInput.value = JSON.stringify(defaultConfig, null, 2);
        console.log('Initialized Sageslate with empty config');

        // Set preview dimensions even without background
        modules.previewModule.mapWidth = 400;
        modules.previewModule.mapHeight = 300;
        modules.previewModule.updatePreviewAreaSize();

        // Update dimensions display
        const imageDimensions = document.getElementById('imageDimensions');
        if (imageDimensions) {
            imageDimensions.textContent = '400 × 300';
        }
    } else if (currentValue && currentValue !== '{}') {
        // Parse existing JSON and set up background image if present
        try {
            const jsonData = JSON.parse(currentValue);

            // Set preview dimensions from JSON
            if (jsonData.image) {
                modules.previewModule.mapWidth = jsonData.image.width || 400;
                modules.previewModule.mapHeight = jsonData.image.height || 300;
                modules.previewModule.updatePreviewAreaSize();

                // Update dimensions display
                const imageDimensions = document.getElementById('imageDimensions');
                if (imageDimensions) {
                    imageDimensions.textContent = `${modules.previewModule.mapWidth} × ${modules.previewModule.mapHeight}`;
                }
            }

            // Parse and generate controls
            modules.controlsModule.parseJsonAndGenerateControls();
        } catch (error) {
            console.error('Error parsing initial JSON:', error);
            // Initialize with empty structure on error
            const defaultConfig = {
                elements: [],
                image: {
                    src: '',
                    width: 400,
                    height: 300
                }
            };
            jsonInput.value = JSON.stringify(defaultConfig, null, 2);

            // Set preview dimensions
            modules.previewModule.mapWidth = 400;
            modules.previewModule.mapHeight = 300;
            modules.previewModule.updatePreviewAreaSize();

            // Update dimensions display
            const imageDimensions = document.getElementById('imageDimensions');
            if (imageDimensions) {
                imageDimensions.textContent = '400 × 300';
            }
        }
    }
}

/**
 * Set up Sageslate-specific features
 * @private
 */
function setupSageslateSpecifics(modules) {
    // Send Image button functionality - generates and sends image to e-ink
    const sendImageBtn = document.getElementById('sendImageBtn');
    if (sendImageBtn) {
        sendImageBtn.addEventListener('click', () => executeImageGeneration(modules));
    }

    // E-ink display button functionality
    const displayBtn = document.getElementById('display-btn');
    if (displayBtn) {
        displayBtn.addEventListener('click', () => {
            const einkScreenSelect = document.getElementById('eink-select');
            const jsonInput = document.getElementById('jsonInput');

            try {
                const jsonData = JSON.parse(jsonInput.value);
                if (jsonData.image && jsonData.image.src) {
                    sendImage(jsonData.image.src, einkScreenSelect.value);
                }
            } catch (error) {
                console.error('Error sending to e-ink:', error);
            }
        });
    }

    // E-ink switch display button
    const switchDisplayBtn = document.getElementById('einkSwitchDisplay');
    let displayDir = true;
    if (switchDisplayBtn) {
        switchDisplayBtn.addEventListener('click', () => {
            const playerManagement = document.getElementById('eink-player-management');
            const dirSection = document.getElementById('eink-dir');

            if (displayDir) {
                playerManagement.style.display = 'block';
                dirSection.style.display = 'none';
                displayDir = false;
            } else {
                playerManagement.style.display = 'none';
                dirSection.style.display = 'block';
                displayDir = true;
            }
        });
    }
}

/**
 * Set up auto-update for preview when JSON changes
 * @private
 */
function setupAutoUpdatePreview(modules) {
    const jsonInput = document.getElementById('jsonInput');

    if (!jsonInput) return;

    // Debounce the auto-update to avoid too frequent updates
    let updateTimeout = null;

    jsonInput.addEventListener('input', () => {
        // Clear any pending update
        if (updateTimeout) {
            clearTimeout(updateTimeout);
        }

        // Schedule a new update after 500ms of no typing
        updateTimeout = setTimeout(() => {
            try {
                // Validate JSON before updating
                JSON.parse(jsonInput.value);

                // If valid, trigger update
                console.log('Auto-updating preview from JSON changes');
                modules.controlsModule.parseJsonAndGenerateControls();

            } catch (error) {
                // Silent fail on invalid JSON - user is likely still typing
                console.log('Invalid JSON, skipping auto-update');
            }
        }, 500);
    });

    console.log('Auto-update preview enabled');
}

/**
 * Execute image generation for e-ink display
 * @private
 */
function executeImageGeneration(modules) {
    try {
        const jsonInput = document.getElementById('jsonInput');
        const jsonData = JSON.parse(jsonInput.value);

        // Prepare arguments for the Python script
        const args = [`--config=${JSON.stringify(jsonData)}`];

        console.log("Executing image generation...");

        // Execute the command using fetch API
        fetch('/execute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                command: './python-env/bin/python3',
                args: ['./storage/eink/generate_image.py', ...args]
            })
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                console.log("Image generation executed successfully");
                if (result.stdout) {
                    console.log("Command output:", result.stdout);
                }

                const filePath = extractFilePath(result.stdout);
                const device = document.getElementById('eink-select-player');
                sendImage(filePath, device.value);

                // Update JSON with device selection
                try {
                    jsonData.image = jsonData.image || {};
                    jsonData.image.device = device.value;
                    jsonInput.value = JSON.stringify(jsonData, null, 2);
                } catch(e) {
                    console.error("Failed to update JSON with device:", e);
                }
            } else {
                console.error("Error generating image:", result.stderr);
            }
        })
        .catch(error => {
            console.error("Failed to execute command:", error);
        });
    } catch (error) {
        console.error("Error preparing generation command:", error);
    }
}

/**
 * Extract file path from command output
 * @private
 */
function extractFilePath(outputString) {
    const pathRegex = /(?:Image saved to |saved to |file saved at |path: )(.*\.(?:png|jpg|jpeg|gif|webp|svg|bmp|tiff))/i;
    const match = outputString.match(pathRegex);

    if (match && match[1]) {
        return match[1].trim();
    } else {
        const words = outputString.split(' ');
        for (let i = 0; i < words.length; i++) {
            if (words[i].match(/.*\.(png|jpg|jpeg|gif|webp|svg|bmp|tiff)$/i)) {
                return words[i].trim();
            }
        }
        return "No file path found";
    }
}

/**
 * Send image to e-ink device
 * @private
 */
async function sendImage(path, einkScreenSelect) {
    console.log("Sending to device:", einkScreenSelect);

    const devices = [
        { id: 0, name: "einkScreen0", ip: "192.168.12.96" },
        { id: 1, name: "einkScreen1", ip: "192.168.12.113" },
        { id: 2, name: "einkScreen2", ip: "192.168.12.219" },
        { id: 3, name: "einkScreen3", ip: "192.168.12.107" },
        { id: 4, name: "einkScreen4", ip: "192.168.12.46" }
    ];

    let args = [];
    const deviceId = parseInt(einkScreenSelect, 10);
    const device = devices.find(d => d.id === deviceId);

    if (device) {
        args.push(device.ip);
    }
    args.push(path);

    const fullCommand = `./python-env/bin/python3 eink_send.py ${args.join(' ')}`;
    console.log("Executing command:", fullCommand);

    fetch('/execute', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            command: 'python3',
            args: ['./storage/eink/eink_send.py', ...args]
        })
    }).then(response => response.json())
        .then(result => {
            if (result.success) {
                if (result.stdout) {
                    console.log("Command output:", result.stdout);
                }
            } else {
                console.error("Error running eink send command:", result.stderr);
            }
        })
        .catch(error => {
            console.error("Failed to execute command:", error);
        });
}

// Make sageslate functions globally available for backwards compatibility
window.sendImage = sendImage;
window.executeImageGeneration = executeImageGeneration;

/**
 * Set the currently selected media as the background image
 * This is called from the media viewer "Set as Background" button
 */
window.setAsBackground = function() {
    // Get the current media path from the image-browser.js currentMediaPath variable
    if (typeof currentMediaPath === 'undefined' || !currentMediaPath) {
        alert('No image selected. Please select an image from the media viewer first.');
        return;
    }

    // Get the current media type to verify it's an image
    if (typeof currentMediaType !== 'undefined' && currentMediaType !== 'image') {
        alert('Only static images can be used as backgrounds. Please select an image file.');
        return;
    }

    // Call the background image loader with the selected path
    if (window.sageslateSetBackgroundImage) {
        console.log('Setting background from media viewer:', currentMediaPath);
        window.sageslateSetBackgroundImage(currentMediaPath);

        // Show success message in the path-result area
        const pathResult = document.getElementById('path-result');
        if (pathResult) {
            pathResult.style.display = 'block';
            pathResult.innerHTML = '<p style="color: green;">✓ Background image set successfully!</p>';
            setTimeout(() => {
                pathResult.style.display = 'none';
            }, 3000);
        }
    } else {
        console.error('sageslateSetBackgroundImage function not available');
        alert('Background image loader not initialized. Please try again.');
    }
};

/**
 * Add the currently selected media as an image element to Sageslate
 * This is called from the media viewer "Add Image" button
 */
window.addImageToSageslate = function() {
    // Get the current media path from the image-browser.js currentMediaPath variable
    if (typeof currentMediaPath === 'undefined' || !currentMediaPath) {
        alert('No image selected. Please select an image from the media viewer first.');
        return;
    }

    // Get the current media type to verify it's an image
    if (typeof currentMediaType !== 'undefined' && currentMediaType !== 'image') {
        alert('Only static images can be added as elements. Please select an image file.');
        return;
    }

    try {
        const jsonInput = document.getElementById('jsonInput');
        const jsonData = JSON.parse(jsonInput.value);

        // Ensure elements array exists
        if (!jsonData.elements) {
            jsonData.elements = [];
        }

        // Get screen dimensions for positioning (center of screen)
        const screenWidth = jsonData.image?.width || 800;
        const screenHeight = jsonData.image?.height || 600;

        // Create a unique ID for the new element
        const elementId = `image_${Date.now()}`;

        // Create the new image element (positioned at center with 50% width)
        const newElement = {
            type: 'image',
            id: elementId,
            src: currentMediaPath,
            x: Math.floor(screenWidth * 0.25),
            y: Math.floor(screenHeight * 0.25),
            width: '50%',
            height: '50%',
            keepAspectRatio: true,
            grayscale: 0,
            transparency: 0,
            hiddenProperties: ["x", "y"]
        };

        // Add the new element
        jsonData.elements.push(newElement);
        jsonInput.value = JSON.stringify(jsonData, null, 2);

        // Trigger controls regeneration
        const parseButton = document.getElementById('parseButton');
        if (parseButton) {
            parseButton.click();
        }

        // Show success message
        const pathResult = document.getElementById('path-result');
        if (pathResult) {
            pathResult.style.display = 'block';
            pathResult.innerHTML = '<p style="color: green;">✓ Image element added successfully!</p>';
            setTimeout(() => {
                pathResult.style.display = 'none';
            }, 3000);
        }

        console.log('Added image element:', newElement);
    } catch (error) {
        console.error('Error adding image element:', error);
        alert('Failed to add image element. Please check the console for details.');
    }
};

/**
 * Create a simple modal for browsing images
 * @private
 */
function createImageBrowserModal(files, onSelectCallback) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 100000;
    `;

    // Create modal content
    const content = document.createElement('div');
    content.style.cssText = `
        background: #2a2a2a;
        padding: 20px;
        border-radius: 8px;
        max-width: 90%;
        max-height: 90%;
        overflow-y: auto;
        color: white;
    `;

    // Add title
    const title = document.createElement('h2');
    title.textContent = 'Select Background Image';
    title.style.marginTop = '0';
    content.appendChild(title);

    // Create image grid
    const grid = document.createElement('div');
    grid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 10px;
        margin: 20px 0;
    `;

    // Add images to grid
    files.forEach(file => {
        if (file.type === 'file' && /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.name)) {
            const item = document.createElement('div');
            item.style.cssText = `
                cursor: pointer;
                border: 2px solid transparent;
                padding: 5px;
                border-radius: 4px;
                transition: border-color 0.2s;
            `;

            const img = document.createElement('img');
            img.src = `/api/images/view?path=${encodeURIComponent(file.path)}`;
            img.style.cssText = `
                width: 100%;
                height: 120px;
                object-fit: cover;
                border-radius: 4px;
            `;

            const label = document.createElement('div');
            label.textContent = file.name;
            label.style.cssText = `
                font-size: 12px;
                margin-top: 5px;
                text-align: center;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            `;

            item.appendChild(img);
            item.appendChild(label);

            item.addEventListener('mouseenter', () => {
                item.style.borderColor = '#4CAF50';
            });

            item.addEventListener('mouseleave', () => {
                item.style.borderColor = 'transparent';
            });

            item.addEventListener('click', () => {
                onSelectCallback(file.path);
                document.body.removeChild(modal);
            });

            grid.appendChild(item);
        }
    });

    content.appendChild(grid);

    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = `
        padding: 10px 20px;
        background: #555;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        margin-top: 10px;
    `;
    closeBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    content.appendChild(closeBtn);

    modal.appendChild(content);

    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });

    return modal;
}
