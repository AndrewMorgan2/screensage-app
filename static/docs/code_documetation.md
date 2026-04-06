# Screen Sage - JavaScript Documentation

## Overview

Screen Sage is a comprehensive tabletop gaming application that provides virtual tabletop (VTT) functionality, e-ink display management, and combat tracking. The application is built with a modular JavaScript architecture and provides tools for dungeon masters and players to enhance their gaming experience.

## Architecture Overview

The application follows a modular architecture with several main components:

1. **Core Modules**: Common utilities and shared functionality
2. **VTT System**: Virtual tabletop for managing maps and game elements
3. **Image Management**: File browsing and display
4. **E-ink Integration**: SageSlate device management
5. **Combat Tracker**: Initiative and damage tracking system

## Core Modules

### common.js
**Purpose**: Shared utilities and common functions used across the application.

#### Functions
- `executeCommand(commandId)`: Executes server commands and displays results
- `showError(element, message, timeout)`: Displays temporary error messages

### imageUploader.js
**Purpose**: Handles file upload functionality for images.

#### Functions
- `uploadImageToServer(file)`: Uploads images to the server
- `updateJsonWithImagePath(jsonInputId, imagePath, width, height)`: Updates JSON with uploaded image metadata
- `createImageElement(path, name)`: Creates HTML image elements using server endpoints
- `updatePreviewWithImage(previewContainerId, imagePath)`: Updates preview containers with uploaded images

## Image Management System

### image-browser.js
**Purpose**: File browser for navigating and selecting media files.

#### Key Features
- Directory navigation with breadcrumb support
- Image and video file preview
- Media file copying and VTT integration
- Support for both battlemap and display VTT sources

#### Core Functions
- `loadDirectory(path)`: Loads and displays directory contents
- `displayMedia(path, name, type)`: Shows selected media in viewer
- `copyMediaPath()`: Copies file path to clipboard
- `displayMediaInVTT(screen)`: Sends media to VTT display

## Virtual Tabletop (VTT) System

The VTT system is built with a modular architecture supporting multiple display types.

### vtt-main.js & display-main.js
**Purpose**: Main entry points for battlemap and display VTT instances.

#### Features
- Dual VTT support (battlemap and display)
- Responsive scaling and preview
- Real-time element synchronization
- Configuration management

### vtt-controls-module.js
**Purpose**: Manages UI controls for VTT elements.

#### Supported Element Types
- **Token**: Circular markers for characters
- **Area**: Rectangular regions
- **Text**: Customizable text overlays
- **Video**: Video file playback
- **Image**: Static image display
- **SVG**: Scalable vector graphics with color modification
- **GIF**: Animated image support
- **Line**: Straight line drawing
- **Cone**: Cone-shaped areas (for spells/abilities)

#### Key Functions
- `parseJsonAndGenerateControls()`: Creates UI controls from JSON configuration
- `addNewElement(type)`: Adds new elements to the map
- `updateElementProperty(element, property, value)`: Updates element properties in real-time
- `saveConfig()`: Saves configuration to file

### vtt-preview-module.js
**Purpose**: Handles the visual rendering and scaling of VTT elements.

#### Features
- Responsive scaling for different screen sizes
- Real-time element rendering
- Background image/video support
- Coordinate system conversion

#### Key Functions
- `renderPreviewElement(element)`: Renders elements in preview area
- `mapToPreviewCoords(x, y)`: Converts map coordinates to preview coordinates
- `updatePreviewAreaSize()`: Adjusts preview area based on map dimensions
- `initializeMap()`: Sets up background and initial display

### vtt-draggable-module.js
**Purpose**: Implements drag-and-drop functionality for VTT elements.

#### Features
- Mouse and touch event support
- Boundary checking
- Real-time position updates
- Multi-element type support

#### Key Functions
- `makeDraggable()`: Initializes drag functionality
- `startDragging(element, clientX, clientY)`: Begins drag operation
- `moveElement(clientX, clientY)`: Updates element position during drag
- `finalizeElementPosition()`: Completes drag operation and saves changes

## E-ink Display System (SageSlate)

### sageslate.js
**Purpose**: Manages e-ink tablet connections and image transmission.

#### Features
- Device discovery and status monitoring
- Network connectivity checking
- Image transmission to e-ink displays
- Device management interface

#### Key Functions
- `sendImage(path, einkScreenSelect)`: Sends images to selected e-ink device
- `fetchDeviceStatus()`: Checks device connectivity
- `renderDevices()`: Updates device status display

### sageslate-players.js
**Purpose**: E-ink display editor with real-time preview.

#### Features
- Visual element editor
- Real-time preview
- Image background support
- Element property controls (transparency, grayscale, positioning)

#### Supported Elements
- Box shapes
- Circles
- Text with font controls
- Progress bars

#### Key Functions
- `parseJsonAndGenerateControls()`: Creates editor controls
- `addNewElement(type)`: Adds new elements
- `executeImageGeneration()`: Generates final e-ink image
- `updateElementProperty(element, property, value)`: Real-time property updates

