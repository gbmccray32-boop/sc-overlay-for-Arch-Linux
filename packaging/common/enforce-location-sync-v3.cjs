#!/usr/bin/env node
'use strict';

// ARCHVERSE_LOCATION_SYNC_V3_ENFORCER
// Apply the Candidate 7 Location Sync V3 delta to an already-staged Candidate 6 runtime.
// The patch is exact and fail-closed: if an earlier staging step changes an expected hunk,
// this script aborts rather than guessing how to merge sensitive Electron/server code.

const fs = require('node:fs');
const path = require('node:path');

const root = process.argv[2];
if (!root) throw new Error('usage: enforce-location-sync-v3.cjs <staged-app-root>');
const here = __dirname;
const zlib = require('node:zlib');
const modulePath = path.join(here, 'location-sync-v3.cjs');
if (!fs.existsSync(modulePath)) throw new Error(`Location Sync V3 missing ${modulePath}`);
const PATCH_GZ_B64 = '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';
const PATCH_TEXT = zlib.gunzipSync(Buffer.from(PATCH_GZ_B64, 'base64')).toString('utf8');

function parsePatch(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const files = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].startsWith('--- ')) { i += 1; continue; }
    const oldName = lines[i].slice(4).trim();
    i += 1;
    if (!lines[i]?.startsWith('+++ ')) throw new Error(`malformed patch after ${oldName}`);
    const newName = lines[i].slice(4).trim();
    i += 1;
    const hunks = [];
    while (i < lines.length && !lines[i].startsWith('--- ')) {
      if (!lines[i].startsWith('@@ ')) { i += 1; continue; }
      const header = lines[i];
      const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(header);
      if (!m) throw new Error(`bad hunk header: ${header}`);
      i += 1;
      const body = [];
      while (i < lines.length && !lines[i].startsWith('@@ ') && !lines[i].startsWith('--- ')) {
        const line = lines[i];
        if (line === '\\ No newline at end of file') { i += 1; continue; }
        if (line === '' && i === lines.length - 1) break;
        if (![' ', '+', '-'].includes(line[0])) throw new Error(`bad patch line in ${newName}: ${line}`);
        body.push(line);
        i += 1;
      }
      hunks.push({ oldStart: Number(m[1]), oldCount: Number(m[2] || 1), newStart: Number(m[3]), newCount: Number(m[4] || 1), body });
    }
    files.push({ oldName, newName, hunks });
  }
  return files;
}

function stripPrefix(name) {
  const n = name.replace(/^[ab]\//, '');
  if (n === '/dev/null') return null;
  if (!n.startsWith('app/')) throw new Error(`refusing to patch outside staged app: ${name}`);
  return n;
}

function applyFile(file) {
  const rel = stripPrefix(file.newName) || stripPrefix(file.oldName);
  const target = path.join(root, rel);
  if (!fs.existsSync(target)) throw new Error(`Location Sync V3 target missing: ${rel}`);
  const hadFinalNl = fs.readFileSync(target, 'utf8').endsWith('\n');
  let src = fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n').split('\n');
  if (hadFinalNl && src[src.length - 1] === '') src.pop();
  let offset = 0;
  for (const hunk of file.hunks) {
    const oldLines = hunk.body.filter((l) => l[0] !== '+').map((l) => l.slice(1));
    const newLines = hunk.body.filter((l) => l[0] !== '-').map((l) => l.slice(1));
    const at = hunk.oldStart - 1 + offset;
    const got = src.slice(at, at + oldLines.length);
    if (got.length !== oldLines.length || got.some((v, idx) => v !== oldLines[idx])) {
      const sample = oldLines.slice(0, 4).join('\\n');
      throw new Error(`Location Sync V3 patch drift in ${rel} at original line ${hunk.oldStart}; expected:\\n${sample}`);
    }
    src.splice(at, oldLines.length, ...newLines);
    offset += newLines.length - oldLines.length;
  }
  fs.writeFileSync(target, src.join('\n') + (hadFinalNl ? '\n' : ''));
}

for (const file of parsePatch(PATCH_TEXT)) applyFile(file);
fs.copyFileSync(modulePath, path.join(root, 'app/electron/location-sync-v3.cjs'));

const mustContain = [
  ['app/electron/capture.cjs', 'ARCHVERSE_LOCATION_SYNC_V3_CAPTURE'],
  ['app/electron/capture.cjs', 'linuxOcrLane("locationSync")'],
  ['app/electron/capture.cjs', 'pipewiresrc'],
  ['app/server/server.mjs', 'ARCHVERSE_LOCATION_SYNC_V3_API'],
  ['app/server/server.mjs', 'nearestActiveStop'],
  ['app/server/overlay/hauling.html', 'ARCHVERSE_LOCATION_SYNC_V3_UI'],
  ['app/electron/location-sync-v3.cjs', 'ARCHVERSE_LOCATION_SYNC_V3'],
];
for (const [rel, needle] of mustContain) {
  const text = fs.readFileSync(path.join(root, rel), 'utf8');
  if (!text.includes(needle)) throw new Error(`Location Sync V3 invariant missing ${needle} in ${rel}`);
}
const capture = fs.readFileSync(path.join(root, 'app/electron/capture.cjs'), 'utf8');
if (/Windows\.Media\.Ocr/.test(fs.readFileSync(path.join(root, 'app/electron/location-sync-v3.cjs'), 'utf8'))) throw new Error('Windows OCR leaked into Location Sync V3');
if (!capture.includes('method: "gamescope-pipewire"') || !capture.includes('Gamescope PipeWire node ${info.node.id}')) throw new Error('direct Gamescope PipeWire Location Sync contract missing');

console.log('Location Sync V3 staged successfully.');
