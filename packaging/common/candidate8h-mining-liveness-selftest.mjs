import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const root = process.argv[2];
if (!root) throw new Error("usage: candidate8h-mining-liveness-selftest.mjs <root>");
const must = (value, message) => { if (!value) throw new Error(`Candidate 8h self-test: ${message}`); };

const capture = await readFile(path.join(root, "app/electron/capture.cjs"), "utf8");
const server = await readFile(path.join(root, "app/server/server.mjs"), "utf8");
const pkg = JSON.parse(await readFile(path.join(root, "app/package.json"), "utf8"));
const require = createRequire(import.meta.url);
const { createMiningVehiclePresenceClient } = require(path.join(root, "app/electron/mining-vehicle-presence.cjs"));

must(pkg.version === "0.1.44-r31.alpha22.candidate8h", `wrong package version ${pkg.version}`);
must(pkg.description.includes("resilient vehicle-gated Mining cadence"), "package description is stale");
must(capture.includes("ARCHVERSE_LINUX_MINING_VEHICLE_PRESENCE_LIVENESS"), "vehicle liveness marker missing");
must(capture.includes("ARCHVERSE_LINUX_BACKGROUND_OCR_FAILURE_BACKOFF"), "background OCR backoff marker missing");
must(capture.includes("const LINUX_BACKGROUND_BACKOFF_BASE_MS = 15000;"), "background OCR backoff base changed");
must(capture.includes("linuxBackgroundBackoffUntil = Date.now() + delay;"), "background OCR failure does not arm backoff");
must(capture.includes("readRegion(key, true, POLL_MS, true, true)"), "background OCR failures are still swallowed");
must(capture.includes('vehiclePresenceClient.accept(rr3.vehiclePresence, "screen-read")'), "inline authority reconciliation missing");
must(capture.includes("if (confirmed) {\n          if (!integratedMiningCommit)"), "integrated commit diagnostic is not nested under vehicle authority");
must(!capture.includes("VEHICLE_PRESENCE_GRACE_MS"), "old fail-closed transport grace remains");
must(!capture.includes("mining was not blocked"), "misleading background OCR diagnostic remains");
must(server.includes("ARCHVERSE_LINUX_MINING_COORDINATE_REJECTION"), "coordinate rejection marker missing");
must(server.includes("vehiclePresence: miningPresence"), "screen-read does not return current vehicle authority");

// Exercise the transport semantics without Electron: a timeout retains the last confirmed state,
// bounded backoff suppresses an immediate duplicate request, and an inline sidecar observation can
// still clear the state at once after a real Game.log departure.
let clock = 10000;
let fetchCalls = 0;
const responses = [
  { active: true, source: "ship-channel", ship: "Drake Vulture", controlled: [], changedAt: 1 },
  new Error("simulated timeout"),
  new Error("simulated timeout after departure"),
];
const client = createMiningVehiclePresenceClient({
  endpoint: "http://localhost:18473/api/vehicle-presence",
  now: () => clock,
  timeoutSignal: () => undefined,
  logger: { log() {}, warn() {} },
  fetchImpl: async () => {
    fetchCalls += 1;
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return { ok: true, json: async () => next };
  },
});

let presence = await client.get();
must(presence.active === true && presence.stale === false, `initial active state failed: ${JSON.stringify(presence)}`);
clock += 600;
presence = await client.get();
must(presence.active === true && presence.stale === true && presence.ipcAvailable === false,
  `transport timeout became a false departure: ${JSON.stringify(presence)}`);
clock += 100;
presence = await client.get();
must(fetchCalls === 2 && presence.active === true && presence.stale === true && presence.ipcAvailable === false,
  "vehicle retry backoff did not retain the stale state or suppress an immediate refetch");
presence = client.accept({ active: false, source: "none", controlled: [] }, "screen-read");
must(presence.active === false, "inline sidecar authority did not clear a real departure");
clock += 600;
presence = await client.get();
must(presence.active === false && presence.stale === true,
  `post-departure timeout invented vehicle presence: ${JSON.stringify(presence)}`);

