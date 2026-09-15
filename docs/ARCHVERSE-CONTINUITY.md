# ArchVerse development continuity

This file is the canonical human-maintained project handoff. Update it whenever the verified
baseline, current target, field result, open problem, or next step changes.

## Evidence labels

- **Automated verified:** Repository checks or CI completed successfully.
- **Packaged verified:** The artifact exists and its checksum was verified.
- **Field verified:** Gabe ran the build with Star Citizen and supplied observations or a runtime log.
- **Unverified:** The behavior or artifact has not passed the required evidence level.

Do not convert one label into another without new evidence.

## Alpha23 Candidate 7 field-test checkpoint — September 15, 2026

Candidate 6 field evidence confirmed that the remaining problem was capture transport, not Mining
OCR, the exact Resource Signature catalog, widget delivery, or announcements. In the normal
Wine/XWayland session, Spectacle capture had a 2,557 ms median and Mining signature confirmation
had a 2,682 ms median. The persistent Electron window helper failed 270 times with exit code 3, so
the normal session never acquired its intended low-latency stream. Under Gamescope, direct
PipeWire capture had a 61 ms median and signature confirmation had a 262 ms median. The supplied
screenshots also showed `r_DisplayInfo` at the far right of the full Star Citizen window; the
previous center-display crop removed it before Hauling Location Sync OCR could inspect it.

Candidate 7 adds a separate native-Wayland capture helper. Electron 42.7.1 obtains a Star Citizen
window stream through the XDG ScreenCast portal and PipeWire, retaining Chromium's permitted
session state in a stable ArchVerse profile. The helper requests window sources only and runs
outside the overlay's main process. A denied or unavailable portal is attempted once per Star
Citizen process rather than generating repeated prompts or retries. On XWayland, an exact-XID
GStreamer `ximagesrc` one-frame capture is the next fallback. Normal Wayland capture therefore
prefers portal PipeWire, then exact XID, then Spectacle, then Electron monitor capture. Normal X11
prefers the persistent Electron X11 stream, exact XID, Electron monitor capture, then Spectacle.

Normal-session frames now have an explicit canvas model. A panoramic 6,270-by-2,160 stream maps
Mining to the calibrated 3,840-by-2,160 center display, while a single-display 3,840-by-2,160 game
window remains uncropped. Hauling Location Sync always receives the full Star Citizen window so
the top-right `r_DisplayInfo` text is preserved. The field-proven direct Gamescope PipeWire source,
fallback order, Mining cadence, exact catalog, distinct-frame guard, Game.log vehicle authority,
held-F interaction, Shift+F6 arrange mode, and hard click-through contracts remain unchanged.

| Item | Evidence |
| --- | --- |
| Branch | `agent/alpha23-candidate7-portal-window-capture` |
| Baseline artifact | Candidate 6 ID `10311759668`, native SHA-256 `119ad9d52f7fd4054918c0b664bfbfe28f8456adeb037ec7725d24c575200056` |
| Remote implementation commit | `eab42392488a25f43df2549d587e6ca9aa8a15d9` |
| Equivalent local implementation commit | `19b35bc3fb9e44fc33b8fc0c830da93c70840cd8` |
| Matching implementation tree | `5d94b88cab8b276171db7b5cf32feabd2c5b8249` — exact local/remote match |
| CI | **Automated verified** — run `34923404338`, every step passed |
| Artifact | `ArchVerse-Alpha23-Candidate7-field-test`, ID `10379013592` |
| Artifact ZIP SHA-256 | `c01b4f1c687afa0c8bcba1c65c42d8e19e222892dbeba882212c519c60198cce` |
| Native archive | `ArchVerse-Native-0.1.47-r31.alpha23.candidate7.tar.gz` |
| Native archive SHA-256 | `b3fc023c2f10cff8c1f66136b0240ea1e8cb11c937ce272a60c3e0a898aea67a` |
| Artifact integrity | **Packaged verified** — GitHub digest, ZIP integrity, inner checksum, complete package manifest, embedded version, and downloaded Candidate 7 regression all passed |
| Field status | **Unverified** — test normal Wine/XWayland first, then verify Gamescope remains regression-free |

Candidate 7 is a quarantined field candidate, not a release. In a normal KDE Wayland session, the
portal prompt must be limited to the Star Citizen window. Success reports
`portal-pipewire-window`; systems without portal capture may report `x11-window`. Mining should
recognize, commit, display, and announce signatures inside the requested 100–900 ms field target,
and Hauling Location Sync should read the far-right `r_DisplayInfo` text. The follow-up Gamescope
test must continue to report `gamescope-pipewire`. If both paths pass, the next checkpoint is
Debian- and Fedora-family packaging followed by the release gate.

