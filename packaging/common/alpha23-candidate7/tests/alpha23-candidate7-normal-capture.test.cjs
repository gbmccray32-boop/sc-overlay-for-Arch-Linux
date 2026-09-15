"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { normalCanvasDisplayCrop } = require("../app/electron/normal-canvas-geometry.cjs");
const { createPersistentStarCitizenWindowCapture } = require("../app/electron/persistent-star-citizen-window.cjs");

const root = path.resolve(__dirname, "..");

function geometryTests() {
  const displays = [
    { bounds: { x: 0, y: 0, width: 1215, height: 2160 } },
    { bounds: { x: 1215, y: 0, width: 3840, height: 2160 } },
    { bounds: { x: 5055, y: 0, width: 1215, height: 2160 } },
  ];
  assert.deepEqual(normalCanvasDisplayCrop({
    sourceSize: { width: 6270, height: 2160 },
    displayBounds: displays[1].bounds,
    displays,
    canvasWidth: 6270,
    canvasHeight: 2160,
  }), { x: 1215, y: 0, width: 3840, height: 2160 });
  assert.equal(normalCanvasDisplayCrop({
    sourceSize: { width: 3840, height: 2160 },
    displayBounds: displays[1].bounds,
    displays,
    canvasWidth: 6270,
    canvasHeight: 2160,
  }), null);
}

async function initializationFailureTests() {
  const spawned = [];
  const warnings = [];
  const spawner = (_electron, args) => {
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.stdin = { write() {} };
    proc.stdout.setEncoding = () => {};
    proc.stderr.setEncoding = () => {};
    proc.kill = () => {};
    spawned.push({ args, proc });
    return proc;
  };
  const capture = createPersistentStarCitizenWindowCapture({
    logger: { log() {}, warn(message) { warnings.push(message); } },
    spawner,
    now: () => 100,
  });
  await assert.rejects(capture.capture({ gamePid: 4321, gameStartTicks: "99", gameWindowId: "7654321" }), /waiting/);
  spawned[0].proc.stdout.emit("data", `${JSON.stringify({ type: "error", id: 0, error: "NotAllowedError: selection cancelled" })}\n`);
  assert.match(warnings[0], /NotAllowedError.*disabled for this Star Citizen session/);
  await assert.rejects(capture.capture({ gamePid: 4321, gameStartTicks: "99", gameWindowId: "7654321" }), /disabled.*NotAllowedError/);
  assert.equal(spawned.length, 1, "a permanent initialization failure must not reprompt in the same game session");
  await assert.rejects(capture.capture({ gamePid: 9876, gameStartTicks: "100", gameWindowId: "1234" }), /waiting/);
  assert.equal(spawned.length, 2, "a new Star Citizen session may request portal selection once");
  capture.close();
}

function sourceContractTests() {
  const captureSource = fs.readFileSync(path.join(root, "app/electron/capture.cjs"), "utf8");
  const parentSource = fs.readFileSync(path.join(root, "app/electron/persistent-star-citizen-window.cjs"), "utf8");
  const helperSource = fs.readFileSync(path.join(root, "app/electron/star-citizen-window-helper.cjs"), "utf8");
  const preloadSource = fs.readFileSync(path.join(root, "app/electron/star-citizen-window-preload.cjs"), "utf8");
  assert.match(helperSource, /setDisplayMediaRequestHandler/);
  assert.match(helperSource, /types: \["window"\]/);
  assert.match(helperSource, /ozone-platform", "wayland"/);
  assert.match(helperSource, /WebRTCPipeWireCapturer/);
  assert.match(helperSource, /SC_TRACKER_CONFIG_DIR/);
  assert.match(helperSource, /portal-capture-profile/);
  assert.match(preloadSource, /getDisplayMedia/);
  assert.doesNotMatch(preloadSource, /chromeMediaSourceId/);
  assert.match(parentSource, /Number\(message\.id\) === 0/);
  assert.match(parentSource, /disabled for this Star Citizen session/);
  assert.match(captureSource, /got\.transport === "portal-pipewire-window"/);
  assert.match(captureSource, /"ximagesrc", `xid=\$\{boundGameWindowId\}`/);
  assert.match(captureSource, /\["window", "x11", "spectacle", "electron"\]/);
  assert.match(captureSource, /captureLocationWithPortalWindow/);
  assert.match(captureSource, /captureLocationWithX11Window/);

  const gamescopeSource = fs.readFileSync(path.join(root, "app/electron/native-linux-gamescope-pipewire.cjs"), "utf8");
  const gamescopeHash = crypto.createHash("sha256").update(gamescopeSource).digest("hex");
  assert.equal(gamescopeHash, "78d53614e05e7909ece4c46eb94ace524251918f5e5f9d1e3e78c5b5e4d81cd4");
  assert.match(captureSource, /method: "gamescope-pipewire"/);
  assert.match(gamescopeSource, /pipewiresrc/);
  assert.match(gamescopeSource, /Gamescope PipeWire node/);
}

(async () => {
  geometryTests();
  await initializationFailureTests();
  sourceContractTests();
  console.log("Alpha23 Candidate 7 portal-window capture regression passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
