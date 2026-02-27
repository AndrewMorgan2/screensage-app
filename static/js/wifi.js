document.addEventListener('DOMContentLoaded', function() {
    const networksContainer = document.getElementById('networks-container');
    const knownNetworksContainer = document.getElementById('known-networks-container');
    const devicesContainer = document.getElementById('devices-container');
    const currentConnectionContainer = document.getElementById('current-connection-container');
    const hotspotStatus = document.getElementById('hotspot-status');
    const hotspotToggle = document.getElementById('hotspot-toggle');
    const toggleText = document.getElementById('toggle-text');
    const refreshButton = document.getElementById('refresh-networks');
    const connectModal = document.getElementById('connect-modal');
    const closeModal = document.querySelector('.close-modal');
    const cancelConnect = document.getElementById('cancel-connect');
    const confirmConnect = document.getElementById('confirm-connect');
    const networkSsid = document.getElementById('network-ssid');
    const networkPassword = document.getElementById('network-password');
    const connectionError = document.getElementById('connection-error');

    let selectedNetwork = null;
    let refreshInterval = null;
    let hotspotActive = false;

    // Initialize
    loadCurrentConnection();
    loadNetworks();
    loadKnownNetworks();
    loadDevices();
    loadHotspotStatus();

    // Auto-refresh every 10 seconds
    refreshInterval = setInterval(() => {
        loadCurrentConnection();
        loadNetworks();
        loadKnownNetworks();
        loadDevices();
        loadHotspotStatus();
    }, 10000);

    // Manual refresh button
    refreshButton.addEventListener('click', () => {
        loadCurrentConnection();
        loadNetworks();
        loadKnownNetworks();
        loadDevices();
        loadHotspotStatus();
    });

    // Hotspot toggle button
    hotspotToggle.addEventListener('click', async () => {
        const enable = !hotspotActive;
        await toggleHotspot(enable);
    });

    // Modal close handlers
    closeModal.addEventListener('click', () => {
        connectModal.classList.remove('show');
        resetModal();
    });

    cancelConnect.addEventListener('click', () => {
        connectModal.classList.remove('show');
        resetModal();
    });

    // Click outside modal to close
    connectModal.addEventListener('click', (e) => {
        if (e.target === connectModal) {
            connectModal.classList.remove('show');
            resetModal();
        }
    });

    // Connect button handler
    confirmConnect.addEventListener('click', async () => {
        if (!selectedNetwork) return;

        const password = networkPassword.value.trim();

        // For open networks, password is not required
        if (selectedNetwork.security !== 'Open' && !password) {
            showError('Password is required for secured networks');
            return;
        }

        await connectToNetwork(selectedNetwork.ssid, password);
    });

    // Enter key in password field
    networkPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            confirmConnect.click();
        }
    });

    async function loadCurrentConnection() {
        try {
            const response = await fetch('/api/wifi/current');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            displayCurrentConnection(data);
        } catch (error) {
            console.error('Error loading current connection:', error);
            currentConnectionContainer.innerHTML = '<div class="not-connected-card">Failed to load connection status.</div>';
        }
    }

    async function loadNetworks() {
        try {
            const response = await fetch('/api/wifi/scan');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            displayNetworks(data.networks || []);
        } catch (error) {
            console.error('Error loading networks:', error);
            networksContainer.innerHTML = '<div class="empty-message">Failed to load networks. Please check if WiFi is enabled.</div>';
        }
    }

    async function loadKnownNetworks() {
        try {
            const response = await fetch('/api/wifi/known');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            displayKnownNetworks(data.networks || []);
        } catch (error) {
            console.error('Error loading known networks:', error);
            knownNetworksContainer.innerHTML = '<div class="empty-message">Failed to load known networks.</div>';
        }
    }

    async function loadDevices() {
        try {
            const response = await fetch('/api/wifi/clients');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            displayDevices(data.clients || []);
        } catch (error) {
            console.error('Error loading devices:', error);
            devicesContainer.innerHTML = '<div class="empty-message">Failed to load connected devices.</div>';
        }
    }

    async function loadHotspotStatus() {
        try {
            const response = await fetch('/api/wifi/hotspot-status');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            hotspotActive = data.active;

            if (data.active) {
                hotspotStatus.textContent = `${data.ssid || 'Active'}`;
                hotspotStatus.style.color = 'var(--success-color)';
                toggleText.textContent = 'Turn Off';
                hotspotToggle.classList.remove('inactive');
            } else {
                hotspotStatus.textContent = 'Inactive';
                hotspotStatus.style.color = 'var(--error-color)';
                toggleText.textContent = 'Turn On';
                hotspotToggle.classList.add('inactive');
            }
        } catch (error) {
            console.error('Error loading hotspot status:', error);
            hotspotStatus.textContent = 'Unknown';
            hotspotStatus.style.color = 'var(--secondary-text)';
        }
    }

    async function toggleHotspot(enable) {
        hotspotToggle.disabled = true;
        toggleText.textContent = enable ? 'Turning On...' : 'Turning Off...';

        try {
            const response = await fetch('/api/wifi/hotspot-toggle', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ enable })
            });

            const result = await response.json();

            if (result.success) {
                // Refresh status after short delay
                setTimeout(() => {
                    loadHotspotStatus();
                    loadDevices();
                }, 1000);
            } else {
                alert('Failed to toggle hotspot: ' + (result.message || 'Unknown error'));
                loadHotspotStatus(); // Refresh to restore correct state
            }
        } catch (error) {
            console.error('Error toggling hotspot:', error);
            alert('Error toggling hotspot: ' + error.message);
            loadHotspotStatus(); // Refresh to restore correct state
        } finally {
            hotspotToggle.disabled = false;
        }
    }

    function displayCurrentConnection(data) {
        if (!data.connected) {
            currentConnectionContainer.innerHTML = `
                <div class="not-connected-card">
                    Not connected to any network
                </div>
            `;
            return;
        }

        const signalStrength = data.signal || 0;
        const activeBars = Math.ceil(signalStrength / 25);

        currentConnectionContainer.innerHTML = `
            <div class="connection-card">
                <div class="connection-header">
                    <div class="connection-ssid">
                        <span>🔗</span>
                        ${escapeHtml(data.ssid)}
                    </div>
                    <div class="connection-signal">
                        <div class="signal-bars">
                            ${[1, 2, 3, 4].map(i => `<div class="signal-bar ${i <= activeBars ? 'active' : ''}"></div>`).join('')}
                        </div>
                        <span>${signalStrength}%</span>
                    </div>
                </div>
                <div class="connection-details">
                    <div class="connection-detail">
                        <div class="connection-detail-label">IP Address</div>
                        <div class="connection-detail-value">${escapeHtml(data.ip_address || 'N/A')}</div>
                    </div>
                    <div class="connection-detail">
                        <div class="connection-detail-label">Gateway</div>
                        <div class="connection-detail-value">${escapeHtml(data.gateway || 'N/A')}</div>
                    </div>
                    <div class="connection-detail">
                        <div class="connection-detail-label">DNS Server</div>
                        <div class="connection-detail-value">${escapeHtml(data.dns || 'N/A')}</div>
                    </div>
                </div>
            </div>
        `;
    }

    function displayNetworks(networks) {
        if (networks.length === 0) {
            networksContainer.innerHTML = '<div class="empty-message">No networks found. Click Refresh to scan again.</div>';
            return;
        }

        networksContainer.innerHTML = networks.map(network => createNetworkCard(network)).join('');

        // Add click handlers to network cards
        document.querySelectorAll('.network-card').forEach(card => {
            card.addEventListener('click', () => {
                const ssid = card.dataset.ssid;
                const security = card.dataset.security;
                const isConnected = card.classList.contains('connected');

                if (!isConnected) {
                    showConnectModal(ssid, security);
                }
            });
        });
    }

    function createNetworkCard(network) {
        const signalStrength = network.signal || 0;
        const activeBars = Math.ceil(signalStrength / 25); // 0-100 -> 0-4 bars
        const connectedClass = network.connected ? 'connected' : '';
        const connectedBadge = network.connected ? '<span class="connected-badge">Connected</span>' : '';

        return `
            <div class="network-card ${connectedClass}" data-ssid="${escapeHtml(network.ssid)}" data-security="${escapeHtml(network.security)}">
                <div class="network-header">
                    <div class="network-ssid">
                        ${network.security !== 'Open' ? '🔒' : '📡'}
                        ${escapeHtml(network.ssid)}
                        ${connectedBadge}
                    </div>
                    <div class="network-signal">
                        <div class="signal-bars">
                            ${[1, 2, 3, 4].map(i => `<div class="signal-bar ${i <= activeBars ? 'active' : ''}"></div>`).join('')}
                        </div>
                        <span>${signalStrength}%</span>
                    </div>
                </div>
                <div class="network-info">
                    <div class="network-security">
                        ${network.security}
                    </div>
                </div>
            </div>
        `;
    }

    function displayDevices(clients) {
        if (clients.length === 0) {
            devicesContainer.innerHTML = '<div class="empty-message">No devices connected to hotspot.</div>';
            return;
        }

        devicesContainer.innerHTML = clients.map(client => createDeviceCard(client)).join('');
    }

    function displayKnownNetworks(networks) {
        if (networks.length === 0) {
            knownNetworksContainer.innerHTML = '<div class="empty-message">No known networks found.</div>';
            return;
        }

        knownNetworksContainer.innerHTML = networks.map(network => createKnownNetworkItem(network)).join('');

        // Add click handlers to connect buttons
        document.querySelectorAll('.btn-connect-known').forEach(button => {
            button.addEventListener('click', async () => {
                const name = button.dataset.name;
                await connectToKnownNetwork(name, button);
            });
        });
    }

    function createKnownNetworkItem(network) {
        return `
            <div class="known-network-item">
                <div class="known-network-name">
                    🔖 ${escapeHtml(network.name)}
                </div>
                <button class="btn-connect-known" data-name="${escapeHtml(network.name)}">
                    Connect
                </button>
            </div>
        `;
    }

    function createDeviceCard(client) {
        return `
            <div class="device-card">
                <div class="device-info">
                    <div class="device-name">${escapeHtml(client.hostname || client.ip)}</div>
                    <div class="device-details">
                        <div class="device-detail">
                            <span>IP:</span>
                            <strong>${escapeHtml(client.ip)}</strong>
                        </div>
                        <div class="device-detail">
                            <span>MAC:</span>
                            <strong>${escapeHtml(client.mac)}</strong>
                        </div>
                    </div>
                </div>
                <div class="device-status">Connected</div>
            </div>
        `;
    }

    function showConnectModal(ssid, security) {
        selectedNetwork = { ssid, security };
        networkSsid.value = ssid;
        networkPassword.value = '';
        connectionError.style.display = 'none';

        // Auto-focus password field for secured networks
        if (security !== 'Open') {
            setTimeout(() => networkPassword.focus(), 100);
        }

        connectModal.classList.add('show');
    }

    function resetModal() {
        selectedNetwork = null;
        networkPassword.value = '';
        connectionError.style.display = 'none';
    }

    function showError(message) {
        connectionError.textContent = message;
        connectionError.style.display = 'block';
    }

    async function connectToNetwork(ssid, password) {
        confirmConnect.disabled = true;
        confirmConnect.textContent = 'Connecting...';
        connectionError.style.display = 'none';

        try {
            const response = await fetch('/api/wifi/connect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ssid, password })
            });

            const result = await response.json();

            if (result.success) {
                connectModal.classList.remove('show');
                resetModal();

                // Refresh network list and current connection after short delay
                setTimeout(() => {
                    loadCurrentConnection();
                    loadNetworks();
                }, 2000);
            } else {
                showError(result.message || 'Connection failed. Please check your password and try again.');
            }
        } catch (error) {
            console.error('Connection error:', error);
            showError('Connection failed: ' + error.message);
        } finally {
            confirmConnect.disabled = false;
            confirmConnect.textContent = 'Connect';
        }
    }

    async function connectToKnownNetwork(name, button) {
        button.disabled = true;
        button.textContent = 'Connecting...';

        try {
            const response = await fetch('/api/wifi/connect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ssid: name, password: '' })
            });

            const result = await response.json();

            if (result.success) {
                // Refresh network list and current connection after short delay
                setTimeout(() => {
                    loadCurrentConnection();
                    loadNetworks();
                    loadKnownNetworks();
                }, 2000);
            } else {
                alert('Failed to connect: ' + (result.message || 'Unknown error'));
            }
        } catch (error) {
            console.error('Connection error:', error);
            alert('Connection failed: ' + error.message);
        } finally {
            button.disabled = false;
            button.textContent = 'Connect';
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (refreshInterval) {
            clearInterval(refreshInterval);
        }
    });
});
