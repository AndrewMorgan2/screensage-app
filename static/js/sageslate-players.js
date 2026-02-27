const jsonInput = document.getElementById('jsonInput');
const parseButton = document.getElementById('parseButton');
const jsonError = document.getElementById('jsonError');
const controlsArea = document.getElementById('controlsArea');
const previewArea = document.getElementById('previewArea');
const imageUpload = document.getElementById('imageUpload');
const uploadImageBtn = document.getElementById('uploadImageBtn');
const imageDimensions = document.getElementById('imageDimensions');
const imagePath = document.getElementById('imagePath');
const usePathBtn = document.getElementById('usePathBtn');

let imageWidth = 800;
let imageHeight = 600;

// Set the initial background image from JSON if provided
function initializeImage() {
    try {
        const jsonData = JSON.parse(jsonInput.value);
        if (jsonData.image && jsonData.image.src) {
            imageWidth = jsonData.image.width || 800;
            imageHeight = jsonData.image.height || 600;

            // Set the exact width and height of the preview area to match the image
            previewArea.style.width = `${imageWidth}px`;
            previewArea.style.height = `${imageHeight}px`;
            previewArea.style.backgroundImage = `url('${jsonData.image.src}')`;
            imageDimensions.textContent = `${imageWidth} × ${imageHeight}`;
        }
    } catch (e) {
        console.error("Failed to set initial image:", e);
    }
}

// Handle using a path instead of uploading
usePathBtn.addEventListener('click', function() {
    const path = imagePath.value.trim();
    if (path) {
        // Create a temporary image to get dimensions
        const img = new Image();
        img.onload = function() {
            // Update image dimensions
            imageWidth = img.width;
            imageHeight = img.height;
            
            // Update preview area - set exact dimensions
            previewArea.style.width = `${imageWidth}px`;
            previewArea.style.height = `${imageHeight}px`;
            previewArea.style.backgroundImage = `url('/api/images/view?path=${encodeURIComponent(path)}')`;

            // Update dimensions display
            imageDimensions.textContent = `${imageWidth} × ${imageHeight}`;
            
            // Update JSON with new image details
            try {
                const jsonData = JSON.parse(jsonInput.value);
                jsonData.image = {
                    src: path,
                    width: imageWidth,
                    height: imageHeight
                };
                jsonInput.value = JSON.stringify(jsonData, null, 2);
                
                // Update all element controls to have new bounds
                updateElementBounds();
            } catch(e) {
                console.error("Failed to update JSON with new image path:", e);
            }
        };
        
        img.onerror = function() {
            alert("Could not load image from the specified path. Please check the URL and try again.");
        };
        
        img.src = `/api/images/view?path=${encodeURIComponent(path)}`;
    } else {
        alert("Please enter a valid image path");
    }
});

// Update element sliders based on image dimensions
function updateElementBounds() {
    const sliders = document.querySelectorAll('input[type="range"]');
    sliders.forEach(slider => {
        if (slider.dataset.property === 'x') {
            slider.max = imageWidth; //+ 100;
        } else if (slider.dataset.property === 'y') {
            slider.max = imageHeight; //+ 100;
        }

        // Update the corresponding number input
        const numberInput = slider.nextElementSibling;
        if (numberInput && numberInput.type === 'number') {
            numberInput.max = slider.max;
        }
    });
}

// Initialize image on load
initializeImage();

// Initial parse if JSON is already present
if (jsonInput.value.trim()) {
    parseJsonAndGenerateControls();
}

// Parse button click handler
parseButton.addEventListener('click', parseJsonAndGenerateControls);

function parseJsonAndGenerateControls() {
    try {
        jsonError.textContent = '';
        controlsArea.innerHTML = '';
        previewArea.innerHTML = '';

        // Parse JSON
        const jsonData = JSON.parse(jsonInput.value);

        // Set image if defined
        if (jsonData.image) {
            imageWidth = jsonData.image.width || 800;
            imageHeight = jsonData.image.height || 600;

            // Set exact dimensions for the preview area
            previewArea.style.width = `${imageWidth}px`;
            previewArea.style.height = `${imageHeight}px`;

            if (jsonData.image.src) {
                const encodedPath = encodeURIComponent(jsonData.image.src);
                previewArea.style.backgroundImage = `url('/api/images/view?path=${encodedPath}')`;
                imageDimensions.textContent = `${imageWidth} × ${imageHeight}`;
            }

            document.getElementById('eink-select-player').value = jsonData.image.device;
        }

        // Validate structure
        if (!jsonData.elements || !Array.isArray(jsonData.elements)) {
            throw new Error("JSON must have an 'elements' array");
        }

        // Generate controls for each element
        jsonData.elements.forEach((element, index) => {
            generateControlsForElement(element, index);
            renderPreviewElement(element);
        });

        // Update controls bounds based on image dimensions
        updateElementBounds();

    } catch (error) {
        jsonError.textContent = `Error: ${error.message}`;
        controlsArea.innerHTML = '<p>Please fix the JSON format to generate controls.</p>';
    }
}


