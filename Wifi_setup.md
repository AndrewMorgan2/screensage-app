# WiFi Setup Guide for ScreenSage

This guide explains how to set up dual WiFi functionality on **Omarchy Linux** (or similar systems) using:
- **iwd** for client WiFi connections (wlan0)
- **create_ap** for hosting a hotspot (wlan1)

## Quick Overview

ScreenSage uses a dual WiFi setup:
- **wlan0**: Connect to WiFi networks (managed by iwd)
- **wlan1**: Host a hotspot for players to connect (managed by create_ap)

Both can run simultaneously!

## Prerequisites

### Hardware Requirements
- Two WiFi interfaces (wlan0 and wlan1)
- Both interfaces must support AP (Access Point) mode

### Software Requirements
- iwd (iNet Wireless Daemon)
- create_ap or wihotspot
- Arch Linux / Omarchy Linux (or similar)

## Step-by-Step Setup

### 1. Install Required Software

#### Install iwd

```bash
# Install iwd (if not already installed)
sudo pacman -S iwd
```

#### Install create_ap

There are several methods to install create_ap on Arch Linux:

**Method 1: From AUR (Recommended)**

```bash
# Using yay
yay -S create_ap

# Or using paru
paru -S create_ap
```

**Method 2: Manual Build**

```bash
# Install build dependencies
sudo pacman -S base-devel git hostapd dnsmasq iw haveged

# Clone the repository
cd ~
git clone https://github.com/oblique/create_ap.git
cd create_ap

# Install
sudo make install
```

**Method 3: linux-wifi-hotspot (GUI + create_ap)**

For a graphical interface along with create_ap:

```bash
# Install dependencies
sudo pacman -S base-devel git gtk3 hostapd dnsmasq iw haveged qrencode

# Clone the repository
cd ~
git clone https://github.com/lakinduakash/linux-wifi-hotspot.git
cd linux-wifi-hotspot

# Build and install
make
sudo make install
```

This installs both `create_ap` command-line tool and `wihotspot` GUI application.

#### Enable create_ap to Start on Boot (Optional)

To make the hotspot start automatically when the machine boots:

```bash
sudo systemctl enable create_ap
```

To start it now without rebooting:

```bash
sudo systemctl start create_ap
```

**Note:** You'll need to configure `/etc/create_ap.conf` first (see Step 3).

### 2. Configure iwd to Only Manage wlan0

Create a systemd override so iwd only manages wlan0:

```bash
sudo mkdir -p /etc/systemd/system/iwd.service.d
sudo tee /etc/systemd/system/iwd.service.d/override.conf > /dev/null << 'EOF'
[Service]
# Override the ExecStart to only manage wlan0
ExecStart=
ExecStart=/usr/lib/iwd/iwd -i wlan0
EOF
```

### 3. Configure create_ap for wlan1

Edit the create_ap configuration file:

```bash
sudo nano /etc/create_ap.conf
```

Set these values:

```ini
CHANNEL=default
GATEWAY=192.168.12.1
WPA_VERSION=2
SHARE_METHOD=nat
FREQ_BAND=2.4
WIFI_IFACE=wlan1
INTERNET_IFACE=lo
SSID=ScreenSage
PASSPHRASE=DnDepaper
USE_PSK=0
```

**Important settings:**
- `SSID`: Your hotspot name
- `PASSPHRASE`: Your WiFi password (8-63 characters)
- `USE_PSK=0`: Use passphrase (set to 1 only for 64-char hex PSK)
- `WIFI_IFACE=wlan1`: Interface for the hotspot
- `INTERNET_IFACE=wlan1`: Interface for internet sharing
  - **Important:** If you get an error about "not fully support AP virtual interface", change this to `lo` (no internet) or `wlan0` (share from client WiFi)
  - For local ScreenSage access only, use `INTERNET_IFACE=lo`

### 4. Configure ScreenSage WiFi Settings

Edit `storage/wifi_config.json`:

```bash
nano storage/wifi_config.json
```

Set to:

```json
{
  "client_interface": "wlan0",
  "hotspot_interface": "wlan1",
  "hotspot_ssid": "ScreenSage"
}
```

### 5. Set Up Sudoers Permissions

ScreenSage needs to run create_ap with sudo. Configure passwordless sudo:

```bash
# Create sudoers file for ScreenSage (works for any user)
sudo tee /etc/sudoers.d/screensage-hotspot > /dev/null << EOF
# Allow user to manage WiFi hotspot without password
$(whoami) ALL=(ALL) NOPASSWD: /usr/bin/nohup create_ap *
$(whoami) ALL=(ALL) NOPASSWD: /usr/bin/pkill -f create_ap
EOF

# Set correct permissions
sudo chmod 0440 /etc/sudoers.d/screensage-hotspot

# Verify syntax
sudo visudo -c
```

**What this does:**
- `$(whoami)` automatically expands to your current username
- Allows running `nohup create_ap` with any arguments without a password
- Allows running `pkill -f create_ap` to stop the hotspot
- The `-n` flag in the ScreenSage code requires this to be set up

