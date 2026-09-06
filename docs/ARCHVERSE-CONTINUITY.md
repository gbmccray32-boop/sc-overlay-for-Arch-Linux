# ArchVerse development continuity

This file is the canonical human-maintained project handoff. Update it whenever the verified
baseline, current target, field result, open problem, or next step changes.

## Evidence labels

- **Automated verified:** Repository checks or CI completed successfully.
- **Packaged verified:** The artifact exists and its checksum was verified.
- **Field verified:** Gabe ran the build with Star Citizen and supplied observations or a runtime log.
- **Unverified:** The behavior or artifact has not passed the required evidence level.

Do not convert one label into another without new evidence.

## Current state — September 6, 2026

| Item | Current value |
| --- | --- |
| Repository | `https://github.com/gbmccray32-boop/sc-overlay-for-Arch-Linux` |
| Current packaged candidate | `0.1.44-r31.alpha22.candidate8j` |
| Candidate branch | `agent/alpha22-candidate8j-mining-transport-recovery` |
| Packaged source commit (remote) | `7753b9d1ecaf112d8a17162a5bf1dd48914f35b9` |
| Equivalent local checkpoint | `2bfc921b054f1acc6a2e3e5c53594dcc2d24f0b6` |
| Remote/local tree | `3810c42044ff5d6c7847b4c4ea7e44d52125e484` — exact match, including executable modes |
| CI workflow | `Alpha22 Candidate 8j Mining Transport Recovery` |
| CI result | **Automated verified** — final branch-head run `34043540649` succeeded |
| Artifact ID | `9992407560` |
| GitHub artifact | `ArchVerse-0.1.44-Alpha22-Candidate8j` |
| Artifact ZIP SHA-256 | `80c072a7d182a45d3284f48f19f419cc29baaaecc7188daaffd91d5ddaf1dc68` |
| Native archive | `ArchVerse-Native-0.1.44-r31.alpha22.candidate8j.tar.gz` |
| Native archive SHA-256 | `f1a0b144e176aa2e3ec641e42370d650f58d1a6b321cd6364c7c04ff1c4066b6` |
| Artifact integrity | **Packaged verified** — downloaded artifact, GitHub digest, inner checksum, embedded version, syntax, frozen Linux markers, Candidate 8i baseline test, Candidate 8j recovery test, and 120-request real-sidecar soak passed |
| Candidate 8i in-game status | **Field tested, failed** — September 6 log contains 331 Mining localhost timeouts and about 82.6 minutes of failure windows in a 148.2-minute run; OCR and direct PipeWire remain fast when the route is healthy |
| Latest field-tested candidate | Candidate 8i, tested September 6, 2026 |
| Candidate 8j in-game status | **Unverified** — automated and packaged verification passed; no Candidate 8j field log has been supplied yet |
| Frozen upstream target | `aecabc2c2ec25822e2e784832ee6d6cfa9892d30`, upstream version `0.1.46` |
| Upstream delta | 68 commits after the earlier frozen `97e381fd` target |
| Immediate next step | Field-test Candidate 8j without using `F` or the scan-area overlay as a wake-up action, run long enough to cross the prior five-minute failure boundary, then preserve the full runtime log |

The branch `agent/archverse-continuity-handoff` contains continuity infrastructure only and starts
from Candidate 8f. Candidate 8j branches from the later continuity state but rebuilds from the exact
checksum-verified Candidate 8i artifact produced by run `33995752456`.

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

The latest uploaded runtime evidence is `archverse-candidate8i-electron.log`, created September 6,
2026. It is a 148.2-minute Candidate 8i field run.

Observed Candidate 8i behavior:

- Direct Gamescope PipeWire remains the capture source. Broad-crop OCR normally completes in about
  247–258 ms, and locked-crop OCR normally completes in about 36–67 ms.
- The repaired catalog and parser commit real `2000`, `3400`, `3900`, `7200`, `10000`, and `14000`
  values. The persistent PipeWire producer and dedicated Mining OCR worker are effective.
- The log contains 331 Mining localhost timeout lines and 20 failure runs. The interval from each
  first failure to recovery totals about 82.6 minutes, or 55.7% of the 148.2-minute session.
- Candidate 8i introduced a persistent vehicle-presence SSE connection on the same global localhost
  fetch stack used by Mining commit traffic. The stream ends at roughly five-minute intervals;
  stream reconnect failures and Mining POST failures correlate in the field log.
- The exact low-level failure inside the shared local transport was not proven without a matching
  sidecar log, but the Candidate 8i regression is isolated above PipeWire and OCR. The Candidate 8i
  automated test mocked the SSE instead of running it concurrently with sustained real-sidecar
  POST traffic, so the test could not reproduce this failure class.
- Focus is not the authority or the root cause. Mining recovered at `04:07:00Z` while ArchVerse
  still owned focus; Star Citizen regained focus at `04:07:13Z`. Another outage continued until
  `05:06:20Z` even though Star Citizen regained focus at `04:54:48Z`.
- Pressing `F`, showing the scan area, or Alt-Tabbing can coincide with a recovery or crop refresh,
  but none is a valid Mining wake-up action. Game.log vehicle presence plus an exact current RS
  value remain the only Mining authority.
