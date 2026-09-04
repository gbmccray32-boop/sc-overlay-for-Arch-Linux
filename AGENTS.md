# ArchVerse continuation instructions

These instructions apply to the complete repository.

## Start every development session

1. Read `docs/ARCHVERSE-CONTINUITY.md`.
2. Read `linux-port/PORTING_CONTRACT.md`.
3. Run `tools/update-archverse-handoff.sh`.
4. Inspect `ARCHVERSE-HANDOFF.generated.md` and `git status --short --branch`.
5. Confirm the working branch, candidate version, upstream target, and verification state before editing.

Do not infer current project status from the root `README.md`, `linux-port/ALPHA-STATUS.md`, or
`docs/R31-INPUT-DESIGN.md`. Those files contain older release or design snapshots. The continuity
document identifies which historical files are superseded.

## Non-negotiable Linux contracts

- Port upstream behavior semantically. Do not replace the Linux runtime with Windows mechanisms.
- Treat `electron/main.cjs` and `electron/capture.cjs` as high-risk reconstruction surfaces, not
  finished line-merge targets.
- Preserve held-`F` widget interaction, hard click-through outside owned widget regions, one native
  cursor, verified focus/pointer handoff, and `Shift+F6` arrange mode.
- Preserve exact `StarCitizen.exe` session binding.
- Preserve direct Gamescope PipeWire capture as the first-choice low-latency Mining path, including
  method `gamescope-pipewire`, source `Gamescope PipeWire node <id>`, and direct `pipewiresrc` use.
- Keep Gamescope optional. Default/non-Gamescope launches must continue through the documented
  Spectacle, Electron, and other Linux fallbacks.
- Preserve isolated RapidOCR, bounded resources, and the Tesseract fallback.
- Use the canonical `SC_TRACKER_CONFIG_DIR`; do not allow a legacy config root to override it.
- Do not inject into Star Citizen, read game memory, or add another mechanism that violates the
  read-only Game.log and screen-capture boundary.
- Preserve user privacy and opt-in behavior.

The complete testable contract is in `linux-port/PORTING_CONTRACT.md`.

## Development protocol

- Port or repair one behavior group at a time.
- Start each new candidate from the last verified artifact or commit and pin its provenance.
- Add a regression test for every field failure.
- Keep publication disabled until automated gates and the required in-game field test pass.
- Do not move the upstream target during an active candidate unless Gabe explicitly changes it.
- Keep full UI multilingual work separate from candidate stabilization. Upstream language-file
  parsing that is already in the baseline remains part of the baseline.
- Do not put ArchVerse back into Gabe's Star Citizen launcher scripts unless he explicitly asks.

## End every development session

1. Update `docs/ARCHVERSE-CONTINUITY.md` when the baseline, target, verified behavior, open issue,
   artifact, or next step changed.
2. Label evidence as automated, packaged, or field verified. Never promote one level by assumption.
3. Run the tests relevant to the change and record exact results.
4. Run `tools/update-archverse-handoff.sh` again.
5. If a persistent `ARCHVERSE-HANDOFF.generated.md` already exists in ChatGPT Library, replace that
   same file instead of creating a duplicate.
6. Report the current branch, full commit, tests, unverified items, and next single step.

`ARCHVERSE-HANDOFF.generated.md` is intentionally ignored. It is a fresh, uploadable snapshot for a
new chat. Versioned Git hooks refresh it after commits, checkouts, and merges when installed with
`tools/update-archverse-handoff.sh --install-hooks`.
