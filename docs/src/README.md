---
title: "ScreenSage Documentation"
---

# ScreenSage Documentation

Welcome to the ScreenSage documentation. This directory contains comprehensive technical documentation for the ScreenSage virtual tabletop system.

## Documentation Structure

```
ScreenSage/
 README.md 
                                       → Links to all documentation
 src/docs/                           
    README.md (this file) 
    code_documentation.md 
       WiFi Management section → Cross-references
                                      
    wifi_hotspot_feature.md 
        See Also section

 Other documentation files (setup guides, etc.)
```

## Documentation Index

### Core Documentation

- **[Code Documentation](code_documentation.md)** - Complete technical reference for ScreenSage's Rust backend
  - Application architecture and routing
  - Data models and handlers
  - Battle tracker system
  - Media handling and serving
  - AI image generation
  - File upload system
  - Template system
  - JSON operations
  - Error handling patterns

### Feature Documentation

- **[WiFi & Hotspot Management](wifi_hotspot_feature.md)** - Comprehensive guide to the WiFi and hotspot features
  - Dual-interface WiFi support (client + hotspot)
  - Network scanning and connection management
  - Hotspot configuration and control
  - Internet sharing setup
  - API endpoints
  - ISO installation integration
  - Troubleshooting guide

## Quick Start

For developers new to the codebase:
1. Start with [Code Documentation](code_documentation.md) to understand the overall architecture
2. Review specific feature documentation as needed
3. Check API endpoints in each feature guide for integration details

## Project Overview

ScreenSage is a virtual tabletop (VTT) system designed to run on dedicated hardware, particularly e-ink displays. Key features include:

- **Battle Tracker** - Initiative tracking and combat management
- **Media Browser** - Image and video file management
- **AI Image Generation** - Stability AI integration for generating game assets
- **E-ink Display Support** - Optimized rendering for e-ink screens
- **WiFi Management** - Dual-interface networking with hotspot support
- **Virtual Tabletop** - Full VTT interface with drawing tools and token management

## Architecture

ScreenSage is built with:
- **Backend:** Rust with Actix-web framework
- **Frontend:** HTML, CSS, JavaScript (vanilla)
- **Display Engine:** Python for e-ink control
- **Platform:** Arch Linux (custom ISO)

## File Structure

```
ScreenSage/
 src/
    main.rs                  # Application entry point
    handlers.rs              # Core HTTP handlers
    models.rs                # Data structures
    battle_handlers.rs       # Combat tracking
    image_handlers.rs        # Media serving
    image_gen_handlers.rs    # AI image generation
    sageslate_handlers.rs    # E-ink display control
    vtt_handler.rs           # Virtual tabletop
    templates/               # HTML templates
    docs/                    # This documentation
 static/
    css/                     # Stylesheets
    js/                      # Frontend JavaScript
 storage/
    wifi_config.json         # WiFi configuration
    scrying_glasses/         # Display configurations
    templates/               # VTT templates
 iso/
     iso-build/               # Custom Arch Linux ISO
```

## Configuration

### WiFi Configuration
See [WiFi & Hotspot Management](wifi_hotspot_feature.md#configuration) for details on configuring network interfaces.

### API Configuration
API keys and endpoints are stored in `storage/api_config.json`:
```json
{
  "api_key": "your-stability-ai-key",
  "endpoint": "https://api.stability.ai/v2beta/stable-image/generate/ultra"
}
```

### Display Configuration
Display settings are stored in JSON files under `storage/scrying_glasses/`:
- `battlemap.json` - Battle map display configuration
- `display.json` - General display settings

## API Overview

ScreenSage provides RESTful APIs for all major features:

### Core Routes
- `GET /` - Main dashboard
- `GET /api/config` - Read configuration files

### WiFi & Hotspot
See [WiFi API Documentation](wifi_hotspot_feature.md#api-endpoints)

### Battle Tracker
- `POST /api/battle/save` - Save battle state
- `GET /api/battle/load` - Load battle state

### Media Management
- `GET /api/images/list` - List directory contents
- `GET /api/images/serve` - Serve media files

### AI Image Generation
- `POST /api/image-gen/generate` - Generate image from prompt
- `POST /api/image-gen/check-credits` - Check API credits

## Development

### Building
```bash
cargo build --release
```

### Running
```bash
./target/release/screen-sage
```

Server runs on `http://0.0.0.0:8080`

### Testing
The application can be tested in a browser or deployed to custom hardware running the ScreenSage ISO.

## ISO Deployment

ScreenSage includes a custom Arch Linux ISO for dedicated hardware deployment. The ISO includes:
- Pre-compiled ScreenSage binary
- Offline Rust toolchain
- WiFi hotspot pre-configured
- Systemd service integration
- Disk installation script

See [WiFi & Hotspot Feature - ISO Installation](wifi_hotspot_feature.md#iso-installation) for hotspot setup details.

## Contributing

When contributing documentation:
- Keep technical accuracy as the top priority
- Include code examples where appropriate
- Cross-reference related documentation
- Update this index when adding new documentation files

## Support

For issues and feature requests, check:
- Existing documentation for troubleshooting guides
- Source code comments for implementation details
- Git commit history for recent changes
