# Upstream `fbe3fae` integration audit

## Scope

ArchVerse Alpha 23 starts from the packaged and field-tested Candidate 8k Linux runtime and targets
upstream commit `fbe3faedb38c82d11650ef6424e4037a9806cf95` (`0.1.46`). The target includes 285
non-merge commits after upstream `v0.1.44` and 12 commits after the previous frozen target
`aecabc2c2ec25822e2e784832ee6d6cfa9892d30`.

The integration must preserve Candidate 8k Mining and Linux behavior. A clean textual merge is not
evidence that the combined runtime is valid.

## Baseline

- Candidate: `0.1.44-r31.alpha22.candidate8k`
- Artifact workflow run: `34138147146`
- Artifact ID: `10024814784`
- Artifact name: `ArchVerse-0.1.44-Alpha22-Candidate8k`
- Artifact ZIP SHA-256: `f19954bb2b6678c7195d7a50dd5cddcde4c6c2996f0baba482fc34dbce9277f5`
- Native archive SHA-256: `56f57fa9ce688f0488b461882741d3c4bac5ac7beaba4034706ea67488302f17`
- Remote branch head: `04e9cf82f12152532d72b1b047d91415ad39c5fd`

## Port order

1. Validate current upstream source, tests, production sidecar build, and widget harness.
2. Inventory the complete `v0.1.44..fbe3fae` delta and classify every changed runtime file.
3. Port platform-neutral data and sidecar behavior onto a copy of Candidate 8k.
4. Reconstruct Electron shell changes at explicit Linux seams.
5. Add opt-in reputation scanning without changing Mining scheduling, capture, or authority.
6. Run source, packaged-runtime, IPC, renderer, config, and Linux-contract gates.
7. Publish a quarantined field-test candidate. Do not publish a release.

## High-risk overlaps

| Surface | Upstream purpose | ArchVerse constraint |
| --- | --- | --- |
| `electron/capture.cjs` | Reputation OCR and capture scheduling | Reconstruct around the Candidate 8k persistent PipeWire and Mining workers. Do not copy wholesale. |
| `electron/main.cjs` | Sidecar lifecycle and development reload | Keep Candidate 8k supervision and Linux focus/input ownership. Port only compatible behavior. |
| `overlay/canvas.js` | New widgets and reputation status | Preserve Linux classified interaction regions and one-cursor ownership. |
| `overlay/config.html` | New settings and reader opt-ins | Preserve locked `F`, hold-to-interact, `Shift+F6`, and coherent Linux OCR profiles. |
| `overlay/missions.html` | Mission, event, and reputation UI | Preserve the dynamic Linux interaction-region bridge and independent OCR-region editor. |
| `src/overlay-server.ts` | New APIs, trade, events, and reputation | Preserve `SC_TRACKER_CONFIG_DIR`, local-first defaults, Game.log vehicle authority, and inline Mining commit. |

## Frozen Mining files

The first Alpha 23 port candidate must reproduce these Candidate 8k hashes before and after every
platform-neutral port step:

| File | SHA-256 |
| --- | --- |
| `app/electron/mining-result-transport.cjs` | `380274e0af93cef2b130f7ab9eda8a5725211f908c8c00acc8c3a6954b738dde` |
| `app/electron/mining-vehicle-presence.cjs` | `f28eb7ca09e3796e6564f90c4a5eb6066a8d13332fe2c9ad4e347f80c02a5cc9` |
| `app/electron/mining-signature-catalog.cjs` | `09dfd261b2f4b2e261a01abd2d117259970b939ac199a3658d094fd260e16ed6` |
| `app/electron/persistent-gamescope-pipewire.cjs` | `831fdf3584cfa0cd0df15076ab0d6a5c5e010c842b12f08bf3c87ec82333b07b` |

`electron/capture.cjs`, `electron/main.cjs`, and the bundled sidecar also contain Candidate 8k
contracts, so hashes alone cannot protect them. Their semantic markers and runtime tests remain
mandatory.

## Publication gate

Alpha 23 artifacts remain internal candidates until automated and packaged checks pass. Gabe's
in-game field test remains required before any Alpha 23 candidate becomes a release baseline.
