/**
 * Draw Module - Real-time drawing canvas that updates as background image
 */

document.addEventListener('DOMContentLoaded', function() {
    const canvas = document.getElementById('drawCanvas');
    const ctx = canvas.getContext('2d');
    const brushColorInput = document.getElementById('brushColor');
    const brushSizeInput = document.getElementById('brushSize');
    const brushSizeValue = document.getElementById('brushSizeValue');
    const targetSelect = document.getElementById('targetSelect');
    const clearBtn = document.getElementById('clearBtn');
    const undoBtn = document.getElementById('undoBtn');
    const runDrawBtn = document.getElementById('runDrawBtn');
    const loadPreviewBtn = document.getElementById('loadPreviewBtn');
    const loadBackgroundCheck = document.getElementById('loadBackgroundCheck');
    const drawStatus = document.getElementById('drawStatus');

    // Drawing state
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    let strokes = [];
    let currentStroke = null;
    let isRunning = false;
    let updateTimeout = null;
    let loadedElements = []; // Store loaded element images
    let backgroundImage = null;
    let backgroundVideo = null; // For video backgrounds
    let animationFrameId = null; // For video animation loop

    // Initialize canvas with white background
    function initCanvas() {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    initCanvas();

    // Load and display elements from config
    async function loadElementsFromConfig() {
        const target = targetSelect.value;
        const configPath = target === 'display'
            ? './storage/scrying_glasses/display.json'
            : './storage/scrying_glasses/battlemap.json';

        try {
            const response = await fetch(`/json/read?path=${encodeURIComponent(configPath)}`);
            if (!response.ok) {
                console.error('Failed to load config');
                return;
            }

            const config = await response.json();
            loadedElements = [];
            backgroundImage = null;

            // Stop any existing video
            if (backgroundVideo) {
                backgroundVideo.pause();
                backgroundVideo = null;
            }
            // Stop animation loop
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }

            // Load background image/video if checkbox is checked and background exists
            if (loadBackgroundCheck.checked && config.background?.src) {
                await loadBackgroundImage(config.background.src);
            }

            // Load elements
            if (config.elements && Array.isArray(config.elements)) {
                for (const element of config.elements) {
                    if (element.type === 'image' && element.src) {
                        await loadElementImage(element);
                    }
                }
            }

            // Redraw canvas with loaded elements
            redrawCanvas();
            console.log(`Loaded ${loadedElements.length} elements from config`);

        } catch (error) {
            console.error('Error loading elements:', error);
        }
    }

    // Check if file is a video
    function isVideoFile(src) {
        const videoExtensions = ['.mp4', '.webm', '.avi', '.mov', '.mkv', '.ogv'];
        const lowerSrc = src.toLowerCase();
        return videoExtensions.some(ext => lowerSrc.endsWith(ext));
    }

    // Load background (image or video)
    async function loadBackgroundImage(src) {
        // Handle video files - load as playing video
        if (isVideoFile(src)) {
            return loadVideoBackground(src);
        }

        // Handle regular images
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                backgroundImage = img;
                console.log('Background image loaded:', src);
                resolve();
            };
            img.onerror = () => {
                console.warn('Failed to load background image:', src);
                resolve();
            };
            img.src = `/api/images/view?path=${encodeURIComponent(src)}`;
        });
    }

    // Load video as background (plays continuously)
    async function loadVideoBackground(src) {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.crossOrigin = 'anonymous';
            video.muted = true;
            video.loop = true;
            video.playsInline = true;
            video.preload = 'auto';

            video.oncanplay = () => {
                backgroundVideo = video;
                video.play().catch(e => console.warn('Video autoplay blocked:', e));
                console.log('Video background loaded and playing:', src);

                // Start animation loop for video
                startVideoAnimationLoop();
                resolve();
            };

            video.onerror = () => {
                console.warn('Failed to load video background:', src);
                resolve();
            };

            video.src = `/api/images/view?path=${encodeURIComponent(src)}`;
            video.load();
        });
    }

    // Animation loop to continuously redraw canvas with video frame
    function startVideoAnimationLoop() {
        function animate() {
            if (!backgroundVideo || backgroundVideo.paused) {
                animationFrameId = null;
                return;
            }

            // Redraw canvas with current video frame
            redrawCanvas();

            animationFrameId = requestAnimationFrame(animate);
        }

        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        animationFrameId = requestAnimationFrame(animate);
    }

    // Load an element image
    async function loadElementImage(element) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                loadedElements.push({
                    image: img,
                    element: element
                });
                resolve();
            };
            img.onerror = () => {
                console.warn('Failed to load element image:', element.src);
                resolve();
            };
            img.src = `/api/images/view?path=${encodeURIComponent(element.src)}`;
        });
    }

    // Parse percentage or pixel value
    function parseValue(value, maxValue) {
        if (typeof value === 'string' && value.endsWith('%')) {
            return (parseFloat(value) / 100) * maxValue;
        }
        return parseFloat(value) || 0;
    }

    // Draw loaded elements onto canvas
    function drawElements() {
        // Draw background video frame first (if video)
        if (backgroundVideo && !backgroundVideo.paused) {
            ctx.drawImage(backgroundVideo, 0, 0, canvas.width, canvas.height);
        }
        // Draw background image (if image)
        else if (backgroundImage) {
            ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
        }

        // Draw each element
        for (const { image, element } of loadedElements) {
            const x = parseValue(element.x, canvas.width);
            const y = parseValue(element.y, canvas.height);
            const width = parseValue(element.width, canvas.width);
            const height = parseValue(element.height, canvas.height);
            const opacity = (element.opacity ?? 100) / 100;

            ctx.save();
            ctx.globalAlpha = opacity;
            ctx.drawImage(image, x, y, width, height);
            ctx.restore();
        }
    }

    // Get scaled coordinates from mouse/touch event
    function getCanvasCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    // Start drawing
    function startDrawing(e) {
        e.preventDefault();
        isDrawing = true;
        const coords = getCanvasCoords(e);
        lastX = coords.x;
        lastY = coords.y;

        currentStroke = {
            color: brushColorInput.value,
            size: parseInt(brushSizeInput.value),
            points: [{ x: lastX, y: lastY }]
        };
    }

    // Draw
    function draw(e) {
        if (!isDrawing) return;
        e.preventDefault();

        const coords = getCanvasCoords(e);

        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(coords.x, coords.y);
        ctx.strokeStyle = brushColorInput.value;
        ctx.lineWidth = parseInt(brushSizeInput.value);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        if (currentStroke) {
            currentStroke.points.push({ x: coords.x, y: coords.y });
        }

        lastX = coords.x;
        lastY = coords.y;

        // Schedule update if running
        if (isRunning) {
            scheduleUpdate();
        }
    }

    // Stop drawing
    function stopDrawing(e) {
        if (isDrawing && currentStroke && currentStroke.points.length > 1) {
            strokes.push(currentStroke);
            console.log('Stroke finished, total strokes:', strokes.length);
        }
        isDrawing = false;
        currentStroke = null;

        // Send final update when stroke ends
        if (isRunning) {
            console.log('Stroke ended, triggering update');
            sendUpdate();
        }
    }

    // Mouse events
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    // Touch events
    canvas.addEventListener('touchstart', startDrawing);
    canvas.addEventListener('touchmove', draw);
    canvas.addEventListener('touchend', stopDrawing);

    // Update brush size display
    brushSizeInput.addEventListener('input', function() {
        brushSizeValue.textContent = this.value;
    });

    // Clear canvas (but keep elements)
    clearBtn.addEventListener('click', function() {
        strokes = [];
        redrawCanvas(); // This redraws elements but clears strokes
        if (isRunning) {
            sendUpdate();
        }
    });

    // Undo last stroke
    undoBtn.addEventListener('click', function() {
        if (strokes.length === 0) return;
        strokes.pop();
        redrawCanvas();
        if (isRunning) {
            sendUpdate();
        }
    });

    // Draw a single stroke
    function drawStroke(stroke) {
        if (!stroke || stroke.points.length < 2) return;

        ctx.beginPath();
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
    }

    // Redraw all strokes (and elements)
    function redrawCanvas() {
        initCanvas();

        // Draw loaded elements first (background layer)
        drawElements();

        // Draw completed strokes
        strokes.forEach(drawStroke);

        // Draw current in-progress stroke (important for video backgrounds)
        if (currentStroke && currentStroke.points.length >= 2) {
            drawStroke(currentStroke);
        }
    }

    // Track if an update is in progress
    let updateInProgress = false;
    let pendingUpdate = false;

    // Schedule update with debounce (update while drawing)
    function scheduleUpdate() {
        if (updateTimeout) {
            clearTimeout(updateTimeout);
        }
        updateTimeout = setTimeout(() => {
            sendUpdate();
        }, 250); // Update every 250ms while drawing (increased for reliability)
    }

    // Track the uploaded image path so we can reuse it
    let uploadedImagePath = null;
    // Store original background source to preserve it
    let originalBackgroundSrc = null;

    // Create transparent overlay with just the strokes (no background)
    function createOverlayBlob() {
        return new Promise((resolve, reject) => {
            // Create a temporary canvas for the overlay
            const overlayCanvas = document.createElement('canvas');
            overlayCanvas.width = canvas.width;
            overlayCanvas.height = canvas.height;
            const overlayCtx = overlayCanvas.getContext('2d');

            // Keep it transparent (don't fill with white)
            // Just draw the strokes
            strokes.forEach(stroke => {
                if (!stroke || stroke.points.length < 2) return;

                overlayCtx.beginPath();
                overlayCtx.strokeStyle = stroke.color;
                overlayCtx.lineWidth = stroke.size;
                overlayCtx.lineCap = 'round';
                overlayCtx.lineJoin = 'round';

                overlayCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
                for (let i = 1; i < stroke.points.length; i++) {
                    overlayCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
                }
                overlayCtx.stroke();
            });

            // Also draw current stroke if in progress
            if (currentStroke && currentStroke.points.length >= 2) {
                overlayCtx.beginPath();
                overlayCtx.strokeStyle = currentStroke.color;
                overlayCtx.lineWidth = currentStroke.size;
                overlayCtx.lineCap = 'round';
                overlayCtx.lineJoin = 'round';

                overlayCtx.moveTo(currentStroke.points[0].x, currentStroke.points[0].y);
                for (let i = 1; i < currentStroke.points.length; i++) {
                    overlayCtx.lineTo(currentStroke.points[i].x, currentStroke.points[i].y);
                }
                overlayCtx.stroke();
            }

            overlayCanvas.toBlob((b) => {
                if (b) resolve(b);
                else reject(new Error('Failed to create overlay blob'));
            }, 'image/png');
        });
    }

    // Send drawings as transparent overlay element (keeps video background playing)
    async function sendUpdate() {
        if (!isRunning) {
            console.log('sendUpdate: not running, skipping');
            return;
        }

        // If update in progress, mark as pending and return
        if (updateInProgress) {
            console.log('sendUpdate: update in progress, marking pending');
            pendingUpdate = true;
            return;
        }

        updateInProgress = true;
        console.log('sendUpdate: starting overlay update...');

        const target = targetSelect.value;
        const configPath = target === 'display'
            ? './storage/scrying_glasses/display.json'
            : './storage/scrying_glasses/battlemap.json';

        try {
            // Create transparent overlay with just the strokes
            const blob = await createOverlayBlob();

            if (!blob || blob.size === 0) {
                throw new Error('Overlay blob is empty');
            }
            console.log('sendUpdate: overlay blob created, size:', blob.size);

            // Upload the overlay to /api/upload/overlay endpoint
            const uploadResponse = await fetch('/api/upload/overlay', {
                method: 'POST',
                body: blob
            });

            if (!uploadResponse.ok) {
                throw new Error('Failed to upload overlay');
            }

            const uploadResult = await uploadResponse.json();
            if (!uploadResult.success || !uploadResult.path) {
                throw new Error('Upload did not return a valid path');
            }

            uploadedImagePath = uploadResult.path;
            console.log('sendUpdate: Overlay uploaded to:', uploadedImagePath);

            // Read current config - MUST succeed to preserve existing data
            const readResponse = await fetch(`/json/read?path=${encodeURIComponent(configPath)}`);

            if (!readResponse.ok) {
                console.error('Failed to read config, aborting to prevent data loss');
                return;
            }

            const config = await readResponse.json();
            if (!config || typeof config !== 'object') {
                console.error('Config is invalid, aborting');
                return;
            }

            // Ensure elements array exists
            if (!config.elements) {
                config.elements = [];
            }

            // Find or create the draw overlay element
            const overlayId = 'draw_overlay';
            let overlayElement = config.elements.find(el => el.id === overlayId);

            if (overlayElement) {
                // Update existing overlay element
                overlayElement.src = uploadedImagePath;
                console.log('sendUpdate: Updated existing overlay element');
            } else {
                // Create new overlay element at the top of the elements array
                overlayElement = {
                    id: overlayId,
                    type: 'image',
                    src: uploadedImagePath,
                    x: '0%',
                    y: '0%',
                    width: '100%',
                    height: '100%',
                    opacity: 100
                };
                config.elements.push(overlayElement);
                console.log('sendUpdate: Created new overlay element');
            }

            // Background is NOT changed - video keeps playing on display engine
            console.log('sendUpdate: Background preserved:', config.background?.src);
            console.log('sendUpdate: Total elements:', config.elements.length);

            // Save config
            const saveResponse = await fetch('/json/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: configPath,
                    content: JSON.stringify(config, null, 2)
                })
            });

            if (!saveResponse.ok) {
                throw new Error('Failed to save config');
            }

            // Trigger refresh
            const refreshTarget = target === 'display' ? 'display' : 'vtt';
            const refreshResponse = await fetch('/api/refresh/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target: refreshTarget,
                    source: 'draw_tab'
                })
            });
            console.log('sendUpdate: Refresh triggered, status:', refreshResponse.status);

        } catch (error) {
            console.error('Error sending drawing:', error);
            drawStatus.textContent = 'Error!';
            drawStatus.style.color = '#f44336';
        } finally {
            updateInProgress = false;
            console.log('sendUpdate: finished');

            // If there's a pending update, send it
            if (pendingUpdate) {
                console.log('sendUpdate: processing pending update');
                pendingUpdate = false;
                setTimeout(() => sendUpdate(), 100);
            }
        }
    }

    // Stop video and animation loop
    function stopVideoPlayback() {
        if (backgroundVideo) {
            backgroundVideo.pause();
        }
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }

    // Toggle Run Draw
    runDrawBtn.addEventListener('click', async function() {
        isRunning = !isRunning;

        if (isRunning) {
            runDrawBtn.textContent = 'Loading...';
            runDrawBtn.classList.add('active');
            drawStatus.textContent = 'Loading elements...';
            drawStatus.style.color = '#FFA500';

            // Load elements from config first
            await loadElementsFromConfig();

            runDrawBtn.textContent = 'Stop Draw';
            drawStatus.textContent = 'Live';
            drawStatus.style.color = '#4CAF50';

            // Send initial state
            console.log('Run Draw: sending initial update');
            await sendUpdate();
        } else {
            runDrawBtn.textContent = 'Run Draw';
            runDrawBtn.classList.remove('active');
            drawStatus.textContent = '';

            // Stop video when stopping draw mode
            stopVideoPlayback();
        }
    });

    // When target changes, reload elements from that target's config
    targetSelect.addEventListener('change', async function() {
        if (isRunning) {
            drawStatus.textContent = 'Loading...';
            drawStatus.style.color = '#FFA500';
            strokes = []; // Clear strokes when switching targets
            await loadElementsFromConfig();
            drawStatus.textContent = 'Live';
            drawStatus.style.color = '#4CAF50';
            sendUpdate();
        }
    });

    // Load Preview button - load elements without starting live draw
    loadPreviewBtn.addEventListener('click', async function() {
        loadPreviewBtn.textContent = 'Loading...';
        drawStatus.textContent = 'Loading elements...';
        drawStatus.style.color = '#FFA500';

        await loadElementsFromConfig();

        loadPreviewBtn.textContent = 'Load Preview';

        if (backgroundVideo) {
            drawStatus.textContent = 'Preview loaded (video playing)';
        } else {
            drawStatus.textContent = 'Preview loaded';
        }
        drawStatus.style.color = '#4CAF50';

        setTimeout(() => {
            if (!isRunning && !backgroundVideo) {
                drawStatus.textContent = '';
            }
        }, 2000);
    });

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        stopVideoPlayback();
    });

    console.log('Draw module initialized');
});
