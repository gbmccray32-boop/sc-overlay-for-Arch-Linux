# ArchVerse Alpha23 Candidate 13
Version: 0.1.47-r31.alpha23.candidate13. Internal field candidate, not a release.

Close ArchVerse before extracting and launching ./bin/sc-blueprint-tracker.
First test Gamescope. Capture must report gamescope-pipewire and Gamescope PipeWire node.
Confirm two distinct matching frames produce widget updates and announcements.
If vehicle authority reports inactive while aboard, supply the current LIVE/Game.log along with
complete electron.log and sidecar.log; pixels cannot replace authoritative Game.log vehicle events.

Then test normal Wine/XWayland. KDE's chooser should stay visible until you select only Star
Citizen; a second Spectacle window must not replace it. The approved stream remains tied to game
PID/start ticks. Confirm the log reports `native portal PipeWire`, `engine=native-gstreamer`, and
`portal-pipewire-window`. The helper consumes KDE's restricted PipeWire remote and writes bounded
raw BGRA snapshots without Chromium canvas, PNG encoding, XComposite, or Spectacle. Check
rawCopy/fileWrite/total diagnostics and Mining heartbeat timing. A later ArchVerse launch may use
KDE's persistent permission without another chooser; revoke that permission through KDE if needed.
Check a real Resource Signature and a cargo item displaying a Volume and X quantity; the cargo
quantity must not become a Mining signature even after two matching frames.
Check Hauling r_DisplayInfo Sync and existing widget input/held-F/Shift+F6 behavior.

If running a true X11 desktop session, confirm the existing isolated Electron/X11 window stream
still works. Candidate 13's native portal helper is only selected when a host Wayland display exists.

Within one ArchVerse process, restart Star Citizen between normal and Gamescope modes. Cached
capture method, coordinate size and recovery state must reset for each exact game session.
Do not publish distro builds until both capture modes pass the required in-game field gates.
