---
title: "Development Roadmap"
---

# Screen Sage Development Roadmap

Track ongoing development, completed features, and future plans for Screen Sage.

## Table of Contents
- [In Progress](#in-progress)
- [High Priority](#high-priority)
- [Future Features](#future-features)
- [Long-term Goals](#long-term-goals)
- [Documentation Needs](#documentation-needs)

## In Progress

### Documentation 
- [ ] Update README.md to be a comprehensive GitHub page
- [ ] Review all documentation in `/docs` folders
- [x] Add all current features to documentation
- [ ] Improve code documentation and examples
- [ ] Feature to have tick box so that an image is loaded into a "fresh" json config

## High Priority

### Automation
- [x] Auto-detect screen dimensions 

### Documentation
- [ ] Make setup script
  - List of `sudo apt install` commands
  - One-command installation
  - Dependency verification

## Future Features

### Fog System
- [ ] Tool to add fog-blocking walls into JSON map
  - Visual wall editor
  - Import from map images
  - Save wall presets

### Performance
- [ ] Optimize for separate device webpage access
  - Currently works but could be faster
  - Reduce network bandwidth
  - Improve rendering performance
  - Cache static assets better
  - WebSocket for real-time updates?

### UI/UX Improvements
- [x] UI controls to toggle between absolute/percentage in VTT
- [x] SageSlate Player Aid Manager — collapsible layout matching VTT/Display pattern
- [x] Per-tab preview scale limits (SageSlate 250%, Battlemap/Display 150%)
- [ ] Fog color picker in Add Fog dialog
- [ ] Visual fog preview in VTT preview area

## Long-term Goals

### Platform Integration
- [ ] Unity integration for Tilt 5
  - 3D battlemap support
  - AR glasses integration

### Network Features
- [x] File transfer system 
  - ~~Bones in place~~ → NFS replaced this
  - Works well with current setup

### E-Ink Displays
- [x] SageSlate Player Aid Manager UI overhaul
- [ ] Improved SageSlate features
  - Partial refresh support
  - Battery monitoring

### Media Management
- [ ] Advanced media browser
  - Category/tag system
  - Search functionality
  - Favorites/bookmarks

## Documentation Needs

### User Documentation
- [x] Touchscreen setup guide 
- [x] Installation guide 
- [x] Useful commands reference 
- [ ] Video tutorials
- [ ] Quick start guide
- [ ] Common workflows guide
- [ ] Troubleshooting FAQ

### Developer Documentation
- [ ] Architecture overview
- [ ] API documentation
- [ ] Module system explanation
- [ ] Contributing guidelines
- [ ] Code style guide

### Feature Documentation
- [x] VTT coordinate system guide (FEATURES.md)
  - Absolute vs percentage
  - Relative float handling
  - Canvas scale factor
- [x] Element types reference — area, cone alpha transparency documented
- [x] Draw page documentation — live sync, coordinate handling, clear behaviour
- [x] SageSlate Player Aid Manager documented
- [ ] Fog system complete guide
  - Wall fog mechanics
  - Configuration options
  - Best practices
- [ ] Element types reference — remaining types (token, line, text, image, video, GIF, SVG)

## Contributing

Want to help with any of these features? Check out our contributing guidelines (coming soon) or open an issue on GitHub!

## Feature Requests

Have an idea for Screen Sage? Open an issue on GitHub with:
- Clear description of the feature
- Use cases
- Priority level (in your opinion)
- Willingness to contribute

---

Last updated: 2026-04-13

*This roadmap is subject to change based on community feedback and development priorities.*
