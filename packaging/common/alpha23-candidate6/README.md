# ArchVerse Alpha23 Candidate 6

Version: 0.1.47-r31.alpha23.candidate6. Internal field candidate, not a release.

Candidate 6 starts from the exact checksum-verified Candidate 5 artifact. It repairs the field-
observed non-Gamescope Mining handoff: valid Spectacle frames no longer lose their first
observation to a fixed deadline before a distinct second frame can exist. The two-frame false-
positive guard remains mandatory and now uses a bounded deadline derived from capture time.

For a regular Wine/XWayland launch, the isolated persistent stream now binds to the exact active
game window ID instead of depending only on its title. Helper failures include bounded source
diagnostics and retry at 10-second intervals. Spectacle remains the safe fallback. Direct
Gamescope PipeWire, Mining cadence, REP scanning, held-F interaction, Shift+F6, hard click-through,
and one-cursor behavior are unchanged.

Close ArchVerse, extract this folder, then run ./bin/sc-blueprint-tracker. First use a regular
non-Gamescope launch and confirm two matching signatures reach the Mining widget and announcer even
when Spectacle needs several seconds per frame. Then repeat under Gamescope and confirm its existing
fast behavior has not changed. Save complete electron.log and sidecar.log.
