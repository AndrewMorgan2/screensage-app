/**
 * VTT Element Type Definitions
 *
 * This module contains all element type templates, default values, and
 * property configurations for different element types in the VTT system.
 *
 * @module VTTElementTypes
 */

/**
 * Default values and constants for VTT elements
 */
const VTT_CONSTANTS = {
    // Default dimensions
    DEFAULT_TOKEN_SIZE: 50,
    DEFAULT_AREA_WIDTH: 200,
    DEFAULT_AREA_HEIGHT: 200,
    DEFAULT_TEXT_SIZE: 24,
    DEFAULT_VIDEO_WIDTH: 400,
    DEFAULT_VIDEO_HEIGHT: 300,
    DEFAULT_IMAGE_WIDTH: 300,
    DEFAULT_IMAGE_HEIGHT: 200,
    DEFAULT_SVG_SIZE: 200,
    DEFAULT_LINE_THICKNESS: 3,
    DEFAULT_CONE_RADIUS: 150,
    DEFAULT_CONE_ANGLE: 90,

    // Default colors
    DEFAULT_TOKEN_COLOR: '#3498db',
    DEFAULT_AREA_COLOR: 'rgba(46, 204, 113, 0.3)',
    DEFAULT_TEXT_COLOR: '#ffffff',
    DEFAULT_LINE_COLOR: '#ff0000',
    DEFAULT_CONE_COLOR: 'rgba(255, 165, 0, 0.5)',
    DEFAULT_CONE_BORDER_COLOR: '#ff7700',
    DEFAULT_SVG_COLOR: '#000000',

    // Default opacity
    DEFAULT_OPACITY: 100,
    DEFAULT_AREA_OPACITY: 50,

    // Default rotation
    DEFAULT_ROTATION: 0,

    // Font defaults
    DEFAULT_FONT: 'Arial',
    DEFAULT_ALIGNMENT: 'left',
    AVAILABLE_FONTS: ['Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana', 'Comic Sans MS'],
    AVAILABLE_ALIGNMENTS: ['left', 'center', 'right'],

    // Hidden properties list (for draggable elements)
    DRAGGABLE_HIDDEN_PROPERTIES: ['x', 'y']
};

/**
 * Element type property configurations
 * Defines which properties each element type should have
 */
