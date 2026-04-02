---
title: "Frontend (JS)"
---

# Frontend — How It Works

The frontend is vanilla JavaScript — no frameworks. Each tab in the UI has its own entry-point script that initialises a set of modules. Everything communicates with the Rust backend via `fetch()`.

---

## Overall Pattern

```
User action in browser
      ↓
JS module updates local JSON state
      ↓
POST /json/save  →  writes file to storage/
      ↓
ScryingGlass watchdog detects change → rerenders display
```

The browser is the editor. The JSON files on disk are the source of truth for what ScryingGlass shows.

---

## Module Map

| File | Tab / Purpose |
|------|--------------|
| `vtt-main.js` | VTT tab entry point |
| `display-main.js` | Display tab entry point |
| `vtt-controls-module.js` | Renders element controls from JSON; handles edits |
| `vtt-preview-module.js` | Draws a live in-browser preview of the scene |
| `vtt-draggable-module.js` | Drag-and-drop repositioning of elements |
| `battle-main.js` | Battle tracker entry point |
| `battle-controller.js` | Coordinates combat sub-modules |
| `combat-manager.js` | Initiative parsing, dice rolling, HP tracking |
| `ui-controller.js` | Renders initiative list, damage log, pie charts |
| `vtt-controller.js` | Pushes combat state to the VTT display overlay |
| `sageslate.js` | E-ink device list, sends images to displays |
| `sageslate-players.js` | Visual e-ink layout editor with preview |
| `sageslate-jsons.js` | Template save / load for e-ink layouts |
| `image-browser.js` | File browser for navigating media directories |
| `common.js` | Shared utilities (`executeCommand`, `showError`) |
| `imageUploader.js` | File upload and JSON path injection |

---

## VTT System

The VTT and Display tabs share the same module stack — `vtt-main.js` and `display-main.js` are thin wrappers that configure module instances with different element ID prefixes (`""` vs `"2"`).

**How a scene edit works:**

1. User loads a JSON config via the file picker — `GET /json/read` returns the JSON.
2. `vtt-controls-module.js` walks the JSON and builds a control row for each element (sliders, colour pickers, text inputs).
3. Any control change calls `updateElementProperty()` → updates the in-memory JSON object → calls `saveConfig()` → `POST /json/save`.
4. ScryingGlass sees the file change and re-renders on the player screen.
5. Simultaneously, `vtt-preview-module.js` re-renders the browser-side miniature preview.

**Drag and drop:** `vtt-draggable-module.js` listens for mouse/touch events on preview elements. On `mouseup` it writes the new x/y back into the JSON and saves.

**Coordinate formats:** All three are supported — absolute pixels (`100`), percentage strings (`"50%"`), and relative floats (`0.5`). The preview module handles conversion.

### Supported Element Types

Token, Area, Text, Image, Video, GIF, SVG, Line, Cone. Each has a corresponding control template and preview renderer.

---

## Battle Tracker

The tracker is split into four collaborating objects:

| Object | Job |
|--------|-----|
| `BattleController` | Top-level coordinator, wires the others together |
| `CombatManager` | Owns all combatant data, processes turns and damage |
| `UiController` | Renders the initiative list, log entries, damage charts |
| `VTTController` | Formats and pushes the current initiative order to the VTT display |

**Input format** (one combatant per line):
```
[initiative] [name] [AC] [HP]
d20+5 Aragorn 16 45
10 Goblin 13 7
```

`parseCombatants()` in `combat-manager.js` reads this, rolls dice expressions, sorts by result, and builds the combatant list. From there, `nextTurn()` / `applyHealthChange()` mutate state and notify the UI.

The full `BattleState` is sent to `POST /api/battle/save` after every change so it survives page refreshes.

Damage statistics are visualised as a pie chart — `generateChartCommand()` calls a predefined backend command that runs a Python matplotlib script.

---

## SageSlate (E-Ink)

`sageslate.js` manages the list of known e-ink devices (stored by IP). Clicking "Send Image" calls `sendImage(path, deviceIP)`, which hits a backend endpoint that opens a TCP connection to the ESP32 and streams the pixel data.

`sageslate-players.js` is a separate layout editor — you build a composition (boxes, circles, text, progress bars) visually, with a live preview. `executeImageGeneration()` sends the layout to the backend, which renders it to a bitmap and pushes it to the selected display.

---

## Image Browser

`image-browser.js` calls `GET /api/images/list?path=` to populate a folder tree. Clicking a file calls `displayMedia()` to preview it in the panel. From there you can:
- Copy the path to clipboard
- Send it directly to the VTT battlemap or display via `displayMediaInVTT()`

---

## File Locations (Storage)

| Path | Contents |
|------|---------|
| `storage/scrying_glasses/` | Active display configs (what ScryingGlass is showing) |
| `storage/vtt_configs/` | Saved VTT scene templates |
| `storage/display_configs/` | Saved Display scene templates |
| `storage/sageslate_configs/` | E-ink layout templates |
