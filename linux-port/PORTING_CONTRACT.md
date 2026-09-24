# ArchVerse Linux Upstream Porting Contract

This document defines the minimum engineering and validation contract for rebasing the ArchVerse
Linux port of SC Overlay onto a newer upstream release. It exists because the Alpha 17 -> upstream
0.1.41 jump demonstrated that a merge can be syntactically valid and still be runtime-invalid.

## 1. High-churn runtime files are not line-merged as finished code

`electron/main.cjs` and `electron/capture.cjs` are high-risk integration surfaces. Upstream and the
Linux fork both make architectural changes inside these files, so a successful `git merge-file` or a
clean diff is **not** sufficient evidence that the result is coherent.

For these files:

1. Use the upstream version as the authoritative implementation of new upstream behavior.
2. Reapply Linux behavior at explicit semantic seams.
3. Treat diff3/three-way output only as an intermediate reconstruction aid.
4. Run lexical, runtime, package, IPC, renderer and Linux-contract audits before a candidate can be
   considered releasable.

Every field regression discovered after a merge becomes a permanent CI invariant or smoke test.

## 2. Linux-owned behavior that upstream updates may not silently replace

The following are ArchVerse platform contracts:

- **F** is the mandatory interaction key on Linux.
- **Hold-to-interact is enabled** on Linux.
- **Shift+F6** is the Linux arrange/move hotkey.
- The interaction gate is registered before overlay creation so Star Citizen can retain initial
  focus.
- Transparent canvas windows remain hard click-through outside explicit interaction ownership.
- Physical mouse movement/button forwarding remains the source of truth during held-F interaction.
- The one-native-cursor design remains; a synthetic second visible cursor must not return.
- KDE/X11/Gamescope focus handoff and verified pointer handoff remain.
- Nested pointer-coordinate scaling requires a bound, verified Gamescope PID. A normal
  Wine/XWayland Star Citizen process exposes the host `DISPLAY`; ArchVerse must use its host pointer
  coordinates unchanged and must clear any cached nested coordinate context when launch mode or
  game-session identity changes.
- Exact `StarCitizen.exe` session binding remains the privacy/foreground gate for capture.
- **Direct Gamescope PipeWire capture is the mandatory first-choice Linux OCR capture backend when
  the active Star Citizen session has a Gamescope ancestor and matching PipeWire source.** The
  runtime must expose the capture method as `gamescope-pipewire`, identify the selected source as
  `Gamescope PipeWire node <id>`, and retain the direct `pipewiresrc` implementation bound to the
  Gamescope process that owns the active Star Citizen session. This source identity is a permanent
  Linux contract because it is the field-proven low-latency path required by the Mining Scanner. A
  generic Electron/portal capture path that happens to use PipeWire internally is **not** an
  equivalent replacement for this optimized path.
- **Gamescope is not a runtime requirement for ArchVerse.** A normal Star Citizen launch without a
  Gamescope ancestor is a supported Linux configuration. Absence of a bound Gamescope PID or
  `gamescope` PipeWire node must be treated as an unavailable optional fast path, not as a fatal OCR
  error. The PipeWire backend must reject that case immediately, before expensive PipeWire discovery
  or frame capture, and the same capture request must continue through the normal fallback chain.
- On a normal KDE Wayland launch, the isolated native Star Citizen window helper requests only a
  WINDOW source through the XDG ScreenCast portal, opens the portal's restricted PipeWire remote,
  and consumes raw frames through GStreamer. A successful stream is reported as
  `portal-pipewire-window`. It remains separate from the overlay's X11/XWayland input process and
  may not replace the direct Gamescope PipeWire implementation. The steady-state KDE path may not
  pass full frames through Chromium canvas, PNG compression, XComposite, or Spectacle.
- Normal-launch capture keeps the complete Star Citizen canvas available for r_DisplayInfo and
  other full-canvas consumers. A display capture request may crop the raw PipeWire frame inside the
  native helper before file/IPC transfer. Mining receives only that bound display segment in its
  established coordinate space. Location Sync must request the complete canvas before selecting
  its top-right region.
- A failed or cancelled portal initialization must report its cause and remain disabled for that
  Star Citizen process. It may not repeatedly open a selector or restart a failed helper. A new
  Star Citizen process starts one new attempt.
- An approved normal-window stream is bound to the exact Star Citizen PID and process start ticks,
  not a rediscovered XID. Frame deadlines, repeated media time, and temporary frame errors are not
  permission or stream-termination events and must retain the approved session. Bound outstanding
  frame work separately from the caller's fallback deadline. An ended track or failed helper remains
  disabled for that process, and a new PID/start identity permits one new approval attempt.