**Verify it works:**
```bash
# Test that sudo works without password
sudo -n pkill -f create_ap
echo "Success! No password required."
```

If you see "Success!" then the permissions are correctly configured.

### 6. Restart Services

```bash
# Reload systemd
sudo systemctl daemon-reload

# Restart iwd (now only manages wlan0)
sudo systemctl restart iwd

# Verify configuration
iwctl device list
# Should show only wlan0
```

## Using ScreenSage WiFi Management

### Starting ScreenSage

```bash
cd ~/GitHub/ScreenSage
cargo run
# Or if built:
./target/release/screen-sage
```

### WiFi Tab Features

Navigate to `http://localhost:8080/wifi` (or your ScreenSage URL)

**Available features:**

1. **Current Connection** - Shows your active WiFi connection on wlan0
2. **Available Networks** - Scan and connect to WiFi networks
3. **Known Networks** - Quick reconnect to saved networks
4. **Hotspot Toggle** - Enable/disable the player hotspot
5. **Connected Devices** - See who's connected to your hotspot

### Hotspot Connection Details

When the hotspot is enabled:
- **SSID**: ScreenSage (or as configured)
- **Password**: DnDepaper (or as configured)
- **IP Address**: 192.168.12.1 (as configured in create_ap.conf)
- **Security**: WPA2-PSK
- **Interface**: wlan1

Players connecting to the hotspot can access ScreenSage at `http://192.168.12.1:8080`

## Manual Hotspot Control

You can also control the hotspot from the command line:

### Start Hotspot

```bash
sudo nohup create_ap --config /etc/create_ap.conf --freq-band 2.4 &
```

### Stop Hotspot

```bash
sudo pkill -f create_ap
```

### Check Hotspot Status

```bash
ps aux | grep create_ap | grep -v grep
```

### View Connected Devices

```bash
# See devices connected to wlan1
ip neigh show dev wlan1
```

## Troubleshooting

### Hotspot Won't Start

1. **"Hotspot failed to start (process not found)" or "check permissions":**

   This means the sudoers file is not set up correctly.

   ```bash
   # Check if sudoers file exists
   sudo cat /etc/sudoers.d/screensage-hotspot

   # If it doesn't exist or is incorrect, create it:
   sudo tee /etc/sudoers.d/screensage-hotspot > /dev/null << EOF
   # Allow user to manage WiFi hotspot without password
   $(whoami) ALL=(ALL) NOPASSWD: /usr/bin/nohup create_ap *
   $(whoami) ALL=(ALL) NOPASSWD: /usr/bin/pkill -f create_ap
   EOF

   # Set correct permissions
   sudo chmod 0440 /etc/sudoers.d/screensage-hotspot

   # Verify syntax
   sudo visudo -c

   # Test it works
   sudo -n pkill -f create_ap && echo "Permissions OK!"
   ```

2. **Check if create_ap is already running:**
   ```bash
   ps aux | grep create_ap
   sudo pkill -f create_ap  # Kill if needed
   ```

3. **Verify wlan1 exists:**
   ```bash
   ip link show wlan1
   ```

4. **Check create_ap logs:**
   ```bash
   # Run create_ap manually to see errors
   sudo create_ap --config /etc/create_ap.conf --freq-band 2.4
   ```

5. **"Your adapter does not fully support AP virtual interface" / "You can not share your connection from the same interface":**

   This happens when your WiFi adapter doesn't support virtual interfaces and `WIFI_IFACE` and `INTERNET_IFACE` are the same.

   ```bash
   # Fix by using loopback (no internet sharing) - RECOMMENDED for local ScreenSage access
   sudo sed -i 's/^INTERNET_IFACE=wlan1/INTERNET_IFACE=lo/' /etc/create_ap.conf

   # OR share internet from your client WiFi (wlan0)
   sudo sed -i 's/^INTERNET_IFACE=wlan1/INTERNET_IFACE=wlan0/' /etc/create_ap.conf

   # Verify the change
   grep INTERNET_IFACE /etc/create_ap.conf
   ```

   **Note:** Using `lo` (loopback) means devices connecting to the hotspot won't have internet access, but they can still access ScreenSage at `192.168.12.1:8080`.

