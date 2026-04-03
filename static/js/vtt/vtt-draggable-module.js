// =============================================================================
// FIXED VTT DRAGGABLE MODULE - WITH PREVIEW SCALE SUPPORT
// =============================================================================
// Fixes:
// 1. elementData becoming null after first drag
// 2. Too many file saves during drag
// 3. Preview scale support for dragging
// =============================================================================

class DraggableModule {
    constructor(elements, previewModule) {
        this.elements = elements;
        this.previewModule = previewModule;
        this.isDragging = false;
        this.currentElement = null;
        this.offsetX = 0;
        this.offsetY = 0;
        this.elementData = null;
        this.originalPosition = { x: 0, y: 0 };

        // FIX: Add these properties for optimization
        this.cachedJsonData = null;
        this.animationFrame = null;

        // FIX: Throttle control updates
        this.updateControlsThrottled = throttle(() => {
            this.updateControlsFromElement();
        }, 100);

        // FIX: Debounce JSON writes (DON'T write during drag)
        this.writeJsonDebounced = debounce(() => {
            this.writeJsonToTextarea();
        }, 150);
    }

    makeDraggable() {
        this.elements.previewArea.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mouseup', () => this.handleMouseUp());

        this.elements.previewArea.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        document.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        document.addEventListener('touchend', () => this.handleTouchEnd());
    }

    handleMouseDown(e) {
        const element = e.target.closest('.preview-item');
        if (!element) return;

        const elementId = element.dataset.elementId;
        if (this.isElementLocked(elementId)) return;

        e.preventDefault();
        this.startDragging(element, e.clientX, e.clientY);
    }

    handleTouchStart(e) {
        const element = e.target.closest('.preview-item');
        if (!element) return;

        const elementId = element.dataset.elementId;
        if (this.isElementLocked(elementId)) return;

        e.preventDefault();
        const touch = e.touches[0];
        this.startDragging(element, touch.clientX, touch.clientY);
    }

    isElementLocked(elementId) {
        try {
            // FIX: Use cached JSON if available
            const jsonData = this.cachedJsonData || JSON.parse(this.elements.jsonInput.value);
            const element = jsonData.elements.find(elem => (elem.id || '') === elementId);
            return element && element.locked === true;
        } catch (error) {
            console.error("Error checking lock status:", error);
            return false;
        }
    }

    startDragging(element, clientX, clientY) {
        this.isDragging = true;
        this.currentElement = element;
        const elementId = element.dataset.elementId;

        try {
            // FIX: Parse once and cache, also clone the element data
            this.cachedJsonData = JSON.parse(this.elements.jsonInput.value);
            const foundElement = this.cachedJsonData.elements.find(elem => (elem.id || '') === elementId);

            if (foundElement) {
                // FIX: Clone the element data so we don't lose reference
                this.elementData = JSON.parse(JSON.stringify(foundElement));

                this.originalPosition = {
                    x: this.elementData.x || 0,
                    y: this.elementData.y || 0
                };

                if (this.elementData.type === 'line') {
                    this.originalPosition.endX = this.elementData.endX || 0;
                    this.originalPosition.endY = this.elementData.endY || 0;
                }
            }
        } catch (error) {
            console.error("Error finding element data:", error);
        }

        const rect = element.getBoundingClientRect();
        const previewRect = this.elements.previewArea.getBoundingClientRect();

        // FIX: Calculate offset in client coordinates (screen space)
        // The element's position is already in the scaled preview
        if (this.elementData && this.elementData.type === 'text') {
            const alignment = this.elementData.alignment || 'left';
            if (alignment === 'center') {
                this.offsetX = clientX - (rect.left + rect.width / 2);
            } else if (alignment === 'right') {
                this.offsetX = clientX - rect.right;
            } else {
                this.offsetX = clientX - rect.left;
            }
            this.offsetY = clientY - rect.top;
        } else if (this.elementData && (this.elementData.type === 'cone' || this.elementData.type === 'circle')) {
            // For cone and circle, the x,y position is the center, so offset from center
            this.offsetX = clientX - (rect.left + rect.width / 2);
            this.offsetY = clientY - (rect.top + rect.height / 2);
        } else {
            this.offsetX = clientX - rect.left;
            this.offsetY = clientY - rect.top;
        }
        element.classList.add('dragging');
    }

    handleMouseMove(e) {
        if (!this.isDragging || !this.currentElement || !this.elementData) return;

        // FIX: Use requestAnimationFrame for smooth 60fps updates
        if (!this.animationFrame) {
            this.animationFrame = requestAnimationFrame(() => {
                this.moveElement(e.clientX, e.clientY);
                this.animationFrame = null;
            });
        }
    }

