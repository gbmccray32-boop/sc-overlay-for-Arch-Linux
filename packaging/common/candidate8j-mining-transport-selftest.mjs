import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const root = process.argv[2];
if (!root) throw new Error("usage: candidate8j-mining-transport-selftest.mjs <root>");
const must = (value, message) => { if (!value) throw new Error(`Candidate 8j self-test: ${message}`); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const require = createRequire(import.meta.url);

const capture = await readFile(path.join(root, "app/electron/capture.cjs"), "utf8");
const main = await readFile(path.join(root, "app/electron/main.cjs"), "utf8");
const serverSource = await readFile(path.join(root, "app/server/server.mjs"), "utf8");
const pkg = JSON.parse(await readFile(path.join(root, "app/package.json"), "utf8"));
const { requestJson } = require(path.join(root, "app/electron/local-json-ipc.cjs"));
const {
  createMiningResultTransport,
  classifyMiningOcrLines,
} = require(path.join(root, "app/electron/mining-result-transport.cjs"));
const { createMiningVehiclePresenceClient } = require(path.join(root, "app/electron/mining-vehicle-presence.cjs"));
const { createSidecarHealthWatchdog } = require(path.join(root, "app/electron/sidecar-health-watchdog.cjs"));

must(["0.1.44-r31.alpha22.candidate8j", "0.1.46-r31.alpha23.candidate1"].includes(pkg.version), `wrong package version ${pkg.version}`);
for (const marker of [
  "ARCHVERSE_LINUX_GAMESCOPE_PIPEWIRE_PERSISTENT_STREAM",
  "ARCHVERSE_LINUX_MINING_OCR_PRIORITY_LANES",
  "ARCHVERSE_LINUX_MINING_EXCLUSIVE_OCR",
  "ARCHVERSE_LINUX_MINING_LATEST_FRAME_SCHEDULER",
  "ARCHVERSE_LINUX_MINING_VEHICLE_PRESENCE_BOUNDED_GET",
  "ARCHVERSE_LINUX_MINING_RESULT_TRANSPORT_V1",
  "ARCHVERSE_LINUX_MINING_NONBLOCKING_COMMIT",
  "ARCHVERSE_LINUX_MINING_LOCAL_ADMISSION",
  "ARCHVERSE_LINUX_MINING_STABLE_CADENCE",
  "ARCHVERSE_LINUX_MINING_ELECTRON_HEARTBEAT",
]) must(capture.includes(marker), `capture marker missing: ${marker}`);
must(main.includes("ARCHVERSE_LINUX_SIDECAR_HEALTH_WATCHDOG"), "sidecar watchdog is not wired into Electron");
must(serverSource.includes("ARCHVERSE_LINUX_MINING_CONTEXT_SAFE_RS_ADMISSION"), "authoritative sidecar admission changed");
must(!capture.includes("/api/vehicle-presence/events"), "capture still opens vehicle-presence SSE");
must(!serverSource.includes("/api/vehicle-presence/events"), "sidecar still exposes vehicle-presence SSE");
must(!serverSource.includes("vehiclePresenceClients"), "sidecar still retains vehicle SSE clients");
must(!capture.includes('signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),\n          });\n          const rr3 = await r3.json();'),
  "Mining still waits for the sidecar inside its OCR tick");
must(capture.includes('const commitState = "queued";'), "Mining does not report queued asynchronous commit state");
must(capture.includes("? (Date.now() < fastUntil ? FAST_MS : MINING_VEHICLE_IDLE_MS)"), "exact 900/1200 cadence selector missing");

function linesFor(texts) {
  const values = Array.isArray(texts) ? texts : [texts];
  return values.map((text, index) => ({ text, x: 260, y: 35 + index * 30, w: 180, h: 24 }));
}

for (const [texts, expectedKind, expectedSignature] of [
  ["2,000", "mineable", 2000],
  ["32,000", "mineable", 32000],
  ["120,000", "mineable", 120000],
  [["26,000", "UNKNOWN | 16.5km | 90° STRONG"], "mining-observation", 26000],
  ["0.00°,27.43°,48.000", "none", null],
  ["SHIP IN DISTP | 20,000 | WRECKAGE", "none", null],
  ["CARGO | 64,003", "none", null],
]) {
  const read = classifyMiningOcrLines(linesFor(texts), { width: 700, offsetX: 1500, offsetY: 600 });
  const signature = read.signature ?? read.observedSignature ?? null;
  must(read.kind === expectedKind && signature === expectedSignature,
    `local admission mismatch for ${JSON.stringify(texts)}: ${JSON.stringify(read)}`);
}

// The bounded vehicle lookup retains the last confirmed state through a transport failure.
let presenceNow = 1000;
let presenceRequests = 0;
const presence = createMiningVehiclePresenceClient({
  endpoint: "http://127.0.0.1:27881/api/vehicle-presence",
  now: () => presenceNow,
  cacheMs: 10,
  retryBaseMs: 20,
  retryMaxMs: 20,
  logEveryMs: 1,
  logger: { log() {}, warn() {} },
  requestImpl: async () => {
    presenceRequests += 1;
    if (presenceRequests === 1) return { active: true, source: "ship-channel", ship: "Argo MOTH" };
    throw new Error("simulated bounded GET failure");
  },
});
let observedPresence = await presence.get();
must(observedPresence.active === true && observedPresence.ipcAvailable === true, "initial vehicle state was not accepted");
presenceNow += 20;
observedPresence = await presence.get();
must(observedPresence.active === true && observedPresence.stale === true && observedPresence.ipcAvailable === false,
  `transport failure became a false departure: ${JSON.stringify(observedPresence)}`);

// A hung commit route must not make submit() wait. The newest pending result survives and is sent
// after the route recovers.
const hungSockets = new Set();
const hungServer = createServer(() => {});
hungServer.on("connection", (socket) => {
  hungSockets.add(socket);
  socket.on("close", () => hungSockets.delete(socket));
});
await new Promise((resolve) => hungServer.listen(0, "127.0.0.1", resolve));
const hungPort = hungServer.address().port;
let transportFailures = 0;
let transportAcks = 0;
const transport = createMiningResultTransport({
  endpoint: `http://127.0.0.1:${hungPort}/api/screen-read`,
  timeoutMs: 50,
  retryBaseMs: 20,
  retryMaxMs: 40,
  logEveryMs: 1,
  logger: { log() {}, warn() {} },
  onFailure: () => { transportFailures += 1; },
  onResponse: () => { transportAcks += 1; },
});
const submitStarted = performance.now();
transport.submit({ signature: 2000 }, { localResult: { kind: "mineable", signature: 2000 } });
must(performance.now() - submitStarted < 15, "Mining submit blocked on the hung route");
transport.submit({ signature: 3400 }, { localResult: { kind: "mineable", signature: 3400 } });
await sleep(90);
must(transportFailures >= 1 && (transport.stats().pending === true || transport.stats().inFlight === true),
  `hung route did not retain the newest result: ${JSON.stringify(transport.stats())}`);
for (const socket of hungSockets) socket.destroy();
await new Promise((resolve) => hungServer.close(resolve));
const recoveredServer = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    const value = JSON.parse(body || "{}");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ kind: "mineable", signature: value.signature, miningCommit: { confirmed: true, used: true } }));
  });
});
await new Promise((resolve) => recoveredServer.listen(hungPort, "127.0.0.1", resolve));
must(await transport.awaitIdle(2000), `transport did not recover: ${JSON.stringify(transport.stats())}`);
must(transportAcks >= 1 && transport.stats().consecutiveFailures === 0,
  `recovered route did not acknowledge the retained result: ${JSON.stringify(transport.stats())}`);
