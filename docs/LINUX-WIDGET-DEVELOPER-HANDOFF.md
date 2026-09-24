# ArchVerse Linux widget developer handoff

## Permanent widget-hotkey exclusion

Gabe requires per-widget hotkey editing to remain disabled in official Linux builds.
Do not import upstream's widget-cog editor, inject hotkey rows, or acquire keyboard ownership
for widget key capture. Existing startup bindings remain intact. Settings and the config API
must not change individual widget bindings. Personal source customization is outside this
supported contract. Ordinary widget features remain editable under the boundaries below.

Date: September 22, 2026

This handoff authorizes widget UI and feature development for Arch KDE and Nobara KDE while keeping
the field-verified Linux runtime contracts intact. The widgets are not frozen. The capture, input,
session, OCR authority, transport, and configuration boundaries are.

## Starting point

- Repository: `https://github.com/gbmccray32-boop/sc-overlay-for-Arch-Linux`
- Validated branch: `agent/alpha23-candidate16-pointer-mode-isolation`
- Validated source commit: `4f9f94c2907470fc095859ee659c465173e647e2`
- Packaged archive: `ArchVerse-Native-0.1.47-r31.alpha23.candidate16.tar.gz`
- Archive SHA-256: `244c4da008883a3bff8143078bda85c2a4f23450e11a459f2e5cc3c303483091`
- Frozen upstream: SC Overlay v0.1.47 at `e482c1ce3d461b390079486115293535be9b2ab7`
- Evidence: packaged verified and field verified in both normal KDE Wine/XWayland and Gamescope

Create widget work from the validated Candidate 16 source commit or from the documentation handoff
branch that contains this file. Do not reconstruct Linux behavior from an upstream-only checkout.

Before editing, read these files in order:

1. `AGENTS.md`
2. `docs/ARCHVERSE-CONTINUITY.md`
3. `linux-port/PORTING_CONTRACT.md`
4. this handoff

Then run `tools/update-archverse-handoff.sh` and inspect `git status --short --branch`.

## What the developer may change

Ordinary widget work is expected and permitted in these areas:

- widget markup, styling, assets, accessibility, and responsive layout in `overlay/`;
- widget-specific client behavior in `overlay/*.js` and inline widget scripts;
- widget-specific server data, routes, and tests in `src/` when they preserve the established API
  and Linux authority boundaries;
- translations and user-facing widget text, kept separate from capture stabilization when practical;
- Arch and Nobara package metadata, dependency names, desktop integration, and installation scripts;
  and
- tests and fixtures that cover the updated widget behavior.

A widget may be redesigned or replaced. It does not need to remain byte-identical to Candidate 16.
Preserve stable IDs, messages, routes, state shape, or renderer events that the canvas, preload,
sidecar, tests, or another widget consumes. If an interface must change, update all consumers and add
an integration regression in the same commit.

## Integration seams: change carefully

These files mix application features with Linux platform integration and require focused review:

- `overlay/canvas.js`: widget lifecycle, placement, hit regions, arrange mode, and renderer bridge;
- `electron/preload.cjs`: renderer IPC exposure;
- `electron/main.cjs`: window lifecycle, IPC, focus, capture coordination, and sidecar ownership;
- `electron/capture.cjs`: capture routing and OCR scheduling;
- `src/overlay-server.ts` and `src/index.ts`: application API composition;
- configuration UI or server code that reads or writes interaction or screen-reader settings; and
- package payload or patch rules that decide which source files enter the Linux archive.

Do not line-merge `electron/main.cjs` or `electron/capture.cjs` as finished code. Reconstruct changes
at a named semantic seam and run the relevant Linux regressions.

## Protected Linux behavior

Widget work must not regress or replace these contracts:

- held `F` is the interaction gate, hold-to-interact stays enabled, and `Shift+F6` remains arrange;
- outside an owned widget region the overlay is hard click-through, Star Citizen keeps control, and
  only one native cursor is visible;
- physical pointer and button forwarding, focus ownership, and pointer restoration remain verified;
- normal Wine/XWayland uses unchanged host pointer coordinates; only a verified bound Gamescope PID
  permits nested-coordinate scaling;
