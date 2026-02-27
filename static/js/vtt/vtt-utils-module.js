// vtt-utils-module.js - Utility functions for the VTT tool

class VttUtils {
    /**
     * Convert a color in various formats to a hex string
     * @param {string} color - A color string in any CSS format
     * @returns {string} - The color in hex format
     */
    static convertToHex(color) {
        // For hex and named colors, create a temporary div
        const tempDiv = document.createElement('div');
        tempDiv.style.color = color;
        document.body.appendChild(tempDiv);
        
        // Get computed style (rgba)
        const computedColor = getComputedStyle(tempDiv).color;
        document.body.removeChild(tempDiv);
        
        // Extract rgb values
        const rgbMatch = computedColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
        if (rgbMatch) {
            const r = parseInt(rgbMatch[1]);
            const g = parseInt(rgbMatch[2]);
            const b = parseInt(rgbMatch[3]);
            return VttUtils.rgbToHex(r, g, b);
        }
        
        // Return the original if unable to convert
        return color;
    }
    
    /**
     * Convert RGB values to a hex string
     * @param {number} r - Red (0-255)
     * @param {number} g - Green (0-255)
     * @param {number} b - Blue (0-255)
     * @returns {string} - Hex color string
     */
    static rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => {
            const hex = x.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    }
    
    /**
     * Extract a file path from command output
     * @param {string} output - Command output string
     * @returns {string|null} - Extracted file path or null if not found
     */
    static extractFilePath(output) {
        // Using regex to find a path pattern
        const pathRegex = /(?:saved to |file saved at |path: |generated: )(.*\.(?:png|jpg|jpeg|gif|webp|svg|bmp|tiff))/i;
        const match = output.match(pathRegex);
        
        if (match && match[1]) {
            return match[1].trim();
        }
        
        return null;
    }
    
    /**
     * Generate a unique ID
     * @param {string} prefix - Optional prefix for the ID
     * @returns {string} - Unique ID
     */
    static generateId(prefix = 'item') {
        return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    }
    
    /**
     * Create a deep copy of an object
     * @param {Object} obj - Object to copy
     * @returns {Object} - Deep copy of the object
     */
    static deepCopy(obj) {
        return JSON.parse(JSON.stringify(obj));
    }
    
    /**
     * Format a file size in bytes to a human-readable string
     * @param {number} bytes - Size in bytes
     * @returns {string} - Formatted size string
     */
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    /**
     * Debounce a function to prevent too frequent execution
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} - Debounced function
     */
    static debounce(func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }
    
    /**
     * Throttle a function to limit execution frequency
     * @param {Function} func - Function to throttle
     * @param {number} limit - Minimum time between executions in milliseconds
     * @returns {Function} - Throttled function
     */
    static throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
    
    /**
     * Check if a file path has a valid image extension
     * @param {string} path - File path
     * @returns {boolean} - True if the file is an image
     */
    static isImageFile(path) {
        const extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.tiff'];
        const lowerPath = path.toLowerCase();
        return extensions.some(ext => lowerPath.endsWith(ext));
    }
    
    /**
     * Extract the filename from a path
     * @param {string} path - File path
     * @returns {string} - Filename
     */
    static getFilenameFromPath(path) {
        return path.split('/').pop().split('\\').pop();
    }
}

// =============================================================================
// GLOBAL UTILITY FUNCTIONS FOR PERFORMANCE
// =============================================================================
// Make debounce and throttle available globally for easy access

/**
 * Debounce - Delays function execution until after wait time has passed
 * since last call. Perfect for save operations.
 */
function debounce(func, wait) {
    return VttUtils.debounce(func, wait);
}

/**
 * Throttle - Limits function execution to once per time period.
 * Perfect for rapid updates like dragging.
 */
function throttle(func, limit) {
    return VttUtils.throttle(func, limit);
}

// Make utilities available globally
window.VttUtils = VttUtils;
window.debounce = debounce;
window.throttle = throttle;