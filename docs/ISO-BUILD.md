---
title: "Custom ISO Builder"
---

# ScreenSage Custom ISO Builder

Build a lightweight, security-free Arch Linux ISO with ScreenSage pre-configured for kiosk/appliance deployment.

## Features

### Zero Security Configuration
- **No passwords anywhere** - Passwordless sudo for all users
- **Auto-login** - Boots directly to desktop
- **No firewall** - Open system for easy local network access
- **No encryption** - Fast, simple access

### Pre-configured Components
- ScreenSage web server (auto-starts on boot)
- WiFi hotspot (SSID: ScreenSage, Password: DnDepaper)
- SSH server (enabled by default)
- Chromium browser in fullscreen kiosk mode
- Python display engine
- iwd for WiFi client connections

### Minimal Footprint
- Lightweight Openbox window manager
- Only essential packages included
- Optimized for single-purpose appliance use
- Expected ISO size: ~800MB-1.2GB

## Requirements

### Build System
- Arch Linux host (required for archiso)
- 10GB free disk space
- Internet connection
- Root access

### Target System
- x86_64 processor
- 2GB RAM minimum (4GB recommended)
- Two WiFi interfaces (wlan0 and wlan1)
- BIOS or UEFI boot support

## Quick Start

### Build the ISO

```bash
# Install archiso if needed
sudo pacman -S archiso

# Build the ISO
sudo ./build-iso.sh
```

Build time: 15-30 minutes depending on your system and internet speed.

### Write to USB

```bash
# Find your USB device
lsblk

# Write ISO to USB (replace /dev/sdX with your USB device)
sudo dd if=iso-output/screensage-*.iso of=/dev/sdX bs=4M status=progress oflag=sync

# Or use a tool like Etcher, Ventoy, or Rufus
```

### Boot and Use

1. **Boot from USB**
   - System boots to live environment
   - First boot takes 5-10 minutes (auto-setup runs)
   - Watch the console for progress

2. **Auto-Configuration**
   - Creates user "sage" (no password)
   - Clones and builds ScreenSage
   - Configures WiFi hotspot
   - Enables all services
   - System reboots automatically

3. **After Reboot**
   - Auto-login as "sage"
   - ScreenSage starts automatically
   - Browser launches in fullscreen
   - Hotspot is active

## Usage

### Access ScreenSage

**From the same machine:**
- http://localhost:8080

**From WiFi hotspot clients:**
- Connect to "ScreenSage" network (password: DnDepaper)
- Navigate to http://192.168.12.1:8080

### Default Credentials

**User Account:**
- Username: `sage`
- Password: (none - press Enter)
- Sudo: Passwordless (no password required)

**Root Account:**
- Password: (none - passwordless sudo instead)

**WiFi Hotspot:**
- SSID: `ScreenSage`
- Password: `DnDepaper`
- IP Range: 192.168.12.0/24
- Gateway: 192.168.12.1

**SSH:**
- Enabled by default
- Login as: `sage` (no password)
- `ssh sage@192.168.12.1` (from hotspot clients)

### Connect to WiFi Network

The system uses iwd for client WiFi connections on wlan0:

```bash
# Scan for networks
iwctl station wlan0 scan
iwctl station wlan0 get-networks

# Connect to a network
iwctl station wlan0 connect "NetworkName"
```

Or use the ScreenSage web interface WiFi tab.

### Service Management

All services auto-start on boot, but you can control them manually:

```bash
# ScreenSage web server
sudo systemctl status screensage
sudo systemctl restart screensage

# WiFi hotspot
sudo systemctl status screensage-hotspot
sudo systemctl restart screensage-hotspot

# View logs
journalctl -u screensage -f
journalctl -u screensage-hotspot -f
```

## Customization

### Before Building ISO

Edit configuration files in `iso-build/airootfs/`:

**Change Hotspot Settings:**
Edit `usr/local/bin/screensage-setup` and modify the create_ap.conf section:
```bash
SSID=YourSSID
PASSPHRASE=YourPassword
GATEWAY=192.168.50.1
```

**Add Extra Packages:**
Edit `iso-build/packages.x86_64` and add package names

**Change Default User:**
Edit `usr/local/bin/screensage-setup` and change all "sage" references

**Add Startup Scripts:**
Place scripts in `airootfs/etc/profile.d/` or modify `.xinitrc`

### After Installation

Since there's no security, you can modify anything without passwords:

```bash
# Change hotspot settings
sudo nano /etc/create_ap.conf
sudo systemctl restart screensage-hotspot

# Install additional packages
sudo pacman -S package-name

# Add startup programs
nano ~/.xinitrc
```

## Architecture

### Boot Process

1. **BIOS/UEFI** → Boots ISO
2. **Kernel** → Loads Arch Linux live system
3. **systemd** → Starts services
4. **screensage-auto-setup.service** → Runs first-boot setup
5. **Reboot** → Applies auto-login
6. **getty autologin** → Logs in as "sage"
7. **.bash_profile** → Runs startx
8. **.xinitrc** → Starts Openbox + Browser
9. **screensage.service** → Web server runs
10. **screensage-hotspot.service** → Hotspot starts

### File Structure

```
iso-build/
 profiledef.sh              # ISO metadata and configuration
 packages.x86_64            # List of packages to include
 pacman.conf                # Package manager configuration
 airootfs/                  # Root filesystem overlay
     etc/
        sudoers.d/
           99-nopasswd    # Passwordless sudo config
        systemd/system/
            screensage-auto-setup.service
     usr/local/bin/
         screensage-setup   # First-boot setup script
```

