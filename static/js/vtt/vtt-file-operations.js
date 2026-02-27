/**
 * VTT File Operations Module
 *
 * This module handles all file-related operations including loading,
 * saving, and browsing configuration files.
 *
 * @module VTTFileOperations
 */

/**
 * File operations class for managing VTT configuration files
 */
class FileOperations {
    /**
     * Create a FileOperations instance
     *
     * @param {Object} elements - DOM element references
     * @param {Object} config - Configuration object
     */
    constructor(elements, config) {
        this.elements = elements;
        this.config = config;
        this.currentPath = config.basePath;
    }

    /**
     * Load a configuration file from the server
     *
     * @param {string} path - Path to the config file
     * @param {string} filename - Filename for display
     * @param {Function} onSuccess - Callback on successful load
     * @param {Function} onError - Callback on error
     */
    loadConfigFile(path, filename, onSuccess, onError) {
        fetch(`/json/read?path=${encodeURIComponent(path)}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load config file: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                // Update the JSON input
                this.elements.jsonInput.value = JSON.stringify(data, null, 2);

                // Set the filename in the save field
                if (this.elements.saveFilename) {
                    this.elements.saveFilename.value = filename;
                }

                if (onSuccess) {
                    onSuccess(data);
                }
            })
            .catch(error => {
                console.error("Error loading config file:", error);
                if (this.elements.jsonError) {
                    this.elements.jsonError.textContent = `Error loading file: ${error.message}`;
                }
                if (onError) {
                    onError(error);
                }
            });
    }

    /**
     * Save configuration to a file
     *
     * @param {string} path - File path to save to
     * @param {string} jsonContent - JSON content to save
     * @param {Function} onSuccess - Callback on successful save
     * @param {Function} onError - Callback on error
     */
    saveConfigToPath(path, jsonContent, onSuccess, onError) {
        try {
            const jsonData = JSON.parse(jsonContent);

            fetch('/json/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    path: path,
                    content: JSON.stringify(jsonData, null, 2)
                })
            })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Failed to save file: ${response.status}`);
                    }
                    return response.text();
                })
                .then(() => {
                    console.log(`Configuration saved successfully to ${path}`);
                    if (onSuccess) {
                        onSuccess();
                    }
                })
                .catch(error => {
                    console.error("Error saving file:", error);
                    if (onError) {
                        onError(error);
                    }
                });
        } catch (error) {
            console.error("Invalid JSON:", error);
            if (onError) {
                onError(error);
            }
        }
    }

    /**
     * Save config using filename from input field
     *
     * @param {Function} onSuccess - Callback on success
     * @param {Function} onError - Callback on error
     */
    saveConfig(onSuccess, onError) {
        const filename = this.elements.saveFilename.value.trim();
        if (!filename) {
            alert("Please enter a filename");
            return;
        }

        const filePath = this.currentPath + "/" +
            (filename.endsWith('.json') ? filename : filename + '.json');

        this.saveConfigToPath(
            filePath,
            this.elements.jsonInput.value,
            () => {
                this.loadFileBrowser();
                if (onSuccess) onSuccess();
            },
            onError
        );
    }

    /**
     * Export configuration as downloadable file
     */
    exportConfig() {
        try {
            const jsonData = JSON.parse(this.elements.jsonInput.value);

            const blob = new Blob([JSON.stringify(jsonData, null, 2)], {
                type: 'application/json'
            });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;

            const filename = this.elements.saveFilename.value.trim() || 'vtt_config.json';
            a.download = filename.endsWith('.json') ? filename : filename + '.json';

            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 0);
        } catch (error) {
            console.error("Failed to export config:", error);
            alert(`Cannot export invalid JSON: ${error.message}`);
        }
    }

    /**
     * Load and display file browser
     */
    loadFileBrowser() {
        if (!this.elements.fileBrowser) return;

        this.elements.fileBrowser.innerHTML = '<p>Loading files...</p>';

        fetch(`/api/images/list?path=${encodeURIComponent(this.currentPath)}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load file browser: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                this.renderFileBrowser(data.items);
            })
            .catch(error => {
                console.error("Error loading file browser:", error);
                this.elements.fileBrowser.innerHTML =
                    `<p class="error">Error: ${error.message}</p>`;
            });
    }

    /**
     * Render file browser items
     *
     * @private
     * @param {Array} items - Array of file/folder items
     */
    renderFileBrowser(items) {
        this.elements.fileBrowser.innerHTML = '';

        if (items.length === 0) {
            this.elements.fileBrowser.innerHTML = '<p>No JSON files found</p>';
            return;
        }

        items.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.className = 'folder-item';

            if (item.is_dir) {
                itemElement.innerHTML = `<i>📁</i> <span>${item.name}</span>`;
                itemElement.addEventListener('click', () => {
                    this.currentPath = item.path;
                    this.loadFileBrowser();
                });
            } else if (item.name.endsWith('.json')) {
                itemElement.innerHTML = `<i>🗎</i> <span>${item.name}</span>`;
                itemElement.addEventListener('click', () => {
                    // Trigger load via external callback
                    if (this.onFileClick) {
                        this.onFileClick(item.path, item.name);
                    }
                });
            }

            this.elements.fileBrowser.appendChild(itemElement);
        });
    }

    /**
     * Set callback for when a file is clicked
     *
     * @param {Function} callback - Callback function(path, filename)
     */
    setFileClickCallback(callback) {
        this.onFileClick = callback;
    }

    /**
     * Get current file path
     *
     * @returns {string} Current path
     */
    getCurrentPath() {
        return this.currentPath;
    }

    /**
     * Set current file path
     *
     * @param {string} path - New path
     */
    setCurrentPath(path) {
        this.currentPath = path;
    }
}

// Make available globally
window.FileOperations = FileOperations;
