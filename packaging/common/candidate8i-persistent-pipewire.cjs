"use strict";

// ARCHVERSE_LINUX_GAMESCOPE_PIPEWIRE_PERSISTENT_STREAM
// Keep one direct PipeWire subscription alive for the bound Gamescope process. The prior helper
// started gst-launch, negotiated an 8 MP stream, encoded one PNG, and exited for every OCR tick.
// This producer performs that setup once and retains only a few newest completed frames.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile, spawn } = require("node:child_process");
const {
  parsePwDump,
  selectGamescopeNode,
  parseEnumFormat,
  computeDisplayCrop,
} = require("./native-linux-gamescope-pipewire.cjs");

const STREAM_FPS = 3;
const FRAME_MAX_AGE_MS = 1500;
const FIRST_FRAME_TIMEOUT_MS = 3000;

function runFile(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || stdout || error.message || error).trim();
        const wrapped = new Error(detail || String(error));
        wrapped.code = error.code;
        reject(wrapped);
        return;
      }
      resolve({ stdout: String(stdout || ""), stderr: String(stderr || "") });
    });
  });
}

function numericPid(value) {
  const number = Number(String(value ?? "").trim());
  return Number.isInteger(number) && number > 1 ? number : null;
}

function streamArgs(nodeId, frame, crop, outputPattern, fps = STREAM_FPS) {
  const right = Math.max(0, frame.width - crop.x - crop.width);
  const bottom = Math.max(0, frame.height - crop.y - crop.height);
  return [
    "-q",
    "pipewiresrc", `path=${nodeId}`, "do-timestamp=true", "!",
    `video/x-raw,format=BGRx,width=${frame.width},height=${frame.height}`, "!",
    "queue", "leaky=downstream", "max-size-buffers=1", "!",
    "videocrop", `left=${crop.x}`, `right=${right}`, `top=${crop.y}`, `bottom=${bottom}`, "!",
    "videorate", "drop-only=true", "!", `video/x-raw,framerate=${fps}/1`, "!",
    "videoconvert", "!", "pngenc", "compression-level=1", "snapshot=false", "!",
    "multifilesink", `location=${outputPattern}`, "max-files=4", "sync=false",
  ];
}

function listFrames(directory) {
  let names;
  try { names = fs.readdirSync(directory); }
  catch { return []; }
  const frames = [];
  for (const name of names) {
    if (!/^frame-\d+\.png$/.test(name)) continue;
    const file = path.join(directory, name);
    try {
      const stat = fs.statSync(file);
      if (stat.isFile() && stat.size > 0) frames.push({ path: file, size: stat.size, mtimeMs: stat.mtimeMs });
    } catch {}
  }
  frames.sort((left, right) => right.mtimeMs - left.mtimeMs || right.path.localeCompare(left.path));
  return frames;
}

