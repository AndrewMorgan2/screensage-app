---
title: "Documentation Update Plan"
---

# Documentation Update Plan

## Files to Move to Legacy Folder

### 1. ScryingGlass Directory (OLD Pygame Implementation)
**Move to:** `legacy/ScryingGlass/`

The entire `ScryingGlass/` directory should be moved as it contains the old Pygame-based implementation that has been replaced by the Pyglet version.

**Reason:** The system now uses `ScryingGlass_pyglet/display_engine_pyglet.py` (confirmed in src/commands.rs:53 and src/commands.rs:65)

### 2. Old Text Files
**Move to:** `legacy/old_txt_files/` (already exists)

These files should be moved into the existing legacy folder:
- `/old_txt_files/hotstop_setup.txt` → Already in legacy
- `/old_txt_files/install_battlemap.txt` → Already in legacy
- `/old_txt_files/to-do.txt` → Already in legacy
- `/old_txt_files/touchscreen.txt` → Already in legacy
- `/build.txt` → Move to legacy

### 3. Outdated/Superseded Documentation
**Move to:** `legacy/docs/`

- `/ScryingGlass/FOG_ZOOM_FIX.md` → Move with ScryingGlass folder
- `/OPENGL_VIDEO_README.md` → Superseded by ScryingGlass_pyglet docs
- `/PROCESS-MANAGER-IMPLEMENTATION.md` → Implementation note, can be archived
- `/RELIABILITY-IMPROVEMENTS.md` → Implementation note, can be archived

### 4. Optional Legacy Moves
- `/Node_setup.md` → If outdated, check if it's still relevant
- `/Wifi_setup.md` → Check if superseded by WIFI_HOTSPOT_SETUP.md

## Documentation That Needs Updating

### 1. README.md  OUTDATED
**Issues:**
- Line 85-86: Says "Python + Pygame for display rendering" → Should be "Python + Pyglet"
- Lines 67-68: References `ScryingGlass/docs/` → Old pygame docs
- Line 203: Says `ScryingGlass/display_engine.py` → Should be `ScryingGlass_pyglet/display_engine_pyglet.py`

**Updates Needed:**
```markdown
# Change on line 85-86:
**Backend:**
- Rust + Actix Web for high-performance HTTP server
- Python + Pyglet for hardware-accelerated display rendering
- JSON for configuration and data storage

# Update line 109:
 ScryingGlass_pyglet/    # Pyglet display engine (current)
 ScryingGlass/           # Legacy pygame engine (deprecated)

# Update lines 67-68:
###  Feature Documentation
- **ScryingGlass Quick Start** - Display system guide
- **[Zoom & Pan Guide](ScryingGlass_pyglet/ZOOM_PAN_GUIDE.md)** - Navigation controls
- **[Implementation Summary](ScryingGlass_pyglet/IMPLEMENTATION_SUMMARY.md)** - Technical details

# Update line 203:
python ScryingGlass_pyglet/display_engine_pyglet.py --help
```

### 2. FEATURES.md  NEEDS NEW SECTIONS
**Missing:**
- Battle Tracker features (round increment/decrement, damage editor)
- Command Center monitor selection
- Piechart generation
- VTT element defaults system

**Add Section:**
```markdown
## Battle Tracker Features

### Combat Management
- **Initiative Tracking**: Parse combatants with dice notation support
- **Turn Management**: Next turn, reset combat controls
- **Round Controls**: Increment/decrement buttons for manual round adjustment
- **HP Tracking**: Damage/healing application with visual log
- **Damage Statistics**: Track damage dealt per combatant

### Damage Editor
- **Collapsible Editor**: Edit damage stats before generating charts
- **Real-time Updates**: Values update immediately
- **Pie Chart Generation**: Visual damage distribution charts
- **Virtual Environment**: Uses correct Python environment with matplotlib

Location: Battle tab in web interface

## Command Center Features

### Multi-Monitor Support
- **Dynamic Monitor Selection**: Dropdown menus for battlemap and display screens
- **Hyprland/X11 Detection**: Auto-detects available monitors
- **Workspace Management**: Automatic workspace switching for fullscreen windows

Location: Command Center tab → Start VTT Battle/Display Screen

## VTT Element Defaults

Element templates stored in `storage/vtt_configs/element_defaults.json`:
- Consistent default values for all element types
- Customizable per-project
- Applied when adding new elements
```

