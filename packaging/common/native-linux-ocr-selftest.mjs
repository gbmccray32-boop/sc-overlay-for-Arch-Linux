import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = process.argv[2];
if (!root) throw new Error('usage: native-linux-ocr-selftest.mjs <staged-app-root>');

const require = createRequire(import.meta.url);
const capturePath = path.join(root, 'app/electron/capture.cjs');
const runtimePath = path.join(root, 'app/electron/native-linux-ocr.cjs');
const mainPath = path.join(root, 'app/electron/main.cjs');
const preloadPath = path.join(root, 'app/electron/preload.cjs');
const serverPath = path.join(root, 'app/server/server.mjs');
const managerPath = path.join(root, 'app/server/overlay/linux-ocr-region-manager.js');
const missionsPath = path.join(root, 'app/server/overlay/missions.html');

for (const p of [capturePath, runtimePath, mainPath, preloadPath, serverPath, managerPath]) {
  const checked = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
  if (checked.status !== 0) throw new Error(`syntax check failed for ${path.relative(root, p)}:\n${checked.stderr || checked.stdout}`);
}

const [capture, runtimeText, main, preload, server, manager, missions] = await Promise.all(
  [capturePath, runtimePath, mainPath, preloadPath, serverPath, managerPath, missionsPath]
    .map((p) => readFile(p, 'utf8')),
);

function must(value, message) { if (!value) throw new Error(`Native Linux OCR contract: ${message}`); }
const keys = ['resourceSignature', 'fabricator', 'mission', 'claimContext', 'refinery'];

must(runtimeText.includes('ARCHVERSE_LINUX_OCR_CONTRACT_V1'), 'runtime contract marker missing');
for (const key of keys) must(runtimeText.includes(`${key}:`), `default ROI missing: ${key}`);
must(runtimeText.indexOf('await ocrRapidLines(imagePath)') >= 0, 'RapidOCR primary call missing');
const rapidAt = runtimeText.indexOf('await ocrRapidLines(imagePath)');
const catchAt = runtimeText.indexOf('catch (error)', rapidAt);
const tessAt = runtimeText.indexOf('tesseractLines(imagePath', catchAt);
must(catchAt > rapidAt && tessAt > catchAt, 'Tesseract is not structurally failure-only after RapidOCR');
must(runtimeText.includes("'-l', 'eng'"), 'Tesseract English language selection missing');
must(runtimeText.includes('tessedit_char_whitelist=0123456789,. '), 'numeric resource fallback whitelist missing');

must(capture.includes('ARCHVERSE_LINUX_PER_WIDGET_OCR_REGIONS'), 'per-widget Linux crop execution missing');
// Candidate 3+ intentionally gives each OCR consumer its own bounded lane. Validate the current
// architecture rather than the pre-lane shared `linuxOcr.readCrop` spelling.
must(capture.includes('ARCHVERSE_LINUX_OCR_INDEPENDENT_LANES'), 'independent Linux OCR lane contract missing');
must(capture.includes('linuxOcrLane(key).readCrop'), 'Linux feature crop reader is not lane-isolated');
must(capture.includes('linuxOcrLane("resourceSignature").ocrLines(tmpMiningCrop'), 'resource signature is not using its dedicated Linux OCR lane');
must(capture.includes('linuxOcrRegionPixels(cfg, "resourceSignature"'), 'resource signature is not using its named ROI');
must(capture.includes('ARCHVERSE_LINUX_NO_FULL_FRAME_OCR_ARCHIVE'), 'Linux Fabricator archive is not crop-only');
must(capture.includes('process.platform === "linux"'), 'Linux execution branch missing');
must(capture.includes('process.platform === "win32"') || server.includes('process.platform === "win32"'), 'Windows-only branch is not explicit');

must(server.includes('ARCHVERSE_LINUX_NO_WINDOWS_MEDIA_OCR'), 'Win32-only Windows.Media.Ocr gate missing');
must(server.includes('process.platform === "win32" && typeof body.path === "string"'), 'path-based Windows OCR can execute outside Windows');
must(server.includes('ARCHVERSE_LINUX_OCR_REGION_CONFIG'), 'independent ROI config missing');
for (const key of keys) must(server.includes(key), `server config does not know ROI ${key}`);

must(main.includes('ARCHVERSE_LINUX_OCR_CAPTURE_INFO') && main.includes('overlay:ocr-capture-info'), 'bound-game ROI geometry IPC missing');
must(preload.includes('getOcrCaptureInfo'), 'ROI geometry bridge missing from preload');
must(manager.includes('ARCHVERSE_LINUX_PER_WIDGET_OCR_REGION_UI'), 'per-widget ROI calibration manager missing');
for (const key of ['fabricator', 'mission', 'claimContext', 'refinery']) {
  must(manager.includes(`${key}:`), `calibration manager missing ${key}`);
}
must(missions.includes('ARCHVERSE_LINUX_PER_WIDGET_OCR_REGION_UI_LOADER'), 'ROI manager is not loaded by overlay');
must(missions.includes('linuxOcrRegions: { resourceSignature: f }'), 'legacy resource box is not migrated to common ROI storage');
must(missions.includes('.ocr-capture-box.shown, body.scanbox #scanBox'), 'ROI calibration boxes are not classified for Linux interaction');

