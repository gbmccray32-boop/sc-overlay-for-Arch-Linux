# ArchVerse Alpha23 Candidate 16

Version: 0.1.47-r31.alpha23.candidate16. Internal field candidate, not a release.

Candidate 16 starts from packaged-verified Candidate 15. It keeps the working KDE portal capture,
refinery timer, Mining, Hauling, sidecar, OCR, widgets, and direct Gamescope PipeWire capture.
It changes only Linux pointer-source selection.

A normal Wine/XWayland Star Citizen process exposes the host `DISPLAY`. Candidate 15 incorrectly
treated that display as a nested Gamescope canvas and scaled its pointer coordinates across the
ArchVerse overlay. Pressing Star Citizen's normal `F` interaction key could then classify the wrong
widget, focus ArchVerse, and make both windows appear to fight over the pointer.

Candidate 16 permits nested pointer scaling only when the exact bound Star Citizen session has a
verified Gamescope PID. Normal launches use the host compositor pointer without scaling. Changing
launch modes clears the cached nested pointer context.

## Test

1. Close ArchVerse, extract this archive, and run `./bin/sc-blueprint-tracker`.
2. Launch Star Citizen normally without Gamescope.
3. Move, look, and use `F` repeatedly away from ArchVerse widgets. Confirm the game keeps pointer
   ownership and ArchVerse remains click-through.
4. Hold `F` over an ArchVerse widget, interact with it, then leave it. Confirm one cursor remains
   and Star Citizen regains pointer control.
5. Confirm the refinery timer, Mining scanner, and Hauling scanner still work.
6. Test Gamescope separately. Confirm held-`F` widget interaction still works and capture remains
   `gamescope-pipewire`.

If pointer ownership fails, preserve the complete Electron log and note whether the failure occurred
before pressing `F`, during held-`F` widget interaction, or after leaving a widget.
