"use strict";
const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const { EventEmitter } = require("node:events");
const { encodeWindowFrame } = require("../app/electron/window-frame-encoder.cjs");
const { __test, createPersistentStarCitizenWindowCapture } = require("../app/electron/persistent-star-citizen-window.cjs");

function inspectPng(png, width, height, expected) {
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  let offset = 8, imageData = null;
  for (const kind of ["IHDR", "IDAT", "IEND"]) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    assert.equal(type, kind);
    assert.equal(png.readUInt32BE(offset + 8 + length), zlib.crc32(data, zlib.crc32(Buffer.from(kind))));
    if (kind === "IHDR") {
      assert.equal(data.readUInt32BE(0), width);
      assert.equal(data.readUInt32BE(4), height);
      assert.deepEqual([...data.subarray(8)], [8, 6, 0, 0, 0]);
    } else if (kind === "IDAT") imageData = zlib.inflateSync(data);
    offset += length + 12;
  }
  assert.equal(offset, png.length);
  const rowBytes = width * 4;
  assert.equal(imageData.length, (rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    assert.equal(imageData[y * (rowBytes + 1)], 0);
    assert.deepEqual(imageData.subarray(y * (rowBytes + 1) + 1, (y + 1) * (rowBytes + 1)),
      Buffer.from(expected.buffer, expected.byteOffset + y * rowBytes, rowBytes));
  }
}

for (const pixels of [new Uint8ClampedArray([12, 34, 56, 255, 90, 80, 70, 128]),
  new Uint8ClampedArray([0, 0, 0, 0, 255, 255, 255, 255])]) {
  const before = Buffer.from(pixels);
  inspectPng(encodeWindowFrame(pixels, 2, 1), 2, 1, pixels);
  assert.deepEqual(Buffer.from(pixels), before, "browser-owned frame remains unchanged");
}
const pixels = new Uint8ClampedArray(17 * 11 * 4);
for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 127 + 13) & 255;
inspectPng(encodeWindowFrame(pixels, 17, 11), 17, 11, pixels);
assert.throws(() => encodeWindowFrame(new Uint8Array(4), 8000, 8000), /budget/);
assert.throws(() => encodeWindowFrame(new Uint8Array(3), 1, 1), /invalid/);
assert.equal(__test.REQUEST_TIMEOUT_MS, 1400);
assert.equal(__test.STALLED_FRAME_TIMEOUT_MS, 8000);

// Candidate 11 dropped a healthy approved stream at 700ms when real encoding took 900ms.
// The same frame must now reach the caller without opening a slow screenshot fallback.
(async () => {
  let child;
  const capture = createPersistentStarCitizenWindowCapture({
    logger: { log() {}, warn() {} },
    spawner() {
      child = new EventEmitter();
      child.stdout = new EventEmitter(); child.stdout.setEncoding = () => {};
      child.stderr = new EventEmitter(); child.stderr.setEncoding = () => {};
      child.stdin = { write: line => {
        const id = JSON.parse(line).id;
        setTimeout(() => child.stdout.emit("data", JSON.stringify({ type: "frame", id,
          path: "/unused", sequence: 1, capturedAt: Date.now(), videoTime: 1 }) + "\n"), 900);
      } };
      child.kill = () => {};
      return child;
    },
  });
  const session = { gamePid: 777, gameStartTicks: "42" };
  await assert.rejects(capture.capture(session), error => error.code === "PORTAL_SELECTION_PENDING");
  child.stdout.emit("data", JSON.stringify({ type: "ready", transport: "portal-pipewire-window" }) + "\n");
  assert.equal((await capture.capture(session)).sequence, 1);
  capture.close();
  console.log("Candidate 12 lossless PNG, full pixels, and 900ms approved portal frame passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
