/**
 * Screen Sage - Image Browser JavaScript
 */

// Store the default base directory and current media tracking
let DEFAULT_MEDIA_BASE_DIR = '';
let currentDirectory = '';
let currentMediaPath = '';
let currentMediaType = '';
let currentMediaName = '';

// Use different localStorage keys for Sageslate vs main Media page
// Check if we're on Sageslate page by looking for Sageslate-specific element
const isSageslatePage = () => document.getElementById('eink-player-management') !== null;
const DIRECTORY_KEY = isSageslatePage() ? 'sageslateMediaDirectory' : 'mediaDirectory';

document.addEventListener('DOMContentLoaded', function () {
    const folderList = document.getElementById('folder-list');
    const pathBreadcrumb = document.getElementById('path-breadcrumb');
    const currentDirectorySpan = document.getElementById('current-directory');
    const imageViewer = document.getElementById('image-viewer');
    const mediaActions = document.getElementById('media-actions');
    const currentPathInput = document.getElementById('current-path');
    const pathResult = document.getElementById('path-result');
    const directoryError = document.getElementById('directory-error');
    const directoryInput = document.getElementById('directory-input');

    if (directoryInput == null) return;

    DEFAULT_MEDIA_BASE_DIR = directoryInput.value;

    // Check if there's a saved directory in localStorage (set by upload page or previous navigation)
    const savedDirectory = localStorage.getItem(DIRECTORY_KEY);

    // Use saved directory if available, otherwise use default
    currentDirectory = savedDirectory || DEFAULT_MEDIA_BASE_DIR;

    // Load initial directory
    loadDirectory(currentDirectory);

    // Listen for storage changes from other tabs (only for the same page type)
    window.addEventListener('storage', function(e) {
        // Only respond to changes for our specific directory key
        const ourKey = isSageslatePage() ? 'sageslateMediaDirectory' : 'mediaDirectory';
        if (e.key === ourKey && e.newValue) {
            console.log('Directory changed in another tab, reloading:', e.newValue);
            currentDirectory = e.newValue;
            loadDirectory(currentDirectory);
        }
    });

    directoryInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            changeDirectory();
        }
    });

    // Add event listener for search input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                searchMedia();
            }
        });
    }
});

function changeDirectory() {
    const directoryInput = document.getElementById('directory-input');
    const directoryError = document.getElementById('directory-error');
    const newPath = directoryInput.value.trim();

    if (!newPath) {
        showError(directoryError, "Please enter a directory path");
        return;
    }

    // Update the current directory and load it
    currentDirectory = newPath;
    loadDirectory(currentDirectory);
}

/**
 * Show an error message
 * @param {HTMLElement} element - The element to show the error in
 * @param {string} message - The error message
 */
