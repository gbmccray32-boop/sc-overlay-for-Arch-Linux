#!/usr/bin/env node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('usage: alpha23-candidate4-sidecar-selftest.mjs <candidate-root>');
const must = (value, message) => { if (!value) throw new Error(`Alpha23 Candidate 4 sidecar self-test: ${message}`); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const require = createRequire(import.meta.url);
const { requestJson } = require(path.join(root, 'app/electron/local-json-ipc.cjs'));
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'archverse-c4-sidecar-'));
const gameLog = path.join(tempDir, 'game.log');
await writeFile(gameLog, '<2026-09-12T00:00:00.000Z> [Notice] <Startup> Candidate 4 parser test\n');
await writeFile(path.join(tempDir, 'config.json'), JSON.stringify({
  logPath: gameLog,
  syncToken: '',
  syncEnabled: false,
  miningAssistant: true,
  fabCapture: false,
}));
const port = 27000 + (process.pid % 2000);
const child = spawn(process.execPath, [path.join(root, 'app/server/server.mjs')], {
  cwd: path.join(root, 'app/server'),
  env: { ...process.env, SC_TRACKER_CONFIG_DIR: tempDir, SC_INSTANCE: 'candidate4-parser-test', PORT: String(port), SC_SYNC_BASE: 'http://127.0.0.1:9' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let childLog = '';
child.stdout.on('data', (value) => { childLog += String(value); });
child.stderr.on('data', (value) => { childLog += String(value); });

async function post(lines) {
  return requestJson(`http://127.0.0.1:${port}/api/screen-read`, {
    method: 'POST',
    timeoutMs: 650,
    json: { miningCrop: true, commitMining: true, pollMs: 500, w: 400, h: 120, frameW: 3840, frameH: 2160, lines },
  });
}

try {
  let instance = null;
  for (let i = 0; i < 30 && !instance; i += 1) {
    try { instance = await requestJson(`http://127.0.0.1:${port}/api/instance`, { timeoutMs: 300 }); }
    catch { await sleep(100); }
  }
  must(instance?.instance === 'candidate4-parser-test', `sidecar did not start: ${childLog}`);
  const falseRead = await post([{ text: 'DISABLED IN ATMOSPHERE | 60 30 100 | A | 87 | 188', x: 20, y: 20, w: 340, h: 20 }]);
  must(falseRead.kind === 'none' && falseRead.miningCommit == null, `whitespace HUD values became a signature: ${JSON.stringify(falseRead)}`);
  const grouped = await post([{ text: '30,100', x: 150, y: 20, w: 90, h: 20 }]);
  must(grouped.kind === 'mineable' && grouped.signature === 30100, `valid grouped value rejected: ${JSON.stringify(grouped)}`);
  const split = await post([
    { text: '30', x: 150, y: 20, w: 30, h: 20 },
    { text: '100', x: 187, y: 20, w: 45, h: 20 },
  ]);
  must(split.kind === 'mineable' && split.signature === 30100, `valid adjacent OCR split rejected: ${JSON.stringify(split)}`);
} finally {
  child.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(1500)]);
  if (child.exitCode == null) child.kill('SIGKILL');
  await rm(tempDir, { recursive: true, force: true });
}

console.log('Alpha23 Candidate 4 sidecar self-test OK: whitespace false positive rejected; grouped and adjacent-split values preserved');