## Alpha23 Candidate 6 implementation checkpoint — September 13, 2026

Candidate 5 field evidence separated the capture paths. Direct Gamescope PipeWire recognized,
committed, displayed, and announced Mining signatures at the intended fast rate. In a regular
Wine/XWayland launch, Electron recognized 40 valid signatures but every result remained
`pending-distinct-frame`: the fixed 1,600 ms confirmation window expired before Spectacle could
produce a distinct second frame. The sidecar, widget, and announcer were healthy.

Candidate 6 retains the mandatory distinct-frame false-positive guard and gives each observation
its own bounded deadline. Direct `gamescope-pipewire` and the isolated persistent window stream
remain at 1,600 ms. Screenshot fallbacks derive their window from measured capture time, capped at
15 seconds; the regression reproduces the observed 10.7-second gap and confirms only a matching
value at the same location on a distinct frame. The regular Wine/XWayland helper now binds to the
active game's exact X11 window ID, reports bounded source inventory and exit details, and retries
every 10 seconds. Non-Gamescope Spectacle no longer invokes main-process Electron source discovery
as a periodic upgrade probe. The direct Gamescope PipeWire implementation is byte-identical to
Candidate 5.

| Item | Evidence |
| --- | --- |
| Branch | `agent/alpha23-candidate6-normal-capture-confirmation` |
| Baseline artifact | Candidate 5 ID `10303164663`, native SHA-256 `aa14e095aae1b864cd6f18c72837db800c7955802cdfd1a1d6266743d8b5c380` |
| Application source commit | `881ef37b4317df4d47e8f9d20d2cd1c647e2982b` |
| Workflow-triggering commit | `15777ea63604ea3df21c73603d2dfb8af1e34269` |
| CI | **Automated verified** — run `34739798304`, every step passed |
| Artifact | `ArchVerse-Alpha23-Candidate6-field-test`, ID `10311759668` |
| Artifact ZIP SHA-256 | `ccb6ccfc224d1b0b141eab5cbb393299983fc8935d6723cfc29728844f6ecd55` |
| Native archive | `ArchVerse-Native-0.1.47-r31.alpha23.candidate6.tar.gz` |
| Native archive SHA-256 | `119ad9d52f7fd4054918c0b664bfbfe28f8456adeb037ec7725d24c575200056` |
| Artifact integrity | **Packaged verified** — GitHub digest, ZIP checksum, inner checksum, complete manifest, embedded version/provenance, and Candidate 6 regression passed after download |
| Field status | **Unverified** — Candidate 6 requires a regular non-Gamescope Mining test, then a Gamescope regression test |

Workflow run `34739715484` failed only because the Candidate 5 self-test correctly rejected the
new Candidate 6 version after staging. Candidate 5's version-specific gate now runs against the
Candidate 5 baseline before staging; run `34739798304` passed the corrected workflow. Candidate 6
is a quarantined field candidate, not a release.

## Alpha23 Candidate 5 implementation checkpoint — September 12, 2026

Candidate 5 advances the packaged Candidate 4 Linux runtime to the developer's latest tagged
release, `v0.1.47` at `e482c1ce3d461b390079486115293535be9b2ab7`. The release's exact
changelog, package version, full-precision Verse Finder age timestamp, strengthened age-band widget
assertions, and five negative controls are now present. This closes the previously documented
clock-dependent age fixture exception.

The developer's REP-page synchronization was already present in the Alpha23 server and data but
had remained visibly disabled because its capture consumer had not been reconciled with Linux.
Candidate 5 enables it as an opt-in feature. Linux REP scanning uses its own adjustable crop and the
existing isolated auxiliary OCR worker. It sends crop-local text to `/api/rep-read`, reads the REP
progress bars from the same crop's pixels, and returns those results through `/api/rep-scan`.
Game.log vehicle authority still defers every auxiliary OCR lane while Mining is active, so REP
cannot consume the latency-critical Resource Signature worker or alter Mining cadence.

