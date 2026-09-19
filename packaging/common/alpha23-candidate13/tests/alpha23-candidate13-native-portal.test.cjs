"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { decodePortalFrame } = require("../app/electron/portal-raw-frame.cjs");
const { __test, createPersistentStarCitizenWindowCapture } = require("../app/electron/persistent-star-citizen-window.cjs");

const root = path.resolve(__dirname, "..");
const nativeSource = fs.readFileSync(path.join(root, "app/electron/native-portal-pipewire.c"), "utf8");
for (const marker of ["OpenPipeWireRemote", "WINDOW_SOURCE_TYPE", "pipewiresrc", "appsink",
  "persist_mode", "restore_token", "GstVideoFrame", "pixelFormat", "BGRA"]) {
  assert.match(nativeSource, new RegExp(marker), `native portal marker missing: ${marker}`);
}
assert.doesNotMatch(nativeSource, /pngenc|XComposite|ximagesrc|spectacle/i,
  "normal native portal helper must not reintroduce screenshot or PNG fallbacks");

const pixels = Buffer.from([
  3, 2, 1, 255, 30, 20, 10, 255,
  90, 80, 70, 255, 120, 110, 100, 255,
]);
let bitmapCall = null;
const image = { tag: "image" };
assert.equal(decodePortalFrame({ pixelFormat: "BGRA", path: "/frame", width: 2, height: 2 }, {
  createFromBitmap(buffer, options) { bitmapCall = { buffer: Buffer.from(buffer), options }; return image; },
  createFromPath() { throw new Error("raw portal frame must not use image decoding"); },
}, {
  statSync() { return { isFile: () => true, size: pixels.length }; },
  readFileSync() { return pixels; },
}), image);
assert.deepEqual(bitmapCall.buffer, pixels, "BGRA bytes changed before nativeImage");
assert.deepEqual(bitmapCall.options, { width: 2, height: 2, scaleFactor: 1 });
assert.throws(() => decodePortalFrame({ pixelFormat: "BGRA", path: "/frame", width: 2, height: 2 }, {
  createFromBitmap() {},
}, {
  statSync() { return { isFile: () => true, size: pixels.length - 1 }; },
}), /does not match/);
assert.throws(() => decodePortalFrame({ pixelFormat: "BGRA", path: "/frame", width: 9000, height: 9000 }, {}, {}), /dimensions/);

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stdout.setEncoding = () => {};
  child.stderr = new EventEmitter(); child.stderr.setEncoding = () => {};
  child.stdin = { write() {} };
  child.kill = () => {};
  return child;
}

(async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "archverse-c13-test-"));
  const nativeHelper = path.join(temporary, "archverse-portal-pipewire");
  fs.writeFileSync(nativeHelper, "test", { mode: 0o700 });
  const spawns = [];
  let child;
  const capture = createPersistentStarCitizenWindowCapture({
    logger: { log() {}, warn() {} },
    nativePortalPath: nativeHelper,
    platform: "linux",
    environment: { WAYLAND_DISPLAY: "wayland-0", SC_TRACKER_CONFIG_DIR: temporary },
    spawner(command, args) { child = fakeChild(); spawns.push({ command, args }); return child; },
  });
  const session = { gamePid: 101, gameStartTicks: "500", gameWindowId: "12" };
  await assert.rejects(capture.capture(session), error => error.code === "PORTAL_SELECTION_PENDING");
  assert.equal(spawns[0].command, nativeHelper);
  assert.deepEqual(spawns[0].args, [spawns[0].args[0], path.join(temporary, "portal-capture-restore-token")]);
  assert.match(spawns[0].args[0], /archverse-sc-window-stream-/);
  child.stdout.emit("data", JSON.stringify({ type: "ready", transport: "portal-pipewire-window",
    engine: "native-gstreamer", width: 3840, height: 1322 }) + "\n");
  let requestMessage;
  child.stdin.write = line => {
    requestMessage = JSON.parse(line);
    const id = requestMessage.id;
    child.stdout.emit("data", JSON.stringify({ type: "frame", id, pixelFormat: "BGRA",
      path: "/frame", width: 1920, height: 1080, sourceWidth: 3840, sourceHeight: 1322,
      nativeCrop: requestMessage.crop, sequence: 1,
      videoTime: 1, capturedAt: Date.now(), transport: "portal-pipewire-window" }) + "\n");
  };
  const sourceCrop = { x: 960, y: 121, width: 1920, height: 1080 };
  assert.equal((await capture.capture({ ...session, gameWindowId: "99", sourceCrop })).pixelFormat, "BGRA");
  assert.deepEqual(requestMessage.crop, sourceCrop, "native helper did not receive the bounded display crop");
  assert.deepEqual(capture.sourceInfo(), { width: 3840, height: 1322,
    transport: "portal-pipewire-window", engine: "native-gstreamer" });
  assert.equal(spawns.length, 1, "changing XWayland IDs must not restart an approved native portal session");
  capture.stop("rebound to a new game session");
  await assert.rejects(capture.capture({ gamePid: 102, gameStartTicks: "501" }), error => error.code === "PORTAL_SELECTION_PENDING");
  assert.equal(spawns.length, 2, "new game process must receive one new native portal session");
  capture.close();
  fs.rmSync(temporary, { recursive: true, force: true });

  assert.equal(__test.REQUEST_TIMEOUT_MS, 1400);
  const gamescope = fs.readFileSync(path.join(root, "app/electron/persistent-gamescope-pipewire.cjs"));
  assert.equal(crypto.createHash("sha256").update(gamescope).digest("hex"),
    "831fdf3584cfa0cd0df15076ab0d6a5c5e010c842b12f08bf3c87ec82333b07b",
    "direct Gamescope helper changed");
  console.log("Candidate 13 native portal selection, raw BGRA, session binding, and Gamescope isolation passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
