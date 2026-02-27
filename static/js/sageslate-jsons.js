const filebrowser = document.getElementById("fileBrowser");

let player_path = "./storage/sageslate_configs"

function refresh() {
    filebrowser.innerHTML = '';
    // Fetch directory contents using GET with query parameter
    fetch(`/api/images/list?path=${encodeURIComponent(player_path)}`)
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
            loadTemplate.className = '';

            // Store the current path
            currentDirectory = data.current_path;

            // No items found
            if (data.items.length === 0) {
                filebrowser.innerHTML = '<p class="secondary-text">No media files or folders found</p>';
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
                        einkPlayerloadDirectory(item.path);
                    });
                } else {
                    // Image item
                    listItem.innerHTML = `
             <i>🖼️</i>
             <span>${item.name}</span>
         `;

                    listItem.addEventListener('click', function () {
                        loadTemplate(item.path, item.name, 'image');
                    });
                }

                filebrowser.appendChild(listItem);
            });
        })
        .catch(error => {
            filebrowser.className = '';
            filebrowser.innerHTML = `<p class="error">Error: ${error.message}</p>`;
            console.error('Error loading directory:', error);
            showError(directoryError, error.message);
        });
}

document.addEventListener("DOMContentLoaded", function () {
    refresh();
});

document.getElementById("saveFileBtn").addEventListener('click', function () {
    const name = document.getElementById("saveFilename").value;
    const destination = player_path + "/" + name;
    saveFromTextarea(destination);
});

function loadTemplate(path, name, type) {
    document.getElementById("saveFilename").value = name;
    fetch(`/json/read?path=${encodeURIComponent(path)}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            const jsonInput = document.getElementById('jsonInput');
            jsonInput.value = JSON.stringify(data, null, 2);
            parseJsonAndGenerateControls();
        })
        .catch(error => {
            console.error('Error loading the JSON template:', error);
        });
}


function einkPlayerloadDirectory(path) {
    player_path = path;
    refresh();
}

function saveTemplate(path, jsonContent) {
    fetch(`/json/save?path=${encodeURIComponent(path)}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            path: path,
            content: jsonContent
        })
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.text();
        })
        .then(data => {
            console.log('Save successful:', data);
        })
        .catch(error => {
            console.error('Error saving the JSON template:', error);
        });
}

// Example usage to save the content from the textarea
function saveFromTextarea(path) {
    console.log(path);
    const jsonInput = document.getElementById('jsonInput');
    saveTemplate(path, jsonInput.value);
}