- The true-X11 Electron window-stream fallback must use a trusted local origin with web security
  enabled. A packaged Electron regression must check mediaDevices capability and actual
  display-media handler entry, with the insecure data-origin failure retained as a negative
  control. This renderer is not the KDE Wayland steady-state portal consumer.
- Exact-XID fallback must retry without MIT-SHM after a shared-memory failure, bound both attempts,
  and back off after a failed episode. Mining and Location Sync may not overlap that capture lane.
- Exact-XID GStreamer `ximagesrc` capture is the first normal-launch fallback after the persistent
  window stream. Spectacle and Electron monitor capture remain emergency fallbacks.
- For a bound Gamescope session, the capture order is
  `gamescope-pipewire -> gamescope-window -> electron-monitor -> spectacle`.
- For a normal KDE Wayland Wine/XWayland session, the capture order is
  `portal-pipewire-window -> x11-window -> spectacle -> electron-monitor`.
- For a normal X11 session, the capture order is
  `electron-x11-window-stream -> x11-window -> electron-monitor -> spectacle`.
  No normal-launch backend may be promoted ahead of direct Gamescope PipeWire when the bound Star
  Citizen process has a Gamescope ancestor.
- Linux capture backends/fallbacks remain available after the PipeWire-first path. Users who launch
  Star Citizen with default/non-Gamescope settings must retain functional OCR and Mining Scanner
  operation through those fallbacks, although the direct Gamescope PipeWire path remains the
  preferred low-latency configuration.
- RapidOCR remains isolated in a disposable Node child process with bounded queue/thread resources.
- OpenGL remains the normal Linux renderer, with software Safe Mode as the fallback.

### 2.1 Widget development boundary

**Permanent Linux exclusion (Gabe, September 24, 2026): per-widget hotkey editing.**
Official Linux builds must not offer widget hotkey capture, reassignment, or clearing in
widget cogs, injected sheets, or Settings. Do not import upstream commit `56c74df` or an
equivalent keyboard-grab editor. Preserve existing startup bindings without silently resetting
user configuration. Held F and Shift+F6 remain mandatory. Source modifications in personal
forks are outside the supported runtime contract; they are not a supported UI escape hatch.
This exclusion has no automatic expiry and must not be relaxed during widget updates.
Build and packaged tests must reject the prohibited editor and verify Settings lockout.

The Linux contracts protect behavior and integration interfaces; they do not freeze widget UI or
feature development. A developer may add, remove, restyle, reorganize, or update widgets for Arch
KDE and Nobara KDE when the change preserves the following boundaries:

- Widget code may consume the existing HTTP, event, preload, and canvas interfaces. It may not start
  a competing screen-capture pipeline, query game memory, inject into Star Citizen, or bypass the
  exact-session privacy gate.
- Widget interaction regions must continue to register through the established canvas/renderer
  protocol. Held `F`, hard click-through outside owned regions, one native cursor, physical pointer
  forwarding, and `Shift+F6` arrange mode remain platform-owned behavior.
- Widget layouts must remain in the established full-canvas coordinate space. A widget must not
  apply Gamescope scaling or normal-host pointer conversion itself.
- Widget settings may add application-owned values, but they may not rename the canonical Linux
  config root or make the protected Linux interaction controls user-overridable.
- Widget features may use sidecar routes and state, but authoritative Mining admission, Game.log
  vehicle presence, capture selection, OCR isolation, and sidecar supervision remain outside the
  widget layer.
- Arch KDE and Nobara KDE use the same runtime behavior. Distribution packaging may express
  different dependency names or metadata, but must not create separate widget or capture logic.

Changes that cross these seams are integration changes, not ordinary widget changes. They require
the complete relevant Linux regression gates in addition to widget tests. The developer-facing file
map and handoff checklist are in `docs/LINUX-WIDGET-DEVELOPER-HANDOFF.md`.

## 3. Mining integration rule

Mining authority is the conjunction of two independent facts:

1. The sidecar's Game.log watcher confirms that the player is aboard a ship or controls a ground
   vehicle.
2. OCR reads an exact member of the current Resource Signature catalog from the configured Mining
   region.

Radar pixels, HUD color, OCR wording such as “strong,” and Prospector-specific assumptions are not
Mining authority. Structural Scan Mode detection and its labeled fixture corpus remain useful as
diagnostics and wake-up evidence, but they may not arm or disarm Mining by themselves.

