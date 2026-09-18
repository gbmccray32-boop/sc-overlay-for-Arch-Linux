"use strict";

// The approved portal frame is a full game canvas. Electron's nativeImage.toPNG() can spend
// almost a second compressing detailed 3840px scenes. PNG filter 0 and stored DEFLATE blocks
// preserve every pixel while making encoding time independent of scene complexity.
const zlib = require("node:zlib");
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function pngChunk(type, data) {
  const kind = Buffer.from(type, "ascii");
  const head = Buffer.allocUnsafe(8);
  head.writeUInt32BE(data.length, 0);
  kind.copy(head, 4);
  const crc = Buffer.allocUnsafe(4);
  crc.writeUInt32BE(zlib.crc32(data, zlib.crc32(kind)), 0);
  return Buffer.concat([head, data, crc], data.length + 12);
}

function encodeWindowFrame(pixels, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width * height > 16000000 || pixels?.byteLength !== width * height * 4 ||
      !ArrayBuffer.isView(pixels)) {
    throw new Error("invalid window pixels or capture budget exceeded");
  }
  if (typeof zlib.crc32 !== "function") throw new Error("Electron Node runtime lacks PNG CRC support");
  const rowBytes = width * 4;
  const scanlines = Buffer.allocUnsafe((rowBytes + 1) * height);
  const source = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  for (let y = 0; y < height; y++) {
    const offset = y * (rowBytes + 1);
    scanlines[offset] = 0; // Filter None; PNG color type 6 stores RGBA in canvas order.
    source.copy(scanlines, offset + 1, y * rowBytes, (y + 1) * rowBytes);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Eight bits per RGBA channel, no palette or interlacing.
  ihdr[9] = 6;
  const compressed = zlib.deflateSync(scanlines, { level: zlib.constants.Z_NO_COMPRESSION });
  return Buffer.concat([PNG_SIGNATURE, pngChunk("IHDR", ihdr), pngChunk("IDAT", compressed), pngChunk("IEND", Buffer.alloc(0))]);
}

module.exports = { encodeWindowFrame };
