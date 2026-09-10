import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.argv[2];
if (!root) throw new Error("usage: candidate8k-sidecar-supervision-selftest.mjs <root>");
const must = (value, message) => { if (!value) throw new Error(`Candidate 8k self-test: ${message}`); };
const settle = () => new Promise((resolve) => setImmediate(resolve));
const require = createRequire(import.meta.url);

const pkg = JSON.parse(await readFile(path.join(root, "app/package.json"), "utf8"));
const capture = await readFile(path.join(root, "app/electron/capture.cjs"), "utf8");
const main = await readFile(path.join(root, "app/electron/main.cjs"), "utf8");
const watchdogSource = await readFile(path.join(root, "app/electron/sidecar-health-watchdog.cjs"), "utf8");
const { createSidecarHealthWatchdog } = require(path.join(root, "app/electron/sidecar-health-watchdog.cjs"));

must(["0.1.44-r31.alpha22.candidate8k", "0.1.46-r31.alpha23.candidate1", "0.1.46-r31.alpha23.candidate2"].includes(pkg.version), `wrong package version ${pkg.version}`);
must(pkg.description.includes("field-safe sidecar supervision"), "package description does not identify the repair");
for (const marker of [
  "ARCHVERSE_LINUX_GAMESCOPE_PIPEWIRE_PERSISTENT_STREAM",
  "ARCHVERSE_LINUX_MINING_RESULT_TRANSPORT_V1",
  "ARCHVERSE_LINUX_MINING_NONBLOCKING_COMMIT",
  "ARCHVERSE_LINUX_MINING_LOCAL_ADMISSION",
  "ARCHVERSE_LINUX_MINING_STABLE_CADENCE",
  "ARCHVERSE_LINUX_MINING_ELECTRON_HEARTBEAT",
]) must(capture.includes(marker), `Candidate 8j Mining marker missing: ${marker}`);
must(capture.includes('onSidecarTransportSuccess?.({ route: "/api/screen-read" })'),
  "successful Mining IPC does not clear the watchdog episode");
must(watchdogSource.includes("ARCHVERSE_LINUX_SIDECAR_HEALTH_WATCHDOG_V2"),
  "field-safe watchdog implementation is missing");
must(main.includes("ARCHVERSE_LINUX_WATCHDOG_RECOVERY_NOT_CRASH"),
  "controlled watchdog recovery is not separated from crashes");
must(main.includes("watchdogRecoveryChild = child"), "watchdog termination is not marked as controlled");
must(main.includes("const wasWatchdogRecovery = watchdogRecoveryChild === launchedServer"),
  "server exit handler cannot identify controlled recovery");
must(main.includes("Only spontaneous exits consume the bounded crash budget"),
  "spontaneous crash budget is not isolated");
must(main.includes("sidecar stable for 60000ms — spontaneous crash budget reset"),
  "stable sidecar does not reset the crash budget");
must(main.includes('markSidecarHealthy(child, "respawn-ready")'), "respawn readiness is not recorded");
must(main.includes('markSidecarHealthy(server, "initial-ready")'), "initial readiness is not recorded");

let clock = 0;
let child = { pid: 8001, exitCode: null, killed: false };
let probeShouldPass = false;
let restarts = 0;
const warnings = [];
const watchdog = createSidecarHealthWatchdog({
  endpoint: "http://127.0.0.1:27883/api/instance",
  instanceId: "candidate8k-test",
  getChild: () => child,
  restartChild: () => { restarts += 1; },
  requestImpl: async () => {
    if (!probeShouldPass) throw new Error("simulated health timeout");
    return { instance: "candidate8k-test" };
  },
  logger: { log() {}, warn(message) { warnings.push(message); } },
  now: () => clock,
  startupGraceMs: 15000,
  failureWindowMs: 10000,
  minimumFailureDurationMs: 10000,
  restartCooldownMs: 60000,
});

watchdog.noteChildStarted(child);
clock = 14000;
watchdog.noteTransportFailure({ route: "/api/screen-read" });
await settle();
must(warnings.length === 0 && restarts === 0, "startup grace allowed a health strike");

clock = 16000;
watchdog.noteTransportFailure({ route: "/api/screen-read" });
await settle();
must(watchdog.stats().consecutiveFailures === 1, "first post-grace failure was not recorded");
probeShouldPass = true;
clock = 17000;
watchdog.noteTransportFailure({ route: "/api/screen-read" });
await settle();
must(watchdog.stats().consecutiveFailures === 0 && restarts === 0,
  "successful independent probe did not clear the episode");

probeShouldPass = false;
clock = 20000;
watchdog.noteTransportFailure({ route: "/api/screen-read" });
await settle();
clock = 31001;
watchdog.noteTransportFailure({ route: "/api/screen-read" });
await settle();
must(watchdog.stats().consecutiveFailures === 1 && restarts === 0,
  "the Candidate 8j stale counter survived beyond its failure window");

watchdog.noteTransportSuccess({ route: "/api/screen-read" });
must(watchdog.stats().consecutiveFailures === 0, "successful Mining transport did not clear the episode");

for (const at of [40000, 44000, 48000, 52000]) {
  clock = at;
  watchdog.noteTransportFailure({ route: "/api/screen-read" });
  await settle();
}
must(restarts === 1, `continuous confirmed outage restart count is ${restarts}, expected 1`);

child = { pid: 8002, exitCode: null, killed: false };
clock = 53000;
watchdog.noteChildStarted(child);
for (const at of [54000, 58000, 62000]) {
  clock = at;
  watchdog.noteTransportFailure({ route: "/api/screen-read" });
  await settle();
}
must(restarts === 1, "replacement child was probed or restarted during readiness grace");

clock = 69000;
for (const at of [69000, 73000, 77000, 81000]) {
  clock = at;
  watchdog.noteTransportFailure({ route: "/api/screen-read" });
  await settle();
}
must(restarts === 1, "restart cooldown allowed a second controlled restart");

probeShouldPass = true;
clock = 82000;
watchdog.noteTransportFailure({ route: "/api/screen-read" });
await settle();
must(watchdog.stats().consecutiveFailures === 0, "recovered replacement retained health strikes");
watchdog.close();

console.log("Candidate 8k self-test OK: stale strikes expire, successes reset, startup grace holds, continuous outages restart once, cooldown holds, and watchdog recovery does not consume the crash budget");
