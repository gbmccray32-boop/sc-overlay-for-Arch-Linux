# ArchVerse development continuity

This file is the canonical human-maintained project handoff. Update it whenever the verified
baseline, current target, field result, open problem, or next step changes.

## Evidence labels

- **Automated verified:** Repository checks or CI completed successfully.
- **Packaged verified:** The artifact exists and its checksum was verified.
- **Field verified:** Gabe ran the build with Star Citizen and supplied observations or a runtime log.
- **Unverified:** The behavior or artifact has not passed the required evidence level.

Do not convert one label into another without new evidence.

## Current state — September 5, 2026

| Item | Current value |
| --- | --- |
| Repository | `https://github.com/gbmccray32-boop/sc-overlay-for-Arch-Linux` |
| Current packaged candidate | `0.1.44-r31.alpha22.candidate8i` |
| Candidate branch | `agent/alpha22-candidate8i-mining-fast-path` |
| Packaged source commit (remote) | `c1aed6a1e02b997d52c7fe69d3cbdd0b6b9c1aac` |
| Equivalent local checkpoint | `c1aed6a1e02b997d52c7fe69d3cbdd0b6b9c1aac` |
| Remote/local tree | `43c2b84572e0efebd3d516daa34b9d08f0b304f4` — exact match, including executable modes |
| CI workflow | `Alpha22 Candidate 8i Mining Fast Path` |
| CI result | **Automated verified** — run `33995752456` succeeded in 52 seconds |
| Artifact ID | `9978005577` |
| GitHub artifact | `ArchVerse-0.1.44-Alpha22-Candidate8i` |
| Artifact ZIP SHA-256 | `17726d343fd388e387a131640d2a9af883e66b2ddd51e643048ade59a1418dec` |
| Native archive | `ArchVerse-Native-0.1.44-r31.alpha22.candidate8i.tar.gz` |
| Native archive SHA-256 | `0fe867952ecad62060eb39b835e13a086076598eba70a654566e021768d436ec` |
| Artifact integrity | **Packaged verified** — downloaded artifact, GitHub digest, inner checksum, embedded version, syntax, frozen Linux markers, packaged data lookup, and Candidate 8i real-sidecar self-test passed |
| Candidate 8h in-game status | **Field tested, failed** — September 5 log proves per-frame PipeWire process startup, competing OCR workers, long fallbacks, and interval scheduling stretch the intended 1,200 ms Mining lane to a 6.188-second median |
| Latest field-tested candidate | Candidate 8h, tested September 5, 2026 |
| Candidate 8i in-game status | **Unverified** — automated and packaged verification passed; no Candidate 8i field log has been supplied yet |
| Frozen upstream target | `aecabc2c2ec25822e2e784832ee6d6cfa9892d30`, upstream version `0.1.46` |
| Upstream delta | 68 commits after the earlier frozen `97e381fd` target |
| Immediate next step | Field-test Candidate 8i without using `F` or the scan-area overlay as a wake-up action, then preserve the full runtime log |

The branch `agent/archverse-continuity-handoff` contains continuity infrastructure only and starts
from Candidate 8f. Candidate 8i branches from the later continuity state but rebuilds from the exact
checksum-verified Candidate 8h artifact produced by run `33945862290`.

## What Candidate 8f changes

Candidate 8f starts from the exact verified Candidate 8e artifact at commit
`92ccdc08fc6d0b936f0ccb1a234e046b205f5923`. Its build verifies the pinned Candidate 8e run,
artifact identity, digest, head commit, and tarball checksum before applying the Candidate 8f patch.

Candidate 8f changes Mining authority as follows:

- Game.log ship-channel membership and granted vehicle-control tokens establish vehicle presence.
- Vehicle-control requests alone do not establish presence.
- Vehicle-control release and ship-channel departure remove the corresponding presence state.
- Mining acquisition uses a 1,200 ms vehicle cadence.
- A Mining result requires both active vehicle presence and a current valid RS total.
- Accepted results identify their method as `gamelog-vehicle+rs`.
- The radar/Scan Mode detector is not part of the Mining authority path.
- The older `pipewire-radar+rs`, radar latch, and radar-led numeric fallback paths are removed.
- Direct Gamescope PipeWire remains the preferred frame source. Removing radar authority does not
  remove the PipeWire capture contract.