    handleTouchMove(e) {
        if (!this.isDragging || !this.currentElement || !this.elementData) return;
        e.preventDefault();

        const touch = e.touches[0];

        // FIX: Use requestAnimationFrame
        if (!this.animationFrame) {
            this.animationFrame = requestAnimationFrame(() => {
                this.moveElement(touch.clientX, touch.clientY);
                this.animationFrame = null;
            });
        }
    }

    moveElement(clientX, clientY) {
        // FIX: Safety check
        if (!this.elementData) {
            console.error("elementData is null in moveElement");
            return;
        }

        // Debug: Check if previewModule and its methods exist
        if (!this.previewModule || !this.previewModule.previewToMapCoords) {
            console.error("previewModule or previewToMapCoords is missing!");
            console.log("previewModule:", this.previewModule);
            return;
        }

        const previewRect = this.elements.previewArea.getBoundingClientRect();

        // Calculate where the element should be in client coordinates
        const targetClientX = clientX - this.offsetX;
        const targetClientY = clientY - this.offsetY;

        // Convert to preview-local coordinates
        const newPreviewX = targetClientX - previewRect.left;
        const newPreviewY = targetClientY - previewRect.top;

        // Debug logging (commented out for cleaner console)
        // console.log("Drag coordinates:", {
        //     clientX, clientY,
        //     offsetX: this.offsetX, offsetY: this.offsetY,
        //     targetClientX, targetClientY,
        //     previewRect: { left: previewRect.left, top: previewRect.top },
        //     newPreviewX, newPreviewY,
        //     previewScale: this.previewModule.previewScale,
        //     scaleFactor: this.previewModule.scaleFactor
        // });

        // Convert preview coordinates to map coordinates
        const mapCoords = this.previewModule.previewToMapCoords(newPreviewX, newPreviewY);

        // console.log("Converted to map coords:", mapCoords);

        // Get element dimensions for boundary checking
        // Use parseSizeValue to handle percentages and relative values
        let elementWidth = 10, elementHeight = 10;

        switch (this.elementData.type) {
            case 'token':
                const tokenSize = this.previewModule.parseSizeValue(this.elementData.size || 50, 'width');
                elementWidth = elementHeight = tokenSize;
                break;
            case 'area':
                elementWidth = this.previewModule.parseSizeValue(this.elementData.width || 200, 'width');
                elementHeight = this.previewModule.parseSizeValue(this.elementData.height || 200, 'height');
                break;
            case 'video':
                elementWidth = this.previewModule.parseSizeValue(this.elementData.width || 400, 'width');
                elementHeight = this.previewModule.parseSizeValue(this.elementData.height || 300, 'height');
                break;
            case 'image':
            case 'gif':
                elementWidth = this.previewModule.parseSizeValue(this.elementData.width || 300, 'width');
                elementHeight = this.previewModule.parseSizeValue(this.elementData.height || 200, 'height');
                break;
            case 'svg':
                elementWidth = this.previewModule.parseSizeValue(this.elementData.width || 200, 'width');
                elementHeight = this.previewModule.parseSizeValue(this.elementData.height || 200, 'height');
                break;
            case 'text':
                elementWidth = 50;
                elementHeight = this.previewModule.parseSizeValue(this.elementData.size || 24, 'height');
                break;
            case 'line':
                const deltaX = (this.elementData.endX || 0) - (this.elementData.x || 0);
                const deltaY = (this.elementData.endY || 0) - (this.elementData.y || 0);
                elementWidth = Math.abs(deltaX);
                elementHeight = Math.abs(deltaY);
                break;
            case 'cone':
                const radius = this.previewModule.parseSizeValue(this.elementData.radius || 100, 'width');
                elementWidth = elementHeight = radius * 2;
                break;
            case 'box':
                elementWidth = this.previewModule.parseSizeValue(this.elementData.width || 100, 'width');
                elementHeight = this.previewModule.parseSizeValue(this.elementData.height || 100, 'height');
                break;
            case 'circle':
                const circleRadius = this.previewModule.parseSizeValue(this.elementData.radius || 50, 'width');
                elementWidth = elementHeight = circleRadius * 2;
                break;
            case 'bar':
                elementWidth = this.previewModule.parseSizeValue(this.elementData.width || 200, 'width');
                elementHeight = this.previewModule.parseSizeValue(this.elementData.height || 20, 'height');
                break;
        }

        // Clamp coordinates to keep elements within preview bounds
        // Elements must stay fully inside the preview area
        let clampedX, clampedY;

        if (this.elementData.type === 'text') {
            const alignment = this.elementData.alignment || 'left';
            if (alignment === 'center') {
                // Center-aligned text: anchor is center, so allow from half-width to mapWidth - half-width
                clampedX = Math.max(0, Math.min(mapCoords.x, this.previewModule.mapWidth));
            } else if (alignment === 'right') {
                // Right-aligned text: anchor is right edge
                clampedX = Math.max(0, Math.min(mapCoords.x, this.previewModule.mapWidth));
            } else {
                // Left-aligned text: anchor is left edge
                clampedX = Math.max(0, Math.min(mapCoords.x, this.previewModule.mapWidth));
            }
            clampedY = Math.max(0, Math.min(mapCoords.y, this.previewModule.mapHeight - elementHeight));
        } else {
            // For other elements, keep top-left corner within bounds
            // Allow going to edge but not past it
            clampedX = Math.max(0, Math.min(mapCoords.x, this.previewModule.mapWidth - Math.min(elementWidth, 10)));
            clampedY = Math.max(0, Math.min(mapCoords.y, this.previewModule.mapHeight - Math.min(elementHeight, 10)));
        }

        // Convert back to preview coordinates for visual update
        const clampedPreviewCoords = this.previewModule.mapToPreviewCoords(clampedX, clampedY);

        // FIX: Update visual position directly using the preview coordinates
        this.updateVisualPosition(clampedPreviewCoords);

        // Update element data in memory with map coordinates
        this.updateElementPositionInMemory(clampedX, clampedY);

        // FIX: Throttled control updates (max 10/sec)
        this.updateControlsThrottled();

        // FIX: Debounced JSON writes (only writes to textarea, not file)
        this.writeJsonDebounced();
    }
    