### sageslate-jsons.js
**Purpose**: Template management for e-ink displays.

#### Functions
- `loadTemplate(path, name, type)`: Loads saved templates
- `saveTemplate(path, jsonContent)`: Saves current configuration
- `refresh()`: Updates file browser

## Combat Tracking System

### battle-main.js & battle-controller.js
**Purpose**: Main combat tracking application with centralized state management.

#### Architecture
- **BattleController**: Main coordinator
- **CombatManager**: Combat mechanics
- **VTTController**: Display integration
- **UiController**: User interface management

### combat-manager.js
**Purpose**: Core combat mechanics and initiative tracking.

#### Features
- Dice notation parsing (e.g., "d20+5", "2d6+1")
- Automatic initiative rolling
- Health tracking and damage application
- Combat round management

#### Key Functions
- `parseCombatants(showSuccess)`: Parses combatant input text
- `rollDice(diceNotation)`: Handles dice expressions
- `nextTurn()`: Advances to next combatant
- `applyHealthChange()`: Processes damage/healing
- `removeCombatant(targetIndex)`: Removes defeated combatants

#### Input Format
```
[initiative] [name] [AC] [HP]
d20+5 Aragorn 16 45
d20+2 Goblin Chief 15 30
```

### ui-controller.js
**Purpose**: User interface management for combat tracker.

#### Features
- Initiative list rendering
- Damage logging
- Status panel updates
- Pie chart generation for damage statistics

#### Key Functions
- `renderInitiativeList()`: Updates initiative display
- `addDamageLogEntry(sourceName, targetName, healthChange, oldHp, newHp)`: Logs combat actions
- `generateChartCommand()`: Creates damage statistics visualization

### vtt-controller.js
**Purpose**: Integration between combat tracker and VTT displays.

#### Features
- Initiative order display on VTT
- Turn indicators
- Combat UI overlay management
- Character limit controls for text display

#### Key Functions
- `updateInitiativeOrder(combatants, activeIndex, turnNumber)`: Updates VTT display
- `startCombatDisplay()`: Adds combat UI to VTT
- `endCombatDisplay()`: Removes combat UI from VTT
- `formatInitiativeOrder(combatants, activeIndex)`: Formats initiative text

## API Integration

### Server Endpoints Used
- `/api/images/list`: Directory browsing
- `/api/images/view`: Image/video serving
- `/api/upload/image`: File upload
- `/json/read`: JSON configuration loading
- `/json/save`: JSON configuration saving
- `/execute`: Command execution
- `/run/command`: Shell command execution

## Configuration Management

### JSON Structure
The application uses JSON files for configuration with the following pattern:

```json
{
  "background": {
    "src": "path/to/background.jpg",
    "width": 1920,
    "height": 1080
  },
  "elements": [
    {
      "type": "token",
      "id": "unique_id",
      "x": 100,
      "y": 100,
      "size": 50,
      "color": "#3498db",
      "label": "Character Name"
    }
  ]
}
```

### File Locations
- VTT Configs: `./storage/vtt_configs/`
- Display Configs: `./storage/display_configs/`
- SageSlate Configs: `./storage/sageslate_configs/`
- Active Configs: `./storage/scrying_glasses/`

## Event System

### Real-time Updates
- Element property changes trigger immediate preview updates
- JSON synchronization happens automatically
- VTT displays update in real-time during combat

### User Interactions
- Click and drag for element positioning
- Slider controls for numeric properties
- Text inputs for content and paths
- Color pickers for visual properties

## Error Handling

### Common Patterns
- Try-catch blocks around JSON parsing
- Network request error handling
- File loading fallbacks
- User input validation

### Logging
- Console logging for debugging
- User-visible error messages
- Command output display
- System status updates

## Performance Considerations

### Optimization Techniques
- Debounced updates for frequent changes
- Efficient coordinate transformations
- Minimal DOM manipulation
- Responsive scaling calculations

### Memory Management
- Element cleanup on removal
- Event listener management
- Image loading optimization
- JSON state synchronization

## Browser Compatibility

### Supported Features
- Modern ES6+ JavaScript
- Fetch API for network requests
- Canvas and SVG rendering
- Touch events for mobile devices
- File API for uploads

### Limitations
- No localStorage usage (by design)
- Requires modern browser support
- WebGL not utilized
- No offline functionality

## Extension Points

### Adding New Element Types
1. Update `vtt-controls-module.js` with new element controls
2. Add rendering logic to `vtt-preview-module.js`
3. Update drag functionality in `vtt-draggable-module.js`
4. Add to element creation buttons

### Custom Commands
1. Extend command execution in relevant modules
2. Add server-side command handlers
3. Update UI with new controls
4. Add error handling and validation

### New Display Types
1. Create new main entry point file
2. Configure element references
3. Set up module instances
4. Add specific functionality as needed