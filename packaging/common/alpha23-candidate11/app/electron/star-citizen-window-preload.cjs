"use strict";

// ARCHVERSE_ALPHA23_ISOLATED_WINDOW_CAPTURE_RENDERER

const fs = require("node:fs");
const path = require("node:path");
const { ipcRenderer } = require("electron");
const { encodeWindowFrame } = require("./window-frame-encoder.cjs");

let video = null;
let canvas = null;
let context = null;
let outputDirectory = "";
let sourceName = "Star Citizen";
let transport = "electron-x11-window-stream";
let sequence = 0;
let lastVideoTime = -1;
let lastVideoAdvanceAt = 0;
let busy = false;
let videoTrack = null;
let lastDiagnosticAt = -Infinity;
let diagnosticFrames = 0;
let diagnosticMax = {};

function reportStages(stages, force = false) {
  diagnosticFrames += 1;
  for (const [name, value] of Object.entries(stages)) diagnosticMax[name] = Math.max(diagnosticMax[name] || 0, Number(value) || 0);
  if (!force && Date.now() - lastDiagnosticAt < 10000) return;
  ipcRenderer.send("archverse-window-stream:diagnostic", {
    stage: "frame-summary", frames: diagnosticFrames, maxMs: diagnosticMax,
    videoReadyState: video?.readyState, trackReadyState: videoTrack?.readyState,
  });
  lastDiagnosticAt = Date.now();
  diagnosticFrames = 0;
  diagnosticMax = {};
}

function reportError(id, error) {
  ipcRenderer.send("archverse-window-stream:error", { id, error: String(error?.message || error) });
}

ipcRenderer.on("archverse-window-stream:init", async (_event, config) => {
  try {
    outputDirectory = String(config?.outputDirectory || "");
    transport = String(config?.transport || "electron-x11-window-stream");
    if (!window.isSecureContext || typeof navigator.mediaDevices?.getDisplayMedia !== "function") {
      throw new Error(`display media unavailable before portal request: secure=${window.isSecureContext} origin=${location.protocol}`);
    }
    ipcRenderer.send("archverse-window-stream:diagnostic", { secure: window.isSecureContext, origin: location.protocol, displayMedia: true });
    // getDisplayMedia enters Electron's display-media handler. On KDE Wayland the handler's
    // WINDOW enumeration uses the XDG ScreenCast portal and returns a PipeWire MediaStream.
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: false,
      // Screen-capture requests reject min/exact constraints before source selection.
      video: { frameRate: { ideal: 8, max: 12 } },
    });
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error("portal PipeWire capture returned no video track");
    videoTrack = track;
    track.addEventListener("ended", () => {
      ipcRenderer.send("archverse-window-stream:error", { id: 0, terminal: true, error: "approved video track ended" });
    }, { once: true });
    sourceName = String(track.label || "Star Citizen portal window");
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
    if (video.videoWidth * video.videoHeight > 16000000) throw new Error("approved window exceeds 16 million pixel capture budget");
    canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    lastVideoTime = video.currentTime;
    lastVideoAdvanceAt = Date.now();
    ipcRenderer.send("archverse-window-stream:ready", {
      sourceName,
      transport,
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
  const startedAt = performance.now();
  let stage = "video-readiness";
  const stages = {};
  const slowTimer = setTimeout(() => {
    if (Date.now() - lastDiagnosticAt < 10000) return;
    ipcRenderer.send("archverse-window-stream:diagnostic", {
      stage, inFlight: true, elapsedMs: performance.now() - startedAt,
      videoReadyState: video?.readyState, trackReadyState: videoTrack?.readyState,
    });
    lastDiagnosticAt = Date.now();
  }, 650);
  try {
    if (!video || !canvas || !context || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      throw new Error("Star Citizen MediaStream is not ready");
    }
    const currentVideoTime = Number(video.currentTime) || 0;
    if (currentVideoTime > lastVideoTime + 0.0001) {
      lastVideoTime = currentVideoTime;
      lastVideoAdvanceAt = Date.now();
    } else if (Date.now() - lastVideoAdvanceAt > 1500) {
      // A paused or static source can repeat media time while the approved track remains alive.
      // The Mining distinct-frame guard still rejects identical videoTime tokens.
      reportStages({ videoNotAdvancedMs: Date.now() - lastVideoAdvanceAt });
    }
    if (video.videoWidth * video.videoHeight > 16000000) throw new Error("approved window exceeds 16 million pixel capture budget");
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context = canvas.getContext("2d", { alpha: false, desynchronized: true });
    }
    stage = "draw";
    const drawAt = performance.now();
    const capturedAt = Date.now();
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    stages.draw = performance.now() - drawAt;
    stage = "pixel-read";
    const pixelAt = performance.now();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    stages.pixelRead = performance.now() - pixelAt;
    stage = "png-encode";
    const encodeAt = performance.now();
    const bytes = await encodeWindowFrame(pixels.data, canvas.width, canvas.height);
    stages.pngEncode = performance.now() - encodeAt;
    sequence += 1;
    const slot = sequence % 3;
    const finalPath = path.join(outputDirectory, `frame-${slot}.png`);
    const temporaryPath = path.join(outputDirectory, `frame-${slot}.tmp-${process.pid}`);
    stage = "file-write";
    const writeAt = performance.now();
    fs.writeFileSync(temporaryPath, bytes, { mode: 0o600 });
    fs.renameSync(temporaryPath, finalPath);
    stages.fileWrite = performance.now() - writeAt;
    stages.total = performance.now() - startedAt;
    reportStages(stages);
    ipcRenderer.send("archverse-window-stream:frame", {
      id,
      path: finalPath,
      width: canvas.width,
      height: canvas.height,
      sourceName,
      transport,
      sequence,
      videoTime: currentVideoTime,
      capturedAt,
      stages,
    });
  } catch (error) {
    stages.total = performance.now() - startedAt;
    reportStages(stages);
    reportError(id, new Error(`${stage}: ${error?.message || error}`));
  } finally {
    clearTimeout(slowTimer);
    busy = false;
  }
});
