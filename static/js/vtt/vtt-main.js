/**
 * VTT Main - Entry point for the VTT (Virtual Tabletop) tool
 *
 * This file initializes the battlemap VTT interface using the unified
 * VTT initializer system.
 *
 * @requires vtt-initializer.js
 * @requires vtt-controls-module.js
 * @requires vtt-preview-module.js
 * @requires vtt-draggable-module.js
 */

document.addEventListener('DOMContentLoaded', function () {
    // VTT Configuration
    const config = {
        basePath: './storage/vtt_configs',
        defaultMapWidth: 1920,
        defaultMapHeight: 1080,
        maxPreviewWidth: 1920,
        maxPreviewHeight: 1080,
        defaultConfig: './storage/scrying_glasses/battlemap.json',
        defaultFilename: 'battlemap.json',
        moduleName: 'VTT',
        storageKey: 'vtt_preview_scale'
    };

    // Element IDs for VTT tab (no suffix)
    const elementIds = {
        jsonInput: 'jsonInput',
        parseButton: 'parseButton',
        jsonError: 'jsonError',
        controlsArea: 'controlsArea',
        previewArea: 'previewArea',
        imagePath: 'imagePath',
        usePathBtn: 'usePathBtn',
        hideEffectsBtn: 'hideEffects',
        showEffectsBtn: 'showEffects',
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
        addFogBtn: 'addFogBtn',
        resetFogBtn: 'resetFogBtn',
        removeFogBtn: 'removeFogBtn',
        addButtons: {
            token: 'addTokenBtn',
            area: 'addAreaBtn',
            text: 'addTextBtn',
            video: 'addVideoBtn',
            gif: 'addGifBtn',
            image: 'addImageBtn',
            svg: 'addSvgBtn',
            line: 'addLineBtn',
            cone: 'addConeBtn',
            bar: 'addBarBtn'
        }
    };

    // Initialize VTT
    const modules = initializeVTT(config, elementIds);

    console.log('VTT Battlemap initialized successfully', modules);
});
