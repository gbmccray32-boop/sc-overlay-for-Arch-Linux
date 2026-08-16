# Upstream convergence: 2026-08-16

This document is the release gate for bringing new SubliminalsTV SC Overlay work into the ArchVerse native Linux packages. Preparation occurs on `integration/upstream-main-2026-08-16`. Nothing on this branch may publish, replace, retag, or upload a release.

## Pinned source boundary

- Fork release branch: `archverse/r31`
- Fork preparation base: `da31b427d23a1f33aba24f16a45d94246d9033c9`
- Upstream repository: `SubliminalsTV-Projects/sc-overlay`
- Last upstream release: `v0.1.43`
- Upstream release commit: `26dbff28e64f595e98c42e3f15bf84303d3d8da2`
- Reviewed upstream candidate: `f6ec3ba365e6d4ac8f08741152ee6bbfbc486941`
- Candidate observation time: `2026-08-16T05:25:29Z`

The candidate is 37 commits and 27 changed files ahead of `v0.1.43`. It is unreleased upstream code. Do not silently replace the pinned candidate with a newer `main`; review and record a new commit first.

## Merge risk map

The incoming work is mainly Mission and Blueprint Tracker UI, idle-state, reputation, localization, and event-tracker work. The files below overlap Linux-sensitive code and require a three-way review. Never resolve them by accepting one side wholesale.

- `electron/capture.cjs`
- `electron/main.cjs`
- `electron/preload.cjs`
- `overlay/config.html`
- `overlay/mining.html`
- `overlay/missions.html`
- `src/mining.ts`
- `src/missions.ts`
- `src/missions-parser.ts`
- `src/overlay-server.ts`
- `package.json`
- `package-lock.json`

The preflight workflow writes the exact upstream delta, fork delta, overlap list, and Git merge-tree result to an artifact for every candidate.

## Permanent native Linux contract

Every converged payload must retain all of these behaviors:

- Bind capture to the exact `StarCitizen.exe` process tree and its Gamescope session. Never read an arbitrary foreground application.
- Use the bound Gamescope PipeWire Video/Source as the primary Linux capture backend. Discover the PipeWire node and BGRx frame size dynamically. Keep Spectacle and Electron capture as fallbacks only.
- Handle 6360x2160 panoramas and center-display geometry correctly. Keep Mining geometry independent from other OCR regions.
- Use RapidOCR/ONNX as the primary Linux OCR engine and Tesseract only after RapidOCR failure. Windows Media OCR, WinRT, and PowerShell OCR must remain unreachable on Linux.
- OCR only independent normalized crops for Resource Signature, Fabricator, Mission, Claim/context, and Refinery. Regions must remain persistent, movable, resizable, hideable, resettable, and relative to the bound game display.
- Treat a legal parsed resource signature as authoritative. Do not add a second HTTP hop, radar gate, nearest-ore guess, or non-whitelisted mineable.
- Keep radar and glyph recognition diagnostic or confirmation-only. Mining sounds must require an OCR-confirmed Scan Mode and must not use sticky or false-positive scan state.
- Keep Mining armed independently of widget visibility, held F, hover, and overlay focus. Bound polling to 900-3000 ms and keep secondary telemetry asynchronous.
- Disable Electron background throttling for the live overlay while Star Citizen owns focus.
- Preserve Linux click-through and focus behavior: held F enables only the hovered widget; F-up hover re-arms; leaving widgets, Escape, or the 30-second watchdog restores click-through and game focus. Preserve Shift+F5 and Shift+F6.
- Keep the startup What's New card clickable and preserve the isolated, sandboxed browser/Twitch view with Node disabled and permissions denied.
- Preserve exact-byte watcher handoff, safe log-rotation restart, and mission-completion isolation.
- Preserve user data under `${XDG_CONFIG_HOME:-~/.config}/sc-blueprint-tracker`; package installation and upgrade must never reset it.
- Preserve CPU ONNX Runtime while removing unused CUDA, TensorRT, and musl-only Koffi payloads.

## One payload, three native packages

All targets must be built from one byte-identical, policy-verified application payload. Distribution-specific changes are limited to package metadata, launch integration, and runtime dependency names.

| Target | Runtime rule | Mandatory transaction test |
| --- | --- | --- |
| Arch / CachyOS | Use distro `electron42`; require Node, English Tesseract data, PipeWire/GStreamer, X11 helpers, Spectacle, ImageMagick, and `ffmpeg`/`ffplay` provider | Build with `makepkg`; inspect `.PKGINFO` and files; install with `pacman -U` in a clean Arch-family environment |
| Debian / Ubuntu | Bundle the pinned Electron runtime; require Node, English Tesseract data, PipeWire/GStreamer, X11 helpers, Spectacle, ImageMagick, and `ffmpeg` | Inspect with `dpkg-deb`; install with `apt install ./package.deb` in a clean supported environment |
| Fedora 44 / Nobara | Bundle the pinned Electron runtime; require `/usr/bin/ffplay`, never the `ffmpeg` package name, so `ffmpeg-free` can satisfy audio playback | Inspect RPM requires/files; run clean DNF install with weak dependencies disabled and verify no package erasure is needed |

## Promotion gates

1. Pin the upstream candidate commit and save the preflight artifact.
2. Apply the upstream delta on the integration branch and resolve every protected-file overlap manually.
3. Rebuild the server and create one distro-neutral payload.
4. Apply every `packaging/common/enforce-native-*.cjs` policy and run the OCR, Mining, session, watcher, interaction, security, and syntax tests.
5. Build all three packages from the same payload. Inspect files and dependencies, then pass clean install transactions for all targets.
6. Confirm package upgrades preserve the existing user configuration directory.
7. Perform a real KDE/Gamescope Star Citizen field test, including capture binding, OCR crops, Mining cadence, held-F interaction, focus handoff, watcher handoff, What's New, and browser/Twitch security.
8. Only after all gates pass: choose the new ArchVerse version, update all three package revisions together, generate combined SHA-256 sums, and run a separate publish workflow with explicit release approval.

Historical patches under `docs/history/` or `linux-port/` are records and recovery aids. Do not replay them blindly over new upstream code; the current policy scripts and tests are authoritative.
