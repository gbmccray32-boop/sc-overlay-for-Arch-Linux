"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { createMiningSignatureConfirmation, __test } = require("../app/electron/mining-signature-confirmation.cjs");
const { createPersistentStarCitizenWindowCapture, __test: parentConstants } = require("../app/electron/persistent-star-citizen-window.cjs");

const root = path.resolve(__dirname, "..");
const result = (signature = 2000, x = 100) => ({
  kind: "mineable",
  signature,
  text: { x, y: 40, w: 50, h: 20 },
});

function confirmationTests() {
  let time = 0;
  const fast = createMiningSignatureConfirmation({ now: () => time });
  assert.equal(fast.observe(result(), "frame-a").status, "pending");
  time = 900;
  assert.equal(fast.observe(result(), "frame-b").status, "confirmed");

  time = 0;
  const duplicate = createMiningSignatureConfirmation({ now: () => time });
  assert.equal(duplicate.observe(result(), "same").status, "pending");
  time = 500;
  assert.equal(duplicate.observe(result(), "same").status, "pending");

  time = 0;
  const late = createMiningSignatureConfirmation({ now: () => time });
  assert.equal(late.observe(result(), "frame-a").status, "pending");
  time = 1700;
  assert.equal(late.observe(result(), "frame-b").status, "pending");

  time = 0;
  const spectacle = createMiningSignatureConfirmation({ now: () => time });
  assert.equal(spectacle.observe(result(), "frame-a", { windowMs: 13000 }).status, "pending");
  time = 10700;
  assert.equal(spectacle.observe(result(), "frame-b", { windowMs: 13000 }).status, "confirmed");

  time = 0;
  const conflict = createMiningSignatureConfirmation({ now: () => time });
  assert.equal(conflict.observe(result(2000), "frame-a", { windowMs: 13000 }).status, "pending");
  time = 8000;
  assert.equal(conflict.observe(result(4000), "frame-b", { windowMs: 13000 }).status, "pending");
  assert.equal(__test.normalizeWindowMs(99999, 1600), __test.MAX_WINDOW_MS);
}

function helperParentTests() {
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
  assert.rejects(
    capture.capture({ gamePid: 4321, gameStartTicks: "99", gameWindowId: "7654321" }),
    /warming/,
  );
  assert.equal(spawned[0].args[2], "7654321");
  spawned[0].proc.stderr.emit("data", "source discovery failed\n");
  spawned[0].proc.emit("exit", 2, null);
  assert.match(warnings[0], /code 2.*source discovery failed/);
  assert.equal(parentConstants.START_RETRY_MS, 10000);
  capture.close();
}

function sourceContractTests() {
  const captureSource = fs.readFileSync(path.join(root, "app/electron/capture.cjs"), "utf8");
  const helperSource = fs.readFileSync(path.join(root, "app/electron/star-citizen-window-helper.cjs"), "utf8");
  assert.match(captureSource, /WINDOW=%s/);
  assert.match(captureSource, /gameWindowId/);
  assert.match(captureSource, /WINDOW_STREAM_PROBE_MS = 10000/);
  assert.match(captureSource, /HOST_IS_WAYLAND && hasGamescope/);
  assert.match(captureSource, /captureMs\) \|\| 3125\) \* 4 \+ 2500/);
  assert.match(helperSource, /window:\$\{targetWindowId\}:/);
  assert.match(helperSource, /sources=\$\{JSON\.stringify\(inventory\)\}/);

  const gamescopePath = path.join(root, "app/electron/native-linux-gamescope-pipewire.cjs");
  const gamescopeSource = fs.readFileSync(gamescopePath, "utf8");
  const gamescopeHash = crypto.createHash("sha256").update(gamescopeSource).digest("hex");
  assert.equal(gamescopeHash, "78d53614e05e7909ece4c46eb94ace524251918f5e5f9d1e3e78c5b5e4d81cd4");
  assert.match(captureSource, /method: "gamescope-pipewire"/);
  assert.match(gamescopeSource, /pipewiresrc/);
  assert.match(gamescopeSource, /Gamescope PipeWire node/);
}

confirmationTests();
helperParentTests();
sourceContractTests();
console.log("Alpha23 Candidate 6 normal-capture confirmation regression passed");
