"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const sharp = require("../app/node_modules/sharp");
const { encodeWindowFrame } = require("../app/electron/window-frame-encoder.cjs");

(async () => {
  for (const [width, height] of [[3840, 1642], [6270, 2160]]) {
    const input = new Uint8ClampedArray(crypto.randomBytes(width * height * 4));
    for (let i = 3; i < input.length; i += 4) input[i] = 255;
    const started = performance.now();
    const png = await encodeWindowFrame(input, width, height);
    const elapsed = performance.now() - started;
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, width);
    assert.equal(info.height, height);
    assert.equal(info.channels, 4);
    assert.deepEqual(data, Buffer.from(input.buffer), "lossless full-canvas pixels and channel order");
    console.log(`Candidate 10 native lossless encode ${width}x${height}: ${Math.round(elapsed)}ms, ${png.length} bytes (synthetic texture; field timing unverified)`);
  }
  await assert.rejects(encodeWindowFrame(new Uint8Array(4), 8000, 8000), /budget/);
  await assert.rejects(encodeWindowFrame(new Uint8Array(3), 1, 1), /invalid/);
  console.log("Candidate 10 native PNG round-trip and allocation budget passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
