# Candidate 18 KDE full install and field test

Candidate 18 starts from the packaged-verified Candidate 17 application and adds the Nobara/Fedora
held-`F` keyboard repair. These packages preserve the separate normal KDE portal and direct
Gamescope PipeWire capture paths.

Supported test scope:

- x86-64 glibc Linux;
- Arch-family, Fedora/Nobara-family, and Debian/Ubuntu-family distributions;
- KDE Plasma on X11; and
- KDE Plasma on Wayland with XWayland available.

Hyprland, GNOME, Sway, native Wayland without XWayland, ARM, and musl distributions remain outside
this test. The installer rejects those environments instead of selecting an unverified fallback.

## Install

1. Download and extract the Candidate 18 full-install artifact.
2. Open a terminal in the extracted directory.
3. Run:

   ```bash
   chmod +x install-archverse.sh
   ./install-archverse.sh
   ```

The installer detects the distribution and uses the matching package in the same directory. It
verifies `SHA256SUMS` before invoking `pacman`, `dnf`, or `apt`.

Run `./install-archverse.sh --detect-only` to inspect platform detection. Run
`./install-archverse.sh --dry-run` to verify the selected package without installing it.

After installation, run:

```bash
archverse-doctor
```

The doctor must report `Physical keyboard input` as `[OK]`. If it does not, log out of Plasma and
back in once, then run the doctor again.

## Field-test gate

Test normal KDE first, then Gamescope separately. Confirm:

- the Electron log reports `physical keyboard input active` for the real keyboard;
- no path containing `Mouse` becomes keyboard authority;
- held `F` makes a hovered widget interactive;
- releasing `F` and leaving the widget returns pointer ownership to Star Citizen;
- normal KDE portal capture asks once and retains the selected Star Citizen stream;
- Gamescope reports `gamescope-pipewire` and `Gamescope PipeWire node <id>`;
- one cursor, click-through, focus restoration, and `Shift+F6` arrange mode work; and
- Mining, Hauling, refinery timers, Location Sync, and saved configuration still work.

Preserve the complete Electron log, sidecar log, and `archverse-doctor` output if any check fails.