function newestCompletedFrame(directory, now = Date.now(), maxAgeMs = FRAME_MAX_AGE_MS) {
  const frames = listFrames(directory).filter((frame) => now - frame.mtimeMs <= maxAgeMs);
  // multifilesink closes one file before it opens the next. Once two files exist, the prior file
  // cannot still be changing. Prefer it over racing the PNG encoder on the newest pathname.
  return frames.length >= 2 ? frames[1] : frames[0] || null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createPersistentGamescopePipeWireCapture({
  logger = console,
  runner = runFile,
  spawner = spawn,
  now = Date.now,
  streamFps = STREAM_FPS,
} = {}) {
  let cached = null;
  let stream = null;
  let lastLogKey = "";
  let closed = false;
  const streamDirectory = path.join(os.tmpdir(), `archverse-gamescope-stream-${process.pid}`);

  async function discover(gamescopePid) {
    const wantedPid = numericPid(gamescopePid);
    if (cached && cached.gamescopePid === wantedPid) return cached;
    const dump = await runner("pw-dump", [], { timeout: 3500, maxBuffer: 16 * 1024 * 1024 });
    const node = selectGamescopeNode(parsePwDump(dump.stdout), wantedPid);
    const formats = await runner("pw-cli", ["enum-params", String(node.id), "EnumFormat"], {
      timeout: 3500,
      maxBuffer: 4 * 1024 * 1024,
    });
    const frame = parseEnumFormat(formats.stdout);
    cached = { gamescopePid: wantedPid, node, frame, at: now() };
    return cached;
  }

  function stopStream(reason = "stopped") {
    const prior = stream;
    stream = null;
    if (!prior) return;
    prior.stopping = true;
    try { prior.child.kill("SIGTERM"); } catch {}
    logger.log?.(`[gamescope-pipewire] persistent stream ${reason}`);
  }

  function clearFrames() {
    fs.mkdirSync(streamDirectory, { recursive: true, mode: 0o700 });
    for (const frame of listFrames(streamDirectory)) {
      try { fs.unlinkSync(frame.path); } catch {}
    }
  }

  function startStream(info, crop) {
    if (closed) throw new Error("Gamescope PipeWire capture is closed");
    const key = `${info.node.id}:${info.node.pid || "?"}:${info.frame.width}x${info.frame.height}:` +
      `${crop.x},${crop.y},${crop.width},${crop.height}:${crop.mapping}:${streamFps}`;
    if (stream?.key === key && stream.child && stream.exited !== true) return stream;
    if (stream) stopStream("reconfigured");
    clearFrames();
    const outputPattern = path.join(streamDirectory, "frame-%09d.png");
    const child = spawner("gst-launch-1.0", streamArgs(info.node.id, info.frame, crop, outputPattern, streamFps), {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    const record = {
      key,
      child,
      startedAt: now(),
      exited: false,
      stopping: false,
      exitCode: null,
      exitSignal: null,
      stderr: "",
    };
    stream = record;
    child.stderr?.on("data", (chunk) => {
      record.stderr = (record.stderr + String(chunk || "")).slice(-4096);
    });
    child.once("error", (error) => {
      record.exited = true;
      record.stderr = String(error?.message || error);
      if (stream === record) stream = null;
    });
    child.once("exit", (code, signal) => {
      record.exited = true;
      record.exitCode = code;
      record.exitSignal = signal;
      if (stream === record) stream = null;
      if (!record.stopping && !closed) {
        logger.warn?.(`[gamescope-pipewire] persistent stream exited${signal ? ` on ${signal}` : ` with code ${code}`}: ${record.stderr.trim().slice(-240)}`);
      }
    });
    if (key !== lastLogKey) {
      lastLogKey = key;
      logger.log?.(`[gamescope-pipewire] persistent stream node=${info.node.id} binding=${info.node.binding}` +
        ` pid=${info.node.pid || info.gamescopePid || "?"} format=BGRx frame=${info.frame.width}x${info.frame.height}` +
        ` displayCrop=${crop.width}x${crop.height}@${crop.x},${crop.y} mapping=${crop.mapping} fps=${streamFps}`);
    }
    return record;
  }

  async function waitForFrame(record) {
    const deadline = now() + FIRST_FRAME_TIMEOUT_MS;
    let oneFrame = null;
    let oneFrameSize = -1;
    while (now() < deadline) {
      const frames = listFrames(streamDirectory).filter((frame) => now() - frame.mtimeMs <= FRAME_MAX_AGE_MS);
      if (frames.length >= 2) return frames[1];
      if (frames.length === 1) {
        const candidate = frames[0];
        if (oneFrame?.path === candidate.path && oneFrameSize === candidate.size) return candidate;
        oneFrame = candidate;
        oneFrameSize = candidate.size;
      }
      if (record.exited) {
        throw new Error(`persistent Gamescope PipeWire stream exited before a frame: ${record.stderr.trim().slice(-300) || `code=${record.exitCode} signal=${record.exitSignal}`}`);
      }
      await delay(25);
    }
    throw new Error("persistent Gamescope PipeWire stream produced no completed frame within 3000ms");
  }

  async function capture({ gamescopePid, disp, displays, canvasW = null, canvasH = null }) {
    let info;
    try { info = await discover(gamescopePid); }
    catch (error) { cached = null; stopStream("discovery failed"); throw error; }
    const crop = computeDisplayCrop({
      frameW: info.frame.width,
      frameH: info.frame.height,
      disp,
      displays,
      canvasW,
      canvasH,
    });
    const record = startStream(info, crop);
    const found = newestCompletedFrame(streamDirectory, now());
    const frame = found || await waitForFrame(record);
    return {
      path: frame.path,
      node: info.node,
      frame: info.frame,
      crop,
      frameAgeMs: Math.max(0, now() - frame.mtimeMs),
      streamStartedAt: record.startedAt,
    };
  }

  async function probe(gamescopePid) {
    const info = await discover(gamescopePid);
    return { node: info.node, frame: info.frame, at: now() };
  }

  function invalidate() {
    cached = null;
    stopStream("invalidated");
  }

  function close() {
    closed = true;
    cached = null;
    stopStream("closed");
  }

  return { capture, probe, invalidate, close };
}

module.exports = {
  createPersistentGamescopePipeWireCapture,
  streamArgs,
  listFrames,
  newestCompletedFrame,
  __test: { numericPid },
};
