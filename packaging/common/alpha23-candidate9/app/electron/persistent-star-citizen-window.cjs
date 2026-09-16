"use strict";

// ARCHVERSE_ALPHA23_ISOLATED_WINDOW_CAPTURE_PARENT
// A separate Electron process owns Wine/XWayland source discovery and the MediaStream. KDE may
// block desktopCapturer.getSources for several seconds; that delay must never freeze the overlay.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const REQUEST_TIMEOUT_MS = 700;
const START_RETRY_MS = 10000;

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
  let latestFrame = null;
  let deliveredSequence = 0;
  let lastDeadlineLogAt = -Infinity;
  let closed = false;
  let stdoutBuffer = "";
  let stderrTail = "";
  let disabledSessionKey = "";
  let initializationError = "";

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
    const priorTransport = ready?.transport;
    child = null;
    ready = null;
    latestFrame = null;
    stdoutBuffer = "";
    settlePending(new Error(`Star Citizen window capture helper ${reason}`));
    if (prior && priorTransport === "portal-pipewire-window" && reason !== "rebound to a new game session" && reason !== "closed" && disabledSessionKey !== sessionKey) disableSession(reason);
    if (!prior) return;
    prior.expectedExit = true;
    try { prior.kill("SIGTERM"); } catch {}
  }

  function disableSession(reason) {
    disabledSessionKey = sessionKey;
    initializationError = String(reason || "capture session ended");
    restartAfter = Number.POSITIVE_INFINITY;
    logger.warn?.(`[window-stream] capture ended: ${initializationError}; disabled for this Star Citizen process`);
  }

  function acceptMessage(message) {
    if (!message || typeof message !== "object") return;
    if (message.type === "diagnostic") {
      // The renderer emits bounded summaries, never captured pixels or unbounded source lists.
      logger.log?.(`[window-stream] frame stages ${JSON.stringify(message).slice(0, 700)}`);
      return;
    }
    if (message.type === "ready") {
      ready = message;
      initializationError = "";
      logger.log?.(`[window-stream] ${message.transport || "window"} ready source="${message.sourceName || "Star Citizen"}" ${message.width}x${message.height}`);
      return;
    }
    if (message.type === "error" && (Number(message.id) === 0 || message.terminal)) {
      disableSession(message.error);
      stop("terminated stream");
      return;
    }
    if (!pending || Number(message.id) !== pending.id) return;
    if (message.type === "error") {
      settlePending(new Error(message.error || "window capture helper failed"));
      // Slow, repeated, or temporarily unavailable frames do not revoke portal approval.
      return;
    }
    if (message.type !== "frame") return;
    if (pending.timedOut) latestFrame = message;
    settlePending(null, message);
  }

  function start(wantedSessionKey, gameWindowId) {
    if (closed) throw new Error("Star Citizen window capture is closed");
    if (disabledSessionKey && disabledSessionKey !== wantedSessionKey) {
      disabledSessionKey = "";
      initializationError = "";
      restartAfter = 0;
    }
    if (disabledSessionKey === wantedSessionKey) {
      throw new Error(`Star Citizen portal window capture is disabled for this session: ${initializationError || "initialization failed"}`);
    }
    if (child && sessionKey === wantedSessionKey) return;
    if (child) stop("rebound to a new game session");
    if (now() < restartAfter) throw new Error(`Star Citizen window capture helper retry in ${restartAfter - now()}ms`);
    fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
    const env = { ...process.env, ARCHVERSE_CAPTURE_HELPER: "1" };
    delete env.ELECTRON_RUN_AS_NODE;
    const targetWindowId = /^\d+$/.test(String(gameWindowId || "")) ? String(gameWindowId) : "";
    const proc = spawner(electronPath, [helperPath, outputDirectory, targetWindowId], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env,
    });
    proc.expectedExit = false;
    child = proc;
    sessionKey = wantedSessionKey;
    latestFrame = null;
    deliveredSequence = 0;
    ready = null;
    stdoutBuffer = "";
    stderrTail = "";
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
    proc.stderr?.on("data", (chunk) => { if (child === proc) stderrTail = (stderrTail + String(chunk || "")).slice(-1000); });
    proc.once("error", (error) => {
      if (child !== proc) return;
      child = null;
      ready = null;
      disableSession(`helper spawn failed: ${error.message}`);
      settlePending(error);
    });
    proc.once("exit", (code, signal) => {
      if (child !== proc) return;
      child = null;
      ready = null;
      const detail = stderrTail.trim().slice(-300);
      const message = `Star Citizen window capture helper exited${signal ? ` on ${signal}` : ` with code ${code}`}${detail ? `: ${detail}` : ""}`;
      if (disabledSessionKey !== sessionKey) disableSession(message);
      settlePending(new Error(message));
      if (!proc.expectedExit && !closed && !initializationError) logger.warn?.(`[window-stream] ${message}; monitor fallback remains active`);
    });
  }

  async function capture({ gamePid, gameStartTicks, gameWindowId } = {}) {
    const targetWindowId = /^\d+$/.test(String(gameWindowId || "")) ? String(gameWindowId) : "";
    if (!Number.isSafeInteger(Number(gamePid)) || Number(gamePid) <= 0 || !/^\d+$/.test(String(gameStartTicks || ""))) {
      throw new Error("Star Citizen capture requires an exact PID and process start time");
    }
    // KDE may rediscover a different XID while the approved game process stays alive.
    const wantedSessionKey = `${Number(gamePid)}:${String(gameStartTicks)}`;
    start(wantedSessionKey, targetWindowId);
    if (!ready) throw new Error("Star Citizen portal PipeWire stream is warming while waiting for window selection");
    if (latestFrame) {
      const cached = latestFrame;
      latestFrame = null;
      const age = now() - Number(cached.capturedAt);
      if (age >= 0 && age <= 1500 && Number(cached.sequence) > deliveredSequence) {
        deliveredSequence = Number(cached.sequence);
        return cached;
      }
    }
    if (pending) throw new Error("Star Citizen window stream already has one frame request in flight");
    const id = nextRequestId++;
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!pending || pending.id !== id) return;
        pending.timedOut = true;
        // Keep the wire request occupied until its reply arrives. This bounds renderer work and
        // lets a late frame be consumed by the next probe without reopening KDE's selector.
        reject(new Error(`Star Citizen window stream frame exceeded ${requestTimeoutMs}ms; approved session retained`));
        if (now() - lastDeadlineLogAt >= 10000) {
          lastDeadlineLogAt = now();
          logger.warn?.(`[window-stream] frame deadline ${requestTimeoutMs}ms; approved session retained, awaiting reply id=${id}`);
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
    deliveredSequence = Number(frame.sequence) || deliveredSequence;
    return frame;
  }

  function close() {
    closed = true;
    stop("closed");
  }

  return { capture, close, stop };
}

module.exports = { createPersistentStarCitizenWindowCapture, __test: { REQUEST_TIMEOUT_MS, START_RETRY_MS } };
