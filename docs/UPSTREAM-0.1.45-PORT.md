# Upstream 0.1.45 ArchVerse integration

This branch ports upstream `SubliminalsTV-Projects/sc-overlay` behavior onto the current ArchVerse Linux Alpha 22 line in small, testable slices.

## Baselines

- ArchVerse Linux source head: `d2c5c783635b35cd3c807e4f1b4357a3953058d8` (`agent/alpha22-candidate7-location-sync-v3`)
- Frozen upstream integration target: `97e381fd3c4bc98b439711e994f5cb3755f103d1`
- Prior integration target: `abe36392bd1803001de2e2571f60daa4734f3361`
- Previously reviewed upstream checkpoint: `23a5109006bdc5a786dbb1a33567027b99a9679f`
- Upstream development version: `0.1.45`

The integration target is intentionally frozen at `97e381fd` so ArchVerse can port and test one slice at a time even if upstream `main` advances. Commits after that SHA are out of scope until this target is integrated and validated.

## Linux contracts — hard gates

An upstream behavior is not considered ported if it regresses any of these contracts:

1. **Gamescope capture:** direct Gamescope PipeWire capture/source-string remains the primary Linux capture path when Gamescope is in use. Do not replace it with screenshot polling.
2. **Non-Gamescope support:** Star Citizen launched without Gamescope retains the Linux fallback capture chain and must not require a Gamescope PipeWire source.
3. **Interaction:** held-F interaction, click-through behavior, focus ownership, and first-F acquisition remain reliable. Widget text fields must release keyboard ownership on hide/unload.
4. **Log watcher:** Linux `Game.log` discovery, live tailing, handover, rotation, and replay semantics remain Linux-native and must not be replaced with Windows path assumptions.
5. **Semantic ports:** import upstream behavior, data models, tests, and UI intent; do not import platform mechanisms merely because upstream uses them.
6. **One slice at a time:** each phase must pass its focused tests and the ArchVerse contract/smoke tests before the next platform-sensitive phase is accepted.

## Port order

### Phase 0 — integration guardrails

- [x] Create isolated integration branch from the current Alpha 22 location-sync/first-F head.
- [x] Pin the upstream target SHA and Linux source SHA in this document.
- [ ] Run/retain ArchVerse contract assertions as the baseline for every slice.

### Phase 1 — upstream module seams and configuration

Port the 0.1.45 source-layout refactors semantically so later feature ports target the new upstream seams instead of patching old monoliths.

- [ ] `overlay/canvas.js` widget registry/lifecycle seam
- [ ] `overlay/missions-tracker.js` mission-tracker seam
- [ ] `src/server-config.ts` configuration seam
- [ ] hauling/chat module splits required by later features

**Gate:** no change to PipeWire selection, non-Gamescope fallback, held-F/first-F behavior, or Linux log paths.

### Phase 2 — Linux-safe log replay and environment detection

- [ ] PTU/LIVE environment classification and dataset switching
- [ ] rotated-log replay within the age window
- [ ] backlog/off-patch log-share fixes
- [ ] trade confirmation/refusal semantics
- [ ] journal dedupe/audit behavior

**Gate:** live tail + handover + rotated replay tests on Linux; no Windows path dependency.

### Phase 3 — player location, shop-location evidence, and travel model

- [ ] unified player-location/origin ladder
- [ ] terrain, quantum-route, terminal and system signals
- [ ] exact location-name precedence before fuzzy matching
- [ ] shop-line coverage for shopping provider, dealership/rental, food-stall, refinery and related terminal verbs
- [ ] shop placement from player-location evidence, preserving named / placed / unplaced confidence states
- [ ] stale-system protection across inter-system transitions
- [ ] travel/proximity model and coordinate dataset

**Linux rule:** passive log-derived location augments ArchVerse precision; it does not replace the direct Gamescope PipeWire CamPos path.

### Phase 4 — Verse Finder

- [ ] item-shop search/ranking
- [ ] source provenance/cache/offline floor
- [ ] blueprint cross-linking
- [ ] player-origin proximity/distance display
- [ ] item/vehicle/rental/commodity support
- [ ] observed-price pool and confidence/provenance display through the frozen target

**Gate:** Verse Finder keyboard/search focus uses the existing Linux ownership contract and always releases on hide.

### Phase 5 — Hauling + trade integration

- [ ] shared contracts/commodities route planner
- [ ] buy/sell log parsing and confirmed transaction handling
- [ ] Stow/route/ledger integration
- [ ] box-size/auto-load eligibility fixes
- [ ] `ORS_MA_DeliveryPilot` hauling classification
- [ ] sell quantity/unit-price fixes

### Phase 6 — mission/session/event behavior

- [ ] estimated contract payouts when direct award lines are absent
- [ ] duplicate mission-completion protection
- [ ] Siege of Orison / Orison Relief event progress
- [ ] reward-tier correlation and candidate presentation
- [ ] PTU-local event progress behavior

### Phase 7 — final UI and regression pass

- [ ] upstream widget/UI polish through target SHA
- [ ] ArchVerse contract suite
- [ ] TypeScript/build tests
- [ ] widget DOM tests
- [ ] Linux manual test matrix: Gamescope + non-Gamescope
- [ ] package only after all gates are green

## Acceptance rule

If an upstream change conflicts with a proven Linux contract, preserve the Linux mechanism and port only the upstream behavior. A phase remains incomplete until the conflict has been adapted and tested rather than worked around by disabling the Linux feature.
