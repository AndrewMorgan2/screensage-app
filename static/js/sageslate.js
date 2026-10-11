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

// Custom screen names (e.g. "Gremil"), shared by the device cards and the screen tabs
const SCREEN_NAMES_PATH = './storage/sageslate_configs/screen_names.json';
let screenNames = {};

function screenDisplayName(id) {
    return screenNames[id] || `Screen${id}`;
}

// Tab N (data-tab, 1-indexed) is physical Screen(N-1)
function applyScreenNamesToTabs() {
    document.querySelectorAll('.sageslate-tab-btn').forEach(tab => {
        tab.textContent = screenDisplayName(parseInt(tab.dataset.tab, 10) - 1);
    });
}

function loadScreenNames() {
    return fetch(`/json/read?path=${encodeURIComponent(SCREEN_NAMES_PATH)}`)
        .then(r => (r.ok ? r.json() : {}))
        .catch(() => ({}))
        .then(names => {
            screenNames = names || {};
            applyScreenNamesToTabs();
            renderDevices();
        });
}

function saveScreenName(id, name) {
    name = name.trim();
    if (name) screenNames[id] = name;
    else delete screenNames[id];  // empty name resets to ScreenN

    fetch('/json/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: SCREEN_NAMES_PATH, content: JSON.stringify(screenNames, null, 2) })
    }).catch(e => console.error('Failed to save screen names:', e));

    applyScreenNamesToTabs();
    renderDevices();
}

// Swap a card's name for a text box; Enter or clicking away saves, Escape cancels
function startRenamingScreen(device, nameRow) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'text-input device-rename-input';
    input.value = screenNames[device.id] || '';
    input.placeholder = `Screen${device.id}`;
    nameRow.replaceChildren(input);
    input.focus();
    input.select();

    let done = false;
    const finish = (save) => {
        if (done) return;
        done = true;
        if (save) saveScreenName(device.id, input.value);
        else renderDevices();
    };
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
}

// Function to render devices
function renderDevices() {
    const deviceContainer = document.getElementById('deviceContainer');
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
            <div class="device-name-row">
                <span class="device-name"></span>
                <button type="button" class="device-rename-btn" title="Rename screen">&#9998;</button>
            </div>
            <div class="device-status">${statusText}</div>
        `;

        const nameEl = deviceElement.querySelector('.device-name');
        nameEl.textContent = screenDisplayName(device.id);
        nameEl.title = `${device.name} (${device.ip})`;
        const nameRow = deviceElement.querySelector('.device-name-row');
        deviceElement.querySelector('.device-rename-btn')
            .addEventListener('click', () => startRenamingScreen(device, nameRow));

        deviceContainer.appendChild(deviceElement);
    });
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
            command: 'ip',
            args: ['neigh', 'show']
        })
    })
        .then(response => response.json())
        .then(result => {
            console.log("Full result:", result);
            if (result.success) {
                console.log("stdout:", result.stdout);
                devices.forEach(device => {
                    const matched = result.stdout.split('\n').some(line =>
                        line.includes(device.ip) && line.includes('REACHABLE')
                    );
                    console.log(`Device ${device.name} (${device.ip}): ${matched ? 'CONNECTED' : 'not found'}`);
                    device.isConnected = matched;
                });
                renderDevices();
            } else {
                console.error("Command failed. stderr:", result.stderr);
                console.log("stdout:", result.stdout);
                devices.forEach(device => {
                    device.isConnected = false;
                });
                renderDevices();
            }
        })
        .catch(error => {
            console.error("Fetch error:", error);
        });
}
// Run the status check periodically
//   setInterval(checkDeviceStatus, 30000); // Check every 30 seconds

// Initial check on page load
document.addEventListener('DOMContentLoaded', () => {
    loadScreenNames();
    fetchDeviceStatus();
});
