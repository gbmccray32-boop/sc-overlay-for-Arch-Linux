# ArchVerse Alpha23 Candidate 9
Version: 0.1.47-r31.alpha23.candidate9. Internal field candidate, not a release.

Close ArchVerse before extracting and launching ./bin/sc-blueprint-tracker.
Test the regular Wine/XWayland launch first. When KDE presents window selection, select only Star Citizen.
The approved portal session must remain latched while Star Citizen keeps the same process. Slow frames,
repeated frames, and X11 window rediscovery must not reopen KDE's selector. A denied request or an ended
stream is disabled for that game process; restarting Star Citizen permits one new approval attempt.

Check Mining recognition, widget updates, announcements, and Hauling r_DisplayInfo Location Sync.
Capture requests still return to fallbacks after 700 ms. A late response is retained for the next probe,
and only one frame request may remain outstanding. The existing distinct-frame Mining guard remains.
The logs now report bounded video-readiness, drawing, PNG encoding, blob-read and file-write diagnostics.
These changes repair capture lifecycle; live portal video speed remains unverified until this test.

Then test Gamescope and confirm the method remains gamescope-pipewire. Its direct PipeWire helper,
Mining admission and timing, widget interaction, sidecar, and configuration are unchanged.
Supply complete electron.log and sidecar.log from both sessions. Do not publish a release until both
paths pass the required field gates.