const ELEMENT_PROPERTIES = {
    token: [
        { name: 'size', type: 'slider', label: 'Size', min: 10, max: 200 },
        { name: 'color', type: 'color', label: 'Color' },
        { name: 'label', type: 'text', label: 'Label' }
    ],
    area: [
        { name: 'width', type: 'slider', label: 'Width', min: 10, max: 'mapWidth' },
        { name: 'height', type: 'slider', label: 'Height', min: 10, max: 'mapHeight' },
        { name: 'keepAspectRatio', type: 'checkbox', label: 'Keep Aspect Ratio' },
        { name: 'color', type: 'color', label: 'Color' },
        { name: 'label', type: 'text', label: 'Label' }
    ],
    text: [
        { name: 'text', type: 'text', label: 'Text Content' },
        { name: 'size', type: 'slider', label: 'Font Size', min: 8, max: 72 },
        { name: 'color', type: 'color', label: 'Text Color' },
        { name: 'font', type: 'select', label: 'Font Family', options: VTT_CONSTANTS.AVAILABLE_FONTS },
        { name: 'alignment', type: 'select', label: 'Text Alignment', options: VTT_CONSTANTS.AVAILABLE_ALIGNMENTS }
    ],
    video: [
        { name: 'src', type: 'text', label: 'Video Path' },
        { name: 'width', type: 'slider', label: 'Width', min: 50, max: 'mapWidth' },
        { name: 'height', type: 'slider', label: 'Height', min: 50, max: 'mapHeight' },
        { name: 'keepAspectRatio', type: 'checkbox', label: 'Keep Aspect Ratio' },
        { name: 'opacity', type: 'slider', label: 'Opacity', min: 0, max: 100 },
        { name: 'rotation', type: 'slider', label: 'Rotation (degrees)', min: 0, max: 360 },
        { name: 'autoplay', type: 'checkbox', label: 'Autoplay' },
        { name: 'loop', type: 'checkbox', label: 'Loop' },
        { name: 'muted', type: 'checkbox', label: 'Muted' }
    ],
    gif: [
        { name: 'src', type: 'text', label: 'GIF Path' },
        { name: 'width', type: 'slider', label: 'Width', min: 50, max: 'mapWidth' },
        { name: 'height', type: 'slider', label: 'Height', min: 50, max: 'mapHeight' },
        { name: 'keepAspectRatio', type: 'checkbox', label: 'Keep Aspect Ratio' },
        { name: 'opacity', type: 'slider', label: 'Opacity', min: 0, max: 100 },
        { name: 'rotation', type: 'slider', label: 'Rotation (degrees)', min: 0, max: 360 }
    ],
    image: [
        { name: 'src', type: 'text', label: 'Image Path' },
        { name: 'width', type: 'slider', label: 'Width', min: 50, max: 'mapWidth' },
        { name: 'height', type: 'slider', label: 'Height', min: 50, max: 'mapHeight' },
        { name: 'keepAspectRatio', type: 'checkbox', label: 'Keep Aspect Ratio' },
        { name: 'opacity', type: 'slider', label: 'Opacity', min: 0, max: 100 },
        { name: 'rotation', type: 'slider', label: 'Rotation (degrees)', min: 0, max: 360 }
    ],
    svg: [
        { name: 'src', type: 'text', label: 'SVG Path' },
        { name: 'width', type: 'slider', label: 'Width', min: 50, max: 'mapWidth' },
        { name: 'height', type: 'slider', label: 'Height', min: 50, max: 'mapHeight' },
        { name: 'opacity', type: 'slider', label: 'Opacity', min: 0, max: 100 },
        { name: 'rotation', type: 'slider', label: 'Rotation (degrees)', min: 0, max: 360 },
        { name: 'color', type: 'color', label: 'Fill Color (SVG only)' }
    ],
    line: [
        { name: 'endX', type: 'slider', label: 'End X', min: 0, max: 'mapWidth' },
        { name: 'endY', type: 'slider', label: 'End Y', min: 0, max: 'mapHeight' },
        { name: 'thickness', type: 'slider', label: 'Thickness', min: 1, max: 20 },
        { name: 'color', type: 'color', label: 'Color' }
    ],
    cone: [
        { name: 'angle', type: 'slider', label: 'Angle', min: 0, max: 360 },
        { name: 'direction', type: 'slider', label: 'Direction', min: 0, max: 360 },
        { name: 'radius', type: 'slider', label: 'Radius', min: 100, max: 'mapWidth' },
        { name: 'color', type: 'color', label: 'Color' },
        { name: 'label', type: 'text', label: 'Label' }
    ],
    // Sageslate-specific element types
    box: [
        { name: 'width', type: 'slider', label: 'Width', min: 1, max: 500 },
        { name: 'height', type: 'slider', label: 'Height', min: 1, max: 500 },
        { name: 'keepAspectRatio', type: 'checkbox', label: 'Keep Aspect Ratio' },
        { name: 'grayscale', type: 'slider', label: 'Grayscale', min: 0, max: 100 },
        { name: 'transparency', type: 'slider', label: 'Transparency', min: 0, max: 100 }
    ],
    circle: [
        { name: 'radius', type: 'slider', label: 'Radius', min: 1, max: 200 },
        { name: 'grayscale', type: 'slider', label: 'Grayscale', min: 0, max: 100 },
        { name: 'transparency', type: 'slider', label: 'Transparency', min: 0, max: 100 }
    ],
    bar: [
        { name: 'width', type: 'slider', label: 'Width', min: 10, max: 500 },
        { name: 'height', type: 'slider', label: 'Height', min: 5, max: 100 },
        { name: 'currentValue', type: 'slider', label: 'Current Value', min: 0, max: 100 },
        { name: 'maxValue', type: 'slider', label: 'Max Value', min: 1, max: 1000 },
        { name: 'barColor', type: 'color', label: 'Bar Color' },
        { name: 'grayscale', type: 'slider', label: 'Grayscale', min: 0, max: 100 },
        { name: 'transparency', type: 'slider', label: 'Transparency', min: 0, max: 100 }
    ]
};

