#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const [root] = process.argv.slice(2);
if (!root) { console.error('usage: enforce-alpha22-field-fixes.cjs <staged-app-root>'); process.exit(2); }
const must = (cond, msg) => { if (!cond) throw new Error(`Alpha22 field fixes: ${msg}`); };
const replaceOnce = (text, from, to, label) => {
  if (text.includes(to)) return text;
  const n = text.split(from).length - 1;
  must(n === 1, `${label}: expected one anchor, found ${n}`);
  return text.replace(from, to);
};

const mainPath = path.join(root, 'app/electron/main.cjs');
const capturePath = path.join(root, 'app/electron/capture.cjs');
const serverPath = path.join(root, 'app/server/server.mjs');
const missionsPath = path.join(root, 'app/server/overlay/missions.html');
for (const p of [mainPath, capturePath, serverPath, missionsPath]) must(fs.existsSync(p), `missing ${path.relative(root, p)}`);

let main = fs.readFileSync(mainPath, 'utf8');
let capture = fs.readFileSync(capturePath, 'utf8');
let server = fs.readFileSync(serverPath, 'utf8');
let missions = fs.readFileSync(missionsPath, 'utf8');

// F must work on the first press after startup. The shell already asks the renderer for a forced
// region snapshot at did-finish-load and F-down, but the page never exported the bridge it asks for.
if (!missions.includes('ARCHVERSE_LINUX_F_HOVER_STARTUP_PRIME')) {
  const old = `      const reportRegions = () => {\n        const rects = [];\n        document.querySelectorAll(RSEL).forEach((el) => {\n          const r = el.getBoundingClientRect();\n          if (r.width > 1 && r.height > 1) rects.push({ x: r.left, y: r.top, w: r.width, h: r.height });\n        });\n        const sig = JSON.stringify(rects);\n        if (sig === lastRegions) return;\n        lastRegions = sig;\n        window.overlayApi.reportRegions(rects);\n      };`;
  const neu = `      const reportRegions = (force = false) => {\n        const rects = [];\n        document.querySelectorAll(RSEL).forEach((el) => {\n          const r = el.getBoundingClientRect();\n          if (r.width > 1 && r.height > 1) rects.push({ x: r.left, y: r.top, w: r.width, h: r.height });\n        });\n        const sig = JSON.stringify(rects);\n        if (!force && sig === lastRegions) return false;\n        lastRegions = sig;\n        window.overlayApi.reportRegions(rects);\n        return true;\n      };\n      // ARCHVERSE_LINUX_F_HOVER_STARTUP_PRIME: the native shell can request the current widget\n      // rectangles before the player ever enters arrange mode. This removes the Shift+F6-primes-F\n      // dependency observed in Candidate 3 without widening click-through ownership.\n      window.__overlayReportRegions = (force = false) => reportRegions(force === true);`;
  missions = replaceOnce(missions, old, neu, 'renderer region snapshot bridge');
}
if (!main.includes('ARCHVERSE_LINUX_F_HOVER_STARTUP_PRIME')) {
  main = replaceOnce(main,
    '  ).then(() => true).catch((error) => {',
    '  ).then((reported) => reported === true).catch((error) => { // ARCHVERSE_LINUX_F_HOVER_STARTUP_PRIME',
    'shell forced-region acknowledgement');
}

// Linux OCR hierarchy is RapidOCR -> Tesseract only. PipeWire/Spectacle are capture transports,
// not OCR engines. If both Linux OCR engines fail, retry next tick; never claim Windows fallback.
if (!capture.includes('ARCHVERSE_LINUX_OCR_EXHAUSTED_RETRY')) {
  capture = replaceOnce(capture,
    '        } catch (e) { console.warn("[fab-capture] mining RapidOCR re-read failed, using Windows OCR:", e && e.message); }',
    `        } catch (e) {\n          if (process.platform === "linux") {\n            console.warn("[mining-ocr] Linux OCR exhausted (RapidOCR/Tesseract); retrying next tick:", e && e.message); // ARCHVERSE_LINUX_OCR_EXHAUSTED_RETRY\n          } else {\n            console.warn("[fab-capture] mining RapidOCR re-read failed; retaining Windows OCR result:", e && e.message);\n          }\n        }`,
    'misleading mining Windows OCR fallback message');
}

