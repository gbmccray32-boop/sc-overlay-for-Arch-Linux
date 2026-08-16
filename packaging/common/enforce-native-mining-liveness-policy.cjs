#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const [root] = process.argv.slice(2);
if (!root) {
  console.error('usage: enforce-native-mining-liveness-policy.cjs <staged-app-root>');
  process.exit(2);
}

function must(cond, msg) {
  if (!cond) throw new Error(`Native Linux mining liveness policy: ${msg}`);
}
function countOf(text, needle) { return text.split(needle).length - 1; }
function replaceOnce(text, from, to, label) {
  if (text.includes(to)) return text;
  const n = countOf(text, from);
  must(n === 1, `${label}: expected exactly one anchor, found ${n}`);
  return text.replace(from, to);
}

const capturePath = path.join(root, 'app/electron/capture.cjs');
const serverPath = path.join(root, 'app/server/server.mjs');
for (const p of [capturePath, serverPath]) must(fs.existsSync(p), `missing ${path.relative(root, p)}`);

let capture = fs.readFileSync(capturePath, 'utf8');
let server = fs.readFileSync(serverPath, 'utf8');

// ---------------------------------------------------------------------------
// 1. ArchVerse owning foreground focus must not pause the scanner.
//    Privacy remains fail-closed: only our own process/class is trusted, and capture still targets
//    the already-bound Star Citizen/Gamescope source. A browser, terminal, or any unrelated window
//    still pauses screen reading.
// ---------------------------------------------------------------------------
if (!capture.includes('ARCHVERSE_LINUX_TRUSTED_OVERLAY_CAPTURE')) {
  capture = replaceOnce(capture,
    '  const boundPid = !!session && /^\\d+$/.test(pid) && belongsToSession(Number(pid));\n  const gameIdentity = /Star\\s*Citizen|StarCitizen(?:\\.exe)?|StarCitizen[/\\\\]LIVE/i.test(blob);',
    '  const boundPid = !!session && /^\\d+$/.test(pid) && belongsToSession(Number(pid));\n  const ownOverlay = !!session && (\n    (/^\\d+$/.test(pid) && Number(pid) === process.pid) ||\n    /^(?:SC Blueprint Tracker|ArchVerse(?: Overlay)?)$/i.test(title) ||\n    /sc-blueprint-tracker|archverse/i.test(className)\n  ); // ARCHVERSE_LINUX_TRUSTED_OVERLAY_CAPTURE\n  const gameIdentity = /Star\\s*Citizen|StarCitizen(?:\\.exe)?|StarCitizen[/\\\\]LIVE/i.test(blob);',
    'trusted overlay foreground identity');

  capture = replaceOnce(capture,
    '  if (directGame) return { name: "StarCitizen", title, className, rect, gate: "pid-bound-active-window", session: sessionInfo };\n  if (anonymousXwaylandRoot) {',
    '  if (directGame) return { name: "StarCitizen", title, className, rect, gate: "pid-bound-active-window", session: sessionInfo };\n  if (ownOverlay) return { name: "ArchVerseOverlay", title, className, rect: null, gate: "own-overlay-bound-game-session", session: sessionInfo };\n  if (anonymousXwaylandRoot) {',
    'trusted overlay foreground classification');

  capture = replaceOnce(capture,
    '  let lastTickMs = 0;         // how long the last poll actually took — the fast rate tunes off it\n  let rate = POLL_MS;         // the interval currently armed, so we only re-arm on a real change',
    '  let lastTickMs = 0;         // how long the last poll actually took — the fast rate tunes off it\n  let rate = POLL_MS;         // the interval currently armed, so we only re-arm on a real change\n  let lastGameRect = null;    // preserve the exact game display while ArchVerse temporarily owns focus\n  let lastForegroundGateLog = "";\n  let lastMiningOcrLogAt = 0;\n  let lastMiningOcrSig = null;',
    'mining liveness state');

  capture = replaceOnce(capture,
    '    const fg = await foregroundWindow();\n    if (!/^StarCitizen$/i.test(fg.name)) { emitContext("idle"); return; } // only ever look at SC\n    busy = true;',
    '    const fg = await foregroundWindow();\n    const gameForeground = /^StarCitizen$/i.test(fg.name);\n    const overlayForeground = fg.name === "ArchVerseOverlay";\n    if (!gameForeground && !overlayForeground) {\n      const gateKey = `${fg.gate || "unknown"}:${fg.name || "(none)"}`;\n      if (gateKey !== lastForegroundGateLog) {\n        lastForegroundGateLog = gateKey;\n        console.log(`[screen-read] paused: foreground is not the bound game/ArchVerse (${gateKey})`);\n      }\n      emitContext("idle");\n      return;\n    }\n    if (gameForeground && fg.rect) lastGameRect = fg.rect;\n    const gateKey = `${fg.gate || "unknown"}:${fg.name}`;\n    if (gateKey !== lastForegroundGateLog) {\n      lastForegroundGateLog = gateKey;\n      console.log(`[screen-read] active capture gate: ${gateKey}`);\n    }\n    busy = true;',
    'focus-safe mining gate');

  capture = replaceOnce(capture,
    '      const cap = await captureGame(fg.rect); // the monitor the GAME is on, not a blind sources[0]',
    '      const cap = await captureGame(gameForeground ? fg.rect : lastGameRect); // ARCHVERSE_LINUX_TRUSTED_OVERLAY_CAPTURE: our overlay may own focus, but capture remains the bound game display',
    'focus-safe game capture rect');
}