The Candidate 8f self-test exercises on-foot startup, ship enter/leave, vehicle request, vehicle
grant, vehicle release, theme separation, and current Mining signature catalog controls.

## Latest field evidence

The latest uploaded runtime evidence is `archverse-candidate8h-electron.log`, created September 5,
2026. It is a 91-minute Candidate 8h field run containing 2,051 log lines.

Observed Candidate 8h behavior:

- Direct Gamescope PipeWire bound to node `174` for the exact Gamescope/Star Citizen session and
  remained the Mining source. The regression is above source discovery and focus gating.
- The log contains 641 Mining OCR events. Successful OCR itself is fast: its median is about 218 ms.
  The effective interval between Mining observations is not fast: median 6.188 seconds, 90th
  percentile 18.034 seconds, with 117 intervals longer than 16 seconds.
- Candidate 8h still starts a new `gst-launch-1.0` PipeWire pipeline and encodes a display PNG for
  each scanner tick. It also owns six independent RapidOCR workers plus the general OCR client.
- There are 173 bounded OCR timeout/fallback failures and 180 vehicle-presence IPC timeouts. At
  least 29.2% of the measured run is consumed by roughly nine-second failure paths.
- Held `F` is correlated with looking around the HUD, not with scanner authority. Of completed
  Mining observations, 91.5% occur more than three seconds after the last `F` transition; accepted
  reads occur between 4.7 and 84.5 seconds after one. Showing the scan area changes or confirms the
  crop, but it is not a valid liveness trigger.
- The catalog correctly rejects a structurally clear `26000`, but it does so 16 times without
  preserving a useful unclassified observation. A `20000` can also be admitted from a
  `SHIP IN DISTRESS`/wreckage HUD context because the prior parser validates the number without
  validating the surrounding line semantics.
- Candidate 8h therefore regressed the developer's useful execution property: one warm reader
  handles Mining work without repeatedly rebuilding capture and OCR state. The Linux port retained
  the correct direct PipeWire source but put expensive setup, background OCR, polling IPC, and
  interval delay in front of each Mining read.

Candidate 8h does not pass the Mining field gate. The evidence rules out `F` as the cause and makes
capture/OCR scheduling plus context admission the Candidate 8i repair boundary.

## What Candidate 8g repairs

Candidate 8g starts from the exact Candidate 8f artifact and makes the current RS catalog
authoritative from OCR parsing through Mining state:

- Restores the original `2000`-step debris/harvest vocabulary through 12 panels (`24000`).
- Removes the stale `30000` OCR parser ceiling and accepts exact catalog values through `120000`.
- Removes the stale `25800` tracker ceiling after exact current-catalog admission.
- Retains colliding catalog possibilities instead of guessing one resource.
- Commits a valid Linux Mining read inside the successful `/api/screen-read` request, using the
  sidecar's authoritative Game.log vehicle state.
- Keeps the older `/api/mining/scan` path as a compatibility fallback, but it is no longer the
  normal Linux commit path.
- Keeps direct Gamescope PipeWire, held-`F`, click-through, one cursor, OCR isolation, and all other
  frozen Linux contracts unchanged.

The Candidate 8g regression test starts the real sidecar and proves that on-foot `2000` remains
blocked, while in-vehicle `2000`, `32000`, and `120000` parse and commit. It also rejects non-catalog
values and checks the Candidate 8f vehicle/capture contract markers.

## What Candidate 8h repairs

Candidate 8h starts from the exact Candidate 8g artifact from run `33833003367`, artifact
`9922339513`, outer digest
`c786d3a6b5c636bbe80cc774ccc58be529a7f9add36ee3d70a09749dbd37edb3`, and native archive
checksum `37846d4e330f7f248be3acd518a0c388537cef0e9f79a1b186b945eb5529584e`.

It changes only the diagnosed Mining liveness and false-positive paths:

- A failed `/api/vehicle-presence` request retains the last confirmed Game.log state and uses
  bounded retry instead of turning an IPC timeout into a false vehicle departure.
- Every Mining `/api/screen-read` response returns the sidecar's current Game.log authority state.
  Capture reconciles it immediately, and the sidecar still rechecks that state before every inline
  commit, so on-foot reads remain fail-closed.
- Repeated auxiliary OCR failures use a 15–120 second exponential backoff instead of launching an
  8–9 second RapidOCR/Tesseract fallback on every scanner tick.
