# Alpha22 Candidate 3 field-test plan

Candidate 3 is quarantined until the Linux field tests below pass. CI success alone is not release approval.

## Platform-neutral runtime requirements

- No CPU affinity, CCD pinning, `taskset`, `nice`, `SCHED_FIFO`, or `SCHED_RR` defaults.
- Each Linux OCR consumer has an independent bounded RapidOCR lane.
- Mining is latency-critical and executes before unrelated background OCR.
- Held-F interaction, click-through ownership, Shift+F6 arrange mode, and Star Citizen focus return remain unchanged.

## Settings persistence

1. Open Settings and change ordinary user-editable values.
2. Press Save.
3. Success must show `Saved ✓` only after the server writes and reads back `config.json`.
4. Linux-owned values must remain canonical: `F`, hold-to-interact enabled, `Shift+F6`.
5. Restart ArchVerse and confirm saved values persist.
6. A real write failure must report `config_save_failed`; it must never show a false success.

## Gamescope / direct PipeWire

1. Launch Star Citizen under Gamescope.
2. Confirm exact Star Citizen session binding.
3. Direct capture must identify `method=gamescope-pipewire` and `source=Gamescope PipeWire node <id>` when the source exists.
4. If ArchVerse starts before the Gamescope PipeWire node is available, fallback may run temporarily but the asynchronous recovery probe must promote PipeWire after the node appears.
5. Fallback success must not permanently cache Spectacle over a recovered PipeWire source.

## Mining Scanner

1. Inactive Scan Mode must not commit signatures.
2. Active Scan Mode must detect signatures quickly.
3. After the first valid signature, the next locked OCR region must materially tighten around the signature.
4. A large acquisition region must remain at 2x; 4x is allowed only for a genuinely tight lock.
5. Mining telemetry must not delay the next capture/OCR tick.
6. While Scan Mode is structurally active, Fabricator, Mission, Claim Context, and Refinery OCR must not delay Mining.
7. Record capture method, crop size, scale, OCR time, and observed time between signature results.

## Non-Gamescope launch

1. Launch Star Citizen normally without Gamescope.
2. Exact `StarCitizen.exe` session binding must still work.
3. The Gamescope PipeWire backend must fast-negative without an expensive discovery loop.
4. Fallback capture must keep OCR functional.
5. Gamescope must not be required to install or run ArchVerse.

## Interaction regression

- F works from first launch.
- Stationary pointer remains interactive while F is held.
- Checkboxes and text fields accept reliable input.
- Settings, Twitch/Social Chat, Hauling, and other text-entry widgets release keyboard/focus correctly.
- Shift+F6 drag/resize works.
- Releasing interaction returns focus to Star Citizen.
- No duplicate cursor.

## Release gate

Do not merge or package the three-distro official release until the Gamescope and non-Gamescope field tests pass and Settings persistence is verified across restart.
