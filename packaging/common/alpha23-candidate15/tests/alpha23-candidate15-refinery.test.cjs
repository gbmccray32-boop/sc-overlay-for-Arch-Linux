"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const net = require("node:net");

const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const capture = fs.readFileSync(path.join(root, "app/electron/capture.cjs"), "utf8");
assert.match(capture, /runLinuxBackgroundOcr\("refinery"\)/, "active authority must allow only the refinery probe");
assert.match(capture, /REFINERY_SIGNATURE_QUIET_MS = 12000/, "refinery probe must wait for a quiet Mining lane");
assert.match(capture, /REFINERY_ACTIVE_VEHICLE_PROBE_MS = 15000/, "refinery probe must remain low rate");
assert.match(capture, /\[ocr-refinery\].*reason=/, "bounded refinery diagnostics must include a rejection reason");

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function post(port, body) {
  const response = await fetch(`http://127.0.0.1:${port}/api/screen-read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(response.status, 200);
  return response.json();
}

(async () => {
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "archverse-candidate15-"));
const config = path.join(temp, "config");
fs.mkdirSync(config);
fs.writeFileSync(path.join(temp, "Game.log"), "");
fs.writeFileSync(path.join(config, "config.json"), JSON.stringify({
  setupComplete: true, syncEnabled: false, shareLogs: false, miningAssistant: true,
  logPath: path.join(temp, "Game.log"),
}));
const port = await freePort();
const child = spawn(process.execPath, [path.join(root, "app/server/server.mjs")], {
  cwd: path.join(root, "app/server"),
  env: { ...process.env, PORT: String(port), SC_TRACKER_CONFIG_DIR: config, SC_PARENT_PID: String(process.pid) },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { output = (output + chunk).slice(-12000); });
const exited = once(child, "exit");

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(output);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/instance`, { signal: AbortSignal.timeout(300) });
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, `sidecar did not start: ${output}`);
  const line = (text, x, y, w = 260, h = 32) => ({ text, x, y, w, h });
  const accepted = await post(port, {
    ocrRegion: "refinery", w: 3226, h: 1685,
    lines: [
      line("KI", 0, 13, 38, 30),
      line("REFINEMENT CENTER CURRENTBALANCE: 10.O53,914 AUEC", 582, 20, 1138),
      line("LINDINIUM 305 480 317 163", 346, 217, 381),
      line("TIME REMAINING 56m 43s", 307, 707, 432, 35),
    ],
  });
  assert.equal(accepted.kind, "refinery");
  assert.equal(accepted.station, null);
  assert.equal(accepted.jobs[0].remainingSec, 3403);
  assert.equal(accepted.jobs[0].material, "Lindinium");
  assert.equal(accepted.refineryDiagnostic.reason, "accepted");

  const rejected = await post(port, {
    ocrRegion: "refinery", w: 3226, h: 1685,
    lines: [line("REFINEMENT CENTER", 1200, 80, 420), line("PROCESSING", 280, 920)],
  });
  assert.equal(rejected.kind, "none");
  assert.equal(rejected.refineryDiagnostic.reason, "time-remaining-not-found");
} finally {
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
  await exited;
  clearTimeout(timer);
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log("Candidate 15 packaged refinery parser, rejection diagnostics, and stale-authority scheduling passed");
})().catch((error) => { console.error(error); process.exit(1); });
