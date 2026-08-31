#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const root = process.argv[2];
const selftestOnly = process.argv.includes("--selftest-only");
if (!root) throw new Error("usage: enforce-alpha22-candidate8c.cjs <staged-candidate8b-root> [--selftest-only]");
const must = (v, m) => { if (!v) throw new Error(`Candidate 8c enforcer: ${m}`); };
const capturePath = path.join(root, "app/electron/capture.cjs");
const gatePath = path.join(root, "app/electron/scan-mode-gate.cjs");
const catalogPath = path.join(root, "app/electron/mining-signature-catalog.cjs");
const packagePath = path.join(root, "app/package.json");
for (const p of [capturePath, gatePath, catalogPath, packagePath]) must(fs.existsSync(p), `missing ${path.relative(root, p)}`);

const PATCH_GZ_B64 = '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';

function applyPatch() {
  const beforeCapture = fs.readFileSync(capturePath, "utf8");
  const beforeGate = fs.readFileSync(gatePath, "utf8");
  must(beforeCapture.includes("ARCHVERSE_LINUX_MINING_CURRENT_RS_VALIDATION"), "Candidate 8b RS validation base missing");
  must(beforeGate.includes("ARCHVERSE_LINUX_SCAN_MODE_DUAL_WITNESS"), "Candidate 8b dual-witness base missing");
  must(!beforeCapture.includes("ARCHVERSE_LINUX_PIPEWIRE_RECOVERY_STATE_V2"), "Candidate 8c already applied");
  const patchPath = path.join(os.tmpdir(), `archverse-candidate8c-${process.pid}.patch`);
  try {
    fs.writeFileSync(patchPath, zlib.gunzipSync(Buffer.from(PATCH_GZ_B64, "base64")));
    const r = spawnSync("patch", ["-p1", "--fuzz=0", "-i", patchPath], { cwd: root, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`zero-fuzz patch failed\n${r.stdout || ""}\n${r.stderr || ""}`);
  } finally { try { fs.unlinkSync(patchPath); } catch {} }
}

function decode(row) {
  const packed = Buffer.from(row.bits, "base64");
  const mask = new Uint8Array(row.width * row.height);
  for (let i = 0; i < mask.length; i += 1) mask[i] = (packed[i >> 3] >> (i & 7)) & 1;
  return { ...row, mask };
}
function resizeRadar(src, width, height) {
  const mask = new Uint8Array(width * height);
  for (let oy = 0; oy < height; oy += 1) for (let ox = 0; ox < width; ox += 1) {
    const x0 = ox * src.width / width, x1 = (ox + 1) * src.width / width;
    const y0 = oy * src.height / height, y1 = (oy + 1) * src.height / height;
    let covered = 0, total = 0;
    for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy += 1) for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx += 1) {
      const overlap = Math.max(0, Math.min(sx + 1, x1) - Math.max(sx, x0))
        * Math.max(0, Math.min(sy + 1, y1) - Math.max(sy, y0));
      total += overlap; covered += overlap * src.mask[sy * src.width + sx];
    }
    if (total && covered / total >= 0.12) mask[oy * width + ox] = 1;
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

function runSelfTest() {
  delete require.cache[require.resolve(gatePath)];
  delete require.cache[require.resolve(catalogPath)];
  const gate = require(gatePath);
  const catalog = require(catalogPath);
  const capture = fs.readFileSync(capturePath, "utf8");
  must(gate.SIGNAL_PAIR_GEOMETRY.minDx < 0.105 && gate.SIGNAL_PAIR_GEOMETRY.maxDx > 0.105,
    "field reference radar/status separation is not admitted");
  must(gate.SIGNAL_PAIR_GEOMETRY.maxDx < 0.15, "status search is still Candidate 8b-broad");

  const W = 960, H = 548;
  const radarSrc = decode(gate.RADAR_REFERENCE_BITS.find((row) => row.reference === 90));
  const radar = resizeRadar(radarSrc, Math.round(18 * radarSrc.width / radarSrc.height), 18);
  const strongSrc = decode(gate.SIGNAL_STRENGTH_REFERENCE_BITS.find((row) => row.state === "strong"));
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
      for (let row = 0; row < 3; row += 1) for (let px = -10; px < 25; px += 2) {
        setpx(sx + Math.floor(strong.width / 2) + px, top + row, 95, 255, 65);
      }
    }
    return frame;
  }

  const good = gate.detectScanModeDualWitness(makeFrame(), W, H);
  must(good.active === true, `true paired Scan HUD rejected: ${good.rejectionReason || "unknown"}`);
  must(Math.abs(good.pair.dx - 0.105) < 0.01, `paired dx drifted: ${good.pair.dx}`);
  const distant = gate.detectScanModeDualWitness(makeFrame({ dx: 0.22 }), W, H);
  must(distant.active === false, "distant second icon admitted as Scan pair");
  const noLabel = gate.detectScanModeDualWitness(makeFrame({ label: false }), W, H);
  must(noLabel.active === false && /label-colour/.test(noLabel.rejectionReason || ""),
    "status arcs without matching coloured state label armed Scan Mode");

  const stable = gate.createScanModeAuthorityStabilizer();
  let r = stable(good, 1000);
  must(r.active === false && r.rejectionReason === "pair-temporal-consistency", "one paired frame armed Scan Mode");
  r = stable(good, 19000);
  must(r.active === true && r.authorityStable === true, "second pair after 18s OCR gap did not arm Scan Mode");
  r = stable({ active: false, method: "radar+paired-signal-status" }, 26000);
  must(r.active === false, "hard negative remained latched beyond short safety latch");
  r = stable(good, 27000);
  must(r.active === false, "pair evidence accumulated across hard negative");

  must(catalog.classifyMiningSignature(11700).valid, "Torite 3900x3 lost from frozen RS catalog");
  must(catalog.classifyMiningSignature(17200).valid, "Ice 4300x4 lost from frozen RS catalog");
  must(!catalog.classifyMiningSignature(2500).valid, "kiosk 2500 admitted by RS catalog");
  must(!catalog.classifyMiningSignature(7372).valid, "ship/kiosk 7372 admitted by RS catalog");

  for (const marker of [
    "ARCHVERSE_LINUX_CAPTURE_COORDINATE_CANONICALIZATION",
    "ARCHVERSE_LINUX_PIPEWIRE_RECOVERY_STATE_V2",
    "ARCHVERSE_LINUX_MINING_BACKEND_INDEPENDENT_GLYPH_COORDS",
    "Gamescope PipeWire frame health recovered; promoted over",
    'normalizeFallbackImage(rawImage, disp, "spectacle-wayland")',
  ]) must(capture.includes(marker), `capture contract missing: ${marker}`);
  must(!capture.includes("Gamescope PipeWire recovered; promoting node"), "discovery-only false recovery log survived");
  must(capture.includes('name !== "pipewire"'), "cached fallback can still retry broken PipeWire every frame");
  console.log("Candidate 8c self-test OK: paired Scan HUD geometry/color, slow-cadence authority, frozen RS, frame-health PipeWire recovery, canonical fallback coordinates");
}

if (!selftestOnly) applyPatch();
runSelfTest();
