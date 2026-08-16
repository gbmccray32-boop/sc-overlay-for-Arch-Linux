#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const [root] = process.argv.slice(2);
if (!root) {
  console.error('usage: enforce-native-linux-runtime-policy.cjs <staged-app-root>');
  process.exit(2);
}

function must(cond, msg) {
  if (!cond) throw new Error(`Native Linux runtime policy: ${msg}`);
}
function countOf(text, needle) { return text.split(needle).length - 1; }
function replaceOnce(text, from, to, label) {
  if (text.includes(to)) return text;
  const n = countOf(text, from);
  must(n === 1, `${label}: expected exactly one anchor, found ${n}`);
  return text.replace(from, to);
}

const capturePath = path.join(root, 'app/electron/capture.cjs');
const mainPath = path.join(root, 'app/electron/main.cjs');
const sessionPath = path.join(root, 'app/electron/linux/star-citizen-session.cjs');
const serverPath = path.join(root, 'app/server/server.mjs');
for (const p of [capturePath, mainPath, sessionPath, serverPath]) {
  must(fs.existsSync(p), `missing ${path.relative(root, p)}`);
}

let capture = fs.readFileSync(capturePath, 'utf8');
let main = fs.readFileSync(mainPath, 'utf8');
const session = fs.readFileSync(sessionPath, 'utf8');
let server = fs.readFileSync(serverPath, 'utf8');

// ---------------------------------------------------------------------------
// 1. Mining signatures are authoritative. Radar/scan-mode image recognition is telemetry only.
// ---------------------------------------------------------------------------
if (!capture.includes('ARCHVERSE_LINUX_MINING_SIGNATURE_AUTHORITY')) {
  capture = replaceOnce(capture,
    '      if (!archScanModeRead.active) { sigBox = null; sigBoxAt = 0; }\n      stage.scanMode = archScanModeRead.active;',
    '      // ARCHVERSE_LINUX_MINING_SIGNATURE_AUTHORITY: radar/scan-mode recognition is diagnostic-only.\n      // A valid signature refreshes/ages its own lock; radar state must never clear or gate it.\n      stage.scanMode = archScanModeRead.active;',
    'radar lock clearing');

  capture = replaceOnce(capture,
    '      const locked = mining && archScanModeRead.active && sigBox && Date.now() - sigBoxAt < SIG_LOCK_MS;',
    '      const locked = mining && sigBox && Date.now() - sigBoxAt < SIG_LOCK_MS;',
    'signature lock authority');

  capture = replaceOnce(capture,
    '      const needGeneric = fab || miss || claim || (mining && archScanModeRead.active);',
    '      const needGeneric = fab || miss || claim;',
    'generic OCR mining gate removal');

  const discard = `          if (mining && !archScanModeRead.active && (read?.kind === "mineable" || typeof read?.signature === "number")) {\n            read = { kind: "none" };\n          }\n`;
  must(countOf(capture, discard) === 1, `radar-based signature discard: expected one block, found ${countOf(capture, discard)}`);
  capture = capture.replace(discard, '');

  capture = replaceOnce(capture,
    '      if (mining && archScanModeRead.active && cfg.rapidOcr !== false) {',
    '      if (mining && cfg.rapidOcr !== false) {',
    'RapidOCR mining gate');

  capture = replaceOnce(capture,
    '      else if (mining && archScanModeRead.active && (read.scanHud || typeof read.signature === "number")) fastUntil = Date.now() + FAST_WINDOW_MS;',
    '      else if (mining && (read.scanHud || typeof read.signature === "number")) fastUntil = Date.now() + FAST_WINDOW_MS;',
    'fast polling evidence gate');
}

