# WiFi & Hotspot Management Feature

## Overview

ScreenSage includes a built-in WiFi management system with dual-interface support:
- **Client Interface:** Connects to existing WiFi networks for internet access
- **Hotspot Interface:** Creates an access point for connecting devices (tablets, phones, etc.)

This allows ScreenSage to simultaneously connect to the internet while serving as a WiFi hotspot for gaming devices.

## Configuration

### WiFi Configuration File
Location: `storage/wifi_config.json`

```json
{
  "client_interface": "wlan0",
  "hotspot_interface": "wlan1",
  "hotspot_ssid": "ScreenSage",
  "hotspot_password": "DnDepaper"
}
```

**Fields:**
- `client_interface`: Network interface for WiFi client connections (e.g., `wlan0`, `wlan1`)
- `hotspot_interface`: Network interface for hosting the access point
- `hotspot_ssid`: Name of the hotspot network (visible to connecting devices)
- `hotspot_password`: WPA2 password for the hotspot (minimum 8 characters)

### Determining Interface Names

Find available WiFi interfaces:
```bash
# List WiFi interfaces
iw dev | grep Interface

# or
ip link | grep wlan
```

### Per-Machine Configuration

Different machines may have different interface configurations. Update `wifi_config.json` accordingly:

**Example 1: Two USB WiFi adapters**
```json
{
  "client_interface": "wlan0",
  "hotspot_interface": "wlan1",
  "hotspot_ssid": "ScreenSage",
  "hotspot_password": "MyPassword123"
}
```

**Example 2: Built-in + USB WiFi**
```json
{
  "client_interface": "wlan1",
  "hotspot_interface": "wlan0",
  "hotspot_ssid": "GameTable",
  "hotspot_password": "SecurePass456"
}
```

## Web Interface

### WiFi Tab

The WiFi interface provides:

**Network Scanning**
- Displays all available WiFi networks (except the hotspot itself)
- Shows signal strength and security type
- Supports networks with multi-word SSIDs (e.g., "John's room")
- Auto-refreshes network list

**Connection Management**
- Connect to new networks with password
- View currently connected network
- Signal strength indicator
- IP address and gateway information

**Known Networks**
- List of previously connected networks
- Quick reconnect to saved networks

### Hotspot Tab

**Hotspot Control**
- Toggle hotspot on/off
- View hotspot status (active/inactive)
- Display SSID and password
- Show IP address (default: 192.168.12.1)

**Connected Devices**
- Real-time list of connected clients
- MAC address, IP address, and hostname (when available)
- Updates as devices connect/disconnect

**Internet Sharing**
- Automatically shares client interface internet connection
- Status indicator for internet availability
- NAT/masquerading handled by systemd service

## Technical Implementation

### Backend (Rust)

**WiFi Handlers** (`src/handlers.rs`)

Core functions:
- `wifi_scan()` - Scans for available networks using `nmcli` (terse mode)
- `wifi_connect()` - Connects to a network with provided credentials
- `wifi_current_connection()` - Returns active connection details
- `wifi_known_networks()` - Lists saved network profiles
- `wifi_clients()` - Gets connected hotspot clients using `iw station dump`
- `wifi_hotspot_status()` - Checks if hotspot service is active
- `wifi_hotspot_toggle()` - Starts/stops the hotspot via systemctl

**Network Manager Support**

Supports both NetworkManager and iwd backends:
```rust
fn is_using_iwd() -> bool {
    // Checks if iwd service is active
    // Falls back to NetworkManager if not
}
```

**Network Parsing**

Uses nmcli terse mode for robust SSID parsing:
```rust
// Terse mode format: IN-USE:SSID:SIGNAL:SECURITY
nmcli -t -f IN-USE,SSID,SIGNAL,SECURITY device wifi list ifname wlan0
```

This handles:
- SSIDs with spaces correctly
- Special characters in network names
- Filtering of the hotspot SSID from scan results

**Client Detection**

Connected devices detected via `iw`:
```rust
// Get associated stations on hotspot interface
iw dev wlan1 station dump

// Cross-reference with ARP table for IP addresses
ip neigh show
```

### Hotspot Service

**Systemd Service:** `screensage-hotspot.service`

The hotspot runs as a systemd service using `create_ap`:
```ini
[Service]
ExecStart=/usr/bin/create_ap --config /etc/create_ap.conf --freq-band 2.4
```

**Configuration:** `/etc/create_ap.conf`
- Interface settings
- SSID and password
- Channel and frequency band (2.4 GHz default)
- DHCP range (192.168.12.10-192.168.12.100)

**Sudo Permissions:** `/etc/sudoers.d/screensage-hotspot`
```
ALL ALL=(ALL) NOPASSWD: /usr/bin/systemctl start screensage-hotspot
ALL ALL=(ALL) NOPASSWD: /usr/bin/systemctl stop screensage-hotspot
ALL ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart screensage-hotspot
```

Allows web interface to control hotspot without password prompts.

### Internet Sharing

When both interfaces are active:

1. **Client Interface** (`wlan0`) connects to internet
2. **Hotspot Interface** (`wlan1`) serves DHCP to clients
3. **iptables NAT** forwards traffic between interfaces
4. **IP Forwarding** enabled in kernel

NAT rule added automatically by create_ap:
```bash
iptables -t nat -A POSTROUTING -o wlan0 -j MASQUERADE
```

## API Endpoints