| Item | Evidence |
| --- | --- |
| Branch | `agent/alpha23-candidate5-upstream-0147` |
| Upstream target | Developer tag `v0.1.47`, commit `e482c1ce3d461b390079486115293535be9b2ab7` |
| Baseline artifact | Candidate 4 ID `10290507069`, native SHA-256 `c8b11e378016e123ae0c59252b33ebb3f19781cb8a756caff7ebbdf87e82e82d` |
| Local source tests | **Automated verified** — TypeScript; REP-page and REP re-baseline suites; exact upstream file hashes |
| Local packaged tests | **Automated verified** — full Electron/server syntax; renderer/IPC audit; Linux bridge; packaged main startup; Candidate 5 contract and bar-reader test; real-sidecar REP-route and Mining-parser test |
| Remote packaged source | `0745c087d27efc656e2318d6ddb578d8fc650385` |
| Equivalent local checkpoint | `0d3862d24e2a7b3413893057677b975b951157ea` |
| Matching source tree | `ce9d7af278e44630b7ecd07ff6a80a978592e8dc` — exact local/remote match |
| CI | **Automated verified** — run `34712283860`, all steps passed |
| Artifact | `ArchVerse-Alpha23-Candidate5-field-test`, ID `10303164663` |
| Artifact ZIP SHA-256 | `ca3a99ac83528e5eee3853a47faee389b4b2b40e90e330adcb9bd01612822960` |
| Native archive | `ArchVerse-Native-0.1.47-r31.alpha23.candidate5.tar.gz` |
| Native archive SHA-256 | `aa14e095aae1b864cd6f18c72837db800c7955802cdfd1a1d6266743d8b5c380` |
| Artifact integrity | **Packaged verified** — GitHub digest, ZIP integrity, inner checksum, all 1,629 manifest entries, embedded version/provenance, Candidate 5 contract, REP routes, and Mining parser verified after download |
| Field status | **Field tested; candidate failed normal-session Mining gate** — Gamescope was fast and complete; regular Wine/XWayland recognized signatures but never committed them |

Candidate 4's `250/350/500 ms` distinct-frame Mining cadence, exact RS catalog, persistent
Wine/XWayland stream, direct Gamescope PipeWire path, Game.log session authority, held-F input,
Shift+F6 arrange mode, hard click-through, focus ownership, and one-cursor behavior are protected by
source markers and Candidate 4 hashes. Workflow run `34712129232` failed only because its test
harness launched the bundled Electron binary without `--no-sandbox`; all earlier gates passed. The
replacement wrapper added that test-only switch without changing the candidate, and final run
`34712283860` passed every gate. Next: Gabe field-tests Candidate 5 in a normal non-Gamescope
session and then Gamescope, verifies Mining first, then tests the opt-in REP-page scan while on foot.

## Alpha23 Candidate 4 field-test checkpoint — September 12, 2026

Candidate 3 was field-tested in a normal Lug-Helper Wine/XWayland launch without Gamescope. Mining
worked for several signatures, focus-latch recovery held, and OCR itself remained fast: 399 Mining
reads had a 26 ms median and 55 ms p95. The complete Electron log nevertheless showed two defects:

- Repeated `desktopCapturer.getSources()` calls intermittently blocked Electron's main process for
  7–10 seconds. The Candidate 3 JavaScript deadline could not fire because the compositor call
  blocked the same event loop that owned the timer.
- OCR text `DISABLED IN ATMOSPHERE | 60 30 100 | A | 87 | 188` was joined across plain whitespace
  into a false `30100` signature and announced.

Candidate 4 starts from the exact checksum-verified Candidate 3 artifact. A separate Electron
helper now discovers the exact `Star Citizen` Wine/XWayland source and retains one MediaStream.
Source discovery, PNG encoding, stale-frame detection, and stream restart run outside the ArchVerse
main process. The main process waits at most 700 ms for a requested frame. On KDE Wayland, a warming
or unhealthy stream falls back to the asynchronous Spectacle path before trying main-process
Electron monitor capture. A healthy helper is reprobed every second and promoted without an app
restart. The helper disables hardware acceleration and is bound to the exact game PID plus `/proc`
start ticks. Direct Gamescope PipeWire and its existing fallback order are unchanged.

Mining acquisition now targets 500 ms. A first exact-catalog result narrows the crop and schedules
a 250 ms confirmation pass. The same value must appear near the same screen location on a distinct
source frame before `commitMining` becomes true. Confirmed tracking targets 350 ms. Plain whitespace
cannot group digits inside one OCR line; comma, dot, apostrophe, colon, compact digits, and an exact
adjacent `1–3 digits + 3 digits` OCR-box split remain supported. Capture method and elapsed capture
time are now included in each Mining heartbeat.