const tempDir = await mkdtemp(path.join(os.tmpdir(), "archverse-c8h-selftest-"));
const gameLog = path.join(tempDir, "game.log");
const config = path.join(tempDir, "config.json");
const networkGuard = path.join(tempDir, "local-network-only.cjs");
await writeFile(gameLog, `<2026-09-05T01:00:00.000Z> [Notice] <Startup> Candidate 8h self-test\n`);
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
    return Promise.reject(new Error("Candidate 8h self-test blocked external fetch"));
  }
  return realFetch(input, init);
};
`);

const port = 24000 + (process.pid % 10000);
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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(route, attempts = 30) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return await response.json();
      lastError = new Error(`${route} HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
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

async function postMining(textOrLines) {
  const texts = Array.isArray(textOrLines) ? textOrLines : [textOrLines];
  const response = await fetch(`http://127.0.0.1:${port}/api/screen-read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      miningCrop: true,
      commitMining: true,
      pollMs: 1200,
      w: 500,
      h: 140,
      frameW: 3840,
      frameH: 2160,
      offsetX: 1600,
      offsetY: 600,
      lines: texts.map((text, index) => ({ text, x: 150 + index * 95, y: 35, w: 90, h: 24 })),
    }),
    signal: AbortSignal.timeout(1500),
  });
  must(response.ok, `screen-read HTTP ${response.status}`);
  return await response.json();
}

try {
  await getJson("/api/vehicle-presence");
  let read = await postMining("2,000");
  must(read.signature === 2000 && read.vehiclePresence?.active === false,
    `on-foot parser or authority response failed: ${JSON.stringify(read)}`);
  must(read.miningCommit?.handled === true && read.miningCommit.confirmed === false && read.miningCommit.used === false,
    `on-foot read bypassed the vehicle gate: ${JSON.stringify(read.miningCommit)}`);

  await appendFile(gameLog, `<2026-09-05T01:00:01.000Z> [Notice] <Comms> You have joined channel 'Drake Vulture : TestPilot' [Team_CoreGameplayFeatures][Comms]\n`);
  const vehicle = await waitForVehicle(true);
  must(vehicle.source === "ship-channel", `wrong vehicle source: ${JSON.stringify(vehicle)}`);

  for (const coordinate of [
    "0.00°,27.43°,48.000",
    "0.00° 48.000",
    "12.345 67.890 48.000",
    ["0.00°", "48.000"],
  ]) {
    read = await postMining(coordinate);
    must(read.kind === "none" && read.miningCommit === null,
      `navigation coordinate became an RS signature: ${JSON.stringify({ coordinate, read })}`);
    must(read.vehiclePresence?.active === true, "coordinate rejection dropped the authority response");
  }
  let view = await getJson("/api/mining");
  must(!view.scan, `coordinate OCR polluted Mining state: ${JSON.stringify(view.scan)}`);

  read = await postMining("2,000");
  must(read.signature === 2000 && read.miningCommit?.used === true,
    `2,000 did not commit after the liveness repair: ${JSON.stringify(read)}`);
  read = await postMining("48.000");
  must(read.signature === 48000 && read.miningCommit?.used === true,
    `standalone dot-grouped 48,000 was over-rejected: ${JSON.stringify(read)}`);
  read = await postMining("3,400 | 90° STRONG");
  must(read.signature === 3400 && read.miningCommit?.used === true,
    `valid RS with strength text was over-rejected: ${JSON.stringify(read)}`);

  await appendFile(gameLog, `<2026-09-05T01:00:02.000Z> [Notice] <Comms> You have left the channel 'Drake Vulture : TestPilot' [Team_CoreGameplayFeatures][Comms]\n`);
  await waitForVehicle(false);
  read = await postMining("2,000");
  must(read.signature === 2000 && read.vehiclePresence?.active === false,
    `departure authority was not returned inline: ${JSON.stringify(read)}`);
  must(read.miningCommit?.handled === true && read.miningCommit.confirmed === false && read.miningCommit.used === false,
    `post-departure read bypassed the vehicle gate: ${JSON.stringify(read.miningCommit)}`);
} finally {
  child.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), sleep(1500)]);
  if (child.exitCode == null) child.kill("SIGKILL");
  await rm(tempDir, { recursive: true, force: true });
}

console.log("Candidate 8h self-test OK: vehicle IPC stalls preserve cadence, inline Game.log authority remains fail-closed, background OCR backs off, and coordinates cannot become RS reads");
