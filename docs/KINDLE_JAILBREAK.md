---
title: "Kindle Jailbreak & Setup Runbook"
---

# Kindle Jailbreak & Setup Runbook

A from-scratch walkthrough for jailbreaking a Kindle Paperwhite and getting it talking to ScreenSage over a local WiFi hotspot, no internet involved at any point. This is the reusable runbook for setting up *another* Kindle — for what to actually do on the device once it's jailbroken, see [KOReader Plugin for Kindle](KOREADER_KINDLE_PLUGIN.md) (or the `/kindle` browser page described in [Features](FEATURES.md#kindle-character-sheets)).

Everything here was worked out live against one specific device (10th-gen Kindle Paperwhite, firmware 5.18.1) in July 2026. Jailbreak exploits get patched by Amazon and superseded by newer community tools over time — if a step below stops matching reality, check [kindlemodding.org](https://kindlemodding.org) for the current method rather than assuming this doc is still accurate.

---

## 0. Check your exact firmware first

Settings → All Settings → Device Options → Device Info → read the **entire** version string. Jailbreak exploits are matched to specific firmware ranges; using the wrong one can fail or (rarely) soft-brick the device. As of this writing, the current jailbreak for firmware **5.18.1–5.18.5** on ad-supported 10th-gen+ devices is **AdBreak**. Older firmware uses **WinterBreak** instead — check [kindlemodding.org/jailbreaking](https://kindlemodding.org/jailbreaking/) for the current recommendation for your exact version.

## 1. Enable Special Offers (ads) — required for the AdBreak exploit

The exploit is triggered via a crafted lockscreen ad, so the device needs ads enabled even if it's normally ad-free:

1. On amazon.com → Accounts & Lists → **Content & Devices** → Devices → your Kindle → **Special Offers** → turn on. (Can be turned back off after.)
2. If Special Offers isn't offered at all for the device, your account region probably doesn't match where the device is registered — check Country/Region Settings first. This mismatch is the most common silent failure.
3. Connect the Kindle to WiFi and leave it a while to actually download an ad. Confirm via the "…" menu → **View All Ads** — you should see entries there before proceeding. If nothing shows up after a long wait, a factory reset often fixes it (re-provisions the device cleanly).

## 2. Run the jailbreak (AdBreak)

Full instructions: [kindlemodding.org/jailbreaking/AdBreak](https://kindlemodding.org/jailbreaking/AdBreak/)
Download: [github.com/KindleModding/AdBreak/releases](https://github.com/KindleModding/AdBreak/releases)

1. Once ads are confirmed visible, **turn on Airplane Mode**. This is important — it stops the device from grabbing an OTA update mid-process, which would patch the exploit out from under you.
2. Connect via USB. On the Kindle, open `system/.assets` (note: this is a dotfile-prefixed folder — on Linux, `ls` needs `-a`/`-la` or you'll wrongly conclude it doesn't exist; on Windows, "show hidden files" alone isn't enough, you also need to uncheck "hide protected operating system files").
3. Copy the **entire** `.assets` folder to your computer.
4. Unzip the AdBreak release into that copied `.assets` folder — `jb.sh`, `patchedUks.sqsh`, `adbreak.html` etc. end up sitting at the top level of `.assets`, alongside the existing per-ad subfolders.
5. Overwrite every `details.html` inside those per-ad subfolders with the contents of `adbreak.html`:
   ```
   find . -name 'details.html' -exec cp adbreak.html {} \;
   ```
6. Copy this whole modified `.assets` folder back onto the Kindle, replacing the original at `system/.assets`.
7. Unplug. Tap a lockscreen ad, click through the popups. When a "Bang!" dialog appears and you dismiss it, the jailbreak script runs. Any "application error" popups after that are expected and harmless.
8. **Re-confirm Airplane Mode is still on** before doing anything else.

**If nothing happens when you tap the ad** (no "Bang!" ever appears): check that `jb.sh` and `patchedUks.sqsh` really landed in the live `system/.assets` on the device, not just in a local copy that never got copied back — a file manager silently dragging the modified folder into Trash instead of onto the device is an easy way to lose the whole thing without any error message.

## 3. Install the hotfix

The hotfix keeps the jailbreak alive across future firmware updates.
Guide: [kindlemodding.org/jailbreaking/post-jailbreak/setting-up-a-hotfix](https://kindlemodding.org/jailbreaking/post-jailbreak/setting-up-a-hotfix/)

1. Download `Update_hotfix_universal.bin` from [github.com/KindleModding/Hotfix/releases](https://github.com/KindleModding/Hotfix/releases).
2. Delete any other `.bin` files sitting on the Kindle's root — the installer requires this.
3. Copy `Update_hotfix_universal.bin` to the Kindle's root.
4. Airplane Mode on, eject, unplug.
5. Settings → menu (⋯) → **Update Your Kindle** → confirm.
6. After it installs, find and open the **"Run Hotfix"** booklet in your library to actually apply it. Repeat this step after any future OTA update.

## 4. Install KUAL + MRPI (the app launcher)

Guide: [kindlemodding.org/jailbreaking/post-jailbreak/installing-kual-mrpi](https://kindlemodding.org/jailbreaking/post-jailbreak/installing-kual-mrpi/)

For K5-and-newer devices (this includes 10th-gen Paperwhites):

1. Download **PEKI**: `github.com/KindleTweaks/PEKI/releases/latest/download/PEKI.zip`
2. Download **MRPI (modern devices)** from the link on the KindleModding page above (a `kual-mrinstaller-khf.zip`-style file).
3. From MRPI's zip, copy the `extensions` and `mrpackages` folders to the Kindle's root.
4. From PEKI's zip, copy `KUAL.sh` and `KUAL.jar` into the Kindle's `documents` folder.
5. Eject, unplug. A **KUAL** item appears in your Library — open it.
6. From KUAL, open **Helper** → **Install MR Packages**. ("No MR packages found" here is expected and fine if `mrpackages` is still empty — it just means there's nothing new to install yet, not that anything is broken.)

## 5. Fix WiFi dropping when there's no real internet (`WIFI_NO_NET_PROBE`)

By default, Kindles actively disconnect from WiFi networks that don't have real internet access — a problem if you want it talking only to your laptop.

Create an **empty** file, named exactly `WIFI_NO_NET_PROBE` (all caps, no extension, no content), at the top level of the Kindle's storage. This tells the WiFi stack to skip its internet-reachability probe. **Reboot the Kindle** after creating it — it's read at boot/reconnect time, not live.

## 6. Set up the laptop hotspot

Any hotspot tool works (`nmcli device wifi hotspot`, a GUI wrapper, etc.). Two things that actually mattered in practice:

- **Leave "Internet interface" unset / pointed at loopback (`lo`)** — no need to share real internet to the Kindle, and it's safer not to (see the security note below).
- **If the Kindle joins but a page/plugin still can't reach the server**, check your laptop's firewall. `ufw` blocks incoming connections by default even on a hotspot you just created:
  ```
  sudo ufw allow from <hotspot-subnet>/24 to any port <server-port> proto tcp
  ```
  (ScreenSage's port is 8080; adjust if you're running something else.)

## 7. Point the Kindle at ScreenSage

Two ways to actually use the sheet once the Kindle's on the hotspot:

- **Stock Web Browser** — "…" menu → **Web Browser** (may be labeled "Experimental Browser") → type the laptop's hotspot address plus ScreenSage's port, e.g. `http://192.168.12.1:8080/kindle`. Note: getting this full-screen (hiding the address bar) was investigated thoroughly and is a dead end on this hardware/firmware — see "Known limitations" below before spending time on it again.
- **KOReader plugin** — no address bar to fight in the first place, since KOReader is a native app. See [KOReader Plugin for Kindle](KOREADER_KINDLE_PLUGIN.md) for jailbreak-adjacent setup (installing KOReader itself) and installing the plugin.

## 8. (Optional) SSH access for debugging

Useful if something isn't working and you need to see real errors instead of guessing — this is also how you get changed KOReader plugin files onto the device quickly during development, see [KOReader Plugin for Kindle](KOREADER_KINDLE_PLUGIN.md#updating-the-plugin). Requires **USBNetLite**:

1. Download the KHF build (non-"11thgenplus") from [github.com/notmarek/kindle-usbnetlite/releases](https://github.com/notmarek/kindle-usbnetlite/releases).
2. Drop the `.bin` into the Kindle's `mrpackages` folder, then run **KUAL → Helper → Install MR Packages** again — it'll find it this time.
3. It gets its own **USBNetLite** entry in the KUAL menu. Open it, tap **Toggle USB Network**.
4. Plug in via USB. A new RNDIS network interface appears on the laptop (name varies, e.g. `enp0s20f0u3i1`). Give it a static IP on the `192.168.15.0/24` subnet:
   ```
   nmcli connection modify "<connection name>" ipv4.method manual ipv4.addresses 192.168.15.201/24
   nmcli connection up "<connection name>"
   ```
5. SSH in — default credentials `root` / `kindle`:
   ```
   ssh root@192.168.15.244
   ```
   (Kindle is `.244`, your laptop's end of the link is `.201` above.)

## Known limitations

**No full-screen kiosk mode in the stock browser.** This was investigated thoroughly and is a genuine dead end, not a skipped step — it's the actual reason the [KOReader plugin](KOREADER_KINDLE_PLUGIN.md) exists:

- A native KUAL-launched app (using the ~2012-era `mesquite`/`pillow` framework, e.g. the old "WebLaunch"/"Kindle Web Launcher" extensions) crashes immediately with a `pillow AlreadyInitialized` / JSON `SyntaxError` — confirmed via live SSH + log inspection to be a framework bootstrap failure, unrelated to any of our own code, and not fixable from the app side.
- The Web Fullscreen API (`requestFullscreen()`) is unsupported by this Kindle's browser build.
- The old "scroll past top to collapse chrome" mobile-web trick has no effect.
- The visible address bar turns out to be drawn by a separate, modern system component called `JunoStatusBarDriver` (Amazon's post-2018 status bar framework — the actual successor to the old `pillow` status bar found broken above). It has no documented or discoverable lipc property to hide it. Solving this for real would mean reverse engineering that binary's protocol from scratch — high effort, real risk of destabilizing the Kindle's everyday UI (it's system-wide, not per-app), and no guarantee of success. Revisit only if you're prepared for that scope of work.

**A note on internet exposure.** Community sources report that if a jailbroken Kindle makes real contact with Amazon's servers, it can silently undo the jailbreak, the hotfix, and any spoofed registration — not just via OTA updates. Keep the hotspot's internet-sharing off (this is why "Internet interface: lo" is recommended in step 6, not a real uplink) rather than trying to selectively firewall Amazon's domains while staying "online" — letting the connectivity check pass via a real internet connection isn't worth that risk.
