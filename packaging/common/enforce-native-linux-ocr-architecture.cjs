#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const [root] = process.argv.slice(2);
if (!root) {
  console.error('usage: enforce-native-linux-ocr-architecture.cjs <staged-app-root>');
  process.exit(2);
}

const fail = (m) => { throw new Error(`Native Linux OCR contract: ${m}`); };
const must = (v, m) => { if (!v) fail(m); };
const countOf = (s, n) => s.split(n).length - 1;
function replaceOnce(s, from, to, label) {
  if (s.includes(to)) return s;
  const n = countOf(s, from);
  must(n === 1, `${label}: expected one anchor, found ${n}`);
  return s.replace(from, to);
}

const capturePath = path.join(root, 'app/electron/capture.cjs');
const serverPath = path.join(root, 'app/server/server.mjs');
const mainPath = path.join(root, 'app/electron/main.cjs');
const preloadPath = path.join(root, 'app/electron/preload.cjs');
for (const p of [capturePath, serverPath, mainPath, preloadPath]) must(fs.existsSync(p), `missing ${path.relative(root, p)}`);

const runtimeSource = path.join(__dirname, 'native-linux-ocr-runtime.cjs');
const runtimeTarget = path.join(root, 'app/electron/native-linux-ocr.cjs');
must(fs.existsSync(runtimeSource), 'missing packaging/common/native-linux-ocr-runtime.cjs');
fs.copyFileSync(runtimeSource, runtimeTarget);

let capture = fs.readFileSync(capturePath, 'utf8');
let server = fs.readFileSync(serverPath, 'utf8');
let main = fs.readFileSync(mainPath, 'utf8');
let preload = fs.readFileSync(preloadPath, 'utf8');

