# ArchVerse Linux 0.1.47-r31 Alpha23

This public Linux prerelease packages the field-verified Alpha23 Candidate 18 runtime for KDE
Plasma. Separate downloads are provided for Arch-family and Fedora/Nobara-family distributions.

## Supported systems

- x86-64 glibc Linux;
- Arch Linux, CachyOS, and compatible Arch-family distributions;
- Fedora and Nobara;
- KDE Plasma on X11; and
- KDE Plasma on Wayland with XWayland available.

Hyprland, GNOME, Sway, native Wayland without XWayland, ARM, and musl distributions are not part of
this release.

## Install

1. Download the ZIP for your distribution family.
2. Extract the ZIP.
3. Open a terminal in the extracted directory.
4. Run:

   ```bash
   chmod +x install-archverse.sh
   ./install-archverse.sh
   archverse-doctor
   ```

The installer verifies the packaged application checksum before invoking `pacman` or `dnf`.

## KDE Plasma Gamescope note

Recent KDE Plasma versions can offer to enable **Alternate characters** for physical keyboards.
When enabled, holding `A`, `S`, `D`, `F`, or another letter opens a character-selection popup and
prevents normal held-key gameplay under Gamescope.

Open **System Settings → Keyboard → On-Screen Keyboard** and disable **Alternate characters — Show
popup when holding a key**. If the switch is unavailable and no on-screen keyboard is required, set
**Virtual Keyboard** to **None**. Restart Gamescope and Star Citizen afterward.

This behavior belongs to KDE Plasma and is not caused by ArchVerse.

## Verified behavior

- Native KDE portal capture for normal Wine/XWayland launches;
- direct low-latency Gamescope PipeWire capture;
- exact Star Citizen session binding;
- physical-keyboard held-`F` interaction;
- one cursor and click-through outside owned widgets;
- focus and pointer handoff between Star Citizen and ArchVerse;
- Mining, Hauling, refinery timers, Location Sync, and saved configuration; and
- package installation and dependency transactions for Arch and Fedora/Nobara.

The Linux contracts remain unchanged: ArchVerse uses screen capture and the read-only `Game.log`.
It does not inject into Star Citizen or read game memory.

## Provenance

- Source branch: `agent/alpha23-candidate18-nobara-keyboard`
- Release source commit: recorded by the GitHub release tag
- Package CI run: `35937512246`
- Upstream application baseline: ArchVerse v0.1.47 commit
  `e482c1ce3d461b390079486115293535be9b2ab7`
