#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = process.argv[2];
if (!root) throw new Error("usage: apply-alpha22-candidate8j.cjs <staged-candidate8i-root>");
const must = (value, message) => { if (!value) throw new Error(`Candidate 8j apply: ${message}`); };
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const files = {
  package: path.join(root, "app/package.json"),
  capture: path.join(root, "app/electron/capture.cjs"),
  main: path.join(root, "app/electron/main.cjs"),
  presence: path.join(root, "app/electron/mining-vehicle-presence.cjs"),
  server: path.join(root, "app/server/server.mjs"),
};
const expectedSha256 = Object.freeze({
  package: "9b587ae4b62bf339f30b7f29f325682e25f0674dc1eb2226a184c459b5643246",
  capture: "4a46acffc6591fe2bdc1ca520a5941eff1fce9960167c971a50ab67fd00b747b",
  main: "d3f9a1122eb3781c616a757421912edb7402ab30228da14cf291aca063ceebdf",
  presence: "3400d706a7c8b8d8d783c2cdc39051e4958def1a0aa95da6ed98bfca36a64cf8",
  server: "792bff21da3aa6f1453f6fad65c13dd17e40f9cfdd93c59e96c6e8b1c4b2a071",
});

const source = {};
for (const [name, file] of Object.entries(files)) {
  must(fs.existsSync(file), `missing ${path.relative(root, file)}`);
  source[name] = fs.readFileSync(file, "utf8");
  must(sha256(source[name]) === expectedSha256[name], `${name} is not the pinned Candidate 8i source`);
}

