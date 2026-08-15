#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const [root] = process.argv.slice(2);
if (!root) {
  console.error('usage: enforce-native-mining-pipeline-policy.cjs <staged-app-root>');
  process.exit(2);
}

function must(cond, msg) {
  if (!cond) throw new Error(`Native Linux mining pipeline policy: ${msg}`);
}
function countOf(text, needle) { return text.split(needle).length - 1; }
function replaceOnce(text, from, to, label) {
  if (text.includes(to)) return text;
  const n = countOf(text, from);
  must(n === 1, `${label}: expected exactly one anchor, found ${n}`);
  return text.replace(from, to);
}

const serverPath = path.join(root, 'app/server/server.mjs');
must(fs.existsSync(serverPath), 'missing app/server/server.mjs');
let server = fs.readFileSync(serverPath, 'utf8');

// Resource-signature vocabulary. Alpha 20's Resource Scanner UI already knows that RS 3,000 is
// the hand-mineable gemstone class, but MiningTracker still rejected 3,000 as an unknown number.
if (!server.includes('ARCHVERSE_LINUX_RESOURCE_SIGNATURE_VOCABULARY')) {
  server = replaceOnce(server,
    'var MIN_SIGNATURE = 2e3;\nvar DEBRIS_STEP = 2e3;',
    'var MIN_SIGNATURE = 2e3;\nvar DEBRIS_STEP = 2e3;\nvar HAND_GEM_SIGNATURE = 3e3; // ARCHVERSE_LINUX_RESOURCE_SIGNATURE_VOCABULARY',
    'resource signature constants');
  server = replaceOnce(server,
    '  if (!Number.isFinite(signature) || signature < MIN_SIGNATURE || signature > maxSignature) return null;\n  const debris = isDebrisValue(signature);',
    '  if (!Number.isFinite(signature) || signature < MIN_SIGNATURE || signature > maxSignature) return null;\n  if (signature === HAND_GEM_SIGNATURE) return "resource";\n  const debris = isDebrisValue(signature);',
    'hand-gem classification');
  server = replaceOnce(server,
    '    return (this.data?.index[String(n)] ?? []).length > 0 || isDebrisValue(n);',
    '    return n === HAND_GEM_SIGNATURE || (this.data?.index[String(n)] ?? []).length > 0 || isDebrisValue(n);',
    'hand-gem legality');
}

// OCR parsing robustness. RapidOCR can preserve the thousands separator, replace it with a space,
// or split the value into adjacent tokens (for example "16" + "000"). Rejoin only same-row,
// horizontally adjacent tokens. MiningTracker's legal-signature vocabulary remains the final gate.
if (!server.includes('ARCHVERSE_LINUX_SIGNATURE_PARSE_ROBUSTNESS')) {
  const oldParser = `function parseSignature(text) {\n  if (!/\\d/.test(text)) return null;\n  const t = text.replace(/[oO]/g, "0").replace(/[lI|]/g, "1");\n  const g = /(\\d{1,2})[.,](\\d{3})(?!\\d)/.exec(t);\n  if (g) {\n    const v = Number(g[1] + g[2]);\n    return v >= 1e3 && v <= 3e4 ? v : null;\n  }\n  const runs = t.match(/(?<!\\d)\\d{4,5}(?!\\d)/g);\n  if (runs && runs.length) {\n    const v = Number(runs[runs.length - 1]);\n    return v >= 1e3 && v <= 3e4 ? v : null;\n  }\n  return null;\n}\nfunction bestSignatureLine(lines, centerX) {\n  const cands = lines.map((l) => ({ l, sig: parseSignature(l.text) })).filter((c) => c.sig != null);\n  if (!cands.length) return null;\n  cands.sort((a, b) => Math.abs(a.l.x - centerX) - Math.abs(b.l.x - centerX));\n  return cands[0];\n}`;

  const newParser = `function parseSignature(text) {\n  if (!/\\d/.test(text)) return null;\n  const t = String(text).replace(/[oO]/g, "0").replace(/[lI|]/g, "1");\n  // ARCHVERSE_LINUX_SIGNATURE_PARSE_ROBUSTNESS: OCR may preserve, space, or split the thousands separator.\n  const g = /(?:^|\\D)(\\d{1,2})\\s*(?:[.,'’:]\\s*|\\s+)(\\d{3})(?!\\d)/.exec(t);\n  if (g) {\n    const v = Number(g[1] + g[2]);\n    return v >= 1e3 && v <= 3e4 ? v : null;\n  }\n  const runs = t.match(/(?<!\\d)\\d{4,5}(?!\\d)/g);\n  if (runs && runs.length) {\n    const v = Number(runs[runs.length - 1]);\n    return v >= 1e3 && v <= 3e4 ? v : null;\n  }\n  return null;\n}\nfunction bestSignatureLine(lines, centerX) {\n  const normalized = lines.filter((l) => l && typeof l === "object" && typeof l.text === "string");\n  const cands = normalized.map((l) => ({ l, sig: parseSignature(l.text) })).filter((c) => c.sig != null);\n  for (let i = 0; i < normalized.length; i++) {\n    for (let j = i + 1; j < normalized.length; j++) {\n      const a = normalized[i], b = normalized[j];\n      const ah = Math.max(1, Number(a.h) || 1), bh = Math.max(1, Number(b.h) || 1);\n      const ay = Number(a.y) || 0, by = Number(b.y) || 0;\n      if (Math.abs((ay + ah / 2) - (by + bh / 2)) > Math.max(ah, bh) * 0.65) continue;\n      const left = (Number(a.x) || 0) <= (Number(b.x) || 0) ? a : b;\n      const right = left === a ? b : a;\n      const gap = (Number(right.x) || 0) - ((Number(left.x) || 0) + (Number(left.w) || 0));\n      if (gap < -Math.max(ah, bh) * 0.25 || gap > Math.max(ah, bh) * 2.5) continue;\n      const joined = String(left.text) + " " + String(right.text);\n      const sig = parseSignature(joined);\n      if (sig == null) continue;\n      const x0 = Math.min(Number(left.x) || 0, Number(right.x) || 0);\n      const y0 = Math.min(Number(left.y) || 0, Number(right.y) || 0);\n      const x1 = Math.max((Number(left.x) || 0) + (Number(left.w) || 0), (Number(right.x) || 0) + (Number(right.w) || 0));\n      const y1 = Math.max((Number(left.y) || 0) + (Number(left.h) || 0), (Number(right.y) || 0) + (Number(right.h) || 0));\n      cands.push({ l: { text: joined, x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, sig });\n    }\n  }\n  if (!cands.length) return null;\n  cands.sort((a, b) => Math.abs((a.l.x + a.l.w / 2) - centerX) - Math.abs((b.l.x + b.l.w / 2) - centerX));\n  return cands[0];\n}`;

  server = replaceOnce(server, oldParser, newParser, 'signature parser');
}