- Coordinate-shaped decimal groups are rejected before RS parsing, including the exact Candidate
  8g field strings. A standalone `48.000` signature and a valid `3,400 | 90° STRONG` read remain
  accepted.
- The legacy fallback diagnostic now logs `vehicle=0` only when vehicle authority is actually
  inactive; a successfully handled inline commit no longer falls into that rejection branch.
- The package description and Linux porting contract now identify Game.log vehicle presence plus an
  exact current-catalog RS value as Mining authority. Radar and focus remain observational only.

The Candidate 8h self-test exercises transient IPC failure, retry backoff, inline departure
reconciliation, on-foot refusal, in-vehicle acceptance, all observed coordinate false positives,
and the preserved dot-grouped/strength-text cases against the real sidecar. CI also reruns the
Candidate 8g regression before applying Candidate 8h and checks the direct Gamescope PipeWire,
held-`F`, click-through, one-cursor, session-binding, and OCR-isolation markers.

## What Candidate 8i repairs

Candidate 8i starts from the exact Candidate 8h artifact from run `33945862290`, artifact
`9963305922`, outer digest
`0f7b66b319729f91d9bab6eaed454b598661f9c8164a6c14dbfe95a7d539b48c`, and native archive
checksum `763da3b0b460de8becda1f16f1a082824c0640326cb23760d1d55a5b2b6cfada`.

It restores the developer's warm-reader execution model and adds Linux-specific controls:

- One persistent `gst-launch-1.0` pipeline subscribes directly to the exact Gamescope PipeWire node
  at three frames per second. Its leaky one-frame queue and four-file ring keep only recent frames.
- GStreamer crops the desktop panorama to the calibrated Star Citizen display. Electron retains the
  dynamic user-configured Resource Signature crop so region changes do not restart the stream.
- Mining owns one restartable RapidOCR worker with a 900 ms request deadline and a bounded 600 ms
  Tesseract fallback. Every auxiliary reader shares one separate background worker.
- While Game.log says the player is in a ship or ground vehicle, auxiliary OCR is suspended. It
  cannot compete with Mining even before the first signature is recognized.
- A self-scheduler starts the next read from the prior tick's start time. A slow tick cannot overlap
  the next tick or add a second full polling delay. Stale frames and stalled OCR workers are dropped.
- Vehicle presence is pushed over one local server-sent-event stream. A bootstrap GET remains for
  startup, while disconnects retain the last Game.log-confirmed state until the sidecar reconciles a
  real vehicle exit.
- Numeric admission now rejects distress/wreckage, elevator/hangar, cargo/storage, identifier, and
  coordinate contexts. Ambiguous lines containing more than one distinct signature are rejected.
- A structurally clear value outside the exact current RS catalog is logged as an unclassified
  observation but never committed. Exact catalog membership remains authoritative.
- Heartbeat telemetry includes capture time, frame age, crop/OCR time, queue depth, and worker
  restart counts so any remaining field delay has a measurable stage.

The Candidate 8i regression launches the actual packaged sidecar from its packaged server directory,
proving it loads its own Mining data. It verifies latest-frame selection, timeout-driven worker
replacement, pushed vehicle transitions, on-foot refusal, in-vehicle `2000` acceptance, safe
preservation of `26000` and `5959`, and rejection of the exact false contexts from the field log.

## Candidate 8i field-test gate

Before Candidate 8i becomes the field baseline, verify these cases in one saved runtime log:

1. Start on foot. Confirm Mining does not accept or announce an RS value.
2. Enter a ship. Confirm `/api/vehicle-presence` becomes active from the ship channel.
3. Without pressing `F` and without opening “show scan area,” scan a `2000` debris/harvest signature.
   Confirm it is accepted promptly and the poll remains near `1200ms` while no signature is visible.
4. Scan several ore signatures, including one above `30000` if available. Confirm the log reports
   `commit=integrated:used`, does not emit a matching false `vehicle=0`, and does not require the
   compatibility `/api/mining/scan` request.
5. Leave the ship. Confirm vehicle presence clears and Mining refuses new values.
6. Enter and exit a ground vehicle. Confirm control grant activates presence and release clears it.
7. Hold `F` over widgets, type or click, leave the widget, and release `F`. Confirm focus and
   click-through recover without a second cursor.
8. Confirm the capture source remains `gamescope-pipewire` and identifies a Gamescope PipeWire node.
9. Confirm auxiliary OCR reports `deferred-for-mining` while vehicle authority is active and resumes
   after leaving the vehicle; it must not consume the Mining lane.
