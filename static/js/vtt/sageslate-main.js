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

    // Set up 5-slot tab system
    setupSageslateTabs(modules);
    setupAutoSendOnChange(modules);
    setupCharacterCard(modules);
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

    // Plain white e-ink background (used by the character card)
    window.sageslateClearBackground = () => {
        currentBackgroundUrl = '';
        previewArea.style.removeProperty('background-image');
        previewArea.style.setProperty('background-color', '#ffffff', 'important');
    };
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

// ── Tab system ────────────────────────────────────────────────────────────────

const SAGESLATE_TAB_PATHS = [
    null, // index 0 unused
    './storage/sageslate_configs/slot_1.json',
    './storage/sageslate_configs/slot_2.json',
    './storage/sageslate_configs/slot_3.json',
    './storage/sageslate_configs/slot_4.json',
    './storage/sageslate_configs/slot_5.json',
];

let sageslateActiveTab = 1;

// Tab N (1-indexed, matches slot_N.json) maps directly to physical Screen(N-1)
function sageslateScreenForTab(tabIndex) {
    return tabIndex - 1;
}

const SAGESLATE_DEFAULT_CONFIG = () => ({
    elements: [],
    image: { src: '', width: 400, height: 300 }
});

function saveTabJson(tabIndex) {
    const jsonInput = document.getElementById('jsonInput');
    const content = jsonInput ? jsonInput.value.trim() : '';
    if (!content) return;
    const path = SAGESLATE_TAB_PATHS[tabIndex];
    fetch(`/json/save?path=${encodeURIComponent(path)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content })
    }).catch(e => console.error('Tab save failed:', e));
}

function loadTabJson(tabIndex, modules) {
    const path = SAGESLATE_TAB_PATHS[tabIndex];
    const jsonInput = document.getElementById('jsonInput');
    const imageDimensions = document.getElementById('imageDimensions');

    fetch(`/json/read?path=${encodeURIComponent(path)}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
            const config = data || SAGESLATE_DEFAULT_CONFIG();
            jsonInput.value = JSON.stringify(config, null, 2);

            const w = config.image?.width || 400;
            const h = config.image?.height || 300;
            modules.previewModule.mapWidth = w;
            modules.previewModule.mapHeight = h;
            modules.previewModule.updatePreviewAreaSize();
            if (imageDimensions) imageDimensions.textContent = `${w} × ${h}`;

            // skipSave=true: this is a reload, not a user edit — must not trigger
            // a save (which would in turn trigger an auto-send to the screen).
            modules.controlsModule.parseJsonAndGenerateControls(true);

            if (config.image?.src && window.sageslateSetBackgroundImage) {
                window.sageslateSetBackgroundImage(config.image.src);
            }
            document.dispatchEvent(new CustomEvent('sageslateTabLoaded', { detail: { config } }));
        })
        .catch(() => {
            // File doesn't exist yet — use empty config
            jsonInput.value = JSON.stringify(SAGESLATE_DEFAULT_CONFIG(), null, 2);
            modules.previewModule.mapWidth = 400;
            modules.previewModule.mapHeight = 300;
            modules.previewModule.updatePreviewAreaSize();
            if (imageDimensions) imageDimensions.textContent = '400 × 300';
            modules.controlsModule.parseJsonAndGenerateControls(true);
            document.dispatchEvent(new CustomEvent('sageslateTabLoaded', { detail: { config: SAGESLATE_DEFAULT_CONFIG() } }));
        });
}

function setupSageslateTabs(modules) {
    const tabs = document.querySelectorAll('.sageslate-tab-btn');
    const storageKey = `sageslate_active_tab:${location.pathname}`;
    const activate = (index) => {
        tabs.forEach(t => t.classList.toggle('active', parseInt(t.dataset.tab) === index));
        sageslateActiveTab = index;
        localStorage.setItem(storageKey, index);
        loadTabJson(index, modules);
    };

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const next = parseInt(tab.dataset.tab);
            if (next === sageslateActiveTab) return;

            saveTabJson(sageslateActiveTab);
            activate(next);
        });
    });

    // Reopen the tab that was open last time
    const saved = parseInt(localStorage.getItem(storageKey), 10);
    activate(SAGESLATE_TAB_PATHS[saved] ? saved : 1);
}