| Item | Evidence |
| --- | --- |
| Branch | `agent/alpha23-candidate4-persistent-window-mining` |
| Baseline artifact | Candidate 3 ID `10182826990`, native SHA-256 `1df91bcf116816f7fcff43d25dd317b87ffee0bec7c590742659d8cbb870de3f` |
| Remote packaged source | `e8c7946bb04c828dbb29f615087728d571f5690b` |
| Equivalent local checkpoint | `b25ce1545910dc06497d9cc8643c5590d27f6752` |
| Matching source tree | `0cba444edc627b657da9cd6de0fc9eaa212bf766` |
| CI | **Automated verified** — run `34670191831`, all steps passed |
| Artifact | `ArchVerse-Alpha23-Candidate4-field-test`, ID `10290507069` |
| Artifact ZIP SHA-256 | `2f3aaa8f2352e0ff2e74e1a67bf23ad98b6dcf4914956f0ed0d4e34bc9d4839c` |
| Native archive | `ArchVerse-Native-0.1.46-r31.alpha23.candidate4.tar.gz` |
| Native archive SHA-256 | `c8b11e378016e123ae0c59252b33ebb3f19781cb8a756caff7ebbdf87e82e82d` |
| Artifact integrity | **Packaged verified** — GitHub digest, inner checksum, full manifest, embedded version/provenance, parser, confirmation, capture-contract, and real-sidecar tests passed |
| Field status | **Unverified** — persistent Wine/XWayland MediaStream behavior requires Gabe's in-game test |

Next step: field-test Candidate 4 first in the same normal non-Gamescope Lug-Helper session used for
Candidate 3. Confirm `[window-stream] ready`, capture promotion to
`electron-star-citizen-window-stream`, 250/350/500 ms Mining cadence, and
`pending-distinct-frame` before the first commit of each new value. Then test Gamescope and confirm
`gamescope-pipewire` remains authoritative. Candidate 8k remains the rollback build.

## Alpha23 Candidate 3 implementation checkpoint — September 11, 2026

Candidate 2 is now field tested. Mining recognized valid signatures and the narrow configured
Resource Signature region was intentional. The supplied Electron log also showed two defects:

- An F-created interaction latch survived after Hub/Settings use because the shell retained stale
  modal ownership. Empty-canvas clicks were ignored, and F, Shift+F6, and Alt-Tab did not reliably
  return click-through until another external window won focus.
- In a normal non-Gamescope KDE Wayland session, exact Star Citizen window capture intermittently
  consumed 8.1–8.6 seconds even though Mining OCR normally needed only tens to hundreds of
  milliseconds. Fast operation returning after focus transitions was correlation, not an OCR wake
  requirement. Direct Gamescope PipeWire did not show this failure.

Candidate 3 is implemented locally from the checksum-pinned Candidate 2 artifact. An empty-canvas
mouse-down now clears stale shell modal ownership and releases an F latch when no real drag, edit,
or arrange mode owns input. Global arrange and Mining-only interaction explicitly supersede an F
latch. A non-Gamescope Star Citizen window request is single-flight and deadline-bounded at 500 ms;
after a timeout, a five-second circuit breaker lets Electron monitor capture proceed. A true
Gamescope session and direct persistent Gamescope PipeWire retain their prior behavior.

Mining acquisition adds a 48x24-pixel margin at 3840x2160 around the saved region to tolerate HUD
drift between ship and planet-side layouts. A locked signature remains clamped inside the exact
saved region. Complete metre and kilometre tokens are removed before RS catalog matching so the
margin cannot admit a nearby target distance as a signature.

| Item | Evidence |
| --- | --- |
| Branch | `agent/alpha23-candidate3-focus-capture-hardening` |
| Baseline artifact | Candidate 2 ID `10136153055`, native SHA-256 `23a6a5723db22f35004f75aff357a8abdb836518fd06c596a123edec4afe4f17` |
| Local automated checks | Syntax for all packaged Electron JS; Alpha23 renderer and Linux bridge audits; packaged main startup; Candidate 8k supervision; Candidate 8j 120-request real-sidecar soak; Candidate 3 focus/capture/parser regression |
| Local config E2E | Blocked by the workspace runtime: `os.networkInterfaces()` returned `uv_interface_addresses` error; unchanged server code, to be rerun in GitHub CI |
| Remote packaged source | `8ddeadc9c602c8db0cd82e535f564e9288aa15f8` |
| CI | Run `34556433971`, all steps passed |
| Artifact | `ArchVerse-Alpha23-Candidate3-field-test`, ID `10182826990` |
| Artifact ZIP SHA-256 | `d77fc5d54c793c15d2b22b54866f9f4b26e28a0135d53e7db96a54bef58ae233` |
| Native archive | `ArchVerse-Native-0.1.46-r31.alpha23.candidate3.tar.gz` |
| Native archive SHA-256 | `1df91bcf116816f7fcff43d25dd317b87ffee0bec7c590742659d8cbb870de3f` |
| Field status | **Field tested; candidate failed overall** — normal Wine/XWayland capture repeatedly stalled for 7–10 seconds and one whitespace-joined false `30100` was announced |

Candidate 3 is automated, packaged, and field tested, but it did not pass the field gate. The downloaded artifact matched GitHub's digest,
the inner archive checksum passed, the embedded package and provenance versions matched, and the
complete package manifest verified. Candidate 4 supersedes it for the next field test. Candidate
8k remains the rollback build.

