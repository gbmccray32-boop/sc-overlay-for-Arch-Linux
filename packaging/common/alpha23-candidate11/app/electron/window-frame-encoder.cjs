"use strict";

// Chromium's nativeImage handles PNG encoding without loading sharp/libvips into the portal
// renderer. Keep this work inside the disposable helper, away from overlay input and OCR.
const { nativeImage } = require("electron");

function encodeWindowFrame(pixels, width, height, imageApi = nativeImage) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
      || width * height > 16000000 || pixels.byteLength !== width * height * 4) {
    throw new Error("invalid window pixels or capture budget exceeded");
  }
  // Canvas returns RGBA; Electron's bitmap input is BGRA on Linux. Copy before swapping so
  // the browser-owned ImageData cannot change while video capture advances.
  const bitmap = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  const bgra = Buffer.from(bitmap);
  for (let offset = 0; offset < bgra.length; offset += 4) {
    const red = bgra[offset];
    bgra[offset] = bgra[offset + 2];
    bgra[offset + 2] = red;
  }
  const frame = imageApi.createFromBitmap(bgra, { width, height, scaleFactor: 1 });
  if (!frame || frame.isEmpty()) throw new Error("Electron rejected the window bitmap");
  const png = frame.toPNG({ scaleFactor: 1 });
  if (!png.length) throw new Error("Electron returned an empty PNG");
  return png;
}

module.exports = { encodeWindowFrame };
