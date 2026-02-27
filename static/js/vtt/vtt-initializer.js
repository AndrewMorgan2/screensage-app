/**
 * VTT Initializer - Unified initialization system for VTT and Display tabs
 *
 * This module provides a single, configurable initialization system that can be used
 * for both the VTT (battlemap) and Display tabs, eliminating code duplication.
 *
 * @module VTTInitializer
 */

/**
 * Configuration object for VTT instance
 * @typedef {Object} VTTConfig
 * @property {string} basePath - Base path for config files
 * @property {number} defaultMapWidth - Default map width in pixels
 * @property {number} defaultMapHeight - Default map height in pixels
 * @property {number} maxPreviewWidth - Maximum preview area width
 * @property {number} maxPreviewHeight - Maximum preview area height
 * @property {string} defaultConfig - Path to default config file
 * @property {string} defaultFilename - Default filename for saving
 * @property {string} moduleName - Name of the module (e.g., "VTT", "Display")
 * @property {string} elementIdSuffix - Suffix for element IDs (e.g., "", "2")
 */

/**
 * Element IDs configuration
 * @typedef {Object} ElementIds
 * @property {string} jsonInput - ID of JSON input textarea
 * @property {string} parseButton - ID of parse button
 * @property {string} jsonError - ID of error display element
 * @property {string} controlsArea - ID of controls container
 * @property {string} previewArea - ID of preview container
 * @property {string} imagePath - ID of image path input
 * @property {string} usePathBtn - ID of use path button
 * @property {string} hideEffectsBtn - ID of hide effects button
 * @property {string} showEffectsBtn - ID of show effects button
 * @property {string} imageDimensions - ID of dimensions display
 * @property {string} fileBrowser - ID of file browser container
 * @property {string} saveFilename - ID of save filename input
 * @property {string} saveFileBtn - ID of save button
 * @property {string} previewScaleSlider - ID of preview scale slider
 * @property {string} previewScaleDisplay - ID of scale display
 * @property {string} resetScaleBtn - ID of reset scale button
 * @property {string} collapseAllBtn - ID of collapse all button
 * @property {Object} addButtons - IDs of add element buttons
 */

/**
 * Initialize a VTT instance with the given configuration
 *
 * @param {VTTConfig} config - Configuration object
 * @param {ElementIds} elementIds - DOM element IDs to use
 * @returns {Object} Initialized modules {previewModule, controlsModule, draggableModule}
 */
function initializeVTT(config, elementIds) {
    // Gather DOM element references
    const elements = {
        jsonInput: document.getElementById(elementIds.jsonInput),
        parseButton: document.getElementById(elementIds.parseButton),
        jsonError: document.getElementById(elementIds.jsonError),
        controlsArea: document.getElementById(elementIds.controlsArea),
        previewArea: document.getElementById(elementIds.previewArea),
        imagePath: document.getElementById(elementIds.imagePath),
        usePathBtn: document.getElementById(elementIds.usePathBtn),
        hideEffectsBtn: document.getElementById(elementIds.hideEffectsBtn),
        showEffectsBtn: document.getElementById(elementIds.showEffectsBtn),
        imageDimensions: document.getElementById(elementIds.imageDimensions),
        fileBrowser: document.getElementById(elementIds.fileBrowser),
        saveFilename: document.getElementById(elementIds.saveFilename),
        saveFileBtn: document.getElementById(elementIds.saveFileBtn)
    };

    // Create module instances
    const previewModule = new PreviewModule(elements, config);
    const controlsModule = new ControlsModule(elements, config, previewModule, config.moduleName);
    const draggableModule = new DraggableModule(elements, previewModule);

    // Store in window with unique names
    const globalName = config.moduleName.toLowerCase();
    window[`${globalName}PreviewModule`] = previewModule;
    window[`${globalName}ControlsModule`] = controlsModule;
    window[`${globalName}DraggableModule`] = draggableModule;

    // Link modules bidirectionally (CRITICAL for drag operations)
    controlsModule.draggableModuleRef = draggableModule;
    draggableModule.controlsModuleRef = controlsModule;

    // Setup refresh listener for external updates
    controlsModule.setupRefreshListener();

    // For backward compatibility
    if (globalName === 'vtt') {
        window.previewModule = previewModule;
        window.controlsModule = controlsModule;
        window.draggableModule = draggableModule;
    } else if (globalName === 'display') {
        window.previewModule2 = previewModule;
        window.controlsModule2 = controlsModule;
        window.draggableModule2 = draggableModule;
    }

    // Set up preview scale controls
    setupPreviewScaleControls(elementIds, previewModule);

    // Set up event listeners
    setupEventListeners(elements, controlsModule, previewModule);

    // Set up add element button handlers
    setupAddElementButtons(elementIds, controlsModule);

    // Set up collapse/expand functionality
    setupCollapseAllButton(elementIds, elements);

    // Set up fog buttons
    setupFogButtons(elementIds, controlsModule);

    // Initialize components
    controlsModule.loadConfigFile(config.defaultConfig, config.defaultFilename);
    controlsModule.loadFileBrowser();

    // Only initialize map for VTT and Display tabs (not Sageslate)
    // Sageslate uses image config instead of screen config
    if (config.moduleName !== 'Sageslate') {
        previewModule.initializeMap();
    }

    draggableModule.makeDraggable();

    // Initial parse if JSON is already present (skipSave: no need to write back on init)
    if (elements.jsonInput.value.trim()) {
        controlsModule.parseJsonAndGenerateControls(true);
    }

    return { previewModule, controlsModule, draggableModule };
}