function addGrayscaleSliderControl(parent, element) {
    const container = document.createElement('div');
    container.className = 'slider-container';
    
    const labelElement = document.createElement('label');
    labelElement.textContent = 'Grayscale:';
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = 0;
    slider.max = 100;
    slider.value = element.grayscale || 0;
    slider.dataset.property = 'grayscale';
    slider.dataset.elementId = element.id || '';
    
    const valueDisplay = document.createElement('input');
    valueDisplay.type = 'number';
    valueDisplay.min = 0;
    valueDisplay.max = 100;
    valueDisplay.value = element.grayscale || 0;
    valueDisplay.dataset.property = 'grayscale';
    valueDisplay.dataset.elementId = element.id || '';
    
    // Connect the slider and number input with real-time updates
    slider.addEventListener('input', () => {
        valueDisplay.value = slider.value;
        updateElementProperty(element, 'grayscale', parseInt(slider.value, 10));
    });
    
    valueDisplay.addEventListener('input', () => {
        slider.value = valueDisplay.value;
        updateElementProperty(element, 'grayscale', parseInt(valueDisplay.value, 10));
    });
    
    container.appendChild(labelElement);
    container.appendChild(slider);
    container.appendChild(valueDisplay);
    parent.appendChild(container);
}

// Modify addSliderControl for bar elements to handle special cases
function addSliderControl(parent, element, property, label, min, max) {
    const container = document.createElement('div');
    container.className = 'slider-container';
    
    const labelElement = document.createElement('label');
    labelElement.textContent = label + ':';
    
    // Determine max based on property and image dimensions
    let actualMax = max;
    if (property === 'x') {
        actualMax = imageWidth + 100;
    } else if (property === 'y') {
        actualMax = imageHeight + 100;
    } else if (property === 'currentValue' && element.type === 'bar') {
        // For bar elements, currentValue is limited by maxValue
        actualMax = element.maxValue || 100;
    }
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = min;
    slider.max = actualMax;
    slider.value = element[property] || 0;
    slider.dataset.property = property;
    slider.dataset.elementId = element.id || '';
    
    // For special controls, add an ID
    if (element.type === 'bar' && property === 'currentValue') {
        slider.id = `current-value-${element.id || index}`;
    }
    
    const valueDisplay = document.createElement('input');
    valueDisplay.type = 'number';
    valueDisplay.min = min;
    valueDisplay.max = actualMax;
    valueDisplay.value = element[property] || 0;
    valueDisplay.dataset.property = property;
    valueDisplay.dataset.elementId = element.id || '';
    
    // Connect the slider and number input with real-time updates
    slider.addEventListener('input', () => {
        valueDisplay.value = slider.value;
        updateElementProperty(element, property, parseInt(slider.value, 10));
    });
    
    valueDisplay.addEventListener('input', () => {
        slider.value = valueDisplay.value;
        updateElementProperty(element, property, parseInt(valueDisplay.value, 10));
    });
    
    // For maxValue in bar elements, we need to update the currentValue slider max
    if (element.type === 'bar' && property === 'maxValue') {
        slider.addEventListener('input', () => {
            // Find the currentValue slider and update its max
            const currentValueSlider = document.querySelector(`#current-value-${element.id || index}`);
            if (currentValueSlider) {
                currentValueSlider.max = slider.value;
                // Also update its number input
                const currentValueNumber = currentValueSlider.nextElementSibling;
                if (currentValueNumber) {
                    currentValueNumber.max = slider.value;
                }
            }
        });
    }
    
    container.appendChild(labelElement);
    container.appendChild(slider);
    container.appendChild(valueDisplay);
    parent.appendChild(container);
}