// ── Sageslate-specific features ────────────────────────────────────────────────

/**
 * Set up Sageslate-specific features
 * @private
 */
function setupSageslateSpecifics(modules) {
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
 * Auto-send the composited image to the active tab's screen whenever the
 * design changes (element added/moved/edited/deleted, or background set).
 * Debounced so a burst of edits (e.g. dragging) coalesces into one send.
 * @private
 */
function setupAutoSendOnChange(modules) {
    const AUTO_SEND_DEBOUNCE_MS = 2000;
    let autoSendTimeout = null;

    document.addEventListener('vttConfigSaved', (e) => {
        if (e.detail?.moduleName !== 'Sageslate') return;

        if (autoSendTimeout) clearTimeout(autoSendTimeout);
        autoSendTimeout = setTimeout(() => {
            console.log(`Auto-sending updated design to Screen${sageslateScreenForTab(sageslateActiveTab)}`);
            executeImageGeneration(modules);
        }, AUTO_SEND_DEBOUNCE_MS);
    });
}

// ── Daggerheard character card ─────────────────────────────────────────────────

const DAGGERHEARD_CHAR_DIR = './storage/daggerheard_characters';

/**
 * Fill the character picker from storage/daggerheard_characters and wire the
 * controls on the character page. Each screen tab remembers its character
 * (stored as `character` in the tab's slot JSON), so switching tabs switches
 * the picker, the +/- trackers and the totals to that screen's character.
 * @private
 */
function setupCharacterCard(modules) {
    const select = document.getElementById('characterSelect');
    const button = document.getElementById('showCharacterBtn');
    if (!select || !button) return;

    const totals = document.querySelectorAll('[data-total]');
    let tabConfig = null;   // layout JSON of the active tab
    let charNames = {};     // character path -> name, for matching older layouts

    const readCharacter = (path) => fetch(`/json/read?path=${encodeURIComponent(path)}`).then(r => r.json());

    // The character shown on the active tab: the one saved with the layout, or
    // for layouts made before that was saved, the one whose name is on the card
    const tabCharacterPath = () => {
        if (!tabConfig) return '';
        if (tabConfig.character && tabConfig.character in charNames) return tabConfig.character;
        const nameText = (tabConfig.elements || []).find(el => el.id === 'char_text_0')?.text;
        return Object.keys(charNames).find(path => charNames[path] === nameText) || '';
    };

    const selectTabCharacter = () => {
        select.value = tabCharacterPath();
        if (!select.value) return fillTotals(null);
        readCharacter(select.value).then(fillTotals).catch(() => fillTotals(null));
    };

    fetch(`/api/images/list?path=${encodeURIComponent(DAGGERHEARD_CHAR_DIR)}`)
        .then(r => r.json())
        .then(data => {
            const files = (data.items || []).filter(i => !i.is_dir && i.name.endsWith('.json'));
            select.innerHTML = '<option value="">No character</option>' +
                files.map(f => `<option value="${f.path}">${f.name.replace(/\.json$/, '')}</option>`).join('');
            return Promise.all(files.map(f => readCharacter(f.path)
                .then(c => { charNames[f.path] = c.name; })
                .catch(() => { charNames[f.path] = null; })));
        })
        .then(selectTabCharacter)
        .catch(() => { select.innerHTML = '<option value="">Failed to load characters</option>'; });

    const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
    const setPath = (obj, path, value) => {
        const keys = path.split('.');
        const last = keys.pop();
        keys.reduce((o, k) => (o[k] = o[k] || {}), obj)[last] = value;
    };

    const fillTotals = (character) => {
        totals.forEach(input => {
            const value = character ? getPath(character, input.dataset.total) : undefined;
            input.value = value ?? '';
            input.disabled = !character;
        });
    };

    const showCharacter = (character, path) => {
        const config = buildDaggerheardCardConfig(character);
        config.character = path;
        tabConfig = config;
        charNames[path] = character.name;
        document.getElementById('jsonInput').value = JSON.stringify(config, null, 2);
        if (window.sageslateClearBackground) window.sageslateClearBackground();
        modules.controlsModule.parseJsonAndGenerateControls(true);
        saveTabJson(sageslateActiveTab);
        fillTotals(character);
    };

    // Switching tabs: pick up that screen's character
    document.addEventListener('sageslateTabLoaded', (e) => {
        tabConfig = e.detail.config;
        selectTabCharacter();
    });

    select.addEventListener('change', () => {
        if (!select.value) return fillTotals(null);
        readCharacter(select.value).then(fillTotals).catch(() => fillTotals(null));
    });

    button.addEventListener('click', () => {
        const path = select.value;
        if (!path) return;
        readCharacter(path)
            .then(character => {
                showCharacter(character, path);
                executeImageGeneration(modules);
            })
            .catch(e => console.error('Failed to load character:', e));
    });

    // Tracker and totals edits save the character file, redraw this tab's
    // card and send once the clicking/typing stops.
    const SEND_DEBOUNCE_MS = 1500;
    let sendTimeout = null;
    let pending = Promise.resolve();

    const updateCharacter = (mutate) => {
        const path = select.value;
        if (!path) return;
        // Chain edits so rapid changes don't overwrite each other's saves
        pending = pending.then(() => readCharacter(path)
            .then(character => {
                mutate(character);
                showCharacter(character, path);
                if (sendTimeout) clearTimeout(sendTimeout);
                sendTimeout = setTimeout(() => executeImageGeneration(modules), SEND_DEBOUNCE_MS);
                return fetch('/json/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path, content: JSON.stringify(character, null, 2) })
                });
            })
            .catch(e => console.error('Failed to update character:', e)));
    };

    document.querySelectorAll('[data-tracker]').forEach(btn => {
        btn.addEventListener('click', () => {
            const delta = parseInt(btn.dataset.delta, 10);
            updateCharacter(c => adjustDaggerheardTracker(c, btn.dataset.tracker, delta));
        });
    });

    totals.forEach(input => {
        input.disabled = true;
        input.addEventListener('change', () => {
            const value = parseInt(input.value, 10);
            if (Number.isNaN(value)) return;
            updateCharacter(c => {
                setPath(c, input.dataset.total, Math.max(0, value));
                // Shrinking a total can't leave more slots marked than exist
                adjustDaggerheardTracker(c, 'hp', 0);
                adjustDaggerheardTracker(c, 'stress', 0);
                adjustDaggerheardTracker(c, 'armor', 0);
            });
        });
    });
}