## Overnight checkpoint — September 8, 2026 UTC

### September 9 renderer and package reconstruction

Recovered remote checkpoint `07477ec` after the workspace reverted to Candidate 8h. The interrupted
uncommitted renderer changes were not present and have been reconstructed from frozen upstream.
The canvas build now retains Linux OCR-region editing, dynamic interaction regions, the Candidate
8k first-F DOM classifier, and forced region refresh. Log and Verse Finder lifecycle controls are
ported at explicit Candidate 8k shell seams. The staging scripts preserve the checksum-pinned 8k
Mining parser, vehicle authority, inline commit, and one-shot durable Location Sync alongside the
new backend. Capture and its Mining/PipeWire/transport/watchdog helpers are hash-checked unchanged.

Local evidence: production server build, TypeScript check, staging anchors, and Candidate 8k
supervision regression pass. The workflow now tests the staged Alpha23 sidecar with the sustained
Mining transport regression and canonical-config E2E. Those new CI results are pending. No field
package has been approved or delivered. Remaining gates include complete shell/IPC/renderer runtime
checks, reputation OCR integration, the upstream age-band test exception, and downloadable packaging.
Gabe authorized continued work through field-test readiness; no additional go-ahead is needed.

### Alpha23 Candidate 2 field-test checkpoint — September 10, 2026

Candidate 1 received an in-game diagnostic session. Its integrated Mining parser, exact catalog,
Game.log vehicle authority, and asynchronous commit path worked: the supplied logs contain accepted
signatures from `2,000` through `17,200`. The regular non-Gamescope session exposed a capture
regression, however. It cached `spectacle-wayland`; each frame took about three seconds, Mining
opportunities stretched beyond the configured rate, and seven one-shot Location Sync reads failed.
After Star Citizen restarted under Gamescope, direct `gamescope-pipewire` capture recovered and two
Location Sync reads resolved Crusader successfully. Candidate 1 is therefore field-tested but not
approved as a release.

Candidate 2 repairs only that failure group. On KDE Wayland the capture order is now direct
Gamescope PipeWire, exact Star Citizen window, Electron monitor, then Spectacle. A cached Spectacle
fallback periodically probes for a faster source so a game surface that appears after launch can be
adopted without restarting ArchVerse. An exact non-Gamescope Star Citizen window is treated as the
complete game canvas instead of receiving a panoramic Gamescope crop. Mining targets 600ms while
locked and 800ms during in-vehicle acquisition; the latest-frame scheduler remains single-flight.

| Item | Evidence |
| --- | --- |
| Branch | `agent/alpha23-candidate2-default-capture-latency` |
| Remote packaged source commit | `fc988a7d30e3dc87b4c408f761d585bd203fb410` |
| Equivalent local commit | `c494da0559b5029a6b6e582057f3849f86b4b2bd` |
| Matching source tree | `9bde588e0cae51d937955e75acf68f0dd11d77ca` |
| Candidate workflow | Run `34435600250`, all steps passed |
| Artifact | `ArchVerse-Alpha23-Candidate2-field-test`, ID `10136153055` |
| Artifact ZIP SHA-256 | `abcfb29abecd949571309b763a57ab24b0877a951361755720af08794ee8d6c9` |
| Native archive | `ArchVerse-Native-0.1.46-r31.alpha23.candidate2.tar.gz` |
| Native archive SHA-256 | `23a6a5723db22f35004f75aff357a8abdb836518fd06c596a123edec4afe4f17` |
| Field status | Field tested; Mining generally worked, but focus trapping and intermittent 8-second normal-session capture stalls failed the candidate |

Automated and packaged verification passed staging, complete Electron syntax checks, Alpha23
renderer and bridge audits, packaged main startup, Candidate 8k supervision, the Candidate 8j
120-request real-sidecar soak, Candidate 2 capture/cadence assertions, canonical config E2E, all
pairwise widget layouts, the outer artifact digest, the inner archive checksum, and the complete
package manifest.

Next step: test Candidate 2 in a normal non-Gamescope launch first. Record the selected capture
method, verify r_DisplayInfo Location Sync and RS recognition without F/Alt-Tab/config focus, and
measure `capture`, OCR, and heartbeat timings. Then repeat under Gamescope and confirm
`gamescope-pipewire` remains authoritative. Candidate 8k remains the rollback build. Candidate 2 is
a quarantined field candidate, not a release.

### Alpha23 Candidate 1 field-test checkpoint — September 9, 2026

Alpha23 Candidate 1 is automated and packaged verified. It remains unverified in game.