/**
 * Set up preview scale slider controls
 * @private
 */
function setupPreviewScaleControls(elementIds, previewModule) {
    const slider = document.getElementById(elementIds.previewScaleSlider);
    const display = document.getElementById(elementIds.previewScaleDisplay);

    // Get minimize button and content area
    const minimizeBtn = document.getElementById(elementIds.minimizeScaleBtn || 'minimizeScaleBtn');
    const content = document.getElementById(elementIds.previewScaleContent || 'previewScaleContent');
    const panel = document.getElementById(elementIds.previewScalePanel || 'previewScalePanel');

    if (slider && display) {
        // Restore saved scale from localStorage
        const savedScale = previewModule.getPreviewScale();
        slider.value = Math.round(savedScale * 100);
        display.textContent = `${Math.round(savedScale * 100)}%`;

        // Apply the saved scale to update the preview
        if (savedScale !== 1.0) {
            previewModule.setPreviewScale(savedScale);
        }

        slider.addEventListener('input', () => {
            const scale = parseFloat(slider.value) / 100;
            previewModule.setPreviewScale(scale);
            display.textContent = `${slider.value}%`;
        });

        // Double-click slider to reset to 100%
        slider.addEventListener('dblclick', () => {
            slider.value = 100;
            previewModule.setPreviewScale(1.0);
            display.textContent = '100%';
        });
    }

    // Set up minimize button functionality
    if (minimizeBtn && content && panel) {
        let isMinimized = false;

        minimizeBtn.addEventListener('click', () => {
            isMinimized = !isMinimized;

            if (isMinimized) {
                content.style.display = 'none';
                minimizeBtn.textContent = '+';
                minimizeBtn.title = 'Expand';
                panel.style.padding = '5px';
            } else {
                content.style.display = 'flex';
                minimizeBtn.textContent = '−';
                minimizeBtn.title = 'Minimize';
                panel.style.padding = '10px';
            }
        });
    }
}

/**
 * Set up main event listeners
 * @private
 */
