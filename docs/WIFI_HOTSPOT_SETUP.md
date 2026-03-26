---
title: "WiFi Hotspot Setup Guide"
---

# WiFi Hotspot Setup Guide for ScreenSage

This guide explains how to set up dual WiFi interfaces on **Omarchy Linux** (or similar iwd-based systems) to simultaneously:
- Connect to WiFi networks as a client (wlan0 via iwd)
- Host a WiFi hotspot for players (wlan1 via NetworkManager)

## Table of Contents
- [Omarchy Linux Setup (iwd + NetworkManager)](#omarchy-linux-setup-iwd--networkmanager)
- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Troubleshooting](#troubleshooting)
- [Use Cases](#use-cases)

## Omarchy Linux Setup (iwd + NetworkManager)

**This is the recommended setup for Omarchy Linux and other systems using iwd for WiFi management.**

### System Requirements

- Two WiFi interfaces (wlan0 and wlan1)
- iwd (iNet Wireless Daemon) for client WiFi management
- NetworkManager for hotspot management
- Dual-band or dual-interface WiFi hardware

### Architecture Overview

- **wlan0**: Managed by iwd for client WiFi connections (connecting to networks)
- **wlan1**: Managed by NetworkManager for hosting the hotspot (other devices connect to this)

This allows both interfaces to operate simultaneously without interference.

### Step-by-Step Setup

#### 1. Configure iwd to Only Manage wlan0

Create a systemd override to limit iwd to wlan0:

```bash
sudo mkdir -p /etc/systemd/system/iwd.service.d
sudo tee /etc/systemd/system/iwd.service.d/override.conf > /dev/null << 'EOF'
[Service]
# Override the ExecStart to only manage wlan0
ExecStart=
ExecStart=/usr/lib/iwd/iwd -i wlan0
EOF
```

#### 2. Configure NetworkManager Interface Management

Create a NetworkManager config to manage only wlan1:

```bash
sudo tee /etc/NetworkManager/conf.d/wifi-interfaces.conf > /dev/null << 'EOF'
[device-wlan0]
# Don't manage wlan0 - let iwd handle it
match-device=interface-name:wlan0
managed=false

[device-wlan1]
# Manage wlan1 for hotspot
match-device=interface-name:wlan1
managed=true
EOF
```

#### 3. Reload and Restart Services

```bash
# Reload systemd to pick up iwd override
sudo systemctl daemon-reload

# Restart iwd (will now only manage wlan0)
sudo systemctl restart iwd

# Restart NetworkManager (will now manage wlan1)
sudo systemctl restart NetworkManager

# Enable WiFi in NetworkManager (required for hotspot)
sudo nmcli radio wifi on

# Wait for services to settle
sleep 2
```

#### 4. Verify Configuration

```bash
# Check that iwd only sees wlan0
iwctl device list
# Output should show only wlan0

# Check that NetworkManager sees wlan1
nmcli device status
# Output should show wlan1 as wifi device

# Verify wlan0 is unmanaged by NetworkManager
nmcli device status | grep wlan0
# Output should show "unmanaged"
```

#### 5. Create or Update Hotspot Connection

If you don't already have a hotspot connection configured:

```bash
# Create a new hotspot connection
sudo nmcli connection add \
    type wifi \
    ifname wlan1 \
    con-name player_handouts_andy \
    autoconnect no \
    wifi.mode ap \
    wifi.ssid player_handouts_andy \
    ipv4.method shared \
    wifi-sec.key-mgmt wpa-psk \
    wifi-sec.psk "YourPasswordHere"
```

Or if you have an existing connection, update it:

```bash
# Update existing connection to use wlan1
sudo nmcli connection modify player_handouts_andy connection.interface-name wlan1

# Set or update the password
sudo nmcli connection modify player_handouts_andy wifi-sec.psk "YourPasswordHere"
```

#### 6. Update ScreenSage WiFi Config

Edit `storage/wifi_config.json`:

```json
{
  "client_interface": "wlan0",
  "hotspot_interface": "wlan1",
  "hotspot_ssid": "player_handouts_andy"
}
```

### Using the Hotspot

#### Starting the Hotspot

```bash
# Start the hotspot
sudo nmcli connection up player_handouts_andy

# Verify it's running
nmcli connection show --active | grep player_handouts_andy
```

#### Stopping the Hotspot

```bash
sudo nmcli connection down player_handouts_andy
```

#### Connecting to WiFi Networks (Client)

Use iwctl for client connections on wlan0:

```bash
# Scan for networks
iwctl station wlan0 scan

# List available networks
iwctl station wlan0 get-networks

# Connect to a network
iwctl station wlan0 connect "NetworkName"

# Check connection status
iwctl station wlan0 show
```

Or use the ScreenSage WiFi management tab in the web interface.

### Using ScreenSage WiFi Tab

Once configured, manage everything from the ScreenSage web interface:

1. Navigate to the WiFi tab
2. **Current Connection**: Shows your active WiFi connection (wlan0)
3. **Available Networks**: Scan and connect to WiFi networks
4. **Hotspot Toggle**: Enable/disable the player hotspot
5. **Connected Devices**: See who's connected to your hotspot

### Hotspot Connection Details

- **SSID**: player_handouts_andy (or as configured)
- **IP Address**: 10.42.0.1/24
- **DHCP Range**: 10.42.0.10 - 10.42.0.254
- **Security**: WPA2-PSK
- **Interface**: wlan1

Devices connecting to the hotspot will receive IP addresses in the range 10.42.0.10-10.42.0.254 and can access ScreenSage at http://10.42.0.1:8080

### Common Issues and Solutions

#### Hotspot Won't Start

1. **Check that wlan1 exists and is up:**
   ```bash
   ip link show wlan1
   sudo ip link set wlan1 up
   ```

2. **Verify NetworkManager sees wlan1:**
   ```bash
   nmcli device status
   ```
   Should show wlan1 as "wifi" type, not "unavailable"

3. **Check if iwd is managing wlan1:**
   ```bash
   iwctl device list
   ```
   Should NOT show wlan1 (only wlan0)

4. **Verify WiFi is enabled in NetworkManager:**
   ```bash
   nmcli radio wifi
   ```
   Should show "enabled". If not, enable it:
   ```bash
   sudo nmcli radio wifi on
   ```

#### Can See Hotspot But Can't Connect

This is usually a password issue:

1. **Check the current password:**
   ```bash
   sudo nmcli connection show player_handouts_andy | grep psk
   ```

2. **Set a new password:**
   ```bash
   sudo nmcli connection modify player_handouts_andy wifi-sec.psk "YourNewPassword"
   sudo nmcli connection down player_handouts_andy
   sudo nmcli connection up player_handouts_andy
   ```

3. **Verify DHCP is running:**
   ```bash
   ps aux | grep dnsmasq
   ```
   You should see a dnsmasq process running for wlan1

#### Client WiFi Not Working

1. **Verify iwd is running:**
   ```bash
   systemctl status iwd
   ```

2. **Check wlan0 status:**
   ```bash
   iwctl station wlan0 show
   ```

3. **Verify NetworkManager isn't interfering:**
   ```bash
   nmcli device status | grep wlan0
   ```
   Should show "unmanaged"

### Configuration Files

- `/etc/systemd/system/iwd.service.d/override.conf` - Limits iwd to wlan0
- `/etc/NetworkManager/conf.d/wifi-interfaces.conf` - Interface management
- `/storage/wifi_config.json` - ScreenSage WiFi configuration
- NetworkManager connection: player_handouts_andy

### How It Works

The ScreenSage backend automatically detects and uses:
- **iwd** for client WiFi operations (scanning, connecting, status)
- **nmcli** for hotspot management

Detection happens at startup in `handlers.rs`:

```rust
fn is_using_iwd() -> bool {
    let output = Command::new("systemctl")
        .args(["is-active", "iwd"])
        .output();

    if let Ok(output) = output {
        let status = String::from_utf8_lossy(&output.stdout);
        status.trim() == "active"
    } else {
        false
    }
}
```

When iwd is detected, all client WiFi operations use `iwctl` commands. The hotspot always uses NetworkManager's `nmcli` regardless of the WiFi backend.

---

## Overview

Setting up a WiFi hotspot allows your Screen Sage computer to act as a wireless access point, enabling e-ink displays (SageSlate) and other devices to connect without requiring an existing network infrastructure. This is particularly useful for:

- **Portable gaming setups** - No WiFi router needed
- **Convention/event gaming** - Independent network
- **Home games** - Isolate gaming devices from home network
- **E-ink displays** - Connect ESP32-based SageSlate devices

## Prerequisites

### Hardware Requirements

- **WiFi adapter** capable of AP (Access Point) mode
- Verify your adapter supports AP mode:
  ```bash
  iw list | grep -A 10 "Supported interface modes" | grep "AP"
  ```
  You should see `* AP` in the output.

### Software Requirements

- Ubuntu 20.04+ or compatible Linux distribution
- Sudo/root access

## Installation

### Method 1: linux-wifi-hotspot (Recommended)

[linux-wifi-hotspot](https://github.com/lakinduakash/linux-wifi-hotspot) provides a GUI for easy hotspot management.

#### Install Dependencies

```bash
sudo apt update
sudo apt install -y libgtk-3-dev build-essential gcc g++ pkg-config make hostapd libqrencode-dev libpng-dev
```

#### Clone and Build

```bash
# Clone repository
cd ~
git clone https://github.com/lakinduakash/linux-wifi-hotspot
cd linux-wifi-hotspot

# Build binaries
make

# Install
sudo make install
```

#### Enable Service (Optional)

To start hotspot automatically on boot:

```bash
sudo systemctl enable create_ap
```

### Method 2: create_ap (Command-line)

If you prefer command-line only:

```bash
sudo apt install util-linux procps hostapd iproute2 iw haveged dnsmasq iptables -y
```

### Method 3: NetworkManager (Recommended for ScreenSage WiFi Tab)

NetworkManager provides the most seamless integration with ScreenSage's WiFi management interface. This method allows you to control the hotspot directly from the web interface.

#### Prerequisites

- NetworkManager installed and running
- Two WiFi interfaces (wlan0 for hotspot, wlan1 for client connections)

#### Check NetworkManager Status

```bash
# Check if NetworkManager is running
systemctl status NetworkManager

# If not running, start it
sudo systemctl start NetworkManager

# Enable it to start on boot
sudo systemctl enable NetworkManager
```

#### Create the Hotspot Connection

**Step 1: Create the base connection**
```bash
sudo nmcli connection add type wifi ifname wlan0 con-name player_handouts_andy autoconnect no ssid player_handouts_andy
```

**Step 2: Configure as Access Point with internet sharing**
```bash
sudo nmcli connection modify player_handouts_andy 802-11-wireless.mode ap 802-11-wireless.band bg ipv4.method shared
```

**Step 3: Add WPA2 security**
```bash
sudo nmcli connection modify player_handouts_andy wifi-sec.key-mgmt wpa-psk
sudo nmcli connection modify player_handouts_andy wifi-sec.psk "Mustgrove"
```

**Step 4: Verify the connection**
```bash
nmcli connection show player_handouts_andy1
```

#### Control from ScreenSage

Once configured, you can control the hotspot from ScreenSage's WiFi tab:
- Navigate to http://localhost:8080/wifi
- Click "Turn On" to enable the hotspot
- Click "Turn Off" to disable it
- View connected devices in real-time

#### Manual Control

You can also control it from command line:

```bash
# Start hotspot
sudo nmcli connection up player_handouts_andy

# Stop hotspot
sudo nmcli connection down player_handouts_andy

# Check status
nmcli connection show --active | grep player_handouts_andy
```

#### Change Settings

**Change password:**
```bash
sudo nmcli connection modify player_handouts_andy wifi-sec.psk "NewPassword"
```

**Change SSID:**
```bash
sudo nmcli connection modify player_handouts_andy 802-11-wireless.ssid "new_hotspot_name"
```

Then update `storage/wifi_config.json`:
```json
{
  "client_interface": "wlan1",
  "hotspot_interface": "wlan0",
  "hotspot_ssid": "new_hotspot_name"
}
```

#### Delete Hotspot

```bash
sudo nmcli connection delete player_handouts_andy
```

## Configuration

### GUI Configuration (linux-wifi-hotspot)

#### Launch the Application

```bash
wihotspot
# Or from applications menu: "Wifi Hotspot"
```

#### Configure Hotspot Settings

1. **SSID (Network Name):** `player_handouts_andy` (or your preference)
2. **Password:** `DnDepaper101` (or your preference, minimum 8 characters)
3. **Interface:**
   - **WiFi Interface:** Select your WiFi adapter (e.g., `wlan0`)
   - **Internet Interface:** Select your internet connection (e.g., `eth0`, `wlan1`)
4. **Channel:** Auto (or select 1-11 for 2.4GHz)
5. **Security:** WPA2

**Note:** The default SSID and password mentioned are used by the SageSlate ESP32 code.

### Command-line Configuration

Create a configuration file:

```bash
sudo nano /etc/create_ap.conf
```

Add:

```
CHANNEL=default
GATEWAY=10.0.0.1
WPA_VERSION=2
ETC_HOSTS=0
DHCP_DNS=gateway
NO_DNS=0
NO_DNSMASQ=0
HIDDEN=0
MAC_FILTER=0
MAC_FILTER_ACCEPT=/etc/hostapd/hostapd.accept
ISOLATE_CLIENTS=0
SHARE_METHOD=nat
IEEE80211N=0
IEEE80211AC=0
HT_CAPAB=[HT40+]
VHT_CAPAB=
DRIVER=nl80211
NO_VIRT=0
COUNTRY=
FREQ_BAND=2.4
NEW_MACADDR=
DAEMONIZE=0
NO_HAVEGED=0
WIFI_IFACE=wlan0
INTERNET_IFACE=eth0
SSID=player_handouts_andy
PASSPHRASE=DnDepaper101
USE_PSK=0
```

### No-Password Hotspot Setup

For sudoless operation of create_ap:

```bash
# Edit sudoers
sudo visudo -f /etc/sudoers.d/create_ap
```

Add this line (replace `jp19060` with your username):

```
jp19060 ALL=(ALL) NOPASSWD: /usr/bin/create_ap
```

**Save and exit** (Ctrl+X, then Y, then Enter).

Now you can run `create_ap` without entering a password.

## Usage

### Starting the Hotspot

#### GUI Method

```bash
wihotspot
```

Click **"Start Hotspot"** button.

#### Command-line Method

Basic hotspot:

```bash
sudo create_ap wlan0 eth0 player_handouts_andy DnDepaper101
```

**Arguments:**
- `wlan0`: WiFi interface for hotspot
- `eth0`: Internet interface (optional, use `lo` if no internet sharing)
- `player_handouts_andy`: SSID
- `DnDepaper101`: Password

**Without internet sharing:**
```bash
sudo create_ap wlan0 lo player_handouts_andy DnDepaper101
```

**With custom IP range:**
```bash
sudo create_ap -g 192.168.50.1 wlan0 eth0 player_handouts_andy DnDepaper101
```

### Stopping the Hotspot

#### GUI Method

In wihotspot, click **"Stop Hotspot"** button.

#### Command-line Method

```bash
# Find create_ap process
ps aux | grep create_ap

# Kill it (replace PID)
sudo killall create_ap
```

Or use the hotspot manager:

```bash
sudo systemctl stop create_ap
```

### Auto-Start on Boot

Enable the service:

```bash
sudo systemctl enable create_ap
```

To prevent auto-start:

```bash
sudo systemctl disable create_ap
```

## Troubleshooting

### WiFi Fails to Start

#### Check WiFi Radio State

```bash
# Check if WiFi is blocked
rfkill list
```

**If blocked, unblock it:**
```bash
# Unblock software block
rfkill unblock wlan

# Turn off and on WiFi radio
nmcli r wifi off
nmcli r wifi on
```

#### Disable Network Manager Control

Network Manager might interfere with hostapd:

```bash
# Stop Network Manager temporarily
sudo systemctl stop NetworkManager

# Start hotspot
sudo create_ap wlan0 lo player_handouts_andy DnDepaper101

# To make permanent, disable for WiFi interface
sudo nano /etc/NetworkManager/NetworkManager.conf
```

Add:

```ini
[keyfile]
unmanaged-devices=interface-name:wlan0
```

Restart Network Manager:

```bash
sudo systemctl restart NetworkManager
```

### Hotspot Starts But No Internet

If devices connect but have no internet access:

**Check internet interface:**
```bash
ip route | grep default
```

Note the interface (e.g., `eth0`, `enp3s0`).

**Verify IP forwarding:**
```bash
# Enable IP forwarding
sudo sysctl -w net.ipv4.ip_forward=1

# Make permanent
echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf
```

**Check iptables rules:**
```bash
# List NAT rules
sudo iptables -t nat -L -v

# Add NAT rule if missing (replace eth0 with your internet interface)
sudo iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
```

### Devices Can't Connect

**Check SSID broadcasting:**
```bash
# Scan for your hotspot from another device
sudo iw dev wlan0 scan | grep -i "player_handouts"
```

**Verify hostapd is running:**
```bash
ps aux | grep hostapd
sudo systemctl status hostapd
```

**Check for conflicting processes:**
```bash
# Kill any existing hostapd
sudo killall hostapd

# Restart hotspot
```

### "Operation not possible" Error

This usually means the WiFi interface is busy:

```bash
# Disconnect from any networks
nmcli device disconnect wlan0

# Stop any running hotspot
sudo killall create_ap

# Wait a few seconds
sleep 5

# Try again
sudo create_ap wlan0 lo player_handouts_andy DnDepaper101
```

## Use Cases

### SageSlate E-ink Display Connection

The ESP32-based SageSlate devices are configured to connect to:
- **SSID:** `player_handouts_andy`
- **Password:** `DnDepaper101`

**Workflow:**

1. **Start hotspot** on gaming computer
   ```bash
   wihotspot  # GUI
   # Or
   sudo create_ap wlan0 lo player_handouts_andy DnDepaper101
   ```

2. **Power on SageSlate devices** - They automatically connect

3. **Access SageSlate tab** in Screen Sage web interface:
   ```
   http://localhost:8080
   ```

4. **Send images** to connected e-ink displays

### Portable Gaming Setup

Create a completely portable D&D setup:

```bash
# Start hotspot
sudo create_ap wlan0 lo DnD_Table MySecurePassword123

# Start Screen Sage
cd ~/GitHub/ScreenSage
./target/release/screen-sage

# Connect tablets/phones to DnD_Table WiFi
# Access at http://192.168.12.1:8080 (default gateway)
```

### Multiple Device Network

Connect multiple displays and controllers:

```bash
# Start hotspot with custom gateway
sudo create_ap -g 192.168.100.1 wlan0 eth0 GameMaster SecurePass123

# Devices receive IPs: 192.168.100.2, 192.168.100.3, etc.
# Access Screen Sage: http://192.168.100.1:8080
```

## Advanced Configuration

### Custom DHCP Range

```bash
sudo create_ap --dhcp-range 192.168.50.10,192.168.50.50 wlan0 eth0 MySSID MyPassword
```

### 5GHz Hotspot

If your adapter supports 5GHz:

```bash
sudo create_ap --freq-band 5 wlan0 eth0 MySSID MyPassword
```

### Hidden SSID

```bash
sudo create_ap --hidden wlan0 eth0 MySSID MyPassword
```

### QR Code Generation

```bash
# Install qrencode
sudo apt install qrencode -y

# Generate QR code for WiFi
qrencode -t ansiutf8 "WIFI:S:player_handouts_andy;T:WPA;P:DnDepaper101;;"
```

Display this QR code for easy device connection!

## ESP32 Configuration

If you're using ESP32 devices (like SageSlate), they need to be programmed with the correct credentials.

**Default credentials in Loader_esp32wf:**
- SSID: `player_handouts_andy`
- Password: `DnDepaper101`

To change these, edit the ESP32 code and reflash:

```cpp
// In Loader_esp32wf/Loader_esp32wf.ino
const char* ssid = "your_new_ssid";
const char* password = "your_new_password";
```

## Related Documentation

- [Installation Guide](INSTALLATION.md) - Full Screen Sage setup
- [README](index.md) - Screen Sage overview
- ScryingGlass Documentation - Display features

## Quick Reference

| Task | Command |
|------|---------|
| Start GUI hotspot | `wihotspot` |
| Start hotspot (basic) | `sudo create_ap wlan0 lo SSID PASSWORD` |
| Start with internet | `sudo create_ap wlan0 eth0 SSID PASSWORD` |
| Stop hotspot | `sudo killall create_ap` |
| Check WiFi status | `rfkill list` |
| Unblock WiFi | `rfkill unblock wlan` |
| Enable on boot | `sudo systemctl enable create_ap` |
| List connected devices | `sudo arp -a` |

---

*For issues or questions, visit the [GitHub repository](https://github.com/AndrewMorgan2/ScreenSage) or check the [linux-wifi-hotspot documentation](https://github.com/lakinduakash/linux-wifi-hotspot).*
