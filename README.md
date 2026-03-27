# Screen Sage

**A web-based control center for tabletop RPG management and multimedia display.**

ScreenSage provides powerful tools for Game Masters to manage combat, display media across multiple screens and control e-ink displays. Built and run on [Omarchy](https://omarchy.org) (Arch Linux), controllable locally or remotely via web browser.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Rust](https://img.shields.io/badge/rust-1.70%2B-orange.svg)](https://www.rust-lang.org/)
[![Python](https://img.shields.io/badge/python-3.8%2B-blue.svg)](https://www.python.org/)

## Quick Start

> **Note:** This project targets Omarchy (Arch Linux). Installation guides for other distros are available on request.

```bash
git clone git@github.com:AndrewMorgan2/ScreenSage.git
cd ScreenSage

# Install Rust
sudo pacman -S rust pkg-config openssl
rustup default stable

# Install ScryingGlass dependencies
python3 -m venv python-env
python-env/bin/pip install pyglet watchdog Pillow

# Run
cargo run
```

Open browser: **http://localhost:8080**

## Documentation

Full documentation is available at **https://andrewmorgan2.github.io/screensage-app/**

## License

This project is licensed under the MIT License - see the LICENSE file for details.