function showError(element, message) {
    element.textContent = message;
    element.style.display = 'block';

    // Hide the error after 5 seconds
    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

/**
 * Load a directory and display its contents
 * @param {string} path - Path to the directory to load
 */
function loadDirectory(path) {
    const folderList = document.getElementById('folder-list');
    const currentDirectorySpan = document.getElementById('current-directory');
    const directoryInput = document.getElementById('directory-input');
    const directoryError = document.getElementById('directory-error');
    const imageViewer = document.getElementById('image-viewer');
    const mediaActions = document.getElementById('media-actions');

    // Update UI to loading state
    folderList.className = 'loading';
    folderList.innerHTML = '';

    // Clear any previous errors
    directoryError.style.display = 'none';

    // Update the current directory display
    currentDirectorySpan.textContent = path;

    // Update the directory input to match current path
    directoryInput.value = path;

    // Clear media viewer when navigating
    imageViewer.innerHTML = '<p class="secondary-text">Select a file to view it here</p>';
    mediaActions.style.display = 'none';

    // Reset media tracking
    currentMediaPath = '';
    currentMediaType = '';
    currentMediaName = '';

    // Fetch directory contents using GET with query parameter
    fetch(`/api/images/list?path=${encodeURIComponent(path)}`)
        .then(response => {
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error("Directory not found");
                } else if (response.status === 400) {
                    throw new Error("Path is not a directory");
                } else {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
            }
            return response.json();
        })
        .then(data => {
            // Update the folder list
            folderList.className = '';

            // Store the current path
            currentDirectory = data.current_path;

            // Save the current directory to localStorage
            localStorage.setItem(DIRECTORY_KEY, currentDirectory);

            // No items found
            if (data.items.length === 0) {
                folderList.innerHTML = '<p class="secondary-text">No media files or folders found</p>';
                return;
            }

            // Add each item to the list
            data.items.forEach(item => {
                const listItem = document.createElement('div');
                listItem.className = 'folder-item';

                if (item.is_dir) {
                    // Folder item
                    const isParentDir = item.name === "..";

                    listItem.innerHTML = `
                    <i>${isParentDir ? '↩️' : '📁'}</i>
                    <span>${item.name}</span>
                `;

                    listItem.addEventListener('click', function () {
                        loadDirectory(item.path);
                    });
                } else if (item.file_type === 'video') {
                    // Video item
                    listItem.innerHTML = `
                    <i>🎥</i>
                    <span>${item.name}</span>
                `;

                    listItem.addEventListener('click', function () {
                        displayMedia(item.path, item.name, 'video');
                    });
                } else {
                    // Image item
                    listItem.innerHTML = `
                    <i>🖼️</i>
                    <span>${item.name}</span>
                `;

                    listItem.addEventListener('click', function () {
                        displayMedia(item.path, item.name, 'image');
                    });
                }

                folderList.appendChild(listItem);
            });
        })
        .catch(error => {
            folderList.className = '';
            folderList.innerHTML = `<p class="error">Error: ${error.message}</p>`;
            console.error('Error loading directory:', error);
            showError(directoryError, error.message);
        });
}

/**
 * Display a media file in the viewer
 * @param {string} path - Path to the media file
 * @param {string} name - Name of the media file
 * @param {string} type - Type of media (image or video)
 */
function displayMedia(path, name, type) {
    const imageViewer = document.getElementById('image-viewer');
    const mediaActions = document.getElementById('media-actions');
    const currentPathInput = document.getElementById('current-path');
    const pathResult = document.getElementById('path-result');

    // Get file extension
    const extension = name.split('.').pop().toLowerCase();

    // Update current media info
    currentMediaPath = path;
    currentMediaType = type;
    currentMediaName = name;

    if (type === 'image') {
        imageViewer.innerHTML = `
            <h3>${name}</h3>
            <img src="/api/images/view?path=${encodeURIComponent(path)}" alt="${name}">
        `;
    } else if (type === 'video') {
        imageViewer.innerHTML = `
            <h3>${name}</h3>
            <video controls style="max-width: 100%; max-height: 500px;">
                <source src="/api/images/view?path=${encodeURIComponent(path)}" type="video/${extension}">
                Your browser does not support the video tag.
            </video>
        `;
    }

    // Show media actions and set path
    mediaActions.style.display = 'block';
    currentPathInput.value = path;

    // Clear previous result
    pathResult.style.display = 'none';
    pathResult.textContent = '';
}

/**
 * Copy the media path to the clipboard
 */
function copyMediaPath() {
    const pathResult = document.getElementById('path-result');

    if (!currentMediaPath) {
        pathResult.style.display = 'block';
        pathResult.textContent = 'No media file currently selected';
        return;
    }

    // Create temporary input element to copy to clipboard
    const tempInput = document.createElement('input');
    tempInput.value = currentMediaPath;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);

    // Show success message
    pathResult.style.display = 'block';
    pathResult.innerHTML = `<pre>Copied to clipboard: ${currentMediaPath}</pre>`;
}

/**
 * Display the selected media on the appropriate VTT source based on which VTT is connected
 */
