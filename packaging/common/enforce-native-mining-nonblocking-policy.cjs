#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const [root] = process.argv.slice(2);
if (!root) {
  console.error('usage: enforce-native-mining-nonblocking-policy.cjs <staged-app-root>');
  process.exit(2);
}

function must(cond, msg) {
  if (!cond) throw new Error(`Native Linux mining nonblocking policy: ${msg}`);
}
function countOf(text, needle) { return text.split(needle).length - 1; }
function replaceOnce(text, from, to, label) {
  if (text.includes(to)) return text;
  const n = countOf(text, from);
  must(n === 1, `${label}: expected exactly one anchor, found ${n}`);
  return text.replace(from, to);
}

const capturePath = path.join(root, 'app/electron/capture.cjs');
must(fs.existsSync(capturePath), 'missing app/electron/capture.cjs');
let capture = fs.readFileSync(capturePath, 'utf8');

// Alpha21 r5 used an interim Linux-only guard around the inherited PowerShell/full-frame OCR pass.
// Once ARCHVERSE_LINUX_OCR_CONTRACT_V1 is present, that entire Linux generic path has been replaced
// by independent RapidOCR/Tesseract crops, so do not re-create the obsolete guard. Keeping this
// compatibility block makes the policy safely idempotent against older staged payloads too.
const hasFullLinuxOcrContract = capture.includes('ARCHVERSE_LINUX_OCR_CONTRACT_V1');
if (!hasFullLinuxOcrContract) {
  const scopedGeneric = '      const needGeneric = process.platform === "linux" ? (!mining && (fab || miss || claim)) : (fab || miss || claim);';
  const scopedSkip = '      if (process.platform === "linux" && mining && !locked && (fab || miss || claim)) stage.skippedLegacyWindowsOcrForMining = true;';
  if (capture.includes('const needGeneric = process.platform !== "linux" && (fab || miss || claim);')) {
    capture = capture.replace('      const needGeneric = process.platform !== "linux" && (fab || miss || claim);', scopedGeneric);
    capture = capture.replace(
      '      if (process.platform === "linux" && !locked && (fab || miss || claim)) stage.skippedLegacyWindowsOcr = true;',
      scopedSkip
    );
  } else if (!capture.includes('ARCHVERSE_LINUX_NO_WINDOWS_OCR_IN_MINING_PATH')) {
    capture = replaceOnce(capture,
      '      const needGeneric = fab || miss || claim;',
      '      // ARCHVERSE_LINUX_NO_WINDOWS_OCR_IN_MINING_PATH: while Resource Scanner is armed,\n      // do not let the legacy PowerShell full-frame pass consume an 8s timeout before mining OCR.\n' + scopedGeneric.trimStart() + '\n' + scopedSkip.trimStart(),
      'legacy Windows OCR mining gate');
  }
}

// /api/mining/scan is secondary telemetry only. /api/screen-read has already parsed and committed
// the legal signature before this point. Glyph confirmation, outline geometry and diagnostics are
// useful, but a slow/unavailable sidecar response must not hold `busy` for another 8 seconds and
// delay the next resource frame. Fire it asynchronously with a short local timeout.
if (!capture.includes('ARCHVERSE_LINUX_ASYNC_MINING_TELEMETRY')) {
  capture = replaceOnce(capture,
    '  const FETCH_TIMEOUT_MS = 8000;  // any single request must give up so it can\'t latch the loop',
    '  const FETCH_TIMEOUT_MS = 8000;  // non-mining auxiliary requests retain the upstream timeout\n  const MINING_TELEMETRY_TIMEOUT_MS = 1500; // ARCHVERSE_LINUX_ASYNC_MINING_TELEMETRY: secondary local POST must never stall capture',
    'mining telemetry timeout constant');

  capture = replaceOnce(capture,
    '          await fetch(`http://localhost:${port}/api/mining/scan`, {',
    '          // ARCHVERSE_LINUX_ASYNC_MINING_TELEMETRY: the authoritative signature was already\n          // committed by /api/screen-read. Confirmation/outline telemetry is best-effort.\n          void fetch(`http://localhost:${port}/api/mining/scan`, {',
    'async mining telemetry fetch');

  capture = replaceOnce(capture,
    '            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),\n          });\n        } catch (e) { console.warn("[mining] scan post failed:", e && e.message); }',
    '            signal: AbortSignal.timeout(MINING_TELEMETRY_TIMEOUT_MS),\n          }).catch((e) => console.warn("[mining] scan telemetry post failed:", e && e.message));\n        } catch (e) { console.warn("[mining] scan telemetry scheduling failed:", e && e.message); }',
    'nonblocking mining telemetry completion');
}

capture = capture.replace(
  '      // A mining signature: the sidecar deliberately does NOT act on it until we\'ve checked the\n      // frame for the scan glyph beside the number — it has the OCR but not the pixels.',
  '      // A mining signature is already authoritative after /api/screen-read. The scan glyph below\n      // is secondary confirmation/outline telemetry only and must never gate resource state.'
);

if (capture.includes('[fab-capture] mining RapidOCR re-read failed, using Windows OCR:')) {
  capture = capture.replace(
    '[fab-capture] mining RapidOCR re-read failed, using Windows OCR:',
    '[fab-capture] mining RapidOCR/sidecar read failed; retrying next tick:'
  );
}

if (hasFullLinuxOcrContract) {
  must(capture.includes('ARCHVERSE_LINUX_PER_WIDGET_OCR_REGIONS'), 'full Linux OCR contract exists but per-widget crops are missing');
  must(!capture.includes('ARCHVERSE_LINUX_NO_WINDOWS_OCR_IN_MINING_PATH'), 'obsolete r5 Windows-OCR mining guard survived the crop-only contract');
} else {
  must(capture.includes('ARCHVERSE_LINUX_NO_WINDOWS_OCR_IN_MINING_PATH'), 'legacy Windows OCR mining-path marker missing');
}
must(capture.includes('ARCHVERSE_LINUX_ASYNC_MINING_TELEMETRY'), 'async telemetry marker missing');
must(capture.includes('MINING_TELEMETRY_TIMEOUT_MS = 1500'), 'short mining telemetry timeout missing');
must(capture.includes('void fetch(`http://localhost:${port}/api/mining/scan`'), 'secondary mining telemetry is still awaited');
must(capture.includes('.catch((e) => console.warn("[mining] scan telemetry post failed:"'), 'async mining telemetry rejection is not handled');
must(!capture.includes('await fetch(`http://localhost:${port}/api/mining/scan`'), 'blocking mining telemetry POST remains');
must(!capture.includes('[fab-capture] mining RapidOCR re-read failed, using Windows OCR:'), 'misleading Windows OCR fallback message remains');

fs.writeFileSync(capturePath, capture);
console.log('Native Linux mining nonblocking policy enforced:', capturePath);