transport.close();
await new Promise((resolve) => recoveredServer.close(resolve));

// The watchdog acts only after three failed independent health probes. A healthy identity resets
// the counter and never restarts the child.
const fakeChild = { exitCode: null, killed: false };
let healthAttempts = 0;
let restarts = 0;
const watchdog = createSidecarHealthWatchdog({
  endpoint: "http://127.0.0.1:27882/api/instance",
  instanceId: "candidate8j-test",
  getChild: () => fakeChild,
  restartChild: () => { restarts += 1; },
  restartCooldownMs: 0,
  // Alpha23 retains Candidate 8k startup grace. This test isolates the probe counter;
  // candidate8k-sidecar-supervision-selftest exercises grace, expiry, and recovery separately.
  startupGraceMs: 0,
  logger: { log() {}, warn() {} },
  requestImpl: async () => {
    healthAttempts += 1;
    if (healthAttempts <= 3) throw new Error("simulated health timeout");
    return { instance: "candidate8j-test" };
  },
});
for (let i = 0; i < 3; i += 1) {
  watchdog.noteTransportFailure({ route: "/api/screen-read" });
  await sleep(10);
}
must(restarts === 1, `watchdog restart count mismatch: ${restarts}`);
watchdog.noteTransportFailure({ route: "/api/screen-read" });
await sleep(10);
must(restarts === 1 && watchdog.stats().consecutiveFailures === 0, "healthy sidecar probe caused another restart");
watchdog.close();

const tempDir = await mkdtemp(path.join(os.tmpdir(), "archverse-c8j-sidecar-"));
const gameLog = path.join(tempDir, "game.log");
const config = path.join(tempDir, "config.json");
const networkGuard = path.join(tempDir, "local-network-only.cjs");
await writeFile(gameLog, `<2026-09-06T12:00:00.000Z> [Notice] <Startup> Candidate 8j self-test\n`);
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
    return Promise.reject(new Error("Candidate 8j self-test blocked external fetch"));
  }
  return realFetch(input, init);
};
`);

const port = 25000 + (process.pid % 9000);
const child = spawn(process.execPath, [path.join(root, "app/server/server.mjs")], {
  cwd: path.join(root, "app/server"),
  env: {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --require=${networkGuard}`.trim(),
    SC_TRACKER_CONFIG_DIR: tempDir,
    SC_INSTANCE: "candidate8j-real-sidecar",
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
    try { return await requestJson(`http://127.0.0.1:${port}${route}`, { timeoutMs: 500 }); }
    catch (error) { lastError = error; }
    await sleep(100);
  }
  throw new Error(`${route} unavailable: ${lastError?.message || lastError}\n${childLog}`);
}