- Candidate 8i's message that a “bounded OCR attempt failed” combines OCR, local parsing, and the
  awaited sidecar request. In the failing windows OCR usually completed before the 8-second
  `/api/screen-read` timeout, so the message attributed a transport failure to OCR.

Candidate 8i does not pass the Mining field gate. Candidate 8j preserves its fast PipeWire/OCR work
and removes the shared-SSE and awaited-sidecar failure paths.

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

## What Candidate 8j repairs

Candidate 8j starts from the exact Candidate 8i artifact from run `33995752456`, artifact
`9978005577`, outer digest
`17726d343fd388e387a131640d2a9af883e66b2ddd51e643048ade59a1418dec`, and native archive
checksum `0fe867952ecad62060eb39b835e13a086076598eba70a654566e021768d436ec`.

It keeps Candidate 8i's fast capture and OCR path, then removes the field-proven transport hazard:

- Vehicle presence returns to bounded cached GET requests over independent loopback HTTP
  transactions. Candidate 8j removes the experimental vehicle-presence SSE client and endpoint.
- Mining classifies the OCR lines locally with the same exact catalog and false-context rules used
  by the sidecar. A valid read locks the crop and selects the 900 ms cadence immediately.
- The authoritative `/api/screen-read` commit is asynchronous. One request may run and one newest
  result may wait; a 650 ms failure retains the latest read with bounded retry instead of blocking
  the capture/OCR tick for eight seconds.
- The sidecar still repeats parsing and rechecks its current Game.log vehicle authority before
  every state change. A stale in-vehicle capture state cannot authorize an on-foot commit.
- Mining uses exact Linux rates: 1,200 ms for in-vehicle acquisition and 900 ms after a valid
  signature. Small timing changes no longer cause 909/913/941 ms scheduler flapping.
- OCR failures and commit-transport failures have separate log prefixes. A compact 15-second
  Mining heartbeat is written directly to `electron.log`, so it remains visible when the sidecar
  cannot receive diagnostics.
- Repeated Mining transport failures trigger a separate short `/api/instance` health probe. Only
  three consecutive failures of that independent probe may restart the owned sidecar child.
- The regression test uses the real packaged sidecar for 120 Mining commits interleaved with 120
  vehicle-presence reads under the 650 ms deadline. It also forces a hung commit route, proves that
  `submit()` remains immediate, preserves the newest result, verifies recovery, and exercises the
  watchdog threshold.

## Candidate 8j field-test gate

Before Candidate 8j becomes the field baseline, verify these cases in one saved runtime log:

1. Start on foot. Confirm Mining does not accept or announce an RS value.
2. Enter a ship. Confirm `/api/vehicle-presence` becomes active from the ship channel.
3. Without pressing `F` and without opening “show scan area,” scan a `2000` debris/harvest signature.
   Confirm acquisition runs at exactly `1200ms` and changes to exactly `900ms` after the read.
4. Scan several ore signatures, including one above `30000` if available. Confirm the log reports
   `commit=queued`, then a matching `[mining-commit]` acknowledgment with `result=used`. Confirm it
   does not use the compatibility `/api/mining/scan` request.
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
12. Run longer than the prior five-minute SSE failure interval. Confirm `[mining-heartbeat]` remains
    present in `electron.log`, the 900/1200 cadence stays stable, and no repeated `[mining-ipc]`
    timeout run appears.
13. If the sidecar becomes unresponsive, confirm three failed independent health probes precede one
    owned-sidecar restart and the newest Mining result is acknowledged after recovery.

If a case fails, preserve the log and create one candidate that addresses only that failure group.

## Upstream target and porting order

Gabe selected the latest reviewed upstream commit as the target. The frozen target is:

- Repository: `https://github.com/SubliminalsTV-Projects/sc-overlay`
- Commit: `aecabc2c2ec25822e2e784832ee6d6cfa9892d30`
- Commit date: August 27, 2026
- Upstream package version: `0.1.46`
- Subject: `Merge orisonfix: ignore event contributions earned before the event's live run`

Candidate 8j is still based on the `0.1.44` integration line. After Candidate 8j passes its field
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

- Root `README.md`: describes upstream Windows usage and does not identify Candidate 8j.
- Packaged Candidate 8f `README.md`: inherited Alpha 21 text.
- `linux-port/ALPHA-STATUS.md`: records the Alpha 17 checkpoint.
- `docs/R31-INPUT-DESIGN.md`: records an older Right Alt design that was superseded by the tested
  held-`F` and `Shift+F6` Linux contract.
- `docs/NATIVE-PACKAGING.md`: describes the Alpha 21 three-distribution package checkpoint.

## Distribution status

The latest verified packaged deliverable is the quarantined Candidate 8j native tar/zip artifact.
It passed CI and independent artifact verification, but it has not passed its in-game field gate.
The last documented Arch, Fedora, and Debian package set belongs to the older Alpha 21 line. Do not
describe Candidate 8j as a completed three-distribution release until fresh packages pass their own
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
