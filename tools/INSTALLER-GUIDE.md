# SC Overlay Auto-Installer Guide

## Overview

The auto-installer (`tools/install-sc-overlay.mjs`) automatically detects your system and installs the appropriate configuration for SC Overlay.

## Features

✅ **Auto-detection**: Automatically identifies your Linux distribution (Omarchy, Fedora, Arch, Debian, Ubuntu)  
✅ **Compositor detection**: Detects Wayland vs X11 compositor  
✅ **Smart installation**: Installs to user-writable location (`~/.local/share/sc-overlay`)  
✅ **Desktop integration**: Creates desktop entry for easy launching  
✅ **Systemd support**: Optional systemd service for auto-start  
✅ **Documentation**: Includes README with usage instructions  

## Quick Install

```bash
cd /home/gavinb/Work/ArchVerse
node tools/install-sc-overlay.mjs
```

Or use the bash wrapper:

```bash
tools/install.sh
```

## What Gets Installed

### Files Created

| File | Location | Purpose |
|------|----------|---------|
| `sc-log-watcher` | `~/.local/share/sc-overlay/` | Main application binary |
| `run.sh` | `~/.local/share/sc-overlay/` | Wrapper script with proper paths |
| `lib*.so*` | `~/.local/share/sc-overlay/` | Bundled shared libraries |
| `README.md` | `~/.local/share/sc-overlay/` | Usage documentation |
| `config.json` | `~/.config/sc-blueprint-tracker/` | Application configuration |
| `sc-overlay.desktop` | `~/.local/share/applications/` | Desktop menu entry |
| `sc-overlay.service` | `~/.config/systemd/user/` | Optional systemd service |

### Configuration Files

The installer creates `config.json` with appropriate settings based on your compositor:

**Wayland (Hyprland/Gnome/KDE)**:
```json
{
  "fabCapture": true,
  "captureBackend": "pipewire",
  "compositor": "hyprland"
}
```

**X11/XWayland**:
```json
{
  "fabCapture": true,
  "captureBackend": "x11",
  "compositor": "x11"
}
```

## Usage After Installation

### Start the Application

```bash
~/.local/share/sc-overlay/run.sh
```

Or double-click the desktop entry in your applications menu.

### Monitor Performance

```bash
watch -n 5 '~/.local/share/sc-overlay/run.sh &'
```

### Check Logs

```bash
journalctl --user -u sc-overlay.service
```

## Reinstalling

To reinstall after updating:

```bash
cd /home/gavinb/Work/ArchVerse
npm run dist
node tools/install-sc-overlay.mjs
```

## Customization

### Change Capture Backend

Edit `~/.config/sc-blueprint-tracker/config.json`:

```json
{
  "captureBackend": "pipewire"  // or "x11" or "spectacle"
}
```

Then restart the app.

### Enable Debug Logging

```json
{
  "miningDebug": true
}
```

## Troubleshooting

### App won't start

Check if dependencies are installed:

```bash
xdotool --version
pipewire-jack --version
```

If missing, install:

```bash
sudo pacman -S xdotool pipewire-pulse
```

### Wrong capture backend detected

Edit `~/.config/sc-blueprint-tracker/config.json` and change `captureBackend`.

### App crashes on startup

This may be due to ICU compatibility issues. Try running with Node flags:

```bash
node --unhandled-rejections=strict ~/.local/share/sc-overlay/run.sh
```

## Differences from Flatpak Installation

The auto-installer creates a **non-Flatpak** installation that:

- Uses xdotool for window detection (bundled)
- Runs as regular user app (no sandbox)
- Direct access to PipeWire/Spectacle
- All dependencies installed system-wide

This is different from the Flatpak version which runs in a sandbox.

## License

FSL-1.1-MIT allows this installation method for personal use.

For commercial distribution, please contact upstream.

