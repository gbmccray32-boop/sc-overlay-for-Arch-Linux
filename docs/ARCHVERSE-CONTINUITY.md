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
| Candidate 8f in-game status | **Unverified** — no Candidate 8f field log has been supplied yet |
| Latest field-tested candidate | Candidate 8e, tested September 3–4, 2026 |
| Frozen upstream target | `aecabc2c2ec25822e2e784832ee6d6cfa9892d30`, upstream version `0.1.46` |
| Upstream delta | 68 commits after the earlier frozen `97e381fd` target |
| Immediate next step | Field-test Candidate 8f before changing Mining authority or starting the next upstream behavior group |

The branch `agent/archverse-continuity-handoff` contains continuity infrastructure only and starts
from Candidate 8f. It does not replace Candidate 8f as the application baseline.

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

The latest uploaded runtime evidence is `archverse-candidate8e-electron.log`, created September 4,
2026. It belongs to Candidate 8e, not Candidate 8f.

Observed Candidate 8e behavior:

- Gamescope PipeWire capture bound and continued producing Mining frames.
- Radar seen/absent transitions were detected.
- Background Fabricator OCR completed without blocking Mining.
- Held-`F` events arrived through evdev, and release restored click-through.
- Invalid reads were rejected with reasons such as `not-current-rs-total` and `below-prefilter`.
- A valid `16000` signature resolved as `Savrilium 3200x5 / Ground Vehicle Deposit 4000x4`.

Candidate 8f was created after this evidence to replace radar authority with Game.log vehicle
presence plus current-RS authority. Candidate 8e field evidence must not be cited as Candidate 8f
field verification.

## Candidate 8f field-test gate

Before Candidate 8f becomes the field baseline, verify these cases in one saved runtime log:

1. Start on foot. Confirm Mining does not accept or announce an RS value.
2. Enter a ship. Confirm `/api/vehicle-presence` becomes active from the ship channel.
3. Scan a legal Mining signature. Confirm the accepted method is `gamelog-vehicle+rs`.
4. Leave the ship. Confirm vehicle presence clears and Mining refuses new values.
5. Enter and exit a ground vehicle. Confirm control grant activates presence and release clears it.
6. Hold `F` over widgets, type or click, leave the widget, and release `F`. Confirm focus and
   click-through recover without a second cursor.
7. Confirm the capture source remains `gamescope-pipewire` and identifies a Gamescope PipeWire node.
8. Confirm location sync and background OCR remain responsive during the Mining test.
9. Run long enough to catch stale-state behavior after a ship or ground-vehicle transition.

If a case fails, preserve the log and create one candidate that addresses only that failure group.

## Upstream target and porting order

Gabe selected the latest reviewed upstream commit as the target. The frozen target is:

- Repository: `https://github.com/SubliminalsTV-Projects/sc-overlay`
- Commit: `aecabc2c2ec25822e2e784832ee6d6cfa9892d30`
- Commit date: August 27, 2026
- Upstream package version: `0.1.46`
- Subject: `Merge orisonfix: ignore event contributions earned before the event's live run`

Candidate 8f is still based on the `0.1.44` integration line. After Candidate 8f passes its field
gate, compare the 68 remaining upstream commits by behavior group. Port one group at a time and keep
the target frozen until every group is reconciled and tested.

## Binding Linux decisions

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

- Root `README.md`: describes upstream Windows usage and does not identify Candidate 8f.
- Packaged Candidate 8f `README.md`: inherited Alpha 21 text.
- `linux-port/ALPHA-STATUS.md`: records the Alpha 17 checkpoint.
- `docs/R31-INPUT-DESIGN.md`: records an older Right Alt design that was superseded by the tested
  held-`F` and `Shift+F6` Linux contract.
- `docs/NATIVE-PACKAGING.md`: describes the Alpha 21 three-distribution package checkpoint.

## Distribution status

The latest Candidate 8f deliverable is a quarantined native tar/zip artifact. The last documented
Arch, Fedora, and Debian package set belongs to the older Alpha 21 line. Do not describe Candidate
8f as a completed three-distribution release until fresh packages pass their own checks and field
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