// ---------------------------------------------------------------------------
// 2. The adaptive cadence may never become slower than the normal 3-second poll.
//    The existing busy guard already supplies backpressure while OCR is actually working. Sleeping
//    another 10-24 seconds after a slow tick made detection appear to depend on F/Alt-Tab timing.
//    Tune from THIS tick instead of stale lastTickMs, then clamp between FAST_MS and POLL_MS.
// ---------------------------------------------------------------------------
if (!capture.includes('ARCHVERSE_LINUX_BOUND_MINING_CADENCE')) {
  capture = replaceOnce(capture,
    '      const floor = Math.max(FAST_MS, Math.round(lastTickMs * 1.5));\n      const want = Date.now() < fastUntil ? floor : POLL_MS;',
    '      // ARCHVERSE_LINUX_BOUND_MINING_CADENCE: OCR backpressure already prevents overlap.\n      // Never add a second long sleep after a slow OCR tick; the scanner cadence remains bounded\n      // between FAST_MS and POLL_MS. Tune from the current tick, not the previous one.\n      const currentTickMs = Math.max(1, Date.now() - busyAt);\n      const floor = Math.max(FAST_MS, Math.round(currentTickMs * 1.5));\n      const want = Date.now() < fastUntil ? Math.min(POLL_MS, floor) : POLL_MS;',
    'bounded mining cadence');
}

// ---------------------------------------------------------------------------
// 3. Put the real OCR evidence in the terminal log. This is deliberately throttled: hits log when
//    the signature changes (or every 5s while stable); misses log at most every 5s. A field report
//    can now distinguish focus pause, crop miss, OCR miss, and a slow OCR call without screenshots.
// ---------------------------------------------------------------------------
if (!capture.includes('ARCHVERSE_LINUX_MINING_OCR_DIAGNOSTICS')) {
  capture = replaceOnce(capture,
    '          const rr3 = await r3.json();\n          // rr3\'s pin/text are CROP-relative',
    '          const rr3 = await r3.json();\n          // ARCHVERSE_LINUX_MINING_OCR_DIAGNOSTICS\n          const miningOcrSample = lines.map((l) => String(l.text || "").trim()).filter(Boolean).slice(0, 8).join(" | ");\n          const miningOcrNow = Date.now();\n          if (rr3.kind === "mineable" && typeof rr3.signature === "number") {\n            if (rr3.signature !== lastMiningOcrSig || miningOcrNow - lastMiningOcrLogAt >= 5000) {\n              console.log(`[mining-ocr] signature ${rr3.signature} via ${cap.method}; crop=${stage.region} scale=${MINING_OCR_SCALE} ocr=${stage.rapidOcr}ms text="${miningOcrSample}"`);\n              lastMiningOcrLogAt = miningOcrNow;\n            }\n            lastMiningOcrSig = rr3.signature;\n          } else if (miningOcrNow - lastMiningOcrLogAt >= 5000) {\n            console.log(`[mining-ocr] no signature via ${cap.method}; crop=${stage.region} scale=${MINING_OCR_SCALE} ocr=${stage.rapidOcr}ms text="${miningOcrSample}"`);\n            lastMiningOcrLogAt = miningOcrNow;\n            lastMiningOcrSig = null;\n          }\n          // rr3\'s pin/text are CROP-relative',
    'mining OCR diagnostics');
}

