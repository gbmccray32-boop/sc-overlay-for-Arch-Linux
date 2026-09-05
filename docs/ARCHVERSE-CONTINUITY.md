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
| Current packaged candidate | `0.1.44-r31.alpha22.candidate8h` |
| Candidate branch | `agent/alpha22-candidate8h-mining-liveness` |
| Packaged source commit (remote) | `8c3525d58d528f877383d1088cd5eff27f5da8a3` |
| Equivalent local checkpoint | `41d70317a7f1ff375b49992b282cc7a4139c3422` |
| Remote/local tree | `81be70a579a1d6e0b3824c85a411b09866da9588` — exact match, including executable modes |
| CI workflow | `Alpha22 Candidate 8h Mining Liveness Repair` |
| CI result | **Automated verified** — run `33945862290` succeeded in 48 seconds |
| Artifact ID | `9963305922` |
| GitHub artifact | `ArchVerse-0.1.44-Alpha22-Candidate8h` |
| Artifact ZIP SHA-256 | `0f7b66b319729f91d9bab6eaed454b598661f9c8164a6c14dbfe95a7d539b48c` |
| Native archive | `ArchVerse-Native-0.1.44-r31.alpha22.candidate8h.tar.gz` |
| Native archive SHA-256 | `763da3b0b460de8becda1f16f1a082824c0640326cb23760d1d55a5b2b6cfada` |
| Artifact integrity | **Packaged verified** — downloaded artifact, GitHub digest, inner checksum, embedded version, syntax, frozen Linux markers, and packaged Candidate 8h self-test passed |
| Candidate 8g in-game status | **Field tested, failed** — September 5 log proves vehicle-status IPC flicker stops the 1,200 ms Mining lane, auxiliary OCR repeatedly consumes 8–9 seconds, and navigation coordinates can become false `48000` reads |
| Latest field-tested candidate | Candidate 8g, tested September 5, 2026 |
| Candidate 8h in-game status | **Unverified** — no Candidate 8h field log has been supplied yet |
| Frozen upstream target | `aecabc2c2ec25822e2e784832ee6d6cfa9892d30`, upstream version `0.1.46` |
| Upstream delta | 68 commits after the earlier frozen `97e381fd` target |
| Immediate next step | Field-test Candidate 8h Mining liveness without using `F` or the scan-area overlay as a wake-up action, then preserve the runtime log |

The branch `agent/archverse-continuity-handoff` contains continuity infrastructure only and starts
from Candidate 8f. Candidate 8h branches from the later continuity state but rebuilds from the exact
checksum-verified Candidate 8g artifact produced by run `33833003367`.

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

The latest uploaded runtime evidence is `archverse-candidate8g-electron.log`, created September 5,
2026. It is Candidate 8g field evidence.

Observed Candidate 8g behavior:

- Direct Gamescope PipeWire bound to node `152` for the active Gamescope/Star Citizen session and
  remained the Mining frame source. There are no capture-gate pause events in the failure window.
- Game.log vehicle authority became active at `03:35:55Z` from ship-channel presence for an Argo
  MOTH and never logged a departure during the Mining failures.
- The Mining lane initially ran at `1200ms`, then stopped producing any Mining OCR entries from
  `03:36:51Z` through `03:42:56Z` while the poll rate fell to `3000ms`. This is consistent with the
  separate `/api/vehicle-presence` request timing out beyond its 2.5-second grace period and turning
  a transport failure into a false on-foot scheduling state.
- Auxiliary Fabricator, Mission, and Refinery OCR repeatedly took roughly 8–9 seconds and launched
  again immediately. The log claimed “mining was not blocked,” but the six-minute absence of Mining
  OCR proves that diagnostic was not reliable.
- Candidate 8g correctly parsed and committed real `2000`, `3400`, and `14400` reads after the lane
  resumed. A `2000` commit at `03:43:01Z` occurred while the active foreground gate was the ArchVerse
  overlay, which rules out game focus or held `F` as the actual Mining authority.
- The parser also accepted navigation coordinates such as `0.00°,27.43°,48.000` and
  `0.00° 48.000` as a valid `48000` RS value. Those false reads were committed inline.
- Every successful inline commit was followed by a false `vehicle=0` capture diagnostic because
  the compatibility-fallback condition combined “vehicle confirmed” and “inline commit handled” in
  one branch. The sidecar result itself still reported `commit=integrated:used`.
- Showing the scan region changed the configured crop from approximately `1578,673` to `1581,750`,
  which explains why that interaction could appear to wake or improve scanning. The display option
  does not arm the scanner, and held `F` is not part of the Mining decision path.

Candidate 8g proves that the restored RS catalog and inline commit work, but it does not pass the
Mining field gate because scanner scheduling is not live and coordinate text can become a false RS.

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

## Candidate 8h field-test gate

Before Candidate 8h becomes the field baseline, verify these cases in one saved runtime log:

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
9. Let an auxiliary OCR lane fail. Confirm a new `[ocr-bg]` line reports bounded backoff and Mining
   OCR continues instead of disappearing for minutes.
10. Visit a location that exposes decimal navigation coordinates. Confirm the coordinates are not
    accepted or announced as an RS value.
11. Confirm location sync remains responsive during the Mining test.
12. Run long enough to catch stale-state behavior after a ship or ground-vehicle transition.

If a case fails, preserve the log and create one candidate that addresses only that failure group.

## Upstream target and porting order

Gabe selected the latest reviewed upstream commit as the target. The frozen target is:

- Repository: `https://github.com/SubliminalsTV-Projects/sc-overlay`
- Commit: `aecabc2c2ec25822e2e784832ee6d6cfa9892d30`
- Commit date: August 27, 2026
- Upstream package version: `0.1.46`
- Subject: `Merge orisonfix: ignore event contributions earned before the event's live run`

Candidate 8h is still based on the `0.1.44` integration line. After Candidate 8h passes its field
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

- Root `README.md`: describes upstream Windows usage and does not identify Candidate 8h.
- Packaged Candidate 8f `README.md`: inherited Alpha 21 text.
- `linux-port/ALPHA-STATUS.md`: records the Alpha 17 checkpoint.
- `docs/R31-INPUT-DESIGN.md`: records an older Right Alt design that was superseded by the tested
  held-`F` and `Shift+F6` Linux contract.
- `docs/NATIVE-PACKAGING.md`: describes the Alpha 21 three-distribution package checkpoint.

## Distribution status

The latest verified packaged deliverable is the quarantined Candidate 8h native tar/zip artifact.
It passed CI and independent artifact verification, but it has not passed its in-game field gate.
The last documented Arch, Fedora, and Debian package set belongs to the older Alpha 21 line. Do not
describe Candidate 8h as a completed three-distribution release until fresh packages pass their own
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
