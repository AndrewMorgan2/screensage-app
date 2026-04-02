---
title: "Backend (Rust)"
---

# Backend — How It Works

ScreenSage's backend is a Rust [Actix-web](https://actix.rs/) server running on `0.0.0.0:8080`. It serves the web UI, handles API calls from the browser, runs shell commands on the host system, and manages file I/O for JSON configs and media.

---

## Request Flow

```
Browser → HTTP request → Actix route → handler function
                                          ↓
                               Shell command / file read/write
                                          ↓
                               JSON response back to browser
```

Every tab in the UI maps to a handler file. The browser makes `fetch()` calls; the server responds with JSON or HTML.

---

## File Map

| File | Responsibility |
|------|---------------|
| `main.rs` | Entry point — wires routes, initialises shared state |
| `handlers.rs` | General commands, config read, WiFi management |
| `battle_handlers.rs` | Combat tracker state (in-memory) |
| `image_handlers.rs` | Directory listing, media serving |
| `upload_handlers.rs` | File upload → disk |
| `json_handlers.rs` | Read / write arbitrary JSON files |
| `sageslate_handlers.rs` | Pushes images to e-ink displays |
| `vtt_handler.rs` | Serves the VTT page |
| `display_handler.rs` | Serves the Display page |
| `commands.rs` | Predefined shell commands (start/stop screens etc.) |
| `template_loader.rs` | Loads HTML templates, does `{{var}}` substitution |

---

## Shared State

Two pieces of data live for the lifetime of the process:

**Predefined commands** — loaded once at startup from `commands.rs`, shared read-only across all requests via `web::Data<HashMap<String, PredefinedCommand>>`.

**Battle state** — a `Mutex<HashMap<String, BattleState>>` keyed by session ID. Any handler can lock it, read or write the current combat state, then release. There is no database; state is lost on restart.

---

## Key Handler Groups

### Command Execution (`handlers.rs`)

`POST /execute` and `GET /run/{command_id}` both ultimately do the same thing: run a shell command on the host and return stdout/stderr/exit code as JSON. The predefined commands in `commands.rs` are things like:

- `stop-vtt` — kills the Python display process
- `start-battlemap-screen` — launches ScryingGlass on a given monitor
- `list-monitors` — runs `xrandr` to find connected displays

This is how the Command Centre tab works — every button is a predefined command sent to `/run/{id}`.

### JSON Config (`json_handlers.rs`)

`GET /json/read?path=...` and `POST /json/save` read and write JSON files anywhere on the filesystem. The VTT editor uses these to load a scene config, let you edit it in the browser, then write it back — which ScryingGlass picks up via its file watcher.

### Media (`image_handlers.rs`)

`GET /api/images/list?path=...` returns directory contents filtered to supported media types (jpg, png, gif, webp, mp4, webm, etc.), sorted with folders first.

`GET /api/images/serve?path=...` reads the file and returns it with the correct MIME type. This is how the browser plays videos or shows images that live outside the static folder.

### Battle Tracker (`battle_handlers.rs`)

The browser sends a full `BattleState` to `POST /api/battle/save` after every change (turn advance, HP change, etc.). `GET /api/battle/load` retrieves it. State lives in the `Mutex<HashMap>` — there's no persistence to disk.

A `BattleState` holds:
- `combatants` — list of name, initiative, current HP, max HP, AC, type
- `current_turn`, `round`, `active_combatant_id`

### SageSlate (`sageslate_handlers.rs`)

Handles requests from the SageSlate tab to push an image to an e-ink device. It opens a TCP connection to the device's IP (port 8080), converts the image to 1-bit packed bytes matching the display's resolution, and streams the data. The ESP32 on the other end receives it and refreshes the screen.

---

## Template System (`template_loader.rs`)

HTML pages are built from templates in `src/templates/`. The loader reads each template file at startup and holds them in a `HashMap<String, String>`. Rendering does simple `{{variable}}` string substitution — no external templating engine.

`render_with_base()` wraps a page template inside the shared base layout (nav, head, scripts) and injects the correct `<script>` tag for the page being rendered.

---

## API Summary

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/` | Main dashboard |
| GET | `/api/config?path=` | Read a JSON config file |
| POST | `/execute` | Run an arbitrary shell command |
| GET | `/run/{id}` | Run a predefined command |
| GET | `/api/images/list?path=` | List a directory |
| GET | `/api/images/serve?path=` | Serve a media file |
| POST | `/api/upload/image` | Upload an image |
| GET | `/json/read?path=` | Read a JSON file |
| POST | `/json/save` | Write a JSON file |
| POST | `/api/battle/save` | Save battle state |
| GET | `/api/battle/load` | Load battle state |
| GET | `/api/wifi/scan` | Scan WiFi networks |
| POST | `/api/wifi/connect` | Connect to a network |
