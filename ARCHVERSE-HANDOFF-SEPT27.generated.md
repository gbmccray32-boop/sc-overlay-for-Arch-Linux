# ArchVerse Linux Handoff - Sept 27, 2026

## Current Context
- **Branch**: `agent/alpha23-candidate19-upstream-stability`
- **Latest Candidate**: 19 (field unverified)
- **Public Release**: Alpha22 (Candidate 8k)
- **Workflow**: `build-archverse-flatpak-alpha22-test2.yml`

## Linux Contracts Implemented in Alpha23

### Display Capture Contract
The overlay uses PipeWire capture for display access:

1. **Gamescope mode** (preferred): Direct PipeWire capture from `gamescope-pipewire` node
2. **Normal KDE Wayland**:
   - Primary: XDG ScreenCast portal → PipeWire remote fd → GStreamer pipewiresrc
   - Fallback: Exact XID ximagesrc (remote=true)
   - Final fallback: Spectacle

3. **X11/XWayland** (Hyprland/Omarchy):
   - Uses `xdotool` to get exact window ID via X11 socket
   - Flatpak binds to exact X11 window, not generic Gamescope
   - Window ID becomes launch identity and is revalidated before every sensitive action

### Input Contract
1. **Physical keyboard**: evdev with uaccess rules (no broad input group membership)
2. **Mouse auxiliary endpoints**: Rejected if labeled as mouse/trackpad/touchpad
3. **uIOhook**: Retained until physical keyboard works; then disabled
4. **Held-F widget interaction**: Works in both launch modes

### Session Contract
1. **PID binding**: Exact `StarCitizen.exe` PID + start-time ticks
2. **Session key**: Portal restore token in config directory
3. **One-attempt-per-game**: Failed helpers quarantined per process

### Mining Contract
1. **Distinct-frame guard**: Same value at same location on distinct frame required
2. **Cadence**: 500ms acquisition → 250ms confirmation (if locked)
3. **Vehicle authority**: Game.log ship-channel membership + vehicle-control tokens
4. **On-foot rejection**: No Mining while `source=none` in Game.log

### Location Sync Contract
1. **Full canvas request**: Includes far-right `r_DisplayInfo` text
2. **One-shot only**: No repeated requests for same PID/start identity
3. **Crop before transfer**: When geometry known (except Location Sync)

## Key Files for Wayland/Hyprland Support

### Core Session Binder
- `/home/gavinb/Work/ArchVerse/archverse-flatpak/files/flatpak-star-citizen-session.cjs` - Flatpak-specific session binder using X11 socket
- Uses `xdotool` to find exact Star Citizen window via X11
- Binds to exact window ID, not generic compositor surfaces
- Revalidates before every capture cycle

### Runtime Environment
- `/home/gavinb/Work/ArchVerse/archverse-flatpak/files/runtime-env.cjs` - Detects Flatpak environment
- Sets `IS_FLATPAK` flag for code paths

### Flatpak Manifest
- `/home/gavinb/Work/ArchVerse/archverse-flatpak/io.github.gbmccray32_boop.ArchVerseOverlay.yml`
- Requests `--socket=x11` for window identity access
- Bundles `xdotool` and `xrandr` as dependencies

### Capture Patch
- `/home/gavinb/Work/ArchVerse/archverse-flatpak/patches/electron/capture.patch`
- Implements contract-based source selection
- Flatpak path: exact X11 window → fallback to Gamescope if identified
- Native path: ranked fallback (Gamescope → Spectacle → Electron)

### Session Patch
- `/home/gavinb/Work/ArchVerse/archverse-flatpak/patches/electron/star-citizen-session.patch`
- Swaps `StarCitizenSessionBinder` for `FlatpakStarCitizenSessionBinder` when in Flatpak

## Gap Analysis: Omarchy/Hyprland Compatibility

