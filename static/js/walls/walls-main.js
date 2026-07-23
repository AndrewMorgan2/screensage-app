/**
 * Walls page.
 *
 * Fully standalone - does not use any of static/js/vtt/*.js. Lets the GM pick
 * any saved battlemap config (via the file browser, rooted at ./storage) and
 * draw wall segments on top of it. Every change autosaves immediately into
 * whichever file is currently loaded.
 *
 * Walls only take effect on the live display when they're drawn into
 * ACTIVE_BATTLEMAP_PATH specifically - that's the one file ScryingGlass's
 * Battlemap display actually reads. Editing any other file is still useful
 * (e.g. preparing a map ahead of time) but won't show up live until that
 * file becomes the active battlemap - the page makes this explicit via
 * wallsActiveIndicator so it's never ambiguous which case you're in.
 *
 * Wall segments are stored in the config's `walls` array as coordinates
 * given as fractions (0-1) of the map image, so they stay correct regardless
 * of how large the image is rendered:
 *
 *   jsonData.walls = [
 *     { id, x1, y1, x2, y2, color }
 *   ]
 */
(function () {
    const SNAP_PX = 14;
    const HIT_PX = 8;
    const CONFIG_ROOT = './storage'; // upper bound for the "Up" link - browser can still navigate here and beyond
    const DEFAULT_DIR = './storage/vtt_configs'; // where the file browser opens by default
    const ACTIVE_BATTLEMAP_PATH = './storage/scrying_glasses/battlemap.json';
    const DEFAULT_COLOR = '#c0392b';
    const VIDEO_EXTENSIONS = ['.webm', '.mp4', '.avi', '.mov', '.mkv'];

    let currentPath = null;
    let jsonData = null;
    let walls = [];

    let mode = 'off'; // 'off' | 'wall' | 'select'
    let chainStart = null;
    let hover = null;
    let selectedId = null;
    let drawColor = DEFAULT_COLOR;

    let previewBox, canvas, ctx, bgMedia;

    document.addEventListener('DOMContentLoaded', () => {
        previewBox = document.getElementById('wallsPreviewBox');
        wireToolbar();
        wireKeyboard();
        loadFileBrowser(DEFAULT_DIR);
        loadConfig(ACTIVE_BATTLEMAP_PATH); // convenient default - most edits target this one
        updateStatus();
    });

    // -- file browser -------------------------------------------------------

    function loadFileBrowser(path) {
        const browser = document.getElementById('wallsFileBrowser');
        browser.innerHTML = '<p>Loading files...</p>';

        fetch(`/api/images/list?path=${encodeURIComponent(path)}`)
            .then(r => {
                if (!r.ok) throw new Error(`Failed to list files: ${r.status}`);
                return r.json();
            })
            .then(data => {
                browser.innerHTML = '';

                if (path !== CONFIG_ROOT) {
                    const up = document.createElement('div');
                    up.className = 'folder-item';
                    up.innerHTML = '<i>..</i> <span>Up</span>';
                    up.addEventListener('click', () => {
                        const parent = path.substring(0, path.lastIndexOf('/')) || CONFIG_ROOT;
                        loadFileBrowser(parent);
                    });
                    browser.appendChild(up);
                }

                data.items.forEach(item => {
                    const el = document.createElement('div');
                    el.className = 'folder-item';
                    if (item.is_dir) {
                        el.innerHTML = `<i>📁</i> <span>${item.name}</span>`;
                        el.addEventListener('click', () => loadFileBrowser(item.path));
                    } else if (item.name.endsWith('.json')) {
                        el.innerHTML = `<i>🗎</i> <span>${item.name}</span>`;
                        el.addEventListener('click', () => loadConfig(item.path));
                    } else {
                        return;
                    }
                    browser.appendChild(el);
                });

                if (browser.children.length === 0) {
                    browser.innerHTML = '<p>No JSON files found</p>';
                }
            })
            .catch(err => {
                browser.innerHTML = `<p class="error">Error: ${err.message}</p>`;
            });
    }

    function loadConfig(path) {
        fetch(`/json/read?path=${encodeURIComponent(path)}`)
            .then(r => {
                if (!r.ok) throw new Error(`Failed to load: ${r.status}`);
                return r.json();
            })
            .then(data => {
                currentPath = path;
                jsonData = data;
                walls = Array.isArray(jsonData.walls) ? jsonData.walls : [];
                selectedId = null;
                chainStart = null;
                updateActiveIndicator();
                renderBackground();
            })
            .catch(err => {
                alert(`Could not load ${path}: ${err.message}`);
            });
    }

    function updateActiveIndicator() {
        document.getElementById('wallsCurrentFile').textContent = currentPath || 'No map loaded';

        const indicator = document.getElementById('wallsActiveIndicator');
        if (!indicator) return;
        if (currentPath === ACTIVE_BATTLEMAP_PATH) {
            indicator.textContent = '● LIVE — this is the active battlemap';
            indicator.className = 'walls-active-indicator is-live';
        } else {
            indicator.textContent = '○ Template — won\'t appear live until it\'s the active battlemap';
            indicator.className = 'walls-active-indicator is-template';
        }
    }

    // -- background + canvas -------------------------------------------------

    function renderBackground() {
        previewBox.innerHTML = '';
        previewBox.style.width = '';
        previewBox.style.height = '';
        canvas = null;
        ctx = null;

        const src = jsonData && jsonData.background && jsonData.background.src;
        if (!src) {
            const hint = document.createElement('p');
            hint.className = 'walls-empty-hint';
            hint.textContent = 'This map config has no background image set.';
            previewBox.appendChild(hint);
            updateStatus();
            return;
        }

        // The screen's own dimensions are the coordinate frame walls are authored
        // in - same reference used to decide whether portrait art gets rotated.
        const screenConfig = jsonData.screen || {};
        const mapWidth = screenConfig.width || 1920;
        const mapHeight = screenConfig.height || 1080;
        const backgroundConfig = jsonData.background || {};

        const isVideo = VIDEO_EXTENSIONS.some(ext => src.toLowerCase().endsWith(ext));
        const mediaUrl = `/api/images/view?path=${encodeURIComponent(src)}`;

        if (isVideo) {
            bgMedia = document.createElement('video');
            bgMedia.src = mediaUrl;
            bgMedia.autoplay = true;
            bgMedia.loop = true;
            bgMedia.muted = true;
            bgMedia.playsInline = true;
        } else {
            bgMedia = document.createElement('img');
            bgMedia.src = mediaUrl;
        }
        bgMedia.className = 'walls-bg-image';
        previewBox.appendChild(bgMedia);

        canvas = document.createElement('canvas');
        canvas.id = 'wallsCanvas';
        canvas.style.pointerEvents = mode === 'off' ? 'none' : 'auto';
        previewBox.appendChild(canvas);
        ctx = canvas.getContext('2d');

        wireCanvasEvents();

        const applyLayout = () => layoutBackground(mapWidth, mapHeight, backgroundConfig, isVideo);
        // Images report their size on 'load'; videos only know their size once
        // 'loadedmetadata' fires (readyState-dependent, so it may happen before
        // or after this listener is attached - re-check on canplay too, cheap).
        bgMedia.addEventListener(isVideo ? 'loadedmetadata' : 'load', applyLayout);
        if (isVideo) bgMedia.addEventListener('canplay', applyLayout);
        window.addEventListener('resize', applyLayout);
        new ResizeObserver(applyLayout).observe(previewBox.parentElement);
    }

    /**
     * Mirrors display_engine_pyglet.py's portrait-media auto-rotation exactly:
     * the live engine always measures the actual media file (pyglet.image.load()
     * / source.video_format) and rotates unconditionally if it's portrait - it
     * never reads background.width/height from the config, and there's no
     * forceLandscape check anywhere in it (that flag only exists in the
     * separate, JS-only vtt-preview-module.js approximation - not touched here).
     * So this must prioritize the *measured* media dimensions the same way:
     * config width/height is only a placeholder for before the media has
     * loaded, not a trusted source of truth - it can be stale (e.g. left over
     * from a previous background that occupied this slot), and trusting it
     * over the real dimensions produces exactly the wrong rotation decision.
     */
    function layoutBackground(mapWidth, mapHeight, backgroundConfig, isVideo) {
        if (!bgMedia || !canvas) return;

        const mediaW = isVideo ? bgMedia.videoWidth : bgMedia.naturalWidth;
        const mediaH = isVideo ? bgMedia.videoHeight : bgMedia.naturalHeight;
        const naturalW = mediaW || backgroundConfig.width || mapWidth;
        const naturalH = mediaH || backgroundConfig.height || mapHeight;
        const rotate = naturalH > naturalW;

        const availW = previewBox.parentElement.clientWidth;
        const availH = window.innerHeight * 0.78;
        const scale = Math.min(availW / mapWidth, availH / mapHeight);
        if (!isFinite(scale) || scale <= 0) return;
        const boxW = Math.round(mapWidth * scale);
        const boxH = Math.round(mapHeight * scale);

        previewBox.style.width = `${boxW}px`;
        previewBox.style.height = `${boxH}px`;

        bgMedia.style.position = 'absolute';
        bgMedia.style.objectFit = 'contain';
        if (rotate) {
            bgMedia.style.top = '50%';
            bgMedia.style.left = '50%';
            bgMedia.style.width = `${boxH}px`;
            bgMedia.style.height = `${boxW}px`;
            bgMedia.style.transform = 'translate(-50%, -50%) rotate(90deg)';
        } else {
            bgMedia.style.top = '0';
            bgMedia.style.left = '0';
            bgMedia.style.width = `${boxW}px`;
            bgMedia.style.height = `${boxH}px`;
            bgMedia.style.transform = '';
        }

        canvas.width = boxW;
        canvas.height = boxH;
        render();
    }

    // -- geometry -------------------------------------------------------------

    function fractionFromEvent(e) {
        const rect = canvas.getBoundingClientRect();
        let x = (e.clientX - rect.left) / rect.width;
        let y = (e.clientY - rect.top) / rect.height;
        return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
    }

    function toPx(pt) {
        return { x: pt.x * canvas.width, y: pt.y * canvas.height };
    }

    function snapPoint(pt) {
        const px = toPx(pt);
        let best = null;
        let bestDist = SNAP_PX;
        for (const w of walls) {
            for (const cand of [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }]) {
                const cpx = toPx(cand);
                const d = Math.hypot(cpx.x - px.x, cpx.y - px.y);
                if (d < bestDist) { bestDist = d; best = cand; }
            }
        }
        return best || pt;
    }

    function distToSegmentPx(p, a, b) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const lenSq = dx * dx + dy * dy;
        let t = lenSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
        t = Math.min(1, Math.max(0, t));
        return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    }

    function findWallAt(pt) {
        const px = toPx(pt);
        let best = null, bestDist = HIT_PX;
        for (const w of walls) {
            const d = distToSegmentPx(px, toPx({ x: w.x1, y: w.y1 }), toPx({ x: w.x2, y: w.y2 }));
            if (d < bestDist) { bestDist = d; best = w; }
        }
        return best;
    }

    // -- interaction ------------------------------------------------------------

    function wireCanvasEvents() {
        canvas.addEventListener('mousemove', (e) => {
            hover = fractionFromEvent(e);
            if (mode === 'wall') hover = snapPoint(hover);
            render();
        });

        canvas.addEventListener('click', (e) => {
            const pt = fractionFromEvent(e);

            if (mode === 'wall') {
                const snapped = snapPoint(pt);
                if (!chainStart) {
                    chainStart = snapped;
                } else {
                    walls.push({
                        id: 'wall_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
                        x1: chainStart.x, y1: chainStart.y,
                        x2: snapped.x, y2: snapped.y,
                        color: drawColor
                    });
                    chainStart = snapped;
                    persist();
                }
                render();
            } else if (mode === 'select') {
                const hit = findWallAt(pt);
                selectedId = hit ? hit.id : null;
                const colorPicker = document.getElementById('wallColorPicker');
                if (hit && colorPicker) colorPicker.value = hit.color || DEFAULT_COLOR;
                render();
            }
        });

        canvas.addEventListener('dblclick', () => { chainStart = null; render(); });
    }

    function wireToolbar() {
        const modeBtns = {
            wall: document.getElementById('wallDrawModeBtn'),
            select: document.getElementById('wallSelectModeBtn')
        };

        const setMode = (next) => {
            mode = (mode === next) ? 'off' : next;
            chainStart = null;
            if (canvas) canvas.style.pointerEvents = mode === 'off' ? 'none' : 'auto';
            Object.entries(modeBtns).forEach(([key, btn]) => {
                if (btn) btn.classList.toggle('active', mode === key);
            });
            render();
        };

        if (modeBtns.wall) modeBtns.wall.addEventListener('click', () => setMode('wall'));
        if (modeBtns.select) modeBtns.select.addEventListener('click', () => setMode('select'));

        document.getElementById('wallDeleteSelectedBtn').addEventListener('click', () => {
            if (!selectedId) return;
            walls = walls.filter(w => w.id !== selectedId);
            selectedId = null;
            persist();
            render();
        });

        document.getElementById('wallClearAllBtn').addEventListener('click', () => {
            if (walls.length === 0) return;
            if (!confirm('Delete all walls on this map?')) return;
            walls = [];
            selectedId = null;
            persist();
            render();
        });

        const colorPicker = document.getElementById('wallColorPicker');
        if (colorPicker) {
            drawColor = colorPicker.value || DEFAULT_COLOR;
            colorPicker.addEventListener('input', () => {
                drawColor = colorPicker.value;
                const selected = walls.find(w => w.id === selectedId);
                if (selected) {
                    selected.color = drawColor;
                    persist();
                    render();
                }
            });
        }
    }

    function wireKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                chainStart = null;
                render();
            } else if ((e.key === 'Delete' || e.key === 'Backspace') && mode === 'select' && selectedId) {
                if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
                walls = walls.filter(w => w.id !== selectedId);
                selectedId = null;
                persist();
                render();
            }
        });
    }

    function persist() {
        if (!currentPath || !jsonData) return;
        jsonData.walls = walls;

        fetch('/json/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: currentPath, content: JSON.stringify(jsonData, null, 2) })
        })
            .then(r => {
                if (!r.ok) throw new Error(`Failed to save: ${r.status}`);
            })
            .catch(err => console.error('Error saving walls:', err));
    }

    // -- rendering ----------------------------------------------------------

    function updateStatus() {
        const status = document.getElementById('wallStatus');
        if (!status) return;

        if (!currentPath) {
            status.textContent = 'Loading the active battlemap...';
            return;
        }

        const counts = `${walls.length} wall segment(s).`;
        const hints = {
            off: 'Choose a tool above to start authoring walls.',
            wall: 'Click points to place connected wall segments. Click near an existing endpoint to snap. Escape / double-click to end the chain.',
            select: 'Click a wall to select it, then delete it (or recolor it) - delete a segment to open a gap like a door.'
        };
        status.textContent = `${hints[mode]} (${counts})`;
    }

    function render() {
        if (!canvas || !ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (const w of walls) {
            const a = toPx({ x: w.x1, y: w.y1 });
            const b = toPx({ x: w.x2, y: w.y2 });
            const selected = w.id === selectedId;

            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.setLineDash([]);
            ctx.strokeStyle = w.color || DEFAULT_COLOR;
            ctx.lineWidth = selected ? 5 : 3;
            ctx.stroke();

            if (selected) {
                ctx.setLineDash([]);
                ctx.strokeStyle = '#00e5ff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        }
        ctx.setLineDash([]);

        if (chainStart && mode === 'wall' && hover) {
            const a = toPx(chainStart);
            const b = toPx(hover);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.setLineDash([6, 6]);
            ctx.strokeStyle = drawColor;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.7;
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.setLineDash([]);
        }

        updateStatus();
    }
})();
