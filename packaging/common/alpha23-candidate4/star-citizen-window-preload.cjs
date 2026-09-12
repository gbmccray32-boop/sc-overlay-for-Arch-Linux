"use strict";

// ARCHVERSE_ALPHA23_ISOLATED_WINDOW_CAPTURE_RENDERER

const fs = require("node:fs");
const path = require("node:path");
const { ipcRenderer } = require("electron");

let video = null;
let canvas = null;
let context = null;
let outputDirectory = "";
let sourceName = "Star Citizen";
let sequence = 0;
let lastVideoTime = -1;
let lastVideoAdvanceAt = 0;
let busy = false;

function reportError(id, error) {
  ipcRenderer.send("archverse-window-stream:error", { id, error: String(error?.message || error) });
}

ipcRenderer.on("archverse-window-stream:init", async (_event, config) => {
  try {
    outputDirectory = String(config?.outputDirectory || "");
    sourceName = String(config?.sourceName || "Star Citizen");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: String(config?.sourceId || ""),
          minFrameRate: 4,
          maxFrameRate: 8,
        },
      },
    });
    video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    await new Promise((resolve, reject) => {
      if (video.videoWidth > 0 && video.videoHeight > 0) return resolve();
      const timer = setTimeout(() => reject(new Error("Star Citizen MediaStream supplied no video dimensions")), 5000);
      video.addEventListener("loadedmetadata", () => { clearTimeout(timer); resolve(); }, { once: true });
    });
    canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    lastVideoTime = video.currentTime;
    lastVideoAdvanceAt = Date.now();
    ipcRenderer.send("archverse-window-stream:ready", {
      sourceName,
      width: canvas.width,
      height: canvas.height,
    });
  } catch (error) {
    reportError(0, error);
  }
});

ipcRenderer.on("archverse-window-stream:capture", async (_event, request) => {
  const id = Number(request?.id);
  if (busy) return reportError(id, new Error("capture renderer is busy"));
  busy = true;
  try {
    if (!video || !canvas || !context || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      throw new Error("Star Citizen MediaStream is not ready");
    }
    const currentVideoTime = Number(video.currentTime) || 0;
    if (currentVideoTime > lastVideoTime + 0.0001) {
      lastVideoTime = currentVideoTime;
      lastVideoAdvanceAt = Date.now();
    } else if (Date.now() - lastVideoAdvanceAt > 1500) {
      throw new Error("Star Citizen MediaStream frame is stale for more than 1500ms");
    }
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("canvas PNG encoding failed")), "image/png");
    });
    const bytes = Buffer.from(await blob.arrayBuffer());
    sequence += 1;
    const slot = sequence % 3;
    const finalPath = path.join(outputDirectory, `frame-${slot}.png`);
    const temporaryPath = path.join(outputDirectory, `frame-${slot}.tmp-${process.pid}`);
    fs.writeFileSync(temporaryPath, bytes, { mode: 0o600 });
    fs.renameSync(temporaryPath, finalPath);
    ipcRenderer.send("archverse-window-stream:frame", {
      id,
      path: finalPath,
      width: canvas.width,
      height: canvas.height,
      sourceName,
      sequence,
      videoTime: currentVideoTime,
      capturedAt: Date.now(),
    });
  } catch (error) {
    reportError(id, error);
  } finally {
    busy = false;
  }
});