async function displayMediaInVTT(screen) {
    const pathResult = document.getElementById('path-result');

    if (!currentMediaPath) {
        pathResult.style.display = 'block';
        pathResult.textContent = 'No media file currently selected';
        return;
    }

    // Display loading message
    pathResult.style.display = 'block';
    pathResult.innerHTML = `<p>Setting media source...</p>`;
    const newPath = currentMediaPath;

    if (!newPath) {
        console.error("Error: No file path provided. Please enter the new video file path.");
        return;
    }
    var jsonFile = "";
    if (screen == "VTT") {
        jsonFile = "battlemap.json";
    } else {
        jsonFile = "display.json";
    }

    console.log(`Updating video source to: ${newPath}`);

    // const escapedPath = newPath.replace(/"/g, '\\"');
    // const command = `sed -i '/"background":/,/}/ s|"src"[[:space:]]*:[[:space:]]*"[^"]*"|"src": "${escapedPath}"|' ./storage/scrying_glasses/${jsonFile}`;

    const clearConfig = document.getElementById('clear-config-checkbox')?.checked;
    const safeCommand = clearConfig
        ? `jq --null-input --arg newSrc ${JSON.stringify(newPath)} '{"background":{"src":$newSrc},"elements":[]}' > tmp.json && mv tmp.json ./storage/scrying_glasses/${jsonFile}`
        : `jq --arg newSrc ${JSON.stringify(newPath)} '.background.src = $newSrc' ./storage/scrying_glasses/${jsonFile} > tmp.json && mv tmp.json ./storage/scrying_glasses/${jsonFile}`;

    fetch(`/run/command`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            command: "bash",
            args: ["-c", safeCommand]
        })
    })
        .then(response => response.json())
        .then(output => {
            if (output.success) {
                console.log(output.stdout);

                // Trigger server-side refresh notification
                const target = screen === "VTT" ? "vtt" : "display";
                console.log(`📡 Sending refresh trigger for ${target}`);
                fetch('/api/refresh/trigger', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ target, source: 'media-browser-background' })
                }).then(response => response.json()).then(result => {
                    console.log(`✓ Refresh triggered successfully:`, result);
                }).catch(err => {
                    console.error('❌ Failed to trigger refresh:', err);
                });

                pathResult.style.display = 'block';
                pathResult.innerHTML = `<p style="color: green;">✓ Successfully updated ${screen === "VTT" ? "battlemap" : "display"} background!</p>`;
            } else {
                console.error(output.stderr);
                pathResult.style.display = 'block';
                pathResult.innerHTML = `<p style="color: red;">Error: ${output.stderr}</p>`;
            }
        })
        .catch(error => {
            console.error('Error updating JSON file:', error);
            pathResult.style.display = 'block';
            pathResult.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
        });
}

/**
 * Get dimensions of an image or video file
 * @param {string} path - Path to the media file
 * @param {boolean} isVideo - True if video, false if image
 * @returns {Promise<{width: number, height: number}|null>} Media dimensions or null if error
 */
