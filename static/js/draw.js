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

    // Config screen dimensions — used as the coordinate reference for all elements.
    // Kept in sync with the loaded config so the canvas scale matches the display engine.
    let configScreenWidth  = 1920;
    let configScreenHeight = 1080;

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

            // Sync coordinate reference to this config's screen dimensions so element
            // positions scale correctly onto the 1920×1080 canvas.
            configScreenWidth  = config.screen?.width  || 1920;
            configScreenHeight = config.screen?.height || 1080;

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
            const MEDIA_TYPES = ['image', 'gif', 'svg'];
            const SHAPE_TYPES = ['token', 'area', 'text', 'line', 'cone'];
            if (config.elements && Array.isArray(config.elements)) {
                for (const element of config.elements) {
                    if (MEDIA_TYPES.includes(element.type) && element.src) {
                        await loadElementImage(element);
                    } else if (SHAPE_TYPES.includes(element.type)) {
                        loadedElements.push({ image: null, element });
                    }
                    // video: not renderable on a 2D canvas without frame extraction
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

    // Parse percentage, relative float (0.0–1.0), or absolute pixel value.
    // Matches the display engine's parse_dimension() and the VTT preview's parseCoordValue().
    function parseValue(value, maxValue) {
        if (typeof value === 'string' && value.endsWith('%')) {
            return (parseFloat(value) / 100) * maxValue;
        }
        const num = parseFloat(value);
        if (isNaN(num)) return 0;
        // Non-integer float strictly between 0 and 1 → relative fraction of maxValue
        if (num > 0 && num < 1 && !Number.isInteger(num)) {
            return num * maxValue;
        }
        return num;
    }

    // Draw loaded elements onto canvas
    function drawElements() {
        // Scale factors: map from config screen coordinate space → canvas pixel space.
        // When config screen dimensions equal the canvas size (1920×1080) these are 1.0.
        // For other screen sizes elements are proportionally scaled so they land at the
        // same relative position as they do on the actual display.
        const scaleX = canvas.width  / configScreenWidth;
        const scaleY = canvas.height / configScreenHeight;

        // Draw background video frame first (if video)
        if (backgroundVideo && !backgroundVideo.paused) {
            ctx.drawImage(backgroundVideo, 0, 0, canvas.width, canvas.height);
        }
        // Draw background image (if image)
        else if (backgroundImage) {
            ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
        }

        // Draw each element dispatched by type
        for (const { image, element } of loadedElements) {
            const opacity = (element.opacity ?? 100) / 100;
            ctx.save();
            ctx.globalAlpha = opacity;

            switch (element.type) {

                case 'image':
                case 'gif':
                case 'svg': {
                    if (!image) break;
                    const x = parseValue(element.x, configScreenWidth)  * scaleX;
                    const y = parseValue(element.y, configScreenHeight) * scaleY;
                    const w = parseValue(element.width,  configScreenWidth)  * scaleX;
                    const h = parseValue(element.height, configScreenHeight) * scaleY;
                    const rot = (element.rotation || 0) * Math.PI / 180;
                    if (rot !== 0) {
                        ctx.translate(x + w / 2, y + h / 2);
                        ctx.rotate(rot);
                        ctx.drawImage(image, -w / 2, -h / 2, w, h);
                    } else {
                        ctx.drawImage(image, x, y, w, h);
                    }
                    break;
                }

                case 'token': {
                    const cx = parseValue(element.x, configScreenWidth)  * scaleX;
                    const cy = parseValue(element.y, configScreenHeight) * scaleY;
                    const r  = parseValue(element.size ?? 50, Math.min(configScreenWidth, configScreenHeight))
                               * Math.min(scaleX, scaleY) / 2;
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.fillStyle = element.color || '#3498db';
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    if (element.label) {
                        ctx.fillStyle = '#ffffff';
                        ctx.font = `bold ${Math.max(10, Math.floor(r * 0.6))}px Arial`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(element.label, cx, cy);
                    }
                    break;
                }

                case 'area': {
                    const x = parseValue(element.x, configScreenWidth)  * scaleX;
                    const y = parseValue(element.y, configScreenHeight) * scaleY;
                    const w = parseValue(element.width,  configScreenWidth)  * scaleX;
                    const h = parseValue(element.height, configScreenHeight) * scaleY;
                    const rotation = element.rotation || 0;

                    // Resolve fill color, honouring the separate alpha property (0-100)
                    const alpha = element.alpha !== undefined ? element.alpha / 100 : 0.3;
                    let baseColor = element.color || '#2ecc71';
                    let fillColor;
                    if (baseColor.startsWith('#') && baseColor.length >= 7) {
                        const r2 = parseInt(baseColor.slice(1, 3), 16);
                        const g2 = parseInt(baseColor.slice(3, 5), 16);
                        const b2 = parseInt(baseColor.slice(5, 7), 16);
                        fillColor = `rgba(${r2},${g2},${b2},${alpha})`;
                    } else {
                        fillColor = baseColor;
                    }

                    ctx.save();
                    if (rotation !== 0) {
                        ctx.translate(x + w / 2, y + h / 2);
                        ctx.rotate(rotation * Math.PI / 180);
                        ctx.translate(-(x + w / 2), -(y + h / 2));
                    }
                    ctx.fillStyle = fillColor;
                    ctx.fillRect(x, y, w, h);
                    ctx.strokeStyle = baseColor;
                    ctx.globalAlpha = opacity * 0.8;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x, y, w, h);
                    ctx.globalAlpha = opacity;
                    if (element.label) {
                        ctx.fillStyle = '#ffffff';
                        ctx.font = 'bold 13px Arial';
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'top';
                        ctx.fillText(element.label, x + 4, y + 4);
                    }
                    ctx.restore();
                    break;
                }

                case 'text': {
                    const x = parseValue(element.x, configScreenWidth)  * scaleX;
                    const y = parseValue(element.y, configScreenHeight) * scaleY;
                    ctx.fillStyle = element.color || '#ffffff';
                    ctx.font = `${element.size || 24}px ${element.font || 'Arial'}`;
                    ctx.textAlign = element.alignment || 'left';
                    ctx.textBaseline = 'top';
                    ctx.fillText(element.text || '', x, y);
                    break;
                }

                case 'line': {
                    const x1 = parseValue(element.x,    configScreenWidth)  * scaleX;
                    const y1 = parseValue(element.y,    configScreenHeight) * scaleY;
                    const x2 = parseValue(element.endX, configScreenWidth)  * scaleX;
                    const y2 = parseValue(element.endY, configScreenHeight) * scaleY;
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.strokeStyle = element.color || '#ff0000';
                    ctx.lineWidth = (element.thickness || 3) * Math.min(scaleX, scaleY);
                    ctx.lineCap = 'round';
                    ctx.stroke();
                    break;
                }

                case 'cone': {
                    const cx     = parseValue(element.x, configScreenWidth)  * scaleX;
                    const cy     = parseValue(element.y, configScreenHeight) * scaleY;
                    const radius = parseValue(element.radius || 150, configScreenWidth) * scaleX;
                    const halfAng = ((element.angle || 90) / 2) * Math.PI / 180;
                    // direction 0 = up, increases clockwise — match display engine convention
                    const dir = ((element.direction || 0) - 90) * Math.PI / 180;

                    // Resolve fill colour, honouring the separate alpha property (0-100)
                    const coneAlpha = element.alpha !== undefined ? element.alpha / 100 : 0.5;
                    let coneFill = element.color || '#ffa500';
                    if (coneFill.startsWith('#') && coneFill.length >= 7) {
                        const r2 = parseInt(coneFill.slice(1, 3), 16);
                        const g2 = parseInt(coneFill.slice(3, 5), 16);
                        const b2 = parseInt(coneFill.slice(5, 7), 16);
                        coneFill = `rgba(${r2},${g2},${b2},${coneAlpha})`;
                    }

                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.arc(cx, cy, radius, dir - halfAng, dir + halfAng);
                    ctx.closePath();
                    ctx.fillStyle = coneFill;
                    ctx.fill();
                    if (element.borderColor) {
                        ctx.strokeStyle = element.borderColor;
                        ctx.lineWidth = 2;
                        ctx.stroke();
                    }
                    break;
                }

                default:
                    break;
            }

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
    clearBtn.addEventListener('click', async function() {
        strokes = [];
        uploadedImagePath = null;
        // Remove the overlay from the in-memory element list so redrawCanvas doesn't
        // repaint the old overlay image on top of the now-empty canvas.
        loadedElements = loadedElements.filter(({ element }) => element.id !== 'draw_overlay');
        redrawCanvas();

        // Remove the draw_overlay element from the config — works whether draw is running or not
        const target = targetSelect.value;
        const configPath = target === 'display'
            ? './storage/scrying_glasses/display.json'
            : './storage/scrying_glasses/battlemap.json';

        try {
            const readResponse = await fetch(`/json/read?path=${encodeURIComponent(configPath)}`);
            if (!readResponse.ok) return;
            const config = await readResponse.json();
            if (!config || !Array.isArray(config.elements)) return;

            const before = config.elements.length;
            config.elements = config.elements.filter(el => el.id !== 'draw_overlay');
            if (config.elements.length === before) return; // nothing was there

            await fetch('/json/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: configPath, content: JSON.stringify(config, null, 2) })
            });

            const refreshTarget = target === 'display' ? 'display' : 'vtt';
            await fetch('/api/refresh/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target: refreshTarget, source: 'draw_clear' })
            });
        } catch (error) {
            console.error('Error clearing overlay:', error);
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
                    opacity: 100,
                    locked: true
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

    // WebSocket refresh listener — keeps the canvas in sync with external config changes
    // (e.g. tokens moved in the VTT editor, background swapped, elements added/removed)
    function setupRefreshListener() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${location.host}/ws`);

        ws.onopen = () => {
            console.log('Draw: WebSocket connected for refresh listener');
        };

        ws.onmessage = (event) => {
            let data;
            try {
                data = JSON.parse(event.data);
            } catch {
                return;
            }

            // Map the current target selection to the refresh target string
            const currentRefreshTarget = targetSelect.value === 'display' ? 'display' : 'vtt';

            if (data.type === 'refresh' && data.target === currentRefreshTarget) {
                // Ignore refreshes triggered by the draw page itself — they don't change the
                // background/elements, only the overlay, so reloading would be a no-op that
                // briefly clears the preview.
                if (data.source === 'draw_tab' || data.source === 'draw_clear') {
                    return;
                }

                console.log(`Draw: refresh received for ${currentRefreshTarget} (source: ${data.source}), reloading elements`);

                // Reload elements from config (strokes are preserved; only loadedElements
                // and backgroundImage are reset by loadElementsFromConfig)
                loadElementsFromConfig().then(() => {
                    if (isRunning) {
                        drawStatus.textContent = 'Live';
                        drawStatus.style.color = '#4CAF50';
                    }
                });
            }
        };

        ws.onclose = () => {
            console.warn('Draw: WebSocket closed, reconnecting in 2s...');
            setTimeout(setupRefreshListener, 2000);
        };

        ws.onerror = (err) => {
            console.error('Draw: WebSocket error:', err);
        };
    }

    setupRefreshListener();

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        stopVideoPlayback();
    });

    console.log('Draw module initialized');
});
