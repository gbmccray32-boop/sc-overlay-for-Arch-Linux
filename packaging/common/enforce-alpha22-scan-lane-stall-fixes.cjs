#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const [root] = process.argv.slice(2);
if (!root) throw new Error('usage: enforce-alpha22-scan-lane-stall-fixes.cjs <staged-app-root>');
const must = (v, m) => { if (!v) throw new Error(`Alpha22 scan/lane fixes: ${m}`); };
const replaceOnce = (s, from, to, label) => {
  if (s.includes(to)) return s;
  const n = s.split(from).length - 1;
  must(n === 1, `${label}: expected one anchor, found ${n}`);
  return s.replace(from, to);
};

const capturePath = path.join(root, 'app/electron/capture.cjs');
const gatePath = path.join(root, 'app/electron/scan-mode-gate.cjs');
for (const p of [capturePath, gatePath]) must(fs.existsSync(p), `missing ${path.relative(root, p)}`);

let capture = fs.readFileSync(capturePath, 'utf8');
let gate = fs.readFileSync(gatePath, 'utf8');

// ARCHVERSE_LINUX_SCAN_MODE_AUTHORITY_ROI
// Field evidence establishes the true universal radar control near x=.49,y=.48 on the normalized
// primary game display. False positives came from fleet-manager/cockpit controls around x=.37-.67,
// y=.62-.68. Keep a generous, resolution-independent center neighborhood for HUD/FOV variance, but
// do not search unrelated lower HUD panels. This both reduces false arming and search cost.
if (!gate.includes('ARCHVERSE_LINUX_SCAN_MODE_AUTHORITY_ROI')) {
  const old = `const SCAN_MODE_RADAR_SEARCH_ROI = Object.freeze({\n  name: "radar-icon-search-field",\n  // The user marked the complete universal Scan HUD area in paired 6360x2560 on/off frames. Once\n  // converted to the 3840x2160 primary game frame, its union is x=.396-.666, y=.433-.665. Keep a\n  // normalized safety margin for FOV and HUD-scale differences without searching unrelated panels.\n  x: 0.37,\n  y: 0.41,\n  w: 0.32,\n  h: 0.30,\n});`;
  const neu = `const SCAN_MODE_RADAR_SEARCH_ROI = Object.freeze({\n  name: "radar-icon-authority-field",\n  // ARCHVERSE_LINUX_SCAN_MODE_AUTHORITY_ROI: paired on/off field captures and later mining logs\n  // put the actual universal radar control near x=.49,y=.48. Search a generous normalized center\n  // neighborhood for HUD/FOV variance, but exclude fleet-manager/cockpit lookalikes in the lower\n  // HUD. This is resolution-independent and applies after the primary game display is normalized.\n  x: 0.43,\n  y: 0.40,\n  w: 0.14,\n  h: 0.18,\n});`;
  gate = replaceOnce(gate, old, neu, 'scan-mode authority ROI');
}

