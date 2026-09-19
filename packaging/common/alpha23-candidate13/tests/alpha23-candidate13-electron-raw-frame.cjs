"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, nativeImage } = require("electron");
const { decodePortalFrame } = require("../app/electron/portal-raw-frame.cjs");

app.whenReady().then(() => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archverse-c13-electron-"));
  const file = path.join(directory, "frame.bgra");
  // nativeImage bitmaps use BGRA. Verify channel order and alpha through the packaged runtime.
  const pixels = Buffer.from([3, 2, 1, 255, 30, 20, 10, 128]);
  fs.writeFileSync(file, pixels);
  const image = decodePortalFrame({ pixelFormat: "BGRA", path: file, width: 2, height: 1 }, nativeImage);
  assert.equal(image.isEmpty(), false);
  assert.deepEqual(image.getSize(), { width: 2, height: 1 });
  assert.deepEqual(image.toBitmap(), pixels);
  fs.rmSync(directory, { recursive: true, force: true });
  console.log("Candidate 13 packaged Electron raw BGRA decoding passed");
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