// A Linux build must fail closed even if a future refactor accidentally calls the inherited
// Windows.Media.Ocr helper. The normal /api/screen-read route is already Win32-gated; this is the
// second line of defense at the helper boundary itself.
if (!server.includes('ARCHVERSE_LINUX_WINDOWS_OCR_HARD_DENY')) {
  server = replaceOnce(server,
    'function ocrImageOneShot(imagePath) {\n  const winPath = resolve(imagePath).replace(/\\//g, "\\\\");',
    'function ocrImageOneShot(imagePath) {\n  if (process.platform !== "win32") throw new Error("ARCHVERSE_LINUX_WINDOWS_OCR_HARD_DENY: Windows.Media.Ocr is disabled on Linux");\n  const winPath = resolve(imagePath).replace(/\\//g, "\\\\");',
    'one-shot Windows OCR hard deny');
  server = replaceOnce(server,
    'function ensureOcrWorker() {\n  if (worker) return worker;',
    'function ensureOcrWorker() {\n  if (process.platform !== "win32") throw new Error("ARCHVERSE_LINUX_WINDOWS_OCR_HARD_DENY: PowerShell OCR worker is disabled on Linux");\n  if (worker) return worker;',
    'worker Windows OCR hard deny');
  server = replaceOnce(server,
    'function ocrImage(imagePath) {\n  const w = ensureOcrWorker();',
    'function ocrImage(imagePath) {\n  if (process.platform !== "win32") throw new Error("ARCHVERSE_LINUX_WINDOWS_OCR_HARD_DENY: Windows OCR call blocked on Linux");\n  const w = ensureOcrWorker();',
    'Windows OCR call hard deny');
}

// Candidate 3 proved read-back verification, but the field log caught a short JSON file while
// another async save was writing it. Replace the in-place async write with temp+rename. rename(2)
// makes readers see either the old complete JSON or the new complete JSON, never a truncated file.
if (!server.includes('ARCHVERSE_CONFIG_ATOMIC_SAVE')) {
  const old = `var saveConfig = async () => {\n  repairArchVerseLinuxConfig(config);\n  try {\n    mkdirSync4(userDir, { recursive: true });\n    await writeFile2(configPath, JSON.stringify(config, null, 2));\n    lastSaveOk = (/* @__PURE__ */ new Date()).toISOString();\n    lastSaveError = null;\n  } catch (e) {\n    lastSaveError = { at: (/* @__PURE__ */ new Date()).toISOString(), error: String(e) };\n    console.error("[config] save failed:", String(e));\n  }\n};`;
  const neu = `var saveConfig = async () => {\n  repairArchVerseLinuxConfig(config);\n  let tempConfigPath = null;\n  try {\n    mkdirSync4(userDir, { recursive: true });\n    // ARCHVERSE_CONFIG_ATOMIC_SAVE: never expose a partially-written config.json to verification,\n    // startup, or another save. The synchronous critical section is intentionally tiny.\n    tempConfigPath = configPath + ".tmp-" + process.pid + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);\n    writeFileSync7(tempConfigPath, JSON.stringify(config, null, 2), "utf8");\n    renameSync(tempConfigPath, configPath);\n    tempConfigPath = null;\n    lastSaveOk = (/* @__PURE__ */ new Date()).toISOString();\n    lastSaveError = null;\n  } catch (e) {\n    if (tempConfigPath) { try { rmSync(tempConfigPath, { force: true }); } catch {} }\n    lastSaveError = { at: (/* @__PURE__ */ new Date()).toISOString(), error: String(e) };\n    console.error("[config] save failed:", String(e));\n  }\n};`;
  server = replaceOnce(server, old, neu, 'atomic config save');
}

must(missions.includes('ARCHVERSE_LINUX_F_HOVER_STARTUP_PRIME'), 'renderer startup-prime marker missing');
must(main.includes('ARCHVERSE_LINUX_F_HOVER_STARTUP_PRIME'), 'shell startup-prime marker missing');
must(capture.includes('ARCHVERSE_LINUX_OCR_EXHAUSTED_RETRY'), 'Linux OCR exhausted marker missing');
must(!capture.includes('mining RapidOCR re-read failed, using Windows OCR'), 'misleading mining Windows OCR fallback remains');
must(server.includes('ARCHVERSE_LINUX_WINDOWS_OCR_HARD_DENY'), 'Windows OCR hard deny missing');
must(server.includes('process.platform === "win32" && typeof body.path === "string"'), 'screen-read Win32 route gate missing');
must(server.includes('ARCHVERSE_CONFIG_ATOMIC_SAVE'), 'atomic config save marker missing');

fs.writeFileSync(mainPath, main);
fs.writeFileSync(capturePath, capture);
fs.writeFileSync(serverPath, server);
fs.writeFileSync(missionsPath, missions);
console.log('Alpha22 field fixes enforced:', root);
