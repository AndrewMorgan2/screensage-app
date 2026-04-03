// vtt-controls-module.js - Fixed version with better element management

class ControlsModule {
    constructor(elements, config, previewModule, moduleName) {
        this.elements = elements;
        this.config = config;
        this.previewModule = previewModule;
        this.currentPath = config.basePath;
        this.generateVTTTimeout = null;
        this.moduleName = moduleName;

        // ADD THIS: Debounce file saves
        this.writeConfigDebounced = debounce(() => {
            this.writeConfigImmediate();
        }, 300);

        // Auto-reload functionality - DISABLED
        this.autoReloadEnabled = false; // Changed to false to disable auto-refresh
        this.autoReloadInterval = null;
        this.lastJsonContent = '';
        this.currentFilePath = null;

        // Element defaults - will be loaded from JSON
        this.elementDefaults = null;
        this.loadElementDefaults();
    }

    /**
     * Load element defaults from JSON file
     */
    async loadElementDefaults() {
        try {
            const response = await fetch('/json/read?path=./storage/vtt_configs/element_defaults.json');
            if (!response.ok) {
                console.warn('Could not load element defaults, using hardcoded values');
                return;
            }
            this.elementDefaults = await response.json();
            console.log('✓ Element defaults loaded from file');
        } catch (error) {
            console.warn('Error loading element defaults:', error);
        }
    }

    parseJsonAndGenerateControls(skipSave = false) {
        try {
            this.elements.jsonError.textContent = '';
            this.elements.controlsArea.innerHTML = '';

            // Don't clear preview immediately - we'll manage individual elements
            // this.previewModule.clearPreview();

            // Parse JSON
            const jsonData = JSON.parse(this.elements.jsonInput.value);

            this.generateZoomControls(jsonData);

            this.previewModule.updateZoomFromJson();

            // Set background if defined
            if (jsonData.background) {
                // Updating map handled by previewModule
                this.previewModule.initializeMap();
            }

            // Validate structure
            if (!jsonData.elements || !Array.isArray(jsonData.elements)) {
                throw new Error("JSON must have an 'elements' array");
            }

            // Get existing preview elements to track what needs to be removed
            const existingElements = new Set();
            const previewItems = this.elements.previewArea.querySelectorAll('.preview-item');
            previewItems.forEach(item => {
                const elementId = item.dataset.elementId;
                if (elementId) {
                    existingElements.add(elementId);
                }
            });

            // Track which elements should exist after this update
            const shouldExistElements = new Set();

            // Generate controls for each element and render in preview
            jsonData.elements.forEach((element, index) => {
                // Ensure element has a collapsed property (default: false)
                if (element.collapsed === undefined) {
                    element.collapsed = false;
                    // Update JSON with the default collapsed state
                    jsonData.elements[index] = element;
                }

                const elementId = element.id || `element-${index}`;
                shouldExistElements.add(elementId);

                this.generateControlsForElement(element, index);
                this.previewModule.renderPreviewElement(element);
            });

            // Remove preview elements that no longer exist in the JSON
            existingElements.forEach(elementId => {
                if (!shouldExistElements.has(elementId)) {
                    this.previewModule.removePreviewElement(elementId);
                }
            });

            // Update the JSON to ensure collapsed states are saved
            this.elements.jsonInput.value = JSON.stringify(jsonData, null, 2);

            // Only write config for user-initiated changes, not external reloads
            if (!skipSave) {
                this.writeConfig();
            }

            // Auto-load background image for Sageslate (uses 'image' instead of 'background')
            if (jsonData.image && jsonData.image.src && !jsonData.background) {
                if (window.sageslateSetBackgroundImage) {
                    console.log('Auto-loading Sageslate background from JSON:', jsonData.image.src);
                    // Small delay to ensure preview is fully initialized
                    setTimeout(() => {
                        window.sageslateSetBackgroundImage(jsonData.image.src);
                    }, 50);
                }
            }

        } catch (error) {
            this.elements.jsonError.textContent = `Error: ${error.message}`;
            this.elements.controlsArea.innerHTML = '<p>Please fix the JSON format to generate controls.</p>';
        }
    }

