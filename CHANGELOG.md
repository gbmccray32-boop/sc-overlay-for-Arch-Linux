# Changelog

## [0.1.48] - 2026-09-27

### Added
- **Wayland/Hyprland Support**: Native Wayland compositor support for Hyprland, Gnome, KDE, and Omarchy
- **PipeWire Capture Backend**: Primary capture method for native Wayland surfaces
- **Spectacle Fallback**: Optional fallback for Wayland compositors without direct PipeWire access
- **Session Binder for Linux**: Generic `electron/linux/star-citizen-session.cjs` for non-Flatpak builds

### Changed
- **capture.cjs**: Added Wayland detection and conditional capture backend selection
- **Capture Priority**: Now uses PipeWire first on Wayland, then Spectacle, then desktopCapturer (X11)

### Deprecated
- None

### Fixed
- Mining signature recognition on Hyprland via PipeWire capture
- Focus handling for native Wayland surfaces

### Security
- No host `/proc` access required for Flatpak builds
- X11 socket binding preserves sandbox integrity

## [0.1.47] - 2026-09-25

### Added
- Linux contracts documentation (Display Capture, Input, Session, Mining, Location Sync)
- Flatpak-specific session binder with X11 socket binding

### Changed
- **capture.cjs**: Updated to support Gamescope mode for Wayland compositors
- **session binder**: Conditional selection based on `IS_FLATPAK` environment variable

## [0.1.46] - 2026-09-24

### Added
- RapidOCR client integration
- Mining contract enforcement (distinct-frame guard)

### Changed
- Screen reading logic for OCR results