| Item | Evidence |
| --- | --- |
| Branch | `agent/alpha23-upstream-fbe3fae-integration` |
| Packaged source commit | `de1a1f1cd97d8a4e39a5616cb4544769032b7fb9` |
| Upstream target | `fbe3faedb38c82d11650ef6424e4037a9806cf95` (`0.1.46`) |
| Baseline | Candidate 8k artifact `10024814784`, SHA-256 verified |
| Full integration audit | Run `34363998487`, all steps passed |
| Candidate workflow | Run `34363998224`, all steps passed |
| Artifact | `ArchVerse-Alpha23-Candidate1-field-test`, ID `10109267555` |
| Artifact ZIP SHA-256 | `370574dbce02ffe666f1e70aebc1202680ac1437d4c7033ee52662c2791e4404` |
| Native archive | `ArchVerse-Native-0.1.46-r31.alpha23.candidate1.tar.gz` |
| Native archive SHA-256 | `49e142e86ca6d32d52557f78a73c0300a6037ce41a2f343bce94df08a787d15b` |

Automated gates cover upstream source and widget suites, the built sidecar, canonical config API,
Candidate 8k supervision, the 120-request Mining transport soak, all packaged renderer scripts and
IPC registrations, first-F classification, forced region refresh, capture-module evaluation,
packaged main startup, and full pairwise widget layouts. Independent download verification matched
the GitHub artifact digest, native checksum, complete package manifest, embedded version, and the
four protected Candidate 8k Mining file hashes.

Candidate 1 ports Log, Verse Finder, the expanded Hauling renderer, the upstream 0.1.46 backend,
and the newer canvas architecture. It retains Candidate 8k capture, result transport, Game.log
vehicle authority, direct Gamescope PipeWire stream, sidecar supervision, and one-shot Location
Sync. Reputation screen scanning is visibly disabled in this candidate because the upstream
capture consumer has not yet been reconciled with Linux Mining's exclusive OCR scheduler.

Next step: Gabe field-tests Candidate 1 using `FIELD-TEST.md` and supplies complete `electron.log`
and `sidecar.log`. Candidate 8k remains the rollback build. Do not approve a release from this
checkpoint; Candidate 1 is a quarantined field candidate.

### Resumed checkpoint

Gabe authorized GitHub CI execution of the loopback regression. The dedicated workflow
`Alpha23 Linux Config Regression` passed at remote commit
`d7790a76847605811ad176c4026f9019080745ab`: run `34291326179`, job `102278286861`.
It built the merged sidecar and passed the real config API assertions for canonical directory
precedence, locked F/hold/Shift+F6 controls, Mining/Balanced/Lightweight profiles, disk persistence,
and bidirectional Resource Signature region updates. The earlier local approval cancellation is
superseded for this validation by the authorized CI result. The full integration audit also started
as run `34291326114`; its result has not yet been checked. Next development group: renderer/preload
reconstruction, retaining the Candidate 8k packaged Mining baseline. No Alpha23 field package yet.

The saved branch was recovered from GitHub after the workspace reopened on Candidate 8h.
Audit #8 for `8ebdecd82c9a0c5aaca66a225fbafdb8fc5bce24` is now verified successful:
run `34183388450`, job `101926835112`. All configured steps passed, including the merged
server build, pinned Candidate 8k provenance, and Candidate 8k baseline checks. The existing
upstream age-band assertion exception remains; this is not an unconditional full-suite pass.

The merged server also built locally after dependency installation. Added
`tools/archverse-config-e2e.mjs` to exercise the real bundled config API with isolated canonical
and conflicting legacy directories. Local execution was stopped by a network-approval cancellation;
its runtime assertions are unverified. Do not treat the new test as passed or silently bypass the
approval. Next: resolve the loopback-test execution approval, run this regression, then continue
renderer/preload reconstruction. No Alpha23 field package exists yet.

Gabe requested a pause and a durable handoff for tomorrow. No further field test is requested tonight.

- Resume branch: `agent/alpha23-upstream-fbe3fae-integration`.
- Last pushed implementation: `8ebdecd82c9a0c5aaca66a225fbafdb8fc5bce24`.
- Equivalent local implementation: `29baad4a7600d96c6335511d51a29565be4ef952`.
- Matching implementation tree: `e72198cb1160cb71b8d4ae5bbc1714ceefe7c38b`.
- Local Git and remote commit IDs differ because the authorized GitHub API published equivalent
  trees. Do not force-push local history over remote history.
- Phase 1 imports upstream 0.1.46 backend, data, tests, and tools. Electron and renderer source
  trees were retained from the pre-merge branch. This is not a reconstructed Candidate 8k package;
  package-only Mining fixes must still be preserved when assembling Alpha23.
- Audit #7, run `34182810868`, job `101925141159`, failed during the merged server build:
  `canonical Linux config root: expected exactly one anchor, found 0`.
