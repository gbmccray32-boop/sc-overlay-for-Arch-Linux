// Exercise the bundled sidecar, including the split server-config module, through its real API.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';

assert.equal(process.platform, 'linux', 'This test exercises Linux platform policy');
const root = await mkdtemp(join(tmpdir(), 'archverse-config-e2e-'));
const canonical = join(root, 'canonical');
const legacy = join(root, 'legacy');
const probe = createServer();
await new Promise(r => probe.listen(0, '127.0.0.1', r));
const port = probe.address().port;
await new Promise(r => probe.close(r));
await mkdir(canonical);
await mkdir(join(legacy, 'sc-blueprint-tracker'), { recursive: true });
const seed = { logPath: join(root, 'Game.log'), syncEnabled: false, shareLogs: false,
  fabCapture: false, missionOcr: false, miningAssistant: false, chatOpen: false };
await writeFile(seed.logPath, '');
await writeFile(join(canonical, 'config.json'), JSON.stringify(seed));
const legacyText = JSON.stringify({ ...seed, logPath: 'WRONG-LEGACY-PATH' });
await writeFile(join(legacy, 'sc-blueprint-tracker/config.json'), legacyText);
const serverDir = resolve(process.argv[2] || 'build/server');
const child = spawn(process.execPath, [join(serverDir, 'server.mjs')], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(port), SC_TRACKER_CONFIG_DIR: canonical,
    APPDATA: legacy, SC_PARENT_PID: String(process.pid) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', b => {
  output = (output + b).slice(-16000);
});
const exited = once(child, 'exit');
async function request(body) {
  const response = await fetch(`http://127.0.0.1:${port}/api/config`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(response.status, 200);
  return response.json();
}
function controls(c) {
  assert.equal(c.interactHotkey, 'F');
  assert.equal(c.holdToInteract, true);
  assert.equal(c.moveHotkey, 'Shift+F6');
}
try {
  let initial;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error(output);
    try { initial = await request(); break; } catch { await new Promise(r => setTimeout(r, 100)); }
  }
  assert.ok(initial, `Sidecar did not become ready: ${output}`);
  assert.equal(initial.logPath, seed.logPath);
  controls(initial);
  for (const [profile, missionOcr, miningAssistant] of [
    ['mining', false, true], ['balanced', true, false], ['lightweight', false, false],
  ]) {
    const result = await request({ fabCapture: false, missionOcr, miningAssistant,
      interactHotkey: 'Q', holdToInteract: false, moveHotkey: 'Ctrl+Alt+M' });
    assert.equal(result.screenReading.profile, profile);
    const current = await request();
    controls(current);
    assert.equal(current.screenReaderProfile, profile);
    const disk = JSON.parse(await readFile(join(canonical, 'config.json'), 'utf8'));
    controls(disk);
    assert.equal(disk.screenReaderProfile, profile);
  }
  const region = { x: 0.1, y: 0.2, w: 0.3, h: 0.1 };
  await request({ linuxOcrRegions: { resourceSignature: region } });
  assert.deepEqual((await request()).scanRegion, region);
  await request({ scanRegion: null });
  assert.equal((await request()).linuxOcrRegions.resourceSignature, null);
  assert.equal(await readFile(join(legacy, 'sc-blueprint-tracker/config.json'), 'utf8'), legacyText);
  assert.equal(child.exitCode, null);
  console.log('PASS: canonical config, Linux controls, reader profiles, persistence, and OCR regions');
} finally {
  child.kill('SIGTERM');
  const killTimer = setTimeout(() => child.kill('SIGKILL'), 3000);
  await exited;
  clearTimeout(killTimer);
  await rm(root, { recursive: true, force: true });
}