    updateVisualPosition(previewCoords) {
        if (!this.currentElement || !this.elementData) return;

        switch (this.elementData.type) {
            case 'cone':
            case 'circle':
                // For cone/circle, previewCoords is the center position
                // The div needs to be offset by radius to center it
                const mapRadius = this.previewModule.parseSizeValue(this.elementData.radius || 100, 'width');
                const scaledRadius = (mapRadius / this.previewModule.scaleFactor) * this.previewModule.previewScale;
                this.currentElement.style.left = `${previewCoords.x - scaledRadius}px`;
                this.currentElement.style.top = `${previewCoords.y - scaledRadius}px`;
                break;
            case 'text':
                this.currentElement.style.left = `${previewCoords.x}px`;
                this.currentElement.style.top = `${previewCoords.y}px`;
                break;
            default:
                this.currentElement.style.left = `${previewCoords.x}px`;
                this.currentElement.style.top = `${previewCoords.y}px`;
                break;
        }
    }

    updateElementPositionInMemory(newX, newY) {
        if (!this.elementData) return;

        switch (this.elementData.type) {
            case 'token':
            case 'text':
            case 'video':
            case 'gif':
            case 'area':
            case 'image':
            case 'svg':
            case 'cone':
            case 'box':
            case 'circle':
            case 'bar':
                this.elementData.x = Math.round(newX);
                this.elementData.y = Math.round(newY);
                break;

            case 'line':
                const deltaX = newX - this.originalPosition.x;
                const deltaY = newY - this.originalPosition.y;
                this.elementData.x = Math.round(this.originalPosition.x + deltaX);
                this.elementData.y = Math.round(this.originalPosition.y + deltaY);
                this.elementData.endX = Math.round(this.originalPosition.endX + deltaX);
                this.elementData.endY = Math.round(this.originalPosition.endY + deltaY);
                break;
        }
    }

    updateControlsFromElement() {
        if (!this.elementData) return;

        const elementId = this.elementData.id || '';
        const xControl = document.querySelector(`input[data-element-id="${elementId}"][data-property="x"]`);
        const yControl = document.querySelector(`input[data-element-id="${elementId}"][data-property="y"]`);

        if (xControl) xControl.value = this.elementData.x;
        if (yControl) yControl.value = this.elementData.y;

        if (this.elementData.type === 'line') {
            const endXControl = document.querySelector(`input[data-element-id="${elementId}"][data-property="endX"]`);
            const endYControl = document.querySelector(`input[data-element-id="${elementId}"][data-property="endY"]`);
            if (endXControl) endXControl.value = this.elementData.endX;
            if (endYControl) endYControl.value = this.elementData.endY;
        }
    }

    writeJsonToTextarea() {
        if (!this.elementData) return;

        try {
            // Read CURRENT textarea content to preserve any external changes
            const currentJsonData = JSON.parse(this.elements.jsonInput.value);

            // Update only the specific element
            const index = currentJsonData.elements.findIndex(e => e.id === this.elementData.id);
            if (index !== -1) {
                currentJsonData.elements[index] = this.elementData;
                // Only update textarea, DON'T save to file during drag
                this.elements.jsonInput.value = JSON.stringify(currentJsonData, null, 2);
            }
        } catch (error) {
            console.error("Error writing JSON:", error);
        }
    }

    async handleMouseUp() {
        await this.finalizeElementPosition();
    }

