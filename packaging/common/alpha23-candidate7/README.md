# ArchVerse Alpha23 Candidate 7

Version: 0.1.47-r31.alpha23.candidate7. Internal field candidate, not a release.

Candidate 7 starts from the exact checksum-verified Candidate 6 artifact. It repairs the field-
observed Wine/XWayland transport bottleneck and panoramic Location Sync crop. A separate Wayland
helper requests the exact Star Citizen window through Electron's XDG ScreenCast portal path and
keeps one PipeWire MediaStream. Mining crops the bound display from that stream. Hauling retains
the complete game canvas so r_DisplayInfo at the far-right panoramic edge remains visible.

If portal capture is unavailable, Candidate 7 tries exact-XID GStreamer X11 capture before the
existing Spectacle and Electron monitor fallbacks. A portal initialization failure is reported and
does not prompt or restart again until Star Citizen starts a new process. Direct Gamescope
PipeWire, Mining authority, distinct-frame confirmation, REP scanning, held-F interaction,
Shift+F6, hard click-through, and one-cursor behavior are unchanged.

Close ArchVerse, extract this folder, then run `./bin/sc-blueprint-tracker`. First launch Star
Citizen normally without Gamescope. If KDE asks what to share, select only the Star Citizen window.
Confirm the log reports `portal-pipewire-window`, Mining confirmations stay within 100-900 ms, and
Hauling reads r_DisplayInfo from the far-right edge. Then repeat under Gamescope and confirm the log
reports `gamescope-pipewire` with its existing speed. Save complete `electron.log` and `sidecar.log`.
