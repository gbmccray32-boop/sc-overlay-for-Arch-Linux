'use strict';

// ARCHVERSE_LINUX_OCR_CONTRACT_V1
// Native Linux OCR runtime. Every OCR consumer receives only its own normalized ROI from the
// already-bound Star Citizen frame. RapidOCR is primary; Tesseract is invoked only if RapidOCR
// itself throws/fails. Empty RapidOCR results do NOT trigger a second OCR engine.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const DEFAULT_LINUX_OCR_REGIONS = Object.freeze({
  resourceSignature: { x: 0.33, y: 0.26, w: 0.34, h: 0.225 },
  fabricator:        { x: 0.50, y: 0.00, w: 0.50, h: 0.72 },
  mission:           { x: 0.04, y: 0.06, w: 0.46, h: 0.50 },
  claimContext:      { x: 0.50, y: 0.00, w: 0.50, h: 0.72 },
  refinery:          { x: 0.08, y: 0.08, w: 0.84, h: 0.78 },
});
const LINUX_OCR_REGION_KEYS = Object.freeze(Object.keys(DEFAULT_LINUX_OCR_REGIONS));

function validNormalizedRegion(r) {
  return !!r && [r.x, r.y, r.w, r.h].every(Number.isFinite)
    && r.w > 0.02 && r.h > 0.01 && r.x >= 0 && r.y >= 0
    && r.x + r.w <= 1.001 && r.y + r.h <= 1.001;
}

function regionFor(cfg, key) {
  if (!LINUX_OCR_REGION_KEYS.includes(key)) throw new Error(`unknown Linux OCR region: ${key}`);
  let saved = cfg?.linuxOcrRegions?.[key];
  // One-way compatibility: only the old mining scanRegion may seed resourceSignature.
  if (key === 'resourceSignature' && !validNormalizedRegion(saved) && validNormalizedRegion(cfg?.scanRegion)) {
    saved = cfg.scanRegion;
  }
  return validNormalizedRegion(saved) ? saved : DEFAULT_LINUX_OCR_REGIONS[key];
}

function regionPixels(cfg, key, frameW, frameH) {
  const f = regionFor(cfg, key);
  const x = Math.max(0, Math.min(frameW - 1, Math.round(f.x * frameW)));
  const y = Math.max(0, Math.min(frameH - 1, Math.round(f.y * frameH)));
  const width = Math.max(8, Math.min(frameW - x, Math.round(f.w * frameW)));
  const height = Math.max(8, Math.min(frameH - y, Math.round(f.h * frameH)));
  return { x, y, width, height };
}

function normalizedRegions(cfg) {
  return Object.fromEntries(LINUX_OCR_REGION_KEYS.map((key) => [key, { ...regionFor(cfg, key) }]));
}

function parseTesseractTsv(tsv) {
  const rows = String(tsv || '').split(/\r?\n/);
  if (rows.length < 2) return [];
  const groups = new Map();
  for (const row of rows.slice(1)) {
    if (!row.trim()) continue;
    const c = row.split('\t');
    if (c.length < 12 || Number(c[0]) !== 5) continue;
    const conf = Number(c[10]);
    const text = c.slice(11).join('\t').trim();
    if (!text || !Number.isFinite(conf) || conf < 0) continue;
    const left = Number(c[6]) || 0;
    const top = Number(c[7]) || 0;
    const width = Number(c[8]) || 0;
    const height = Number(c[9]) || 0;
    const id = `${c[1]}:${c[2]}:${c[3]}:${c[4]}`;
    const g = groups.get(id) || { words: [], x: left, y: top, right: left + width, bottom: top + height, conf: 0, n: 0 };
    g.words.push(text);
    g.x = Math.min(g.x, left); g.y = Math.min(g.y, top);
    g.right = Math.max(g.right, left + width); g.bottom = Math.max(g.bottom, top + height);
    g.conf += conf; g.n += 1;
    groups.set(id, g);
  }
  return [...groups.values()].map((g) => ({
    text: g.words.join(' '), x: g.x, y: g.y,
    w: Math.max(1, g.right - g.x), h: Math.max(1, g.bottom - g.y),
    confidence: g.n ? g.conf / g.n / 100 : 0,
  }));
}

function tesseractLines(imagePath, { numeric = false } = {}) {
  return new Promise((resolve, reject) => {
    const args = [imagePath, 'stdout', '-l', 'eng', '--psm', '11'];
    if (numeric) args.push('-c', 'tessedit_char_whitelist=0123456789,. ');
    args.push('tsv');
    execFile('tesseract', args, { timeout: 3500, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`Tesseract failed: ${err.message}${stderr ? ` — ${String(stderr).trim().slice(0, 180)}` : ''}`));
        return;
      }
      resolve(parseTesseractTsv(stdout));
    });
  });
}

function createLinuxOcrBackend({ ocrRapidLines, reportRapidOcrFailure }) {
  if (typeof ocrRapidLines !== 'function') throw new TypeError('ocrRapidLines is required');
  async function ocrLines(imagePath, { key = 'context', numeric = false } = {}) {
    try {
      return { engine: 'rapidocr', lines: await ocrRapidLines(imagePath) };
    } catch (error) {
      reportRapidOcrFailure?.(error);
      console.warn(`[ocr] RapidOCR failed for ${key}; trying Tesseract fallback:`, error?.message || error);
      return { engine: 'tesseract', lines: await tesseractLines(imagePath, { numeric }) };
    }
  }

  async function readCrop({ shot, frameW, frameH, cfg, key, scale = 1 }) {
    const region = regionPixels(cfg, key, frameW, frameH);
    const crop = shot.crop(region);
    const feed = scale === 1 ? crop : crop.resize({
      width: region.width * scale,
      height: region.height * scale,
      quality: 'best',
    });
    const imagePath = path.join(os.tmpdir(), `sc-linux-ocr-${key}.png`);
    fs.writeFileSync(imagePath, feed.toPNG());
    const result = await ocrLines(imagePath, { key, numeric: key === 'resourceSignature' });
    const lines = scale === 1 ? result.lines : result.lines.map((l) => ({
      ...l, x: l.x / scale, y: l.y / scale, w: l.w / scale, h: l.h / scale,
    }));
    return { ...result, lines, crop, region };
  }

  return { ocrLines, readCrop };
}

module.exports = {
  DEFAULT_LINUX_OCR_REGIONS,
  LINUX_OCR_REGION_KEYS,
  validNormalizedRegion,
  regionFor,
  regionPixels,
  normalizedRegions,
  parseTesseractTsv,
  tesseractLines,
  createLinuxOcrBackend,
};
