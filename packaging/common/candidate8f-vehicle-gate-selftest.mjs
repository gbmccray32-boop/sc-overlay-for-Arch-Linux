import { readFile, writeFile, appendFile, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const root = process.argv[2];
if (!root) throw new Error("usage: candidate8f-vehicle-gate-selftest.mjs <root>");
const must = (v, m) => { if (!v) throw new Error(`Candidate 8f self-test: ${m}`); };
const capture = await readFile(path.join(root, "app/electron/capture.cjs"), "utf8");
const server = await readFile(path.join(root, "app/server/server.mjs"), "utf8");
const pkg = JSON.parse(await readFile(path.join(root, "app/package.json"), "utf8"));
const require = createRequire(import.meta.url);
const catalog = require(path.join(root, "app/electron/mining-signature-catalog.cjs"));

must(pkg.version === "0.1.44-r31.alpha22.candidate8f", `wrong package version ${pkg.version}`);
must(capture.includes("ARCHVERSE_LINUX_GAMELOG_VEHICLE_MINING_CADENCE"), "vehicle cadence marker missing");
must(capture.includes("ARCHVERSE_LINUX_GAMELOG_VEHICLE_MINING_GATE"), "vehicle gate marker missing");
must(capture.includes("ARCHVERSE_LINUX_GAMELOG_VEHICLE_NUMERIC_GATE"), "vehicle numeric gate marker missing");
must(capture.includes("ARCHVERSE_LINUX_MINING_VEHICLE_RS_AUTHORITY"), "vehicle+RS authority marker missing");
must(capture.includes('method: "gamelog-vehicle+rs"'), "vehicle+RS method missing");
must(capture.includes("const MINING_VEHICLE_IDLE_MS = 1200;"), "vehicle Mining cadence changed");
must(capture.includes("/api/vehicle-presence"), "Electron vehicle-presence read missing");
must(!capture.includes("await archVerseScanMode(shot"), "radar detector is still in the Mining runtime path");
must(!capture.includes('method: "pipewire-radar+rs"'), "old radar+RS commit path still exists");
must(!capture.includes("MINING_RADAR_LATCH_MS"), "radar witness latch still controls Mining");
must(!capture.includes("MINING_NUMERIC_FALLBACK_MS"), "radar-led numeric fallback still controls Mining");
must(server.includes("ARCHVERSE_LINUX_GAMELOG_VEHICLE_PRESENCE"), "server vehicle presence state missing");
must(server.includes("ARCHVERSE_LINUX_GAMELOG_VEHICLE_PRESENCE_API"), "vehicle presence API missing");
must(server.includes("ARCHVERSE_LINUX_MINING_VEHICLE_RS_AUTHORITY_SERVER"), "server vehicle+RS marker missing");
must(server.includes("in-vehicle + current-RS authority required"), "server refusal contract is stale");
must(server.includes('ev.action === "grant"'), "vehicle-control grant is not authoritative");
must(server.includes('ev.action === "release"'), "vehicle-control release is not handled");
must(server.includes("setShipChannelPresence(chan)"), "ship comms occupancy hook missing");

must(catalog.classifyMiningSignature(11700).valid, "11700 lost from current RS catalogue");
must(catalog.classifyMiningSignature(17200).valid, "17200 lost from current RS catalogue");
must(catalog.classifyMiningSignature(16000).valid, "16000 lost from current RS catalogue");
must(!catalog.classifyMiningSignature(2504).valid, "2504 false-positive returned");
must(!catalog.classifyMiningSignature(4975).valid, "4975 false-positive returned");

const td = await mkdtemp(path.join(os.tmpdir(), "archverse-c8f-selftest-"));
const gameLog = path.join(td, "game.log");
const config = path.join(td, "config.json");
await writeFile(gameLog, `<2026-09-04T01:00:00.000Z> [Notice] <Startup> Candidate 8f self-test\n`);
await writeFile(config, JSON.stringify({
  logPath: gameLog,
  syncToken: "",
  syncEnabled: false,
  miningAssistant: true,
  fabCapture: false,
  revertThemeOnFoot: false,
}));
const port = 22000 + (process.pid % 12000);
const child = spawn(process.execPath, [path.join(root, "app/server/server.mjs")], {
  env: { ...process.env, SC_TRACKER_CONFIG_DIR: td, PORT: String(port), SC_SYNC_BASE: "http://127.0.0.1:9" },
  stdio: ["ignore", "pipe", "pipe"],
});
let childLog = "";
child.stdout.on("data", b => { childLog += b.toString(); });
child.stderr.on("data", b => { childLog += b.toString(); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJson(route, attempts = 30) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(500) });
      if (r.ok) return await r.json();
      last = new Error(`${route} HTTP ${r.status}`);
    } catch (e) { last = e; }
    await sleep(150);
  }
  throw new Error(`${route} unavailable: ${last?.message || last}\n${childLog}`);
}
async function appendAndWait(line, predicate, label) {
  await appendFile(gameLog, line + "\n");
  let last;
  for (let i = 0; i < 24; i++) {
    await sleep(150);
    last = await getJson("/api/vehicle-presence", 3);
    if (predicate(last)) return last;
  }
  throw new Error(`${label} was not observed; last=${JSON.stringify(last)}\n${childLog}`);
}
try {
  let p = await getJson("/api/vehicle-presence");
  must(p.active === false && p.source === "none", `on-foot startup incorrectly active: ${JSON.stringify(p)}`);

  p = await appendAndWait(
    `<2026-09-04T01:00:01.000Z> [Notice] <Comms> You have joined channel 'Drake Cutlass Black : TestPilot' [Team_CoreGameplayFeatures][Comms]`,
    j => j.active === true && j.source === "ship-channel" && j.ship === "Drake Cutlass Black",
    "ship-channel enter",
  );
  must(p.controlled.length === 0, "ship-channel enter invented a vehicle-control token");

  p = await appendAndWait(
    `<2026-09-04T01:00:02.000Z> [Notice] <Comms> You have left the channel 'Drake Cutlass Black : TestPilot' [Team_CoreGameplayFeatures][Comms]`,
    j => j.active === false && j.source === "none",
    "ship-channel leave",
  );
  const shipView = await getJson("/api/ship");
  must(shipView.theme === "drake", `theme did not remain Drake for separation test: ${JSON.stringify(shipView)}`);

  const requestLine = `<2026-09-04T01:00:03.000Z> [Notice] <Vehicle Control Flow> CVehicleMovementBase::SetDriver: Local client node [204772220757] requesting control token for 'TMBL_Cyclone_98765' [98765] [Team_CGP4][Vehicle]`;
  p = await appendAndWait(requestLine, j => j.active === false, "vehicle request must not arm Mining");
  must(p.active === false, "vehicle request became authority");

  p = await appendAndWait(
    `<2026-09-04T01:00:04.000Z> [Notice] <Vehicle Control Flow> CVehicle::Initialize::<lambda_1>: Local client node [204772220757] granted control token for 'TMBL_Cyclone_98765' [98765] [Team_CGP4][Vehicle]`,
    j => j.active === true && j.source === "vehicle-control" && j.controlled?.[0]?.model === "TMBL_Cyclone",
    "vehicle-control grant",
  );
  must(p.controlled[0].entityId === "98765", "vehicle entity id drifted");

  await appendAndWait(
    `<2026-09-04T01:00:05.000Z> [Notice] <Vehicle Control Flow> CVehicleMovementBase::ClearDriver: Local client node [204772220757] releasing control token for 'TMBL_Cyclone_98765' [98765] [Team_CGP4][Vehicle]`,
    j => j.active === false && j.source === "none" && j.controlled.length === 0,
    "vehicle-control release",
  );
} finally {
  child.kill("SIGTERM");
  await Promise.race([new Promise(r => child.once("exit", r)), sleep(1500)]);
  if (child.exitCode == null) child.kill("SIGKILL");
  await rm(td, { recursive: true, force: true });
}

console.log("Candidate 8f self-test OK: Game.log ship/vehicle presence gates current-RS Mining; radar is not in the runtime authority path");