// Modify the text input handling for real-time updates
function addTextControl(parent, element, property, label) {
    const container = document.createElement('div');
    container.className = 'slider-container';
    
    const labelElement = document.createElement('label');
    labelElement.textContent = label + ':';
    
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.value = element[property] || '';
    textInput.style.flex = '1';
    textInput.dataset.property = property;
    textInput.dataset.elementId = element.id || '';
    
    // Update JSON in real-time as user types
    textInput.addEventListener('input', () => {
        updateElementProperty(element, property, textInput.value);
    });
    
    container.appendChild(labelElement);
    container.appendChild(textInput);
    parent.appendChild(container);
}

function addTransparencySliderControl(parent, element) {
    const container = document.createElement('div');
    container.className = 'slider-container';
    
    const labelElement = document.createElement('label');
    labelElement.textContent = 'Transparency:';
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = 0;
    slider.max = 100;
    slider.value = element.transparency || 0;
    slider.dataset.property = 'transparency';
    slider.dataset.elementId = element.id || '';
    
    const valueDisplay = document.createElement('input');
    valueDisplay.type = 'number';
    valueDisplay.min = 0;
    valueDisplay.max = 100;
    valueDisplay.value = element.transparency || 0;
    valueDisplay.dataset.property = 'transparency';
    valueDisplay.dataset.elementId = element.id || '';
    
    // Connect the slider and number input with real-time updates
    slider.addEventListener('input', () => {
        valueDisplay.value = slider.value;
        updateElementProperty(element, 'transparency', parseInt(slider.value, 10));
    });
    
    valueDisplay.addEventListener('input', () => {
        slider.value = valueDisplay.value;
        updateElementProperty(element, 'transparency', parseInt(valueDisplay.value, 10));
    });
    
    container.appendChild(labelElement);
    container.appendChild(slider);
    container.appendChild(valueDisplay);
    parent.appendChild(container);
}

function updateElementProperty(element, property, value) {
    // Update the element in the JSON
    element[property] = value;

    // Update the preview
    updatePreviewElement(element);

    // Update the JSON in the text area (optional)
    updateJsonTextarea();
}

function generateControlsForElement(element, index) {
    const controlGroup = document.createElement('div');
    controlGroup.className = 'control-group';
    controlGroup.dataset.elementId = element.id || `element-${index}`;
    
    // Element title
    const title = document.createElement('h3');
    title.textContent = `${element.type || 'Element'} ${element.id ? `(${element.id})` : index + 1}`;
    controlGroup.appendChild(title);
    
    // Get hidden properties for this element (if any)
    const hiddenProps = element.hiddenProperties || [];
    
    // Common controls for position (only add if not hidden)
    if (!hiddenProps.includes('x')) {
        addSliderControl(controlGroup, element, 'x', 'X Position', 0, 1000);
    }
    
    if (!hiddenProps.includes('y')) {
        addSliderControl(controlGroup, element, 'y', 'Y Position', 0, 1000);
    }
    
    // Type-specific controls
    switch(element.type) {
        case 'box':
            if (!hiddenProps.includes('width')) {
                addSliderControl(controlGroup, element, 'width', 'Width', 1, 500);
            }
            if (!hiddenProps.includes('height')) {
                addSliderControl(controlGroup, element, 'height', 'Height', 1, 500);
            }
            break;
            
        case 'circle':
            if (!hiddenProps.includes('radius')) {
                addSliderControl(controlGroup, element, 'radius', 'Radius', 1, 200);
            }
            break;
            
        case 'text':
            // Text content input with real-time updates
            if (!hiddenProps.includes('content')) {
                addTextControl(controlGroup, element, 'content', 'Text');
            }
            
            // Font size slider
            if (!hiddenProps.includes('fontSize')) {
                addSliderControl(controlGroup, element, 'fontSize', 'Font Size', 8, 72);
            }
            break;
            
        case 'bar':
            // Bar controls
            if (!hiddenProps.includes('width')) {
                addSliderControl(controlGroup, element, 'width', 'Width', 10, 500);
            }
            if (!hiddenProps.includes('height')) {
                addSliderControl(controlGroup, element, 'height', 'Height', 5, 100);
            }
            
            // Current value control
            if (!hiddenProps.includes('currentValue')) {
                // Get the max for the current value slider
                const maxValue = element.maxValue || 100;
                addSliderControl(controlGroup, element, 'currentValue', 'Current Value', 0, maxValue);
            }
            
            // Max value control
            if (!hiddenProps.includes('maxValue')) {
                addSliderControl(controlGroup, element, 'maxValue', 'Max Value', 1, 1000);
            }
            break;
    }
    
    // Add grayscale slider to all elements
    if (!hiddenProps.includes('grayscale')) {
        addGrayscaleSliderControl(controlGroup, element);
    }
    
    // Add transparency slider to all elements
    if (!hiddenProps.includes('transparency')) {
        addTransparencySliderControl(controlGroup, element);
    }
    
    controlsArea.appendChild(controlGroup);
}

