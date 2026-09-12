#!/usr/bin/env node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('usage: alpha23-candidate5-sidecar-selftest.mjs <candidate-root>');
const must = (value, message) => { if (!value) throw new Error(`Alpha23 Candidate 5 sidecar self-test: ${message}`); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const require = createRequire(import.meta.url);
const { requestJson } = require(path.join(root, 'app/electron/local-json-ipc.cjs'));
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'archverse-c5-sidecar-'));
const gameLog = path.join(tempDir, 'game.log');
await writeFile(gameLog, '<2026-09-12T00:00:00.000Z> [Notice] <Startup> Candidate 5 REP test\n');
await writeFile(path.join(tempDir, 'config.json'), JSON.stringify({
  logPath: gameLog,
  syncToken: '',
  syncEnabled: false,
  miningAssistant: true,
  repScan: true,
  fabCapture: false,
}));
const port = 29000 + (process.pid % 1000);
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [path.join(root, 'app/server/server.mjs')], {
  cwd: path.join(root, 'app/server'),
  env: { ...process.env, SC_TRACKER_CONFIG_DIR: tempDir, SC_INSTANCE: 'candidate5-rep-test', PORT: String(port), SC_SYNC_BASE: 'http://127.0.0.1:9' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let childLog = '';
child.stdout.on('data', (value) => { childLog += String(value); });
child.stderr.on('data', (value) => { childLog += String(value); });

try {
  let instance = null;
  for (let i = 0; i < 30 && !instance; i += 1) {
    try { instance = await requestJson(`${base}/api/instance`, { timeoutMs: 300 }); }
    catch { await sleep(100); }
  }
  must(instance?.instance === 'candidate5-rep-test', `sidecar did not start: ${childLog}`);

  const empty = await requestJson(`${base}/api/rep-read`, {
    method: 'POST', timeoutMs: 650, json: { w: 1920, h: 972, lines: [] },
  });
  must(empty?.ok === false && empty?.refusal === 'no-heading', `REP read route failed: ${JSON.stringify(empty)}`);

  const refused = await requestJson(`${base}/api/rep-scan`, {
    method: 'POST', timeoutMs: 650,
    json: { refusalOnly: 'cards-incomplete', faction: 'TEST FACTION', section: 'TEST', giver: 'Test', tried: [] },
  });
  must(refused?.ok === false && refused?.refusal === 'cards-incomplete',
    `REP refusal delivery failed: ${JSON.stringify(refused)}`);

  const mining = await requestJson(`${base}/api/screen-read`, {
    method: 'POST', timeoutMs: 650,
    json: { miningCrop: true, commitMining: false, w: 400, h: 120, frameW: 3840, frameH: 2160,
      lines: [{ text: '30,100', x: 150, y: 20, w: 90, h: 20 }] },
  });
  must(mining?.kind === 'mineable' && mining?.signature === 30100,
    `Mining parser regressed while REP is armed: ${JSON.stringify(mining)}`);
} finally {
  child.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(1500)]);
  if (child.exitCode == null) child.kill('SIGKILL');
  await rm(tempDir, { recursive: true, force: true });
}

console.log('Alpha23 Candidate 5 sidecar self-test OK: REP routes work and Mining parsing remains intact');
