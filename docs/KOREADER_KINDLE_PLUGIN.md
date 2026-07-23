---
title: "KOReader Plugin for Kindle"
---

# KOReader Plugin for Kindle

A native [KOReader](https://koreader.rocks/) client for ScreenSage's Kindle character sheets — the same data as the [`/kindle` browser page](FEATURES.md#kindle-character-sheets), rendered as a custom full-screen KOReader widget instead of an HTML page. Useful because the stock Kindle browser has no real full-screen/kiosk mode (no way to hide its address bar), while KOReader is a native reader app that already owns the whole screen.

---

## How it's built

`koreader-plugin/charactersheet.koplugin/` is a standard KOReader plugin: a `_meta.lua` (name/description) and a `main.lua` that extends `WidgetContainer` and registers itself into KOReader's main menu via `self.ui.menu:registerToMainMenu(self)`.

- **Networking:** plain HTTP via KOReader's bundled `socket.http` + `ltn12` (LuaSocket), the same stack most KOReader plugins that talk to a server use (see `wallabag.koplugin` in KOReader's own source for another real example). JSON is encoded/decoded with KOReader's bundled `json` module.
- **UI:** a custom full-screen, continuously **scrollable** view (`ScrollableContainer` wrapping a `VerticalGroup` of rows — the same pattern KOReader's own font chooser and button dialogs use), not KOReader's generic paginated/nested menu system. "Switch Character" and "Close" sit pinned at opposite top corners. HP is a `ProgressWidget` bar (tap it to adjust via a small +1/-1 dialog). Tapping an ability expands its description **inline**, border-less, pushing the rows below it down — like a drop-down, not a popup — rather than opening a separate dialog.
- **API:** hits the exact same routes the browser page uses — `GET /api/kindle/characters`, `GET /api/kindle/character?char=<id>`, `POST /api/kindle/hp?char=<id>`, `POST /api/kindle/ability/<id>/<use|reset>?char=<id>` (see `src/kindle_handlers.rs`). Nothing server-side is plugin-specific; both clients read/write the same `storage/kindle_characters/*.json` files.
- **Data quirk:** ScreenSage stores `stats`/`combat` as plain JSON objects (`{"Strength": "16 (+2)", ...}`), not ordered arrays. Lua tables don't preserve key order for string keys, so those two sections may render in a different order each time the sheet loads. Harmless, just cosmetic — not worth a server-side schema change for.

!!! warning "Gotcha: KOReader's JSON `null` isn't Lua `nil`"
    KOReader's bundled JSON library decodes a JSON `null` as a self-referential function sentinel (`json.util.null` — literally `local function null() return null end`), not Lua's `nil`. A plain `if ability.uses then` check is therefore **truthy** even when the field was `null`, and indexing into it crashes. Check the real type instead: `type(ability.uses) == "table"`. This bit the standalone kindle-sheet project's own KOReader plugin during development and is worth knowing before extending this one.

## Setting up the Kindle

This plugin needs a jailbroken Kindle with KOReader installed. For the full from-scratch walkthrough (jailbreak, hotfix, KUAL, hotspot, firewall), see [Kindle Jailbreak & Setup Runbook](KINDLE_JAILBREAK.md). Quick links if you just need the source:

- **Jailbreak:** [kindlemodding.org](https://kindlemodding.org/jailbreaking/) — check your exact firmware version first (Settings → Device Options → Device Info) and use the jailbreak method currently matched to it.
- **KOReader:** [koreader.rocks](https://koreader.rocks/) for the app itself, or [kindlemodding.org's KOReader install guide](https://kindlemodding.org/jailbreaking/post-jailbreak/koreader.html) for getting it onto a freshly-jailbroken Kindle via KUAL.

## Installing this plugin

1. Copy `koreader-plugin/charactersheet.koplugin/` into KOReader's `plugins/` directory on the device (`/mnt/us/koreader/plugins/` when connected over USB).
2. Restart KOReader so it picks up the new plugin (plugins load once at startup).
3. Main menu → tools icon → **Character Sheet**. The server address is hardcoded (`DEFAULT_SERVER` near the top of `main.lua`, currently your hotspot's gateway address) rather than exposed as a settings entry — edit and redeploy the file if ScreenSage is reachable somewhere else. There's no separate "configure the server" step for normal use.
4. Pick a character from the full-screen list that appears. Scroll to see everything on their sheet; tap HP to adjust it, tap an ability to expand its description in place.

Both the browser page and this plugin talk to the same server and the same character files — changes made from one show up immediately in the other.

**Firewall:** if the Kindle joins your hotspot but the plugin still can't reach ScreenSage ("Could not reach ScreenSage" on the character picker), check your laptop's firewall — `ufw` blocks incoming connections by default even on a hotspot you just created. Open port 8080 for the hotspot's subnet:
```
sudo ufw allow from 192.168.12.0/24 to any port 8080 proto tcp
```
(Adjust the subnet if your hotspot uses a different range than `192.168.12.0/24`.) This is a one-time rule — it persists across hotspot restarts, just not across `ufw reset`.

## Updating the plugin

KOReader loads plugin Lua code once at startup, not on demand — so after changing anything in `charactersheet.koplugin/`, the new code has to actually reach the device and KOReader has to be restarted before it takes effect. Just reopening the Character Sheet menu entry will keep running the old code.

1. Copy the changed file(s) to `/mnt/us/koreader/plugins/charactersheet.koplugin/` on the device, overwriting what's there. Two ways to get files onto the device:
   - **USB mass storage** — plug in, drag the file(s) over, eject.
   - **SCP over USBNetLite** — faster for repeated edit/test cycles, since you don't have to remount and eject each time. Requires the USBNetLite KOReader extension enabled (Toggle USB Network from its KUAL menu) and a static IP set on the host side for the RNDIS link it creates — see [Kindle Jailbreak & Setup Runbook § 8](KINDLE_JAILBREAK.md#8-optional-ssh-access-for-debugging) for the exact commands, not repeated here.
2. Fully exit KOReader (not just back out of the menu) and relaunch it from KUAL.
3. If it crashes on the new code, KOReader's own `crash.log` (`/mnt/us/koreader/crash.log`) has the real Lua traceback — check it over SSH (needs USBNetLite, same as above) rather than guessing from the on-screen error alone, which is usually just a generic "could not be started" message.

## Relationship to the standalone kindle-sheet project

This plugin, and ScreenSage's `/kindle` browser page, are the *integrated* version of a feature that started life as a fully standalone project (`~/Projects/kindle-sheet`, outside this repo) — a jailbroken Kindle talking to a small Python server over a laptop WiFi hotspot, with no ScreenSage dependency at all. That standalone version still exists and works independently on **port 8000**; this integrated version runs on ScreenSage's normal port (**8080**) alongside everything else. They are separate servers with separate character data — don't point one project's client at the other's port. The jailbreak/hotspot runbook itself now lives here rather than only in the standalone project — see [Kindle Jailbreak & Setup Runbook](KINDLE_JAILBREAK.md).