// Modify the renderPreviewElement function to apply transparency
function renderPreviewElement(element) {
    // First remove any existing preview with the same ID
    const existingElement = document.querySelector(`.preview-item[data-element-id="${element.id || ''}"]`);
    if (existingElement) {
        existingElement.remove();
    }

    const preview = document.createElement('div');
    preview.className = 'preview-item';
    preview.dataset.elementId = element.id || '';

    // Get grayscale intensity (0-100)
    const grayscaleValue = element.grayscale || 0;
    
    // Get transparency value (0-100)
    const transparencyValue = element.transparency || 0;
    
    // Calculate opacity as a decimal (1 = fully opaque, 0 = fully transparent)
    const opacity = 1 - (transparencyValue / 100);

    // Set element-specific styles
    switch (element.type) {
        case 'box':
            // Position the element
            preview.style.left = `${element.x || 0}px`;
            preview.style.top = `${element.y || 0}px`;
            preview.style.width = `${element.width || 100}px`;
            preview.style.height = `${element.height || 100}px`;
            
            // Apply grayscale as background color and opacity
            if (grayscaleValue > 0) {
                // Calculate gray value (0-255) based on grayscale intensity
                const grayValue = Math.floor(255 * (1 - grayscaleValue/100));
                preview.style.backgroundColor = `rgba(${grayValue}, ${grayValue}, ${grayValue}, ${opacity})`;
            } else {
                preview.style.backgroundColor = `rgba(255, 255, 255, ${opacity})`; // Default color with transparency
            }
            
            // Remove border
            preview.style.border = 'none';
            break;

        case 'circle':
            const radius = element.radius || 50;
            // Position for circles
            preview.style.left = `${(element.x || 0)}px`;
            preview.style.top = `${(element.y || 0)}px`;
            preview.style.width = `${radius * 2}px`;
            preview.style.height = `${radius * 2}px`;
            preview.style.borderRadius = '50%';
            
            // Apply grayscale as background color and opacity
            if (grayscaleValue > 0) {
                // Calculate gray value (0-255) based on grayscale intensity
                const grayValue = Math.floor(255 * (1 - grayscaleValue/100));
                preview.style.backgroundColor = `rgba(${grayValue}, ${grayValue}, ${grayValue}, ${opacity})`;
            } else {
                preview.style.backgroundColor = `rgba(255, 255, 255, ${opacity})`; // Default color with transparency
            }
            
            // Remove border
            preview.style.border = 'none';
            break;

        case 'text':
            // Position the element
            preview.style.left = `${element.x || 0}px`;
            preview.style.top = `${element.y || 0}px`;
            preview.textContent = element.content || '';
            preview.style.fontSize = `${element.fontSize || 16}px`;
            preview.style.border = 'none';
            preview.style.background = 'transparent'; // No background for text
            
            // For text, use grayscale value to determine text color and opacity
            if (grayscaleValue > 0) {
                // Calculate gray value (0-255) based on grayscale intensity
                // For text, we invert the scale (0=black, 100=white)
                const grayValue = Math.floor(255 * (grayscaleValue/100));
                preview.style.color = `rgba(${grayValue}, ${grayValue}, ${grayValue}, ${opacity})`;
            } else {
                preview.style.color = `rgba(0, 0, 0, ${opacity})`;
            }
            break;
            
        case 'bar':
            // Position the element
            preview.style.left = `${element.x || 0}px`;
            preview.style.top = `${element.y || 0}px`;
            preview.style.width = `${element.width || 200}px`;
            preview.style.height = `${element.height || 20}px`;
            preview.style.border = 'none'; // Remove border
            preview.style.backgroundColor = `rgba(238, 238, 238, ${opacity})`; // Background for empty part with transparency
            preview.style.padding = '0';
            preview.style.overflow = 'hidden';
            
            // Create the filled part of the bar
            const maxValue = element.maxValue || 100;
            const currentValue = Math.min(element.currentValue || 0, maxValue);
            const fillPercentage = (currentValue / maxValue) * 100;
            
            const fillBar = document.createElement('div');
            fillBar.style.width = `${fillPercentage}%`;
            fillBar.style.height = '100%';
            
            // Use the bar color or apply grayscale with transparency
            if (grayscaleValue > 0) {
                // Calculate gray value (0-255) based on grayscale intensity
                const grayValue = Math.floor(255 * (1 - grayscaleValue/100));
                fillBar.style.backgroundColor = `rgba(${grayValue}, ${grayValue}, ${grayValue}, ${opacity})`;
            } else {
                const barColor = element.barColor || '#4CAF50'; // Default green
                // Parse the hex color to RGB for RGBA conversion
                const r = parseInt(barColor.substring(1, 3), 16);
                const g = parseInt(barColor.substring(3, 5), 16);
                const b = parseInt(barColor.substring(5, 7), 16);
                fillBar.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${opacity})`;
            }
            
            preview.appendChild(fillBar);
            break;
    }

    previewArea.appendChild(preview);
}

// Update the updatePreviewElement function to handle transparency
function updatePreviewElement(element) {
    const preview = document.querySelector(`.preview-item[data-element-id="${element.id || ''}"]`);
    if (!preview) return;

    // Get grayscale intensity (0-100)
    const grayscaleValue = element.grayscale || 0;
    
    // Get transparency value (0-100)
    const transparencyValue = element.transparency || 0;
    
    // Calculate opacity as a decimal (1 = fully opaque, 0 = fully transparent)
    const opacity = 1 - (transparencyValue / 100);

    // Update element-specific properties
    switch (element.type) {
        case 'box':
            // Update position
            preview.style.left = `${element.x || 0}px`;
            preview.style.top = `${element.y || 0}px`;
            preview.style.width = `${element.width || 100}px`;
            preview.style.height = `${element.height || 100}px`;
            
            // Apply grayscale as background color and opacity
            if (grayscaleValue > 0) {
                // Calculate gray value (0-255) based on grayscale intensity
                const grayValue = Math.floor(255 * (1 - grayscaleValue/100));
                preview.style.backgroundColor = `rgba(${grayValue}, ${grayValue}, ${grayValue}, ${opacity})`;
            } else {
                preview.style.backgroundColor = `rgba(255, 255, 255, ${opacity})`; // Default color with transparency
            }
            
            // Remove border
            preview.style.border = 'none';
            break;

        case 'circle':
            const radius = element.radius || 50;
            // Update position
            preview.style.left = `${(element.x || 0)}px`;
            preview.style.top = `${(element.y || 0)}px`;
            preview.style.width = `${radius * 2}px`;
            preview.style.height = `${radius * 2}px`;
            
            // Apply grayscale as background color and opacity
            if (grayscaleValue > 0) {
                // Calculate gray value (0-255) based on grayscale intensity
                const grayValue = Math.floor(255 * (1 - grayscaleValue/100));
                preview.style.backgroundColor = `rgba(${grayValue}, ${grayValue}, ${grayValue}, ${opacity})`;
            } else {
                preview.style.backgroundColor = `rgba(255, 255, 255, ${opacity})`; // Default color with transparency
            }
            
            // Remove border
            preview.style.border = 'none';
            break;

        case 'text':
            // Update position
            preview.style.left = `${element.x || 0}px`;
            preview.style.top = `${element.y || 0}px`;
            preview.textContent = element.content || '';
            preview.style.fontSize = `${element.fontSize || 16}px`;
            preview.style.background = 'transparent'; // No background
            
            // For text, use grayscale value to determine text color and opacity
            if (grayscaleValue > 0) {
                // Calculate gray value (0-255) based on grayscale intensity
                // For text, we invert the scale (0=black, 100=white)
                const grayValue = Math.floor(255 * (grayscaleValue/100));
                preview.style.color = `rgba(${grayValue}, ${grayValue}, ${grayValue}, ${opacity})`;
            } else {
                preview.style.color = `rgba(0, 0, 0, ${opacity})`;
            }
            break;
            
        case 'bar':
            // Update position
            preview.style.left = `${element.x || 0}px`;
            preview.style.top = `${element.y || 0}px`;
            preview.style.width = `${element.width || 200}px`;
            preview.style.height = `${element.height || 20}px`;
            preview.style.border = 'none'; // Remove border
            preview.style.backgroundColor = `rgba(238, 238, 238, ${opacity})`; // Background with transparency
            
            // Update the filled part
            const maxValue = element.maxValue || 100;
            const currentValue = Math.min(element.currentValue || 0, maxValue);
            const fillPercentage = (currentValue / maxValue) * 100;
            
            // Get or create the fill bar
            let fillBar = preview.querySelector('div');
            if (!fillBar) {
                fillBar = document.createElement('div');
                fillBar.style.height = '100%';
                preview.appendChild(fillBar);
            }
            
            fillBar.style.width = `${fillPercentage}%`;
            
            // Use the bar color or apply grayscale with transparency
            if (grayscaleValue > 0) {
                // Calculate gray value (0-255) based on grayscale intensity
                const grayValue = Math.floor(255 * (1 - grayscaleValue/100));
                fillBar.style.backgroundColor = `rgba(${grayValue}, ${grayValue}, ${grayValue}, ${opacity})`;
            } else {
                const barColor = element.barColor || '#4CAF50'; // Default green
                // Parse the hex color to RGB for RGBA conversion
                const r = parseInt(barColor.substring(1, 3), 16);
                const g = parseInt(barColor.substring(3, 5), 16);
                const b = parseInt(barColor.substring(5, 7), 16);
                fillBar.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${opacity})`;
            }
            break;
    }
}