/**
 * Move a tracker's filled slots by `delta`, clamped to 0..max. Matches what
 * buildDaggerheardCardConfig draws as filled for each tracker.
 * @private
 */
function adjustDaggerheardTracker(c, key, delta) {
    const clamp = (n, max) => Math.max(0, Math.min(max, n));
    if (key === 'armor') {
        c.armor = c.armor || {};
        c.armor.marked = clamp((c.armor.marked || 0) + delta, c.armor.score || 0);
    } else {
        c[key] = c[key] || {};
        c[key].marked = clamp((c[key].marked || 0) + delta, c[key].max || 0);
    }
}

/**
 * Lay out a Daggerheard character JSON as black-on-white Sageslate elements
 * sized for the 400x300 e-ink screens.
 * @private
 */
function buildDaggerheardCardConfig(c) {
    const W = 400, PAD = 8;
    const elements = [];
    const text = (x, y, value, size, alignment = 'left') => elements.push({
        type: 'text', x, y, size, text: String(value), color: '#000000',
        font: 'Arial', alignment
    });
    const box = (x, y, width, height, black) => elements.push({
        type: 'box', x, y, width, height, grayscale: black ? 100 : 0, transparency: 0
    });
    const rule = (y) => box(PAD, y, W - 2 * PAD, 2, true);
    const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

    // A row of slots: filled squares for the first `filled`, outlined for the rest
    const slots = (y, label, max, filled) => {
        text(PAD, y, label, 16);
        for (let i = 0; i < max; i++) {
            const x = 80 + i * 24;
            box(x, y, 18, 18, true);
            if (i >= filled) box(x + 2, y + 2, 14, 14, false);
        }
        text(W - PAD, y, `${filled}/${max}`, 16, 'right');
    };

    // Header
    text(PAD, 6, c.name || 'Unnamed', 26);
    if (c.level !== undefined) text(W - PAD, 6, `Lvl ${c.level}`, 26, 'right');
    text(PAD, 38, [c.class, c.subclass, c.ancestry, c.community].filter(Boolean).join(' · '), 15);
    rule(58);

    // Defences
    const armor = c.armor || {};
    const thresholds = c.thresholds || {};
    [
        ['Evasion', c.evasion],
        ['Armor', armor.score],
        ['Major / Severe', thresholds.major !== undefined && `${thresholds.major} / ${thresholds.severe}`],
        ['Proficiency', c.proficiency],
    ].forEach(([label, value], i) => {
        const x = PAD + i * 98;
        text(x, 64, label, 12);
        text(x, 80, value === undefined || value === false ? '-' : value, 24);
    });
    rule(112);

    // Trackers (filled slots are marked)
    const hp = c.hp || {}, stress = c.stress || {};
    slots(122, 'HP', hp.max || 0, hp.marked || 0);
    slots(152, 'Stress', stress.max || 0, stress.marked || 0);
    slots(182, 'Armor', armor.score || 0, armor.marked || 0);
    rule(218);

    // Traits: two rows of three
    Object.entries(c.traits || {}).slice(0, 6).forEach(([name, value], i) => {
        const x = PAD + (i % 3) * 130;
        const y = 226 + Math.floor(i / 3) * 24;
        text(x, y, `${name.slice(0, 3).toUpperCase()} ${signed(value)}`, 18);
    });

    // Primary weapon
    const w = c.weapon;
    if (w) text(PAD, 278, [w.name, w.trait, w.range, w.damage].filter(Boolean).join(' · '), 15);

    elements.forEach((el, i) => {
        el.id = `char_${el.type}_${i}`;
        el.hiddenProperties = ['x', 'y'];
        el.collapsed = true;
    });

    return { elements, image: { src: '', width: 400, height: 300 } };
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
                const deviceId = sageslateScreenForTab(sageslateActiveTab);
                sendImage(filePath, String(deviceId));

                // Update JSON with device selection
                try {
                    jsonData.image = jsonData.image || {};
                    jsonData.image.device = String(deviceId);
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
 * Set the currently selected media as the background image, optionally
 * clearing all other elements on the active screen's tab (per the
 * "Clear other elements" checkbox).
 * This is called from the media viewer "Set as Background" button
 */
window.setAsBackground = function() {
    const path = (typeof currentMediaPath !== 'undefined' && currentMediaPath)
        ? currentMediaPath
        : document.getElementById('current-path')?.value;

    if (!path) {
        alert('No image selected. Please select an image from the file explorer first.');
        return;
    }

    const clearElementsCheckbox = document.getElementById('clear-elements-on-bg');
    const shouldClearElements = clearElementsCheckbox ? clearElementsCheckbox.checked : false;

    // Update "src" in the JSON, optionally clearing every other element
    const jsonInput = document.getElementById('jsonInput');
    if (jsonInput) {
        try {
            const jsonData = JSON.parse(jsonInput.value || '{"elements":[]}');
            if (!jsonData.image) jsonData.image = { width: 400, height: 300 };
            jsonData.image.src = path;
            if (shouldClearElements) {
                jsonData.elements = [];
            }
            jsonInput.value = JSON.stringify(jsonData, null, 2);
            console.log('✓ JSON image.src updated to:', path, shouldClearElements ? '— elements cleared' : '');
        } catch (e) {
            console.error('Failed to update JSON with background path:', e);
        }
    }

    // Apply background visually (also updates dimensions in JSON after image loads)
    if (window.sageslateSetBackgroundImage) {
        window.sageslateSetBackgroundImage(path);
    }

    // Re-render controls and persist as a real user edit, so it flows through
    // the normal save -> auto-send pipeline.
    if (window.sageslateControlsModule) {
        window.sageslateControlsModule.parseJsonAndGenerateControls();
    }

    const pathResult = document.getElementById('path-result');
    if (pathResult) {
        pathResult.style.display = 'block';
        pathResult.innerHTML = shouldClearElements
            ? '<p style="color: green;">✓ Background set, other elements cleared!</p>'
            : '<p style="color: green;">✓ Background image set!</p>';
        setTimeout(() => { pathResult.style.display = 'none'; }, 3000);
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