// ---------------------------------------------------------------------------
// 2. RapidOCR failures must be surfaced before fallback behavior makes the failure look healthy.
// ---------------------------------------------------------------------------
if (!capture.includes('ARCHVERSE_LINUX_RAPIDOCR_FAILURE_REPORT')) {
  capture = replaceOnce(capture,
    'let _rapidWarningShown = false;',
    `let _rapidWarningShown = false;\nlet _rapidFailureReporter = null; // ARCHVERSE_LINUX_RAPIDOCR_FAILURE_REPORT\nfunction reportRapidOcrFailure(error) {\n  const message = String(error?.message || error || "unknown RapidOCR failure");\n  try { _rapidFailureReporter?.(message); } catch {}\n}`,
    'RapidOCR reporter state');

  capture = replaceOnce(capture,
    `  catch (error) {\n    if (!_rapidWarningShown) {`,
    `  catch (error) {\n    reportRapidOcrFailure(error);\n    if (!_rapidWarningShown) {`,
    'RapidOCR failure-before-fallback hook');

  const startAnchor = `function startFabCapture({ port, configDir, onStatus, devTools = false }) {\n  const captureDir = path.join(configDir, "fab-captures");`;
  const startNew = `function startFabCapture({ port, configDir, onStatus, devTools = false }) {\n  _rapidFailureReporter = (message) => {\n    const health = { ok: false, subsystem: "rapidocr", message, at: new Date().toISOString() };\n    try { onStatus?.({ state: "error", ...health }); } catch {}\n    try {\n      fs.mkdirSync(configDir, { recursive: true });\n      fs.writeFileSync(path.join(configDir, "rapidocr-health.json"), JSON.stringify(health, null, 2) + "\\n");\n    } catch {}\n  };\n  const captureDir = path.join(configDir, "fab-captures");`;
  capture = replaceOnce(capture, startAnchor, startNew, 'RapidOCR reporter install');

  capture = replaceOnce(capture,
    '  return () => { clearInterval(timer); clearInterval(drainTimer); };',
    '  return () => { clearInterval(timer); clearInterval(drainTimer); _rapidFailureReporter = null; };',
    'RapidOCR reporter cleanup');
}

// ---------------------------------------------------------------------------
// 3. Exact Star Citizen session binding is a native Linux privacy/input requirement.
//    Preserve the working binder and fail closed if a future upstream refactor removes it.
// ---------------------------------------------------------------------------
if (!capture.includes('ARCHVERSE_LINUX_EXACT_SC_SESSION_BINDING')) {
  capture = replaceOnce(capture,
    'const scSession = getStarCitizenSessionBinder();',
    'const scSession = getStarCitizenSessionBinder(); // ARCHVERSE_LINUX_EXACT_SC_SESSION_BINDING',
    'exact Star Citizen binding marker');
}

// ---------------------------------------------------------------------------
// 4. Watcher seed -> tail handoff must be byte-contiguous. No mission accept may fall in a gap.
// ---------------------------------------------------------------------------
if (!server.includes('ARCHVERSE_LINUX_WATCHER_HANDOFF')) {
  server = replaceOnce(server,
    `  readExisting;\n  position = 0;`,
    `  readExisting;\n  startPosition; // ARCHVERSE_LINUX_WATCHER_HANDOFF\n  position = 0;`,
    'watcher startPosition field');

  server = replaceOnce(server,
    `    this.readExisting = options.readExisting ?? false;\n  }`,
    `    this.readExisting = options.readExisting ?? false;\n    this.startPosition = typeof options.startPosition === "number" ? options.startPosition : null;\n  }`,
    'watcher startPosition constructor');

  server = replaceOnce(server,
    `      this.position = this.readExisting ? 0 : size;`,
    `      // Explicit seed offset wins. If it is past EOF, the log rotated after seeding; start at 0.\n      this.position = this.startPosition != null\n        ? (this.startPosition <= size ? this.startPosition : 0)\n        : this.readExisting ? 0 : size;`,
    'watcher first-sight handoff');

  server = replaceOnce(server,
    `function seedTrackerFromLog() {\n  try {\n    const text = readFileSync9(config.logPath, "utf8");`,
    `function seedTrackerFromLog() {\n  try {\n    // Read bytes, not characters: LogWatcher seeks by byte offset.\n    const seedBuf = readFileSync9(config.logPath);\n    seedEndsAt = seedBuf.length;\n    const text = seedBuf.toString("utf8");`,
    'seed byte offset capture');

  server = replaceOnce(server,
    `  } catch {\n  }\n}\nvar watcher = null;\nfunction startWatcher() {`,
    `  } catch {\n    seedEndsAt = null;\n  }\n}\nvar watcher = null;\nvar seedEndsAt = null; // ARCHVERSE_LINUX_WATCHER_HANDOFF\nfunction startWatcher() {`,
    'seed handoff state');

  server = replaceOnce(server,
    `  watcher = new LogWatcher(config.logPath, { pollInterval: 1e3 });`,
    `  watcher = new LogWatcher(config.logPath, {\n    pollInterval: 1e3,\n    ...(seedEndsAt != null ? { startPosition: seedEndsAt } : {})\n  });\n  seedEndsAt = null;`,
    'watcher handoff startup');
}

