async function sendImage(path, einkScreenSelect) {
    console.log(einkScreenSelect);
    let args = [];

    switch (einkScreenSelect) {
        case "0":
            args.push(devices.find(device => device.id === 0).ip);
            break;
        case "1":
            args.push(devices.find(device => device.id === 1).ip);
            break;
        case "2":
            args.push(devices.find(device => device.id === 2).ip);
            break;
        case "3":
            args.push(devices.find(device => device.id === 3).ip);
            break;
        case "4":
            args.push(devices.find(device => device.id === 4).ip);
            break;
    }

    args.push(path);

    // Build the full command string for display
    const fullCommand = `./python-env/bin/python3 eink_send.py ${args.join(' ')}`;

    // Log the command to console
    console.log("Executing command:", fullCommand);

    // Execute the command
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
                // If there's any output, display it
                if (result.stdout) {
                    // console.log("Command output:", result.stdout);
                }
            } else {
                console.error("Error running eink send command:", result.stderr);
            }
        })
        .catch(error => {
            console.error("Failed to execute command:", error);
        });
}

document.getElementById('addBoxBtn').addEventListener('click', () => addNewElement('box'));
document.getElementById('addCircleBtn').addEventListener('click', () => addNewElement('circle'));
document.getElementById('addTextBtn').addEventListener('click', () => addNewElement('text'));
document.getElementById('addBarBtn').addEventListener('click', () => addNewElement('bar'));

// Add Fog button functionality
document.getElementById('addFogBtn').addEventListener('click', async () => {
    console.log('Add Fog button clicked');

    try {
        const jsonInput = document.getElementById('jsonInput');
        const jsonValue = jsonInput.value.trim();
        if (!jsonValue) {
            console.warn('No JSON configuration loaded');
            return;
        }

        const jsonData = JSON.parse(jsonValue);

        // Load fog template from JSON file
        console.log('Loading fog template from file...');
        const response = await fetch('/json/read?path=./storage/fog_template.json');

        if (!response.ok) {
            throw new Error('Failed to load fog template');
        }

        const fogTemplate = await response.json();

        // Use template fog configuration
        if (fogTemplate.fog) {
            jsonData.fog = fogTemplate.fog;
            console.log('✓ Fog template loaded:', fogTemplate.fog);
        } else {
            // Fallback to default if template doesn't have fog
            console.warn('Fog template missing fog object, using fallback');
            jsonData.fog = {
                enabled: true,
                opacity: 0.4,
                color: "#000000",
                clear: false,
                clearMode: true,
                clearRadius: 40,
                clear_polygons: []
            };
        }

        // Update JSON
        jsonInput.value = JSON.stringify(jsonData, null, 2);

        // Trigger parse to update UI (if parseJsonAndGenerateControls exists)
        if (typeof parseJsonAndGenerateControls === 'function') {
            parseJsonAndGenerateControls();
        }

        console.log('✓ Fog added to configuration');
    } catch (error) {
        console.error('Error adding fog:', error);

        // Fallback to hardcoded default on error
        try {
            const jsonInput = document.getElementById('jsonInput');
            const jsonValue = jsonInput.value.trim();
            const jsonData = JSON.parse(jsonValue);
            jsonData.fog = {
                enabled: true,
                opacity: 0.4,
                color: "#000000",
                clear: false,
                clearMode: true,
                clearRadius: 40,
                clear_polygons: []
            };
            jsonInput.value = JSON.stringify(jsonData, null, 2);
            if (typeof parseJsonAndGenerateControls === 'function') {
                parseJsonAndGenerateControls();
            }
            console.log('✓ Fog added with fallback configuration');
        } catch (fallbackError) {
            console.error('Fallback also failed:', fallbackError);
        }
    }
});

// Remove Fog button functionality
document.getElementById('removeFogBtn').addEventListener('click', () => {
    console.log('Remove Fog button clicked');

    try {
        const jsonInput = document.getElementById('jsonInput');
        const jsonValue = jsonInput.value.trim();
        if (!jsonValue) {
            console.warn('No JSON configuration loaded');
            return;
        }

        const jsonData = JSON.parse(jsonValue);

        // Remove fog
        if (jsonData.fog) {
            delete jsonData.fog;
        }

        // Update JSON
        jsonInput.value = JSON.stringify(jsonData, null, 2);

        // Trigger parse to update UI (if parseJsonAndGenerateControls exists)
        if (typeof parseJsonAndGenerateControls === 'function') {
            parseJsonAndGenerateControls();
        }

        console.log('✓ Fog removed from configuration');
    } catch (error) {
        console.error('Error removing fog:', error);
    }
});