// ---------------------------------------------------------------------------
// 4. The authoritative /api/screen-read commit arrives before the later pixel/glyph telemetry POST.
//    A same-signature telemetry hit must be able to upgrade confirmed:false -> true. Without this,
//    auto-show/debris confirmation could remain permanently false after we made OCR authoritative.
// ---------------------------------------------------------------------------
if (!server.includes('ARCHVERSE_LINUX_SIGNATURE_CONFIRM_UPGRADE')) {
  server = replaceOnce(server,
    '    if (this.scan && this.scan.signature === signature) {\n      return out({ verdict, announced: false, used: true, why: `${verdict}, already announced (unchanged since the last read)` });\n    }',
    '    if (this.scan && this.scan.signature === signature) {\n      // ARCHVERSE_LINUX_SIGNATURE_CONFIRM_UPGRADE: authoritative OCR commits before pixel telemetry.\n      const confirmUpgrade = confirmed === true && this.scan.confirmed !== true;\n      this.scan.at = Date.now();\n      if (confirmUpgrade) {\n        this.scan = { ...this.scan, confirmed: true };\n        this.emit("change");\n      }\n      return out({ verdict, announced: false, used: true, why: `${verdict}, already announced (unchanged since the last read)${confirmUpgrade ? "; confirmation upgraded" : ""}` });\n    }',
    'signature confirmation upgrade');
}

must(capture.includes('ARCHVERSE_LINUX_TRUSTED_OVERLAY_CAPTURE'), 'trusted-overlay capture marker missing');
must(capture.includes('name: "ArchVerseOverlay"'), 'own overlay is not a trusted foreground identity');
must(capture.includes('const gameForeground = /^StarCitizen$/i.test(fg.name);'), 'game/overlay foreground split missing');
must(capture.includes('captureGame(gameForeground ? fg.rect : lastGameRect)'), 'bound game display is not retained while overlay owns focus');
must(capture.includes('ARCHVERSE_LINUX_BOUND_MINING_CADENCE'), 'bounded mining cadence marker missing');
must(capture.includes('Math.min(POLL_MS, floor)'), 'adaptive cadence can still exceed normal poll');
must(!capture.includes('const want = Date.now() < fastUntil ? floor : POLL_MS;'), 'unbounded adaptive cadence remains');
must(capture.includes('ARCHVERSE_LINUX_MINING_OCR_DIAGNOSTICS'), 'mining OCR diagnostics marker missing');
must(capture.includes('[mining-ocr] signature'), 'signature diagnostic missing');
must(capture.includes('[mining-ocr] no signature'), 'miss diagnostic missing');
must(server.includes('ARCHVERSE_LINUX_SIGNATURE_CONFIRM_UPGRADE'), 'same-signature confirmation upgrade missing');
must(server.includes('this.scan = { ...this.scan, confirmed: true };'), 'glyph telemetry cannot strengthen authoritative scan');

fs.writeFileSync(capturePath, capture);
fs.writeFileSync(serverPath, server);
console.log('Native Linux mining liveness policy enforced:', root);
