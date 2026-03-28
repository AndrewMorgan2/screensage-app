---
title: "Installation Guide"
---

# Screen Sage Installation Guide

Complete installation guide for setting up Screen Sage on Ubuntu/Linux systems.

## Table of Contents
- [Prerequisites](#prerequisites)
- [System Setup](#system-setup)
- [Screen Sage Installation](#screen-sage-installation)
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
