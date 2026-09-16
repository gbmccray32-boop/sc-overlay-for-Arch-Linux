"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../app/electron/capture.cjs"), "utf8");

(async () => {
  let resolveFetch, requests = 0, clock = 1000000;
  const context = vm.createContext({
    remoteHave: null, remoteHaveAt: 0, remoteHaveRefresh: null,
    REMOTE_TTL_MS: 180000, FETCH_TIMEOUT_MS: 8000, SITE: "https://example.invalid",
    uploaded: new Set(["old"]), Set, AbortSignal, Date: { now: () => clock },
    fetch: () => { requests++; return new Promise(resolve => { resolveFetch = resolve; }); },
  });
  const start = source.indexOf("  async function ensureRemoteHave()");
  const end = source.indexOf("  async function upload(", start);
  vm.runInContext(source.slice(start, end), context);
  const first = context.ensureRemoteHave();
  const second = context.ensureRemoteHave();
  assert.equal(requests, 1, "capture and upload drain share one pending network request");
  // Execute the actual pre-capture code with the remote request deliberately unresolved.
  const tickStart = source.indexOf("      if (fab) void ensureRemoteHave();");
  const tickEnd = source.indexOf("      const t0 = Date.now();", tickStart);
  assert(tickStart > 0 && tickEnd > tickStart);
  context.fab = true;
  vm.runInContext(`(async () => { ${source.slice(tickStart, tickEnd)} return have.size; })()`, context);
  assert.equal(requests, 1, "a pending catalogue does not overlap or prevent capture dispatch");
  resolveFetch({ ok: false, status: 503 });
  await Promise.all([first, second]);
  await context.ensureRemoteHave();
  assert.equal(requests, 1, "failure retries are cooled down rather than repeated every frame");
  clock += 30001;
  const refresh = context.ensureRemoteHave();
  assert.equal(requests, 2);
  resolveFetch({ ok: true, json: async () => ({ have: ["known"] }) });
  await refresh;
  assert(context.remoteHave.has("known"));
  assert(!context.uploaded.has("old"));
  clock += 180001;
  const failure = context.ensureRemoteHave();
  resolveFetch({ ok: false, status: 500 });
  await failure;
  assert(context.remoteHave.has("known"), "failed refresh preserves last confirmed catalogue");

  let session = { gamePid: 1, gameStartTicks: "100", gamescopePid: 0 };
  const calls = [];
  let failed = new Set(["window", "x11"]);
  const backends = Object.fromEntries(["pipewire", "gamescope", "window", "x11", "spectacle", "electron"].map(name => [name, async () => {
    calls.push(name);
    if (failed.has(name)) throw new Error("unavailable");
    return { method: name };
  }]));
  const display = { id: "1", bounds: { x: 0, y: 0, width: 3840, height: 2160 } };
  const captureContext = vm.createContext({
    scSession: { current: () => session }, screen: { getPrimaryDisplay: () => display },
    process: { platform: "linux" }, HOST_IS_WAYLAND: true, CAPTURE_BACKENDS: backends,
    preferredCaptureBackend: "", captureSessionKey: "", _lastOcrCaptureInfo: null,
    canonicalDisplaySize: null, pipeWireRecoveryCandidate: null, pipeWireRecoveryFailureCount: 0,
    pipeWireRecoveryNextAttemptAt: 0, lastPipeWireRecoveryProbeAt: 0, lastPipeWireRecoveryCandidateKey: "",
    fallbackUpgradeNextAttemptAt: 0, windowStreamNextProbeAt: 0,
    WINDOW_STREAM_PROBE_MS: 10000, FALLBACK_UPGRADE_PROBE_MS: 5000,
    schedulePipeWireRecoveryProbe() {}, notePipeWireFrameSuccess() {}, notePipeWireFrameFailure() {},
    recordCaptureResult: result => result, captureWarning() {}, console: { log() {}, warn() {} }, Date,
  });
  const captureStart = source.indexOf("async function captureGame(winRect)");
  const captureEnd = source.indexOf("// ARCHVERSE_LOCATION_SYNC_V3_CAPTURE", captureStart);
  vm.runInContext(source.slice(captureStart, captureEnd), captureContext);
  assert.equal((await captureContext.captureGame()).method, "spectacle");
  assert.deepEqual(calls, ["window", "x11", "spectacle"]);
  captureContext.canonicalDisplaySize = { width: 1234, height: 567 };
  calls.length = 0;
  session = { gamePid: 2, gameStartTicks: "200", gamescopePid: 3 };
  assert.equal((await captureContext.captureGame()).method, "pipewire");
  assert.deepEqual(calls, ["pipewire"], "a normal fallback must never precede Gamescope's direct path");
  assert.equal(captureContext.canonicalDisplaySize, null, "display coordinates do not leak across sessions");
  calls.length = 0;
  session = { gamePid: 4, gameStartTicks: "400", gamescopePid: 3 };
  failed = new Set(["pipewire", "gamescope", "electron"]);
  assert.equal((await captureContext.captureGame()).method, "spectacle");
  assert.deepEqual(calls, ["pipewire", "gamescope", "electron", "spectacle"], "Gamescope fallbacks cannot enter normal portal/XID paths");
  calls.length = 0;
  captureContext.fallbackUpgradeNextAttemptAt = 0;
  failed.clear();
  assert.equal((await captureContext.captureGame()).method, "pipewire");
  assert.deepEqual(calls, ["pipewire"], "Gamescope fallback upgrade retries direct capture first");
  calls.length = 0;
  session = { gamePid: 4, gameStartTicks: "401", gamescopePid: 0 };
  assert.equal((await captureContext.captureGame()).method, "window");
  assert.deepEqual(calls, ["window"], "PID reuse and Gamescope-to-normal transitions clear direct backend state");
  const locationCalls = [];
  const locationContext = vm.createContext({
    scSession: { current: () => session }, process: { platform: "linux" }, HOST_IS_WAYLAND: true,
    captureLocationWithPipeWire: async () => { locationCalls.push("pipewire"); throw new Error("unavailable"); },
    captureLocationWithSpectacleFullDesktop: async () => { locationCalls.push("spectacle"); throw new Error("unavailable"); },
    captureLocationWithPortalWindow: async () => { locationCalls.push("portal"); return { method: "portal" }; },
    captureLocationWithX11Window: async () => { locationCalls.push("x11"); return { method: "x11" }; },
    captureGame: async () => { locationCalls.push("game"); return { method: "game", image: {} }; },
    saveLocationCropFromImage: () => ({}), console: { warn() {} },
  });
  const locationStart = source.indexOf("async function captureLocationSyncCrop(");
  const locationEnd = source.indexOf("// The kiosk's item render", locationStart);
  vm.runInContext(source.slice(locationStart, locationEnd), locationContext);
  session = { gamePid: 5, gameStartTicks: "500", gamescopePid: 6 };
  assert.equal((await locationContext.captureLocationSyncCrop("/unused")).method, "game");
  assert.deepEqual(locationCalls, ["pipewire", "spectacle", "game"], "Gamescope Location Sync cannot enter normal portal/XID routes after failures");
  locationCalls.length = 0;
  session = { gamePid: 7, gameStartTicks: "700", gamescopePid: 0 };
  assert.equal((await locationContext.captureLocationSyncCrop("/unused")).method, "portal");
  assert.deepEqual(locationCalls, ["portal"], "normal Location Sync cannot enter direct Gamescope capture");
  console.log("Candidate 10: stalled catalogue isolation, single refresh, retry cooldown, stale-cache retention and both capture-mode transitions passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