// ARCHVERSE_LINUX_BACKGROUND_OCR_NONBLOCKING
// Candidate 5b proved that independent RapidOCR processes alone are not enough: the main capture
// tick still awaited Promise.all(background lanes), so an 8s sidecar timeout could hold the whole
// scanner for 18s. Keep one worker/queue per feature, but dispatch at most one auxiliary OCR job in
// the background and consume its completed result on a later tick. Mining never awaits it.
if (!capture.includes('ARCHVERSE_LINUX_BACKGROUND_OCR_NONBLOCKING')) {
  capture = replaceOnce(capture,
    `  const linuxOcrLastAt = new Map();\n  const linuxOcrDue = (key, everyMs) => {`,
    `  const linuxOcrLastAt = new Map();\n  // ARCHVERSE_LINUX_BACKGROUND_OCR_NONBLOCKING: completed auxiliary OCR is handed to a later\n  // capture tick. Only one auxiliary lane may execute at once; resourceSignature remains fully\n  // independent and latency-critical.\n  const linuxBackgroundLatest = new Map();\n  const linuxBackgroundInFlight = new Set();\n  const linuxBackgroundKeys = Object.freeze(["fabricator", "claimContext", "mission", "refinery"]);\n  let linuxBackgroundCursor = 0;\n  const LINUX_BACKGROUND_RESULT_TTL_MS = 6500;\n  const takeLinuxBackgroundResult = (key) => {\n    const row = linuxBackgroundLatest.get(key);\n    if (!row) return null;\n    linuxBackgroundLatest.delete(key);\n    return Date.now() - row.at <= LINUX_BACKGROUND_RESULT_TTL_MS ? row.value : null;\n  };\n  const linuxOcrDue = (key, everyMs) => {`,
    'background OCR scheduler state');

  capture = replaceOnce(capture,
    `        const readRegion = async (key, enabled, everyMs = POLL_MS) => {\n          if (!enabled || !linuxOcrDue(key, everyMs)) return null;`,
    `        const readRegion = async (key, enabled, everyMs = POLL_MS, alreadyDue = false) => {\n          if (!enabled || (!alreadyDue && !linuxOcrDue(key, everyMs))) return null;`,
    'readRegion pre-marked due support');

  const oldClosure = `        runLinuxBackgroundOcr = async () => {\n          const a = linuxOcrRegion(cfg, "fabricator"), b = linuxOcrRegion(cfg, "claimContext");\n          const sameClaimRegion = ["x", "y", "w", "h"].every((k) => Math.abs(a[k] - b[k]) < 0.00001);\n          // Own worker per feature + parallel dispatch means one slow consumer cannot serialize all\n          // of the others. Mining runs before this closure and never shares these queues.\n          const [fabRead, claimSeparate, missionRead, refineryRead] = await Promise.all([\n            readRegion("fabricator", fab),\n            (sameClaimRegion && fab) ? Promise.resolve(null) : readRegion("claimContext", claim),\n            readRegion("mission", miss),\n            readRegion("refinery", mining, POLL_MS),\n          ]);\n          if (fabRead?.read?.kind === "fabricator") { read = fabRead.read; renderSrc = fabRead.crop; }\n          const claimRead = sameClaimRegion && fab && fabRead ? fabRead : claimSeparate;\n          if (read.kind === "none" && claimRead?.read?.kind === "fabricator") { read = claimRead.read; renderSrc = claimRead.crop; }\n          if (read.kind === "none" && missionRead?.read?.kind === "mission") read = missionRead.read;\n          if (read.kind === "none" && refineryRead?.read?.kind === "refinery") read = refineryRead.read;\n        };`;

  const newClosure = `        {\n          // Consume only completed, recent background results. A result is single-use so an old\n          // kiosk/mission observation cannot keep replaying after the player has moved away.\n          const fabRead = takeLinuxBackgroundResult("fabricator");\n          const claimRead = takeLinuxBackgroundResult("claimContext");\n          const missionRead = takeLinuxBackgroundResult("mission");\n          const refineryRead = takeLinuxBackgroundResult("refinery");\n          if (fabRead?.read?.kind === "fabricator") { read = fabRead.read; renderSrc = fabRead.crop; }\n          if (read.kind === "none" && claimRead?.read?.kind === "fabricator") { read = claimRead.read; renderSrc = claimRead.crop; }\n          if (read.kind === "none" && missionRead?.read?.kind === "mission") read = missionRead.read;\n          if (read.kind === "none" && refineryRead?.read?.kind === "refinery") read = refineryRead.read;\n        }\n\n        runLinuxBackgroundOcr = () => {\n          const a = linuxOcrRegion(cfg, "fabricator"), b = linuxOcrRegion(cfg, "claimContext");\n          const sameClaimRegion = ["x", "y", "w", "h"].every((k) => Math.abs(a[k] - b[k]) < 0.00001);\n          const enabled = { fabricator: !!fab, claimContext: !!claim && !(sameClaimRegion && fab), mission: !!miss, refinery: !!mining };\n          // At most one auxiliary OCR process is dispatched at once. This preserves independent\n          // feature queues without allowing four background engines/Tesseract fallbacks to compete\n          // with the mining worker or the game at the same instant.\n          if (linuxBackgroundInFlight.size) return false;\n          for (let step = 0; step < linuxBackgroundKeys.length; step += 1) {\n            const idx = (linuxBackgroundCursor + step) % linuxBackgroundKeys.length;\n            const key = linuxBackgroundKeys[idx];\n            if (!enabled[key] || !linuxOcrDue(key, POLL_MS)) continue;\n            linuxBackgroundCursor = (idx + 1) % linuxBackgroundKeys.length;\n            linuxBackgroundInFlight.add(key);\n            const launchedAt = Date.now();\n            void readRegion(key, true, POLL_MS, true).then((value) => {\n              if (value) {\n                linuxBackgroundLatest.set(key, { at: Date.now(), value });\n                if (key === "fabricator" && sameClaimRegion && claim)\n                  linuxBackgroundLatest.set("claimContext", { at: Date.now(), value });\n              }\n            }).catch((error) => {\n              console.warn(\`[ocr-bg] \${key} lane failed:\`, error?.message || error);\n            }).finally(() => {\n              linuxBackgroundInFlight.delete(key);\n              const ms = Date.now() - launchedAt;\n              if (ms >= 1500) console.log(\`[ocr-bg] \${key} lane completed in \${ms}ms; mining was not blocked\`);\n            });\n            return true;\n          }\n          return false;\n        };`;
  capture = replaceOnce(capture, oldClosure, newClosure, 'nonblocking background OCR scheduler');

  capture = replaceOnce(capture,
    `      if (runLinuxBackgroundOcr && !archScanModeRead.active && typeof read.signature !== "number") {\n        await runLinuxBackgroundOcr();\n      } else if (runLinuxBackgroundOcr) {`,
    `      if (runLinuxBackgroundOcr && !archScanModeRead.active && typeof read.signature !== "number") {\n        runLinuxBackgroundOcr();\n        stage.backgroundOcr = linuxBackgroundInFlight.size ? "background-dispatched" : "background-idle";\n      } else if (runLinuxBackgroundOcr) {`,
    'do not await background OCR');
}

must(gate.includes('ARCHVERSE_LINUX_SCAN_MODE_AUTHORITY_ROI'), 'scan-mode authority ROI marker missing');
must(gate.includes('x: 0.43') && gate.includes('y: 0.40') && gate.includes('w: 0.14') && gate.includes('h: 0.18'), 'scan-mode authority ROI values missing');
must(capture.includes('ARCHVERSE_LINUX_BACKGROUND_OCR_NONBLOCKING'), 'nonblocking background OCR marker missing');
must(!capture.includes('await runLinuxBackgroundOcr();'), 'background OCR still awaited by mining tick');
must(capture.includes('linuxBackgroundInFlight.size'), 'background concurrency guard missing');
must(capture.includes('takeLinuxBackgroundResult'), 'background result handoff missing');

fs.writeFileSync(capturePath, capture);
fs.writeFileSync(gatePath, gate);
console.log('Alpha22 scan/lane stall fixes enforced:', root);