// Enhanced updateJsonTextarea function
function updateJsonTextarea() {
    try {
        // Get the current JSON data structure
        const jsonData = getCurrentJsonData();
        
        // Format and update the textarea with the current state
        jsonInput.value = JSON.stringify(jsonData, null, 2);
    } catch (error) {
        console.error("Failed to update JSON textarea:", error);
    }
}

// Function to build the current JSON data from all elements
function getCurrentJsonData() {
    try {
        // Start with the current JSON structure
        const jsonData = JSON.parse(jsonInput.value);
        
        // Update elements array with current values
        if (jsonData.elements && Array.isArray(jsonData.elements)) {
            // For each element in the JSON, update with current control values
            jsonData.elements.forEach(element => {
                // Find all controls for this element
                const controls = document.querySelectorAll(`[data-element-id="${element.id || ''}"][data-property]`);
                
                // Update element properties from controls
                controls.forEach(control => {
                    const property = control.dataset.property;
                    let value = control.value;
                    
                    // Convert numeric values
                    if (property !== 'content' && property !== 'font') {
                        value = parseInt(value, 10);
                    }
                    
                    // Update the element property
                    element[property] = value;
                });
            });
        }
        
        return jsonData;
    } catch (error) {
        console.error("Error building JSON data:", error);
        // Return original JSON if there's an error
        return JSON.parse(jsonInput.value);
    }
}

