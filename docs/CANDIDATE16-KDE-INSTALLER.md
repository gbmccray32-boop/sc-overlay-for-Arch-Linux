# Candidate 16 KDE package test

Candidate 16 is field verified on KDE Wine/XWayland and Gamescope. These test packages wrap the
exact verified native archive without changing its application payload.

Supported test scope:

- x86-64 glibc Linux;
- Arch-family, Fedora/Nobara-family, and Debian/Ubuntu-family distributions;
- KDE Plasma on X11; and
- KDE Plasma on Wayland with XWayland available.

Hyprland, GNOME, Sway, native Wayland without XWayland, ARM, and musl distributions are outside
this test. The installer refuses those environments instead of selecting an unverified fallback.

## Install a GitHub Actions test download

1. Download the artifact for your distribution from the package workflow run.
2. Extract the downloaded ZIP into an empty directory.
3. Open a terminal in that directory.
4. Run:

   ```bash
   chmod +x install-archverse.sh
   ./install-archverse.sh --package-dir .
   ```

The installer detects the distribution family, KDE session, and XWayland availability. It verifies
the selected package against `SHA256SUMS` before invoking the system package manager. Package
dependencies install through `pacman`, `dnf`, or `apt`; the script does not replace the package
manager.

Use `./install-archverse.sh --detect-only` to inspect detection without changing the system. Use
`./install-archverse.sh --package-dir . --dry-run` to verify the package and print the install
command without running it.

After installation, run `archverse-doctor`. Then launch `archverse-overlay` or use the application
menu.

## Field-test gate

Test normal KDE first, then Gamescope separately. Confirm:

- the normal KDE portal asks for one Star Citizen window and retains that stream;
- Gamescope reports `gamescope-pipewire` and `Gamescope PipeWire node <id>`;
- held `F`, click-through, one cursor, focus restoration, and `Shift+F6` arrange mode work;
- Mining, Hauling, refinery timers, and Location Sync work; and
- configuration persists after an application restart.

Preserve complete Electron and sidecar logs if any case fails. Fedora/Nobara and Debian packages
remain field-unverified until they complete this gate on their target distributions.