    async handleTouchEnd() {
        await this.finalizeElementPosition();
    }

    async finalizeElementPosition() {
        // Cancel any pending animation frame to prevent race condition
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }

        if (this.isDragging && this.currentElement && this.elementData) {
            try {
                // Store element data to update
                const elementToUpdate = this.elementData;
                const elementId = elementToUpdate.id;

                console.log('═══════════════════════════════════════════════════════════');
                console.log('🎯 DRAG FINALIZE DEBUG - Starting position save');
                console.log('═══════════════════════════════════════════════════════════');

                // CRITICAL FIX: Re-read the file from disk to get the absolute latest version
                // This ensures we have the most current background even if auto-reload hasn't run yet
                const controlsModule = this.controlsModuleRef || window.controlsModule || window.controlsModule2;

                console.log('📋 Module references:', {
                    hasControlsModuleRef: !!this.controlsModuleRef,
                    hasWindowControlsModule: !!window.controlsModule,
                    hasWindowControlsModule2: !!window.controlsModule2,
                    foundControlsModule: !!controlsModule,
                    hasCurrentFilePath: controlsModule?.currentFilePath
                });

                let latestJsonData;
                let backgroundSource = 'unknown';

                if (controlsModule && controlsModule.currentFilePath) {
                    try {
                        console.log('🔄 Re-reading file from disk:', controlsModule.currentFilePath);
                        const response = await fetch(`/json/read?path=${encodeURIComponent(controlsModule.currentFilePath)}`);
                        if (response.ok) {
                            latestJsonData = await response.json();
                            backgroundSource = 'disk';
                            console.log('✓ Got latest file version from disk');
                            console.log('📷 Background from disk:', latestJsonData.background?.src || 'NO BACKGROUND');
                        } else {
                            throw new Error('Failed to read file');
                        }
                    } catch (err) {
                        console.warn('⚠️ Could not re-read file, using textarea content:', err);
                        latestJsonData = JSON.parse(this.elements.jsonInput.value);
                        backgroundSource = 'textarea (fallback after error)';
                        console.log('📷 Background from textarea (error fallback):', latestJsonData.background?.src || 'NO BACKGROUND');
                    }
                } else {
                    // Fallback: use current textarea content
                    console.warn('⚠️ No controls module or file path, using textarea content');
                    latestJsonData = JSON.parse(this.elements.jsonInput.value);
                    backgroundSource = 'textarea (no controls module)';
                    console.log('📷 Background from textarea (no module):', latestJsonData.background?.src || 'NO BACKGROUND');
                }

                // Find and update ONLY the dragged element
                const index = latestJsonData.elements.findIndex(e => e.id === elementId);

                if (index !== -1) {
                    console.log(`✏️ Updating element ${elementId} at index ${index}`);
                    console.log('📍 New position:', { x: elementToUpdate.x, y: elementToUpdate.y });

                    // Update only the element's position, preserving everything else in the JSON
                    latestJsonData.elements[index] = elementToUpdate;

                    // Write back to textarea with preserved background and other config
                    this.elements.jsonInput.value = JSON.stringify(latestJsonData, null, 2);

                    console.log('✓ Updated textarea with preserved background');
                    console.log('💾 About to save to file...');
                    console.log('📷 Background being saved:', latestJsonData.background?.src || 'NO BACKGROUND');
                    console.log('🏷️ Background source:', backgroundSource);

                    // FIX: Only update the preview element, don't rebuild everything
                    if (this.previewModule && this.previewModule.updatePreviewElement) {
                        this.previewModule.updatePreviewElement(elementToUpdate);
                    }

                    // FIX: Save to file ONCE after drag completes
                    if (controlsModule && controlsModule.writeConfig) {
                        console.log('💾 Calling writeConfig to save...');
                        controlsModule.writeConfig();
                        console.log('✓ writeConfig completed');
                    } else {
                        console.error('❌ Cannot save: no controlsModule or writeConfig method');
                    }

                    // Notify the page so it can show the last-moved element panel
                    document.dispatchEvent(new CustomEvent('vttElementMoved', {
                        detail: { element: JSON.parse(JSON.stringify(elementToUpdate)) }
                    }));

                    console.log('═══════════════════════════════════════════════════════════');
                    console.log('✅ DRAG FINALIZE COMPLETE');
                    console.log('═══════════════════════════════════════════════════════════');
                }
            } catch (error) {
                console.error("❌ Error finalizing element position:", error);
                console.error("Stack trace:", error.stack);
            }

            this.currentElement.classList.remove('dragging');

            // FIX: Clear everything properly
            this.isDragging = false;
            this.currentElement = null;
            this.elementData = null;
            this.cachedJsonData = null;
            this.animationFrame = null;
        }
    }
}