const helperSources = {
  localJson: {
    source: path.join(__dirname, "candidate8j-local-json-ipc.cjs"),
    target: path.join(root, "app/electron/local-json-ipc.cjs"),
    sha: "91313d462078e5653c45c032baa751f2a26c1a3eb28935bc724951bb3ba49f24",
  },
  resultTransport: {
    source: path.join(__dirname, "candidate8j-mining-result-transport.cjs"),
    target: path.join(root, "app/electron/mining-result-transport.cjs"),
    sha: "380274e0af93cef2b130f7ab9eda8a5725211f908c8c00acc8c3a6954b738dde",
  },
  presence: {
    source: path.join(__dirname, "candidate8j-mining-vehicle-presence.cjs"),
    target: files.presence,
    sha: "f28eb7ca09e3796e6564f90c4a5eb6066a8d13332fe2c9ad4e347f80c02a5cc9",
  },
  watchdog: {
    source: path.join(__dirname, "candidate8j-sidecar-watchdog.cjs"),
    target: path.join(root, "app/electron/sidecar-health-watchdog.cjs"),
    sha: "4d19352fd0c6f4c7f6aa4dfb8f2b8829bfb4c36ab1fedf0eb695ee337c5e2965",
  },
};
for (const [name, helper] of Object.entries(helperSources)) {
  must(fs.existsSync(helper.source), `missing ${path.basename(helper.source)}`);
  const value = fs.readFileSync(helper.source, "utf8");
  must(sha256(value) === helper.sha, `${name} helper source hash changed`);
  fs.writeFileSync(helper.target, value);
}

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  must(first >= 0, `${label} anchor missing`);
  must(text.indexOf(before, first + before.length) < 0, `${label} anchor is not unique`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

function replaceThrough(text, start, end, replacement, label) {
  const first = text.indexOf(start);
  must(first >= 0, `${label} start anchor missing`);
  must(text.indexOf(start, first + start.length) < 0, `${label} start anchor is not unique`);
  const last = text.indexOf(end, first + start.length);
  must(last >= 0, `${label} end anchor missing`);
  return text.slice(0, first) + replacement + text.slice(last);
}

const pkg = JSON.parse(source.package);
must(pkg.version === "0.1.44-r31.alpha22.candidate8i", `expected exact Candidate 8i base, got ${pkg.version}`);
pkg.version = "0.1.44-r31.alpha22.candidate8j";
pkg.description = "ArchVerse Alpha22 Candidate 8j: nonblocking Mining commit transport and sidecar recovery";
source.package = JSON.stringify(pkg, null, 2) + "\n";

source.capture = replaceOnce(
  source.capture,
  'const { createMiningVehiclePresenceClient } = require("./mining-vehicle-presence.cjs"); // ARCHVERSE_LINUX_MINING_VEHICLE_PRESENCE_LIVENESS',
  `const { createMiningVehiclePresenceClient } = require("./mining-vehicle-presence.cjs"); // ARCHVERSE_LINUX_MINING_VEHICLE_PRESENCE_LIVENESS
const { createMiningResultTransport, classifyMiningOcrLines } = require("./mining-result-transport.cjs"); // ARCHVERSE_LINUX_MINING_RESULT_TRANSPORT_V1`,
  "Mining transport import",
);
source.capture = replaceOnce(
  source.capture,
  "function startFabCapture({ port, configDir, onStatus, devTools = false }) {",
  "function startFabCapture({ port, configDir, onStatus, onSidecarTransportFailure, devTools = false }) {",
  "sidecar failure callback",
);
source.capture = replaceOnce(
  source.capture,
  `  const vehiclePresenceClient = createMiningVehiclePresenceClient({
    endpoint: \`http://localhost:\${port}/api/vehicle-presence\`,
    fetchImpl: fetch,
    logger: console,
    cacheMs: VEHICLE_PRESENCE_CACHE_MS,
  }); // ARCHVERSE_LINUX_MINING_VEHICLE_PRESENCE_STREAM`,
  `  const vehiclePresenceClient = createMiningVehiclePresenceClient({
    endpoint: \`http://127.0.0.1:\${port}/api/vehicle-presence\`,
    logger: console,
    cacheMs: VEHICLE_PRESENCE_CACHE_MS,
  }); // ARCHVERSE_LINUX_MINING_VEHICLE_PRESENCE_BOUNDED_GET`,
  "bounded vehicle presence GET",
);
source.capture = replaceOnce(
  source.capture,
  "  const linuxOcrLastAt = new Map();",
  `  // ARCHVERSE_LINUX_MINING_NONBLOCKING_COMMIT: parsing and authoritative commit no longer
  // extend the capture/OCR tick. The helper retains at most one newest result during failure.
  let lastMiningCommitLogAt = 0;
  let lastMiningCommitKey = "";
  const miningResultTransport = createMiningResultTransport({
    endpoint: \`http://127.0.0.1:\${port}/api/screen-read\`,
    logger: console,
    timeoutMs: 650,
    onResponse: (response, item) => {
      if (response?.vehiclePresence) vehiclePresenceClient.accept(response.vehiclePresence, "mining-commit");
      const local = item?.context?.localResult;
      const signature = Number(response?.signature ?? local?.signature);
      const commit = response?.miningCommit;
      const key = Number.isFinite(signature)
        ? \`\${signature}:\${commit?.confirmed === true ? 1 : 0}:\${commit?.used === true ? 1 : 0}\`
        : \`\${response?.kind || "none"}\`;
      const at = Date.now();
      if (key !== lastMiningCommitKey || at - lastMiningCommitLogAt >= 5000) {
        lastMiningCommitKey = key;
        lastMiningCommitLogAt = at;
        if (Number.isFinite(signature)) {
          console.log(\`[mining-commit] signature \${signature} acknowledged; authority=\${commit?.confirmed === true ? "vehicle" : "on-foot"} result=\${commit?.used === true ? "used" : "refused"} source=\${commit?.source || response?.vehiclePresence?.source || "none"}\`);
        } else if (local?.kind !== "none") {
          console.log(\`[mining-commit] sidecar classified local \${local.kind} as \${response?.kind || "none"}; no Mining state committed\`);
        }
      }
    },
    onFailure: (error, state) => {
      try { onSidecarTransportFailure?.({ route: "/api/screen-read", error: String(error?.message || error), ...state }); }
      catch (observerError) { console.warn("[mining-ipc] sidecar watchdog callback failed:", observerError?.message || observerError); }
    },
  });
  const linuxOcrLastAt = new Map();`,
  "nonblocking Mining result transport",
);

source.capture = replaceThrough(
  source.capture,
  "    // A diagnostic liveness ping, for an intermittent mining-loop hang that isn't root-caused yet.",
  "    try {\n      const have = fab ? await ensureRemoteHave() : null;",
  `    // ARCHVERSE_LINUX_MINING_ELECTRON_HEARTBEAT: diagnostics stay visible even when the
    // sidecar is the failed component. Keep the record compact and bounded in electron.log.
    if (mining && Date.now() - lastHeartbeatAt > HEARTBEAT_MS) {
      lastHeartbeatAt = Date.now();
      const completed = tickStages.splice(0);
      const totals = completed.map((row) => Number(row?.total)).filter(Number.isFinite);
      const average = totals.length ? Math.round(totals.reduce((sum, value) => sum + value, 0) / totals.length) : 0;
      const maximum = totals.length ? Math.max(...totals) : 0;
      const transport = miningResultTransport.stats();
      console.log(\`[mining-heartbeat] rate=\${rate}ms last=\${lastTickMs}ms samples=\${totals.length} average=\${average}ms max=\${maximum}ms ipc_ack=\${transport.acknowledged} ipc_failures=\${transport.consecutiveFailures} ipc_pending=\${transport.pending ? 1 : 0} capture=\${_lastOcrCaptureInfo?.method || "unknown"}\`);
    }
`,
  "electron-owned Mining heartbeat",
);

source.capture = replaceThrough(
  source.capture,
  '          const r3 = await fetch(`http://localhost:${port}/api/screen-read`, {',
  '          const rr3Observed = typeof rr3.observedSignature === "number" ? rr3.observedSignature : null;',
  `          // ARCHVERSE_LINUX_MINING_LOCAL_ADMISSION: the exact catalog and false-context rules
          // run beside OCR. The authoritative sidecar repeats the same checks before state changes.
          const parseStartedAt = Date.now();
          const rr3 = classifyMiningOcrLines(lines, {
            width: region.width,
            offsetX: region.x,
            offsetY: region.y,
          });
          stage.miningParse = Date.now() - parseStartedAt;
          const miningPayload = {
            lines, w: region.width, h: region.height, miningCrop: true,
            commitMining: true, pollMs: rate,
            ocrRegion: "resourceSignature", offsetX: region.x, offsetY: region.y,
            frameW: cap.width, frameH: cap.height,
          };
          miningResultTransport.submit(miningPayload, {
            localResult: rr3,
            captureMethod: cap.method,
            queuedAt: Date.now(),
          });
          stage.miningIpc = "queued";
`,
  "nonblocking local Mining admission",
);
source.capture = replaceOnce(
  source.capture,
  `              const commitState = rr3.miningCommit?.handled === true
                ? \`integrated:\${rr3.miningCommit.used === true ? "used" : "refused"}\`
                : "deferred";`,
  '              const commitState = "queued";',
  "queued Mining diagnostic",
);
source.capture = replaceOnce(
  source.capture,
  `            read = { ...read, kind: "mineable", signature: rr3.signature, raw: rr3.raw,
              pin: rr3.pin, text: rr3.text, miningCommit: rr3.miningCommit ?? null };`,
  `            read = { ...read, kind: "mineable", signature: rr3.signature, raw: rr3.raw,
              pin: rr3.pin, text: rr3.text, miningTransportQueued: true };`,
  "queued result state",
);
source.capture = replaceOnce(
  source.capture,
  '            console.warn("[mining-ocr] bounded OCR attempt failed; stale frame discarded and worker recovery scheduled:", e && e.message); // ARCHVERSE_LINUX_MINING_OCR_RECOVERY',
  '            console.warn("[mining-ocr] capture/OCR/local-parse stage failed; stale frame discarded and OCR worker recovery scheduled:", e && e.message); // ARCHVERSE_LINUX_MINING_OCR_RECOVERY',
  "stage-specific Mining OCR error",
);
source.capture = replaceOnce(
  source.capture,
  `      const currentTickMs = Math.max(1, Date.now() - busyAt);
      const floor = Math.max(FAST_MS, Math.round(currentTickMs * 1.5));
      const miningIdleCeiling = process.platform === "linux" && mining && vehiclePresence.active === true ? MINING_VEHICLE_IDLE_MS : POLL_MS;
      const want = Date.now() < fastUntil ? Math.min(miningIdleCeiling, floor) : miningIdleCeiling;`,
  `      const currentTickMs = Math.max(1, Date.now() - busyAt);
      // ARCHVERSE_LINUX_MINING_STABLE_CADENCE: Linux Mining has two deliberate rates. A valid
      // signature uses 900ms; in-vehicle acquisition uses 1200ms. Single-flight OCR prevents
      // overlap, so small timing jitter cannot produce 909/913/941ms scheduler flapping.
      const linuxMiningRate = vehiclePresence.active === true
        ? (Date.now() < fastUntil ? FAST_MS : MINING_VEHICLE_IDLE_MS)
        : POLL_MS;
      const nonLinuxFloor = Math.max(FAST_MS, Math.min(POLL_MS, Math.ceil(currentTickMs * 1.5 / 100) * 100));
      const want = process.platform === "linux" && mining
        ? linuxMiningRate
        : (Date.now() < fastUntil ? nonLinuxFloor : POLL_MS);`,
  "stable Linux Mining cadence",
);
source.capture = replaceOnce(
  source.capture,
  '        const integratedMiningCommit = process.platform === "linux" && read.miningCommit?.handled === true;',
  '        const integratedMiningCommit = process.platform === "linux" && read.miningTransportQueued === true;',
  "asynchronous commit ownership",
);
source.capture = replaceOnce(
  source.capture,
  "    vehiclePresenceClient.close?.();\n    _rapidFailureReporter = null;",
  "    vehiclePresenceClient.close?.();\n    miningResultTransport.close();\n    _rapidFailureReporter = null;",
  "Mining transport cleanup",
);
source.capture = replaceOnce(
  source.capture,
  `  let lastHeartbeatAt = 0;    // diagnostic liveness ping while an intermittent mining-loop hang
  const HEARTBEAT_MS = 15000; // is still being tracked down — see the comment at the call site.
  //                             Safe to remove once that's understood; harmless (one small POST
  //                             every ~15s) to leave in until then.`,
  `  let lastHeartbeatAt = 0;    // last compact diagnostic written directly to electron.log
  const HEARTBEAT_MS = 15000;    // bounded evidence even when the sidecar cannot answer`,
  "direct heartbeat comments",
);
source.capture = replaceThrough(
  source.capture,
  "      // Self-tuning, because this runs over a RUNNING GAME and a fixed rate is a guess about",
  "      const currentTickMs = Math.max(1, Date.now() - busyAt);",
  `      // Linux Mining uses exact acquisition and locked rates. The single-flight scheduler
      // already prevents overlapping work. Windows retains a rounded load-sensitive rate.
`,
  "stable cadence comments",
);

source.main = replaceOnce(
  source.main,
  'const { startFabCapture, getOcrCaptureInfo } = require("./capture.cjs"); // ARCHVERSE_LINUX_OCR_CAPTURE_INFO',
  `const { startFabCapture, getOcrCaptureInfo } = require("./capture.cjs"); // ARCHVERSE_LINUX_OCR_CAPTURE_INFO
const { createSidecarHealthWatchdog } = require("./sidecar-health-watchdog.cjs"); // ARCHVERSE_LINUX_SIDECAR_HEALTH_WATCHDOG`,
  "sidecar watchdog import",
);
source.main = replaceOnce(
  source.main,
  `function announceSidecar(state) {
  sidecarState = state;
  try {
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send("overlay:sidecar-state", state);
  } catch { /* window went away mid-send */ }
}
async function respawnAndConfirm() {`,
  `function announceSidecar(state) {
  sidecarState = state;
  try {
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send("overlay:sidecar-state", state);
  } catch { /* window went away mid-send */ }
}

// ARCHVERSE_LINUX_SIDECAR_HEALTH_WATCHDOG: Mining transport failures are verified through an
// independent short /api/instance request before the owned child may be restarted.
const sidecarHealthWatchdog = createSidecarHealthWatchdog({
  endpoint: \`http://127.0.0.1:\${PORT}/api/instance\`,
  instanceId: INSTANCE_ID,
  getChild: () => server,
  logger: console,
  restartChild: (child, details) => {
    if (child !== server || child?.exitCode != null || child?.killed === true) return;
    const why = String(details?.healthError || details?.error || "unresponsive").slice(0, 220);
    noteInSidecarLog(\`health watchdog restarting unresponsive server pid \${child.pid || "?"}: \${why}\`);
    console.error(\`[sidecar-watchdog] restarting unresponsive owned sidecar pid=\${child.pid || "?"}: \${why}\`);
    announceSidecar({ down: true, retrying: true });
    try { child.kill("SIGTERM"); } catch (error) { console.error("[sidecar-watchdog] SIGTERM failed:", String(error)); }
    const killTimer = setTimeout(() => {
      if (child === server && child.exitCode == null) {
        try { child.kill("SIGKILL"); } catch {}
      }
    }, 2000);
    killTimer.unref?.();
  },
});

async function respawnAndConfirm() {`,
  "sidecar watchdog lifecycle",
);
source.main = replaceOnce(
  source.main,
  `      onStatus: (s) => {
        latestOcrStatus = { ...s, at: Number(s?.at) || Date.now() };`,
  `      onSidecarTransportFailure: (details) => sidecarHealthWatchdog.noteTransportFailure(details),
      onStatus: (s) => {
        latestOcrStatus = { ...s, at: Number(s?.at) || Date.now() };`,
  "Mining watchdog callback wiring",
);
source.main = replaceOnce(
  source.main,
  "    if (serverRestartTimer) clearTimeout(serverRestartTimer);",
  "    if (serverRestartTimer) clearTimeout(serverRestartTimer);\n    sidecarHealthWatchdog.close();",
  "sidecar watchdog cleanup",
);

source.server = replaceOnce(
  source.server,
  `// ARCHVERSE_LINUX_MINING_VEHICLE_PRESENCE_STREAM: push Game.log authority changes instead of
// polling localhost on every capture tick.
var vehiclePresenceClients = /* @__PURE__ */ new Set();
function broadcastVehiclePresence() {
  const message = \`data: \${JSON.stringify(vehiclePresenceInfo())}\\n\\n\`;
  for (const client of vehiclePresenceClients) {
    try { client.write(message); } catch { vehiclePresenceClients.delete(client); }
  }
}
`,
  "// ARCHVERSE_LINUX_MINING_VEHICLE_PRESENCE_BOUNDED_GET: no long-lived Mining SSE socket.\n",
  "remove vehicle presence SSE state",
);
const broadcastUpdate = `  if (changed) {
    vehiclePresenceChangedAt = Date.now();
    broadcastVehiclePresence();
  }`;
let broadcastCount = 0;
source.server = source.server.replaceAll(broadcastUpdate, () => {
  broadcastCount += 1;
  return "  if (changed) vehiclePresenceChangedAt = Date.now();";
});
must(broadcastCount === 2, `expected two vehicle broadcast updates, found ${broadcastCount}`);
source.server = replaceThrough(
  source.server,
  '  if (url === "/api/vehicle-presence/events" && req.method === "GET") {',
  '  if (url === "/api/vehicle-presence" && req.method === "GET") {',
  "",
  "remove vehicle presence SSE endpoint",
);

for (const [name, file] of Object.entries(files)) {
  if (name === "presence") continue;
  fs.writeFileSync(file, source[name]);
}

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
]) must(source.capture.includes(marker), `capture marker missing: ${marker}`);
must(source.main.includes("ARCHVERSE_LINUX_SIDECAR_HEALTH_WATCHDOG"), "sidecar watchdog is not wired");
must(source.server.includes("ARCHVERSE_LINUX_MINING_CONTEXT_SAFE_RS_ADMISSION"), "context-safe RS admission missing");
must(!source.capture.includes("/api/vehicle-presence/events"), "capture still references vehicle SSE");
must(!source.server.includes("/api/vehicle-presence/events"), "server still exposes vehicle SSE");
must(!source.server.includes("vehiclePresenceClients"), "server still retains vehicle SSE clients");
must(!source.capture.includes('await fetch(`http://localhost:${port}/api/screen-read`, {\n            method: "POST",\n            headers: { "Content-Type": "application/json" },\n            // ARCHVERSE_LINUX_MINING_INLINE_COMMIT'), "Mining still waits on sidecar screen-read");
must(source.capture.includes('const commitState = "queued";'), "Mining queue diagnostic missing");
must(source.capture.includes("miningResultTransport.close()"), "Mining transport cleanup missing");

console.log("Candidate 8j applied: bounded GET vehicle state, nonblocking Mining commit, stable cadence, direct diagnostics, and verified sidecar recovery");
