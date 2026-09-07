#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = process.argv[2];
if (!root) throw new Error("usage: apply-alpha22-candidate8k.cjs <staged-candidate8j-root>");
const must = (value, message) => { if (!value) throw new Error(`Candidate 8k apply: ${message}`); };
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const files = {
  package: path.join(root, "app/package.json"),
  capture: path.join(root, "app/electron/capture.cjs"),
  main: path.join(root, "app/electron/main.cjs"),
  watchdog: path.join(root, "app/electron/sidecar-health-watchdog.cjs"),
};
const expectedSha256 = Object.freeze({
  package: "f7408f47149d6566cbb61a73867101578a180214dd7ba32ad9f17d7466e2d7fc",
  capture: "8eca965444f8f8ac2f4b78e288bd48cd903c2e2ff2f5a1854ef00672b6c2d186",
  main: "9c16fc4282d3ca3f670415cebbeb47f9d378421d235a00613336b95a54a424e2",
  watchdog: "4d19352fd0c6f4c7f6aa4dfb8f2b8829bfb4c36ab1fedf0eb695ee337c5e2965",
});

const source = {};
for (const [name, file] of Object.entries(files)) {
  must(fs.existsSync(file), `missing ${path.relative(root, file)}`);
  source[name] = fs.readFileSync(file, "utf8");
  must(sha256(source[name]) === expectedSha256[name], `${name} is not the pinned Candidate 8j source`);
}

