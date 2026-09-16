"use strict";

// Native encoding stays inside the disposable portal helper, away from overlay input and OCR.
const sharp = require("sharp");
sharp.concurrency(1);
sharp.cache(false);

async function encodeWindowFrame(pixels, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
      || width * height > 16000000 || pixels.byteLength !== width * height * 4) {
    throw new Error("invalid window pixels or capture budget exceeded");
  }
  const bytes = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  // Preserve every RGBA pixel and the full game canvas. No palette, JPEG, or resizing.
  return sharp(bytes, { raw: { width, height, channels: 4 }, limitInputPixels: 16000000 })
    .png({ compressionLevel: 0, adaptiveFiltering: false, palette: false }).toBuffer();
}

module.exports = { encodeWindowFrame };
