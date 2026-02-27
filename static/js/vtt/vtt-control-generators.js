/**
 * VTT Control Generators
 *
 * This module provides functions for generating UI controls for different
 * property types (sliders, text inputs, color pickers, etc.)
 *
 * @module VTTControlGenerators
 */

/**
 * Control generator class containing static methods for creating UI controls
 */
class ControlGenerators {
    /**
     * Add a slider control (range input with numeric display)
     *
     * @param {HTMLElement} parent - Parent container element
     * @param {Object} element - Element data object
     * @param {string} property - Property name
     * @param {string} label - Display label
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @param {Function} updateCallback - Callback for value updates
     */
    static addSlider(parent, element, property, label, min, max, updateCallback) {
        const container = document.createElement('div');
        container.className = 'slider-container';

        const labelElement = document.createElement('label');
        labelElement.textContent = label + ':';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = min;
        slider.max = max;
        slider.step = 'any';
        slider.value = element[property] ?? 0;
        slider.dataset.property = property;

        const valueDisplay = document.createElement('input');
        valueDisplay.type = 'number';
        valueDisplay.min = min;
        valueDisplay.max = max;
        valueDisplay.step = 'any';
        valueDisplay.value = element[property] ?? 0;
        valueDisplay.dataset.property = property;

        const updateValue = (value) => {
            const numValue = Number(value);
            slider.value = numValue;
            valueDisplay.value = numValue;
            if (updateCallback) {
                updateCallback(property, numValue);
            }
        };

        slider.addEventListener('input', () => updateValue(slider.value));
        slider.addEventListener('change', () => updateValue(slider.value));
        valueDisplay.addEventListener('input', () => updateValue(valueDisplay.value));
        valueDisplay.addEventListener('change', () => updateValue(valueDisplay.value));

        container.appendChild(labelElement);
        container.appendChild(slider);
        container.appendChild(valueDisplay);
        parent.appendChild(container);
    }

