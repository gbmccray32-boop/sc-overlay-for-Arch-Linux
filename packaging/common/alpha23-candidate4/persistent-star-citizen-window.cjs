"use strict";

// ARCHVERSE_ALPHA23_ISOLATED_WINDOW_CAPTURE_PARENT
// A separate Electron process owns Wine/XWayland source discovery and the MediaStream. KDE may
// block desktopCapturer.getSources for several seconds; that delay must never freeze the overlay.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const REQUEST_TIMEOUT_MS = 700;
const START_RETRY_MS = 2000;

function createPersistentStarCitizenWindowCapture({
  logger = console,
  spawner = spawn,
  now = Date.now,
  electronPath = process.execPath,
  helperPath = path.join(__dirname, "star-citizen-window-helper.cjs"),
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  const outputDirectory = path.join(os.tmpdir(), `archverse-sc-window-stream-${process.pid}`);
  let child = null;
  let ready = null;
  let sessionKey = "";
  let nextRequestId = 1;
  let pending = null;
  let restartAfter = 0;
  let consecutiveFailures = 0;
  let closed = false;
  let stdoutBuffer = "";
  let stderrTail = "";

  function settlePending(error, value) {
    const request = pending;
    pending = null;
    if (!request) return;
    clearTimeout(request.timer);
    if (error) request.reject(error);
    else request.resolve(value);
  }

  function stop(reason = "stopped") {
    const prior = child;
    child = null;
    ready = null;
    stdoutBuffer = "";
    settlePending(new Error(`Star Citizen window capture helper ${reason}`));
    if (!prior) return;
    prior.expectedExit = true;
    try { prior.kill("SIGTERM"); } catch {}
  }

  function acceptMessage(message) {
    if (!message || typeof message !== "object") return;
    if (message.type === "ready") {
      ready = message;
      consecutiveFailures = 0;
      logger.log?.(`[window-stream] ready source="${message.sourceName || "Star Citizen"}" ${message.width}x${message.height}`);
      return;
    }
    if (message.type !== "frame" && message.type !== "error") return;
    if (!pending || Number(message.id) !== pending.id) return;
    if (message.type === "error") {
      const error = new Error(message.error || "window capture helper failed");
      consecutiveFailures += 1;
      settlePending(error);
      if (/stale/i.test(error.message) || consecutiveFailures >= 2) {
        restartAfter = now() + START_RETRY_MS;
        stop("restarted after unhealthy frames");
      }
      return;
    }
    settlePending(null, message);
  }

  function start(wantedSessionKey) {
    if (closed) throw new Error("Star Citizen window capture is closed");
    if (child && sessionKey === wantedSessionKey) return;
    if (child) stop("rebound to a new game session");
    if (now() < restartAfter) throw new Error(`Star Citizen window capture helper retry in ${restartAfter - now()}ms`);
    fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
    const env = { ...process.env, ARCHVERSE_CAPTURE_HELPER: "1" };
    delete env.ELECTRON_RUN_AS_NODE;
    const proc = spawner(electronPath, [helperPath, outputDirectory], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env,
    });
    proc.expectedExit = false;
    child = proc;
    sessionKey = wantedSessionKey;
    ready = null;
    stdoutBuffer = "";
    proc.stdout?.setEncoding("utf8");
    proc.stdout?.on("data", (chunk) => {
      if (child !== proc) return;
      stdoutBuffer += String(chunk || "");
      for (;;) {
        const newline = stdoutBuffer.indexOf("\n");
        if (newline < 0) break;
        const line = stdoutBuffer.slice(0, newline).trim();
        stdoutBuffer = stdoutBuffer.slice(newline + 1);
        if (!line) continue;
        try { acceptMessage(JSON.parse(line)); }
        catch { logger.warn?.(`[window-stream] ignored malformed helper message: ${line.slice(0, 160)}`); }
      }
    });
    proc.stderr?.setEncoding("utf8");
    proc.stderr?.on("data", (chunk) => { stderrTail = (stderrTail + String(chunk || "")).slice(-1000); });
    proc.once("error", (error) => {
      if (child !== proc) return;
      child = null;
      ready = null;
      restartAfter = now() + START_RETRY_MS;
      settlePending(error);
    });
    proc.once("exit", (code, signal) => {
      if (child !== proc) return;
      child = null;
      ready = null;
      restartAfter = now() + START_RETRY_MS;
      const detail = stderrTail.trim().slice(-300);
      settlePending(new Error(`Star Citizen window capture helper exited${signal ? ` on ${signal}` : ` with code ${code}`}${detail ? `: ${detail}` : ""}`));
      if (!proc.expectedExit && !closed) logger.warn?.("[window-stream] helper exited; monitor fallback remains active");
    });
  }

  async function capture({ gamePid, gameStartTicks } = {}) {
    const wantedSessionKey = `${Number(gamePid) || 0}:${String(gameStartTicks || "")}`;
    start(wantedSessionKey);
    if (!ready) throw new Error("Star Citizen window stream is warming in an isolated helper");
    if (pending) throw new Error("Star Citizen window stream already has one frame request in flight");
    const id = nextRequestId++;
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!pending || pending.id !== id) return;
        pending = null;
        consecutiveFailures += 1;
        reject(new Error(`Star Citizen window stream frame exceeded ${requestTimeoutMs}ms`));
        if (consecutiveFailures >= 2) {
          restartAfter = now() + START_RETRY_MS;
          stop("restarted after two frame deadlines");
        }
      }, requestTimeoutMs);
      timer.unref?.();
      pending = { id, timer, resolve, reject };
    });
    try {
      child.stdin.write(`${JSON.stringify({ type: "capture", id })}\n`);
    } catch (error) {
      settlePending(error);
    }
    const frame = await result;
    consecutiveFailures = 0;
    return frame;
  }

  function close() {
    closed = true;
    stop("closed");
  }

  return { capture, close, stop };
}

module.exports = { createPersistentStarCitizenWindowCapture, __test: { REQUEST_TIMEOUT_MS, START_RETRY_MS } };