// Add event listener to the JSON input for manual edits
jsonInput.addEventListener('change', function() {
    try {
        // Parse the JSON to validate it
        const jsonData = JSON.parse(this.value);
        
        // Re-render the controls and preview
        parseJsonAndGenerateControls();
    } catch (error) {
        console.error("Invalid JSON:", error);
        jsonError.textContent = `Error: ${error.message}`;
    }
});

// Function to ensure the preview elements match the Python script behavior
function updateCirclePreviewRendering() {
    // Find all preview items that are circles
    const circleElements = document.querySelectorAll('.preview-item');
    
    circleElements.forEach(element => {
        const elementId = element.dataset.elementId;
        if (!elementId) return;
        
        // Find the element in the JSON
        try {
            const jsonData = JSON.parse(jsonInput.value);
            const circleElement = jsonData.elements.find(e => (e.id || '') === elementId && e.type === 'circle');
            
            if (circleElement) {
                // The current rendering code already takes care of proper positioning
                // Apply grayscale if needed
                if (circleElement.grayscale) {
                    element.style.filter = 'grayscale(100%)';
                } else {
                    element.style.filter = 'none';
                }
            }
        } catch (e) {
            console.error("Error updating circle element:", e);
        }
    });
}

// Add event listener for the Generate button
const generateBtn = document.getElementById('generateBtn');
generateBtn.addEventListener('click', executeImageGeneration);