6. **Common errors:**
   - "create_ap must be run as root" - Check sudoers permissions (see #1 above)
   - "Invalid pre-shared-key length" - Password must be 8-63 chars with `USE_PSK=0`
   - "interface wlan1 is already in use" - Stop other WiFi managers

### Password Too Short Error

```
ERROR: Invalid pre-shared-key length 3 (expected 64)
```

**Solution:** Password must be 8-63 characters when `USE_PSK=0`:

```bash
sudo sed -i 's/^PASSPHRASE=.*/PASSPHRASE=YourNewPassword/' /etc/create_ap.conf
sudo sed -i 's/^USE_PSK=.*/USE_PSK=0/' /etc/create_ap.conf
```

### iwd Managing Both Interfaces

If iwd is managing wlan1, it will conflict with create_ap.

**Check:**
```bash
iwctl device list
```

Should show ONLY wlan0. If wlan1 appears, the iwd override didn't work:

```bash
# Verify override exists
cat /etc/systemd/system/iwd.service.d/override.conf

# Reload and restart
sudo systemctl daemon-reload
sudo systemctl restart iwd
```

### Client WiFi Not Working

1. **Verify iwd is running:**
   ```bash
   systemctl status iwd
   ```

2. **Check wlan0 status:**
   ```bash
   iwctl station wlan0 show
   ```

3. **Connect to a network:**
   ```bash
   iwctl station wlan0 scan
   iwctl station wlan0 get-networks
   iwctl station wlan0 connect "NetworkName"
   ```

### Hotspot Works But No Internet

This is normal if `INTERNET_IFACE=wlan1` (same as WIFI_IFACE). The hotspot provides a local network for ScreenSage without internet access.

If you want to share internet from wlan0:
```bash
# Edit config
sudo nano /etc/create_ap.conf
# Change INTERNET_IFACE to wlan0
INTERNET_IFACE=wlan0
```

Note: This requires wlan0 to be connected to a network.

## Configuration Files Reference

| File | Purpose |
|------|---------|
| `/etc/create_ap.conf` | Hotspot configuration (SSID, password, interfaces) |
| `/etc/systemd/system/iwd.service.d/override.conf` | Limits iwd to wlan0 only |
| `/etc/sudoers.d/screensage-hotspot` | Passwordless sudo for hotspot commands |
| `storage/wifi_config.json` | ScreenSage WiFi interface configuration |

## Testing the Setup

1. **Verify iwd only manages wlan0:**
   ```bash
   iwctl device list
   # Should show only wlan0
   ```

2. **Test client WiFi connection:**
   ```bash
   iwctl station wlan0 get-networks
   # Should show available networks
   ```

3. **Test hotspot creation:**
   ```bash
   sudo create_ap --config /etc/create_ap.conf --freq-band 2.4
   # Should start without errors
   # Press Ctrl+C to stop
   ```

4. **Test from ScreenSage:**
   - Start ScreenSage
   - Open WiFi tab
   - Toggle hotspot ON
   - Check for "ScreenSage" network from another device
   - Connect with password "DnDepaper"

## Advanced Configuration

### Change Hotspot Settings

Edit `/etc/create_ap.conf`:

```bash
sudo nano /etc/create_ap.conf
```

Common changes:
- `SSID=YourName` - Change network name
- `PASSPHRASE=YourPassword` - Change password (8-63 chars)
- `GATEWAY=192.168.50.1` - Change IP address
- `CHANNEL=6` - Set specific WiFi channel
- `HIDDEN=1` - Hide SSID broadcast

After changes, restart the hotspot.

### Auto-Start Hotspot on Boot

**Not recommended** - Better to control via ScreenSage interface.

If needed:
```bash
# Create systemd service
sudo systemctl enable create_ap
```

### View Hotspot Details

```bash
# Check DHCP leases
cat /tmp/create_ap.wlan1.conf.*/dnsmasq.leases

# Check hostapd status
ps aux | grep hostapd

# Check interface status
ip addr show wlan1
```

## How It Works

ScreenSage automatically detects iwd and uses it for client WiFi operations:

1. **On startup**, ScreenSage checks if iwd is active
2. **WiFi scanning/connecting** uses `iwctl` commands on wlan0
3. **Hotspot toggle** uses `create_ap` commands on wlan1
4. Both can run simultaneously without conflicts

The backend code in `handlers.rs`:
- Uses `iwctl` for all client WiFi operations
- Uses `sudo nohup create_ap` to start the hotspot
- Uses `sudo pkill -f create_ap` to stop the hotspot
- Uses `pgrep -f create_ap` to check hotspot status

## Quick Reference Commands

| Task | Command |
|------|---------|
| Start hotspot | `sudo nohup create_ap --config /etc/create_ap.conf --freq-band 2.4 &` |
| Stop hotspot | `sudo pkill -f create_ap` |
| Check hotspot status | `ps aux \| grep create_ap` |
| Scan WiFi networks | `iwctl station wlan0 get-networks` |
| Connect to WiFi | `iwctl station wlan0 connect "NetworkName"` |
| Check WiFi status | `iwctl station wlan0 show` |
| List connected devices | `ip neigh show dev wlan1` |
| View hotspot config | `cat /etc/create_ap.conf` |
| Test sudoers | `sudo -n pkill -f create_ap` |

## Support

For issues:
- Check the ScreenSage terminal for error messages
- Review create_ap logs: `cat /tmp/hotspot.log`
- Verify sudoers permissions: `sudo visudo -c`
- GitHub: [ScreenSage Issues](https://github.com/AndrewMorgan2/ScreenSage/issues)
- linux-wifi-hotspot: [GitHub](https://github.com/lakinduakash/linux-wifi-hotspot)

---

**Summary:** Once configured, you can manage both client WiFi and hotspot entirely from the ScreenSage WiFi tab. No manual commands needed!
