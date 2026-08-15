import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = process.argv[2];
if (!root) throw new Error('usage: native-mining-pipeline-selftest.mjs <staged-app-root>');

// The liveness policy is part of the shared native payload contract. Apply it here before the
// end-to-end sidecar test; this script runs during shared payload reconstruction, before the
// Arch/Fedora/Debian package split. Then syntax-check the files it changes before starting them.
const require = createRequire(import.meta.url);
require('./enforce-native-mining-liveness-policy.cjs');
for (const rel of ['app/electron/capture.cjs', 'app/server/server.mjs']) {
  const checked = spawnSync(process.execPath, ['--check', path.join(root, rel)], { encoding: 'utf8' });
  if (checked.status !== 0) throw new Error(`post-liveness syntax check failed for ${rel}:\n${checked.stderr || checked.stdout}`);
}

const serverDir = path.join(root, 'app', 'server');
const serverPath = path.join(serverDir, 'server.mjs');

async function freePort() {
  const s = net.createServer();
  await new Promise((resolve, reject) => s.listen(0, '127.0.0.1', resolve).once('error', reject));
  const port = s.address().port;
  await new Promise((resolve) => s.close(resolve));
  return port;
}

const configDir = await mkdtemp(path.join(tmpdir(), 'archverse-mining-selftest-'));
const port = await freePort();
let log = '';
const child = spawn(process.execPath, [serverPath], {
  cwd: serverDir,
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

async function waitReady() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`sidecar exited early (${child.exitCode})\n${log}`);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/mining.html`, { signal: AbortSignal.timeout(500) });
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`sidecar did not become ready\n${log}`);
}

let reader;
let pending = '';
async function nextSseEvent(timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const split = pending.indexOf('\n\n');
    if (split >= 0) {
      const block = pending.slice(0, split);
      pending = pending.slice(split + 2);
      const line = block.split('\n').find((s) => s.startsWith('data: '));
      if (!line) continue;
      return JSON.parse(line.slice(6));
    }
    const left = Math.max(50, deadline - Date.now());
    const { value, done } = await Promise.race([
      reader.read(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('SSE read timeout')), left)),
    ]);
    if (done) throw new Error('SSE stream ended');
    pending += new TextDecoder().decode(value, { stream: true }).replace(/\r/g, '');
  }
  throw new Error('SSE event timeout');
}

async function waitScan(signature, matchName = null) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const ev = await nextSseEvent(Math.max(100, deadline - Date.now()));
    if (ev.kind !== 'state' || Number(ev.view?.scan?.signature) !== signature) continue;
    if (matchName && !ev.view.scan.matches?.some((m) => m.name === matchName)) {
      throw new Error(`signature ${signature} state missing ${matchName}: ${JSON.stringify(ev.view.scan)}`);
    }
    return ev.view.scan;
  }
  throw new Error(`did not receive state for signature ${signature}`);
}

async function screenRead(lines) {
  const r = await fetch(`http://127.0.0.1:${port}/api/screen-read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ miningCrop: true, w: 500, h: 200, lines }),
    signal: AbortSignal.timeout(3000),
  });
  if (!r.ok) throw new Error(`screen-read HTTP ${r.status}`);
  return r.json();
}

async function confirmScan(signature) {
  const r = await fetch(`http://127.0.0.1:${port}/api/mining/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signature, confirmed: true, pollMs: 900, scanHud: false }),
    signal: AbortSignal.timeout(3000),
  });
  if (!r.ok) throw new Error(`mining scan HTTP ${r.status}`);
  return r.json();
}

try {
  await waitReady();
  const sse = await fetch(`http://127.0.0.1:${port}/mining/events`, { signal: AbortSignal.timeout(3000) });
  if (!sse.ok || !sse.body) throw new Error(`mining SSE HTTP ${sse.status}`);
  reader = sse.body.getReader();

  // Consume initial state/appearance so subsequent state is definitely caused by this test.
  let initialState = null;
  for (let i = 0; i < 4 && !initialState; i++) {
    const ev = await nextSseEvent();
    if (ev.kind === 'state') initialState = ev;
  }
  if (!initialState) throw new Error('missing initial mining state');

  const grouped = await screenRead([{ text: '16 000', x: 220, y: 80, w: 75, h: 20 }]);
  if (grouped.signature !== 16000 || grouped.outcome?.used !== true || !String(grouped.outcome?.why).includes('Savrilium')) {
    throw new Error(`grouped signature failed: ${JSON.stringify(grouped)}`);
  }
  await waitScan(16000, 'Savrilium');

  const split = await screenRead([
    { text: '18', x: 220, y: 80, w: 20, h: 20 },
    { text: '000', x: 245, y: 80, w: 35, h: 20 },
  ]);
  if (split.signature !== 18000 || split.outcome?.used !== true || !String(split.outcome?.why).includes('Bexalite')) {
    throw new Error(`split signature failed: ${JSON.stringify(split)}`);
  }
  await waitScan(18000, 'Bexalite');

  const gem = await screenRead([{ text: '3,000', x: 220, y: 80, w: 60, h: 20 }]);
  if (gem.signature !== 3000 || gem.outcome?.used !== true || gem.outcome?.verdict !== 'resource') {
    throw new Error(`RS 3,000 resource class failed: ${JSON.stringify(gem)}`);
  }
  const gemState = await waitScan(3000);
  if (gemState.confirmed === true) throw new Error('authoritative OCR state unexpectedly started confirmed');

  // The later pixel/glyph telemetry is a second observation of the same signature. It must be
  // allowed to strengthen confirmed:false -> true without re-announcing the same contact.
  await confirmScan(3000);
  const confirmedGem = await waitScan(3000);
  if (confirmedGem.confirmed !== true) throw new Error(`same-signature confirmation upgrade failed: ${JSON.stringify(confirmedGem)}`);

  console.log('Native mining pipeline self-test OK: grouped, split-token, authoritative state, RS 3,000, confirmation upgrade, bounded/focus-safe liveness syntax');
} catch (error) {
  console.error(error?.stack || error);
  console.error('--- sidecar output ---\n' + log.slice(-8000));
  process.exitCode = 1;
} finally {
  try { await reader?.cancel(); } catch {}
  await stop();
}