function executeImageGeneration() {
    try {
        // Get the current JSON configuration
        const jsonData = getCurrentJsonData();
        
        // Prepare arguments for the Python script
        const args = [`--config=${JSON.stringify(jsonData)}`];
        
        // Build the full command string for display
        const fullCommand = `/python-env/bin/python3 generate_image.py ${args.join(' ')}`;
        
        // Log the command to console
        console.log("Executing command:", fullCommand);
        
        // Before executing, update any circle positions to ensure consistency
        updateCirclePreviewRendering();
        
        // Execute the command using fetch API
        fetch('/execute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                command: 'python3',
                args: ['./storage/eink/generate_image.py', ...args]
            })
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                console.log("Image generation executed successfully");
                // If there's any output, display it
                if (result.stdout) {
                    console.log("Command output:", result.stdout);
                }

                const filePath = extractFilePath(result.stdout);
                const device = document.getElementById('eink-select-player');
                sendImage(filePath, device.value);

                try{
                    const jsonData = JSON.parse(jsonInput.value);
                    jsonData.image.device = device.value;
                    jsonInput.value = JSON.stringify(jsonData, null, 2);
                } catch(e) {
                    console.error("Failed to update JSON with new image path:", e);
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

function extractFilePath(outputString) {
    // Using regex to find a path pattern
    const pathRegex = /(?:Image saved to |saved to |file saved at |path: )(.*\.(?:png|jpg|jpeg|gif|webp|svg|bmp|tiff))/i;
    const match = outputString.match(pathRegex);
    
    if (match && match[1]) {
      return match[1].trim();
    } else {
      // If no match found, try a more generic approach
      const words = outputString.split(' ');
      // Look for file extensions
      for (let i = 0; i < words.length; i++) {
        if (words[i].match(/.*\.(png|jpg|jpeg|gif|webp|svg|bmp|tiff)$/i)) {
          // Check if this is part of a path
          let potentialPath = words[i];
          // Check previous word to see if it could be part of the path
          if (i > 0 && (words[i-1].includes('/') || words[i-1].includes('\\'))) {
            potentialPath = words[i-1] + ' ' + potentialPath;
          }
          return potentialPath.trim();
        }
      }
      return "No file path found";
    }
  }

  function removeElement(elementId) {
    try {
        const jsonData = JSON.parse(jsonInput.value);
        const index = jsonData.elements.findIndex(elem => (elem.id || '') === elementId);
        if (index !== -1) {
            jsonData.elements.splice(index, 1);
            jsonInput.value = JSON.stringify(jsonData, null, 2);
            parseJsonAndGenerateControls();
        }
    } catch (error) {
        console.error("Failed to remove element:", error);
        jsonError.textContent = `Error: ${error.message}`;
    }
}

// Function to add a new element
function addNewElement(type) {
    try {
        const jsonData = JSON.parse(jsonInput.value);
        if (!jsonData.elements) {
            jsonData.elements = [];
        }
        
        const id = `${type}_${Date.now()}`;
        let newElement;
        
        switch (type) {
            case 'box':
                newElement = {
                    type: 'box',
                    id: id,
                    x: Math.floor(imageWidth / 2) - 50,
                    y: Math.floor(imageHeight / 2) - 50,
                    width: 100,
                    height: 100,
                    grayscale: 0,
                    transparency: 0
                };
                break;
                
            case 'circle':
                newElement = {
                    type: 'circle',
                    id: id,
                    x: Math.floor(imageWidth / 2),
                    y: Math.floor(imageHeight / 2),
                    radius: 50,
                    grayscale: 0,
                    transparency: 0
                };
                break;
                
            case 'text':
                newElement = {
                    type: 'text',
                    id: id,
                    x: Math.floor(imageWidth / 2),
                    y: Math.floor(imageHeight / 2),
                    content: 'New Text',
                    fontSize: 16,
                    grayscale: 0,
                    transparency: 0
                };
                break;
                
            case 'bar':
                newElement = {
                    type: 'bar',
                    id: id,
                    x: Math.floor(imageWidth / 2) - 100,
                    y: Math.floor(imageHeight / 2) - 10,
                    width: 200,
                    height: 20,
                    currentValue: 50,
                    maxValue: 100,
                    barColor: '#4CAF50',
                    grayscale: 0,
                    transparency: 0
                };
                break;
        }
        
        jsonData.elements.push(newElement);
        jsonInput.value = JSON.stringify(jsonData, null, 2);
        parseJsonAndGenerateControls();
    } catch (error) {
        console.error("Failed to add new element:", error);
        jsonError.textContent = `Error: ${error.message}`;
    }
}

// Enhanced generateControlsForElement function with remove button and collapsible sections
function generateControlsForElement(element, index) {
    const controlGroup = document.createElement('div');
    controlGroup.className = 'control-group';
    controlGroup.dataset.elementId = element.id || `element-${index}`;
    controlGroup.style.marginBottom = '15px';
    controlGroup.style.border = '1px solid #ddd';
    controlGroup.style.borderRadius = '8px';
    controlGroup.style.overflow = 'hidden';
    
    // Header with title, toggle, and remove button
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.padding = '10px 15px';
    header.style.backgroundColor = '#1e1e1e;';
    header.style.borderBottom = '1px solid #1e1e1e;';
    header.style.cursor = 'pointer';
    
    // Toggle button
    const toggleBtn = document.createElement('span');
    toggleBtn.className = 'toggle-btn';
    toggleBtn.innerHTML = '▼';
    toggleBtn.style.marginRight = '10px';
    toggleBtn.style.fontSize = '12px';
    toggleBtn.style.transition = 'transform 0.3s ease';
    
    // Element title
    const title = document.createElement('h3');
    title.textContent = `${element.type || 'Element'} ${element.id ? `(${element.id})` : index + 1}`;
    title.style.margin = '0';
    title.style.flex = '1';
    title.style.fontSize = '16px';
    
    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '×';
    
    removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeElement(element.id || `element-${index}`);
    });
    
    header.appendChild(toggleBtn);
    header.appendChild(title);
    header.appendChild(removeBtn);
    
    // Content area (collapsible)
    const contentDiv = document.createElement('div');
    contentDiv.className = 'control-content';
    contentDiv.style.padding = '15px';
    contentDiv.style.transition = 'max-height 0.3s ease, padding 0.3s ease';
    contentDiv.style.overflow = 'hidden';
    
    // Toggle functionality
    let isExpanded = true;
    header.addEventListener('click', (e) => {
        if (e.target === removeBtn) return; // Don't toggle when clicking remove button
        
        isExpanded = !isExpanded;
        if (isExpanded) {
            contentDiv.style.maxHeight = contentDiv.scrollHeight + 'px';
            contentDiv.style.padding = '15px';
            toggleBtn.innerHTML = '▼';
        } else {
            contentDiv.style.maxHeight = '0';
            contentDiv.style.padding = '0 15px';
            toggleBtn.innerHTML = '▶';
        }
    });
    
    controlGroup.appendChild(header);
    controlGroup.appendChild(contentDiv);
    
    // Get hidden properties for this element (if any)
    const hiddenProps = element.hiddenProperties || [];
    
    // Common controls for position (only add if not hidden)
    if (!hiddenProps.includes('x')) {
        addSliderControl(contentDiv, element, 'x', 'X Position', 0, 1000);
    }
    
    if (!hiddenProps.includes('y')) {
        addSliderControl(contentDiv, element, 'y', 'Y Position', 0, 1000);
    }
    
    // Type-specific controls
    switch(element.type) {
        case 'box':
            if (!hiddenProps.includes('width')) {
                addSliderControl(contentDiv, element, 'width', 'Width', 1, 500);
            }
            if (!hiddenProps.includes('height')) {
                addSliderControl(contentDiv, element, 'height', 'Height', 1, 500);
            }
            break;
            
        case 'circle':
            if (!hiddenProps.includes('radius')) {
                addSliderControl(contentDiv, element, 'radius', 'Radius', 1, 200);
            }
            break;
            
        case 'text':
            // Text content input with real-time updates
            if (!hiddenProps.includes('content')) {
                addTextControl(contentDiv, element, 'content', 'Text');
            }
            
            // Font size slider
            if (!hiddenProps.includes('fontSize')) {
                addSliderControl(contentDiv, element, 'fontSize', 'Font Size', 8, 72);
            }
            break;
            
        case 'bar':
            // Bar controls
            if (!hiddenProps.includes('width')) {
                addSliderControl(contentDiv, element, 'width', 'Width', 10, 500);
            }
            if (!hiddenProps.includes('height')) {
                addSliderControl(contentDiv, element, 'height', 'Height', 5, 100);
            }
            
            // Current value control
            if (!hiddenProps.includes('currentValue')) {
                // Get the max for the current value slider
                const maxValue = element.maxValue || 100;
                addSliderControl(contentDiv, element, 'currentValue', 'Current Value', 0, maxValue);
            }
            
            // Max value control
            if (!hiddenProps.includes('maxValue')) {
                addSliderControl(contentDiv, element, 'maxValue', 'Max Value', 1, 1000);
            }
            break;
    }
    
    // Add grayscale slider to all elements
    if (!hiddenProps.includes('grayscale')) {
        addGrayscaleSliderControl(contentDiv, element);
    }
    
    // Add transparency slider to all elements
    if (!hiddenProps.includes('transparency')) {
        addTransparencySliderControl(contentDiv, element);
    }
    
    controlsArea.appendChild(controlGroup);
}