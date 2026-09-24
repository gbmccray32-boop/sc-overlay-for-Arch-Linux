# ArchVerse Alpha23 Candidate 18

Version: 0.1.47-r31.alpha23.candidate18. Internal field candidate, not a release.

Candidate 18 starts from packaged-verified and crash-repair-field-verified Candidate 17. It repairs
held-`F` keyboard authority on Nobara/Fedora without changing normal KDE portal capture, direct
Gamescope PipeWire capture, pointer mapping, focus ownership, OCR, scanners, or widgets.

The complete installer adds a systemd-udev `uaccess` rule for keyboard event devices. The rule
grants access only to the active local desktop session; it does not add the user to the broad
`input` group. ArchVerse no longer mistakes a mouse auxiliary keyboard endpoint for the physical
keyboard and no longer suppresses uIOhook before a real keyboard stream opens.

## Install

1. Extract the download for your distribution.
2. Run `./install-archverse.sh`. The installer detects the local package in its own directory.
3. Run `archverse-doctor` after installation.
4. Log out and back in only if the doctor reports that the physical keyboard is not readable.

## Test

1. Launch Star Citizen normally without Gamescope.
2. Start ArchVerse from the application menu or run `archverse-overlay`.
3. Hold `F` over several ArchVerse widgets. Confirm each widget becomes interactive.
4. Release `F`, leave each widget, and confirm Star Citizen retains pointer control with one cursor.
5. Confirm Mining, Hauling, and the refinery timer still work.
6. Close both applications, launch Star Citizen through Gamescope, and repeat steps 2–5.
7. Preserve the complete Electron and sidecar logs.

Expected Electron diagnostics include `physical keyboard input active` and
`keyboard authority=evdev active`. They must not select a path containing `Mouse` as keyboard
authority. If the keyboard remains inaccessible, preserve the `cannot read physical keyboard` line
and the complete output from `archverse-doctor`.