- Upstream moved config declarations into `src/server-config.ts`. The last implementation adds
  `applyArchVerseServerConfigSourcePatches` and its esbuild loader, leaving runtime patches in
  `applyArchVerseServerSourcePatches`. Local syntax and patch-anchor checks passed.
- The replacement CI result for `8ebdecd` has NOT been checked. Do not call it CI-green or assume
  that an Alpha23 archive exists. No Alpha23 field candidate has been delivered.
- Audit #7 passed the configured upstream and merged-source tests before the build failure.
  The upstream widget run reported 53 suites and 1,390 assertions with one failure:
  `the band really matches the age it prints`, expected `stale`, actual `ancient`.
  The workflow currently allows this one named failure with matching suite/assertion totals.
  The earlier explanation that a fixture expired is an inference, not a completed root-cause test.
  Review the age-band calculation and test before treating that exception as permanent.
- Full config/runtime regression coverage for the split patch remains pending; the prior promise
  of tests for both source layouts was not implemented. Only current-source anchor checks ran locally.
- Candidate 8k remains the packaged, field-reported working Mining/base fallback. GPU-crash
  investigation is deferred at Gabe's request; do not change GPU settings or launcher scripts.

### First action tomorrow

Inspect the Actions run for implementation commit `8ebdecd82c9a0c5aaca66a225fbafdb8fc5bce24`.
Read its failed step and complete relevant logs if it failed. Finish the split-config build and
regression gates before porting the renderer/preload group. Then reconstruct and test a package
from the pinned Candidate 8k artifact, preserving its Mining transport, capture, and supervision
contracts. Keep the upstream target frozen at `fbe3faedb38c82d11650ef6424e4037a9806cf95`.

This checkpoint is documentation-only. Use `[skip ci]` when publishing it so it does not start
another audit merely to save the session. Work resumes when Gabe returns; no background development
or overnight monitoring has been scheduled.

## Current state — September 8, 2026

| Item | Current value |
| --- | --- |
| Repository | `https://github.com/gbmccray32-boop/sc-overlay-for-Arch-Linux` |
| Current packaged candidate | `0.1.44-r31.alpha22.candidate8k` |
| Candidate branch | `agent/alpha22-candidate8k-sidecar-supervision-repair` |
| Packaged source commit (remote) | `233c5a47c0b6b1c23fbc2a9951f1675f3cfc8bd8` |
| Equivalent local checkpoint | `3e24e41228a9619310642a16b4f84e1997a31c5e` |
| Remote/local tree | `838e0157d99f466ac909949491441765fe7eef1a` — exact match, including executable modes |
| CI workflow | `Alpha22 Candidate 8k Sidecar Supervision Repair` |
| CI result | **Automated verified** — final branch-head run `34138147146` succeeded |
| Artifact ID | `10024814784` |
| GitHub artifact | `ArchVerse-0.1.44-Alpha22-Candidate8k` |
| Artifact ZIP SHA-256 | `f19954bb2b6678c7195d7a50dd5cddcde4c6c2996f0baba482fc34dbce9277f5` |
| Native archive | `ArchVerse-Native-0.1.44-r31.alpha22.candidate8k.tar.gz` |
| Native archive SHA-256 | `56f57fa9ce688f0488b461882741d3c4bac5ac7beaba4034706ea67488302f17` |
| Artifact integrity | **Packaged verified** — downloaded artifact, GitHub digest, ZIP integrity, inner checksum, embedded version, syntax, Candidate 8j baseline/soak tests, and Candidate 8k supervision tests passed |
| Candidate 8i in-game status | **Field tested, failed** — September 6 log contains 331 Mining localhost timeouts and about 82.6 minutes of failure windows in a 148.2-minute run; OCR and direct PipeWire remain fast when the route is healthy |
| Latest field-tested candidate | Candidate 8k; Mining and base operation reported working by Gabe |
| Candidate 8j in-game status | **Mining field verified; candidate failed overall** — Mining recognized and committed several signatures at the intended 1200/900 ms rates, but the watchdog caused two unnecessary sidecar restarts and eventually exhausted the ordinary crash budget |
| Candidate 8k in-game status | **Field verified for Mining and base operation** — Gabe reported both working well after the long-session test. The separate display freeze is being handled as a KWin/AMDGPU/Overdrive and recurring `kscreen-doctor` system issue; no ArchVerse change is justified by that evidence. |
| Active integration branch | `agent/alpha23-upstream-fbe3fae-integration` |
| Frozen upstream target | `fbe3faedb38c82d11650ef6424e4037a9806cf95`, upstream version `0.1.46` |
| Upstream delta | 285 non-merge commits after `v0.1.44`; 12 commits after the prior frozen `aecabc2c` target |
| Immediate next step | Validate the Phase 1 upstream `0.1.46` backend/data source merge in CI, then reconstruct the renderer and Electron IPC group before staging Alpha 23 Candidate 1 from the exact Candidate 8k package. |

