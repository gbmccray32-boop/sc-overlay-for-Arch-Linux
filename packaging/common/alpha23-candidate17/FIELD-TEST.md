# ArchVerse Alpha23 Candidate 17

Version: 0.1.47-r31.alpha23.candidate17. Internal field candidate, not a release.

Candidate 17 starts from packaged-verified Candidate 16. It keeps the working KDE portal capture,
refinery timer, Mining, Hauling, sidecar, OCR, widgets, and direct Gamescope PipeWire capture.
It changes only the Linux `WM_CLASS` lookup used for focus ownership.

Nobara 44's `xdotool getwindowclassname` can abort inside `libxdo` while reading an XWayland
window. ArchVerse survives because `xdotool` is a child process, but the crash creates a coredump
and can make one focus-ownership check miss. Candidate 17 reads the same `WM_CLASS` property with
`xprop`. A window that closes during the query is treated as an ordinary lookup miss.

## Test

1. Close ArchVerse, extract this archive, and run `./bin/sc-blueprint-tracker`.
2. Launch Star Citizen normally without Gamescope.
3. Move, look, and use `F` repeatedly away from ArchVerse widgets. Confirm the game keeps pointer
   ownership and ArchVerse remains click-through.
4. Hold `F` over an ArchVerse widget, interact with it, then leave it. Confirm one cursor remains
   and Star Citizen regains pointer control.
5. Confirm the refinery timer, Mining scanner, and Hauling scanner still work.
6. Run `coredumpctl --since today info xdotool` and confirm this session contains no new
   `getwindowclassname` crash.
7. Test Gamescope separately. Confirm held-`F` widget interaction still works and capture remains
   `gamescope-pipewire`.

If pointer ownership fails, preserve the complete Electron log and note whether the failure occurred
before pressing `F`, during held-`F` widget interaction, or after leaving a widget.