/**
 * Create a new element template with default values
 *
 * @param {string} type - Element type (token, area, text, etc.)
 * @param {number} mapWidth - Map width for positioning
 * @param {number} mapHeight - Map height for positioning
 * @returns {Object} Element template object
 */
function createElementTemplate(type, mapWidth, mapHeight) {
    const id = `${type}_${Date.now()}`;
    const centerX = Math.floor(mapWidth / 2);
    const centerY = Math.floor(mapHeight / 2);

    const templates = {
        token: {
            type: 'token',
            id: id,
            x: centerX,
            y: centerY,
            size: VTT_CONSTANTS.DEFAULT_TOKEN_SIZE,
            color: VTT_CONSTANTS.DEFAULT_TOKEN_COLOR,
            label: '',
            hiddenProperties: VTT_CONSTANTS.DRAGGABLE_HIDDEN_PROPERTIES
        },
        area: {
            type: 'area',
            id: id,
            x: Math.floor(mapWidth / 4),
            y: Math.floor(mapHeight / 4),
            width: Math.floor(mapWidth / 2),
            height: Math.floor(mapHeight / 2),
            keepAspectRatio: true,
            color: VTT_CONSTANTS.DEFAULT_AREA_COLOR,
            label: '',
            hiddenProperties: VTT_CONSTANTS.DRAGGABLE_HIDDEN_PROPERTIES
        },
        text: {
            type: 'text',
            id: id,
            x: centerX,
            y: centerY,
            size: VTT_CONSTANTS.DEFAULT_TEXT_SIZE,
            color: VTT_CONSTANTS.DEFAULT_TEXT_COLOR,
            text: 'New Text',
            font: VTT_CONSTANTS.DEFAULT_FONT,
            alignment: VTT_CONSTANTS.DEFAULT_ALIGNMENT,
            hiddenProperties: VTT_CONSTANTS.DRAGGABLE_HIDDEN_PROPERTIES
        },
        video: {
            type: 'video',
            id: id,
            x: centerX,
            y: centerY,
            width: VTT_CONSTANTS.DEFAULT_VIDEO_WIDTH,
            height: VTT_CONSTANTS.DEFAULT_VIDEO_HEIGHT,
            src: '',
            keepAspectRatio: true,
            autoplay: true,
            loop: true,
            muted: true,
            collapsed: false
        },
        gif: {
            type: 'gif',
            id: id,
            x: centerX,
            y: centerY,
            width: VTT_CONSTANTS.DEFAULT_IMAGE_WIDTH,
            height: VTT_CONSTANTS.DEFAULT_IMAGE_HEIGHT,
            src: '',
            keepAspectRatio: true,
            collapsed: false
        },
        image: {
            type: 'image',
            id: id,
            x: centerX,
            y: centerY,
            width: VTT_CONSTANTS.DEFAULT_IMAGE_WIDTH,
            height: VTT_CONSTANTS.DEFAULT_IMAGE_HEIGHT,
            src: '',
            keepAspectRatio: true,
            opacity: VTT_CONSTANTS.DEFAULT_OPACITY,
            rotation: VTT_CONSTANTS.DEFAULT_ROTATION,
            collapsed: false,
            hiddenProperties: VTT_CONSTANTS.DRAGGABLE_HIDDEN_PROPERTIES
        },
        svg: {
            type: 'svg',
            id: id,
            x: centerX,
            y: centerY,
            width: VTT_CONSTANTS.DEFAULT_SVG_SIZE,
            height: VTT_CONSTANTS.DEFAULT_SVG_SIZE,
            src: '',
            opacity: VTT_CONSTANTS.DEFAULT_OPACITY,
            rotation: VTT_CONSTANTS.DEFAULT_ROTATION,
            color: VTT_CONSTANTS.DEFAULT_SVG_COLOR,
            collapsed: false,
            hiddenProperties: VTT_CONSTANTS.DRAGGABLE_HIDDEN_PROPERTIES
        },
        line: {
            type: 'line',
            id: id,
            x: Math.floor(mapWidth / 3),
            y: Math.floor(mapHeight / 3),
            endX: Math.floor(mapWidth * 2 / 3),
            endY: Math.floor(mapHeight * 2 / 3),
            thickness: VTT_CONSTANTS.DEFAULT_LINE_THICKNESS,
            color: VTT_CONSTANTS.DEFAULT_LINE_COLOR,
            arrow: false,
            label: '',
            hiddenProperties: VTT_CONSTANTS.DRAGGABLE_HIDDEN_PROPERTIES
        },
        cone: {
            type: 'cone',
            id: id,
            x: centerX,
            y: centerY,
            radius: VTT_CONSTANTS.DEFAULT_CONE_RADIUS,
            angle: VTT_CONSTANTS.DEFAULT_CONE_ANGLE,
            direction: 0,
            rotation: VTT_CONSTANTS.DEFAULT_ROTATION,
            color: VTT_CONSTANTS.DEFAULT_CONE_COLOR,
            borderColor: VTT_CONSTANTS.DEFAULT_CONE_BORDER_COLOR,
            label: '',
            hiddenProperties: VTT_CONSTANTS.DRAGGABLE_HIDDEN_PROPERTIES
        },
        // Sageslate-specific element types
        box: {
            type: 'box',
            id: id,
            x: centerX - 50,
            y: centerY - 50,
            width: 100,
            height: 100,
            keepAspectRatio: false,
            grayscale: 0,
            transparency: 0,
            hiddenProperties: VTT_CONSTANTS.DRAGGABLE_HIDDEN_PROPERTIES
        },
        circle: {
            type: 'circle',
            id: id,
            x: centerX,
            y: centerY,
            radius: 50,
            grayscale: 0,
            transparency: 0,
            hiddenProperties: VTT_CONSTANTS.DRAGGABLE_HIDDEN_PROPERTIES
        },
        bar: {
            type: 'bar',
            id: id,
            x: centerX - 100,
            y: centerY - 10,
            width: 200,
            height: 20,
            currentValue: 50,
            maxValue: 100,
            barColor: '#4CAF50',
            grayscale: 0,
            transparency: 0,
            hiddenProperties: VTT_CONSTANTS.DRAGGABLE_HIDDEN_PROPERTIES
        }
    };

    return templates[type] || null;
}