### WiFi Management
- `GET /wifi` - Render WiFi management page
- `GET /api/wifi/scan` - Get available networks
- `GET /api/wifi/current` - Get current connection
- `GET /api/wifi/known` - List known networks
- `POST /api/wifi/connect` - Connect to network

### Hotspot Management
- `GET /api/wifi/hotspot/status` - Get hotspot state
- `POST /api/wifi/hotspot/toggle` - Enable/disable hotspot
- `GET /api/wifi/clients` - Get connected devices

### API Examples

**Scan for Networks**
```http
GET /api/wifi/scan
```
Response:
```json
{
  "success": true,
  "networks": [
    {
      "ssid": "MyNetwork",
      "signal": 85,
      "security": "WPA2",
      "connected": false
    },
    {
      "ssid": "John's room",
      "signal": 65,
      "security": "WPA2",
      "connected": true
    }
  ]
}
```

**Connect to Network**
```http
POST /api/wifi/connect
Content-Type: application/json

{
  "ssid": "MyNetwork",
  "password": "mypassword123"
}
```

**Toggle Hotspot**
```http
POST /api/wifi/hotspot/toggle
Content-Type: application/json

{
  "enable": true
}
```

**Get Connected Clients**
```http
GET /api/wifi/clients
```
Response:
```json
{
  "success": true,
  "clients": [
    {
      "ip": "192.168.12.50",
      "mac": "aa:bb:cc:dd:ee:ff",
      "hostname": "android-phone"
    },
    {
      "ip": "192.168.12.51",
      "mac": "11:22:33:44:55:66",
      "hostname": "iPad"
    }
  ]
}
```

## Troubleshooting

### Hotspot Won't Start

**Check service status:**
```bash
systemctl status screensage-hotspot
journalctl -u screensage-hotspot -n 50
```

**Common issues:**
- Interface already in use by NetworkManager
- Conflicting DHCP server
- Driver doesn't support AP mode

**Verify AP mode support:**
```bash
iw list | grep "Supported interface modes" -A 10
# Should show "AP" in the list
```

### No Internet on Hotspot Clients

**Check internet sharing:**
```bash
# Verify client interface has internet
ping -c 3 -I wlan0 8.8.8.8

# Check NAT rule
iptables -t nat -L POSTROUTING -v

# Check IP forwarding
cat /proc/sys/net/ipv4/ip_forward  # Should be 1
```

### Can't Connect to Networks

**Check NetworkManager status:**
```bash
systemctl status NetworkManager
nmcli device status
```

**Manual connection test:**
```bash
nmcli device wifi connect "NetworkName" password "password" ifname wlan0
```

### Interface Names Changed

If interfaces swap names after reboot, update `wifi_config.json`:
```bash
# Find current interfaces
ip link | grep wlan

# Edit config
nano storage/wifi_config.json

# Restart ScreenSage
systemctl restart screensage
```

## ISO Installation

The WiFi/hotspot feature is pre-configured in the ScreenSage ISO:

**Included Components:**
- NetworkManager and iwd support
- hostapd and dnsmasq (for create_ap)
- Pre-configured systemd service
- Sudoers rules for passwordless control
- Default WiFi configuration

**First Boot Setup:**
1. Boot from ScreenSage ISO
2. Open ScreenSage web interface (http://localhost:8080)
3. Navigate to WiFi tab
4. Connect to your WiFi network
5. Navigate to Hotspot tab
6. Enable hotspot
7. Connect devices to "ScreenSage" network

**Post-Install Configuration:**
```bash
# Edit WiFi config for your hardware
sudo nano /opt/screensage/storage/wifi_config.json

# Restart service
sudo systemctl restart screensage
```

## Security Considerations

**Default Security:**
- Hotspot uses WPA2-PSK encryption
- Default password should be changed in production
- No firewall rules between hotspot clients and ScreenSage

**Recommended Security:**
1. Change default hotspot password
2. Use strong WPA2 password (12+ characters)
3. Enable firewall rules if needed
4. Keep ScreenSage updated

**Sudoers Access:**
- Only systemctl commands for screensage-hotspot allowed
- No shell access or arbitrary command execution
- Limited to specific systemd service control

## Future Enhancements

Potential improvements:
- [ ] 5 GHz band support configuration
- [ ] Custom DHCP range in web UI
- [ ] Bandwidth limiting per client
- [ ] Guest network isolation
- [ ] WPA3 support
- [ ] Hotspot scheduling (auto-enable/disable)
- [ ] Client MAC address filtering
- [ ] Network speed test integration

## See Also

**ScreenSage Documentation:**
- [Code Documentation](code_documentation.md) - Full technical reference for ScreenSage backend and handlers
- [Documentation Index](README.md) - Overview of all ScreenSage documentation

**WiFi Handler Implementation:**
- WiFi handlers are implemented in [handlers.rs](../handlers.rs) (lines 110-800)
- See [Code Documentation - WiFi Management](code_documentation.md#wifi-management) for handler details

## References

**Dependencies:**
- NetworkManager - Network connection management
- iwd - Alternative WiFi daemon
- hostapd - Access point daemon
- dnsmasq - DHCP/DNS server
- iw - WiFi configuration utility

**External Documentation:**
- [ArchWiki - NetworkManager](https://wiki.archlinux.org/title/NetworkManager)
- [ArchWiki - Software Access Point](https://wiki.archlinux.org/title/Software_access_point)
- [ArchWiki - Internet Sharing](https://wiki.archlinux.org/title/Internet_sharing)
