---
title: "Installation Guide"
---

# Screen Sage Installation Guide

Complete installation guide for setting up Screen Sage on Ubuntu/Linux systems.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Screen Sage Installation](#screen-sage-installation)
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
cargo run
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

## Remote Access

[Tailscale](https://tailscale.com) is recommended for accessing ScreenSage remotely or across networks.

## Verification

### Test Screen Sage

```bash
cd ~/GitHub/ScreenSage

# Run the server
cargo run
```

**Expected output:**
```
Starting Screen Sage server...
Server running on http://0.0.0.0:8080
```

Open browser and navigate to: **http://localhost:8080**

## Next Steps

After installation:

1. **Read the usage guide:** See main [README.md](index.md)
2. **Explore ScryingGlass:** See [ScryingGlass documentation](ScryingGlass_pyglet/README.md)

## Quick Start After Installation

```bash
# Terminal 1: Start the web server
cd ~/GitHub/ScreenSage
cargo run

# Terminal 2: Launch a display
source python-env/bin/activate
python ScryingGlass/display_engine.py storage/scrying_glasses/battlemap.json
```

Open browser: **http://localhost:8080**

## Related Documentation

- [README](index.md) - Screen Sage overview and features
- [Useful Commands](USEFUL_COMMANDS.md) - Common commands reference

---

*For issues or questions, visit the [GitHub repository](https://github.com/username/ScreenSage).*