/**
 * Get property configuration for an element type
 *
 * @param {string} type - Element type
 * @returns {Array} Array of property configurations
 */
function getElementProperties(type) {
    return ELEMENT_PROPERTIES[type] || [];
}

/**
 * Get list of all available element types
 *
 * @returns {Array} Array of element type info objects
 */
function getAvailableElementTypes() {
    return [
        { type: 'token', label: 'Add Token', icon: '⚫' },
        { type: 'area', label: 'Add Area', icon: '▢' },
        { type: 'text', label: 'Add Text', icon: 'T' },
        { type: 'video', label: 'Add Video', icon: '🎬' },
        { type: 'gif', label: 'Add GIF', icon: '🎞️' },
        { type: 'image', label: 'Add Image', icon: '🖼️' },
        { type: 'svg', label: 'Add SVG', icon: '◆' },
        { type: 'line', label: 'Add Line', icon: '─' },
        { type: 'cone', label: 'Add Cone', icon: '◢' }
    ];
}

// Export to global scope
window.VTT_CONSTANTS = VTT_CONSTANTS;
window.ELEMENT_PROPERTIES = ELEMENT_PROPERTIES;
window.createElementTemplate = createElementTemplate;
window.getElementProperties = getElementProperties;
window.getAvailableElementTypes = getAvailableElementTypes;
