import { appendFile, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const root = process.argv[2];
if (!root) throw new Error("usage: candidate8i-mining-fast-path-selftest.mjs <root>");
const must = (value, message) => { if (!value) throw new Error(`Candidate 8i self-test: ${message}`); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const require = createRequire(import.meta.url);

const capture = await readFile(path.join(root, "app/electron/capture.cjs"), "utf8");
const server = await readFile(path.join(root, "app/server/server.mjs"), "utf8");
const ocr = await readFile(path.join(root, "app/electron/native-linux-ocr.cjs"), "utf8");
const pkg = JSON.parse(await readFile(path.join(root, "app/package.json"), "utf8"));
const persistent = require(path.join(root, "app/electron/persistent-gamescope-pipewire.cjs"));
const { createRapidOcrClient } = require(path.join(root, "app/electron/rapidocr-client.cjs"));
const { createMiningVehiclePresenceClient } = require(path.join(root, "app/electron/mining-vehicle-presence.cjs"));

must(pkg.version === "0.1.44-r31.alpha22.candidate8i", `wrong package version ${pkg.version}`);
for (const marker of [
  "ARCHVERSE_LINUX_GAMESCOPE_PIPEWIRE_PERSISTENT_STREAM",
  "ARCHVERSE_LINUX_MINING_OCR_PRIORITY_LANES",
  "ARCHVERSE_LINUX_MINING_EXCLUSIVE_OCR",
  "ARCHVERSE_LINUX_MINING_LATEST_FRAME_SCHEDULER",
  "ARCHVERSE_LINUX_MINING_VEHICLE_PRESENCE_STREAM",
  "ARCHVERSE_LINUX_MINING_OCR_RECOVERY",
]) must(capture.includes(marker), `capture marker missing: ${marker}`);
must(server.includes("ARCHVERSE_LINUX_MINING_CONTEXT_SAFE_RS_ADMISSION"), "context-safe RS admission missing");
must(server.includes("/api/vehicle-presence/events"), "vehicle-presence stream endpoint missing");
must(ocr.includes("ARCHVERSE_LINUX_MINING_TESSERACT_BOUNDED_FALLBACK"), "bounded Mining fallback missing");
must(capture.includes('timeoutMs: 900, restartOnFailure: true'), "Mining RapidOCR deadline/recovery changed");
must(capture.includes("tesseractTimeoutMs: 600"), "Mining Tesseract deadline changed");
must(capture.includes("stage.miningOcrRestarts = linuxOcrLaneClients.resourceSignature.restartCount()"), "Mining recovery telemetry missing");
must(capture.includes("stage.frameAge = Number.isFinite(cap.frameAgeMs)"), "capture freshness telemetry missing");
must(!capture.includes('setInterval(tick, rate)'), "dynamic interval scheduler remains");
must(!capture.includes('const LINUX_OCR_LANE_KEYS = Object.freeze(["resourceSignature", "fabricator"'), "per-feature ONNX workers remain");
must(capture.includes('!(mining && process.platform === "linux" && vehiclePresence.active === true)'), "auxiliary OCR can still compete with active Mining");

const gstArgs = persistent.streamArgs(
  174,
  { width: 6270, height: 2160 },
  { x: 1195, y: 0, width: 3786, height: 2160 },
  "/tmp/frame-%09d.png",
);
must(gstArgs.includes("pipewiresrc") && gstArgs.includes("path=174"), "persistent stream lost direct pipewiresrc identity");
must(gstArgs.includes("multifilesink") && gstArgs.includes("max-files=4"), "persistent stream does not bound newest frames");
must(gstArgs.includes("leaky=downstream") && gstArgs.includes("max-size-buffers=1"), "persistent stream can queue stale frames");
must(!gstArgs.includes("num-buffers=1"), "one-shot PipeWire capture remains in the Mining producer");

const frameDir = await mkdtemp(path.join(os.tmpdir(), "archverse-c8i-frames-"));
try {
  const older = path.join(frameDir, "frame-000000001.png");
  const newer = path.join(frameDir, "frame-000000002.png");
  await writeFile(older, "complete-old");
  await writeFile(newer, "possibly-writing-new");
  const nowSeconds = Date.now() / 1000;
  await utimes(older, nowSeconds - 0.2, nowSeconds - 0.2);
  await utimes(newer, nowSeconds - 0.1, nowSeconds - 0.1);
  const selected = persistent.newestCompletedFrame(frameDir, Date.now());
  must(selected?.path === older, `latest-frame selector raced the active encoder: ${selected?.path}`);
} finally {
  await rm(frameDir, { recursive: true, force: true });
}

// Prove that a stalled worker is discarded and the next frame starts a new worker.
const workerDir = await mkdtemp(path.join(os.tmpdir(), "archverse-c8i-worker-"));
const workerPath = path.join(workerDir, "worker.cjs");
await writeFile(workerPath, `
process.send({ type: "ready" });
process.on("message", (message) => {
  if (String(message.path).includes("hang")) return;
  process.send({ type: "result", id: message.id, result: [{ text: "2,000", box: [[0,0],[1,0],[1,1],[0,1]], score: 1 }] });
});
`);
const rapid = createRapidOcrClient({ workerPath, timeoutMs: 60, maxQueue: 1, restartOnFailure: true, inheritStdio: false, logger: { warn() {}, error() {} } });
try {
  let timedOut = false;
  try { await rapid.detect(path.join(workerDir, "hang.png")); }
  catch (error) { timedOut = /timed out/.test(String(error?.message || error)); }
  must(timedOut, "stalled RapidOCR request did not meet its deadline");
  const rows = await rapid.detect(path.join(workerDir, "fresh.png"));
  must(rows?.[0]?.text === "2,000", `replacement worker did not process the next frame: ${JSON.stringify(rows)}`);
  must(rapid.restartCount() >= 1, "worker restart was not recorded");
} finally {
  rapid.close();
  await rm(workerDir, { recursive: true, force: true });
}

// Exercise the push client without opening a socket. Once the first SSE event arrives, get() must
// use that state instead of polling localhost on every frame.
let bootstrapGets = 0;
let streamSignal;
const streamPayload = new TextEncoder().encode('data: {"active":true,"source":"ship-channel","ship":"Argo MOTH","controlled":[],"changedAt":7}\n\n');
const pushClient = createMiningVehiclePresenceClient({
  endpoint: "http://localhost:24777/api/vehicle-presence",
  logger: { log() {}, warn() {} },
  fetchImpl: async (url, init = {}) => {
    if (String(url).endsWith("/events")) {
      streamSignal = init.signal;
      let first = true;
      return {
        ok: true,
        body: {
          getReader() {
            return {
              read() {
                if (first) { first = false; return Promise.resolve({ done: false, value: streamPayload }); }
                return new Promise((resolve, reject) => {
                  init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
                });
              },
              releaseLock() {},
            };
          },
        },
      };
    }
    bootstrapGets += 1;
    return { ok: true, json: async () => ({ active: false, source: "none", controlled: [] }) };
  },
});
await sleep(25);
const pushedPresence = await pushClient.get();
must(pushedPresence.active === true && pushedPresence.source === "ship-channel", `SSE state was not accepted: ${JSON.stringify(pushedPresence)}`);
must(bootstrapGets === 0, `push client continued polling after SSE became authoritative: ${bootstrapGets}`);
pushClient.close();
must(streamSignal?.aborted === true, "vehicle-presence stream was not closed");

const tempDir = await mkdtemp(path.join(os.tmpdir(), "archverse-c8i-sidecar-"));
const gameLog = path.join(tempDir, "game.log");
const config = path.join(tempDir, "config.json");
const networkGuard = path.join(tempDir, "local-network-only.cjs");
await writeFile(gameLog, `<2026-09-05T22:00:00.000Z> [Notice] <Startup> Candidate 8i self-test\n`);
await writeFile(config, JSON.stringify({
  logPath: gameLog,
  syncToken: "",
  syncEnabled: false,
  miningAssistant: true,
  fabCapture: false,
  revertThemeOnFoot: false,
}));
await writeFile(networkGuard, `
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    return Promise.reject(new Error("Candidate 8i self-test blocked external fetch"));
  }
  return realFetch(input, init);
};
`);

const port = 25000 + (process.pid % 9000);
const child = spawn(process.execPath, [path.join(root, "app/server/server.mjs")], {
  env: {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --require=${networkGuard}`.trim(),
    SC_TRACKER_CONFIG_DIR: tempDir,
    PORT: String(port),
    SC_SYNC_BASE: "http://127.0.0.1:9",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let childLog = "";
child.stdout.on("data", (buffer) => { childLog += buffer.toString(); });
child.stderr.on("data", (buffer) => { childLog += buffer.toString(); });

async function getJson(route, attempts = 30) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return await response.json();
      lastError = new Error(`${route} HTTP ${response.status}`);
    } catch (error) { lastError = error; }
    await sleep(150);
  }
  throw new Error(`${route} unavailable: ${lastError?.message || lastError}\n${childLog}`);
}

async function waitForVehicle(active) {
  let last;
  for (let i = 0; i < 24; i += 1) {
    await sleep(150);
    last = await getJson("/api/vehicle-presence", 3);
    if (last.active === active) return last;
  }
  throw new Error(`vehicle state ${active} was not observed; last=${JSON.stringify(last)}\n${childLog}`);
}

async function postMining(texts) {
  const values = Array.isArray(texts) ? texts : [texts];
  const response = await fetch(`http://127.0.0.1:${port}/api/screen-read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      miningCrop: true,
      commitMining: true,
      pollMs: 1200,
      w: 700,
      h: 200,
      frameW: 3840,
      frameH: 2160,
      offsetX: 1500,
      offsetY: 600,
      lines: values.map((text, index) => ({ text, x: 260, y: 35 + index * 30, w: 180, h: 24 })),
    }),
    signal: AbortSignal.timeout(1500),
  });
  must(response.ok, `screen-read HTTP ${response.status}`);
  return await response.json();
}

