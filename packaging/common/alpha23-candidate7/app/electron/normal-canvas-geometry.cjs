"use strict";

// Map one Electron display from the logical desktop into a full Star Citizen window frame.
// Return null when the source already represents one display and does not need a crop.
function normalCanvasDisplayCrop({ sourceSize, displayBounds, displays, canvasWidth, canvasHeight }) {
  const width = Math.max(0, Math.round(Number(sourceSize?.width) || 0));
  const height = Math.max(0, Math.round(Number(sourceSize?.height) || 0));
  const bounds = displayBounds || {};
  if (width < 8 || height < 8) throw new Error("normal canvas source is smaller than 8x8");
  if (width <= Number(bounds.width) * 1.1 && height <= Number(bounds.height) * 1.1) return null;
  if (!Array.isArray(displays) || !displays.length) throw new Error("normal canvas display inventory is empty");

  const left = Math.min(...displays.map((item) => Number(item.bounds.x)));
  const top = Math.min(...displays.map((item) => Number(item.bounds.y)));
  const right = Math.max(...displays.map((item) => Number(item.bounds.x) + Number(item.bounds.width)));
  const bottom = Math.max(...displays.map((item) => Number(item.bounds.y) + Number(item.bounds.height)));
  const logicalWidth = Math.max(1, Number(canvasWidth) || right - left);
  const logicalHeight = Math.max(1, Number(canvasHeight) || bottom - top);
  const sx = width / logicalWidth;
  const sy = height / logicalHeight;
  const crop = {
    x: Math.max(0, Math.round((Number(bounds.x) - left) * sx)),
    y: Math.max(0, Math.round((Number(bounds.y) - top) * sy)),
    width: Math.max(8, Math.round(Number(bounds.width) * sx)),
    height: Math.max(8, Math.round(Math.min(Number(bounds.height), logicalHeight) * sy)),
  };
  crop.width = Math.min(crop.width, width - crop.x);
  crop.height = Math.min(crop.height, height - crop.y);
  if (crop.width < 8 || crop.height < 8) {
    throw new Error(`normal canvas display crop is invalid: ${JSON.stringify(crop)} from ${width}x${height}`);
  }
  return crop;
}

module.exports = { normalCanvasDisplayCrop };
