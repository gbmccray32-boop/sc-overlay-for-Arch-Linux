import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fork } from "node:child_process";
import { portRapidOcrWorkerShutdown } from "../packaging/common/port-rapidocr-worker-shutdown.mjs";

const baselineWorker = `"use strict";
const os = require("node:os");
const OCR_THREADS = Math.max(1, Math.min(2, Number(process.env.SC_TRACKER_OCR_THREADS) || 2));
try { os.setPriority(0, 10); } catch {}
let ocrPromise = null;
function getOcr() {
  if (!ocrPromise) {
    ocrPromise = import("@gutenye/ocr-node").then((module) => module.default.create({
      onnxOptions: { intraOpNumThreads: OCR_THREADS },
    }));
  }
  return ocrPromise;
}
function errorText(error) {
  if (error instanceof Error) return error.stack || error.message;
  return String(error || "unknown RapidOCR worker error");
}
process.on("message", async (message) => {
  if (!message || message.type !== "detect" || !Number.isInteger(message.id)) return;
  try {
    const ocr = await getOcr();
    const result = await ocr.detect(String(message.path || ""));
    if (process.connected) process.send({ type: "result", id: message.id, result });
  } catch (error) {
    if (process.connected) process.send({ type: "error", id: message.id, error: errorText(error) });
  }
});
process.on("disconnect", () => process.exit(0));
if (process.connected) process.send({ type: "ready" });
`;

const patched = portRapidOcrWorkerShutdown(baselineWorker);
assert.match(patched, /process\.on\("error", handleIpcError\)/);
assert.match(patched, /process\.send\(message, \(error\) =>/);
assert.doesNotMatch(patched, /if \(process\.connected\) process\.send/);

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "archverse-rapidocr-shutdown-"));
const workerPath = path.join(temporary, "rapidocr-worker.cjs");
const moduleRoot = path.join(temporary, "node_modules", "@gutenye", "ocr-node");
fs.mkdirSync(moduleRoot, { recursive: true });
fs.writeFileSync(path.join(moduleRoot, "package.json"), JSON.stringify({ type: "module", main: "index.js" }));
fs.writeFileSync(path.join(moduleRoot, "index.js"), `export default {
  create: async () => ({ detect: async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return [{ text: "late result" }];
  } }),
};\n`);
fs.writeFileSync(workerPath, patched);

let stderr = "";
const child = fork(workerPath, [], { silent: true });
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => { stderr += chunk; });
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("RapidOCR worker did not become ready")), 3000);
  child.once("error", reject);
  child.on("message", (message) => {
    if (message?.type !== "ready") return;
    clearTimeout(timer);
    resolve();
  });
});
child.send({ type: "detect", id: 1, path: "/tmp/late-frame.png" });
child.disconnect();
const exit = await new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
assert.deepEqual(exit, { code: 0, signal: null });
assert.doesNotMatch(stderr, /EPIPE|Unhandled 'error' event/);

fs.rmSync(temporary, { recursive: true, force: true });
console.log("RapidOCR worker shutdown test: passed");