async function waitForVehicle(active) {
  let last;
  for (let i = 0; i < 30; i += 1) {
    await sleep(100);
    last = await getJson("/api/vehicle-presence", 3);
    if (last.active === active) return last;
  }
  throw new Error(`vehicle state ${active} was not observed; last=${JSON.stringify(last)}\n${childLog}`);
}

function miningPayload(signature) {
  return {
    miningCrop: true,
    commitMining: true,
    pollMs: 900,
    w: 700,
    h: 200,
    frameW: 3840,
    frameH: 2160,
    offsetX: 1500,
    offsetY: 600,
    lines: linesFor(signature.toLocaleString("en-US")),
  };
}

try {
  const instance = await getJson("/api/instance");
  must(instance.instance === "candidate8j-real-sidecar", `wrong sidecar identity: ${JSON.stringify(instance)}`);
  let read = await requestJson(`http://127.0.0.1:${port}/api/screen-read`, {
    method: "POST", json: miningPayload(2000), timeoutMs: 650,
  });
  must(read.signature === 2000 && read.miningCommit?.confirmed === false && read.miningCommit?.used === false,
    `on-foot value bypassed authority: ${JSON.stringify(read)}`);

  await appendFile(gameLog, `<2026-09-06T12:00:01.000Z> [Notice] <Comms> You have joined channel 'Argo MOTH : TestPilot' [Team_CoreGameplayFeatures][Comms]\n`);
  await waitForVehicle(true);

  const catalog = [2000, 3400, 3900, 7200, 10000, 14000, 32000, 48000, 64000, 120000];
  const latencies = [];
  for (let batch = 0; batch < 15; batch += 1) {
    const work = [];
    for (let offset = 0; offset < 8; offset += 1) {
      const signature = catalog[(batch * 8 + offset) % catalog.length];
      work.push((async () => {
        const started = performance.now();
        const result = await requestJson(`http://127.0.0.1:${port}/api/screen-read`, {
          method: "POST", json: miningPayload(signature), timeoutMs: 650,
        });
        latencies.push(performance.now() - started);
        must(result.signature === signature && result.miningCommit?.used === true,
          `real-sidecar soak rejected ${signature}: ${JSON.stringify(result)}`);
      })());
      work.push(getJson("/api/vehicle-presence", 3));
    }
    await Promise.all(work);
  }
  must(latencies.length === 120, `real-sidecar soak completed ${latencies.length}/120 Mining posts`);
  must(Math.max(...latencies) < 650, `real-sidecar route exceeded Mining deadline: ${Math.max(...latencies).toFixed(1)}ms`);

  let acknowledgedSignature = null;
  const liveTransport = createMiningResultTransport({
    endpoint: `http://127.0.0.1:${port}/api/screen-read`,
    timeoutMs: 650,
    logger: { log() {}, warn() {} },
    onResponse: (response) => { acknowledgedSignature = response.signature ?? acknowledgedSignature; },
  });
  for (const signature of [...catalog, 120000]) {
    liveTransport.submit(miningPayload(signature), { localResult: { kind: "mineable", signature } });
  }
  must(await liveTransport.awaitIdle(3000), `live result queue did not drain: ${JSON.stringify(liveTransport.stats())}`);
  must(acknowledgedSignature === 120000, `latest-result queue lost final signature: ${acknowledgedSignature}`);
  liveTransport.close();
  const view = await getJson("/api/mining");
  must(view.scan?.signature === 120000, `final authoritative Mining state is wrong: ${JSON.stringify(view.scan)}`);

  let sseStatus = 0;
  try {
    await requestJson(`http://127.0.0.1:${port}/api/vehicle-presence/events`, { timeoutMs: 300 });
    sseStatus = 200;
  } catch { sseStatus = 404; }
  must(sseStatus !== 200, "removed vehicle-presence SSE endpoint still answered successfully");

  await appendFile(gameLog, `<2026-09-06T12:00:02.000Z> [Notice] <Comms> You have left the channel 'Argo MOTH : TestPilot' [Team_CoreGameplayFeatures][Comms]\n`);
  await waitForVehicle(false);
  read = await requestJson(`http://127.0.0.1:${port}/api/screen-read`, {
    method: "POST", json: miningPayload(2000), timeoutMs: 650,
  });
  must(read.miningCommit?.confirmed === false && read.miningCommit?.used === false,
    `post-departure result bypassed authority: ${JSON.stringify(read)}`);
} finally {
  child.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), sleep(1500)]);
  if (child.exitCode == null) child.kill("SIGKILL");
  await rm(tempDir, { recursive: true, force: true });
}

console.log("Candidate 8j self-test OK: local RS admission, nonblocking latest-result recovery, bounded vehicle GET, sidecar watchdog, and 120-request real-sidecar soak");
