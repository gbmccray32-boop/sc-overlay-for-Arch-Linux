# SC Overlay

<p align="center">
  <img src="build/icon.png" alt="SC Overlay blueprint tracker logo" width="180" />
</p>

SC Overlay is a desktop companion for Star Citizen. It started as a log watcher, but it has grown into a full in-game overlay built out of widgets you place, size and stack wherever you want them — mission and blueprint tracking, mining, and a few quality-of-life helpers that make the game feel less like a spreadsheet and more like a tool you actually use.

You can try the widgets in your browser, without installing anything: **[sc-overlay.subliminal.gg](https://sc-overlay.subliminal.gg)** runs the real ones.

This project is designed to be practical first and transparent second. If a feature needs extra processing, OCR, or a server-side handoff, it is opt-in and clearly separated from the local-first experience.

## What it does

The overlay is one transparent canvas across your monitors. Drag a widget where you want it, pull its corner to size it, and drop one onto another to stack them as tabs in a shared frame. Ten of them:

- **Mission & BP Tracker** — follow the mission you are currently tracking, see its blueprint pool with your real drop odds, and mark what you have already collected.
- **Mining Scanner** — reads the scan signature and names the deposit, calls out the ones you asked it to watch for, and counts your refinery jobs down with an alarm when they land.
- **Event Tracker** — your standing with a mission giver, the rank ladder above you, and which rank-gated ships sit at the top of it.
- **Unlock Alerts** — a blueprint unlock, with its picture, wherever on screen you actually look. Invisible until something drops.
- **Loot Split** — split a haul by SCU rather than by aUEC, price it from bundled commodity data, and save the split for the day the ore actually sells.
- **Journal** — scratch notes you can type into without leaving the game.
- **Twitch Chat** — any channel's live chat, rendered in the overlay's own styling. Sign in and you can reply without leaving the game; reading needs no account.
- **SC Feed** — Star Citizen news that surfaces when something breaks, then gets out of the way.
- **Infographic Viewer** — your own control chart, or any image, on a hotkey.
- **Web Page** — whatever site you keep checking, pinned over the game. Including the ones that refuse to be embedded anywhere else: the RSI site, UEX, erkul.

Plus:

- **Sixteen skins**, fifteen of them drawn from a manufacturer's own cockpit. Leave it on auto and the overlay matches whatever ship you are flying.
- **Fabricator helper**: optional OCR can identify a fabrication kiosk item and help build a capture for the blueprint catalog.
- **Optional sync**: if you enable it, the app can send data to my servers for account-based or collection-related features.
- Free, and it updates itself.

## Privacy and opt-in

This matters.

- OCR features are opt-in. They are not enabled by default.
- Any feature that sends data to my servers is opt-in. If you do not enable it, nothing leaves your machine.
- The core experience is local-first. The overlay can work without sending your data anywhere.
- If you do not want a feature, leave it off. That is the intended default.

In plain English: if you want the extra automation, you turn it on. If you do not, the app still works and stays local.

## How it works

The app watches Star Citizen's game log and turns it into structured events. Those events feed the overlay UI, which can surface mission info, blueprint progress, and other helpers while you play.

Optional OCR can be enabled when you want help reading fabrication screens. That is a separate path from the local mission-tracking experience.

## Quick start

Requirements:

- Windows
- Star Citizen installed and running

Install the desktop app:

- Download the latest installer from [sc-overlay.subliminal.gg](https://sc-overlay.subliminal.gg), or from the releases page here.
- Run the installer and follow the setup prompts. The installer is unsigned, so Windows SmartScreen will warn you — More info, then Run anyway.
- Launch the app and keep Star Citizen running while you use it.

The app checks for updates on its own, so this is a one-time install.

## Development notes

If you are working from source or building the project yourself, install the following first:

- Node.js
- npm

Then install dependencies:

```bash
npm install
```

Useful commands:

```bash
npm run build
npm run typecheck
npm run overlay-app
```

If you want to run the server-side overlay pieces separately:

```bash
npm run overlay
```

## Project status

This repository is public for transparency and to accept contributions.

If you want to contribute, the best path is to keep the changes aligned with the project's current direction: useful, local-first, and transparent. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

SC Overlay is **source-available**, not open source. It is licensed under the [Functional Source License 1.1 with an MIT future licence (FSL-1.1-MIT)](LICENSE.md).

In short: you may read, modify, fork and share the code, run your own build, and publish a **free** port to a platform this project does not support — a community Linux build is expressly fine. What you may not do is ship it inside a commercial product or service that substitutes for SC Overlay. Two years after each release, that version becomes MIT automatically.

**Ports and forks are welcome.** Only Windows is officially supported and tested; if you build for another OS, please give it its own name and say plainly that it is an unofficial community build.

**Names and logos are not licensed.** "SubliminalsTV", "SC Overlay", and the project's artwork are not covered by the licence — a fork needs its own branding. Star Citizen®, Roberts Space Industries® and Cloud Imperium® are registered trademarks of Cloud Imperium Rights LLC; this is an unofficial fan project.

If you want to do something the licence does not allow, ask: <sub@subliminal.gg>.

## Wayland/Hyprland Support (Alpha 23+)

### Overview
Starting from Alpha 23, ArchVerse supports native Wayland compositors including Hyprland, Gnome, KDE, and Omarchy.

### Capture Backend Priority
The app now uses this capture priority order:
1. **PipeWire** (native Wayland surfaces) - Fastest, recommended for mining
2. **Spectacle** - Fallback for Wayland without direct PipeWire access
3. **desktopCapturer** - X11/XWayland only

### Performance Notes
- PipeWire capture is the fastest method tested on Hyprland
- Mining signature recognition speed has been optimized with this backend
- If performance issues arise, switch back to desktopCapturer via config flag

### Testing Instructions
```bash
# Build test package
npm run build:test

# Run on Wayland session
./release-test/SC\ Overlay

# Monitor mining speed
watch -n 1 'pkill -9 node && ./release-test/SC\ Overlay &'
```

### Compatibility
- **Hyprland**: ✅ Full support via PipeWire
- **Gnome**: ✅ Full support via PipeWire
- **KDE Wayland**: ✅ Full support via PipeWire
- **Omarchy**: ✅ Full support via PipeWire
- **X11 (any)**: ✅ Backward compatible, unchanged behavior

### Configuration
Add to your config.json:
```json
{
  "fabCapture": true,
  "captureBackend": "pipewire",  // pipewire | spectacle | autodetect
  "miningDebug": false
}
```