function getMediaDimensions(path, isVideo) {
    return new Promise((resolve) => {
        const fullSrc = `/api/images/view?path=${encodeURIComponent(path)}`;

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

            video.addEventListener('error', () => {
                console.warn('Could not load video dimensions');
                resolve(null);
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

            img.onerror = () => {
                console.warn('Could not load image dimensions');
                resolve(null);
            };

            img.src = fullSrc;
        }
    });
}

/**
 * Add the current media file as an element to the VTT display
 * @param {string} target - Target VTT ('battlemap' or 'display')
 */
window.addMediaToVTTElement = async function(target) {
    const pathResult = document.getElementById('path-result');

    if (!currentMediaPath) {
        pathResult.style.display = 'block';
        pathResult.textContent = 'No media file currently selected';
        return;
    }

    // Determine the JSON file to update
    const jsonFile = target === 'battlemap' ? 'battlemap.json' : 'display.json';
    const jsonPath = `./storage/scrying_glasses/${jsonFile}`;

    // Display loading message
    pathResult.style.display = 'block';
    pathResult.innerHTML = `<p>Adding ${currentMediaType} element to ${target}...</p>`;

    try {
        // Read the current JSON file
        const response = await fetch(`/json/read?path=${encodeURIComponent(jsonPath)}`);
        if (!response.ok) {
            throw new Error(`Failed to read ${jsonFile}: ${response.status}`);
        }

        const jsonData = await response.json();

        // Ensure elements array exists
        if (!jsonData.elements) {
            jsonData.elements = [];
        }

        // Get screen dimensions for positioning (center of screen)
        const screenWidth = jsonData.screen?.width || 1920;
        const screenHeight = jsonData.screen?.height || 1080;

        // Create a unique ID for the new element
        const elementId = `${currentMediaType}_${Date.now()}`;

        // Get media dimensions to preserve aspect ratio
        const mediaDimensions = await getMediaDimensions(currentMediaPath, currentMediaType === 'video');

        // Calculate size maintaining aspect ratio
        // Target max 50% of screen width or height
        let width, height;
        if (mediaDimensions) {
            const mediaAspectRatio = mediaDimensions.width / mediaDimensions.height;
            const screenAspectRatio = screenWidth / screenHeight;

            // Determine if we should constrain by width or height
            if (mediaAspectRatio > screenAspectRatio) {
                // Media is wider than screen ratio, constrain by width
                width = '50%';
                height = `${(50 / mediaAspectRatio) * (screenWidth / screenHeight)}%`;
            } else {
                // Media is taller than screen ratio, constrain by height
                height = '50%';
                width = `${50 * mediaAspectRatio * (screenHeight / screenWidth)}%`;
            }
        } else {
            // Fallback if dimensions can't be determined
            width = '50%';
            height = '50%';
        }

        // Create the new element based on media type
        let newElement;
        if (currentMediaType === 'video') {
            newElement = {
                type: 'video',
                id: elementId,
                src: currentMediaPath,
                x: '25%',
                y: '25%',
                width: width,
                height: height,
                keepAspectRatio: true,
                collapsed: false,
                autoplay: true,
                loop: true,
                muted: true,
                opacity: 100
            };
        } else {
            // Image type
            newElement = {
                type: 'image',
                id: elementId,
                src: currentMediaPath,
                x: '25%',
                y: '25%',
                width: width,
                height: height,
                keepAspectRatio: true,
                collapsed: false,
                opacity: 100
            };
        }

        // Add the new element to the elements array
        jsonData.elements.push(newElement);

        // Convert the updated JSON to a string
        const updatedJson = JSON.stringify(jsonData, null, 2);

        // Write the updated JSON back to the file using jq
        const writeCommand = `cat > ./storage/scrying_glasses/${jsonFile} << 'EOL'\n${updatedJson}\nEOL`;

        const writeResponse = await fetch(`/run/command`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                command: "bash",
                args: ["-c", writeCommand]
            })
        });

        const writeResult = await writeResponse.json();

        if (writeResult.success) {
            // Trigger server-side refresh notification
            const refreshTarget = target === 'battlemap' ? "vtt" : "display";
            console.log(`📡 Sending refresh trigger for ${refreshTarget}`);
            fetch('/api/refresh/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target: refreshTarget, source: 'media-browser-element' })
            }).then(response => response.json()).then(result => {
                console.log(`✓ Refresh triggered successfully:`, result);
            }).catch(err => {
                console.error('❌ Failed to trigger refresh:', err);
            });

            pathResult.style.display = 'block';
            pathResult.innerHTML = `<p style="color: green;">✓ Successfully added ${currentMediaType} element to ${target}!</p>
                <p style="font-size: 0.9em; color: #666;">Element ID: ${elementId}</p>
                <p style="font-size: 0.9em; color: #666;">You can now adjust it in the ${target === 'battlemap' ? 'VTT' : 'Display'} tab.</p>`;
            console.log(`Successfully added element to ${jsonFile}:`, newElement);
        } else {
            throw new Error(writeResult.stderr || 'Failed to write JSON file');
        }
    } catch (error) {
        pathResult.style.display = 'block';
        pathResult.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
        console.error('Error adding media element:', error);
    }
};