function setupEventListeners(elements, controlsModule, previewModule) {
    // Parse button
    elements.parseButton.addEventListener('click', () => {
        controlsModule.parseJsonAndGenerateControls();
        setTimeout(() => controlsModule.createAddElementButtons(), 100);
    });

    // Save button
    elements.saveFileBtn.addEventListener('click', () => {
        controlsModule.saveConfig();
    });

    // Window resize handler
    window.addEventListener('resize', debounce(() => {
        if (elements.previewArea.style.backgroundImage) {
            previewModule.updatePreviewAreaSize();
            controlsModule.parseJsonAndGenerateControls();
        }
    }, 250));

    // JSON input change handler
    elements.jsonInput.addEventListener('change', function() {
        try {
            JSON.parse(this.value);
            controlsModule.parseJsonAndGenerateControls();
        } catch (error) {
            console.error("Invalid JSON:", error);
            elements.jsonError.textContent = `Error: ${error.message}`;
        }
    });
}

/**
 * Set up add element button handlers
 * @private
 */
function setupAddElementButtons(elementIds, controlsModule) {
    // Dynamically register buttons based on what's defined in elementIds.addButtons
    if (!elementIds.addButtons) {
        console.warn('No addButtons defined in elementIds');
        return;
    }

    Object.entries(elementIds.addButtons).forEach(([type, btnId]) => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('click', () => {
                console.log(`Add ${type} button clicked`);
                controlsModule.addNewElement(type);
            });
            console.log(`✓ Registered ${type} button: ${btnId}`);
        } else {
            console.warn(`✗ Button not found: ${btnId} for type: ${type}`);
        }
    });
}

/**
 * Set up fog buttons (Add Fog and Remove Fog)
 * @private
 */
function setupFogButtons(elementIds, controlsModule) {
    const addFogBtn = document.getElementById(elementIds.addFogBtn);
    const removeFogBtn = document.getElementById(elementIds.removeFogBtn);

    if (addFogBtn) {
        addFogBtn.addEventListener('click', async () => {
            console.log('Add Fog button clicked');

            try {
                const jsonValue = controlsModule.elements.jsonInput.value.trim();
                if (!jsonValue) {
                    console.warn('No JSON configuration loaded');
                    return;
                }

                const jsonData = JSON.parse(jsonValue);

                // Load fog template from JSON file
                console.log('Loading fog template from file...');
                const response = await fetch('/json/read?path=./storage/fog_template.json');

                if (!response.ok) {
                    throw new Error('Failed to load fog template');
                }

                const fogTemplate = await response.json();

                // Use template fog configuration
                if (fogTemplate.fog) {
                    jsonData.fog = fogTemplate.fog;
                    console.log('✓ Fog template loaded:', fogTemplate.fog);
                } else {
                    // Fallback to default if template doesn't have fog
                    console.warn('Fog template missing fog object, using fallback');
                    jsonData.fog = {
                        enabled: true,
                        opacity: 255,
                        color: "#000000",
                        clear_polygons: []
                    };
                }

                // Update JSON
                controlsModule.elements.jsonInput.value = JSON.stringify(jsonData, null, 2);

                // Trigger parse to update UI
                controlsModule.parseJsonAndGenerateControls();

                // Immediately update battlemap display
                controlsModule.writeConfigImmediate();

                console.log('✓ Fog added to configuration');
            } catch (error) {
                console.error('Error adding fog:', error);

                // Fallback to hardcoded default on error
                try {
                    const jsonValue = controlsModule.elements.jsonInput.value.trim();
                    const jsonData = JSON.parse(jsonValue);
                    jsonData.fog = {
                        enabled: true,
                        opacity: 255,
                        color: "#000000",
                        clear_polygons: []
                    };
                    controlsModule.elements.jsonInput.value = JSON.stringify(jsonData, null, 2);
                    controlsModule.parseJsonAndGenerateControls();
                    controlsModule.writeConfigImmediate();
                    console.log('✓ Fog added with fallback configuration');
                } catch (fallbackError) {
                    console.error('Fallback also failed:', fallbackError);
                }
            }
        });
        console.log('✓ Registered Add Fog button');
    } else {
        console.warn('✗ Add Fog button not found');
    }

    if (removeFogBtn) {
        removeFogBtn.addEventListener('click', () => {
            console.log('Remove Fog button clicked');

            try {
                const jsonValue = controlsModule.elements.jsonInput.value.trim();
                if (!jsonValue) {
                    console.warn('No JSON configuration loaded');
                    return;
                }

                const jsonData = JSON.parse(jsonValue);

                // Remove or disable fog
                if (jsonData.fog) {
                    delete jsonData.fog;
                }

                // Update JSON
                controlsModule.elements.jsonInput.value = JSON.stringify(jsonData, null, 2);

                // Trigger parse to update UI
                controlsModule.parseJsonAndGenerateControls();

                // Immediately update battlemap display
                controlsModule.writeConfigImmediate();

                console.log('✓ Fog removed from configuration');
            } catch (error) {
                console.error('Error removing fog:', error);
            }
        });
        console.log('✓ Registered Remove Fog button');
    } else {
        console.warn('✗ Remove Fog button not found');
    }

    // Reset Fog button
    const resetFogBtn = document.getElementById(elementIds.resetFogBtn);
    if (resetFogBtn) {
        resetFogBtn.addEventListener('click', () => {
            console.log('Reset Fog button clicked');

            try {
                const jsonValue = controlsModule.elements.jsonInput.value.trim();
                if (!jsonValue) {
                    console.warn('No JSON configuration loaded');
                    return;
                }

                const jsonData = JSON.parse(jsonValue);

                // Set clearReset flag to true (display engine will reset it after clearing)
                if (jsonData.fog) {
                    jsonData.fog.clearReset = true;
                } else {
                    console.warn('No fog configuration found');
                    return;
                }

                // Update JSON
                controlsModule.elements.jsonInput.value = JSON.stringify(jsonData, null, 2);

                // Trigger parse to update UI
                controlsModule.parseJsonAndGenerateControls();

                // Immediately update battlemap display
                controlsModule.writeConfigImmediate();

                console.log('✓ Fog reset triggered');
            } catch (error) {
                console.error('Error resetting fog:', error);
            }
        });
        console.log('✓ Registered Reset Fog button');
    } else {
        console.warn('✗ Reset Fog button not found');
    }
}