// --- Electron capture: runtime + exact game-display geometry ---------------------------------
if (!capture.includes('ARCHVERSE_LINUX_OCR_CONTRACT_V1')) {
  capture = replaceOnce(capture,
    'const { detectScanModeRadarIcon } = require("./scan-mode-gate.cjs");',
    'const { detectScanModeRadarIcon } = require("./scan-mode-gate.cjs");\nconst { createLinuxOcrBackend, regionFor: linuxOcrRegion, regionPixels: linuxOcrRegionPixels, normalizedRegions: normalizedLinuxOcrRegions } = require("./native-linux-ocr.cjs"); // ARCHVERSE_LINUX_OCR_CONTRACT_V1',
    'Linux OCR runtime import');

  capture = replaceOnce(capture,
    'const rapidOcrClient = createRapidOcrClient({ logger: console });\nprocess.once("exit", () => rapidOcrClient.close());',
    'const rapidOcrClient = createRapidOcrClient({ logger: console });\nlet _lastOcrCaptureInfo = null;\nprocess.once("exit", () => rapidOcrClient.close());',
    'capture geometry state');

  capture = replaceOnce(capture,
    'async function captureGame(winRect) {\n  const disp = winRect ? screen.getDisplayMatching(winRect) : screen.getPrimaryDisplay();\n  const errors = [];',
    'async function captureGame(winRect) {\n  const disp = winRect ? screen.getDisplayMatching(winRect) : screen.getPrimaryDisplay();\n  _lastOcrCaptureInfo = {\n    x: disp.bounds.x, y: disp.bounds.y, width: disp.bounds.width, height: disp.bounds.height,\n    displayId: String(disp.id), configDir: _lastOcrCaptureInfo?.configDir || "", at: Date.now(),\n  };\n  const errors = [];',
    'bound game display capture geometry');

  capture = replaceOnce(capture,
    'async function ocrRapidLinesOptional(imgPath) {\n  try { return await ocrRapidLines(imgPath); }\n  catch (error) {\n    reportRapidOcrFailure(error);\n    if (!_rapidWarningShown) {\n      _rapidWarningShown = true;\n      console.warn("[ocr] RapidOCR worker unavailable; continuing without RapidOCR for this read:", error?.message || error);\n    }\n    return [];\n  }\n}\n',
    'async function ocrRapidLinesOptional(imgPath) {\n  try { return await ocrRapidLines(imgPath); }\n  catch (error) {\n    reportRapidOcrFailure(error);\n    if (!_rapidWarningShown) {\n      _rapidWarningShown = true;\n      console.warn("[ocr] RapidOCR worker unavailable; continuing without RapidOCR for this read:", error?.message || error);\n    }\n    return [];\n  }\n}\n\nconst linuxOcr = createLinuxOcrBackend({ ocrRapidLines, reportRapidOcrFailure });\nfunction getOcrCaptureInfo() {\n  if (!_lastOcrCaptureInfo || !Number.isFinite(_lastOcrCaptureInfo.x)) return null;\n  const cfg = readConfig(_lastOcrCaptureInfo.configDir || "");\n  return { ..._lastOcrCaptureInfo, regions: normalizedLinuxOcrRegions(cfg) };\n}\n',
    'Linux OCR backend initialization');

  capture = replaceOnce(capture,
    'function startFabCapture({ port, configDir, onStatus, devTools = false }) {\n  _rapidFailureReporter = (message) => {',
    'function startFabCapture({ port, configDir, onStatus, devTools = false }) {\n  _lastOcrCaptureInfo = { ...(_lastOcrCaptureInfo || {}), configDir };\n  _rapidFailureReporter = (message) => {',
    'OCR config directory binding');

  capture = replaceOnce(capture,
    '  let lastMiningOcrSig = null;\n  // Where the signature was last actually found',
    '  let lastMiningOcrSig = null;\n  const linuxOcrLastAt = new Map();\n  const linuxOcrDue = (key, everyMs) => {\n    const now = Date.now(), last = linuxOcrLastAt.get(key) || 0;\n    if (now - last < everyMs) return false;\n    linuxOcrLastAt.set(key, now);\n    return true;\n  };\n  // Where the signature was last actually found',
    'per-region OCR cadence');

  const blockStart = '      const locked = mining && sigBox && Date.now() - sigBoxAt < SIG_LOCK_MS;';
  const blockEnd = '      // Pass 3 — same dual-engine idea, for the mining signature:';
  const start = capture.indexOf(blockStart);
  const end = capture.indexOf(blockEnd, start);
  must(start >= 0 && end > start, 'could not locate inherited generic OCR block');
  const linuxBlock = `      const locked = mining && sigBox && Date.now() - sigBoxAt < SIG_LOCK_MS;
      let read = { kind: "none" };
      let renderSrc = shot;
      if (process.platform === "linux") {
        // ARCHVERSE_LINUX_PER_WIDGET_OCR_REGIONS: Linux never OCRs the full frame. Each enabled
        // consumer reads only its independently calibrated region on the bound Star Citizen frame.
        stage.skippedFullFrame = true;
        const readRegion = async (key, enabled, everyMs = POLL_MS) => {
          if (!enabled || !linuxOcrDue(key, everyMs)) return null;
          const t = Date.now();
          try {
            const got = await linuxOcr.readCrop({ shot, frameW: cap.width, frameH: cap.height, cfg, key });
            const resp = await fetch(\`http://localhost:\${port}/api/screen-read\`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                lines: got.lines, w: got.region.width, h: got.region.height, ocrRegion: key,
                offsetX: got.region.x, offsetY: got.region.y, frameW: cap.width, frameH: cap.height,
              }),
              signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
            const read = await resp.json();
            stage[\`ocr_\${key}\`] = \`\${got.engine}:\${Date.now() - t}ms:\${got.region.width}x\${got.region.height}\`;
            return { ...got, read };
          } catch (error) {
            stage[\`ocr_\${key}_error\`] = String(error?.message || error).slice(0, 180);
            console.warn(\`[ocr] \${key} crop failed:\`, error?.message || error);
            return null;
          }
        };

        const fabRead = await readRegion("fabricator", fab);
        if (fabRead?.read?.kind === "fabricator") { read = fabRead.read; renderSrc = fabRead.crop; }

        if (claim) {
          // Claim/context remains independent. Reuse only when the USER deliberately made both
          // rectangles identical; otherwise each feature pays for and receives only its own crop.
          const a = linuxOcrRegion(cfg, "fabricator"), b = linuxOcrRegion(cfg, "claimContext");
          const same = ["x", "y", "w", "h"].every((k) => Math.abs(a[k] - b[k]) < 0.00001);
          const claimRead = same && fabRead ? fabRead : await readRegion("claimContext", true);
          if (read.kind === "none" && claimRead?.read?.kind === "fabricator") { read = claimRead.read; renderSrc = claimRead.crop; }
        }

        const missionRead = await readRegion("mission", miss);
        if (read.kind === "none" && missionRead?.read?.kind === "mission") read = missionRead.read;

        // Refinery is intentionally slow even while signatures are on the 900ms fast cadence.
        const refineryRead = await readRegion("refinery", mining, POLL_MS);
        if (read.kind === "none" && refineryRead?.read?.kind === "refinery") read = refineryRead.read;
      } else {
        // Windows keeps the upstream Windows.Media.Ocr full-frame glance. Linux cannot enter here.
        const needGeneric = fab || miss || claim || mining;
        if (!locked && needGeneric) {
          try {
            const t1 = Date.now();
            const tmpShot = tmpShots[tmpShotIdx = (tmpShotIdx + 1) % tmpShots.length];
            fs.writeFileSync(tmpShot, shot.toPNG());
            stage.pngFull = Date.now() - t1;
            const t2 = Date.now();
            const resp = await fetch(\`http://localhost:\${port}/api/screen-read\`, {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: tmpShot }),
              signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
            read = await resp.json(); stage.winOcr = Date.now() - t2;
          } catch (e) { stage.glanceError = String(e?.message || e).slice(0, 200); }
        } else stage.skippedFullFrame = true;

        if (read.kind === "fabricator" && fab && cfg.rapidOcr !== false) {
          try {
            const panel = rightPanelCrop(shot, cap.width, cap.height); fs.writeFileSync(tmpPanel, panel.img.toPNG());
            const lines = await ocrRapidLines(tmpPanel);
            const r2 = await fetch(\`http://localhost:\${port}/api/screen-read\`, {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines, w: panel.w, h: panel.h }),
              signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
            const rr = await r2.json();
            if (rr.kind === "fabricator" && rr.item) { read = rr; renderSrc = panel.img; }
          } catch (e) { console.warn("[fab-capture] RapidOCR re-read failed, using Windows OCR:", e && e.message); }
        }
      }
`;
  capture = capture.slice(0, start) + linuxBlock + capture.slice(end);

  capture = replaceOnce(capture,
    '      if (mining && cfg.rapidOcr !== false) {',
    '      if (mining && (process.platform === "linux" || cfg.rapidOcr !== false)) { // Linux OCR backend is contractual once the feature is armed',
    'Linux mining OCR backend gate');
  capture = capture.replace(
    'const full = scanRegionPixels(cfg.scanRegion, cap.width, cap.height);',
    'const full = linuxOcrRegionPixels(cfg, "resourceSignature", cap.width, cap.height);'
  );

  capture = replaceOnce(capture,
    '          const lines = (await ocrRapidLines(tmpMiningCrop)).map((l) => ({\n            text: l.text,\n            x: l.x / MINING_OCR_SCALE, y: l.y / MINING_OCR_SCALE,\n            w: l.w / MINING_OCR_SCALE, h: l.h / MINING_OCR_SCALE,\n          })); // back to the ORIGINAL crop\'s pixel space before anything downstream sees them\n          stage.rapidOcr = Date.now() - t4;',
    '          const miningOcr = process.platform === "linux"\n            ? await linuxOcr.ocrLines(tmpMiningCrop, { key: "resourceSignature", numeric: true })\n            : { engine: "rapidocr", lines: await ocrRapidLines(tmpMiningCrop) };\n          const lines = miningOcr.lines.map((l) => ({\n            text: l.text,\n            x: l.x / MINING_OCR_SCALE, y: l.y / MINING_OCR_SCALE,\n            w: l.w / MINING_OCR_SCALE, h: l.h / MINING_OCR_SCALE,\n          })); // back to the ORIGINAL crop\'s pixel space before anything downstream sees them\n          stage.rapidOcr = Date.now() - t4;\n          stage.miningOcrEngine = miningOcr.engine;',
    'resource signature Linux OCR backend');

  capture = capture.replace(
    'body: JSON.stringify({ lines, w: region.width, h: region.height, miningCrop: true }),',
    'body: JSON.stringify({ lines, w: region.width, h: region.height, miningCrop: true, ocrRegion: "resourceSignature", offsetX: region.x, offsetY: region.y, frameW: cap.width, frameH: cap.height }),'
  );

  capture = replaceOnce(capture,
    'fs.writeFileSync(path.join(shotsDir, `${item}.jpg`), shot.toJPEG(85));',
    'fs.writeFileSync(path.join(shotsDir, `${item}.jpg`), (process.platform === "linux" ? renderSrc : shot).toJPEG(85)); // ARCHVERSE_LINUX_NO_FULL_FRAME_OCR_ARCHIVE',
    'Linux archival crop');

  capture = replaceOnce(capture,
    'module.exports = { startFabCapture, centerTighten, findScanGlyph, GLYPH, __test: { classifyLinuxForeground, cleanX11Field, visualFingerprint, fingerprintDistance } };',
    'module.exports = { startFabCapture, getOcrCaptureInfo, centerTighten, findScanGlyph, GLYPH, __test: { classifyLinuxForeground, cleanX11Field, visualFingerprint, fingerprintDistance, linuxOcrRegionPixels } };',
    'OCR capture info export');
}