    loadConfigFile(path, filename) {
        fetch(`/json/read?path=${encodeURIComponent(path)}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load config file: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                // Clear preview when loading a new config file
                this.previewModule.clearPreview();

                // Update the JSON input
                this.elements.jsonInput.value = JSON.stringify(data, null, 2);

                // Set the filename in the save field
                this.elements.saveFilename.value = filename;

                // Store current file path and content for auto-reload
                this.currentFilePath = path;
                this.lastJsonContent = JSON.stringify(data);

                // Parse the JSON (skipSave=true: just loaded from disk, no need to write back)
                this.parseJsonAndGenerateControls(true);

                // Start auto-reload polling
                this.startAutoReload();
            })
            .catch(error => {
                console.error("Error loading config file:", error);
                this.elements.jsonError.textContent = `Error loading file: ${error.message}`;
            });
    }

    /**
     * Reload the current config file from disk
     * Used by external sources (like media browser) to refresh the display after updates
     */
    reloadCurrentConfig() {
        const path = this.currentFilePath || this.getDefaultConfigPath();

        // Add cache busting parameter to ensure fresh data
        const cacheBuster = `&t=${Date.now()}`;

        fetch(`/json/read?path=${encodeURIComponent(path)}${cacheBuster}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to reload config file: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                // Clear preview to ensure clean reload
                this.previewModule.clearPreview();

                // Update the JSON input
                this.elements.jsonInput.value = JSON.stringify(data, null, 2);

                // Update last content
                this.lastJsonContent = JSON.stringify(data);

                // IMPORTANT: Initialize map BEFORE parsing elements
                // This ensures dimensions are available for percentage positioning
                if (this.moduleName !== 'Sageslate' && data.background) {
                    this.previewModule.initializeMap();
                }

                // Re-parse to update UI and preview (elements will now have correct positions)
                // skipSave=true: don't write back to disk since we just read from disk
                this.parseJsonAndGenerateControls(true);

                console.log('✓ Config reloaded from disk - UI and preview updated');
            })
            .catch(error => {
                console.error("Error reloading config file:", error);
            });
    }

    /**
     * Setup refresh listener for external updates via WebSocket.
     * Falls back to polling if the WebSocket connection fails.
     */
    setupRefreshListener() {
        const target = this.moduleName.toLowerCase();
        console.log(`Setting up WebSocket refresh listener for ${this.moduleName} (target: ${target})`);

        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${location.host}/ws`);

        ws.onopen = () => {
            console.log(`WebSocket connected for ${this.moduleName}`);
        };

        ws.onmessage = (event) => {
            let data;
            try {
                data = JSON.parse(event.data);
            } catch {
                return;
            }
            if (data.type === 'refresh' && data.target === target) {
                console.log(`Refresh received for ${this.moduleName} (source: ${data.source})`);
                // Delay to ensure file writes are complete and media dimensions are available
                setTimeout(() => this.reloadCurrentConfig(), 500);
            }
        };

        ws.onclose = () => {
            console.warn(`WebSocket closed for ${this.moduleName}, reconnecting in 2s...`);
            setTimeout(() => this.setupRefreshListener(), 2000);
        };

        ws.onerror = (err) => {
            console.error(`WebSocket error for ${this.moduleName}:`, err);
        };
    }

    /**
     * Get the default config path based on module name
     */
    getDefaultConfigPath() {
        if (this.moduleName === "VTT") {
            return "./storage/scrying_glasses/battlemap.json";
        } else if (this.moduleName === "Display") {
            return "./storage/scrying_glasses/display.json";
        } else if (this.moduleName === "Sageslate") {
            return `${this.config.basePath}/${this.config.defaultFilename}`;
        }
        return "./storage/scrying_glasses/display.json";
    }

    startAutoReload() {
        // Stop any existing interval first
        this.stopAutoReload();

        if (!this.autoReloadEnabled) {
            console.log('⏸️ Auto-reload disabled');
            return;
        }

        if (!this.currentFilePath) {
            console.warn('⚠️ Cannot start auto-reload: no file path set');
            return;
        }

        console.log(`🔄 Auto-reload enabled for: ${this.currentFilePath}`);

        this.autoReloadInterval = setInterval(() => {
            this.checkForFileChanges();
        }, 2000); // Check every 2 seconds

        // Do an immediate check
        this.checkForFileChanges();
    }

    stopAutoReload() {
        if (this.autoReloadInterval) {
            clearInterval(this.autoReloadInterval);
            this.autoReloadInterval = null;
            console.log('⏸️ Auto-reload stopped');
        }
    }

    checkForFileChanges() {
        if (!this.currentFilePath) {
            console.warn('⚠️ checkForFileChanges: no currentFilePath');
            return;
        }

        // Don't reload if user is dragging an element
        const draggableModule = window.draggableModule || this.draggableModuleRef;
        if (draggableModule && draggableModule.isDragging) {
            return;
        }

        fetch(`/json/read?path=${encodeURIComponent(this.currentFilePath)}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to check file: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                const newContent = JSON.stringify(data);

                // Check if content has changed
                if (newContent !== this.lastJsonContent) {
                    console.log('📄 Config file changed externally, reloading...');
                    console.log(`   Old length: ${this.lastJsonContent.length}, New length: ${newContent.length}`);

                    // Update last content
                    this.lastJsonContent = newContent;

                    // Update JSON input
                    this.elements.jsonInput.value = JSON.stringify(data, null, 2);

                    // Regenerate controls and preview
                    // skipSave=true: don't write back to disk since we just read from disk
                    this.parseJsonAndGenerateControls(true);
                } else {
                    // Silent check - file hasn't changed
                    // Uncomment for debugging: console.log('✓ Auto-reload check: no changes');
                }
            })
            .catch(error => {
                console.error("❌ Error checking file changes:", error);
                console.error("   File path:", this.currentFilePath);
            });
    }

    generateControlsForElement(element, index) {
        const controlGroup = document.createElement('div');
        controlGroup.className = 'control-group';
        controlGroup.dataset.elementId = element.id || `element-${index}`;

        // Create header section with element title and toggle button
        const headerSection = document.createElement('div');
        headerSection.className = 'control-header';
        headerSection.style.display = 'flex';
        headerSection.style.justifyContent = 'space-between';
        headerSection.style.alignItems = 'center';
        headerSection.style.cursor = 'pointer';
        headerSection.style.marginBottom = '10px';

        // Element title (use name if available, otherwise use id)
        const title = document.createElement('h3');
        const displayName = element.name || element.id || `${index + 1}`;
        title.textContent = `${element.type || 'Element'} - ${displayName}`;
        title.style.margin = '0';

        // Toggle/collapse button
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'toggle-btn';
        toggleBtn.style.padding = '3px 8px';
        toggleBtn.style.fontSize = '12px';
        toggleBtn.style.marginLeft = '10px';
        toggleBtn.title = 'Collapse/Expand';

        // Create the content div that will be collapsible
        const contentDiv = document.createElement('div');
        contentDiv.className = 'control-content';
        contentDiv.style.transition = 'max-height 0.3s ease';

        // Add header components
        headerSection.appendChild(title);
        headerSection.appendChild(toggleBtn);
        controlGroup.appendChild(headerSection);
        controlGroup.appendChild(contentDiv);

        // Check if element has a collapsed property, default to false (expanded) if not defined
        if (element.collapsed === undefined) {
            element.collapsed = false;
        }

        // Set initial state based on the collapsed property
        let isExpanded = !element.collapsed;

        // Initialize button state and content visibility
        toggleBtn.innerHTML = isExpanded ? '▼' : '▶';

        // Set initial content state immediately
        if (!isExpanded) {
            contentDiv.style.maxHeight = '0px';
            contentDiv.style.overflow = 'hidden';
        } else {
            contentDiv.style.maxHeight = 'none';
            contentDiv.style.overflow = 'visible';
        }

        const toggleCollapse = (e) => {
            // Prevent this from firing if the click was on the remove button
            if (e.target.classList.contains('danger-btn')) {
                return;
            }

            isExpanded = !isExpanded;

            // Update the element's collapsed state in JSON directly
            try {
                const jsonData = JSON.parse(this.elements.jsonInput.value);
                const elementIndex = jsonData.elements.findIndex(el => el.id === element.id);

                if (elementIndex !== -1) {
                    // Update the collapsed state
                    jsonData.elements[elementIndex].collapsed = !isExpanded;

                    // Update the JSON textarea
                    this.elements.jsonInput.value = JSON.stringify(jsonData, null, 2);

                    // Also update our working copy
                    element.collapsed = !isExpanded;
                }
            } catch (error) {
                console.error("Error updating collapse state in JSON:", error);
            }

            if (isExpanded) {
                contentDiv.style.maxHeight = contentDiv.scrollHeight + 'px';
                contentDiv.style.overflow = 'visible';
                toggleBtn.innerHTML = '▼'; // Down arrow
            } else {
                contentDiv.style.maxHeight = '0';
                contentDiv.style.overflow = 'hidden';
                toggleBtn.innerHTML = '▶'; // Right arrow
            }
        };

        headerSection.addEventListener('click', toggleCollapse);

        const { width: mapWidth, height: mapHeight } = this.previewModule.getMapDimensions();

        // Get hidden properties for this element (if any)
        const hiddenProps = element.hiddenProperties || [];

        // Add locked checkbox control for all element types
        this.addCheckboxControl(contentDiv, element, 'locked', 'Locked (not draggable)');

        // Add name control for all element types
        this.addTextControl(contentDiv, element, 'name', 'Name (for dropdown display)');

        // Common position controls
        if (!hiddenProps.includes('x')) {
            this.addSliderControl(contentDiv, element, 'x', 'X Position', 0, mapWidth);
        }
        if (!hiddenProps.includes('y')) {
            this.addSliderControl(contentDiv, element, 'y', 'Y Position', 0, mapHeight);
        }
        if (!hiddenProps.includes('invisible')) {
            this.addBoolControl(contentDiv, element, 'invisible', 'Invisible');
        }

        // Type-specific controls
        switch (element.type) {
            case 'token':
                if (!hiddenProps.includes('size')) {
                    this.addSliderControl(contentDiv, element, 'size', 'Size', 10, 200);
                }
                if (!hiddenProps.includes('color')) {
                    this.addColorControl(contentDiv, element, 'color', 'Color');
                }
                if (!hiddenProps.includes('label')) {
                    this.addTextControl(contentDiv, element, 'label', 'Label');
                    // Add checkbox to control label visibility (default: true)
                    this.addCheckboxControl(contentDiv, element, 'labelDisplay', 'Display Label', true);
                }
                break;

            case 'area':
                if (!hiddenProps.includes('width')) {
                    this.addSliderControl(contentDiv, element, 'width', 'Width', 10, mapWidth);
                }
                if (!hiddenProps.includes('height')) {
                    this.addSliderControl(contentDiv, element, 'height', 'Height', 10, mapHeight);
                }
                if (!hiddenProps.includes('keepAspectRatio')) {
                    this.addCheckboxControl(contentDiv, element, 'keepAspectRatio', 'Keep Aspect Ratio');
                }
                if (!hiddenProps.includes('color')) {
                    this.addColorControl(contentDiv, element, 'color', 'Color');
                }
                if (!hiddenProps.includes('alpha')) {
                    this.addSliderControl(contentDiv, element, 'alpha', 'Opacity (%)', 0, 100);
                }
                if (!hiddenProps.includes('rotation')) {
                    this.addSliderControl(contentDiv, element, 'rotation', 'Rotation (degrees)', 0, 360);
                }
                if (!hiddenProps.includes('label')) {
                    this.addTextControl(contentDiv, element, 'label', 'Label');
                    // Add checkbox to control label visibility (default: true)
                    this.addCheckboxControl(contentDiv, element, 'labelDisplay', 'Display Label', true);
                }
                break;

            case 'text':
                if (!hiddenProps.includes('text')) {
                    this.addTextControl(contentDiv, element, 'text', 'Text Content');
                }
                if (!hiddenProps.includes('size')) {
                    this.addSliderControl(contentDiv, element, 'size', 'Font Size', 8, 72);
                }
                if (!hiddenProps.includes('color')) {
                    this.addColorControl(contentDiv, element, 'color', 'Text Color');
                }
                if (!hiddenProps.includes('font')) {
                    this.addSelectControl(contentDiv, element, 'font', 'Font Family', [
                        'Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana', 'Comic Sans MS'
                    ]);
                }
                if (!hiddenProps.includes('alignment')) {
                    this.addSelectControl(contentDiv, element, 'alignment', 'Text Alignment', [
                        'left', 'center', 'right'
                    ]);
                }
                break;

            case 'video':
                if (!hiddenProps.includes('src')) {
                    this.addTextControl(contentDiv, element, 'src', 'Image Path');
                }
                if (!hiddenProps.includes('width')) {
                    this.addSliderControl(contentDiv, element, 'width', 'Width', 50, mapWidth);
                }
                if (!hiddenProps.includes('height')) {
                    this.addSliderControl(contentDiv, element, 'height', 'Height', 50, mapHeight);
                }
                if (!hiddenProps.includes('keepAspectRatio')) {
                    this.addCheckboxControl(contentDiv, element, 'keepAspectRatio', 'Keep Aspect Ratio');
                }
                if (!hiddenProps.includes('opacity')) {
                    this.addSliderControl(contentDiv, element, 'opacity', 'Opacity', 0, 100);
                }
                if (!hiddenProps.includes('rotation')) {
                    this.addSliderControl(contentDiv, element, 'rotation', 'Rotation (degrees)', 0, 360);
                }
                break;

            case 'image':
                if (!hiddenProps.includes('src')) {
                    this.addTextControl(contentDiv, element, 'src', 'Image Path');
                }
                if (!hiddenProps.includes('width')) {
                    this.addSliderControl(contentDiv, element, 'width', 'Width', 50, mapWidth);
                }
                if (!hiddenProps.includes('height')) {
                    this.addSliderControl(contentDiv, element, 'height', 'Height', 50, mapHeight);
                }
                if (!hiddenProps.includes('keepAspectRatio')) {
                    this.addCheckboxControl(contentDiv, element, 'keepAspectRatio', 'Keep Aspect Ratio');
                }
                if (!hiddenProps.includes('opacity')) {
                    this.addSliderControl(contentDiv, element, 'opacity', 'Opacity', 0, 100);
                }
                if (!hiddenProps.includes('rotation')) {
                    this.addSliderControl(contentDiv, element, 'rotation', 'Rotation (degrees)', 0, 360);
                }
                break;

            case 'svg':
                if (!hiddenProps.includes('src')) {
                    this.addTextControl(contentDiv, element, 'src', 'SVG Path');
                }
                if (!hiddenProps.includes('width')) {
                    this.addSliderControl(contentDiv, element, 'width', 'Width', 50, mapWidth);
                }
                if (!hiddenProps.includes('height')) {
                    this.addSliderControl(contentDiv, element, 'height', 'Height', 50, mapHeight);
                }
                if (!hiddenProps.includes('opacity')) {
                    this.addSliderControl(contentDiv, element, 'opacity', 'Opacity', 0, 100);
                }
                if (!hiddenProps.includes('rotation')) {
                    this.addSliderControl(contentDiv, element, 'rotation', 'Rotation (degrees)', 0, 360);
                }
                if (!hiddenProps.includes('color')) {
                    this.addColorControl(contentDiv, element, 'color', 'Fill Color (SVG only)');
                }
                break;
            case 'gif':
                if (!hiddenProps.includes('src')) {
                    this.addTextControl(contentDiv, element, 'src', 'File Path');
                }
                if (!hiddenProps.includes('width')) {
                    this.addSliderControl(contentDiv, element, 'width', 'Width', 50, mapWidth);
                }
                if (!hiddenProps.includes('height')) {
                    this.addSliderControl(contentDiv, element, 'height', 'Height', 50, mapHeight);
                }
                if (!hiddenProps.includes('keepAspectRatio')) {
                    this.addCheckboxControl(contentDiv, element, 'keepAspectRatio', 'Keep Aspect Ratio');
                }
                if (element.type === 'video') {
                    if (!hiddenProps.includes('autoplay')) {
                        this.addCheckboxControl(contentDiv, element, 'autoplay', 'Autoplay');
                    }
                    if (!hiddenProps.includes('loop')) {
                        this.addCheckboxControl(contentDiv, element, 'loop', 'Loop');
                    }
                    if (!hiddenProps.includes('muted')) {
                        this.addCheckboxControl(contentDiv, element, 'muted', 'Muted');
                    }
                }
                break;

            case 'line':
                if (!hiddenProps.includes('endX')) {
                    this.addSliderControl(contentDiv, element, 'endX', 'End X', 0, mapWidth);
                }
                if (!hiddenProps.includes('endY')) {
                    this.addSliderControl(contentDiv, element, 'endY', 'End Y', 0, mapHeight);
                }
                if (!hiddenProps.includes('thickness')) {
                    this.addSliderControl(contentDiv, element, 'thickness', 'Thickness', 1, 20);
                }
                if (!hiddenProps.includes('color')) {
                    this.addColorControl(contentDiv, element, 'color', 'Color');
                }
                if (!hiddenProps.includes('label')) {
                    this.addTextControl(contentDiv, element, 'label', 'Label');
                    // Add checkbox to control label visibility (default: true)
                    this.addCheckboxControl(contentDiv, element, 'labelDisplay', 'Display Label', true);
                }
                break;

            case 'cone':
                if (!hiddenProps.includes('angle')) {
                    this.addSliderControl(contentDiv, element, 'angle', 'Angle', 0, 360);
                }
                if (!hiddenProps.includes('direction')) {
                    this.addSliderControl(contentDiv, element, 'direction', 'Direction', 0, 360);
                }
                if (!hiddenProps.includes('radius')) {
                    this.addSliderControl(contentDiv, element, 'radius', 'Radius', 100, mapWidth);
                }
                if (!hiddenProps.includes('color')) {
                    this.addColorControl(contentDiv, element, 'color', 'Color');
                }
                if (!hiddenProps.includes('alpha')) {
                    this.addSliderControl(contentDiv, element, 'alpha', 'Opacity (%)', 0, 100);
                }
                if (!hiddenProps.includes('label')) {
                    this.addTextControl(contentDiv, element, 'label', 'Label');
                    // Add checkbox to control label visibility (default: true)
                    this.addCheckboxControl(contentDiv, element, 'labelDisplay', 'Display Label', true);
                }
                break;

            case 'box':
                if (!hiddenProps.includes('width')) {
                    this.addSliderControl(contentDiv, element, 'width', 'Width', 1, 500);
                }
                if (!hiddenProps.includes('height')) {
                    this.addSliderControl(contentDiv, element, 'height', 'Height', 1, 500);
                }
                if (!hiddenProps.includes('keepAspectRatio')) {
                    this.addCheckboxControl(contentDiv, element, 'keepAspectRatio', 'Keep Aspect Ratio');
                }
                if (!hiddenProps.includes('grayscale')) {
                    this.addSliderControl(contentDiv, element, 'grayscale', 'Grayscale', 0, 100);
                }
                if (!hiddenProps.includes('transparency')) {
                    this.addSliderControl(contentDiv, element, 'transparency', 'Transparency', 0, 100);
                }
                break;

            case 'circle':
                if (!hiddenProps.includes('radius')) {
                    this.addSliderControl(contentDiv, element, 'radius', 'Radius', 1, 200);
                }
                if (!hiddenProps.includes('grayscale')) {
                    this.addSliderControl(contentDiv, element, 'grayscale', 'Grayscale', 0, 100);
                }
                if (!hiddenProps.includes('transparency')) {
                    this.addSliderControl(contentDiv, element, 'transparency', 'Transparency', 0, 100);
                }
                break;

            case 'bar':
                if (!hiddenProps.includes('width')) {
                    this.addSliderControl(contentDiv, element, 'width', 'Width', 10, 500);
                }
                if (!hiddenProps.includes('height')) {
                    this.addSliderControl(contentDiv, element, 'height', 'Height', 5, 100);
                }
                if (!hiddenProps.includes('currentValue')) {
                    this.addSliderControl(contentDiv, element, 'currentValue', 'Current Value', 0, element.maxValue || 100);
                }
                if (!hiddenProps.includes('maxValue')) {
                    this.addSliderControl(contentDiv, element, 'maxValue', 'Max Value', 1, 1000);
                }
                if (!hiddenProps.includes('barColor')) {
                    this.addColorControl(contentDiv, element, 'barColor', 'Bar Color');
                }
                if (!hiddenProps.includes('grayscale')) {
                    this.addSliderControl(contentDiv, element, 'grayscale', 'Grayscale', 0, 100);
                }
                if (!hiddenProps.includes('transparency')) {
                    this.addSliderControl(contentDiv, element, 'transparency', 'Transparency', 0, 100);
                }
                break;
        }

        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'Remove Element';
        removeBtn.className = 'danger-btn';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeElement(element.id || `element-${index}`);
        });
        contentDiv.appendChild(removeBtn);

        this.elements.controlsArea.appendChild(controlGroup);
    }
    addSliderControl(parent, element, property, label, min, max) {
        const container = document.createElement('div');
        container.className = 'slider-container';

        const labelElement = document.createElement('label');
        labelElement.textContent = label + ':';

        // Determine if this property can use percentages (not for opacity, rotation, angles, or pan)
        const nonPercentageProps = ['opacity', 'rotation', 'angle', 'direction', 'level', 'panX', 'panY'];
        const supportsPercentage = !nonPercentageProps.includes(property);

        // Detect if current value is a percentage
        const currentValue = element[property];
        let isPercentageMode = false;
        let numericValue = 0;

        // Only allow percentage mode if the property supports it
        if (supportsPercentage && typeof currentValue === 'string' && currentValue.includes('%')) {
            isPercentageMode = true;
            numericValue = parseFloat(currentValue);
        } else if (supportsPercentage && typeof currentValue === 'number' && currentValue > 0 && currentValue <= 1.0) {
            // Relative float (treat as percentage)
            isPercentageMode = true;
            numericValue = currentValue * 100;
        } else if (typeof currentValue === 'string' && currentValue.includes('%')) {
            // Property doesn't support percentage mode, but value has %, just parse the number
            numericValue = parseFloat(currentValue);
        } else {
            numericValue = Number(currentValue) || 0;
        }

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.step = 'any';
        slider.dataset.property = property;

        const valueDisplay = document.createElement('input');
        valueDisplay.type = 'number';
        valueDisplay.step = 'any';
        valueDisplay.dataset.property = property;

        // Percentage toggle button (if supported)
        let toggleBtn = null;
        if (supportsPercentage) {
            toggleBtn = document.createElement('button');
            toggleBtn.textContent = isPercentageMode ? '%' : 'px';
            toggleBtn.title = 'Toggle between pixels and percentage';
            toggleBtn.style.width = '35px';
            toggleBtn.style.marginLeft = '5px';
            toggleBtn.style.fontSize = '11px';
            toggleBtn.style.padding = '2px';
            toggleBtn.className = isPercentageMode ? 'percentage-mode' : 'pixel-mode';
        }

        // Function to get reference dimension for percentage calculations
        const getReferenceDimension = () => {
            const widthBasedProps = ['x', 'width', 'thickness', 'endX', 'radius'];
            const heightBasedProps = ['y', 'height', 'size', 'endY']; // 'size' uses height (matches display engine)

            if (widthBasedProps.includes(property)) {
                return this.previewModule?.mapWidth || 1920;
            } else if (heightBasedProps.includes(property)) {
                return this.previewModule?.mapHeight || 1080;
            }
            return this.previewModule?.mapWidth || 1920; // Default to width
        };

        // Function to update slider range based on mode
        const updateSliderRange = (percentMode) => {
            if (percentMode) {
                slider.min = 0;
                slider.max = 100;
                valueDisplay.min = 0;
                valueDisplay.max = 100;
            } else {
                slider.min = min;
                slider.max = max;
                valueDisplay.min = min;
                valueDisplay.max = max;
            }
        };

        // Initialize slider range
        updateSliderRange(isPercentageMode);
        slider.value = numericValue;
        valueDisplay.value = numericValue;

        const updateValue = (value, percentMode) => {
            const numValue = Number(value);
            slider.value = numValue;
            valueDisplay.value = numValue;

            // Convert to appropriate format for JSON
            let jsonValue;
            if (percentMode && supportsPercentage) {
                jsonValue = numValue + '%';
            } else {
                jsonValue = numValue;
            }

            element[property] = jsonValue;

            try {
                const jsonData = JSON.parse(this.elements.jsonInput.value);

                if (element.id) {
                    // update normal element
                    const found = jsonData.elements?.find(el => el.id === element.id);
                    if (found) {
                        // Handle aspect ratio for images, videos, and GIFs BEFORE updating property
                        let shouldUpdateOtherDimension = false;
                        let otherProperty = '';
                        let newOtherValue = 0;

                        if (found.keepAspectRatio && (property === 'width' || property === 'height')) {
                            const isWidthChange = property === 'width';
                            otherProperty = isWidthChange ? 'height' : 'width';

                            // Get OLD dimensions BEFORE update (parse to numbers if percentages)
                            const parseSizeToNumber = (val) => {
                                if (typeof val === 'string' && val.endsWith('%')) {
                                    return parseFloat(val);
                                }
                                return Number(val) || 0;
                            };

                            const oldWidth = parseSizeToNumber(found.width);
                            const oldHeight = parseSizeToNumber(found.height);

                            if (oldWidth > 0 && oldHeight > 0) {
                                // Calculate aspect ratio from OLD dimensions
                                const aspectRatio = oldWidth / oldHeight;

                                if (isWidthChange) {
                                    // Width changed, calculate new height
                                    newOtherValue = numValue / aspectRatio;
                                } else {
                                    // Height changed, calculate new width
                                    newOtherValue = numValue * aspectRatio;
                                }

                                shouldUpdateOtherDimension = true;
                            }
                        }

                        // Now update the changed property
                        found[property] = jsonValue;

                        // Update the other dimension if aspect ratio is enabled
                        if (shouldUpdateOtherDimension) {
                            // Apply same percentage mode to other dimension
                            if (percentMode && supportsPercentage) {
                                found[otherProperty] = newOtherValue + '%';
                            } else {
                                found[otherProperty] = newOtherValue;
                            }

                            // Update the element object too
                            element[otherProperty] = found[otherProperty];

                            // Update the other slider/input if it exists
                            const otherSlider = container.parentElement.querySelector(`input[data-property="${otherProperty}"][type="range"]`);
                            const otherInput = container.parentElement.querySelector(`input[data-property="${otherProperty}"][type="number"]`);
                            if (otherSlider) otherSlider.value = Math.round(newOtherValue);
                            if (otherInput) otherInput.value = Math.round(newOtherValue);
                        }

                        if (this.previewModule && this.previewModule.updatePreviewElement) {
                            this.previewModule.updatePreviewElement(found);
                        }
                    }
                } else if (jsonData.zoom) {
                    // update zoom section
                    // For panX and panY, always save as percentage strings
                    if (property === 'panX' || property === 'panY') {
                        jsonData.zoom[property] = jsonValue + '%';
                    } else {
                        jsonData.zoom[property] = jsonValue;
                    }
                }

                // rewrite JSON textarea
                this.elements.jsonInput.value = JSON.stringify(jsonData, null, 2);

                // ✅ ADD THIS: Update visible area box if this is a zoom property
                const isZoomProperty = ['level', 'panX', 'panY'].includes(property);
                if (isZoomProperty && this.previewModule && this.previewModule.updateZoomFromJson) {
                    this.previewModule.updateZoomFromJson();
                }

                // trigger the same downstream behavior as buttons
                if (this.writeConfig) {
                    this.writeConfig();
                }
            } catch (err) {
                console.error("Slider JSON update error:", err);
            }
        };

        // Toggle button handler
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                isPercentageMode = !isPercentageMode;
                toggleBtn.textContent = isPercentageMode ? '%' : 'px';
                toggleBtn.className = isPercentageMode ? 'percentage-mode' : 'pixel-mode';

                // Convert current value
                const currentNumValue = Number(valueDisplay.value);
                const ref = getReferenceDimension();
                let newValue;

                console.log(`🔄 Converting ${property}: ${currentNumValue} (mode: ${isPercentageMode ? 'to %' : 'to px'}, ref: ${ref}, mapWidth: ${this.previewModule?.mapWidth}, mapHeight: ${this.previewModule?.mapHeight})`);

                if (isPercentageMode) {
                    // Convert from absolute pixels to percentage
                    newValue = (currentNumValue / ref) * 100;
                } else {
                    // Convert from percentage to absolute pixels
                    newValue = (currentNumValue / 100) * ref;
                }

                console.log(`  Result: ${newValue}`);

                updateSliderRange(isPercentageMode);
                updateValue(newValue, isPercentageMode);
            });
        }

        // Trigger on drag (input) and also on manual change (change)
        slider.addEventListener('input', () => updateValue(slider.value, isPercentageMode));
        slider.addEventListener('change', () => updateValue(slider.value, isPercentageMode));
        valueDisplay.addEventListener('input', () => updateValue(valueDisplay.value, isPercentageMode));
        valueDisplay.addEventListener('change', () => updateValue(valueDisplay.value, isPercentageMode));

        container.appendChild(labelElement);
        container.appendChild(slider);
        container.appendChild(valueDisplay);
        if (toggleBtn) {
            container.appendChild(toggleBtn);
        }
        parent.appendChild(container);
    }

    // =============================================================================
    // ALSO FIX addTextControl
    // =============================================================================

    addTextControl(parent, element, property, label) {
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

        textInput.addEventListener('input', () => {
            // ⭐ Call updateElementProperty which should update preview
            this.updateElementProperty(element, property, textInput.value);
        });

        container.appendChild(labelElement);
        container.appendChild(textInput);
        parent.appendChild(container);
    }

    // =============================================================================
    // ALSO FIX addColorControl  
    // =============================================================================

    addColorControl(parent, element, property, label) {
        const container = document.createElement('div');
        container.className = 'slider-container';

        const labelElement = document.createElement('label');
        labelElement.textContent = label + ':';

        const colorInput = document.createElement('input');
        colorInput.type = 'color';

        // Extract original color and opacity
        const originalColor = element[property] || '#ffffff';
        const originalOpacity = this.extractOpacity(originalColor);

        // For areas, always use default opacity of 0.3 (30%)
        const opacityToUse = (element.type === 'area') ? 0.3 : originalOpacity;

        colorInput.value = this.convertToHex(originalColor);
        colorInput.dataset.property = property;
        colorInput.dataset.elementId = element.id || '';
        colorInput.dataset.originalOpacity = opacityToUse;
        colorInput.dataset.elementType = element.type || '';

        colorInput.addEventListener('input', () => {
            const opacity = parseFloat(colorInput.dataset.originalOpacity);
            // Combine new color with original opacity
            const newColorWithOpacity = this.applyOpacity(
                colorInput.value,
                opacity
            );

            console.log('🎨 Color changed:', {
                elementType: element.type,
                elementId: element.id,
                hexValue: colorInput.value,
                opacity: opacity,
                resultColor: newColorWithOpacity
            });

            // ⭐ Call updateElementProperty which should update preview
            this.updateElementProperty(element, property, newColorWithOpacity);
        });

        container.appendChild(labelElement);
        container.appendChild(colorInput);
        parent.appendChild(container);
    }

    // =============================================================================
    // ALSO FIX addCheckboxControl
    // =============================================================================

    addCheckboxControl(parent, element, property, label, defaultValue = false) {
        const container = document.createElement('div');
        container.className = 'slider-container';

        const labelElement = document.createElement('label');
        labelElement.textContent = label + ':';
        labelElement.style.display = 'flex';
        labelElement.style.alignItems = 'center';
        labelElement.style.gap = '10px';

        const checkboxInput = document.createElement('input');
        checkboxInput.type = 'checkbox';
        // Use the property value if it exists, otherwise use defaultValue
        checkboxInput.checked = element[property] !== undefined ? element[property] : defaultValue;
        checkboxInput.dataset.property = property;
        checkboxInput.dataset.elementId = element.id || '';

        checkboxInput.addEventListener('change', () => {
            // ⭐ Call updateElementProperty which should update preview
            this.updateElementProperty(element, property, checkboxInput.checked);
        });

        labelElement.appendChild(checkboxInput);
        container.appendChild(labelElement);
        parent.appendChild(container);
    }

    // =============================================================================
    // ALSO FIX addSelectControl
    // =============================================================================

    addSelectControl(parent, element, property, label, options) {
        const container = document.createElement('div');
        container.className = 'slider-container';

        const labelElement = document.createElement('label');
        labelElement.textContent = label + ':';

        const selectInput = document.createElement('select');
        selectInput.dataset.property = property;
        selectInput.dataset.elementId = element.id || '';

        options.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option;
            optionElement.textContent = option;
            if (element[property] === option) {
                optionElement.selected = true;
            }
            selectInput.appendChild(optionElement);
        });

        selectInput.addEventListener('change', () => {
            // ⭐ Call updateElementProperty which should update preview
            this.updateElementProperty(element, property, selectInput.value);
        });

        container.appendChild(labelElement);
        container.appendChild(selectInput);
        parent.appendChild(container);
    }

    // =============================================================================
    // MAKE SURE updateElementProperty EXISTS AND CALLS updatePreviewElement
    // =============================================================================

    updateElementProperty(element, property, value) {
        element[property] = value;

        try {
            const jsonData = JSON.parse(this.elements.jsonInput.value);
            const found = jsonData.elements?.find(el => el.id === element.id);

            if (found) {
                found[property] = value;

                // Debug log for color properties
                if (property === 'color') {
                    console.log('💾 Saving color to JSON:', {
                        elementType: found.type,
                        elementId: found.id,
                        property: property,
                        value: value,
                        valueType: typeof value
                    });
                }

                // Update title if name property changed
                if (property === 'name') {
                    const controlGroup = this.elements.controlsArea.querySelector(`[data-element-id="${element.id}"]`);
                    if (controlGroup) {
                        const title = controlGroup.querySelector('h3');
                        if (title) {
                            const displayName = value || element.id || '';
                            title.textContent = `${element.type || 'Element'} - ${displayName}`;
                        }
                    }
                }

                // ⭐ UPDATE PREVIEW
                if (this.previewModule && this.previewModule.updatePreviewElement) {
                    this.previewModule.updatePreviewElement(found);
                }

                // Update JSON textarea
                this.elements.jsonInput.value = JSON.stringify(jsonData, null, 2);

                // Save to file (debounced)
                this.debounceGenerateVTT();
            }
        } catch (error) {
            console.error("Error updating element property:", error);
        }
    }


    addBoolControl(parent, element, property, label) {
        const container = document.createElement('div');
        container.className = 'bool-container';

        const labelElement = document.createElement('label');
        labelElement.textContent = label + ':';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = element[property] || false;
        checkbox.dataset.property = property;
        checkbox.dataset.elementId = element.id || '';

        checkbox.addEventListener('change', () => {
            element[property] = checkbox.checked;

            try {
                const jsonData = JSON.parse(this.elements.jsonInput.value);
                const found = jsonData.elements?.find(el => el.id === element.id);
                if (found) {
                    found[property] = checkbox.checked;

                    // ⭐ Update preview
                    if (this.previewModule && this.previewModule.updatePreviewElement) {
                        this.previewModule.updatePreviewElement(found);
                    }
                }

                this.elements.jsonInput.value = JSON.stringify(jsonData, null, 2);

                if (this.writeConfig) {
                    this.writeConfig();
                }
            } catch (err) {
                console.error("Bool update error:", err);
            }
        });

        container.appendChild(labelElement);
        container.appendChild(checkbox);
        parent.appendChild(container);
    }

    // Helper function to convert rgba and named colors to hex for color input
    convertToHex(color) {
        const tempDiv = document.createElement('div');
        tempDiv.style.color = color;
        document.body.appendChild(tempDiv);

        const computedColor = getComputedStyle(tempDiv).color;
        document.body.removeChild(tempDiv);

        const rgbMatch = computedColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
        if (rgbMatch) {
            const r = parseInt(rgbMatch[1]);
            const g = parseInt(rgbMatch[2]);
            const b = parseInt(rgbMatch[3]);
            return this.rgbToHex(r, g, b);
        }

        return color;
    }

    rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => {
            const hex = x.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    }

    /**
     * Extract opacity from a color string
     * Supports rgba(r, g, b, a) format
     * @param {string} color - Color string in any format
     * @returns {number} Opacity value (0-1), defaults to 1.0 if not found
     */
    extractOpacity(color) {
        // Check for rgba format
        const rgbaMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
        if (rgbaMatch && rgbaMatch[4] !== undefined) {
            return parseFloat(rgbaMatch[4]);
        }

        // If no alpha found, return 1.0 (fully opaque)
        return 1.0;
    }

    /**
     * Apply opacity to a hex color, converting it to rgba format
     * @param {string} hexColor - Hex color (e.g., "#ff0000")
     * @param {number} opacity - Opacity value (0-1)
     * @returns {string} rgba color string
     */
    applyOpacity(hexColor, opacity) {
        console.log('🔄 applyOpacity called:', { hexColor, opacity, opacityIs1: opacity === 1.0, isUndefined: opacity === undefined, isNaN: isNaN(opacity) });

        // If opacity is 1.0, just return the hex color
        if (opacity === 1.0 || opacity === undefined || isNaN(opacity)) {
            console.log('  → Returning hex (opacity is 1.0 or invalid)');
            return hexColor;
        }

        // Convert hex to RGB
        const hex = hexColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);

        // Return rgba format
        const rgba = `rgba(${r}, ${g}, ${b}, ${opacity})`;
        console.log('  → Returning rgba:', rgba);
        return rgba;
    }

    debounceGenerateVTT() {
        if (this.generateVTTTimeout) {
            clearTimeout(this.generateVTTTimeout);
        }

        this.generateVTTTimeout = setTimeout(() => {
            // Just write config, don't re-parse everything
            this.writeConfig();
        }, 50);
    }

    updateJsonTextarea() {
        try {
            const jsonData = this.getCurrentJsonData();
            this.elements.jsonInput.value = JSON.stringify(jsonData, null, 2);
        } catch (error) {
            console.error("Failed to update JSON textarea:", error);
        }
    }

    getCurrentJsonData() {
        try {
            const jsonData = JSON.parse(this.elements.jsonInput.value);

            if (jsonData.elements && Array.isArray(jsonData.elements)) {
                jsonData.elements.forEach(element => {
                    const controls = document.querySelectorAll(`[data-element-id="${element.id || ''}"][data-property]`);

                    controls.forEach(control => {
                        const property = control.dataset.property;
                        let value = control.value;

                        // Handle different input types
                        if (control.type === 'checkbox') {
                            value = control.checked;
                        } else if (control.type === 'number' || control.type === 'range') {
                            value = parseInt(value, 10);
                        }

                        element[property] = value;
                    });
                });
            }

            return jsonData;
        } catch (error) {
            console.error("Error building JSON data:", error);
            return JSON.parse(this.elements.jsonInput.value);
        }
    }

    removeElement(elementId) {
        try {
            console.log('Removing element:', elementId);
            const jsonData = JSON.parse(this.elements.jsonInput.value);
            const index = jsonData.elements.findIndex(elem => (elem.id || '') === elementId);

            console.log('Found element at index:', index);
            if (index !== -1) {
                jsonData.elements.splice(index, 1);
                this.elements.jsonInput.value = JSON.stringify(jsonData, null, 2);

                // Remove the preview element
                this.previewModule.removePreviewElement(elementId);

                // Re-generate controls (but this shouldn't clear the preview since we're managing elements individually now)
                this.parseJsonAndGenerateControls();

                // Immediately update battlemap display
                this.writeConfigImmediate();
                console.log('Element removed successfully');
            } else {
                console.warn('Element not found:', elementId);
            }
        } catch (error) {
            console.error("Failed to remove element:", error);
            this.elements.jsonError.textContent = `Error: ${error.message}`;
        }
    }

    addNewElement(type) {
        try {
            const jsonData = JSON.parse(this.elements.jsonInput.value);

            if (!jsonData.elements) {
                jsonData.elements = [];
            }

            const { width: mapWidth, height: mapHeight } = this.previewModule.getMapDimensions();
            const id = `${type}_${Date.now()}`;

            // Get defaults from loaded config or use fallback
            const defaults = this.elementDefaults?.[type] || {};

            // Helper function to calculate position based on defaults
            const getPosition = (defaults) => {
                const position = defaults.position || 'center';
                if (position === 'center') {
                    return {
                        x: Math.floor(mapWidth / 2),
                        y: Math.floor(mapHeight / 2)
                    };
                }
                // Could add other position options here (top-left, etc.)
                return { x: 0, y: 0 };
            };

            let newElement;
            switch (type) {
                case 'token':
                    const tokenPos = getPosition(defaults);
                    newElement = {
                        type: 'token',
                        id: id,
                        x: tokenPos.x,
                        y: tokenPos.y,
                        size: defaults.size || 50,
                        color: defaults.color || '#3498db',
                        label: defaults.label !== undefined ? defaults.label : '',
                        labelDisplay: defaults.labelDisplay !== undefined ? defaults.labelDisplay : true,
                        hiddenProperties: defaults.hiddenProperties || ["x", "y"],
                        collapsed: defaults.collapsed !== undefined ? defaults.collapsed : true
                    };
                    break;

                case 'area':
                    const areaPos = getPosition(defaults);
                    newElement = {
                        type: 'area',
                        id: id,
                        x: areaPos.x,
                        y: areaPos.y,
                        width: Math.floor(mapWidth * (defaults.widthFraction || 0.5)),
                        height: Math.floor(mapHeight * (defaults.heightFraction || 0.5)),
                        keepAspectRatio: defaults.keepAspectRatio !== undefined ? defaults.keepAspectRatio : true,
                        color: defaults.color || '#2ecc71',
                        alpha: defaults.alpha !== undefined ? defaults.alpha : 30,
                        rotation: defaults.rotation || 0,
                        label: defaults.label !== undefined ? defaults.label : '',
                        labelDisplay: defaults.labelDisplay !== undefined ? defaults.labelDisplay : true,
                        hiddenProperties: defaults.hiddenProperties || ["x", "y"],
                        collapsed: defaults.collapsed !== undefined ? defaults.collapsed : true
                    };
                    break;

                case 'text':
                    const textPos = getPosition(defaults);
                    newElement = {
                        type: 'text',
                        id: id,
                        x: textPos.x,
                        y: textPos.y,
                        size: defaults.size || 24,
                        color: defaults.color || '#ffffff',
                        text: defaults.text || 'New Text',
                        font: defaults.font || 'Arial',
                        alignment: defaults.alignment || 'center',
                        hiddenProperties: defaults.hiddenProperties || ["x", "y"],
                        collapsed: defaults.collapsed !== undefined ? defaults.collapsed : false
                    };
                    break;

                case 'video':
                    const videoPos = getPosition(defaults);
                    newElement = {
                        type: 'video',
                        id: id,
                        x: videoPos.x,
                        y: videoPos.y,
                        width: defaults.width || 400,
                        height: defaults.height || 300,
                        src: defaults.src || '',
                        keepAspectRatio: defaults.keepAspectRatio !== undefined ? defaults.keepAspectRatio : true,
                        autoplay: defaults.autoplay !== undefined ? defaults.autoplay : true,
                        loop: defaults.loop !== undefined ? defaults.loop : true,
                        muted: defaults.muted !== undefined ? defaults.muted : true,
                        collapsed: defaults.collapsed !== undefined ? defaults.collapsed : false
                    };
                    break;

                case 'gif':
                    const gifPos = getPosition(defaults);
                    newElement = {
                        type: 'gif',
                        id: id,
                        x: gifPos.x,
                        y: gifPos.y,
                        width: defaults.width || 300,
                        height: defaults.height || 200,
                        src: defaults.src || '',
                        keepAspectRatio: defaults.keepAspectRatio !== undefined ? defaults.keepAspectRatio : true,
                        collapsed: defaults.collapsed !== undefined ? defaults.collapsed : false
                    };
                    break;

                case 'line':
                    newElement = {
                        type: 'line',
                        id: id,
                        x: Math.floor(mapWidth * (defaults.xFraction || 0.333)),
                        y: Math.floor(mapHeight * (defaults.yFraction || 0.333)),
                        endX: Math.floor(mapWidth * (defaults.endXFraction || 0.667)),
                        endY: Math.floor(mapHeight * (defaults.endYFraction || 0.667)),
                        thickness: defaults.thickness || 3,
                        color: defaults.color || '#ff0000',
                        arrow: defaults.arrow !== undefined ? defaults.arrow : false,
                        label: defaults.label !== undefined ? defaults.label : '',
                        labelDisplay: defaults.labelDisplay !== undefined ? defaults.labelDisplay : true,
                        hiddenProperties: defaults.hiddenProperties || ["x", "y"],
                        collapsed: defaults.collapsed !== undefined ? defaults.collapsed : false
                    };
                    break;

                case 'cone':
                    const conePos = getPosition(defaults);
                    newElement = {
                        type: 'cone',
                        id: id,
                        x: conePos.x,
                        y: conePos.y,
                        radius: defaults.radius || 150,
                        angle: defaults.angle || 90,
                        direction: defaults.direction || 0,
                        rotation: defaults.rotation || 0,
                        color: defaults.color || '#ffa500',
                        alpha: defaults.alpha !== undefined ? defaults.alpha : 50,
                        borderColor: defaults.borderColor || '#ff7700',
                        label: defaults.label !== undefined ? defaults.label : '',
                        labelDisplay: defaults.labelDisplay !== undefined ? defaults.labelDisplay : true,
                        hiddenProperties: defaults.hiddenProperties || ["x", "y"],
                        collapsed: defaults.collapsed !== undefined ? defaults.collapsed : false
                    };
                    break;

                case 'image':
                    const imagePos = getPosition(defaults);
                    newElement = {
                        type: 'image',
                        id: id,
                        x: imagePos.x,
                        y: imagePos.y,
                        width: defaults.width || 300,
                        height: defaults.height || 200,
                        src: defaults.src || '',
                        keepAspectRatio: defaults.keepAspectRatio !== undefined ? defaults.keepAspectRatio : true,
                        opacity: defaults.opacity !== undefined ? defaults.opacity : 100,
                        rotation: defaults.rotation || 0,
                        collapsed: defaults.collapsed !== undefined ? defaults.collapsed : false,
                        hiddenProperties: defaults.hiddenProperties || ["x", "y"]
                    };
                    break;

                case 'svg':
                    const svgPos = getPosition(defaults);
                    newElement = {
                        type: 'svg',
                        id: id,
                        x: svgPos.x,
                        y: svgPos.y,
                        width: defaults.width || 200,
                        height: defaults.height || 200,
                        src: defaults.src || '',
                        opacity: defaults.opacity !== undefined ? defaults.opacity : 100,
                        rotation: defaults.rotation || 0,
                        color: defaults.color || '#000000',
                        collapsed: defaults.collapsed !== undefined ? defaults.collapsed : false,
                        hiddenProperties: defaults.hiddenProperties || ["x", "y"]
                    };
                    break;

                case 'box':
                    const boxPos = getPosition(defaults);
                    newElement = {
                        type: 'box',
                        id: id,
                        x: boxPos.x,
                        y: boxPos.y,
                        width: defaults.width || 100,
                        height: defaults.height || 100,
                        grayscale: defaults.grayscale || 0,
                        transparency: defaults.transparency || 0,
                        hiddenProperties: defaults.hiddenProperties || ["x", "y"],
                        collapsed: defaults.collapsed !== undefined ? defaults.collapsed : false
                    };
                    break;

                case 'circle':
                    const circlePos = getPosition(defaults);
                    newElement = {
                        type: 'circle',
                        id: id,
                        x: circlePos.x,
                        y: circlePos.y,
                        radius: defaults.radius || 50,
                        grayscale: defaults.grayscale || 0,
                        transparency: defaults.transparency || 0,
                        hiddenProperties: defaults.hiddenProperties || ["x", "y"],
                        collapsed: defaults.collapsed !== undefined ? defaults.collapsed : false
                    };
                    break;

                case 'bar':
                    const barPos = getPosition(defaults);
                    newElement = {
                        type: 'bar',
                        id: id,
                        x: barPos.x,
                        y: barPos.y,
                        width: defaults.width || 200,
                        height: defaults.height || 20,
                        currentValue: defaults.currentValue || 50,
                        maxValue: defaults.maxValue || 100,
                        barColor: defaults.barColor || '#000000',
                        grayscale: defaults.grayscale || 0,
                        transparency: defaults.transparency || 0,
                        hiddenProperties: defaults.hiddenProperties || ["x", "y"],
                        collapsed: defaults.collapsed !== undefined ? defaults.collapsed : false
                    };
                    break;
            }

            jsonData.elements.push(newElement);
            this.elements.jsonInput.value = JSON.stringify(jsonData, null, 2);

            // Instead of calling parseJsonAndGenerateControls (which might clear preview),
            // just add the new element directly
            this.generateControlsForElement(newElement, jsonData.elements.length - 1);
            this.previewModule.renderPreviewElement(newElement);

            // Write config immediately to update battlemap display
            this.writeConfigImmediate();

            // Show the new element in the Last Moved section
            document.dispatchEvent(new CustomEvent('vttElementMoved', {
                detail: { element: JSON.parse(JSON.stringify(newElement)) }
            }));

        } catch (error) {
            console.error("Failed to add new element:", error);
            this.elements.jsonError.textContent = `Error: ${error.message}`;
        }
    }

    createAddElementButtons() {
        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'add-elements-container';
        buttonsContainer.style.marginBottom = '15px';

        const title = document.createElement('h3');
        title.textContent = 'Add New Elements';
        buttonsContainer.appendChild(title);

        const buttonGroup = document.createElement('div');
        buttonGroup.style.display = 'flex';
        buttonGroup.style.gap = '10px';
        buttonGroup.style.flexWrap = 'wrap';

        const types = [
            { type: 'token', label: 'Add Token' },
            { type: 'area', label: 'Add Area' },
            { type: 'text', label: 'Add Text' },
            { type: 'video', label: 'Add Video' },
            { type: 'gif', label: 'Add GIF' },
            { type: 'image', label: 'Add Image' },
            { type: 'svg', label: 'Add SVG' },
            { type: 'line', label: 'Add Line' },
            { type: 'cone', label: 'Add Cone' }
        ];

        types.forEach(item => {
            const button = document.createElement('button');
            button.textContent = item.label;
            button.className = 'primary-btn';
            button.addEventListener('click', () => this.addNewElement(item.type));
            buttonGroup.appendChild(button);
        });

        const collapseAllBtn = document.createElement('button');
        collapseAllBtn.textContent = 'Collapse All';
        collapseAllBtn.className = 'secondary-btn';
        collapseAllBtn.style.marginLeft = 'auto';

        let allExpanded = true;
        collapseAllBtn.addEventListener('click', () => {
            allExpanded = !allExpanded;
            const controlGroups = document.querySelectorAll('.control-group');

            controlGroups.forEach(group => {
                const toggleBtn = group.querySelector('.toggle-btn');
                const contentDiv = group.querySelector('.control-content');

                if (allExpanded) {
                    contentDiv.style.maxHeight = contentDiv.scrollHeight + 'px';
                    contentDiv.style.overflow = 'visible';
                    toggleBtn.innerHTML = '▼';
                } else {
                    contentDiv.style.maxHeight = '0';
                    contentDiv.style.overflow = 'hidden';
                    toggleBtn.innerHTML = '▶';
                }
            });

            collapseAllBtn.textContent = allExpanded ? 'Collapse All' : 'Expand All';
        });

        buttonGroup.appendChild(collapseAllBtn);
        buttonsContainer.appendChild(buttonGroup);
        this.elements.controlsArea.prepend(buttonsContainer);
    }

    writeConfigImmediate() {
        var pathJson = "";
        if (this.moduleName == "VTT") {
            pathJson = "./storage/scrying_glasses/battlemap.json";
        } else if (this.moduleName == "Display") {
            pathJson = "./storage/scrying_glasses/display.json";
        } else if (this.moduleName == "Sageslate") {
            pathJson = `${this.config.basePath}/${this.config.defaultFilename}`;
        } else {
            // Fallback for unknown module names
            pathJson = "./storage/scrying_glasses/display.json";
        }
        console.log("Update GUI")
        try {
            const jsonData = JSON.parse(this.elements.jsonInput.value);

            fetch('/json/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    path: pathJson,
                    content: JSON.stringify(jsonData, null, 2)
                })
            })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Failed to save file: ${response.status}`);
                    }
                    return response.text();
                })
                .then(() => {
                    console.log(`Configuration saved successfully ${pathJson}`);

                    // Update cached content so auto-reload doesn't detect our own write as an external change
                    this.lastJsonContent = JSON.stringify(jsonData);

                    this.loadFileBrowser();
                })
                .catch(error => {
                    console.error("Error saving file:", error);
                    alert(`Error saving file: ${error.message}`);
                });
        } catch (error) {
            console.error("Invalid JSON:", error);
            alert(`Cannot save invalid JSON: ${error.message}`);
        }
    }

    writeConfig() {
        this.writeConfigDebounced();
    }

    loadFileBrowser() {
        this.elements.fileBrowser.innerHTML = '<p>Loading files...</p>';

        fetch(`/api/images/list?path=${encodeURIComponent(this.currentPath)}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load file browser: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                this.elements.fileBrowser.innerHTML = '';

                data.items.forEach(item => {
                    const itemElement = document.createElement('div');
                    itemElement.className = 'folder-item';

                    if (item.is_dir) {
                        itemElement.innerHTML = `<i>📁</i> <span>${item.name}</span>`;
                        itemElement.addEventListener('click', () => {
                            this.currentPath = item.path;
                            this.loadFileBrowser();
                        });
                    } else if (item.name.endsWith('.json')) {
                        itemElement.innerHTML = `<i>🗎</i> <span>${item.name}</span>`;
                        itemElement.addEventListener('click', () => {
                            this.loadConfigFile(item.path, item.name);
                        });
                    }

                    this.elements.fileBrowser.appendChild(itemElement);
                });

                if (data.items.length === 0) {
                    this.elements.fileBrowser.innerHTML = '<p>No JSON files found</p>';
                }
            })
            .catch(error => {
                console.error("Error loading file browser:", error);
                this.elements.fileBrowser.innerHTML = `<p class="error">Error: ${error.message}</p>`;
            });
    }

    saveConfig() {
        const filename = this.elements.saveFilename.value.trim();
        if (!filename) {
            alert("Please enter a filename");
            return;
        }

        const filePath = this.currentPath + "/" + (filename.endsWith('.json') ? filename : filename + '.json');

        console.log(filePath);
        try {
            const jsonData = JSON.parse(this.elements.jsonInput.value);

            fetch('/json/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    path: filePath,
                    content: JSON.stringify(jsonData, null, 2)
                })
            })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Failed to save file: ${response.status}`);
                    }
                    return response.text();
                })
                .then(() => {
                    console.log(`Configuration saved successfully to ${filename}`);
                    this.loadFileBrowser();
                })
                .catch(error => {
                    console.error("Error saving file:", error);
                    alert(`Error saving file: ${error.message}`);
                });
        } catch (error) {
            console.error("Invalid JSON:", error);
            alert(`Cannot save invalid JSON: ${error.message}`);
        }
    }

    exportConfig() {
        try {
            const jsonData = JSON.parse(this.elements.jsonInput.value);

            const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;

            const filename = this.elements.saveFilename.value.trim() || 'vtt_config.json';
            a.download = filename.endsWith('.json') ? filename : filename + '.json';

            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 0);
        } catch (error) {
            console.error("Failed to export config:", error);
            alert(`Cannot export invalid JSON: ${error.message}`);
        }
    }

    // Add this to your vtt-controls-module.js in the parseJsonAndGenerateControls method

    generateZoomControls(jsonData) {
        // Ensure zoom config exists
        const zoomConfig = jsonData.zoom || {
            level: 1.0,
            panX: 0,
            panY: 0,
            minZoom: 0.1,
            maxZoom: 10.0,
            zoomSpeed: 0.1,
            panSpeed: 20,
            smoothZoom: true,
            zoomToMouse: false,
            showInfo: false
        };
        if (!jsonData.zoom) {
            jsonData.zoom = zoomConfig;
            this.elements.jsonInput.value = JSON.stringify(jsonData, null, 2);
        }

        // Create zoom control group (same structure as element controls)
        const controlGroup = document.createElement('div');
        controlGroup.className = 'control-group zoom-group';
        controlGroup.dataset.elementId = 'zoom-controls';

        // Header section
        const headerSection = document.createElement('div');
        headerSection.className = 'control-header';
        headerSection.style.display = 'flex';
        headerSection.style.justifyContent = 'space-between';
        headerSection.style.alignItems = 'center';
        headerSection.style.cursor = 'pointer';
        headerSection.style.marginBottom = '10px';

        // Title
        const title = document.createElement('h3');
        title.textContent = '🔍 Zoom & View Controls';
        title.style.margin = '0';

        // Toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'toggle-btn';
        toggleBtn.style.padding = '3px 8px';
        toggleBtn.style.fontSize = '12px';
        toggleBtn.style.marginLeft = '10px';
        toggleBtn.title = 'Collapse/Expand';

        // Collapsible content
        const contentDiv = document.createElement('div');
        contentDiv.className = 'control-content';
        contentDiv.style.transition = 'max-height 0.3s ease';

        // Assemble header
        headerSection.appendChild(title);
        headerSection.appendChild(toggleBtn);
        controlGroup.appendChild(headerSection);
        controlGroup.appendChild(contentDiv);

        // Set collapsed state
        if (zoomConfig.collapsed === undefined) zoomConfig.collapsed = false;
        let isExpanded = !zoomConfig.collapsed;

        toggleBtn.innerHTML = isExpanded ? '▼' : '▶';
        contentDiv.style.maxHeight = isExpanded ? 'none' : '0';
        contentDiv.style.overflow = isExpanded ? 'visible' : 'hidden';

        const toggleCollapse = () => {
            isExpanded = !isExpanded;
            zoomConfig.collapsed = !isExpanded;

            toggleBtn.innerHTML = isExpanded ? '▼' : '▶';
            contentDiv.style.maxHeight = isExpanded ? contentDiv.scrollHeight + 'px' : '0';
            contentDiv.style.overflow = isExpanded ? 'visible' : 'hidden';

            // Save collapsed state in JSON
            this.elements.jsonInput.value = JSON.stringify(jsonData, null, 2);
        };
        headerSection.addEventListener('click', toggleCollapse);

        //
        // 🧭 Add controls using same helpers as general elements
        //
        this.addSliderControl(contentDiv, zoomConfig, 'level', 'Zoom Level', zoomConfig.minZoom, zoomConfig.maxZoom);
        this.addSliderControl(contentDiv, zoomConfig, 'panX', 'Pan X Offset (%)', -100, 100);
        this.addSliderControl(contentDiv, zoomConfig, 'panY', 'Pan Y Offset (%)', -100, 100);
        //
        // ⚙️ Action Buttons
        //
        const btnGroup = document.createElement('div');
        btnGroup.style.marginTop = '15px';
        btnGroup.style.display = 'flex';
        btnGroup.style.flexWrap = 'wrap';
        btnGroup.style.gap = '10px';

        const makeButton = (label, className, onClick) => {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.className = className;
            btn.style.flex = '1';
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // avoid collapsing
                onClick();
            });
            return btn;
        };

        const resetBtn = makeButton('🔄 Reset View', 'primary-btn', () => {
            zoomConfig.level = 1.0;
            zoomConfig.panX = 0;
            zoomConfig.panY = 0;
            this.updateZoomConfig(zoomConfig);
            this.generateZoomControls(jsonData); // refresh view
            this.writeConfigImmediate(); // Immediately update battlemap
        });

        const zoomInBtn = makeButton('➕ Zoom In', 'secondary-btn', () => {
            zoomConfig.level = Math.min(zoomConfig.level * 1.2, zoomConfig.maxZoom);
            this.updateZoomConfig(zoomConfig);
            this.updateZoomControlValue('level', zoomConfig.level);
            this.writeConfigImmediate(); // Immediately update battlemap
        });

        const zoomOutBtn = makeButton('➖ Zoom Out', 'secondary-btn', () => {
            zoomConfig.level = Math.max(zoomConfig.level / 1.2, zoomConfig.minZoom);
            this.updateZoomConfig(zoomConfig);
            this.updateZoomControlValue('level', zoomConfig.level);
            this.writeConfigImmediate(); // Immediately update battlemap
        });

        btnGroup.appendChild(resetBtn);
        btnGroup.appendChild(zoomInBtn);
        btnGroup.appendChild(zoomOutBtn);
        contentDiv.appendChild(btnGroup);

        // Finally, insert at top of controls list
        this.elements.controlsArea.insertBefore(controlGroup, this.elements.controlsArea.firstChild);
    }


    // Helper method to add zoom sliders
    addZoomSlider(parent, zoomConfig, property, label, min, max, step, unit) {
        const container = document.createElement('div');
        container.className = 'slider-container zoom-slider';
        container.style.marginBottom = '10px';

        const labelElement = document.createElement('label');
        labelElement.textContent = label + ':';
        labelElement.style.minWidth = '120px';
        labelElement.style.fontSize = '13px';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = zoomConfig[property] || 0;
        slider.dataset.property = property;
        slider.dataset.zoomControl = 'true';
        slider.className = 'zoom-slider-input';
        slider.style.flex = '1';

        const valueDisplay = document.createElement('input');
        valueDisplay.type = 'number';
        valueDisplay.min = min;
        valueDisplay.max = max;
        valueDisplay.step = step;
        valueDisplay.value = zoomConfig[property] || 0;
        valueDisplay.dataset.property = property;
        valueDisplay.dataset.zoomControl = 'true';
        valueDisplay.style.width = '80px';
        valueDisplay.style.marginLeft = '10px';

        const unitLabel = document.createElement('span');
        unitLabel.textContent = unit;
        unitLabel.style.marginLeft = '5px';
        unitLabel.style.fontSize = '12px';
        unitLabel.style.color = '#888';

        // Special formatting for zoom level (show as percentage)
        if (property === 'level') {
            valueDisplay.value = Math.round(zoomConfig[property] * 100);
            slider.addEventListener('input', () => {
                const value = parseFloat(slider.value);
                valueDisplay.value = Math.round(value * 100);
                zoomConfig[property] = value;
                this.updateZoomConfig(zoomConfig);
            });

            valueDisplay.addEventListener('input', () => {
                const value = parseFloat(valueDisplay.value) / 100;
                slider.value = value;
                zoomConfig[property] = value;
                this.updateZoomConfig(zoomConfig);
            });
        } else {
            // Regular numeric properties
            slider.addEventListener('input', () => {
                const value = parseFloat(slider.value);
                valueDisplay.value = value;
                zoomConfig[property] = value;
                this.updateZoomConfig(zoomConfig);
            });

            valueDisplay.addEventListener('input', () => {
                const value = parseFloat(valueDisplay.value);
                slider.value = value;
                zoomConfig[property] = value;
                this.updateZoomConfig(zoomConfig);
            });
        }

        container.appendChild(labelElement);
        container.appendChild(slider);
        container.appendChild(valueDisplay);
        container.appendChild(unitLabel);
        parent.appendChild(container);
    }

    updateZoomConfig(zoomConfig) {
        try {
            const jsonData = JSON.parse(this.elements.jsonInput.value);
            jsonData.zoom = zoomConfig;
            this.elements.jsonInput.value = JSON.stringify(jsonData, null, 2);

            // ✅ ADD THIS LINE - Update the visible area box immediately
            this.previewModule.updateZoomFromJson();

            // Trigger config update
            this.writeConfig();

            // Show zoom level in UI
            this.showZoomIndicator(zoomConfig.level);
        } catch (error) {
            console.error("Error updating zoom config:", error);
        }
    }

    // Helper method to update a specific zoom control value
    updateZoomControlValue(property, value) {
        const control = document.querySelector(`[data-zoom-control="true"][data-property="${property}"]`);
        if (control) {
            if (property === 'level' && control.type === 'number') {
                control.value = Math.round(value * 100);
            } else {
                control.value = value;
            }

            // Update slider if it exists
            const slider = document.querySelector(`input[type="range"][data-property="${property}"]`);
            if (slider) {
                slider.value = value;
            }
        }
    }

}