10. Visit a location that exposes decimal navigation coordinates. Confirm the coordinates are not
    accepted or announced as an RS value.
11. Confirm location sync remains responsive during the Mining test.
12. Run long enough to capture several heartbeat batches. Confirm frame age stays bounded and worker
    restart counts rise only when a deadline actually discards a stale worker.

If a case fails, preserve the log and create one candidate that addresses only that failure group.

## Upstream target and porting order

Gabe selected the latest reviewed upstream commit as the target. The frozen target is:

- Repository: `https://github.com/SubliminalsTV-Projects/sc-overlay`
- Commit: `aecabc2c2ec25822e2e784832ee6d6cfa9892d30`
- Commit date: August 27, 2026
- Upstream package version: `0.1.46`
- Subject: `Merge orisonfix: ignore event contributions earned before the event's live run`

Candidate 8i is still based on the `0.1.44` integration line. After Candidate 8i passes its field
gate, compare the 68 remaining upstream commits by behavior group. Port one group at a time and keep
the target frozen until every group is reconciled and tested.

## Binding Linux decisions

- Gabe explicitly authorized Charlie/Codex on September 4, 2026 to push completed ArchVerse project
  work to the configured origin, including future ArchVerse branches and commits. Candidate,
  field-test, release, and deployment gates still apply.
- Linux behavior is the non-negotiable baseline. Upstream features may enhance it but may not
  regress it.
- Held `F` is the Linux widget interaction path in the current tested runtime.
- `Shift+F6` is the Linux arrange shortcut in the current contract.
- Hard click-through, one native cursor, focus ownership, and physical pointer forwarding remain.
- Direct Gamescope PipeWire is the permanent first-choice Mining capture path when Gamescope owns the
  active Star Citizen session.
- Gamescope is optional. Default Star Citizen launches must retain functional fallback capture.
- RapidOCR remains crash-isolated and resource-bounded, with Tesseract as fallback.
- Mining values use the canonical exact signature catalog. Do not invent nearest-number matches.
- `SC_TRACKER_CONFIG_DIR` owns Linux config state.
- Game.log and screen capture are read-only inputs. Do not add process injection or game-memory reads.
- Privacy, tokens, network access, and OCR features remain local-first and opt-in.
- The panoramic Gamescope launcher's PipeWire source string is a protected Linux contract.
- ArchVerse is not currently started or killed by Gabe's Star Citizen launcher scripts. Keep the
  launcher independent unless Gabe asks to restore integration.
- Full UI translation work remains separate. The existing upstream blueprint language-file parsing
  and localization fixes remain in the application baseline.

See `linux-port/PORTING_CONTRACT.md` for the complete validation matrix.

## Superseded status files

These files remain useful as history, but they are not current status authorities:

- Root `README.md`: describes upstream Windows usage and does not identify Candidate 8i.
- Packaged Candidate 8f `README.md`: inherited Alpha 21 text.
- `linux-port/ALPHA-STATUS.md`: records the Alpha 17 checkpoint.
- `docs/R31-INPUT-DESIGN.md`: records an older Right Alt design that was superseded by the tested
  held-`F` and `Shift+F6` Linux contract.
- `docs/NATIVE-PACKAGING.md`: describes the Alpha 21 three-distribution package checkpoint.

## Distribution status

The latest verified packaged deliverable is the quarantined Candidate 8i native tar/zip artifact.
It passed CI and independent artifact verification, but it has not passed its in-game field gate.
The last documented Arch, Fedora, and Debian package set belongs to the older Alpha 21 line. Do not
describe Candidate 8i as a completed three-distribution release until fresh packages pass their own
checks and field tests.

## Continuity maintenance

- Update this file only from evidence, repository state, or an explicit decision from Gabe.
- Keep the current baseline and latest field-tested baseline separate.
- Record exact branch names, full commits, workflow runs, artifact names, checksums, and tests.
- Move completed work into a short decision-history entry instead of deleting the reason for it.
- Run `tools/update-archverse-handoff.sh` after the update.
- Replace the existing persistent `ARCHVERSE-HANDOFF.generated.md` after each meaningful project
  change. Do not create another handoff file with the same purpose.
- Upload `ARCHVERSE-HANDOFF.generated.md` to a new chat when direct repository access is unavailable.