const watchdogSource = path.join(__dirname, "candidate8k-sidecar-watchdog.cjs");
must(fs.existsSync(watchdogSource), "missing Candidate 8k watchdog source");
source.watchdog = fs.readFileSync(watchdogSource, "utf8");
must(sha256(source.watchdog) === "f247c428924d9f85257534073e165476ac9f4d650123a23d0ef63fdd2afd899c",
  "Candidate 8k watchdog source hash changed");

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  must(first >= 0, `${label} anchor missing`);
  must(text.indexOf(before, first + before.length) < 0, `${label} anchor is not unique`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

const pkg = JSON.parse(source.package);
must(pkg.version === "0.1.44-r31.alpha22.candidate8j", `expected exact Candidate 8j base, got ${pkg.version}`);
pkg.version = "0.1.44-r31.alpha22.candidate8k";
pkg.description = "ArchVerse Alpha22 Candidate 8k: field-safe sidecar supervision with Candidate 8j Mining";
source.package = JSON.stringify(pkg, null, 2) + "\n";

source.capture = replaceOnce(
  source.capture,
  "function startFabCapture({ port, configDir, onStatus, onSidecarTransportFailure, devTools = false }) {",
  "function startFabCapture({ port, configDir, onStatus, onSidecarTransportFailure, onSidecarTransportSuccess, devTools = false }) {",
  "sidecar success callback signature",
);
source.capture = replaceOnce(
  source.capture,
  `    onResponse: (response, item) => {
      if (response?.vehiclePresence) vehiclePresenceClient.accept(response.vehiclePresence, "mining-commit");`,
  `    onResponse: (response, item) => {
      try { onSidecarTransportSuccess?.({ route: "/api/screen-read" }); }
      catch (observerError) { console.warn("[mining-ipc] sidecar watchdog success callback failed:", observerError?.message || observerError); }
      if (response?.vehiclePresence) vehiclePresenceClient.accept(response.vehiclePresence, "mining-commit");`,
  "Mining success reset wiring",
);

source.main = replaceOnce(
  source.main,
  `let serverRestarts = 0;
let serverRestartTimer = null;`,
  `let serverRestarts = 0;
let serverRestartTimer = null;
let serverStableResetTimer = null;
let watchdogRecoveryChild = null; // ARCHVERSE_LINUX_WATCHDOG_RECOVERY_NOT_CRASH`,
  "sidecar lifecycle state",
);
source.main = replaceOnce(
  source.main,
  `  server.on("error", (err) => { noteInSidecarLog(\`server error: \${String(err)}\`); server = null; });
  server.on("exit", (code, signal) => {
    if (app.isQuitting) return;
    // Everything the app can do depends on it, so bring it back rather than leaving a window
    // that looks healthy and answers nothing.
    if (serverRestarts >= 5) {
      noteInSidecarLog(\`server exited (code \${code}, signal \${signal}) — 5 crashes, not restarting again\`);
      console.error("[electron] server has crashed 5 times — not restarting it again");
      announceSidecar({ down: true, retrying: false });
      return;
    }
    const wait = Math.min(30000, 1000 * 2 ** serverRestarts);
    serverRestarts += 1;
    noteInSidecarLog(\`server exited (code \${code}, signal \${signal}) — restarting in \${wait}ms (attempt \${serverRestarts})\`);
    console.error(\`[electron] server exited (code \${code}) — restarting in \${wait}ms, see \${SIDECAR_LOG}\`);
    announceSidecar({ down: true, retrying: true });
    serverRestartTimer = setTimeout(() => { void respawnAndConfirm(); }, wait);
  });`,
  `  const launchedServer = server;
  sidecarHealthWatchdog.noteChildStarted(launchedServer);
  launchedServer.on("error", (err) => {
    noteInSidecarLog(\`server error: \${String(err)}\`);
    if (server === launchedServer) server = null;
  });
  launchedServer.on("exit", (code, signal) => {
    if (app.isQuitting) return;
    if (serverStableResetTimer) { clearTimeout(serverStableResetTimer); serverStableResetTimer = null; }
    const wasWatchdogRecovery = watchdogRecoveryChild === launchedServer;
    if (wasWatchdogRecovery) {
      watchdogRecoveryChild = null;
      noteInSidecarLog(\`server exited (code \${code}, signal \${signal}) — controlled watchdog recovery; restarting in 1000ms\`);
      console.error("[electron] sidecar watchdog recovery completed — restarting in 1000ms");
      announceSidecar({ down: true, retrying: true });
      serverRestartTimer = setTimeout(() => { void respawnAndConfirm(); }, 1000);
      return;
    }
    // Only spontaneous exits consume the bounded crash budget.
    if (serverRestarts >= 5) {
      noteInSidecarLog(\`server exited (code \${code}, signal \${signal}) — 5 crashes, not restarting again\`);
      console.error("[electron] server has crashed 5 times — not restarting it again");
      announceSidecar({ down: true, retrying: false });
      return;
    }
    const wait = Math.min(30000, 1000 * 2 ** serverRestarts);
    serverRestarts += 1;
    noteInSidecarLog(\`server exited (code \${code}, signal \${signal}) — restarting in \${wait}ms (crash attempt \${serverRestarts})\`);
    console.error(\`[electron] server exited unexpectedly (code \${code}) — restarting in \${wait}ms, see \${SIDECAR_LOG}\`);
    announceSidecar({ down: true, retrying: true });
    serverRestartTimer = setTimeout(() => { void respawnAndConfirm(); }, wait);
  });`,
  "separate controlled recovery from crashes",
);
source.main = replaceOnce(
  source.main,
  `    announceSidecar({ down: true, retrying: true });
    try { child.kill("SIGTERM"); } catch (error) { console.error("[sidecar-watchdog] SIGTERM failed:", String(error)); }`,
  `    announceSidecar({ down: true, retrying: true });
    watchdogRecoveryChild = child;
    try { child.kill("SIGTERM"); } catch (error) {
      watchdogRecoveryChild = null;
      console.error("[sidecar-watchdog] SIGTERM failed:", String(error));
    }`,
  "mark controlled watchdog recovery",
);
source.main = replaceOnce(
  source.main,
  `async function respawnAndConfirm() {
  startServer();
  if (await waitForServer(60)) announceSidecar({ down: false, retrying: false });
}`,
  `function markSidecarHealthy(child, source) {
  if (!child || child !== server || child.exitCode != null || child.killed === true) return;
  sidecarHealthWatchdog.noteTransportSuccess({ source });
  if (serverStableResetTimer) clearTimeout(serverStableResetTimer);
  serverStableResetTimer = setTimeout(() => {
    if (child === server && child.exitCode == null && child.killed !== true) {
      if (serverRestarts > 0) noteInSidecarLog("sidecar stable for 60000ms — spontaneous crash budget reset");
      serverRestarts = 0;
    }
  }, 60000);
  serverStableResetTimer.unref?.();
}

async function respawnAndConfirm() {
  startServer();
  const child = server;
  if (await waitForServer(60)) {
    announceSidecar({ down: false, retrying: false });
    markSidecarHealthy(child, "respawn-ready");
  }
}`,
  "sidecar stable recovery",
);
source.main = replaceOnce(
  source.main,
  `    if (!up) {
      console.error("[electron] server did not come up on :" + PORT);`,
  `    if (up) markSidecarHealthy(server, "initial-ready");
    if (!up) {
      console.error("[electron] server did not come up on :" + PORT);`,
  "initial sidecar readiness",
);
source.main = replaceOnce(
  source.main,
  `      onSidecarTransportFailure: (details) => sidecarHealthWatchdog.noteTransportFailure(details),
      onStatus: (s) => {`,
  `      onSidecarTransportFailure: (details) => sidecarHealthWatchdog.noteTransportFailure(details),
      onSidecarTransportSuccess: (details) => sidecarHealthWatchdog.noteTransportSuccess(details),
      onStatus: (s) => {`,
  "Mining watchdog success callback",
);
source.main = replaceOnce(
  source.main,
  `    if (serverRestartTimer) clearTimeout(serverRestartTimer);
    sidecarHealthWatchdog.close();`,
  `    if (serverRestartTimer) clearTimeout(serverRestartTimer);
    if (serverStableResetTimer) clearTimeout(serverStableResetTimer);
    sidecarHealthWatchdog.close();`,
  "stable timer cleanup",
);

for (const [name, file] of Object.entries(files)) fs.writeFileSync(file, source[name]);
console.log("Candidate 8k apply OK: Candidate 8j Mining preserved; sidecar supervision repaired");