- capture is bound to the exact `StarCitizen.exe` PID and process start identity;
- Gamescope uses direct `gamescope-pipewire` first and identifies `Gamescope PipeWire node <id>`;
- normal KDE Wayland uses the isolated WINDOW-only portal PipeWire path first and retains one portal
  approval per exact game process without chooser loops;
- normal X11, Spectacle, and Electron capture remain bounded fallbacks in the documented order;
- the complete game canvas remains available to Hauling and Location Sync while Mining uses its
  established display/crop coordinate space;
- RapidOCR stays isolated and bounded, with Tesseract as fallback;
- Mining changes state only after Game.log vehicle authority and an exact current-catalog Resource
  Signature agree; widget visibility, focus, or radar pixels are not authority;
- `SC_TRACKER_CONFIG_DIR` remains the canonical Linux configuration root and the API repairs the
  protected interaction controls; and
- Game.log and screen capture remain read-only inputs. Do not inject into Star Citizen or read game
  memory.

Widget code must not start its own capture pipeline or perform coordinate conversion that belongs to
the platform layer.

## Arch KDE and Nobara KDE rule

Maintain one application behavior across both distributions. Use packaging differences only where
the systems require them:

- Arch packages may use pacman dependency names and Arch packaging conventions.
- Nobara packages may use Fedora-family RPM/DNF dependency names, portals, and SELinux-compatible
  installation paths.
- Both must use KDE's portal stack and the same runtime capture/input decisions.
- Do not fork widget logic, capture order, hotkeys, or configuration semantics by distribution.

Candidate 16 has passed both launch modes in the native field archive. Fresh Arch KDE and Nobara KDE
packages remain unverified until installed and run on their target systems.

## Required tests for a widget change

Always run:

1. the widget's focused unit or DOM test;
2. HTML parsing, inline-script syntax, duplicate-ID, and preload/IPC audits;
3. the complete widget integration suite;
4. TypeScript and CommonJS syntax checks for every changed source file;
5. production sidecar build and packaged main-process smoke tests if server, preload, or Electron
   integration changed; and
6. archive manifest and checksum verification after packaging.

Also run the relevant platform tests when a widget crosses an integration seam:

- hit-region, held-`F`, click-through, focus, pointer, and arrange tests for interaction changes;
- full-canvas/region handshake and both capture routers for geometry or screen-reader changes;
- real-sidecar Mining admission and vehicle-presence tests for Mining changes;
- config E2E for settings changes; and
- normal KDE plus Gamescope in-game field tests for changes to `canvas.js`, preload/IPC, Electron
  window behavior, capture, OCR scheduling, or session handling.

For package-ready work, install and smoke-test the generated package on both Arch KDE and Nobara KDE.
Confirm normal KDE portal capture, Gamescope direct PipeWire, held-`F` interaction, arrange mode,
Mining, Hauling, refinery timers, Location Sync, settings persistence, upgrade, and rollback.

## Known non-blocking follow-up items

The Candidate 16 Gamescope field logs expose two cleanup issues that did not affect active play:

- After Star Citizen quits, a transient Wine child can briefly look like a new normal session. It
  may attempt one portal request before disappearing. Future hardening should suppress new capture
  initialization while the bound game session is shutting down.
- Sharing a rotated Game.log at 4,194,316 bytes received `400 bad_size`. Local features remained
  healthy. Treat this as a separate log-share size/rotation defect, not a capture failure.

Do not mix either repair into unrelated widget work.

## Delivery rules

- Work in a feature branch and keep changes grouped by widget or integration seam.
- Add a regression for every corrected defect.
- Do not move the frozen upstream target in the same change unless Gabe explicitly approves it.
- Do not restore ArchVerse startup or shutdown to the Star Citizen launcher scripts.
- Record exact commits, workflow runs, artifact names, checksums, tests, and remaining unverified
  items in `docs/ARCHVERSE-CONTINUITY.md`.
- Run `tools/update-archverse-handoff.sh` after every meaningful checkpoint.
- Keep publication disabled until automated, packaged, distro-install, and required field gates pass.

The purpose of these rules is to let widget development move quickly without reopening the solved
Linux capture and interaction failures.