// --- Sidecar: independent ROI persistence + hard Win32 gate ----------------------------------
if (!server.includes('ARCHVERSE_LINUX_OCR_REGION_CONFIG')) {
  server = replaceOnce(server,
    '  scanRegion: null,\n  miningAutoShow: false,',
    '  scanRegion: null,\n  // ARCHVERSE_LINUX_OCR_REGION_CONFIG: five independent normalized ROIs on the bound game frame.\n  linuxOcrRegions: { resourceSignature: null, fabricator: null, mission: null, claimContext: null, refinery: null },\n  miningAutoShow: false,',
    'Linux OCR region defaults');

  server = replaceOnce(server,
    '    } else if (typeof body.path === "string" && body.path) {\n      const ocr = await ocrImage(body.path);',
    '    } else if (process.platform === "win32" && typeof body.path === "string" && body.path) {\n      // ARCHVERSE_LINUX_NO_WINDOWS_MEDIA_OCR: Windows.Media.Ocr/PowerShell is Win32-only.\n      const ocr = await ocrImage(body.path);',
    'Windows OCR platform gate');

  server = replaceOnce(server,
    '      if (ok) config.scanRegion = { x: r.x, y: r.y, w: r.w, h: r.h };\n    }\n    if (typeof body.miningAutoShow === "boolean") config.miningAutoShow = body.miningAutoShow;',
    '      if (ok) {\n        config.scanRegion = { x: r.x, y: r.y, w: r.w, h: r.h };\n        config.linuxOcrRegions = { ...(config.linuxOcrRegions || {}), resourceSignature: config.scanRegion };\n      }\n    }\n    if (body.linuxOcrRegions && typeof body.linuxOcrRegions === "object") {\n      const allowed = new Set(["resourceSignature", "fabricator", "mission", "claimContext", "refinery"]);\n      const next = { ...(config.linuxOcrRegions || {}) };\n      for (const [key, value] of Object.entries(body.linuxOcrRegions)) {\n        if (!allowed.has(key)) continue;\n        if (value === null) { next[key] = null; continue; }\n        if (!value || typeof value !== "object") continue;\n        const r = value;\n        const ok = [r.x, r.y, r.w, r.h].every((n) => typeof n === "number" && Number.isFinite(n))\n          && r.w > 0.02 && r.h > 0.01 && r.x >= 0 && r.y >= 0 && r.x + r.w <= 1.001 && r.y + r.h <= 1.001;\n        if (ok) next[key] = { x: r.x, y: r.y, w: r.w, h: r.h };\n      }\n      config.linuxOcrRegions = next;\n      if (Object.prototype.hasOwnProperty.call(body.linuxOcrRegions, "resourceSignature")) config.scanRegion = next.resourceSignature ?? null;\n    }\n    if (typeof body.miningAutoShow === "boolean") config.miningAutoShow = body.miningAutoShow;',
    'independent OCR region config update');
}

