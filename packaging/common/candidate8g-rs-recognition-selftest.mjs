import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const root = process.argv[2];
if (!root) throw new Error("usage: candidate8g-rs-recognition-selftest.mjs <root>");
const must = (value, message) => { if (!value) throw new Error(`Candidate 8g self-test: ${message}`); };

const capture = await readFile(path.join(root, "app/electron/capture.cjs"), "utf8");
const server = await readFile(path.join(root, "app/server/server.mjs"), "utf8");
const pkg = JSON.parse(await readFile(path.join(root, "app/package.json"), "utf8"));
const require = createRequire(import.meta.url);
const catalog = require(path.join(root, "app/electron/mining-signature-catalog.cjs"));

must(pkg.version === "0.1.44-r31.alpha22.candidate8g", `wrong package version ${pkg.version}`);
must(capture.includes("ARCHVERSE_LINUX_MINING_INLINE_COMMIT"), "inline Electron commit marker missing");
must(capture.includes('commitMining: process.platform === "linux"'), "Linux screen-read does not request an inline commit");
must(capture.includes("read.miningCommit?.handled === true"), "legacy POST fallback is not guarded by the inline result");
must(server.includes("ARCHVERSE_LINUX_MINING_INLINE_COMMIT_SERVER"), "inline sidecar commit marker missing");
must(server.includes("ARCHVERSE_LINUX_MINING_RS_CATALOG_V2"), "current-catalog tracker marker missing");
must(server.includes("v <= MAX_VALID_SIGNATURE"), "OCR parser still has a stale fixed ceiling");
must(!server.includes("radar+RS CONFIRMED"), "stale radar authority diagnostic remains");

const c2000 = catalog.classifyMiningSignature(2000);
must(c2000.valid && c2000.matches.some((m) => m.kind === "debris" && m.n === 1), "2,000 debris/harvest signature is not legal");
const c24000 = catalog.classifyMiningSignature(24000);
must(c24000.valid && c24000.matches.some((m) => m.kind === "debris" && m.n === 12), "24,000 twelve-panel debris signature is not legal");
must(!catalog.classifyMiningSignature(26000).valid, "debris leaked past the twelve-panel field cap");
must(catalog.classifyMiningSignature(32000).valid, "32,000 large-cluster signature is not legal");
must(catalog.classifyMiningSignature(90000).valid, "90,000 FPS signature is not legal");
must(catalog.classifyMiningSignature(120000).valid, "120,000 ground-vehicle signature is not legal");
must(!catalog.classifyMiningSignature(120001).valid, "out-of-catalog value became legal");
must(!catalog.classifyMiningSignature(2504).valid, "2,504 false positive returned");

const tempDir = await mkdtemp(path.join(os.tmpdir(), "archverse-c8g-selftest-"));
const gameLog = path.join(tempDir, "game.log");
const config = path.join(tempDir, "config.json");
const networkGuard = path.join(tempDir, "local-network-only.cjs");
await writeFile(gameLog, `<2026-09-04T01:00:00.000Z> [Notice] <Startup> Candidate 8g self-test\n`);
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
    return Promise.reject(new Error("Candidate 8g self-test blocked external fetch"));
  }
  return realFetch(input, init);
};
`);

const port = 22000 + (process.pid % 12000);
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

async function postMining(text) {
  const response = await fetch(`http://127.0.0.1:${port}/api/screen-read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      miningCrop: true,
      commitMining: true,
      pollMs: 1200,
      w: 400,
      h: 120,
      frameW: 3840,
      frameH: 2160,
      offsetX: 1700,
      offsetY: 600,
      lines: [{ text, x: 155, y: 35, w: 90, h: 24 }],
    }),
    signal: AbortSignal.timeout(1500),
  });
  must(response.ok, `screen-read HTTP ${response.status}`);
  return await response.json();
}

try {
  await getJson("/api/vehicle-presence");

  let read = await postMining("2,000");
  must(read.signature === 2000, `on-foot parser missed 2,000: ${JSON.stringify(read)}`);
  must(read.miningCommit?.handled === true && read.miningCommit.confirmed === false && read.miningCommit.used === false,
    `on-foot read bypassed the vehicle gate: ${JSON.stringify(read.miningCommit)}`);

  await appendFile(gameLog, `<2026-09-04T01:00:01.000Z> [Notice] <Comms> You have joined channel 'Drake Cutlass Black : TestPilot' [Team_CoreGameplayFeatures][Comms]\n`);
  const vehicle = await waitForVehicle(true);
  must(vehicle.source === "ship-channel", `wrong vehicle source: ${JSON.stringify(vehicle)}`);

  read = await postMining("2,000");
  must(read.signature === 2000, `parser missed 2,000: ${JSON.stringify(read)}`);
  must(read.miningCommit?.handled === true && read.miningCommit.confirmed === true
    && read.miningCommit.used === true && read.miningCommit.verdict === "debris",
  `2,000 did not commit as debris: ${JSON.stringify(read.miningCommit)}`);
  let view = await getJson("/api/mining");
  must(view.scan?.signature === 2000, `Mining state did not retain 2,000: ${JSON.stringify(view.scan)}`);

  read = await postMining("32,000");
  must(read.signature === 32000 && read.miningCommit?.used === true,
    `32,000 was blocked by the old tracker ceiling: ${JSON.stringify(read)}`);
  view = await getJson("/api/mining");
  must(view.scan?.signature === 32000, `Mining state did not retain 32,000: ${JSON.stringify(view.scan)}`);

  read = await postMining("120,000");
  must(read.signature === 120000 && read.miningCommit?.used === true,
    `six-digit 120,000 signature failed: ${JSON.stringify(read)}`);
  view = await getJson("/api/mining");
  must(view.scan?.signature === 120000, `Mining state did not retain 120,000: ${JSON.stringify(view.scan)}`);
} finally {
  child.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), sleep(1500)]);
  if (child.exitCode == null) child.kill("SIGKILL");
  await rm(tempDir, { recursive: true, force: true });
}

console.log("Candidate 8g self-test OK: 2,000-step debris and high current-RS totals parse, pass the Game.log gate, and commit inline");
