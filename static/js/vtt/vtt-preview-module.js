// =============================================================================
// VTT PREVIEW MODULE - Displays JSON battle map data visually
// =============================================================================
// This module handles:
// 1. Rendering the background map (image/video)
// 2. Displaying all elements (tokens, areas, text, images, etc.)
// 3. Coordinate scaling between map size and preview size
// 4. Zoom and pan functionality (JSON-driven)
// =============================================================================

class PreviewModule {
    // -------------------------------------------------------------------------
    // INITIALIZATION
    // -------------------------------------------------------------------------

    constructor(elements, config) {
        // DOM element references
        this.elements = elements;

        // Configuration defaults
        this.config = config;

        // Map dimensions (actual size)
        this.mapWidth = config.defaultMapWidth;
        this.mapHeight = config.defaultMapHeight;

        // Scaling factor (map pixels to preview pixels)
        this.scaleFactor = 1;

        // Maximum preview area dimensions
        this.maxPreviewWidth = config.maxPreviewWidth || 1200;
        this.maxPreviewHeight = config.maxPreviewHeight || 800;

        // Zoom and Pan properties
        this.zoomLevel = 1.0;  // 1.0 = 100% (no zoom)
        this.panX = 0;         // Horizontal pan offset
        this.panY = 0;         // Vertical pan offset

        // Target state for smooth transitions
        this.targetZoom = 1.0;
        this.targetPanX = 0;
        this.targetPanY = 0;

        // Zoom configuration (will be loaded from JSON)
        this.minZoom = 0.1;
        this.maxZoom = 10.0;
        this.zoomSpeed = 0.1;
        this.smoothZoom = true;
        this.interpolationSpeed = 0.15;

        // Load preview scale from localStorage or calculate to fit max dimensions
        // Use different keys for VTT and Display tabs
        this.storageKey = config.storageKey || 'vtt_preview_scale';
        const savedScale = localStorage.getItem(this.storageKey);
        if (savedScale) {
            this.previewScale = parseFloat(savedScale);
        } else {
            // Calculate scale to fit map within max preview dimensions
            const scaleX = this.maxPreviewWidth / this.mapWidth;
            const scaleY = this.maxPreviewHeight / this.mapHeight;
            this.previewScale = Math.min(scaleX, scaleY);
            console.log(`📐 Calculated initial preview scale: ${Math.round(this.previewScale * 100)}%`);
        }

        // Start animation loop for smooth transitions
        this.startAnimationLoop();
    }

    /**
     * Parse pan value that can be either a number (pixels) or a percentage string
     * @param {number|string} value - The pan value (number or string like "50%")
     * @param {number} dimension - The reference dimension (width or height) for percentage calculation
     * @returns {number} The pan value in pixels
     */
    parsePanValue(value, dimension) {
        if (typeof value === 'string' && value.endsWith('%')) {
            // Convert percentage to pixels
            const percentage = parseFloat(value);
            return (percentage / 100.0) * dimension;
        } else {
            // Already in pixels
            return parseFloat(value) || 0;
        }
    }

    /**
     * Set the preview scale and update all elements
     * @param {number} scale - Scale factor (0.1 to 2.0, where 1.0 = 100%)
     */
    setPreviewScale(scale) {
        this.previewScale = Math.max(0.1, Math.min(2.0, scale));

        // Save to localStorage for persistence
        localStorage.setItem(this.storageKey, this.previewScale.toString());

        // Update preview area container size
        const scaledWidth = this.mapWidth * this.previewScale;
        const scaledHeight = this.mapHeight * this.previewScale;

        this.elements.previewArea.style.width = `${scaledWidth}px`;
        this.elements.previewArea.style.height = `${scaledHeight}px`;

        // DON'T apply transform or zoom - we'll handle scaling in coordinate conversion

        // Update background scaling for rotated portraits
        this.updateBackgroundScale();

        // Re-render all elements at the new scale
        this.reRenderAllElements();

        // Update the visible area box
        this.renderVisibleAreaBox();

        console.log(`📏 Preview scale set to ${Math.round(this.previewScale * 100)}%`);
    }

    /**
     * Re-render all elements from the current JSON
     */
    reRenderAllElements() {
        try {
            const jsonValue = this.elements.jsonInput.value.trim();
            if (!jsonValue) return;

            const jsonData = JSON.parse(jsonValue);

            // Clear all preview items (but not background)
            const items = this.elements.previewArea.querySelectorAll('.preview-item');
            items.forEach(item => item.remove());

            // Re-render each element
            if (jsonData.elements && Array.isArray(jsonData.elements)) {
                jsonData.elements.forEach(element => {
                    this.renderPreviewElement(element);
                });
            }
        } catch (error) {
            console.error("Error re-rendering elements:", error);
        }
    }

    /**
     * Get current preview scale
     */
    getPreviewScale() {
        return this.previewScale;
    }

    // -------------------------------------------------------------------------
    // ZOOM & PAN - JSON CONFIGURATION LOADING
    // -------------------------------------------------------------------------

    /**
     * Load zoom and pan values from JSON configuration
     * Called whenever JSON is parsed/updated
     */
    loadZoomFromJson() {
        try {
            const jsonValue = this.elements.jsonInput.value.trim();
            if (!jsonValue) return;

            const jsonData = JSON.parse(jsonValue);

            // Get zoom configuration from JSON
            const zoomConfig = jsonData.zoom || {};

            // Load zoom settings
            const newZoom = zoomConfig.level !== undefined ? zoomConfig.level : 1.0;
            // Parse pan values (supports both pixels and percentages)
            // Negate panX to flip the direction
            const newPanX = zoomConfig.panX !== undefined ? -this.parsePanValue(zoomConfig.panX, this.mapWidth) : 0;
            const newPanY = zoomConfig.panY !== undefined ? this.parsePanValue(zoomConfig.panY, this.mapHeight) : 0;

            // Load zoom constraints
            if (zoomConfig.minZoom !== undefined) this.minZoom = zoomConfig.minZoom;
            if (zoomConfig.maxZoom !== undefined) this.maxZoom = zoomConfig.maxZoom;
            if (zoomConfig.zoomSpeed !== undefined) this.zoomSpeed = zoomConfig.zoomSpeed;
            if (zoomConfig.smoothZoom !== undefined) this.smoothZoom = zoomConfig.smoothZoom;
            if (zoomConfig.interpolationSpeed !== undefined) {
                this.interpolationSpeed = zoomConfig.interpolationSpeed;
            }

            // Clamp zoom to valid range
            const clampedZoom = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));

            // Apply zoom and pan
            if (this.smoothZoom) {
                this.targetZoom = clampedZoom;
                this.targetPanX = newPanX;
                this.targetPanY = newPanY;
            } else {
                this.zoomLevel = clampedZoom;
                this.panX = newPanX;
                this.panY = newPanY;
                this.applyTransform();
            }

