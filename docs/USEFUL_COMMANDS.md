---
title: "Useful Commands Reference"
---

# Useful Commands Reference

## Running Screen Sage

```bash
cargo run
# or the compiled binary:
./target/release/screen-sage
```

Open browser: **http://localhost:8080**

## Running ScryingGlass

Launch a display window using a JSON scene config:

```bash
./python-env/bin/python3 ScryingGlass_pyglet/display_engine_pyglet.py storage/scrying_glasses/battlemap.json
```

For multiple screens, launch a separate process per screen with a different config:

```bash
./python-env/bin/python3 ScryingGlass_pyglet/display_engine_pyglet.py storage/scrying_glasses/display.json
```

**Controls while running:**

| Key | Action |
|-----|--------|
| Mouse wheel | Zoom in/out |
| Right-click drag | Pan |
| `+` / `-` | Zoom at centre |
| `H` or Home | Reset zoom/pan |
| `C` | Clear all fog |
| `R` | Reload config manually |
| `F` | Toggle fullscreen |

## Python Environment

```bash
# Install a Python dependency
./python-env/bin/pip install <package>

# Run any script using the project environment
./python-env/bin/python3 <script.py>
```

## WiFi

```bash
# If WiFi is blocked
sudo rfkill unblock wifi
```

## Related Documentation

- [Installation Guide](INSTALLATION.md)
- [ScryingGlass Display Engine](ScryingGlass_pyglet/README.md)