A timeout or other transport failure while reading vehicle presence is not evidence of a Game.log
departure. The capture process must retain the last confirmed state with bounded retry. The sidecar
must recheck its current Game.log state when it commits every OCR result, so on-foot reads remain
fail-closed even when capture has a stale in-vehicle scheduling state. A successful inline response
must return the current authority state so capture can reconcile a real departure immediately.

The Mining capture/OCR tick may not wait on the sidecar commit route. It must classify an exact
catalog result locally, queue one in-flight plus one newest pending authoritative commit, and retain
the newest result through a bounded transport failure. The sidecar repeats the admission checks and
remains the only process that changes Mining state. Mining loopback requests must use short,
independent transactions rather than sharing a dispatcher with a long-lived event stream. A sidecar
restart requires repeated failures from a separate instance-health probe; a single route timeout is
not restart authority.

Sidecar health strikes form one bounded failure episode. Any successful Mining transport clears
that episode, and old strikes must expire rather than accumulate across healthy play. Give a newly
spawned child a readiness grace interval and require a continuous independent-probe outage before a
controlled restart. Track watchdog-requested termination separately from spontaneous child exits:
a controlled recovery must not consume the ordinary crash budget. Reset the ordinary crash budget
after a stable child interval, and apply restart cooldown so supervision cannot create a kill loop.

Mining-only signature OCR must remain dormant when the last confirmed vehicle state is inactive.
Other explicitly enabled features such as mission or fabricator OCR may perform their own work, but
their results may not masquerade as a Mining signature. Repeated auxiliary OCR failures must use
bounded backoff so they cannot continually consume the shared OCR fallback budget during Mining.

The refinery timer is part of Mining Assistant but is not evidence of Mining authority. A stale
Game.log ship channel may not suppress refinery timers indefinitely after the player leaves a ship.
When vehicle authority remains active, Linux may run one low-priority refinery-only probe after at
least 12 seconds without a Resource Signature and no more often than every 15 seconds. An active
signature lock keeps the Mining OCR lane exclusive, and every other auxiliary reader remains
deferred. The refinery result must still come from the bound Star Citizen frame.

Mining diagnostics must remain bounded and persistent under the canonical Linux config directory.
When diagnostics are explicitly enabled, the package must retain the exact OCR crop, wider context,
authority state, accepted or rejected text, and timing needed to diagnose a false positive or false
negative.

## 4. Config ownership

All Linux processes use one physical config root:

`SC_TRACKER_CONFIG_DIR`

The Electron shell sets it and the sidecar consumes it. A stale HOME/APPDATA-style legacy config may
not silently override it.

The public config API must repair these platform-owned values before persisting on Linux even if a
caller attempts to change them:

- `interactHotkey = "F"`
- `holdToInteract = true`
- `moveHotkey = "Shift+F6"`

The screen-reader profile is **not** a locked Linux platform setting. A fresh Linux config may begin
at `lightweight`, but the user must be able to select Balanced, Mining, or another valid reader
combination. `screenReaderProfile` is descriptive state derived from the actual reader toggles and
must remain coherent with them:

- `lightweight`: Fabricator off, Mission OCR off, Mining Assistant off
- `balanced`: Fabricator off, Mission OCR on, Mining Assistant off
- `mining`: Fabricator off, Mission OCR off, Mining Assistant on
- `custom`: every other combination

The Settings page and `/api/config` must use the same truth table. The POST response must report the
**applied** screen-reader state (`fabCapture`, `missionOcr`, `miningAssistant`, and derived profile)
so Settings can verify the save rather than reporting a false failure after a successful write.

## 5. Release quarantine

A green compile is not a release approval.

During a significant upstream rebase:

1. Build an internal candidate artifact.
2. Keep publication disabled.
3. Run the complete validation matrix below against both the generated tree and the packaged tree
   where applicable.
4. Only re-enable publication in a separate, deliberate release-approval commit after all gates are
   green.

The prior release remains the rollback point until real in-game testing of the new candidate is
complete.

## 6. Required validation matrix

### Source/upstream tests

- Electron/CommonJS syntax checks.
- TypeScript `tsc --noEmit`.
- Full upstream test suite.
- Production `server.mjs` build.

### JavaScript merge audits

- `allowJs/checkJs` lexical scan for undefined bindings, duplicate/redeclared identifiers and use
  before declaration.
- Reject duplicate top-level function declarations.
- Reject duplicate `ipcMain.handle/on/once` registrations.
- Verify every relative CommonJS dependency exists in the package.
- Evaluate `capture.cjs` under a controlled Electron stub; syntax-only checking is insufficient.