// ---------------------------------------------------------------------------
// 5. Mission completion behavior from upstream 0.1.43 is mandatory on Linux.
//    Current release payload already contains the fixes; mark them and reject regressions.
// ---------------------------------------------------------------------------
if (!server.includes('ARCHVERSE_LINUX_MISSION_COMPLETION')) {
  server = replaceOnce(server,
    '  completedAtByMission = /* @__PURE__ */ new Map();',
    '  completedAtByMission = /* @__PURE__ */ new Map(); // ARCHVERSE_LINUX_MISSION_COMPLETION',
    'mission completion fence marker');
}

// ---------------------------------------------------------------------------
// Fail-loud policy verification.
// ---------------------------------------------------------------------------
must(capture.includes('ARCHVERSE_LINUX_MINING_SIGNATURE_AUTHORITY'), 'mining signature authority marker missing');
must(capture.includes('const locked = mining && sigBox && Date.now() - sigBoxAt < SIG_LOCK_MS;'), 'signature lock still depends on radar state');
must(capture.includes('const needGeneric = fab || miss || claim;'), 'generic OCR still uses mining as a gate');
must(capture.includes('if (mining && cfg.rapidOcr !== false) {'), 'mining RapidOCR is not unconditional while armed');
must(capture.includes('else if (mining && (read.scanHud || typeof read.signature === "number"))'), 'fast polling is not evidence-driven');
must(capture.includes('Math.round(lastTickMs * 1.5)'), 'self-tuning polling missing');
must(!capture.includes('mining && archScanModeRead.active && cfg.rapidOcr'), 'radar still gates RapidOCR');
must(!capture.includes('const locked = mining && archScanModeRead.active'), 'radar still gates signature lock');
must(!capture.includes('mining && !archScanModeRead.active && (read?.kind === "mineable"'), 'radar still discards signatures');

must(capture.includes('ARCHVERSE_LINUX_RAPIDOCR_FAILURE_REPORT'), 'RapidOCR failure reporting marker missing');
must(capture.indexOf('reportRapidOcrFailure(error);') < capture.indexOf('console.warn("[ocr] RapidOCR worker unavailable'), 'RapidOCR failure is not surfaced before fallback warning');
must(capture.includes('rapidocr-health.json'), 'persistent RapidOCR health report missing');

must(capture.includes('ARCHVERSE_LINUX_EXACT_SC_SESSION_BINDING'), 'exact Star Citizen session marker missing');
must(capture.includes('belongsToSession(Number(pid))'), 'bound-process membership test missing');
must(capture.includes('gate: "pid-bound-active-window"'), 'bound active-window gate missing');
must(session.includes('belongsToSession(pid, session = this.current())'), 'session binder membership implementation missing');
must(session.includes('getStarCitizenSessionBinder'), 'session binder factory missing');

must(server.includes('ARCHVERSE_LINUX_WATCHER_HANDOFF'), 'watcher handoff marker missing');
must(server.includes('this.startPosition = typeof options.startPosition === "number"'), 'watcher startPosition constructor missing');
must(server.includes('(this.startPosition <= size ? this.startPosition : 0)'), 'stale watcher offset does not reset after rotation');
must(server.includes('seedEndsAt = seedBuf.length;'), 'seed byte length handoff missing');
must(server.includes('...(seedEndsAt != null ? { startPosition: seedEndsAt } : {})'), 'watcher is not started from seed offset');

must(server.includes('ARCHVERSE_LINUX_MISSION_COMPLETION'), 'mission completion policy marker missing');
must(server.includes('this.beginCompletion(ev.missionId, this.missions.get(ev.missionId)?.title ?? null, ev.ts);'), 'completed mission remains display-gated');
must(server.includes('if (!this.completedAtByMission.has(missionId)) this.completedAtByMission.set(missionId, completedAtMs);'), 'completion-time receipt fence missing');
must(server.includes('priorEnd = Math.max(priorEnd, t + REWARD_WINDOW_MS)'), 'overlapping mission receipt fence missing');
must(server.includes('this.completedAtByMission.clear();'), 'mission completion fence not cleared on session reset');

fs.writeFileSync(capturePath, capture);
fs.writeFileSync(mainPath, main);
fs.writeFileSync(serverPath, server);
console.log('Native Linux runtime policy enforced:', root);
