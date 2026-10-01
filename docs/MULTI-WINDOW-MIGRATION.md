# ArchVerse multi-window migration

## Decision

Keep the proven KDE/XWayland application and the upstream widget migration in
`gbmccray32-boop/sc-overlay-for-Arch-Linux`.

Create a separate `archverse-omarchy-hyprland` repository when the Hyprland port begins. Do not
copy the KDE capture and window-management implementation into that repository as if it were
portable. The Hyprland repository will own its compositor adapter, layer-shell behavior, package,
installer detection, and field evidence.

Do not extract a shared repository yet. First stabilize the window-to-runtime interface. A shared
package is justified only after KDE and Hyprland use the same interface without conditional code
leaking into widgets.

## Protected starting point

- KDE migration base: Candidate 19 commit `2267820328fad5080ac7750ccdc572ba9597c52f`.
- Public rollback: Candidate 18.
- The divergent `main` commit `928c51fcf75e2e18edd327e65ee28bca9640028b` is an input source, not a merge base.
- Per-widget hotkey editing remains permanently excluded from official Linux builds.

`main` is 22 commits ahead of Candidate 19 but lacks 470 Candidate 19 commits. It also changes
capture and session binding. Never merge or rebase Candidate 19 onto that tree wholesale. Audit and
port each useful behavior semantically.

## Runtime architecture

One Electron main process continues to own:

- exact Star Citizen session binding;
- normal KDE portal capture;
- direct Gamescope PipeWire capture;
- RapidOCR and Tesseract workers;
- the sidecar and local IPC;
- held-`F`, `Shift+F6`, focus, pointer, and click-through authority; and
- widget visibility and saved layout.

Each enabled widget can later receive one transparent native `BrowserWindow`. Disabled widgets do
not own a renderer. Settings remains a normal application window. The canvas remains the default
and rollback path until the new mode passes both KDE launch modes on Arch/CachyOS and Nobara.

## Stacking contract

On XWayland, Electron requests always-on-top behavior and KWin supplies a backstop rule. On native
Wayland, KWin owns stacking and placement. ArchVerse does not try to demote every other desktop
window.

Every widget window uses a stable title:

```text
ArchVerse Widget [<widget-id>]
```

KWin rules can match that title and apply Keep Above, Skip Taskbar, Skip Pager, and Skip Switcher.
The installer must not edit `kwinrulesrc` until import, rollback, and field behavior are verified.

## Migration sequence

1. Add the dormant widget-window manager and test its policy.
2. Add a diagnostic window that does not contain a production widget.
3. Connect centralized visibility, layout, click-through, and held-`F` messages.
4. Migrate SC Feed as the first low-risk widget.
5. Migrate read-only notifications and reference widgets.
6. Migrate typing and browser widgets after focus handoff passes.
7. Migrate Hauling and Refinery.
8. Migrate Mining last.
9. Retain the canvas for one complete field-tested release.
10. Remove the canvas only after explicit approval.

Every step needs a regression test and four field gates: normal and Gamescope on Arch/CachyOS KDE,
then normal and Gamescope on Fedora/Nobara KDE.

## Current milestone

`electron/widget-window-manager.cjs` is disabled unless all of these conditions are true:

- the platform is Linux; and
- `SC_TRACKER_WIDGET_WINDOWS=preview` is present.

No production startup path enables the preview. Candidate 19 behavior therefore remains unchanged.
The foundation validates widget IDs and pages, creates secure frameless windows, starts them in hard
click-through mode, denies child popups, assigns stable KWin titles, and owns deterministic cleanup.

The second diagnostic revision adds one opt-in native window. Launch it with
`./bin/sc-blueprint-tracker-window-preview`. The probe exercises KWin stacking, separately persisted
native geometry, focusless held-`F` interaction, hard click-through, and explicit `Shift+F6` header
dragging. Native hit testing uses Electron screen coordinates and does not reuse the Canvas or
Gamescope coordinate domain. The special launcher records `electron.log`. The probe contains no
production widget and does not alter capture, OCR, the sidecar, or the Gamescope helper. The normal
`./bin/sc-blueprint-tracker` launcher remains Candidate 19 canvas mode.

Preview 3 treats the first native hit as authoritative until `F` is released because Star Citizen
can recenter the host cursor immediately after the hit. Its diagnostic arrange mode is focusless,
does not unlock the Canvas, debounces duplicate Shift+F6 transitions, and polls the main-process
cursor during header drag. A drag log must show both nonzero movement samples and matching requested
and actual bounds before the movement contract passes.

Preview 3 passed the normal CachyOS KDE field gate on October 1. Repeated held-`F` clicks preserved
focus, and three recorded drags finished with nonzero movement samples and exact requested/actual
bounds. The remaining diagnostic hardening item is to prevent the legacy Canvas classifier from
briefly claiming pointer authority after a native latch. After that regression is covered, SC Feed
is the first production widget eligible for migration. Gamescope plus both Fedora/Nobara gates still
apply before the Canvas can be retired.

Preview 4 migrates SC Feed as the first production widget. The opt-in launcher creates one native
SC Feed notifier and suppresses its Canvas instance; all other widgets stay on the Candidate 19
Canvas. Hidden notifier content is excluded from hit testing. A visible card or arrange preview
enables its native bounds, and the first native held-`F` hit excludes all asynchronous Canvas
classification until key release. The restricted native preload and main-process sender checks own
links, tone selection, content-active state, and header dragging. The ordinary launcher does not
enable this path. Preview 4 passed foundation and complete packaged CI, including its real Electron
SC Feed smoke test, exact Candidate 19 package comparison, protected hashes, and the full legacy
widget integration suite. It remains field unverified; normal CachyOS KDE is the next gate.