### Network Layout

```
[Internet] ←→ [wlan0 (iwd client)] ←→ [System] ←→ [wlan1 (hostapd)] ←→ [Hotspot Clients]
                                          ↓
                                    [ScreenSage :8080]
```

## Troubleshooting

### Build Issues

**"mkarchiso command not found"**
```bash
sudo pacman -S archiso
```

**"Permission denied"**
```bash
# Must run as root
sudo ./build-iso.sh
```

**"Package not found"**
- Update package list: `sudo pacman -Sy`
- Check package names in `iso-build/packages.x86_64`

### Boot Issues

**"Boot failed"**
- Verify USB write completed successfully
- Try writing with different tool (dd vs Etcher)
- Check BIOS/UEFI settings

**"Stuck at boot"**
- First boot setup takes 5-10 minutes
- Watch console for error messages
- Requires internet connection for git clone/cargo build

### Runtime Issues

**"ScreenSage not starting"**
```bash
# Check service status
sudo systemctl status screensage

# View logs
journalctl -u screensage -xe

# Try manual start
cd /home/sage/ScreenSage
./target/release/screen-sage
```

**"Hotspot not working"**
```bash
# Check if wlan1 exists
ip link show wlan1

# Check service
sudo systemctl status screensage-hotspot

# Check hostapd logs
sudo journalctl -u screensage-hotspot -xe

# Verify interfaces
iwctl device list  # Should show wlan0 only
```

**"Browser not launching"**
```bash
# Check if X is running
echo $DISPLAY  # Should show :0 or similar

# Launch manually
chromium --start-fullscreen --kiosk http://localhost:8080

# Or
firefox --kiosk http://localhost:8080
```

**"WiFi client connection fails"**
```bash
# Check iwd status
sudo systemctl status iwd

# Scan and connect
iwctl station wlan0 scan
iwctl station wlan0 get-networks
iwctl station wlan0 connect "NetworkName"
```

## Advanced

### Installing to Disk

The ISO is live-only by default. To install permanently:

```bash
# Partition disk
sudo cfdisk /dev/sdX

# Format partitions
sudo mkfs.ext4 /dev/sdX1
sudo mkfs.fat -F32 /dev/sdX2  # EFI partition if UEFI

# Mount and copy
sudo mount /dev/sdX1 /mnt
sudo rsync -aAXv / /mnt --exclude=/dev/* --exclude=/proc/* --exclude=/sys/* --exclude=/tmp/* --exclude=/run/* --exclude=/mnt/* --exclude=/media/*

# Install bootloader
sudo arch-chroot /mnt
grub-install /dev/sdX
grub-mkconfig -o /boot/grub/grub.cfg
exit

# Reboot
sudo reboot
```

### Adding to Existing System

Instead of building an ISO, you can run the setup on an existing Arch install:

```bash
# Copy the setup script
sudo cp iso-build/airootfs/usr/local/bin/screensage-setup /usr/local/bin/
sudo chmod +x /usr/local/bin/screensage-setup

# Run setup
sudo /usr/local/bin/screensage-setup
```

### Building Without Internet

Pre-download packages and set up local repository:

```bash
# Download packages
mkdir -p ~/archiso-cache
sudo pacman -Sw --cachedir ~/archiso-cache $(cat iso-build/packages.x86_64 | grep -v '^#')

# Modify build script to use cache
# Add to mkarchiso command: -c ~/archiso-cache
```

## Security Considerations

### This ISO is COMPLETELY INSECURE by design:

-  No passwords on any accounts
-  Passwordless sudo for everyone
-  No firewall
-  No disk encryption
-  SSH enabled with no auth
-  Open WiFi hotspot
-  No SELinux/AppArmor

### Intended Use Cases:

 Dedicated gaming appliances on private networks
 Kiosk systems with physical security
 Development/testing environments
 LAN party game servers
 Local tabletop gaming setups

### NOT Suitable For:

 Public networks
 Internet-facing servers
 Systems storing sensitive data
 Multi-user environments with trust boundaries
 Anything requiring authentication

## FAQ

**Q: Why is everything passwordless?**
A: This is designed as a single-purpose gaming appliance. The assumption is physical security and trusted network. For production use, add authentication.

**Q: Can I add a password later?**
A: Yes! After boot: `passwd sage` and edit `/etc/sudoers.d/99-nopasswd`

**Q: Will this work on non-Arch systems?**
A: The ISO builder requires Arch Linux as the build host. The resulting ISO can boot on any x86_64 system.

**Q: Can I run this in a VM?**
A: Yes, but WiFi hotspot won't work without USB WiFi passthrough or proper virtualized networking.

**Q: How do I update ScreenSage?**
```bash
cd /home/sage/ScreenSage
git pull
cargo build --release
sudo systemctl restart screensage
```

**Q: The build failed during cargo build**
A: The first-boot setup needs internet to clone the repo and build. Ensure your host network is working.

**Q: Can I customize the desktop?**
A: Yes! Edit `~/.xinitrc` to launch different programs. Replace Openbox with another WM by editing the ISO packages.

## Contributing

To improve the ISO builder:

1. Modify files in `iso-build/`
2. Test by building: `sudo ./build-iso.sh`
3. Submit pull requests

## Resources

- [Arch Linux](https://archlinux.org/)
- [archiso documentation](https://wiki.archlinux.org/title/Archiso)
- [ScreenSage GitHub](https://github.com/username/ScreenSage)
- [create_ap](https://github.com/oblique/create_ap)

## License

Same as ScreenSage (MIT License)

---

**Created with  for the tabletop gaming community**
