"use strict";

// ARCHVERSE_LINUX_MINING_OCR_RECOVERY
// A Mining timeout discards the stalled worker and the stale frame. The next request starts a
// clean worker. Other callers retain the prior fail-closed session-disable behavior by default.

const { fork } = require("node:child_process");
const path = require("node:path");

function asError(value) {
  return value instanceof Error ? value : new Error(String(value || "RapidOCR worker failure"));
}

function createRapidOcrClient({
  workerPath = path.join(__dirname, "rapidocr-worker.cjs"),
  nodePath = process.env.SC_TRACKER_NODE_BIN || "node",
  timeoutMs = Number(process.env.SC_TRACKER_RAPIDOCR_TIMEOUT_MS) || 15_000,
  maxQueue = Math.max(1, Number(process.env.SC_TRACKER_RAPIDOCR_MAX_QUEUE) || 2),
  logger = console,
  inheritStdio = true,
  restartOnFailure = false,
} = {}) {
  let worker = null;
  let generation = 0;
  let nextId = 1;
  let disabledError = null;
  let closing = false;
  let tail = Promise.resolve();
  let queued = 0;
  let restarts = 0;
  const pending = new Map();

  function disable(error) {
    if (!disabledError) disabledError = asError(error);
    return disabledError;
  }

  function requestFailure(error) {
    return restartOnFailure ? asError(error) : disable(error);
  }

  function rejectGeneration(record, error) {
    const reason = asError(error);
    for (const [id, request] of pending) {
      if (request.generation !== record.generation) continue;
      pending.delete(id);
      clearTimeout(request.timer);
      request.reject(reason);
    }
  }

  function detach(record) {
    if (worker === record) worker = null;
  }

  function spawnWorker() {
    if (disabledError) throw disabledError;
    if (worker?.child?.connected && worker.exited !== true) return worker;

    let readyResolve;
    let readyReject;
    const ready = new Promise((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    const child = fork(workerPath, [], {
      execPath: nodePath,
      env: {
        ...process.env,
        SC_TRACKER_OCR_THREADS: process.env.SC_TRACKER_OCR_THREADS || "2",
        OMP_THREAD_LIMIT: process.env.OMP_THREAD_LIMIT || "1",
        OMP_NUM_THREADS: process.env.OMP_NUM_THREADS || "1",
        MAGICK_THREAD_LIMIT: process.env.MAGICK_THREAD_LIMIT || "1",
        VIPS_CONCURRENCY: process.env.VIPS_CONCURRENCY || "1",
        MALLOC_ARENA_MAX: process.env.MALLOC_ARENA_MAX || "2",
      },
      stdio: inheritStdio ? ["ignore", "inherit", "inherit", "ipc"] : ["ignore", "ignore", "ignore", "ipc"],
      serialization: "json",
    });
    const record = {
      child,
      generation: ++generation,
      ready,
      readyResolve,
      readyReject,
      readySettled: false,
      exited: false,
      timedOut: false,
    };
    worker = record;

    child.on("message", (message) => {
      if (!message || typeof message !== "object") return;
      if (message.type === "ready") {
        if (!record.readySettled) {
          record.readySettled = true;
          record.readyResolve();
        }
        return;
      }
      if (!Number.isInteger(message.id)) return;
      const request = pending.get(message.id);
      if (!request || request.generation !== record.generation) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.type === "result") request.resolve(message.result);
      else request.reject(new Error(String(message.error || "RapidOCR worker request failed")));
    });

    child.once("error", (error) => {
      record.exited = true;
      detach(record);
      const reason = requestFailure(error);
      if (!record.readySettled) {
        record.readySettled = true;
        record.readyReject(reason);
      }
      rejectGeneration(record, reason);
    });

    child.once("exit", (code, signal) => {
      record.exited = true;
      detach(record);
      const detail = `RapidOCR worker exited${signal ? ` on ${signal}` : ` with code ${code}`}`;
      const reason = closing ? new Error(detail) : requestFailure(new Error(detail));
      if (!record.readySettled) {
        record.readySettled = true;
        record.readyReject(reason);
      }
      rejectGeneration(record, reason);
      if (!closing && !record.timedOut) {
        if (restartOnFailure) {
          restarts += 1;
          logger.warn?.(`[ocr-worker] ${detail}; the next fresh frame will start a replacement worker`);
        } else {
          logger.error?.(`[ocr-worker] ${reason.message}; Tesseract fallback remains active`);
        }
      }
    });

    return record;
  }

  async function requestDetect(imagePath) {
    if (disabledError) throw disabledError;
    const record = spawnWorker();
    await record.ready;
    if (disabledError) throw disabledError;
    if (record.exited || !record.child.connected || worker !== record) {
      throw requestFailure(new Error("RapidOCR worker IPC disconnected before detection"));
    }

    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const request = pending.get(id);
        if (!request) return;
        pending.delete(id);
        record.timedOut = true;
        detach(record);
        const timeoutError = requestFailure(new Error(`RapidOCR worker timed out after ${timeoutMs}ms`));
        request.reject(timeoutError);
        try { record.child.kill("SIGKILL"); } catch {}
        if (restartOnFailure && !closing) {
          restarts += 1;
          logger.warn?.(`[ocr-worker] ${timeoutError.message}; discarded stale frame and restarting on demand`);
        }
      }, timeoutMs);
      timer.unref?.();
      pending.set(id, { resolve, reject, timer, generation: record.generation });
      try {
        record.child.send({ type: "detect", id, path: path.resolve(imagePath) });
      } catch (error) {
        pending.delete(id);
        clearTimeout(timer);
        detach(record);
        reject(requestFailure(error));
        try { record.child.kill("SIGKILL"); } catch {}
      }
    });
  }

  function detect(imagePath) {
    if (queued >= maxQueue) {
      return Promise.reject(new Error(`RapidOCR latest-frame queue is full (${queued}/${maxQueue})`));
    }
    queued += 1;
    const run = tail.then(() => requestDetect(imagePath), () => requestDetect(imagePath));
    const settled = run.finally(() => { queued = Math.max(0, queued - 1); });
    tail = settled.catch(() => {});
    return settled;
  }

  function close() {
    closing = true;
    const record = worker;
    worker = null;
    if (record) {
      rejectGeneration(record, new Error("RapidOCR worker is shutting down"));
      try { record.child.kill("SIGTERM"); } catch {}
    }
  }

  return {
    detect,
    close,
    queueDepth: () => queued,
    disabledReason: () => disabledError?.message || null,
    restartCount: () => restarts,
  };
}

module.exports = { createRapidOcrClient };