### What Works Without Modification
1. **PipeWire capture**: Already implemented in Alpha23
2. **X11 socket access**: Flatpak manifest already requests it
3. **xdotool detection**: Bundled and functional on X11/XWayland
4. **Exact window binding**: Already the default for Flatpak builds

### What Needs Adaptation

#### 1. Hyprland Display Capture
Hyprland does not support XDG ScreenCast portal like KDE does. Need:
- Direct PipeWire node enumeration (like Gamescope)
- Wayland `wl_output` → compositor surface detection
- Hyprland-specific pipewire node naming conventions

**Current State**: Alpha23 uses Gamescope mode when available, which works with Hyprland if it creates a Gamescope surface for Star Citizen.

#### 2. Hyprland Focus Model
Hyprland is aggressive about focus stealing:
- Need proper handling for Hyprland's gap/cycle behavior
- May need compositor-specific permissions in Flatpak manifest

**Current State**: No specific Hyprland handling exists yet. The X11 socket binding should work, but focus model needs testing.

#### 3. Window Detection on Wayland
Current uses `WM_CLASS` via xprop (X11 only):
- Hyprland surfaces are Wayland; need different detection method
- Possibly use `hyprctl` commands or D-Bus surface enumeration

**Current State**: The X11 socket provides a bridge to XWayland windows. If Star Citizen runs on XWayland, xdotool can still detect it. If running native Wayland, need alternative detection.

#### 4. PipeWire Node Discovery
Need Hyprland-specific node discovery:
- Enumerate all PipeWire video nodes
- Detect Star Citizen stream by name/properties
- Handle compositor-specific node naming

**Current State**: Alpha23 already does this for Gamescope. Need to extend to Hyprland native surfaces.

## Recommended Approach

### Short-term (Hyprland/Omarchy with XWayland)
1. **Leverage existing X11 socket binding** - Already implemented in Flatpak manifest
2. **Use xdotool detection** - Already bundled and functional
3. **Gamescope fallback** - If Hyprland creates Gamescope surface for SC, use existing path

### Medium-term (Native Wayland)
1. **Add Hyprctl integration** - Detect Star Citizen surfaces via compositor API
2. **Extend PipeWire enumeration** - Add Hyprland-specific node detection
3. **Update Flatpak manifest** - Add hyprctl if available, or use D-Bus surface enumeration

### Long-term (Compositor-agnostic)
1. **Abstract capture backend** - Create abstraction layer for different compositors
2. **D-Bus surface enumeration** - Detect surfaces via compositor's D-Bus API
3. **Fallback chain** - X11 → Gamescope → Hyprland native → Spectacle

## Testing Checklist

### XWayland Mode (Should Work Now)
- [ ] Star Citizen on XWayland with xdotool detection
- [ ] PipeWire capture via exact window ID
- [ ] Focus handling in Hyprland/Omarchy

### Gamescope Mode (May Work)
- [ ] Hyprland creates Gamescope surface for SC
- [ ] Existing Gamescope path works
- [ ] No need for additional changes

### Native Wayland (Needs Work)
- [ ] Detect Star Citizen native Wayland surface
- [ ] Capture via PipeWire without X11 bridge
- [ ] Handle Hyprland focus model correctly

## Next Steps

1. **Test current setup on Hyprland** - Verify if X11 socket + xdotool works
2. **Check Gamescope creation** - See if Hyprland creates Gamescope surface for SC
3. **If native Wayland needed**: Add Hyprctl/D-Bus detection layer
4. **Update Flatpak manifest** - Add compositor-specific dependencies if needed

## Important Notes

- **No host file access**: Cannot punch escape holes into sandbox for /proc
- **X11 socket is sufficient**: For XWayland windows, exact binding works
- **PipeWire is the bridge**: Already implemented, just needs Hyprland-specific node discovery
- **Focus model is compositor-specific**: Need to handle each compositor's focus rules

## License
FSL-1.1-MIT allows ports if unofficial and not commercial substitute.
