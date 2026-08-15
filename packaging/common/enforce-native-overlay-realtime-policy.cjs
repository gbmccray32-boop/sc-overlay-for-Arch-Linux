#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const [root] = process.argv.slice(2);
if (!root) {
  console.error('usage: enforce-native-overlay-realtime-policy.cjs <staged-app-root>');
  process.exit(2);
}

function must(cond, msg) {
  if (!cond) throw new Error(`Native Linux overlay realtime policy: ${msg}`);
}
function countOf(text, needle) { return text.split(needle).length - 1; }
function replaceOnce(text, from, to, label) {
  if (text.includes(to)) return text;
  const n = countOf(text, from);
  must(n === 1, `${label}: expected exactly one anchor, found ${n}`);
  return text.replace(from, to);
}

const mainPath = path.join(root, 'app/electron/main.cjs');
must(fs.existsSync(mainPath), 'missing app/electron/main.cjs');
let main = fs.readFileSync(mainPath, 'utf8');

// Resource scanning is autonomous. Capture/OCR is performed in Electron's main process, while the
// Resource Scanner receives state through SSE and performs scan-read drawing, flash/chime and speech
// in the main transparent overlay renderer. Electron normally throttles background renderer timers
// and visibility. That can make hover/F-focus/Alt-Tab appear to wake results even though those inputs
// must never be scan controls. Keep only the main overlay renderer live; click-through/F interaction
// policy is unchanged and embedded browser/chat views retain their own existing throttling settings.
if (!main.includes('ARCHVERSE_LINUX_REALTIME_OVERLAY_RENDERER')) {
  main = replaceOnce(main,
    '    webPreferences: { contextIsolation: true, preload: path.join(__dirname, "preload.cjs"), autoplayPolicy: "no-user-gesture-required" },',
    '    // ARCHVERSE_LINUX_REALTIME_OVERLAY_RENDERER: scanner state/audio must never depend on focus, hover, or F.\n    webPreferences: { contextIsolation: true, preload: path.join(__dirname, "preload.cjs"), autoplayPolicy: "no-user-gesture-required", backgroundThrottling: false },',
    'overlay BrowserWindow webPreferences');
}

must(main.includes('ARCHVERSE_LINUX_REALTIME_OVERLAY_RENDERER'), 'realtime overlay marker missing');
must(main.includes('autoplayPolicy: "no-user-gesture-required", backgroundThrottling: false'), 'main overlay renderer can still be background-throttled');

fs.writeFileSync(mainPath, main);
console.log('Native Linux realtime overlay policy enforced:', mainPath);
