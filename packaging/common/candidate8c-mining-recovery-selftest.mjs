import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.argv[2];
if (!root) throw new Error('usage: candidate8c-mining-recovery-selftest.mjs <staged-app-root>');
const require = createRequire(import.meta.url);
const gate = require(path.join(root, 'app/electron/scan-mode-gate.cjs'));
const catalog = require(path.join(root, 'app/electron/mining-signature-catalog.cjs'));
const capture = await readFile(path.join(root, 'app/electron/capture.cjs'), 'utf8');
const must = (v, m) => { if (!v) throw new Error(`Candidate 8c self-test: ${m}`); };

must(gate.SIGNAL_PAIR_GEOMETRY.minDx < 0.105 && gate.SIGNAL_PAIR_GEOMETRY.maxDx > 0.105,
  'field reference radar/status separation is not admitted');
must(gate.SIGNAL_PAIR_GEOMETRY.maxDx < 0.15, 'signal-status search is still broad enough to admit Candidate 8b distant UI arcs');

function decode(row) {
  const packed = Buffer.from(row.bits, 'base64');
  const mask = new Uint8Array(row.width * row.height);
  for (let i = 0; i < mask.length; i += 1) mask[i] = (packed[i >> 3] >> (i & 7)) & 1;
  return { ...row, mask };
}
function resizeRadar(src, width, height) {
  const mask = new Uint8Array(width * height);
  for (let oy = 0; oy < height; oy += 1) {
    for (let ox = 0; ox < width; ox += 1) {
      const x0 = ox * src.width / width, x1 = (ox + 1) * src.width / width;
      const y0 = oy * src.height / height, y1 = (oy + 1) * src.height / height;
      let covered = 0, total = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy += 1) {
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx += 1) {
          const overlap = Math.max(0, Math.min(sx + 1, x1) - Math.max(sx, x0))
            * Math.max(0, Math.min(sy + 1, y1) - Math.max(sy, y0));
          total += overlap; covered += overlap * src.mask[sy * src.width + sx];
        }
      }
      if (total && covered / total >= 0.12) mask[oy * width + ox] = 1;
    }
  }
  return { width, height, mask };
}
function resizeSignal(src, width, height) {
  const mask = new Uint8Array(width * height);
  for (let oy = 0; oy < height; oy += 1) for (let ox = 0; ox < width; ox += 1) {
    const sx = Math.min(src.width - 1, Math.floor((ox + 0.5) * src.width / width));
    const sy = Math.min(src.height - 1, Math.floor((oy + 0.5) * src.height / height));
    mask[oy * width + ox] = src.mask[sy * src.width + sx];
  }
  return { width, height, mask };
}
const W = 960, H = 548;
const radarSrc = decode(gate.RADAR_REFERENCE_BITS.find((row) => row.reference === 90));
const radar = resizeRadar(radarSrc, Math.round(18 * radarSrc.width / radarSrc.height), 18);
const strongSrc = decode(gate.SIGNAL_STRENGTH_REFERENCE_BITS.find((row) => row.state === 'strong'));
const strong = resizeSignal(strongSrc, Math.round(16 * strongSrc.width / strongSrc.height), 16);
function makeFrame({ dx = 0.105, label = true } = {}) {
  const frame = Buffer.alloc(W * H * 4);
  const setpx = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4; frame[i] = b; frame[i + 1] = g; frame[i + 2] = r; frame[i + 3] = 255;
  };
  const stamp = (tpl, x, y, rgb) => {
    for (let py = 0; py < tpl.height; py += 1) for (let px = 0; px < tpl.width; px += 1) {
      if (tpl.mask[py * tpl.width + px]) setpx(x + px, y + py, ...rgb);
    }
  };
  const rx = Math.round(W * 0.47), ry = Math.round(H * 0.48);
  stamp(radar, rx, ry, [245, 230, 90]);
  const sx = Math.round(rx + W * dx), sy = Math.round(ry + H * 0.005);
  stamp(strong, sx, sy, [110, 255, 70]);
  if (label) {
    const top = Math.round(sy + strong.height * 1.2);
    for (let row = 0; row < 3; row += 1) {
      for (let px = -10; px < 25; px += 2) setpx(sx + Math.floor(strong.width / 2) + px, top + row, 95, 255, 65);
    }
  }
  return frame;
}

const good = gate.detectScanModeDualWitness(makeFrame(), W, H);
must(good.active === true, `true paired Scan HUD was rejected (${good.rejectionReason || 'unknown'})`);
must(Math.abs(good.pair.dx - 0.105) < 0.01, `paired dx drifted: ${good.pair.dx}`);
const distant = gate.detectScanModeDualWitness(makeFrame({ dx: 0.22 }), W, H);
must(distant.active === false, 'distant second icon was admitted as a Scan pair');
const noLabel = gate.detectScanModeDualWitness(makeFrame({ label: false }), W, H);
must(noLabel.active === false && /label-colour/.test(noLabel.rejectionReason || ''), 'status icon without the coloured state label armed Scan Mode');

const stable = gate.createScanModeAuthorityStabilizer();
let r = stable(good, 1000);
must(r.active === false && r.rejectionReason === 'pair-temporal-consistency', 'one paired frame armed Scan Mode');
r = stable(good, 19000);
must(r.active === true && r.authorityStable === true, 'second valid pair after an 18s OCR gap did not arm Scan Mode');
r = stable({ active: false, method: 'radar+paired-signal-status' }, 26000);
must(r.active === false, 'hard negative remained latched beyond the short safety latch');
r = stable(good, 27000);
must(r.active === false, 'evidence accumulated across a hard-negative frame');

must(catalog.classifyMiningSignature(11700).valid, 'Torite 3900x3 was lost from frozen RS catalog');
must(catalog.classifyMiningSignature(17200).valid, 'Ice 4300x4 was lost from frozen RS catalog');
must(!catalog.classifyMiningSignature(2500).valid, 'kiosk 2500 false value entered frozen RS catalog');
must(!catalog.classifyMiningSignature(7372).valid, 'ship/kiosk 7372 false value entered frozen RS catalog');

for (const marker of [
  'ARCHVERSE_LINUX_CAPTURE_COORDINATE_CANONICALIZATION',
  'ARCHVERSE_LINUX_PIPEWIRE_RECOVERY_STATE_V2',
  'ARCHVERSE_LINUX_MINING_BACKEND_INDEPENDENT_GLYPH_COORDS',
  'Gamescope PipeWire frame health recovered; promoted over',
  'normalizeFallbackImage(rawImage, disp, "spectacle-wayland")',
]) must(capture.includes(marker), `capture contract missing: ${marker}`);
must(!capture.includes('Gamescope PipeWire recovered; promoting node'), 'discovery-only false recovery log survived');
must(capture.includes('name !== "pipewire"'), 'cached fallback can still re-run broken PipeWire on every frame');

console.log('Candidate 8c self-test OK: true paired HUD geometry, coloured state witness, slow-cadence temporal authority, frozen RS catalog, PipeWire health promotion, canonical fallback coordinates');