### IPC and renderer audits

- Every preload `ipcRenderer.invoke()` has a matching `ipcMain.handle()`.
- Every preload `ipcRenderer.send()` has a matching `ipcMain.on/once()`.
- Parse every overlay HTML file.
- Syntax-check every inline renderer script.
- Reject duplicate DOM IDs.
- Parse bundled JSON resources.

### Runtime/package smoke tests

- Execute generated and packaged `main.cjs` under controlled Electron stubs.
- Exercise `app.whenReady()`, canvas creation, renderer-ready callback, sidecar spawn contract and
  IPC registration.
- Launch the actual packaged `server.mjs` on an isolated port and verify identity, missions API and
  HUD page endpoints.
- Verify archive checksums after staging.

### Linux regression tests

Re-run the still-applicable proven Alpha 17 tests against the new candidate, including:

- exact Star Citizen session binding;
- renderer region handshake;
- stable held-F interaction;
- verified focus/pointer handoff;
- idle pointer pinning;
- explicit interaction ownership;
- physical click forwarding;
- structural radar/Scan Mode behavior;
- direct Gamescope PipeWire capture remains registered as `gamescope-pipewire`;
- its source identity remains `Gamescope PipeWire node <id>`;
- the packaged helper still uses direct `pipewiresrc` and binds the node to the active Gamescope
  process rather than accepting an ambiguous desktop source;
- direct Gamescope PipeWire remains first for Gamescope sessions; portal PipeWire remains first for
  normal KDE Wayland sessions; exact-XID X11, Spectacle, and Electron monitor fallbacks remain;
- the normal KDE portal helper requests WINDOW only, receives its restricted PipeWire remote by
  file descriptor, uses direct `pipewiresrc`, and transfers raw BGRA without Chromium/PNG in the
  steady-state path;
- normal panoramic Location Sync crops the full Star Citizen window's top-right region, while
  Mining maps the same full window into the bound display's established coordinate space;
- a portal initialization error is logged before helper exit and cannot create repeated prompts or
  restart attempts during the same Star Citizen process;
- a simulated active Star Citizen session with **no Gamescope PID** rejects the direct PipeWire path
  immediately and successfully continues to the next backend rather than disabling OCR;
- a real default/non-Gamescope Star Citizen launch is part of the pre-release field-test matrix in
  addition to the Gamescope launch used for low-latency Mining Scanner validation.
- Mining local admission and sidecar admission return the same result for current-catalog values,
  unclassified structural contacts, coordinate text, identifiers, cargo text, and distress/wreckage
  context.
- A hung Mining commit route does not block the capture/OCR tick, retains only the newest pending
  result, and delivers that result after recovery.
- Sustained real-sidecar Mining commits and vehicle-presence reads complete within the Mining route
  deadline without a long-lived vehicle-presence SSE connection.
- The owned sidecar is restarted only after the configured number of independent instance-health
  probe failures.

The four labeled Alpha 17 Scan Mode fixtures are part of the permanent detector regression corpus.

Also assert current equivalents for architecture-sensitive contracts rather than relying only on
old source-text regexes when upstream legitimately changes implementation shape. The explicit
`gamescope-pipewire` method/source identity is an exception: it is deliberately stable and must be
checked literally so a future rebase cannot accidentally demote the field-proven Mining Scanner
capture path while still passing a generic "some capture works" test.

### Config E2E

Launch the actual packaged sidecar with an isolated canonical config directory and:

- verify diagnostics report the canonical config path;
- verify a conflicting legacy HOME config is not adopted;
- attempt to overwrite F/hold/Shift+F6 through `/api/config`;
- verify the API response and saved `config.json` repair those platform controls;
- exercise at least two non-default reader states (for example Mining and Balanced);
- verify `/api/config` returns the applied `screenReading` state that Settings verifies;
- verify the derived profile matches the actual reader booleans in the POST response, subsequent
  GET response, and persisted `config.json`;
- verify packaged Linux can explicitly opt into bounded Mining diagnostics;
- verify the sidecar remains alive.

## 7. Upgrade cadence

When practical, port upstream releases incrementally instead of skipping many tags at once. For a
large unavoidable jump:

- compare each intervening upstream release/commit group;
- classify changes by subsystem before merging;
- rebuild high-risk files semantically;
- keep automatic publication disabled throughout integration;
- produce internal candidates only until the entire validation matrix is green.

The goal is not to avoid upstream change. The goal is to ensure that upstream functionality and the
Linux platform contracts are combined intentionally rather than accidentally by textual conflict
resolution.
