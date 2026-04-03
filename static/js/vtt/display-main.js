/**
 * Display Main - Entry point for the Display VTT tool
 *
 * This file initializes the display VTT interface using the unified
 * VTT initializer system. It shares the same modules as the VTT tab
 * but uses different configuration and element IDs.
 *
 * @requires vtt-initializer.js
 * @requires vtt-controls-module.js
 * @requires vtt-preview-module.js
 * @requires vtt-draggable-module.js
 */

document.addEventListener('DOMContentLoaded', function() {
    // Display Configuration
    const config = {
        basePath: './storage/display_configs',
        defaultMapWidth: 1920,
        defaultMapHeight: 1080,
        maxPreviewWidth: 1200,
        maxPreviewHeight: 800,
        defaultConfig: './storage/scrying_glasses/display.json',
        defaultFilename: 'display.json',
        moduleName: 'Display',
        storageKey: 'display_preview_scale'
    };

    // Element IDs for Display tab (with "2" suffix)
    const elementIds = {
        jsonInput: 'jsonInput2',
        parseButton: 'parseButton2',
        jsonError: 'jsonError2',
        controlsArea: 'controlsArea2',
        previewArea: 'previewArea2',
        imagePath: 'imagePath2',
        usePathBtn: 'usePathBtn2',
        hideEffectsBtn: 'hideEffects2',
        showEffectsBtn: 'showEffects2',
        imageDimensions: 'imageDimensions2',
        fileBrowser: 'fileBrowser2',
        saveFilename: 'saveFilename2',
        saveFileBtn: 'saveFileBtn2',
        previewScaleSlider: 'previewScaleSlider2',
        previewScaleDisplay: 'previewScaleDisplay2',
        resetScaleBtn: 'resetScaleBtn2',
        minimizeScaleBtn: 'minimizeScaleBtn2',
        previewScalePanel: 'previewScalePanel2',
        previewScaleContent: 'previewScaleContent2',
        collapseAllBtn: 'collapseAllBtn2',
        addFogBtn: 'addFogBtn2',
        resetFogBtn: 'resetFogBtn2',
        removeFogBtn: 'removeFogBtn2',
        addButtons: {
            token: 'addTokenBtn2',
            area: 'addAreaBtn2',
            text: 'addTextBtn2',
            line: 'addLineBtn2',
            cone: 'addConeBtn2',
            bar: 'addBarBtn2'
        }
    };

    // Initialize Display VTT
    const modules = initializeVTT(config, elementIds);

    console.log('Display VTT initialized successfully', modules);
});
