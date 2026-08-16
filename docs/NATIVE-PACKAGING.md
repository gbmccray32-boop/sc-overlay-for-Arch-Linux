# ArchVerse native Linux packaging

Flatpak is preserved as an experimental packaging path, but native Linux packages are the primary compatibility target from this branch forward.

## One application payload, three package formats

All three packages are built from the exact tested ArchVerse `0.1.42-r31-alpha.21` payload. Application JavaScript, OCR models, Resource Scanner behavior, held-F interaction, transparent-canvas focus release, Gamescope/KDE handling, and Star Citizen session binding are shared. Only the package/dependency layer differs.

- Arch family: `archverse-overlay-0.1.42.r31.alpha21-1-x86_64.pkg.tar.zst`
- Debian family: `archverse-overlay_0.1.42~r31~alpha21-1_amd64.deb`
- Fedora family: `archverse-overlay-0.1.42-1.r31.alpha21.*.x86_64.rpm`

## Runtime policy

### Arch / CachyOS

The Arch package intentionally preserves the already-tested runtime path and depends on the distro `electron42` package. `/usr/bin/archverse-overlay` ultimately launches the unchanged Alpha 21 `bin/sc-blueprint-tracker` with `/usr/bin/electron42`.

### Debian / Ubuntu and Fedora / Nobara

Those families do not have a consistently available Electron 42 package name/version, so their packages bundle a pinned Electron 42 runtime under `/opt/archverse-overlay/runtime/electron`. The application payload remains unchanged. The cross-distro wrapper sets `SC_TRACKER_ELECTRON_BIN` to the bundled runtime before entering the original launcher.

Node.js, OCR tools, X11 helpers, screenshot integration and multimedia tools remain native package-manager dependencies so they integrate with the host desktop.

## Install locations

- Application payload: `/opt/archverse-overlay`
- Launcher: `/usr/bin/archverse-overlay`
- Compatibility command: `/usr/bin/sc-blueprint-tracker`
- Desktop entry: `/usr/share/applications/archverse-overlay.desktop`
- Icon: `/usr/share/icons/hicolor/256x256/apps/archverse-overlay.png`
- User config remains: `${XDG_CONFIG_HOME:-~/.config}/sc-blueprint-tracker`

Packages do not delete or reset the user's existing ArchVerse configuration on upgrade.

## Compatibility tiers

1. Arch/CachyOS is the native reference implementation.
2. Fedora/Nobara uses the same payload with a bundled Electron runtime and must be field-tested on Nobara before release support is marked confirmed.
3. Debian/Ubuntu uses the same payload with a bundled Electron runtime and must be field-tested on at least one Debian-family host before release support is marked confirmed.

Do not fork application behavior by distro. Distro-specific changes belong under `packaging/` unless a host capability genuinely requires an application-level Linux compatibility abstraction.
