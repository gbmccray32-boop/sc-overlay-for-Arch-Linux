# ArchVerse development continuity

This file is the canonical human-maintained project handoff. Update it whenever the verified
baseline, current target, field result, open problem, or next step changes.

## Evidence labels

- **Automated verified:** Repository checks or CI completed successfully.
- **Packaged verified:** The artifact exists and its checksum was verified.
- **Field verified:** Gabe ran the build with Star Citizen and supplied observations or a runtime log.
- **Unverified:** The behavior or artifact has not passed the required evidence level.

Do not convert one label into another without new evidence.

## Current state — September 4, 2026

| Item | Current value |
| --- | --- |
| Repository | `https://github.com/gbmccray32-boop/sc-overlay-for-Arch-Linux` |
| Current application baseline | `0.1.44-r31.alpha22.candidate8f` |
| Baseline branch | `agent/alpha22-candidate8f-gamelog-vehicle-mining-gate` |
| Baseline commit | `5d4f550e372abc6487cb694056ac78be548e117d` |
| CI workflow | `Alpha22 Candidate 8f Game.log Vehicle Mining Gate` |
| CI result | **Automated verified** — run `33826061607` succeeded |
| Saved artifact | `ArchVerse-0.1.44-Alpha22-Candidate8f.zip` |
| Native archive | `ArchVerse-Native-0.1.44-r31.alpha22.candidate8f.tar.gz` |
| Native archive SHA-256 | `a41ca5460e937ac9707d27edbd8dd4b40f00fe26c640f3e786ab7b7db3b2c82c` |
| Artifact integrity | **Packaged verified** |
| Candidate 8f in-game status | **Field tested, failed** — September 4 log proves an RS catalog regression and repeated Mining commit IPC timeouts |
| Latest field-tested candidate | Candidate 8f, tested September 4, 2026 |
| Current repair candidate | `0.1.44-r31.alpha22.candidate8g` on `agent/alpha22-candidate8g-rs-recognition-repair` |
| Candidate 8g repair implementation | `0632ca4341a57b77987123a6a11112ea8b99b76e` |
| Candidate 8g verification | **Automated verified locally** — exact Candidate 8f artifact transformed; syntax, frozen-contract, and end-to-end RS tests passed. **CI/package unverified** |
| Frozen upstream target | `aecabc2c2ec25822e2e784832ee6d6cfa9892d30`, upstream version `0.1.46` |
| Upstream delta | 68 commits after the earlier frozen `97e381fd` target |
| Immediate next step | Push Candidate 8g, run CI, verify its artifact, then field-test RS recognition |

The branch `agent/archverse-continuity-handoff` contains continuity infrastructure only and starts
from Candidate 8f. Candidate 8g branches from that continuity state but still rebuilds from the
exact pinned Candidate 8f artifact.

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

The latest uploaded runtime evidence is `archverse-candidate8f-electron.log`, created September 4,
2026. It is Candidate 8f field evidence.

Observed Candidate 8f behavior:

- Direct Gamescope PipeWire bound to node `137` for the active Gamescope/Star Citizen session and
  remained the Mining frame source.
- Game.log vehicle authority became active from ship-channel presence for a Kruger S-65 Stingray.
- Mining OCR usually completed in roughly 140–190 ms and correctly read many current values,
  including `3200`, `4000`, `6800`, `7200`, `8000`, `10800`, `11700`, and `17200`.
- The OCR correctly read `2000` at least 37 times, often at approximately the intended 1,200 ms
  cadence, but the Candidate 8f catalog rejected every read as `outside-current-rs-range`.
- The second `/api/mining/scan` request timed out at least 20 times after an already-successful OCR
  and `/api/screen-read` request. This delayed or lost the visible Mining state update.
- The older Mining tracker and parser were inconsistent with the Candidate 8f catalog: the parser
  rejected values above `30000`, and the tracker rejected values above `25800`, even though the
  current catalog admitted valid FPS, ground-vehicle, and large-cluster signatures above those
  ceilings.

This is a catalog-integration regression, not a return of the old screen-capture failure. Candidate
8f remains the packaged baseline but does not pass the Mining field gate.

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

## Candidate 8g field-test gate

Before Candidate 8g replaces Candidate 8f as the packaged field baseline, verify these cases in one
saved runtime log:

1. Start on foot. Confirm Mining does not accept or announce an RS value.
2. Enter a ship. Confirm `/api/vehicle-presence` becomes active from the ship channel.
3. Scan a `2000` debris/harvest signature. Confirm it is accepted and announced rather than logged
   as `outside-current-rs-range`.
4. Scan several ore signatures, including one above `30000` if available. Confirm the log reports
   `commit=integrated:used` and no `/api/mining/scan` timeout is needed.
5. Leave the ship. Confirm vehicle presence clears and Mining refuses new values.
6. Enter and exit a ground vehicle. Confirm control grant activates presence and release clears it.
7. Hold `F` over widgets, type or click, leave the widget, and release `F`. Confirm focus and
   click-through recover without a second cursor.
8. Confirm the capture source remains `gamescope-pipewire` and identifies a Gamescope PipeWire node.
9. Confirm location sync and background OCR remain responsive during the Mining test.
10. Run long enough to catch stale-state behavior after a ship or ground-vehicle transition.

If a case fails, preserve the log and create one candidate that addresses only that failure group.

## Upstream target and porting order

Gabe selected the latest reviewed upstream commit as the target. The frozen target is:

- Repository: `https://github.com/SubliminalsTV-Projects/sc-overlay`
- Commit: `aecabc2c2ec25822e2e784832ee6d6cfa9892d30`
- Commit date: August 27, 2026
- Upstream package version: `0.1.46`
- Subject: `Merge orisonfix: ignore event contributions earned before the event's live run`

Candidate 8g is still based on the `0.1.44` integration line. After Candidate 8g passes its field
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

- Root `README.md`: describes upstream Windows usage and does not identify Candidate 8g.
- Packaged Candidate 8f `README.md`: inherited Alpha 21 text.
- `linux-port/ALPHA-STATUS.md`: records the Alpha 17 checkpoint.
- `docs/R31-INPUT-DESIGN.md`: records an older Right Alt design that was superseded by the tested
  held-`F` and `Shift+F6` Linux contract.
- `docs/NATIVE-PACKAGING.md`: describes the Alpha 21 three-distribution package checkpoint.

## Distribution status

The latest packaged deliverable remains the quarantined Candidate 8f native tar/zip artifact.
Candidate 8g has no CI artifact until its branch is authorized and pushed. The last documented
Arch, Fedora, and Debian package set belongs to the older Alpha 21 line. Do not describe Candidate
8g as a completed three-distribution release until fresh packages pass their own checks and field
tests.

## Continuity maintenance

- Update this file only from evidence, repository state, or an explicit decision from Gabe.
- Keep the current baseline and latest field-tested baseline separate.
- Record exact branch names, full commits, workflow runs, artifact names, checksums, and tests.
- Move completed work into a short decision-history entry instead of deleting the reason for it.
- Run `tools/update-archverse-handoff.sh` after the update.
- Replace the existing persistent `ARCHVERSE-HANDOFF.generated.md` after each meaningful project
  change. Do not create another handoff file with the same purpose.
- Upload `ARCHVERSE-HANDOFF.generated.md` to a new chat when direct repository access is unavailable.