            console.log(`🔍 Zoom loaded from JSON: ${Math.round(clampedZoom * 100)}%, Pan: (${newPanX}, ${newPanY})`);

        } catch (error) {
            console.error("Error loading zoom from JSON:", error);
        }
    }

    /**
     * Update the JSON with current zoom/pan values
     * Call this when you want to save current view state back to JSON
     */
    saveZoomToJson() {
        try {
            const jsonValue = this.elements.jsonInput.value.trim();
            if (!jsonValue) return;

            const jsonData = JSON.parse(jsonValue);

            // Ensure zoom object exists
            if (!jsonData.zoom) {
                jsonData.zoom = {};
            }

            // Update zoom values
            jsonData.zoom.level = this.zoomLevel;
            jsonData.zoom.panX = this.panX;
            jsonData.zoom.panY = this.panY;

            // Update JSON textarea
            this.elements.jsonInput.value = JSON.stringify(jsonData, null, 2);

            console.log(`💾 Zoom saved to JSON: ${Math.round(this.zoomLevel * 100)}%, Pan: (${this.panX}, ${this.panY})`);

        } catch (error) {
            console.error("Error saving zoom to JSON:", error);
        }
    }

    // -------------------------------------------------------------------------
    // ZOOM & PAN - CORE FUNCTIONS
    // -------------------------------------------------------------------------

    setZoomFromValue(zoomLevel) {
        const clampedZoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoomLevel));

        if (this.smoothZoom) {
            this.targetZoom = clampedZoom;
        } else {
            this.zoomLevel = clampedZoom;
            this.renderVisibleAreaBox();
        }
    }

    setPanFromValues(panX, panY) {
        if (this.smoothZoom) {
            this.targetPanX = panX;
            this.targetPanY = panY;
        } else {
            this.panX = panX;
            this.panY = panY;
            this.renderVisibleAreaBox();
        }
    }

    // -------------------------------------------------------------------------
    // ZOOM & PAN - COORDINATE CONVERSION
    // -------------------------------------------------------------------------

    screenToWorld(screenX, screenY) {
        const rect = this.elements.previewArea.getBoundingClientRect();
        const localX = screenX - rect.left;
        const localY = screenY - rect.top;

        const cx = this.mapWidth / 2;
        const cy = this.mapHeight / 2;

        const worldX = (localX - cx - this.panX) / this.zoomLevel + cx;
        const worldY = (localY - cy - this.panY) / this.zoomLevel + cy;

        return { x: worldX, y: worldY };
    }

    worldToScreen(worldX, worldY) {
        const cx = this.mapWidth / 2;
        const cy = this.mapHeight / 2;

        const screenX = (worldX - cx) * this.zoomLevel + cx + this.panX;
        const screenY = (worldY - cy) * this.zoomLevel + cy + this.panY;

        return { x: screenX, y: screenY };
    }

    getVisibleBounds() {
        const rect = this.elements.previewArea.getBoundingClientRect();
        const topLeft = this.screenToWorld(rect.left, rect.top);
        const bottomRight = this.screenToWorld(rect.right, rect.bottom);

        return {
            minX: topLeft.x,
            minY: topLeft.y,
            maxX: bottomRight.x,
            maxY: bottomRight.y,
            width: bottomRight.x - topLeft.x,
            height: bottomRight.y - topLeft.y
        };
    }

    // -------------------------------------------------------------------------
    // ZOOM & PAN - TRANSFORM APPLICATION
    // -------------------------------------------------------------------------

    renderVisibleAreaBox() {
        // Remove existing box if present
        const existingBox = this.elements.previewArea.querySelector('.visible-area-box');
        if (existingBox) {
            existingBox.remove();
        }

        const cx = this.mapWidth / 2;
        const cy = this.mapHeight / 2;

        const displayWidth = this.mapWidth;
        const displayHeight = this.mapHeight;

        const visibleWidth = displayWidth / this.zoomLevel;
        const visibleHeight = displayHeight / this.zoomLevel;

        const scaledPanX = this.panX / this.zoomLevel;
        const scaledPanY = this.panY / this.zoomLevel;

        const visibleLeft = cx - visibleWidth / 2 - scaledPanX;
        const visibleTop = cy - visibleHeight / 2 - scaledPanY;

        // Create the visible area box
        const box = document.createElement('div');
        box.className = 'visible-area-box';
        box.style.position = 'absolute';
        // Apply preview scale to position and size
        box.style.left = `${visibleLeft * this.previewScale}px`;
        box.style.top = `${visibleTop * this.previewScale}px`;
        box.style.width = `${visibleWidth * this.previewScale}px`;
        box.style.height = `${visibleHeight * this.previewScale}px`;
        box.style.border = '3px solid red';
        box.style.boxSizing = 'border-box';
        box.style.pointerEvents = 'none';
        box.style.zIndex = '9999';

        // Add label
        const label = document.createElement('div');
        label.style.position = 'absolute';
        label.style.top = '-25px';
        label.style.left = '0';
        label.style.backgroundColor = 'rgba(255, 0, 0, 0.8)';
        label.style.color = 'white';
        label.style.padding = '2px 8px';
        label.style.fontSize = '12px';
        label.style.fontWeight = 'bold';
        label.style.borderRadius = '3px';
        label.style.whiteSpace = 'nowrap';
        label.textContent = `Display Area (${Math.round(this.zoomLevel * 100)}% zoom, Pan: ${Math.round(this.panX)}, ${Math.round(this.panY)})`;
        box.appendChild(label);

        this.elements.previewArea.appendChild(box);
    }
    update() {
        if (!this.smoothZoom) return;

        let changed = false;

        // Interpolate zoom
        if (Math.abs(this.targetZoom - this.zoomLevel) > 0.001) {
            this.zoomLevel += (this.targetZoom - this.zoomLevel) * this.interpolationSpeed;
            changed = true;
        } else if (this.zoomLevel !== this.targetZoom) {
            this.zoomLevel = this.targetZoom;
            changed = true;
        }

        // Interpolate pan X
        if (Math.abs(this.targetPanX - this.panX) > 0.1) {
            this.panX += (this.targetPanX - this.panX) * this.interpolationSpeed;
            changed = true;
        } else if (this.panX !== this.targetPanX) {
            this.panX = this.targetPanX;
            changed = true;
        }

        // Interpolate pan Y
        if (Math.abs(this.targetPanY - this.panY) > 0.1) {
            this.panY += (this.targetPanY - this.panY) * this.interpolationSpeed;
            changed = true;
        } else if (this.panY !== this.targetPanY) {
            this.panY = this.targetPanY;
            changed = true;
        }

        if (changed) {
            // Render the visible area box instead of transforming the preview
            this.renderVisibleAreaBox();
        }
    }

    startAnimationLoop() {
        const animate = () => {
            this.update();
            requestAnimationFrame(animate);
        };
        animate();
    }

    // -------------------------------------------------------------------------
    // ZOOM & PAN - UTILITY METHODS
    // -------------------------------------------------------------------------

    getZoomInfo() {
        return {
            zoomLevel: this.zoomLevel,
            zoomPercent: Math.round(this.zoomLevel * 100),
            panX: Math.round(this.panX),
            panY: Math.round(this.panY),
            targetZoom: this.targetZoom,
            targetPanX: Math.round(this.targetPanX),
            targetPanY: Math.round(this.targetPanY),
            visibleBounds: this.getVisibleBounds()
        };
    }

    // -------------------------------------------------------------------------
    // BACKGROUND MAP SETUP
    // -------------------------------------------------------------------------

    /**
     * Initialize or update the background map from JSON
     * Sets map to screen size, detects media portrait for rotation
     */
    async initializeMap() {
        try {
            // Parse JSON to get background and screen info
            const jsonValue = this.elements.jsonInput.value.trim();
            if (!jsonValue) {
                console.log("No JSON data available");
                return;
            }

            const jsonData = JSON.parse(jsonValue);

            // Get screen dimensions from JSON config - THIS IS THE DISPLAY SIZE
            const screenConfig = jsonData.screen || {};
            const screenWidth = screenConfig.width || 1920;
            const screenHeight = screenConfig.height || 1080;

            console.log('📺 Screen size: ' + screenWidth + 'x' + screenHeight);

            // Set map dimensions to screen dimensions
            this.mapWidth = screenWidth;
            this.mapHeight = screenHeight;

            // Check if we should force portrait content to landscape
            const backgroundConfig = jsonData.background || {};
            const forceLandscape = backgroundConfig.forceLandscape !== false; // Default true

            // Check if MEDIA is portrait (for rotation)
            let mediaIsPortrait = false;

            if (backgroundConfig && backgroundConfig.src) {
                const src = backgroundConfig.src;
                const isVideo = src.toLowerCase().endsWith('.mp4') ||
                    src.toLowerCase().endsWith('.webm');

                console.log(`🎬 Loading ${isVideo ? 'video' : 'image'}: ${src}`);

                try {
                    const dimensions = await this.getMediaDimensions(src, isVideo);
                    if (dimensions) {
                        const mediaWidth = dimensions.width;
                        const mediaHeight = dimensions.height;
                        console.log(`📏 Media dimensions: ${mediaWidth}x${mediaHeight}`);

                        // Check if MEDIA is portrait
                        mediaIsPortrait = mediaHeight > mediaWidth;
                        console.log(`${mediaIsPortrait ? '📱' : '🖥️'} Media is ${mediaIsPortrait ? 'portrait' : 'landscape'}`);

                        // Save media dimensions to JSON for reference
                        // Re-read current textarea to avoid overwriting newer changes
                        // (this runs after await, so textarea may have been updated)
                        if (!backgroundConfig.width || !backgroundConfig.height) {
                            try {
                                const currentJson = JSON.parse(this.elements.jsonInput.value);
                                if (currentJson.background && currentJson.background.src === src) {
                                    currentJson.background.width = mediaWidth;
                                    currentJson.background.height = mediaHeight;
                                    this.elements.jsonInput.value = JSON.stringify(currentJson, null, 2);
                                }
                            } catch (e) {
                                console.warn('Could not update background dimensions:', e);
                            }
                        }
                    }
                } catch (error) {
                    console.warn('⚠️ Could not get media dimensions:', error);
                }

                // Set background with rotation if needed
                if (isVideo) {
                    this.setBackgroundVideo(src, forceLandscape, mediaIsPortrait);
                } else {
                    this.setBackgroundImage(src, forceLandscape, mediaIsPortrait);
                }
            }

            console.log(`✅ Map size: ${this.mapWidth}x${this.mapHeight} (screen size)`);

            // Set preview area to exact screen size
            this.updatePreviewAreaSize();

            // Load zoom configuration from JSON and render visible area box
            this.loadZoomFromJson();
            this.renderVisibleAreaBox();

            // Update dimension display
            if (this.elements.imageDimensions) {
                const rotationNote = mediaIsPortrait ? ' (media rotated 90°)' : '';
                this.elements.imageDimensions.textContent =
                    `Screen: ${screenWidth} × ${screenHeight}${rotationNote} | Preview: ${this.mapWidth} × ${this.mapHeight} (1:1)`;
            }

        } catch (error) {
            console.error("❌ Error initializing map:", error);
            console.error(error.stack);
        }
    }

    /**
     * Update a single element in the preview without re-rendering everything
     * @param {Object} element - The element data to update
     */
    updatePreviewElement(element) {
        // Just re-render this specific element without touching preview area size
        // Note: renderPreviewElement handles removing and re-adding the element
        this.renderPreviewElement(element);

        // Don't call updatePreviewAreaSize() - that would reset the preview scale!
        // The preview area size should only be changed by setPreviewScale() or initializeMap()
    }

    /**
     * Get actual dimensions of an image or video file
     * @param {string} src - Path to the media file
     * @param {boolean} isVideo - True if video, false if image
     * @returns {Promise<{width: number, height: number}>} Dimensions
     */
    getMediaDimensions(src, isVideo) {
        return new Promise((resolve, reject) => {
            const fullSrc = `/api/images/view?path=${encodeURIComponent(src)}`;

            if (isVideo) {
                // Get video dimensions
                const video = document.createElement('video');
                video.preload = 'metadata';

                video.addEventListener('loadedmetadata', () => {
                    resolve({
                        width: video.videoWidth,
                        height: video.videoHeight
                    });
                    video.src = ''; // Clean up
                });

                video.addEventListener('error', (e) => {
                    reject(new Error(`Failed to load video: ${e.message}`));
                });

                video.src = fullSrc;
            } else {
                // Get image dimensions
                const img = new Image();

                img.onload = () => {
                    resolve({
                        width: img.naturalWidth,
                        height: img.naturalHeight
                    });
                };

                img.onerror = (e) => {
                    reject(new Error(`Failed to load image: ${e.message}`));
                };

                img.src = fullSrc;
            }
        });
    }

    /**
     * Set a video as the background
     * Only recreates if the source changed
     * Supports auto-rotation for portrait videos
     */
    setBackgroundVideo(videoSrc, forceLandscape = true, isPortrait = false) {
        // Remove old background media
        const oldBg = this.elements.previewArea.querySelector('.background-video, .background-image');
        if (oldBg) oldBg.remove();

        const fullSrc = `/api/images/view?path=${encodeURIComponent(videoSrc)}`;
        const video = document.createElement('video');
        video.className = 'background-video';
        video.src = fullSrc;
        video.autoplay = true;
        video.loop = true;
        video.muted = true;

        video.style.position = 'absolute';
        video.style.zIndex = '0';
        video.style.pointerEvents = 'none';

        if (forceLandscape && isPortrait) {
            console.log('🔄 Rotating portrait video 90° clockwise');
            video.style.top = '50%';
            video.style.left = '50%';
            // Use scaled dimensions so portrait backgrounds scale with preview scale
            video.style.width = `${this.mapHeight * this.previewScale}px`;
            video.style.height = `${this.mapWidth * this.previewScale}px`;
            video.style.objectFit = 'contain';
            video.style.transform = 'translate(-50%, -50%) rotate(90deg)';
            video.style.transformOrigin = 'center center';
        } else {
            video.style.top = '0';
            video.style.left = '0';
            video.style.width = '100%';
            video.style.height = '100%';
            video.style.objectFit = 'contain';
        }

        this.elements.previewArea.insertBefore(video, this.elements.previewArea.firstChild);
    }

    /**
     * Set an image as the background
     * Supports auto-rotation for portrait images
     */
    setBackgroundImage(imageSrc, forceLandscape = true, isPortrait = false) {
        // Remove old background media
        const oldBg = this.elements.previewArea.querySelector('.background-video, .background-image');
        if (oldBg) oldBg.remove();

        const fullSrc = `/api/images/view?path=${encodeURIComponent(imageSrc)}`;
        const img = document.createElement('img');
        img.className = 'background-image';
        img.src = fullSrc;

        img.style.position = 'absolute';
        img.style.zIndex = '0';
        img.style.pointerEvents = 'none';

        if (forceLandscape && isPortrait) {
            console.log('🔄 Rotating portrait image 90° clockwise');
            img.style.top = '50%';
            img.style.left = '50%';
            // Use scaled dimensions so portrait backgrounds scale with preview scale
            img.style.width = `${this.mapHeight * this.previewScale}px`;
            img.style.height = `${this.mapWidth * this.previewScale}px`;
            img.style.objectFit = 'contain';
            img.style.transform = 'translate(-50%, -50%) rotate(90deg)';
            img.style.transformOrigin = 'center center';
        } else {
            console.log('🖥️ Displaying landscape image');
            img.style.top = '0';
            img.style.left = '0';
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'contain';
        }

        this.elements.previewArea.insertBefore(img, this.elements.previewArea.firstChild);
    }

    /**
     * Update the scale of existing background image/video for rotated portraits
     * Called when preview scale changes
     */
    updateBackgroundScale() {
        const bg = this.elements.previewArea.querySelector('.background-video, .background-image');
        if (!bg) return;

        // Check if background is rotated (portrait mode)
        const transform = bg.style.transform;
        const isRotated = transform && transform.includes('rotate');

        if (isRotated) {
            // Update rotated portrait dimensions with current preview scale
            bg.style.width = `${this.mapHeight * this.previewScale}px`;
            bg.style.height = `${this.mapWidth * this.previewScale}px`;
            console.log(`🔄 Updated rotated background scale to ${Math.round(this.previewScale * 100)}%`);
        }
        // Landscape backgrounds use 100% so they scale automatically with container
    }

    /**
     * Update preview area size respecting current preview scale
     * This is called on window resize or when map is initialized
     */
    updatePreviewAreaSize() {
        const displayWidth = this.mapWidth * this.previewScale;
        const displayHeight = this.mapHeight * this.previewScale;

        this.scaleFactor = 1;

        this.elements.previewArea.style.width = `${displayWidth}px`;
        this.elements.previewArea.style.height = `${displayHeight}px`;

        console.log(`✅ Preview area: ${displayWidth}x${displayHeight} (scale: ${Math.round(this.previewScale * 100)}%)`);
    }

    // -------------------------------------------------------------------------
    // COORDINATE CONVERSION & DIMENSIONS
    // -------------------------------------------------------------------------

    /**
     * Get current map dimensions
     */
    getMapDimensions() {
        return {
            width: this.mapWidth,
            height: this.mapHeight
        };
    }

    /**
     * Get current scale factor
     */
    getScaleFactor() {
        return this.scaleFactor;
    }

    // -------------------------------------------------------------------------
    // COORDINATE CONVERSION - SUPPORTS ABSOLUTE, PERCENTAGE, AND RELATIVE
    // -------------------------------------------------------------------------

    /**
     * Parse a coordinate value that may be absolute pixels, percentage string, or relative float
     * Supports:
     * - Absolute pixels (number): 100 -> 100px
     * - Percentage string: "50%" -> 50% of dimension
     * - Relative float (0.0-1.0): 0.5 -> 50% of dimension
     *
     * @param {number|string} value - Coordinate value
     * @param {string} dimension - 'width' or 'height' for which dimension to use
     * @returns {number} Absolute pixel value in map coordinates
     */
    parseCoordValue(value, dimension) {
        if (typeof value === 'string' && value.includes('%')) {
            // Parse percentage string: "50%" -> 0.5
            const percent = parseFloat(value) / 100.0;
            const reference = dimension === 'width' ? this.mapWidth : this.mapHeight;
            return reference * percent;
        } else if (typeof value === 'number' && value > 0 && value <= 1.0) {
            // Relative value (0.0-1.0): 0.5 -> 50% of dimension
            const reference = dimension === 'width' ? this.mapWidth : this.mapHeight;
            return reference * value;
        } else {
            // Absolute pixel value
            return parseFloat(value) || 0;
        }
    }

    /**
     * Parse a size value that may be absolute pixels, percentage string, or relative float
     * Same logic as parseCoordValue but more semantic for size properties
     *
     * @param {number|string} value - Size value
     * @param {string} dimension - 'width' or 'height' for which dimension to use as reference
     * @returns {number} Absolute pixel value in map coordinates
     */
    parseSizeValue(value, dimension) {
        return this.parseCoordValue(value, dimension);
    }

    /**
     * Check if a value is using relative coordinates (percentage or float 0-1)
     * @param {number|string} value - Value to check
     * @returns {boolean} True if value is relative
     */
    isRelativeValue(value) {
        if (typeof value === 'string' && value.includes('%')) {
            return true;
        } else if (typeof value === 'number' && value > 0 && value <= 1.0) {
            return true;
        }
        return false;
    }

    /**
     * Convert map coordinates to preview coordinates (accounting for preview scale)
     * Now supports absolute pixels, percentage strings, and relative floats
     *
     * @param {number|string} x - X coordinate (absolute, "50%", or 0.5)
     * @param {number|string} y - Y coordinate (absolute, "50%", or 0.5)
     * @returns {{x: number, y: number}} Preview coordinates in pixels
     */
    mapToPreviewCoords(x, y) {
        // Safety check for preview scale
        const safePreviewScale = (this.previewScale && !isNaN(this.previewScale) && this.previewScale > 0)
            ? this.previewScale
            : 1.0;
        const safeScaleFactor = (this.scaleFactor && !isNaN(this.scaleFactor) && this.scaleFactor > 0)
            ? this.scaleFactor
            : 1.0;

        // Parse coordinates to absolute map pixels
        const mapX = this.parseCoordValue(x, 'width');
        const mapY = this.parseCoordValue(y, 'height');

        // Apply both scale factor AND preview scale
        const result = {
            x: (mapX / safeScaleFactor) * safePreviewScale,
            y: (mapY / safeScaleFactor) * safePreviewScale
        };

        // Debug check for NaN
        if (isNaN(result.x) || isNaN(result.y)) {
            console.error("mapToPreviewCoords produced NaN!", {
                input: { x, y },
                mapX, mapY,
                safeScaleFactor, safePreviewScale,
                result
            });
        }

        return result;
    }

    /**
     * Convert preview coordinates to map coordinates (accounting for preview scale)
     * Always returns absolute pixel values
     */
    previewToMapCoords(x, y) {
        // Safety check for preview scale
        const safePreviewScale = (this.previewScale && !isNaN(this.previewScale) && this.previewScale > 0)
            ? this.previewScale
            : 1.0;
        const safeScaleFactor = (this.scaleFactor && !isNaN(this.scaleFactor) && this.scaleFactor > 0)
            ? this.scaleFactor
            : 1.0;

        // Reverse both preview scale and scale factor
        const result = {
            x: (x / safePreviewScale) * safeScaleFactor,
            y: (y / safePreviewScale) * safeScaleFactor
        };

        // Debug check for NaN
        if (isNaN(result.x) || isNaN(result.y)) {
            console.error("previewToMapCoords produced NaN!", {
                input: { x, y },
                safeScaleFactor, safePreviewScale,
                result
            });
        }

        return result;
    }

    // -------------------------------------------------------------------------
    // ELEMENT RENDERING
    // -------------------------------------------------------------------------

    /**
     * Main render function - routes to appropriate element renderer
     */
    renderPreviewElement(element) {
        // Remove existing element if present
        this.removePreviewElement(element.id);

        // Create preview container
        const preview = document.createElement('div');
        preview.className = 'preview-item';
        preview.dataset.elementId = element.id || '';

        // Convert coordinates to preview scale
        const previewCoords = this.mapToPreviewCoords(element.x || 0, element.y || 0);

        // Route to appropriate renderer based on type
        switch (element.type) {
            case 'token':
                this.renderToken(preview, element, previewCoords);
                break;
            case 'area':
                this.renderArea(preview, element, previewCoords);
                break;
            case 'text':
                this.renderText(preview, element, previewCoords);
                break;
            case 'video':
                this.renderVideo(preview, element, previewCoords);
                break;
            case 'gif':
                this.renderGif(preview, element, previewCoords);
                break;
            case 'image':
                this.renderImage(preview, element, previewCoords);
                break;
            case 'svg':
                this.renderSvg(preview, element, previewCoords);
                break;
            case 'line':
                this.renderLine(preview, element, previewCoords);
                break;
            case 'cone':
                this.renderCone(preview, element, previewCoords);
                break;
            case 'box':
                this.renderBox(preview, element, previewCoords);
                break;
            case 'circle':
                this.renderCircle(preview, element, previewCoords);
                break;
            case 'bar':
                this.renderBar(preview, element, previewCoords);
                break;
            default:
                console.warn(`Unknown element type: ${element.type}`);
                return;
        }

        // Add to preview area
        this.elements.previewArea.appendChild(preview);
    }

    /**
     * Remove an element from the preview
     */
    removePreviewElement(elementId) {
        const existing = this.elements.previewArea.querySelector(
            `.preview-item[data-element-id="${elementId}"]`
        );
        if (existing) {
            existing.remove();
        }
    }

    /**
     * Clear all preview elements (keeps background)
     */
    clearPreview() {
        const items = this.elements.previewArea.querySelectorAll('.preview-item');
        items.forEach(item => item.remove());
    }

    // -------------------------------------------------------------------------
    // INDIVIDUAL ELEMENT RENDERERS - ALL UPDATED WITH PREVIEW SCALE
    // -------------------------------------------------------------------------

    /**
     * Render a token (circular element with image)
     * Supports absolute pixels, percentage strings ("5%"), and relative floats (0.05)
     */
    renderToken(preview, element, coords) {
        // Parse size to absolute pixels, then apply scaling
        const mapSize = this.parseSizeValue(element.size || 50, 'width');
        const size = (mapSize / this.scaleFactor) * this.previewScale;
        const opacity = (element.opacity !== undefined ? element.opacity : 100) / 100;
        const rotation = element.rotation || 0;

        preview.style.position = 'absolute';
        preview.style.left = `${coords.x}px`;
        preview.style.top = `${coords.y}px`;
        preview.style.width = `${size}px`;
        preview.style.height = `${size}px`;
        preview.style.borderRadius = '50%';
        preview.style.opacity = opacity;
        preview.style.overflow = 'hidden';
        preview.style.border = `${2 * this.previewScale}px solid rgba(255, 255, 255, 0.5)`;

        if (rotation !== 0) {
            preview.style.transform = `rotate(${-rotation}deg)`;
            preview.style.transformOrigin = 'center';
        }

        if (element.src) {
            const img = document.createElement('img');
            img.src = `/api/images/view?path=${encodeURIComponent(element.src)}`;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            preview.appendChild(img);
        } else {
            preview.style.backgroundColor = element.color || 'rgba(100, 100, 200, 0.5)';
        }

        if (element.label) {
            const label = document.createElement('div');
            label.textContent = element.label;
            label.style.position = 'absolute';
            label.style.top = `${-8 * this.previewScale}px`;  // Above the token
            label.style.left = '50%';
            label.style.transform = 'translateX(-50%)';
            label.style.color = 'white';
            label.style.fontSize = `${12 * this.previewScale}px`;
            label.style.fontWeight = 'bold';
            label.style.textShadow = `${1 * this.previewScale}px ${1 * this.previewScale}px ${2 * this.previewScale}px black`;
            label.style.whiteSpace = 'nowrap';
            label.style.pointerEvents = 'none';  // Don't block interactions
            preview.appendChild(label);

            // Allow overflow so label is visible above the element
            preview.style.overflow = 'visible';
        }

        // Disable pointer events if element is locked
        preview.style.pointerEvents = element.locked ? 'none' : 'auto';
    }

    /**
     * Render an area (rectangular region)
     * Supports absolute pixels, percentage strings ("10%"), and relative floats (0.1)
     */
    renderArea(preview, element, coords) {
        // Parse width/height to absolute pixels, then apply scaling
        const mapWidth = this.parseSizeValue(element.width || 100, 'width');
        const mapHeight = this.parseSizeValue(element.height || 100, 'height');
        const width = (mapWidth / this.scaleFactor) * this.previewScale;
        const height = (mapHeight / this.scaleFactor) * this.previewScale;
        const alpha = element.alpha !== undefined ? element.alpha / 100 : 0.3;
        const color = element.color || '#ff0000';
        const rotation = element.rotation || 0;

        preview.style.position = 'absolute';
        preview.style.left = `${coords.x}px`;
        preview.style.top = `${coords.y}px`;
        preview.style.width = `${width}px`;
        preview.style.height = `${height}px`;
        preview.style.backgroundColor = color;
        preview.style.opacity = alpha;
        preview.style.border = `${2 * this.previewScale}px solid rgba(255, 255, 255, 0.5)`;

        if (rotation !== 0) {
            preview.style.transform = `rotate(${rotation}deg)`;
            preview.style.transformOrigin = 'center';
        }

        if (element.label) {
            const label = document.createElement('div');
            label.textContent = element.label;
            label.style.position = 'absolute';
            label.style.top = `${-8 * this.previewScale}px`;  // Above the element
            label.style.left = '50%';
            label.style.transform = 'translateX(-50%)';
            label.style.color = 'white';
            label.style.fontSize = `${14 * this.previewScale}px`;
            label.style.fontWeight = 'bold';
            label.style.textShadow = `${2 * this.previewScale}px ${2 * this.previewScale}px ${4 * this.previewScale}px black`;
            label.style.whiteSpace = 'nowrap';
            label.style.pointerEvents = 'none';  // Don't block interactions
            preview.appendChild(label);

            // Allow overflow so label is visible above the element
            preview.style.overflow = 'visible';
        }

        // Disable pointer events if element is locked
        preview.style.pointerEvents = element.locked ? 'none' : 'auto';
    }

    /**
     * Render text element
     * Supports absolute pixels, percentage strings ("2%"), and relative floats (0.02) for font size
     */
    renderText(preview, element, coords) {
        // Parse font size to absolute pixels, then apply scaling
        const mapFontSize = this.parseSizeValue(element.size || 16, 'height');
        const fontSize = (mapFontSize / this.scaleFactor) * this.previewScale;
        const color = element.color || 'white';
        const opacity = (element.opacity !== undefined ? element.opacity : 100) / 100;
        const alignment = element.alignment || 'left';
        const rotation = element.rotation || 0;

        // Set basic text styles
        preview.style.position = 'absolute';
        preview.style.color = color;
        preview.style.fontSize = `${fontSize}px`;
        preview.style.opacity = opacity;
        preview.style.fontFamily = element.font || 'Arial';
        preview.style.fontWeight = element.bold ? 'bold' : 'normal';
        preview.style.fontStyle = element.italic ? 'italic' : 'normal';
        preview.style.textShadow = `${1 * this.previewScale}px ${1 * this.previewScale}px ${3 * this.previewScale}px black`;
        preview.style.whiteSpace = 'nowrap';  // Prevent wrapping to show full text width
        preview.style.display = 'inline-block';  // Allow width to expand to content
        preview.textContent = element.text || 'Text';

        // Use CSS transform to handle alignment (matches Python backend behavior)
        // This ensures the x,y position represents the anchor point based on alignment
        let transformX = 0;
        if (alignment === 'center') {
            transformX = -50;  // Center: shift left by 50%
        } else if (alignment === 'right') {
            transformX = -100;  // Right: shift left by 100%
        }
        // Left alignment: no transform needed (0%)

        preview.style.left = `${coords.x}px`;
        preview.style.top = `${coords.y}px`;

        // Combine alignment and rotation transforms
        if (rotation !== 0) {
            preview.style.transform = `translateX(${transformX}%) rotate(${rotation}deg)`;
            preview.style.transformOrigin = 'left center';
        } else {
            preview.style.transform = `translateX(${transformX}%)`;
        }
        preview.style.textAlign = 'left';  // Always left since we handle alignment via transform

        // Disable pointer events if element is locked
        preview.style.pointerEvents = element.locked ? 'none' : 'auto';
    }

    /**
     * Render video element
     * Supports absolute pixels, percentage strings, and relative floats for width/height
     */
    renderVideo(preview, element, coords) {
        // Parse width/height to absolute pixels, then apply scaling
        const mapWidth = this.parseSizeValue(element.width || 200, 'width');
        const mapHeight = this.parseSizeValue(element.height || 200, 'height');
        const width = (mapWidth / this.scaleFactor) * this.previewScale;
        const height = (mapHeight / this.scaleFactor) * this.previewScale;
        const opacity = (element.opacity !== undefined ? element.opacity : 100) / 100;
        const rotation = element.rotation || 0;

        preview.style.position = 'absolute';
        preview.style.left = `${coords.x}px`;
        preview.style.top = `${coords.y}px`;
        preview.style.width = `${width}px`;
        preview.style.height = `${height}px`;
        preview.style.opacity = opacity;
        preview.style.overflow = 'hidden';

        if (rotation !== 0) {
            preview.style.transform = `rotate(${-rotation}deg)`;
            preview.style.transformOrigin = 'center';
        }

        if (element.src) {
            const video = document.createElement('video');
            video.src = `/api/images/view?path=${encodeURIComponent(element.src)}`;
            video.autoplay = element.autoplay !== false;
            video.loop = element.loop !== false;
            video.muted = element.muted !== false;
            video.style.width = '100%';
            video.style.height = '100%';
            video.style.objectFit = 'contain';
            video.style.pointerEvents = 'none';  // Allow dragging through video
            preview.appendChild(video);
        } else {
            preview.style.backgroundColor = 'rgba(100, 100, 100, 0.5)';
            preview.textContent = 'No Video';
            preview.style.display = 'flex';
            preview.style.alignItems = 'center';
            preview.style.justifyContent = 'center';
            preview.style.color = 'white';
            preview.style.fontSize = `${14 * this.previewScale}px`;
        }

        // Disable pointer events if element is locked
        preview.style.pointerEvents = element.locked ? 'none' : 'auto';
    }

    /**
     * Render GIF element
     * Supports absolute pixels, percentage strings, and relative floats for width/height
     */
    renderGif(preview, element, coords) {
        // Parse width/height to absolute pixels, then apply scaling
        const mapWidth = this.parseSizeValue(element.width || 100, 'width');
        const mapHeight = this.parseSizeValue(element.height || 100, 'height');
        const width = (mapWidth / this.scaleFactor) * this.previewScale;
        const height = (mapHeight / this.scaleFactor) * this.previewScale;
        const opacity = (element.opacity !== undefined ? element.opacity : 100) / 100;
        const rotation = element.rotation || 0;

        preview.style.position = 'absolute';
        preview.style.left = `${coords.x}px`;
        preview.style.top = `${coords.y}px`;
        preview.style.width = `${width}px`;
        preview.style.height = `${height}px`;
        preview.style.opacity = opacity;
        preview.style.overflow = 'hidden';

        if (rotation !== 0) {
            preview.style.transform = `rotate(${-rotation}deg)`;
            preview.style.transformOrigin = 'center';
        }

        if (element.src) {
            const img = document.createElement('img');
            img.src = `/api/images/view?path=${encodeURIComponent(element.src)}`;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'contain';
            img.style.pointerEvents = 'none';  // Allow dragging through GIF
            preview.appendChild(img);
        } else {
            preview.style.backgroundColor = 'rgba(100, 100, 100, 0.5)';
            preview.textContent = 'No GIF';
            preview.style.display = 'flex';
            preview.style.alignItems = 'center';
            preview.style.justifyContent = 'center';
            preview.style.color = 'white';
            preview.style.fontSize = `${14 * this.previewScale}px`;
        }

        // Disable pointer events if element is locked
        preview.style.pointerEvents = element.locked ? 'none' : 'auto';
    }

    /**
     * Render image element
     * Supports absolute pixels, percentage strings, and relative floats for width/height
     */
    renderImage(preview, element, coords) {
        // Parse width/height to absolute pixels, then apply scaling
        const mapWidth = this.parseSizeValue(element.width || 100, 'width');
        const mapHeight = this.parseSizeValue(element.height || 100, 'height');
        const width = (mapWidth / this.scaleFactor) * this.previewScale;
        const height = (mapHeight / this.scaleFactor) * this.previewScale;
        const opacity = (element.opacity !== undefined ? element.opacity : 100) / 100;
        const rotation = element.rotation || 0;

        preview.style.position = 'absolute';
        preview.style.left = `${coords.x}px`;
        preview.style.top = `${coords.y}px`;
        preview.style.width = `${width}px`;
        preview.style.height = `${height}px`;
        preview.style.opacity = opacity;
        preview.style.overflow = 'hidden';

        if (rotation !== 0) {
            preview.style.transform = `rotate(${-rotation}deg)`;
            preview.style.transformOrigin = 'center';
        }

        if (element.src) {
            const img = document.createElement('img');
            img.src = `/api/images/view?path=${encodeURIComponent(element.src)}`;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'contain';
            img.style.pointerEvents = 'none';  // Allow dragging through image
            preview.appendChild(img);
        } else {
            preview.style.backgroundColor = 'rgba(100, 100, 100, 0.5)';
            preview.textContent = 'No Image';
            preview.style.display = 'flex';
            preview.style.alignItems = 'center';
            preview.style.justifyContent = 'center';
            preview.style.color = 'white';
            preview.style.fontSize = `${14 * this.previewScale}px`;
        }

        // Disable pointer events if element is locked
        preview.style.pointerEvents = element.locked ? 'none' : 'auto';
    }

    /**
     * Render SVG element
     */
    renderSvg(preview, element, coords) {
        // Parse width/height to absolute pixels, then apply scaling
        const mapWidth = this.parseSizeValue(element.width || 100, 'width');
        const mapHeight = this.parseSizeValue(element.height || 100, 'height');
        const width = (mapWidth / this.scaleFactor) * this.previewScale;
        const height = (mapHeight / this.scaleFactor) * this.previewScale;
        const opacity = (element.opacity !== undefined ? element.opacity : 100) / 100;
        const rotation = element.rotation || 0;

        preview.style.position = 'absolute';
        preview.style.left = `${coords.x}px`;
        preview.style.top = `${coords.y}px`;
        preview.style.width = `${width}px`;
        preview.style.height = `${height}px`;
        preview.style.opacity = opacity;

        if (rotation !== 0) {
            preview.style.transform = `rotate(${-rotation}deg)`;
            preview.style.transformOrigin = 'center';
        }

        if (element.svgContent) {
            preview.innerHTML = element.svgContent;
            const svg = preview.querySelector('svg');
            if (svg) {
                svg.style.width = '100%';
                svg.style.height = '100%';
                svg.style.pointerEvents = 'none';  // Allow dragging through SVG

                // Apply color if specified
                if (element.color) {
                    svg.style.fill = element.color;
                }
            }
        } else if (element.src) {
            const img = document.createElement('img');
            img.src = `/api/images/view?path=${encodeURIComponent(element.src)}`;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.pointerEvents = 'none';  // Allow dragging through SVG image

            // For SVG images, we can try to apply color via filter
            if (element.color) {
                // This is a simple approach - may need refinement
                img.style.filter = `brightness(1.2)`;
            }

            preview.appendChild(img);
        } else {
            preview.style.backgroundColor = 'rgba(100, 100, 100, 0.5)';
            preview.textContent = 'No SVG';
            preview.style.display = 'flex';
            preview.style.alignItems = 'center';
            preview.style.justifyContent = 'center';
            preview.style.color = 'white';
            preview.style.fontSize = `${14 * this.previewScale}px`;
        }

        // Disable pointer events if element is locked
        preview.style.pointerEvents = element.locked ? 'none' : 'auto';
    }

    /**
     * Render line element
     */
    renderLine(preview, element, coords) {
        // Parse endX/endY coordinates (support percentages)
        const endCoords = this.mapToPreviewCoords(element.endX || 0, element.endY || 0);
        const endX = endCoords.x;
        const endY = endCoords.y;
        const opacity = (element.opacity !== undefined ? element.opacity : 100) / 100;
        const color = element.color || 'red';
        // Parse thickness (support percentages)
        const mapThickness = this.parseSizeValue(element.thickness || 2, 'width');
        const thickness = (mapThickness / this.scaleFactor) * this.previewScale;

        const dx = endX - coords.x;
        const dy = endY - coords.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);

        preview.style.position = 'absolute';
        preview.style.left = `${coords.x}px`;
        preview.style.top = `${coords.y}px`;
        preview.style.width = `${length}px`;
        preview.style.height = `${thickness}px`;
        preview.style.backgroundColor = color;
        preview.style.opacity = opacity;
        preview.style.transformOrigin = '0 0';
        preview.style.transform = `rotate(${angle}deg)`;

        if (element.label) {
            const label = document.createElement('div');
            label.textContent = element.label;
            label.style.position = 'absolute';
            label.style.top = `${-8 * this.previewScale}px`;  // Above the line
            label.style.left = '50%';
            label.style.transform = 'translateX(-50%)';
            label.style.color = 'white';
            label.style.fontSize = `${12 * this.previewScale}px`;
            label.style.fontWeight = 'bold';
            label.style.textShadow = `${1 * this.previewScale}px ${1 * this.previewScale}px ${2 * this.previewScale}px black`;
            label.style.whiteSpace = 'nowrap';
            label.style.pointerEvents = 'none';  // Don't block interactions
            preview.appendChild(label);

            // Allow overflow so label is visible above the element
            preview.style.overflow = 'visible';
        }

        // Disable pointer events if element is locked
        preview.style.pointerEvents = element.locked ? 'none' : 'auto';
    }

    /**
     * Render cone element
     */
    renderCone(preview, element, coords) {
        // Parse radius to absolute pixels, then apply scaling
        const mapRadius = this.parseSizeValue(element.radius || 100, 'width');
        const radius = (mapRadius / this.scaleFactor) * this.previewScale;
        const angle = element.angle || 90;
        const direction = element.direction || 0;
        const alpha = element.alpha !== undefined ? element.alpha / 100 : 0.5;
        const color = element.color || '#ffa500';
        const borderColor = element.borderColor || '#ff7700';
        const rotation = element.rotation || 0;

        preview.style.position = 'absolute';
        // Center the clickable area around the cone's apex (coords.x, coords.y)
        preview.style.left = `${coords.x - radius}px`;
        preview.style.top = `${coords.y - radius}px`;
        preview.style.width = `${radius * 2}px`;
        preview.style.height = `${radius * 2}px`;

        if (rotation !== 0) {
            preview.style.transform = `rotate(${rotation}deg)`;
            preview.style.transformOrigin = 'center';
        }

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', radius * 2);
        svg.setAttribute('height', radius * 2);
        svg.style.position = 'absolute';
        svg.style.left = '0px';
        svg.style.top = '0px';

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const startAngle = direction - angle / 2;
        const endAngle = direction + angle / 2;

        const startRad = (startAngle * Math.PI) / 180;
        const endRad = (endAngle * Math.PI) / 180;

        const x1 = radius + radius * Math.cos(startRad);
        const y1 = radius + radius * Math.sin(startRad);
        const x2 = radius + radius * Math.cos(endRad);
        const y2 = radius + radius * Math.sin(endRad);

        const largeArc = angle > 180 ? 1 : 0;

        const pathData = `M ${radius} ${radius} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
        path.setAttribute('d', pathData);
        path.setAttribute('fill', color);
        path.setAttribute('fill-opacity', alpha);
        path.setAttribute('stroke', borderColor);
        path.setAttribute('stroke-width', 2 * this.previewScale);

        svg.appendChild(path);
        preview.appendChild(svg);

        if (element.label) {
            const label = document.createElement('div');
            label.textContent = element.label;
            label.style.position = 'absolute';
            label.style.top = `${-8 * this.previewScale}px`;  // Above the cone (center is now at radius, radius)
            label.style.left = `${radius}px`;  // Center horizontally
            label.style.transform = 'translateX(-50%)';
            label.style.color = 'white';
            label.style.fontSize = `${14 * this.previewScale}px`;
            label.style.fontWeight = 'bold';
            label.style.textShadow = `${2 * this.previewScale}px ${2 * this.previewScale}px ${4 * this.previewScale}px black`;
            label.style.whiteSpace = 'nowrap';
            label.style.pointerEvents = 'none';
            preview.appendChild(label);

            // Allow overflow so label is visible above the element
            preview.style.overflow = 'visible';
        }

        // Disable pointer events if element is locked
        preview.style.pointerEvents = element.locked ? 'none' : 'auto';
    }

    /**
     * Render a box element (Sageslate)
     * @param {HTMLElement} preview - Preview container
     * @param {Object} element - Element data
     * @param {Object} coords - Scaled preview coordinates
     */
    renderBox(preview, element, coords) {
        const mapWidth = this.parseSizeValue(element.width || 100, 'width');
        const mapHeight = this.parseSizeValue(element.height || 100, 'height');
        const width = (mapWidth / this.scaleFactor) * this.previewScale;
        const height = (mapHeight / this.scaleFactor) * this.previewScale;

        const grayscaleValue = element.grayscale || 0;
        const transparencyValue = element.transparency || 0;
        const opacity = 1 - (transparencyValue / 100);
        const rotation = element.rotation || 0;

        preview.style.position = 'absolute';
        preview.style.left = `${coords.x}px`;
        preview.style.top = `${coords.y}px`;
        preview.style.width = `${width}px`;
        preview.style.height = `${height}px`;
        preview.style.border = 'none';

        if (rotation !== 0) {
            preview.style.transform = `rotate(${rotation}deg)`;
            preview.style.transformOrigin = 'center';
        }

        if (grayscaleValue > 0) {
            const grayValue = Math.floor(255 * (1 - grayscaleValue/100));
            preview.style.backgroundColor = `rgba(${grayValue}, ${grayValue}, ${grayValue}, ${opacity})`;
        } else {
            preview.style.backgroundColor = `rgba(255, 255, 255, ${opacity})`;
        }

        preview.style.pointerEvents = element.locked ? 'none' : 'auto';
    }

    /**
     * Render a circle element (Sageslate)
     * @param {HTMLElement} preview - Preview container
     * @param {Object} element - Element data
     * @param {Object} coords - Scaled preview coordinates
     */
    renderCircle(preview, element, coords) {
        const mapRadius = this.parseSizeValue(element.radius || 50, 'width');
        const radius = (mapRadius / this.scaleFactor) * this.previewScale;

        const grayscaleValue = element.grayscale || 0;
        const transparencyValue = element.transparency || 0;
        const opacity = 1 - (transparencyValue / 100);
        const rotation = element.rotation || 0;

        preview.style.position = 'absolute';
        // Center the clickable area around the circle's center (coords.x, coords.y)
        preview.style.left = `${coords.x - radius}px`;
        preview.style.top = `${coords.y - radius}px`;
        preview.style.width = `${radius * 2}px`;
        preview.style.height = `${radius * 2}px`;
        preview.style.borderRadius = '50%';
        preview.style.border = 'none';

        if (rotation !== 0) {
            preview.style.transform = `rotate(${rotation}deg)`;
            preview.style.transformOrigin = 'center';
        }

        if (grayscaleValue > 0) {
            const grayValue = Math.floor(255 * (1 - grayscaleValue/100));
            preview.style.backgroundColor = `rgba(${grayValue}, ${grayValue}, ${grayValue}, ${opacity})`;
        } else {
            preview.style.backgroundColor = `rgba(255, 255, 255, ${opacity})`;
        }

        preview.style.pointerEvents = element.locked ? 'none' : 'auto';
    }

    /**
     * Render a bar element (Sageslate)
     * @param {HTMLElement} preview - Preview container
     * @param {Object} element - Element data
     * @param {Object} coords - Scaled preview coordinates
     */
    renderBar(preview, element, coords) {
        const mapWidth = this.parseSizeValue(element.width || 200, 'width');
        const mapHeight = this.parseSizeValue(element.height || 20, 'height');
        const width = (mapWidth / this.scaleFactor) * this.previewScale;
        const height = (mapHeight / this.scaleFactor) * this.previewScale;

        const grayscaleValue = element.grayscale || 0;
        const transparencyValue = element.transparency || 0;
        const opacity = 1 - (transparencyValue / 100);
        const rotation = element.rotation || 0;

        preview.style.position = 'absolute';
        preview.style.left = `${coords.x}px`;
        preview.style.top = `${coords.y}px`;
        preview.style.width = `${width}px`;
        preview.style.height = `${height}px`;
        preview.style.border = 'none';
        preview.style.backgroundColor = `rgba(238, 238, 238, ${opacity})`;
        preview.style.padding = '0';
        preview.style.overflow = 'hidden';

        if (rotation !== 0) {
            preview.style.transform = `rotate(${rotation}deg)`;
            preview.style.transformOrigin = 'center';
        }

        // Create the filled part of the bar
        const maxValue = element.maxValue || 100;
        const currentValue = Math.min(element.currentValue || 0, maxValue);
        const fillPercentage = (currentValue / maxValue) * 100;

        const fillBar = document.createElement('div');
        fillBar.style.width = `${fillPercentage}%`;
        fillBar.style.height = '100%';

        if (grayscaleValue > 0) {
            const grayValue = Math.floor(255 * (1 - grayscaleValue/100));
            fillBar.style.backgroundColor = `rgba(${grayValue}, ${grayValue}, ${grayValue}, ${opacity})`;
        } else {
            const barColor = element.barColor || '#4CAF50';
            const r = parseInt(barColor.substring(1, 3), 16);
            const g = parseInt(barColor.substring(3, 5), 16);
            const b = parseInt(barColor.substring(5, 7), 16);
            fillBar.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${opacity})`;
        }

        preview.appendChild(fillBar);
        preview.style.pointerEvents = element.locked ? 'none' : 'auto';
    }

    /**
 * Update zoom/pan from current JSON and render the box
 * Call this whenever the JSON changes
 */
    updateZoomFromJson() {
        this.loadZoomFromJson();
        // Always render the box after loading, regardless of smooth zoom
        this.renderVisibleAreaBox();
    }
}

// Debounce utility function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ============================================================================
// INTEGRATION INSTRUCTIONS FOR CONTROLS MODULE
// ============================================================================
/*
In your ControlsModule's updateZoomConfig method, add this line to update the visible area box:

updateZoomConfig(zoomConfig) {
    try {
        const jsonData = JSON.parse(this.elements.jsonInput.value);
        jsonData.zoom = zoomConfig;
        this.elements.jsonInput.value = JSON.stringify(jsonData, null, 2);
        
        // Update the visible area box immediately
        this.previewModule.updateZoomFromJson();
        
        // Trigger config update
        this.writeConfig();
        
        // Show zoom level in UI
        this.showZoomIndicator(zoomConfig.level);
    } catch (error) {
        console.error("Error updating zoom config:", error);
    }
}

Also, make sure parseJsonAndGenerateControls calls updateZoomFromJson:
After generating zoom controls, add:
    this.previewModule.updateZoomFromJson();
*/