document.getElementById('display-btn').addEventListener('click', async () => {
    const einkScreenSelect = document.getElementById('eink-select');
    // In a real implementation, you would fetch the latest status from your API
    sendImage(currentMediaPath, einkScreenSelect.value)
});
// Sample device data (replace this with your API fetch)
const devices = [
    { id: 0, name: "einkScreen0", type: "tablet", ip: "192.168.12.96", isConnected: false },
    { id: 1, name: "einkScreen1", type: "tablet", ip: "192.168.12.113", isConnected: false },
    { id: 2, name: "einkScreen2", type: "tablet", ip: "192.168.12.219", isConnected: false },
    { id: 3, name: "einkScreen3", type: "tablet", ip: "192.168.12.107", isConnected: false },
    { id: 4, name: "einkScreen4", type: "tablet", ip: "192.168.12.46", isConnected: false }
];

// Device icon SVGs
const deviceIcons = {
    laptop: `<svg viewBox="0 0 24 24" fill="#5f6368"><path d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>`,
    smartphone: `<svg viewBox="0 0 24 24" fill="#5f6368"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg>`,
    tablet: `<svg viewBox="0 0 24 24" fill="#5f6368"><path d="M21 4H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-2 14H5V6h14v12z"/></svg>`,
    tv: `<svg viewBox="0 0 24 24" fill="#5f6368"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg>`,
    console: `<svg viewBox="0 0 24 24" fill="#5f6368"><path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`
};

// Function to render devices
function renderDevices() {
    const deviceContainer = document.getElementById('deviceContainer');
    const placeholder = document.getElementById('devicePlaceholder');

    // Check if any device is connected
    const anyConnected = devices.some(device => device.isConnected);

    if (!anyConnected) {
        // Show placeholder when no devices are connected
        deviceContainer.innerHTML = '';
        if (placeholder) {
            deviceContainer.appendChild(placeholder);
        }
    } else {
        // Hide placeholder and render devices
        deviceContainer.innerHTML = '';

        devices.forEach(device => {
            const deviceElement = document.createElement('div');
            deviceElement.className = 'device';

            const statusText = device.isConnected ? 'Connected' : 'Disconnected';
            const statusClass = device.isConnected ? 'connected' : 'disconnected';

            deviceElement.innerHTML = `
                <div class="device-icon">
                    ${deviceIcons[device.type]}
                    <div class="status-indicator ${statusClass}"></div>
                </div>
                <div class="device-name">${device.name}</div>
                <div class="device-status">${statusText}</div>
            `;

            deviceContainer.appendChild(deviceElement);
        });
    }
}

// Refresh button functionality
document.getElementById('refreshButton').addEventListener('click', async () => {
    // In a real implementation, you would fetch the latest status from your API
    fetchDeviceStatus();
});

async function fetchDeviceStatus() {
    fetch('/execute', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            command: 'sudo',
            args: ['create_ap', '--list-clients', 'wlp0s20f3']
        })
    })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                console.log("Ping Network executed successfully");
                // If there's any output, display it
                if (result.stdout) {
                    console.log("Command output:", result.stdout);
                }
                // Reset all devices to disconnected initially
                devices.forEach(device => {
                    device.isConnected = false;
                    device.isConnected = result.stdout.includes(device.name);
                });

                renderDevices();
            } else {
                console.log()
                console.error("Error during network ping:", result.stderr);
                devices.forEach(device => {
                    device.isConnected = false;
                });
                renderDevices();
            }
        })
        .catch(error => {
            console.error("Failed to execute command:", error);
        });
}
// Run the status check periodically
//   setInterval(checkDeviceStatus, 30000); // Check every 30 seconds

// Initial check on page load
document.addEventListener('DOMContentLoaded', fetchDeviceStatus);