/**
 * Search for media files in the current directory and subdirectories
 */
function searchMedia() {
    const searchInput = document.getElementById('search-input');
    const searchError = document.getElementById('search-error');
    const folderList = document.getElementById('folder-list');
    const imageViewer = document.getElementById('image-viewer');
    const mediaActions = document.getElementById('media-actions');

    const query = searchInput.value.trim();

    if (!query) {
        showError(searchError, "Please enter a search term");
        return;
    }

    // Update UI to loading state
    folderList.className = 'loading';
    folderList.innerHTML = '';

    // Clear any previous errors
    searchError.style.display = 'none';

    // Clear media viewer when searching
    imageViewer.innerHTML = '<p class="secondary-text">Select a file to view it here</p>';
    mediaActions.style.display = 'none';

    // Reset media tracking
    currentMediaPath = '';
    currentMediaType = '';
    currentMediaName = '';

    // Fetch search results
    fetch(`/api/images/search?path=${encodeURIComponent(currentDirectory)}&query=${encodeURIComponent(query)}`)
        .then(response => {
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error("Directory not found");
                } else if (response.status === 400) {
                    throw new Error("Path is not a directory");
                } else {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
            }
            return response.json();
        })
        .then(data => {
            // Update the folder list
            folderList.className = '';

            // No items found
            if (data.items.length === 0) {
                folderList.innerHTML = `<p class="secondary-text">No media files or folders found matching "${query}"</p>`;
                return;
            }

            // Add header showing search results count
            const headerDiv = document.createElement('div');
            headerDiv.style.padding = '10px';
            headerDiv.style.fontSize = '0.9em';
            headerDiv.style.color = '#666';
            headerDiv.textContent = `Found ${data.items.length} result${data.items.length !== 1 ? 's' : ''} for "${query}"`;
            folderList.appendChild(headerDiv);

            // Add each item to the list
            data.items.forEach(item => {
                const listItem = document.createElement('div');
                listItem.className = 'folder-item';

                if (item.is_dir) {
                    // Folder item
                    listItem.innerHTML = `
                        <i>📁</i>
                        <span>${item.name}</span>
                        <span style="font-size: 0.8em; color: #666; margin-left: 10px;">${item.path}</span>
                    `;

                    listItem.addEventListener('click', function () {
                        // Navigate to the folder and clear search
                        loadDirectory(item.path);
                        searchInput.value = '';
                    });
                } else if (item.file_type === 'video') {
                    // Video item
                    listItem.innerHTML = `
                        <i>🎥</i>
                        <span>${item.name}</span>
                        <span style="font-size: 0.8em; color: #666; margin-left: 10px;">${item.path}</span>
                    `;

                    listItem.addEventListener('click', function () {
                        displayMedia(item.path, item.name, 'video');
                    });
                } else {
                    // Image item
                    listItem.innerHTML = `
                        <i>🖼️</i>
                        <span>${item.name}</span>
                        <span style="font-size: 0.8em; color: #666; margin-left: 10px;">${item.path}</span>
                    `;

                    listItem.addEventListener('click', function () {
                        displayMedia(item.path, item.name, 'image');
                    });
                }

                folderList.appendChild(listItem);
            });
        })
        .catch(error => {
            folderList.className = '';
            folderList.innerHTML = `<p class="error">Error: ${error.message}</p>`;
            console.error('Error searching media:', error);
            showError(searchError, error.message);
        });
}

/**
 * Clear the search and reload the current directory
 */
function clearSearch() {
    const searchInput = document.getElementById('search-input');
    const searchError = document.getElementById('search-error');

    // Clear the search input
    searchInput.value = '';

    // Hide any errors
    searchError.style.display = 'none';

    // Reload the current directory
    loadDirectory(currentDirectory);
}