/**
 * Set up collapse/expand all button
 * @private
 */
function setupCollapseAllButton(elementIds, elements) {
    const collapseBtn = document.getElementById(elementIds.collapseAllBtn);
    if (!collapseBtn) return;

    collapseBtn.addEventListener('click', function() {
        const controlGroups = document.querySelectorAll(`#${elementIds.controlsArea} .control-group`);
        const currentText = this.textContent;
        const shouldExpand = currentText === 'Expand All';

        controlGroups.forEach(group => {
            const toggleBtn = group.querySelector('.toggle-btn');
            const contentDiv = group.querySelector('.control-content');

            if (shouldExpand) {
                contentDiv.style.maxHeight = contentDiv.scrollHeight + 'px';
                contentDiv.style.overflow = 'visible';
                if (toggleBtn) toggleBtn.innerHTML = '▼';

                const elementId = group.dataset.elementId;
                if (elementId) updateElementCollapsedState(elements, elementId, false);
            } else {
                contentDiv.style.maxHeight = '0';
                contentDiv.style.overflow = 'hidden';
                if (toggleBtn) toggleBtn.innerHTML = '▶';

                const elementId = group.dataset.elementId;
                if (elementId) updateElementCollapsedState(elements, elementId, true);
            }
        });

        this.textContent = shouldExpand ? 'Collapse All' : 'Expand All';
    });
}

/**
 * Update collapsed state in JSON
 * @private
 */
function updateElementCollapsedState(elements, elementId, collapsed) {
    try {
        const jsonData = JSON.parse(elements.jsonInput.value);
        const elementIndex = jsonData.elements.findIndex(el => el.id === elementId);

        if (elementIndex !== -1) {
            jsonData.elements[elementIndex].collapsed = collapsed;
            elements.jsonInput.value = JSON.stringify(jsonData, null, 2);
        }
    } catch (error) {
        console.error("Error updating collapse state:", error);
    }
}

/**
 * Debounce utility function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(context, args);
        }, wait);
    };
}

// Make initializer globally available
window.initializeVTT = initializeVTT;
