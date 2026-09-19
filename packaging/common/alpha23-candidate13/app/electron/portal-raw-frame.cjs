"use strict";

const fs = require("node:fs");

function decodePortalFrame(frame, nativeImage, fileSystem = fs) {
  if (frame?.pixelFormat !== "BGRA") return nativeImage.createFromPath(frame?.path || "");
  const width = Number(frame.width), height = Number(frame.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width * height > 16000000) {
    throw new Error(`invalid native portal frame dimensions ${width}x${height}`);
  }
  const expectedBytes = width * height * 4;
  const stat = fileSystem.statSync(frame.path);
  if (!stat.isFile() || stat.size !== expectedBytes) {
    throw new Error(`native portal BGRA size ${stat.size} does not match ${expectedBytes}`);
  }
  const pixels = fileSystem.readFileSync(frame.path);
  return nativeImage.createFromBitmap(pixels, { width, height, scaleFactor: 1 });
}

module.exports = { decodePortalFrame };
