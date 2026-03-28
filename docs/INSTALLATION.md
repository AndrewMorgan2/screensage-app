---
title: "Installation Guide"
---

# Screen Sage Installation Guide

Complete installation guide for setting up Screen Sage on Ubuntu/Linux systems.

## Table of Contents
- [Prerequisites](#prerequisites)
- [System Setup](#system-setup)
- [Screen Sage Installation](#screen-sage-installation)
- [Network File Sharing (NFS)](#optional-network-file-sharing-nfs)
- [Optional: Tailscale VPN](#optional-tailscale-vpn)
- [Verification](#verification)

## Prerequisites

### Operating System
- Omarchy (Arch Linux) — the primary supported platform
- Other distros may work but are not officially supported

## Screen Sage Installation

### 1. Clone Repository

```bash
# Create GitHub directory
mkdir -p ~/GitHub
cd ~/GitHub

# Clone Screen Sage
git@github.com:AndrewMorgan2/screensage-app.git
cd screensage-app
```

### 2. Install Rust

```bash
# Install Cargo and Rustup
sudo apt install cargo rustup -y

# Set default toolchain to stable
rustup default stable
```

**Verify installation:**
```bash
rustc --version
cargo --version
```

### 3. Install Build Dependencies

```bash
# Update package list
sudo apt update

# Install required packages
sudo apt install pkg-config libssl-dev -y
```

### 4. Build Screen Sage

```bash
# Navigate to Screen Sage directory
cd ~/GitHub/ScreenSage

# Build release version (optimized)
cargo build --release
```

**This will take several minutes.** The compiled binary will be at:
```
~/GitHub/ScreenSage/target/release/screen-sage
```

### 5. Setup Python Environment

```bash
# Install Python and venv
sudo apt install python3 python3-venv python3-pip -y

# Create virtual environment
cd ~/GitHub/ScreenSage
python3 -m venv python-env

# Activate environment
source python-env/bin/activate

# Install dependencies
python-env/bin/pip install pyglet watchdog Pillow

# Deactivate
deactivate
```

## Network File Sharing (NFS)

Share media files between your main computer (server) and gaming computer (client) using NFS.

### Server Setup (Media Storage Computer)

#### 1. Install NFS Server

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nfs-kernel-server -y

# Start and enable NFS
sudo systemctl start nfs-server
sudo systemctl enable nfs-server
```

#### 2. Create Shared Directory

```bash
# Clone DnD Images repository (or use your own directory)
cd ~/GitHub
git clone git@github.com:username/DnD_Images.git

# Or create your own media directory
mkdir -p ~/Media/DnD
```

#### 3. Configure NFS Exports

Edit exports file:

```bash
sudo nano /etc/exports
```

Add your shares (replace with your actual paths and network):

```
# Format: <directory> <network>(options)
/home/jp19060/GitHub/DnD_Images    192.168.1.0/24(rw,sync,no_subtree_check,no_root_squash)
/media/jp19060/Expansion           192.168.1.0/24(rw,sync,no_subtree_check,no_root_squash)
```

**Options explained:**
- `rw`: Read-write access
- `sync`: Write changes immediately
- `no_subtree_check`: Improve reliability
- `no_root_squash`: Allow root access

#### 4. Apply Configuration

```bash
# Apply the changes
sudo exportfs -arv

# Verify exports
sudo exportfs -v
```

#### 5. Configure Firewall

**Ubuntu/Debian (UFW):**
```bash
sudo ufw allow from 192.168.1.0/24 to any port nfs
sudo ufw reload
```

**Fedora/RHEL (firewalld):**
```bash
sudo firewall-cmd --permanent --add-service=nfs
sudo firewall-cmd --permanent --add-service=rpc-bind
sudo firewall-cmd --permanent --add-service=mountd
sudo firewall-cmd --reload
```

### Client Setup (Gaming Computer)

#### 1. Install NFS Client

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nfs-common -y

# Fedora/RHEL/CentOS
sudo dnf install nfs-utils -y
```

#### 2. Create Mount Points

```bash
# Create directories for mounting
mkdir -p ~/GitHub/DnD_Images
mkdir -p ~/Media/Expansion
```

#### 3. Test Mount

Test mounting before making permanent:

```bash
# Replace 'it101641' with your server hostname or IP
sudo mount -t nfs it101641:/home/jp19060/GitHub/DnD_Images ~/GitHub/DnD_Images
sudo mount -t nfs it101641:/media/jp19060/Expansion ~/Media/Expansion
```

**Verify mounts:**
```bash
df -h | grep nfs
ls ~/GitHub/DnD_Images
```

#### 4. Make Mounts Permanent

Edit fstab:

```bash
sudo nano /etc/fstab
```

Add mount entries:

```
# NFS mounts for Screen Sage
it101641:/home/jp19060/GitHub/DnD_Images  /home/amorgan/GitHub/DnD_Images  nfs  _netdev,auto,nofail,x-systemd.automount,x-systemd.mount-timeout=10  0  0
it101641:/media/jp19060/Expansion         /home/amorgan/GitHub/Expansion  nfs  _netdev,auto,nofail,x-systemd.automount,x-systemd.mount-timeout=10  0  0
```

**Mount options explained:**
- `_netdev`: Wait for network before mounting
- `auto`: Mount automatically at boot
- `nofail`: Don't fail boot if mount fails
- `x-systemd.automount`: Lazy mount (mount when accessed)
- `x-systemd.mount-timeout=10`: Timeout after 10 seconds

#### 5. Apply fstab Changes

```bash
# Reload systemd
sudo systemctl daemon-reload

# Mount all from fstab
sudo mount -a
```

**Verify:**
```bash
df -h | grep nfs
```

### NFS Troubleshooting

#### Server Issues

**NFS server not starting:**
```bash
# Start rpcbind first (required dependency)
sudo systemctl start rpcbind
sudo systemctl enable rpcbind

# Start NFS related services in order
sudo systemctl start nfs-idmapd
sudo systemctl start nfs-mountd
sudo systemctl start nfs-server

# Check status
sudo systemctl status nfs-server
```

**Check what's being exported:**
```bash
sudo exportfs -v
```

**Show current connections:**
```bash
sudo showmount -a
```

#### Client Issues

**Can't see exports:**
```bash
# Check if server is reachable
showmount -e name
```

**Mount fails:**
```bash
# Check if NFS ports are open
nc -zv name 2049

# Try manual mount with verbose
sudo mount -v -t nfs name:/home/jp19060/GitHub/DnD_Images ~/GitHub/DnD_Images
```

**Permission denied:**
- Check server exports configuration
- Verify IP address is in allowed network range
- Ensure `no_root_squash` is set if needed

## Optional: Tailscale VPN

Use Tailscale to access your gaming setup remotely or across networks.

### Install Tailscale

**Ubuntu/Debian:**
```bash
curl -fsSL https://tailscale.com/install.sh | sh
```

**Manual installation:**
```bash
# Add Tailscale repository
curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/$(lsb_release -cs).gpg | sudo apt-key add -
curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/$(lsb_release -cs).list | sudo tee /etc/apt/sources.list.d/tailscale.list

# Install
sudo apt update
sudo apt install tailscale -y
```

### Setup Tailscale

```bash
# Enable and start service
sudo systemctl enable tailscaled
sudo systemctl start tailscaled

# Connect to Tailscale network
sudo tailscale up
```

Follow the link provided to authenticate with your Tailscale account.

### Use Tailscale with NFS

Update fstab to use Tailscale hostname:

```bash
sudo nano /etc/fstab
```

Replace IP with Tailscale hostname:

```
<tailscale-hostname>:/media/videos    /mnt/shared_videos    nfs    defaults,_netdev    0 0
```

## Verification

### Test Screen Sage

```bash
cd ~/GitHub/ScreenSage

# Run the server
./target/release/screen-sage
```

**Expected output:**
```
Starting Screen Sage server...
Server running on http://0.0.0.0:8080
```

Open browser and navigate to: **http://localhost:8080**

## Next Steps

After installation:

1. **Configure displays:** See [TOUCHSCREEN_SETUP.md](TOUCHSCREEN_SETUP.md)
2. **Setup WiFi hotspot** (optional): See [WIFI_HOTSPOT_SETUP.md](WIFI_HOTSPOT_SETUP.md)
3. **Read the usage guide:** See main [README.md](index.md)
4. **Explore ScryingGlass:** See ScryingGlass documentation

## Quick Start After Installation

```bash
# Terminal 1: Start the web server
cd ~/GitHub/ScreenSage
./target/release/screen-sage

# Terminal 2: Launch a display
source python-env/bin/activate
python ScryingGlass/display_engine.py storage/scrying_glasses/battlemap.json
```

Open browser: **http://localhost:8080**

## Related Documentation

- [README](index.md) - Screen Sage overview and features
- [Touchscreen Setup](TOUCHSCREEN_SETUP.md) - Configure touchscreen displays
- [WiFi Hotspot Setup](WIFI_HOTSPOT_SETUP.md) - Mobile hotspot for e-ink devices
- [Useful Commands](USEFUL_COMMANDS.md) - Common commands reference

---

*For issues or questions, visit the [GitHub repository](https://github.com/username/ScreenSage).*