### 3. TODO.md  NEEDS UPDATE
**Completed Items to Mark:**
- [x] Auto-detect screen dimensions  (Already marked)
- [x] Battle tracker enhancements  (Round controls, damage editor)
- [x] Monitor selection UI 
- [x] Python environment fixes 

**Add Recent Completions:**
```markdown
## Recently Completed (2026-01-09)

### Battle Tracker 
- [x] Round increment/decrement buttons
- [x] Collapsible damage editor
- [x] Matplotlib integration fix
- [x] Damage stats for pie charts

### Command Center 
- [x] Monitor selection dropdowns
- [x] Hyprland/Wayland support
- [x] Workspace auto-switching

### Bug Fixes 
- [x] Compiler warnings (dead code annotations)
- [x] Python virtual environment path fixes
```

### 4. INSTALLATION.md  MOSTLY GOOD
**Minor Updates:**
- Add note about Pyglet vs Pygame (historical context)
- Verify all dependencies are listed

### 5. Missing Documentation to Create

#### A. BATTLE_TRACKER.md (NEW)
Complete guide to the battle tracker features:
- Combat setup and parsing
- Initiative management
- Damage tracking
- Damage editor
- Pie chart generation
- Round controls
- VTT display integration

#### B. COMMAND_CENTER.md (NEW)
Guide for the command center:
- VTT status monitoring
- Monitor selection
- Starting/stopping displays
- Available commands

#### C. CURRENT_ARCHITECTURE.md (NEW)
Updated architecture document:
- Rust backend (Actix Web)
- Pyglet display engine
- WebSocket/HTTP communication
- File structure
- Module organization
- Storage system

## Documentation Structure Proposal

```
ScreenSage/
 README.md                       # Main entry (NEEDS UPDATE)
 FEATURES.md                     # Feature guide (NEEDS UPDATE)
 INSTALLATION.md                 # Setup guide ( GOOD)
 TODO.md                         # Roadmap (NEEDS UPDATE)
 ARCHITECTURE.md                 # NEW: System architecture
 BATTLE_TRACKER.md              # NEW: Battle tracker guide
 COMMAND_CENTER.md              # NEW: Command center guide
 TOUCHSCREEN_SETUP.md           #  GOOD
 WIFI_HOTSPOT_SETUP.md          #  GOOD
 USEFUL_COMMANDS.md             #  GOOD
 ISO-BUILD.md                   #  GOOD (specialized)

 ScryingGlass_pyglet/           # Current implementation
    README.md                  #  GOOD
    QUICK_START.md            #  GOOD
    ZOOM_PAN_GUIDE.md         #  GOOD
    IMPLEMENTATION_SUMMARY.md  #  GOOD

 src/docs/                      # Backend docs (needs review)
 static/docs/                   # Frontend docs (needs review)

 legacy/                        # Archive folder
     ScryingGlass/             # Old pygame implementation
        docs/                 # Old docs
        *.py                  # Old code
     docs/                     # Superseded documentation
        OPENGL_VIDEO_README.md
        PROCESS-MANAGER-IMPLEMENTATION.md
        RELIABILITY-IMPROVEMENTS.md
     old_txt_files/            # Text file archive
         *.txt                 # Old text docs
```

## Priority Action Items

### High Priority (Do First)
1.  Move `ScryingGlass/` to `legacy/ScryingGlass/`
2.  Move `build.txt` to `legacy/`
3.  Update README.md (Pygame → Pyglet, fix paths)
4.  Update FEATURES.md (add new sections)
5.  Update TODO.md (mark completed items)

### Medium Priority
6.  Create BATTLE_TRACKER.md
7.  Create COMMAND_CENTER.md
8.  Create ARCHITECTURE.md

### Low Priority
9.  Review and consolidate src/docs/
10.  Review and consolidate static/docs/
11.  Add video tutorials (long-term)

## Cross-References to Add

All documentation should link to related docs:

**README.md links:**
- Battle Tracker Guide
- Command Center Guide
- Architecture

**FEATURES.md links:**
- Battle Tracker Details
- [Pyglet Implementation](ScryingGlass_pyglet/README.md)

**INSTALLATION.md links:**
- Architecture Overview
- Quick Start

## Version History to Add

Add version/date stamps to documentation:
- Last updated dates
- Version numbers (if applicable)
- Link to changelog/commits

---

**Generated:** 2026-01-09
**Purpose:** Organize and update Screen Sage documentation