// --- Renderer geometry bridge: ROI boxes are bound to the game display, not desktop canvas -----
if (!main.includes('ARCHVERSE_LINUX_OCR_CAPTURE_INFO')) {
  main = replaceOnce(main,
    'const { startFabCapture } = require("./capture.cjs");',
    'const { startFabCapture, getOcrCaptureInfo } = require("./capture.cjs"); // ARCHVERSE_LINUX_OCR_CAPTURE_INFO',
    'capture info import');
  main = replaceOnce(main,
    '  ipcMain.handle("overlay:canvas-info", () => {\n    const v = virtualDesktopBounds();',
    '  ipcMain.handle("overlay:ocr-capture-info", () => {\n    const info = getOcrCaptureInfo?.();\n    if (!info || !Number.isFinite(info.x) || !Number.isFinite(info.y)) return null;\n    const v = virtualDesktopBounds(); const s = canvasContentShift(); const z = canvasScale;\n    return {\n      px: info.x - v.x + s.x / z, py: info.y - v.y + s.y / z, pw: info.width, ph: info.height,\n      displayId: info.displayId, at: info.at, regions: info.regions || null,\n    };\n  });\n  ipcMain.handle("overlay:canvas-info", () => {\n    const v = virtualDesktopBounds();',
    'OCR capture geometry IPC');
}
if (!preload.includes('getOcrCaptureInfo')) {
  preload = replaceOnce(preload,
    '  getCanvasInfo: () => ipcRenderer.invoke("overlay:canvas-info"),',
    '  getCanvasInfo: () => ipcRenderer.invoke("overlay:canvas-info"),\n  getOcrCaptureInfo: () => ipcRenderer.invoke("overlay:ocr-capture-info"),',
    'OCR capture geometry preload bridge');
}

