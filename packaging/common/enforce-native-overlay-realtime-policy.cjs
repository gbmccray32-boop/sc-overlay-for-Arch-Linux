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

// Resource scanning is autonomous. The OCR/capture loop lives in Electron's main process, while
// mining SSE state, scan-read diagnostics, flash/chime and speech live in the transparent overlay
// renderer. Electron defaults backgroundThrottling to true, so leaving Star Citizen focused can
// throttle that renderer and make mouse hover/F-focus appear to "wake" scanner results. Keep the
// overlay renderer live at all times; interaction remains click-through and F-gated exactly as
// before. Browser/chat child WebContentsViews keep their own existing throttling preferences.
if (!main.includes('ARCHVERSE_LINUX_REALTIME_OVERLAY_RENDERER')) {
  main = replaceOnce(main,
    '    webPreferences: { contextIsolation: true, preload: path.join(__dirname, "preload.cjs"), autoplayPolicy: "no-user-gesture-required" },',
    '    // ARCHVERSE_LINUX_REALTIME_OVERLAY_RENDERER: scanner state/audio must never depend on focus, hover, or F.\n    webPreferences: { contextIsolation: true, preload: path.join(__dirname, "preload.cjs"), autoplayPolicy: "no-user-gesture-required", backgroundThrottling: false },',
    'overlay BrowserWindow webPreferences');
}

must(main.includes('ARCHVERSE_LINUX_REALTIME_OVERLAY_RENDERER'), 'realtime overlay marker missing');
must(main.includes('autoplayPolicy: "no-user-gesture-required", backgroundThrottling: false'), 'main overlay renderer can still be background-throttled');

// Do not globally disable throttling for embedded browser/chat views. They are unrelated to mining
// liveness and may legitimately save CPU/GPU when hidden.
must(main.includes('backgroundThrottling: false'), 'no unthrottled overlay renderer found');

fs.writeFileSync(mainPath, main);
console.log('Native Linux realtime overlay policy enforced:', mainPath);
