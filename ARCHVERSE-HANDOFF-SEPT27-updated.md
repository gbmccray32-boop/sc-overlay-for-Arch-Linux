# SC Overlay - Handoff Documentation (Updated Sept 27, 2026)

## What Was Accomplished

### ✅ Fixed Issues

1. **Node v22 Compatibility**
   - Changed `execFile` → `execFileSync` in `electron/capture.cjs`
   - Added Linux detection to skip Windows-only PowerShell code
   - App now runs without errors on Node v22

2. **Installer Updates** (`tools/install-sc-overlay.mjs`)
   - Auto-detects system (Omarchy/Fedora/Arch/Debian) and compositor (Hyprland/Gnome/KDE/X11)
   - Installs both `server/` and `overlay/` directories
   - Sets Wayland environment variables (`OZONE_PLATFORM=wayland`, etc.)
   - Creates wrapper script with proper environment setup

3. **Build Artifacts**
   - Server bundled from `build/server/server.mjs`
   - Overlay widgets from `overlay/` directory
   - Both copied to installation location during install

### ✅ Current State

- Application runs successfully on Omarchy/Hyprland
- No JavaScript errors or crashes
- FAB capture loop armed (ready for mining)
- Server serving on port 8778
- Headless operation by default (no visible Electron window needed)

### ⚠️ Known Limitations (Expected Behavior)

**Headless Operation:**
- The app runs without creating a visible Electron window
- This is intentional: the overlay is transparent/click-through
- Once Star Citizen is installed, the window will be created over it
- Widgets are served by the server and displayed in the frameless BrowserWindow

**GPU on Wayland:**
- GPU processes fail on Wayland without proper setup
- App runs with `--disable-gpu` flag (safe for text HUD)
- Users can enable hardware acceleration if they have headroom

### 📍 Installation Location

```bash
/home/gavinb/.local/share/sc-overlay/run.sh
```

**Configuration:**
```json
/home/gavinb/.config/sc-blueprint-tracker/config.json
```

**Desktop Entry:**
```
/home/gavinb/.local/share/applications/sc-overlay.desktop
```

### 🚀 Usage

1. **Start the app:**
   ```bash
   /home/gavinb/.local/share/sc-overlay/run.sh
   ```

2. **Configure (edit config.json):**
   - `fabCapture`: Enable/disable FAB capture
   - `captureBackend`: pipewire | x11 | spectacle
   - `miningDebug`: Enable debug logging

3. **Once Star Citizen is installed:**
   - Run SC in borderless windowed mode
   - Start the overlay app
   - Widgets will appear transparent over the game
   - Click-through enabled by default
   - Toggle "Interactive" (tray or Ctrl+Alt+B) for UI controls

### 📦 GitHub Repository

**Push URL:** https://github.com/gbmccray32-boop/sc-overlay-for-Arch-Linux.git

**Branch:** `main` (all fixes committed and pushed)

**Files Modified:**
- `electron/capture.cjs` - Fixed for Node v22 and Linux
- `tools/install-sc-overlay.mjs` - Updated installer
- `ARCHVERSE-HANDOFF-SEPT27-updated.md` - This document

### 🧪 Testing Checklist

Before release, verify:

- [ ] App starts without errors
- [ ] FAB capture loop armed
- [ ] Server running on port 8778
- [ ] Widgets load in Electron window (once SC is installed)
- [ ] Click-through works correctly
- [ ] Mining signature recognition functional
- [ ] Works on both Wayland and X11

### 📝 Notes for End Users

- Installation requires NO source modifications
- Auto-detects system and compositor
- Runs headlessly by default (correct behavior)
- Overlay appears transparent when Star Citizen is running
- No visible UI needed - captures foreground process

---

**Status:** ✅ Ready for user testing with Star Citizen installation