The branch `agent/archverse-continuity-handoff` contains continuity infrastructure only and starts
from Candidate 8f. Candidate 8k branches from Candidate 8j and rebuilds from its exact
checksum-verified artifact produced by run `34043540649`.

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

## Candidate 8j field result

Candidate 8j's September 7 field evidence proved that the Mining repair works: it recognized and
committed `3200`, `100000`, `14400`, `36000`, and `87000` signatures at the intended acquisition
and locked rates. The full Electron and sidecar logs also isolated a separate supervision defect.
Successful Mining requests did not clear accumulated watchdog strikes, the restart cooldown did not
expire the old failure episode, and deliberate watchdog `SIGTERM` exits consumed the same five-exit
budget as spontaneous crashes. After five controlled recoveries, Electron stopped respawning the
sidecar. The sidecar log contains no spontaneous exception that explains those exits.

## What Candidate 8k repairs

Candidate 8k starts from the exact Candidate 8j artifact and changes only sidecar supervision:

- Every successful Mining transport call clears the active watchdog failure episode.
- Failure strikes expire after a 10-second healthy gap and cannot accumulate across hours of play.
- A controlled restart requires at least three independent health-probe failures spanning at least
  10 seconds of continuous failure.
- A new child receives 15 seconds of startup/readiness grace, and controlled restarts have a
  60-second cooldown to prevent a recovery loop.
- A watchdog-requested termination is tracked separately and does not consume the five-exit
  spontaneous-crash budget.
- The ordinary crash budget resets after the sidecar remains stable for 60 seconds.
- Candidate 8j's Mining capture, OCR, catalog, scheduler, commit transport, Game.log authority, and
  direct Gamescope PipeWire implementation are hash-locked unchanged.

The Candidate 8k self-test proves that stale strikes expire, successes reset the failure episode,
startup grace holds, a continuous outage causes one controlled restart, cooldown prevents another,
and watchdog recovery does not consume the crash budget.

## Candidate 8k field-test gate

1. Play normally for a long session and confirm Mining keeps Candidate 8j's exact 1200 ms
   acquisition and 900 ms locked cadence.
2. Confirm RS values continue to recognize and commit without pressing `F`, showing the scan area,
   or Alt-Tabbing as a wake-up action.
3. Confirm successful Mining traffic prevents old watchdog strikes from causing a later restart.
4. Confirm ordinary transient route failures do not restart the sidecar.
5. If a genuine continuous sidecar outage occurs, confirm it produces one controlled recovery only,
   followed by startup grace and cooldown rather than a restart loop.
6. Confirm controlled watchdog recovery does not raise the ordinary sidecar crash count.
7. Preserve the complete `electron.log` and `sidecar.log`, including normal startup and shutdown.

Gabe subsequently reported Candidate 8k Mining and base operation working. This does not establish
that every individual test case above was exercised; retain that distinction for release approval.

The planned Candidate 8j field gate was:

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
    present in `electron.log`, Candidate 2's 600/800 cadence stays stable, and no repeated `[mining-ipc]`
    timeout run appears.
13. If the sidecar becomes unresponsive, confirm three failed independent health probes precede one
    owned-sidecar restart and the newest Mining result is acknowledged after recovery.

If a case fails, preserve the log and create one candidate that addresses only that failure group.

## Upstream target and porting order

On September 12, 2026, Gabe approved advancing the current candidate to the developer's most recent
release while preserving every Linux contract. The frozen release target is now:

- Repository: `https://github.com/SubliminalsTV-Projects/sc-overlay`
- Tag: `v0.1.47`
- Commit: `e482c1ce3d461b390079486115293535be9b2ab7`
- Commit date: September 8, 2026
- Upstream package version: `0.1.47`
- Subject: `Merge: tool ageband — negative controls for every age-band assertion`

Candidate 5 stages from the checksum-verified Candidate 4 package rather than rebuilding Linux
runtime work from source. Keep this target frozen until Candidate 5 is field tested. Candidate 8k
remains the known field-tested rollback build.

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

The latest automated and packaged verified deliverable is Alpha23 Candidate 6. It has not yet been
field-tested. Candidate 5 was field tested: Gamescope Mining passed, but regular Wine/XWayland
recognition did not reach the widget or announcer. Candidate 8k remains the latest rollback whose
Mining and base operation Gabe reported working.
The last documented Arch, Fedora, and Debian package set belongs to the older Alpha 21 line. Do not
describe Candidate 8k or Alpha23 as a completed three-distribution release until fresh packages pass their own
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
