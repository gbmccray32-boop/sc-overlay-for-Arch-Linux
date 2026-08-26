import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const root = process.argv[2];
if (!root) throw new Error('usage: candidate8-scan-authority-selftest.mjs <staged-app-root>');
const require = createRequire(import.meta.url);
const gatePath = path.join(root, 'app/electron/scan-mode-gate.cjs');
const capturePath = path.join(root, 'app/electron/capture.cjs');
const serverPath = path.join(root, 'app/server/server.mjs');
const gate = require(gatePath);
const [capture, server] = await Promise.all([readFile(capturePath, 'utf8'), readFile(serverPath, 'utf8')]);
const must = (v, m) => { if (!v) throw new Error(`Candidate 8 scan authority: ${m}`); };

const falseOrigins = [
  [.5365, .4343],
  [.4813, .4507],
  [.4771, .4781],
  [.5521, .5110],
  [.4427, .4161],
  [.4542, .4580],
];
const realOrigins = [
  [.4542, .4890], [.4562, .4927], [.4552, .4964], [.4542, .4854], [.4521, .4836],
  [.4875, .4698], [.4896, .4808],
];
for (const [x, y] of falseOrigins) must(!gate.scanModeAuthorityIsland(x, y), `field false-positive admitted at ${x},${y}`);
for (const [x, y] of realOrigins) must(!!gate.scanModeAuthorityIsland(x, y), `field-proven real radar rejected at ${x},${y}`);

const stable = gate.createScanModeAuthorityStabilizer({ confirmWindowMs: 4500, latchMs: 4500 });
const raw = (x, y) => ({ active: true, confidence: 95, method: 'radar-icon-structure-search', authorityIsland: 'current-field', roi: { x, y, w: .0104, h: .0292 } });
let r = stable(raw(.4542, .4854), 1000);
must(!r.active && r.rejectionReason === 'temporal-consistency', 'one frame armed Scan Mode');
r = stable(raw(.4543, .4855), 3500);
must(r.active && r.authorityStable === true, 'repeat real radar did not arm Scan Mode');
r = stable({ active: false, confidence: 0, method: 'radar-icon-structure-search' }, 6000);
must(r.active && r.latched === true, 'single dropped radar frame broke authority latch');
r = stable({ active: false, confidence: 0, method: 'radar-icon-structure-search' }, 9001);
must(!r.active, 'authority latch failed to expire');

must(capture.includes('ARCHVERSE_LINUX_MINING_EARLY_SIGNATURE_FLOOR'), 'early signature floor marker missing');
must(capture.includes('MINING_SIGNATURE_EARLY_FLOOR = 2000'), '2,000 early floor missing');
must(capture.includes('ARCHVERSE_LINUX_MINING_STRUCTURAL_AUTHORITY_CAPTURE'), 'capture structural authority marker missing');
must(capture.includes('glyph.seen && archScanModeRead.active === true'), 'glyph + Scan Mode conjunction missing');
must(capture.includes('ARCHVERSE_LINUX_MINING_TELEMETRY_LATEST_ONLY'), 'latest-only Mining IPC marker missing');
must(!capture.includes('confirmed: glyph.seen,'), 'legacy glyph-only confirmation survived');
must(server.includes('ARCHVERSE_LINUX_MINING_STRUCTURAL_AUTHORITY_SERVER'), 'server structural authority marker missing');

async function freePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => socket.listen(0, '127.0.0.1', resolve).once('error', reject));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

const configDir = await mkdtemp(path.join(tmpdir(), 'archverse-c8-scan-authority-'));
const port = await freePort();
let output = '';
const child = spawn(process.execPath, [serverPath], {
  cwd: path.dirname(serverPath),
  env: { ...process.env, PORT: String(port), SC_TRACKER_CONFIG_DIR: configDir },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', (b) => { output += b.toString(); });
child.stderr.on('data', (b) => { output += b.toString(); });
const stop = async () => {
  if (child.exitCode == null) child.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 1000))]);
  if (child.exitCode == null) child.kill('SIGKILL');
  await rm(configDir, { recursive: true, force: true });
};
const getMining = async () => {
  const response = await fetch(`http://127.0.0.1:${port}/api/mining`, { signal: AbortSignal.timeout(1500) });
  if (!response.ok) throw new Error(`GET /api/mining HTTP ${response.status}`);
  return response.json();
};
const postScan = async (signature, confirmed) => {
  const response = await fetch(`http://127.0.0.1:${port}/api/mining/scan`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signature, confirmed }), signal: AbortSignal.timeout(1500),
  });
  if (!response.ok) throw new Error(`POST /api/mining/scan HTTP ${response.status}`);
};
try {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`server exited early (${child.exitCode})\n${output}`);
    try { await getMining(); break; } catch { await new Promise((r2) => setTimeout(r2, 100)); }
  }
  await postScan(2000, false);
  let view = await getMining();
  must(view.scan == null, 'unconfirmed legal signature mutated Mining state');
  await postScan(2000, true);
  view = await getMining();
  must(view.scan?.signature === 2000 && view.scan?.confirmed === true, 'confirmed signature did not mutate Mining state');
  console.log('Candidate 8 scan authority self-test OK: field islands, temporal consistency, early floor, latest-only IPC, server fail-closed authority');
} finally {
  await stop();
}
