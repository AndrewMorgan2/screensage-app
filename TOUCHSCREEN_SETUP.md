# Touchscreen Setup Guide

Complete guide for configuring touchscreen displays and mapping them to specific monitors in a multi-screen setup.

## Table of Contents
- [Overview](#overview)
- [Finding Touchscreen Device](#finding-touchscreen-device)
- [Mapping Touchscreen to Monitor](#mapping-touchscreen-to-monitor)
- [Moving Windows Between Screens](#moving-windows-between-screens)
- [Troubleshooting](#troubleshooting)

## Overview

This guide helps you configure touchscreen inputs to work correctly with specific monitors in a multi-display setup. This is particularly useful when running Screen Sage on touchscreen displays for player interactions.

## Finding Touchscreen Device

### 1. List Available Monitors

First, identify your connected monitors:

```bash
xrandr --listmonitors
```

**Example output:**
```
Monitors: 2
 0: +*HDMI-1 1920/531x1080/299+0+0  HDMI-1
 1: +eDP-1 1920/344x1080/194+1920+0  eDP-1
```

Note the monitor names (e.g., `HDMI-1`, `eDP-1`).

### 2. List Input Devices

Find your touchscreen device ID:

```bash
xinput list
```

**Example output:**
```
⎡ Virtual core pointer                    	id=2	[master pointer  (3)]
⎜   ↳ Virtual core XTEST pointer          	id=4	[slave  pointer  (2)]
⎜   ↳ Touch p403 Touch Device,32-40P      	id=20	[slave  pointer  (2)]
⎜   ↳ Logitech USB Optical Mouse          	id=10	[slave  pointer  (2)]
⎣ Virtual core keyboard                   	id=3	[master keyboard (2)]
```

**Important:** Note the touchscreen device ID (in this example, `id=20`).

## Mapping Touchscreen to Monitor

### Basic Mapping

Map the touchscreen input to a specific monitor:

```bash
xinput map-to-output <DEVICE_ID> <MONITOR_NAME>
```

**Example:**
```bash
# Map touchscreen device 20 to HDMI-1
xinput map-to-output 20 HDMI-1
```

## Troubleshooting

### Touchscreen Not Responding

1. **Check device is detected:**
   ```bash
   xinput list
   ```
   Ensure your touchscreen appears in the list.

2. **Verify device is enabled:**
   ```bash
   xinput list-props <DEVICE_ID>
   ```
   Check if "Device Enabled" is 1.

3. **Re-enable if disabled:**
   ```bash
   xinput enable <DEVICE_ID>
   ```

### Wrong Screen Being Controlled

The touchscreen might be mapped to the wrong monitor:

```bash
# Remap to correct monitor
xinput map-to-output <DEVICE_ID> <CORRECT_MONITOR>
```

### Multiple Touchscreens

If you have multiple touchscreen devices:

1. List all input devices and identify each touchscreen
2. Map each to its corresponding monitor:
   ```bash
   xinput map-to-output 20 HDMI-1
   xinput map-to-output 21 HDMI-2
   ```

### Calibration Issues

If touch input is offset or inverted:

```bash
# Install calibration tool
sudo apt install xinput-calibrator

# Run calibration
xinput_calibrator
```

Follow the on-screen instructions to calibrate your touchscreen.

## Quick Reference

| Task | Command |
|------|---------|
| List monitors | `xrandr --listmonitors` |
| List input devices | `xinput list` |
| Map touch to monitor | `xinput map-to-output <ID> <MONITOR>` |
| Enable device | `xinput enable <ID>` |
| Disable device | `xinput disable <ID>` |
| List device properties | `xinput list-props <ID>` |
| Move all windows to origin | `for w in $(wmctrl -l \| awk '{print $1}'); do wmctrl -i -r $w -e 0,0,0,-1,-1; done` |

## Common Use Cases with Screen Sage

### Setup 1: DM Screen + Player Touchscreen

**Goal:** DM controls on laptop, players interact with touchscreen display.

```bash
# Map touchscreen to player display
xinput map-to-output 20 HDMI-1

# Launch ScryingGlass on player display
./python-env/bin/python3 ScryingGlass/display_engine.py storage/scrying_glasses/battlemap.json
```

### Setup 2: Multiple Player Screens

**Goal:** Multiple touchscreens for different player groups.

```bash
# Map each touchscreen to its monitor
xinput map-to-output 20 HDMI-1  # Player group 1
xinput map-to-output 21 HDMI-2  # Player group 2

# Launch separate displays
python ScryingGlass/display_engine.py storage/scrying_glasses/player1.json &
python ScryingGlass/display_engine.py storage/scrying_glasses/player2.json &
```

### Setup 3: E-Ink + Touchscreen

**Goal:** E-ink displays for character sheets, touchscreen for battlemap.

```bash
# Map touchscreen to battlemap display
xinput map-to-output 20 HDMI-1

# Launch both systems
python ScryingGlass/display_engine.py storage/scrying_glasses/battlemap.json &
# E-ink displays managed via SageSlate tab in web interface
```

## Related Documentation

- [Installation Guide](INSTALLATION.md) - Full system setup
- [README](README.md) - Screen Sage overview
- [ScryingGlass Documentation](ScryingGlass/docs/how_to_documentation.md) - Display features

---

*For issues or questions, check the [GitHub Issues](https://github.com/AndrewMorgan2/ScreenSage/issues) page.*