// Unit-check geometry independence directly from the packaged runtime.
const ocrRuntime = require(runtimePath);
const cfg = { linuxOcrRegions: {
  resourceSignature: { x: .30, y: .20, w: .20, h: .10 },
  fabricator: { x: .50, y: .10, w: .40, h: .60 },
  mission: { x: .10, y: .15, w: .25, h: .30 },
  claimContext: { x: .55, y: .20, w: .35, h: .45 },
  refinery: { x: .08, y: .08, w: .84, h: .78 },
} };
const before = JSON.stringify(ocrRuntime.normalizedRegions(cfg));
const movedMission = structuredClone(cfg);
movedMission.linuxOcrRegions.mission = { x: .11, y: .12, w: .31, h: .32 };
const after = ocrRuntime.normalizedRegions(movedMission);
for (const key of keys.filter((k) => k !== 'mission')) {
  must(JSON.stringify(after[key]) === JSON.stringify(JSON.parse(before)[key]), `moving Mission mutated ${key}`);
}
must(JSON.stringify(after.mission) === JSON.stringify(movedMission.linuxOcrRegions.mission), 'Mission ROI did not update independently');
const px = ocrRuntime.regionPixels(movedMission, 'mission', 3840, 2160);
must(px.x === Math.round(.11 * 3840) && px.y === Math.round(.12 * 2160), 'ROI pixels are not normalized to the supplied bound-game frame');

async function freePort() {
  const s = net.createServer();
  await new Promise((resolve, reject) => s.listen(0, '127.0.0.1', resolve).once('error', reject));
  const port = s.address().port;
  await new Promise((resolve) => s.close(resolve));
  return port;
}

const configDir = await mkdtemp(path.join(tmpdir(), 'archverse-linux-ocr-selftest-'));
const port = await freePort();
let log = '';
const child = spawn(process.execPath, [serverPath], {
  cwd: path.dirname(serverPath),
  env: { ...process.env, PORT: String(port), SC_TRACKER_CONFIG_DIR: configDir },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', (b) => { log += b.toString(); });
child.stderr.on('data', (b) => { log += b.toString(); });

async function stop() {
  if (child.exitCode == null) child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 1000)),
  ]);
  if (child.exitCode == null) child.kill('SIGKILL');
  await rm(configDir, { recursive: true, force: true });
}

async function postConfig(body) {
  const r = await fetch(`http://127.0.0.1:${port}/api/config`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(2500),
  });
  if (!r.ok) throw new Error(`config POST HTTP ${r.status}`);
  return r.json();
}

async function waitReady() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`sidecar exited early (${child.exitCode})\n${log}`);
    try { await postConfig({}); return; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`sidecar did not become ready\n${log}`);
}

try {
  await waitReady();
  const mission = { x: .11, y: .12, w: .31, h: .32 };
  await postConfig({ linuxOcrRegions: { mission } });
  const saved = JSON.parse(await readFile(path.join(configDir, 'config.json'), 'utf8'));
  must(JSON.stringify(saved.linuxOcrRegions?.mission) === JSON.stringify(mission), 'Mission ROI was not persisted');
  for (const key of keys.filter((k) => k !== 'mission')) {
    must(saved.linuxOcrRegions?.[key] == null, `partial Mission save mutated ${key}`);
  }

  // On Linux a path-only screen-read must never attempt Windows.Media.Ocr/PowerShell. The static
  // gate above is authoritative; this timing check catches an accidental runtime fall-through.
  const started = Date.now();
  const r = await fetch(`http://127.0.0.1:${port}/api/screen-read`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: '/definitely/not/a/file.png' }), signal: AbortSignal.timeout(1500),
  });
  const elapsed = Date.now() - started;
  must(r.ok, `Linux path-only screen-read returned HTTP ${r.status}`);
  const j = await r.json();
  must(j.kind === 'none', `Linux path-only screen-read unexpectedly classified: ${JSON.stringify(j)}`);
  must(elapsed < 900, `Linux path-only screen-read took ${elapsed}ms; possible Windows OCR fall-through`);

  console.log('Native Linux OCR contract self-test OK: RapidOCR primary, Tesseract failure-only, Win32 OCR gated, independent per-feature OCR lanes, five independent game-normalized ROIs, no Linux full-frame OCR');
} catch (error) {
  console.error(error?.stack || error);
  console.error('--- sidecar output ---\n' + log.slice(-8000));
  process.exitCode = 1;
} finally {
  await stop();
}