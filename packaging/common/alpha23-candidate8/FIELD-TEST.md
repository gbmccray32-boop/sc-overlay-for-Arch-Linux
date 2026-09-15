# ArchVerse Alpha23 Candidate 8
Version: 0.1.47-r31.alpha23.candidate8. Internal field candidate, not a release.

Close ArchVerse before extracting and launching ./bin/sc-blueprint-tracker.
Test the regular Wine/XWayland launch first. If KDE presents window selection, select only Star Citizen.
Check Mining recognition, widget updates, announcements, and Hauling r_DisplayInfo Location Sync.
Then test Gamescope, whose direct PipeWire implementation is unchanged.
Supply complete electron.log and sidecar.log from both sessions.

The helper now loads a trusted local page, checks its secure context, and logs renderer capability.
Exact-XID capture retries once with remote=true after MIT-SHM failure, retains that mode after recovery,
and backs off for 60 seconds after failure. Each attempt is bounded to 750 ms and uses SIGKILL on timeout.
This candidate's actual Electron regression reproduces Candidate 7's insecure-origin failure and verifies
that the repaired preload reaches the display-media handler. KDE portal approval and in-game capture
remain field-test gates; no system reinstall is required by the Candidate 7 evidence.