// Parsed signature -> tracker state must be one transaction. The previous native port parsed the
// crop in /api/screen-read, returned it to Electron, then waited for a second /api/mining/scan POST
// before lookup and notification state changed. That contradicted the authoritative-signature rule
// and created a failure gap. Commit the parsed value here; the later glyph POST is telemetry only.
if (!server.includes('ARCHVERSE_LINUX_PARSED_SIGNATURE_COMMIT')) {
  const oldMiningCrop = `      result = best ? (() => {\n        const onScreen = { ...best.l, x: best.l.x + offX, y: best.l.y + offY };\n        return {\n          kind: "mineable",\n          signature: best.sig,\n          raw: best.l.text.trim(),\n          pin: glyphSearchBox(onScreen, frameW, frameH),\n          text: { x: onScreen.x, y: onScreen.y, w: onScreen.w, h: onScreen.h }\n        };\n      })() : { kind: "none" };`;
  const newMiningCrop = `${oldMiningCrop}\n      // ARCHVERSE_LINUX_PARSED_SIGNATURE_COMMIT: parsed value drives resource state immediately.\n      if (result.kind === "mineable" && typeof result.signature === "number") {\n        result.outcome = mining.applyMineableRead(result.signature, false);\n      }`;
  server = replaceOnce(server, oldMiningCrop, newMiningCrop, 'authoritative parsed-signature commit');
}

must(server.includes('ARCHVERSE_LINUX_RESOURCE_SIGNATURE_VOCABULARY'), 'resource signature vocabulary marker missing');
must(server.includes('signature === HAND_GEM_SIGNATURE'), 'RS 3,000 hand-gem classification missing');
must(server.includes('n === HAND_GEM_SIGNATURE ||'), 'RS 3,000 is not legal for repair/classification');
must(server.includes('ARCHVERSE_LINUX_SIGNATURE_PARSE_ROBUSTNESS'), 'signature parser robustness marker missing');
must(server.includes('const joined = String(left.text) + " " + String(right.text);'), 'split-token signature reconstruction missing');
must(server.includes('ARCHVERSE_LINUX_PARSED_SIGNATURE_COMMIT'), 'parsed signature commit marker missing');
must(server.includes('result.outcome = mining.applyMineableRead(result.signature, false);'), 'screen-read does not commit parsed signature');

fs.writeFileSync(serverPath, server);
console.log('Native Linux mining pipeline policy enforced:', root);