    /**
     * Add a text input control
     *
     * @param {HTMLElement} parent - Parent container element
     * @param {Object} element - Element data object
     * @param {string} property - Property name
     * @param {string} label - Display label
     * @param {Function} updateCallback - Callback for value updates
     */
    static addTextInput(parent, element, property, label, updateCallback) {
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
            if (updateCallback) {
                updateCallback(property, textInput.value);
            }
        });

        container.appendChild(labelElement);
        container.appendChild(textInput);
        parent.appendChild(container);
    }

    /**
     * Add a color picker control
     *
     * @param {HTMLElement} parent - Parent container element
     * @param {Object} element - Element data object
     * @param {string} property - Property name
     * @param {string} label - Display label
     * @param {Function} updateCallback - Callback for value updates
     * @param {number} defaultOpacity - Default opacity for this element type (optional)
     */
    static addColorPicker(parent, element, property, label, updateCallback, defaultOpacity = null) {
        const container = document.createElement('div');
        container.className = 'slider-container';

        const labelElement = document.createElement('label');
        labelElement.textContent = label + ':';

        const colorInput = document.createElement('input');
        colorInput.type = 'color';

        // Extract original color and opacity
        const originalColor = element[property] || '#ffffff';
        let originalOpacity = ControlGenerators.extractOpacity(originalColor);

        // For areas, always use default opacity if specified
        if (defaultOpacity !== null && element.type === 'area') {
            originalOpacity = defaultOpacity;
        }

        colorInput.value = ControlGenerators.convertToHex(originalColor);
        colorInput.dataset.property = property;
        colorInput.dataset.elementId = element.id || '';
        colorInput.dataset.originalOpacity = originalOpacity; // Store original opacity
        colorInput.dataset.elementType = element.type || '';

        colorInput.addEventListener('input', () => {
            if (updateCallback) {
                // Combine new color with original opacity
                const newColorWithOpacity = ControlGenerators.applyOpacity(
                    colorInput.value,
                    parseFloat(colorInput.dataset.originalOpacity)
                );
                updateCallback(property, newColorWithOpacity);
            }
        });

        container.appendChild(labelElement);
        container.appendChild(colorInput);
        parent.appendChild(container);
    }

    /**
     * Add a checkbox control
     *
     * @param {HTMLElement} parent - Parent container element
     * @param {Object} element - Element data object
     * @param {string} property - Property name
     * @param {string} label - Display label
     * @param {Function} updateCallback - Callback for value updates
     */
    static addCheckbox(parent, element, property, label, updateCallback) {
        const container = document.createElement('div');
        container.className = 'slider-container';

        const labelElement = document.createElement('label');
        labelElement.textContent = label + ':';
        labelElement.style.display = 'flex';
        labelElement.style.alignItems = 'center';
        labelElement.style.gap = '10px';

        const checkboxInput = document.createElement('input');
        checkboxInput.type = 'checkbox';
        checkboxInput.checked = element[property] || false;
        checkboxInput.dataset.property = property;
        checkboxInput.dataset.elementId = element.id || '';

        checkboxInput.addEventListener('change', () => {
            if (updateCallback) {
                updateCallback(property, checkboxInput.checked);
            }
        });

        labelElement.appendChild(checkboxInput);
        container.appendChild(labelElement);
        parent.appendChild(container);
    }

    /**
     * Add a select dropdown control
     *
     * @param {HTMLElement} parent - Parent container element
     * @param {Object} element - Element data object
     * @param {string} property - Property name
     * @param {string} label - Display label
     * @param {Array<string>} options - Available options
     * @param {Function} updateCallback - Callback for value updates
     */
    static addSelect(parent, element, property, label, options, updateCallback) {
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
            if (updateCallback) {
                updateCallback(property, selectInput.value);
            }
        });

        container.appendChild(labelElement);
        container.appendChild(selectInput);
        parent.appendChild(container);
    }

    /**
     * Add a boolean toggle control
     *
     * @param {HTMLElement} parent - Parent container element
     * @param {Object} element - Element data object
     * @param {string} property - Property name
     * @param {string} label - Display label
     * @param {Function} updateCallback - Callback for value updates
     */
    static addBoolToggle(parent, element, property, label, updateCallback) {
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
            if (updateCallback) {
                updateCallback(property, checkbox.checked);
            }
        });

        container.appendChild(labelElement);
        container.appendChild(checkbox);
        parent.appendChild(container);
    }

    /**
     * Convert any CSS color to hex format
     *
     * @param {string} color - Color in any CSS format
     * @returns {string} Hex color string
     */
    static convertToHex(color) {
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
            return ControlGenerators.rgbToHex(r, g, b);
        }

        return color;
    }

    /**
     * Convert RGB values to hex
     *
     * @param {number} r - Red (0-255)
     * @param {number} g - Green (0-255)
     * @param {number} b - Blue (0-255)
     * @returns {string} Hex color string
     */
    static rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => {
            const hex = x.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    }

    /**
     * Extract opacity from a color string
     * Supports rgba(r, g, b, a) format
     *
     * @param {string} color - Color string in any format
     * @returns {number} Opacity value (0-1), defaults to 1.0 if not found
     */
    static extractOpacity(color) {
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
     *
     * @param {string} hexColor - Hex color (e.g., "#ff0000")
     * @param {number} opacity - Opacity value (0-1)
     * @returns {string} rgba color string
     */
    static applyOpacity(hexColor, opacity) {
        // If opacity is 1.0, just return the hex color
        if (opacity === 1.0 || opacity === undefined || isNaN(opacity)) {
            return hexColor;
        }

        // Convert hex to RGB
        const hex = hexColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);

        // Return rgba format
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }

    /**
     * Create a collapsible control group header
     *
     * @param {string} title - Group title
     * @param {string} elementId - Element ID for dataset
     * @param {boolean} isCollapsed - Initial collapsed state
     * @param {Function} toggleCallback - Callback when toggled
     * @returns {Object} Object containing {header, content, toggle function}
     */
    static createCollapsibleGroup(title, elementId, isCollapsed, toggleCallback) {
        const controlGroup = document.createElement('div');
        controlGroup.className = 'control-group';
        controlGroup.dataset.elementId = elementId;

        const headerSection = document.createElement('div');
        headerSection.className = 'control-header';
        headerSection.style.display = 'flex';
        headerSection.style.justifyContent = 'space-between';
        headerSection.style.alignItems = 'center';
        headerSection.style.cursor = 'pointer';
        headerSection.style.marginBottom = '10px';

        const titleElement = document.createElement('h3');
        titleElement.textContent = title;
        titleElement.style.margin = '0';

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'toggle-btn';
        toggleBtn.style.padding = '3px 8px';
        toggleBtn.style.fontSize = '12px';
        toggleBtn.style.marginLeft = '10px';
        toggleBtn.title = 'Collapse/Expand';
        toggleBtn.innerHTML = isCollapsed ? '▶' : '▼';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'control-content';
        contentDiv.style.transition = 'max-height 0.3s ease';
        contentDiv.style.maxHeight = isCollapsed ? '0' : 'none';
        contentDiv.style.overflow = isCollapsed ? 'hidden' : 'visible';

        let expanded = !isCollapsed;

        const toggle = (e) => {
            if (e && e.target.classList.contains('danger-btn')) {
                return;
            }

            expanded = !expanded;
            toggleBtn.innerHTML = expanded ? '▼' : '▶';
            contentDiv.style.maxHeight = expanded ? contentDiv.scrollHeight + 'px' : '0';
            contentDiv.style.overflow = expanded ? 'visible' : 'hidden';

            if (toggleCallback) {
                toggleCallback(!expanded);
            }
        };

        headerSection.addEventListener('click', toggle);
        headerSection.appendChild(titleElement);
        headerSection.appendChild(toggleBtn);
        controlGroup.appendChild(headerSection);
        controlGroup.appendChild(contentDiv);

        return {
            group: controlGroup,
            header: headerSection,
            content: contentDiv,
            toggle: toggle
        };
    }
}

// Make available globally
window.ControlGenerators = ControlGenerators;