try {
  await getJson("/api/vehicle-presence");
  let read = await postMining("2,000");
  must(read.signature === 2000 && read.miningCommit?.confirmed === false && read.miningCommit?.used === false,
    `on-foot value bypassed Game.log authority: ${JSON.stringify(read)}`);

  await appendFile(gameLog, `<2026-09-05T22:00:01.000Z> [Notice] <Comms> You have joined channel 'Argo MOTH : TestPilot' [Team_CoreGameplayFeatures][Comms]\n`);
  await waitForVehicle(true);

  read = await postMining(["2,000", "UNKNOWN | 14.4km | 90° STRONG"]);
  must(read.kind === "mineable" && read.signature === 2000 && read.miningCommit?.used === true,
    `valid 2,000 scan did not commit: ${JSON.stringify(read)}`);

  read = await postMining(["26,000", "UNKNOWN | 16.5km | 90° STRONG"]);
  must(read.kind === "mining-observation" && read.observedSignature === 26000 && read.miningCommit === null,
    `structural unclassified RS was not preserved safely: ${JSON.stringify(read)}`);
  let view = await getJson("/api/mining");
  must(view.scan?.signature === 2000, `unclassified RS changed Mining state: ${JSON.stringify(view.scan)}`);

  for (const falseContext of [
    "20,000 20,100 | STRONG | 90°",
    "SHIP IN DISTP | 20,000 | WRECKAGE",
    "B0-6836",
    "WP-8806",
    "CARGO | 64,003",
    "0.00°,27.43°,48.000",
  ]) {
    read = await postMining(falseContext);
    must(read.kind === "none" && read.miningCommit === null,
      `false/ambiguous context became Mining state: ${JSON.stringify({ falseContext, read })}`);
  }

  read = await postMining(["5,959", "UNKNOWN | 7.3km | 90° STRONG"]);
  must(read.kind === "mining-observation" && read.observedSignature === 5959 && read.miningCommit === null,
    `unclassified structural contact was silently discarded or committed: ${JSON.stringify(read)}`);

  await appendFile(gameLog, `<2026-09-05T22:00:02.000Z> [Notice] <Comms> You have left the channel 'Argo MOTH : TestPilot' [Team_CoreGameplayFeatures][Comms]\n`);
  await waitForVehicle(false);
  read = await postMining("2,000");
  must(read.signature === 2000 && read.miningCommit?.confirmed === false && read.miningCommit?.used === false,
    `post-departure value bypassed Game.log authority: ${JSON.stringify(read)}`);
} finally {
  child.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), sleep(1500)]);
  if (child.exitCode == null) child.kill("SIGKILL");
  await rm(tempDir, { recursive: true, force: true });
}

console.log("Candidate 8i self-test OK: persistent newest-frame PipeWire, restartable bounded Mining OCR, pushed vehicle authority, exclusive scheduling, and context-safe RS admission");
