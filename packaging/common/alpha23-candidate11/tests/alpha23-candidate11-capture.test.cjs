"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { createPersistentStarCitizenWindowCapture } = require("../app/electron/persistent-star-citizen-window.cjs");
const source = fs.readFileSync(path.join(__dirname, "../app/electron/capture.cjs"), "utf8");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const children = [];
  const capture = createPersistentStarCitizenWindowCapture({
    requestTimeoutMs: 8, stalledFrameTimeoutMs: 35,
    logger: { log() {}, warn() {} },
    spawner() {
      const child = new EventEmitter();
      child.stdout = new EventEmitter(); child.stdout.setEncoding = () => {};
      child.stderr = new EventEmitter(); child.stderr.setEncoding = () => {};
      child.stdin = { write: line => { child.request = JSON.parse(line); } };
      child.kill = () => { child.killed = true; };
      child.send = message => child.stdout.emit("data", JSON.stringify(message) + "\n");
      children.push(child);
      return child;
    },
  });
  const identity = { gamePid: 42, gameStartTicks: "123", gameWindowId: "100" };
  await assert.rejects(capture.capture(identity), error => error.code === "PORTAL_SELECTION_PENDING");
  assert.equal(children.length, 1);
  await assert.rejects(capture.capture({ ...identity, gameWindowId: "101" }), error => error.code === "PORTAL_SELECTION_PENDING");
  assert.equal(children.length, 1, "XID changes cannot reopen KDE's selector");
  children[0].send({ type: "ready", transport: "portal-pipewire-window" });
  const deadline = assert.rejects(capture.capture(identity), /approved session retained/);
  await pause(15);
  await deadline;
  await assert.rejects(capture.capture(identity), /one frame request in flight/);
  await pause(35);
  await assert.rejects(capture.capture(identity), /disabled.*stalled/);
  assert.equal(children.length, 1, "a dead renderer cannot reopen the chooser for this process");
  assert.equal(children[0].killed, true);
  await assert.rejects(capture.capture({ ...identity, gameStartTicks: "124" }), error => error.code === "PORTAL_SELECTION_PENDING");
  assert.equal(children.length, 2, "a new game process may request approval");
  capture.close();

  let session = { gamePid: 55, gameStartTicks: "55", gamescopePid: 0 };
  const calls = [];
  const backends = Object.fromEntries(["pipewire", "gamescope", "window", "x11", "spectacle", "electron"].map(name => [name, async () => {
    calls.push(name);
    if (name === "window") { const error = new Error("waiting for selection"); error.code = "PORTAL_SELECTION_PENDING"; throw error; }
    return { method: name };
  }]));
  const display = { id: "1", bounds: { x: 0, y: 0, width: 3840, height: 2160 } };
  const context = vm.createContext({
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
  const start = source.indexOf("async function captureGame(winRect)");
  const end = source.indexOf("// ARCHVERSE_LOCATION_SYNC_V3_CAPTURE", start);
  vm.runInContext(source.slice(start, end), context);
  await assert.rejects(context.captureGame(), error => error.code === "PORTAL_SELECTION_PENDING");
  assert.deepEqual(calls, ["window"], "no Spectacle or X11 capture competes with KDE's chooser");
  calls.length = 0;
  session = { gamePid: 55, gameStartTicks: "55", gamescopePid: 99 };
  assert.equal((await context.captureGame()).method, "pipewire");
  assert.deepEqual(calls, ["pipewire"], "Gamescope stays on its direct PipeWire route");

  const locationCalls = [];
  const locationContext = vm.createContext({
    scSession: { current: () => ({ gamePid: 55, gamescopePid: 0 }) }, process: { platform: "linux" }, HOST_IS_WAYLAND: true,
    captureLocationWithPortalWindow: async () => { locationCalls.push("portal"); const e = new Error("waiting"); e.code = "PORTAL_SELECTION_PENDING"; throw e; },
    captureLocationWithX11Window: async () => { locationCalls.push("x11"); return {}; },
    captureLocationWithSpectacleFullDesktop: async () => { locationCalls.push("spectacle"); return {}; },
    captureGame: async () => { locationCalls.push("game"); return {}; },
  });
  const locationStart = source.indexOf("async function captureLocationSyncCrop(");
  const locationEnd = source.indexOf("// The kiosk's item render", locationStart);
  vm.runInContext(source.slice(locationStart, locationEnd), locationContext);
  await assert.rejects(locationContext.captureLocationSyncCrop("/unused"), error => error.code === "PORTAL_SELECTION_PENDING");
  assert.deepEqual(locationCalls, ["portal"], "Location Sync also leaves the chooser unobstructed");
  console.log("Candidate 11 chooser isolation, stalled-frame quarantine and Gamescope separation passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