must(capture.includes('ARCHVERSE_LINUX_OCR_CONTRACT_V1'), 'OCR runtime is not wired into capture');
must(capture.includes('ARCHVERSE_LINUX_PER_WIDGET_OCR_REGIONS'), 'per-widget Linux crop execution missing');
must(capture.includes('linuxOcr.readCrop'), 'generic Linux crop reader missing');
must(capture.includes('linuxOcr.ocrLines(tmpMiningCrop'), 'resource signature is not on common Linux backend');
must(capture.includes('ARCHVERSE_LINUX_NO_FULL_FRAME_OCR_ARCHIVE'), 'Linux fabricator archive can still save a full frame');
must(!capture.includes('if (mining && cfg.rapidOcr !== false) {'), 'Linux mining can still be disabled into a non-contract backend path');
must(server.includes('ARCHVERSE_LINUX_NO_WINDOWS_MEDIA_OCR'), 'Windows OCR server gate missing');
must(server.includes('process.platform === "win32" && typeof body.path === "string"'), 'path OCR is executable outside Win32');
must(server.includes('ARCHVERSE_LINUX_OCR_REGION_CONFIG'), 'independent ROI config missing');
must(main.includes('overlay:ocr-capture-info'), 'bound game capture geometry IPC missing');
must(preload.includes('getOcrCaptureInfo'), 'renderer cannot request bound game geometry');

fs.writeFileSync(capturePath, capture);
fs.writeFileSync(serverPath, server);
fs.writeFileSync(mainPath, main);
fs.writeFileSync(preloadPath, preload);
console.log('Native Linux OCR architecture enforced:', root);
