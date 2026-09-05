#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = process.argv[2];
if (!root) throw new Error("usage: apply-alpha22-candidate8h.cjs <staged-candidate8g-root>");
const must = (value, message) => { if (!value) throw new Error(`Candidate 8h apply: ${message}`); };

const files = {
  package: path.join(root, "app/package.json"),
  capture: path.join(root, "app/electron/capture.cjs"),
  catalog: path.join(root, "app/electron/mining-signature-catalog.cjs"),
  server: path.join(root, "app/server/server.mjs"),
};
const expectedSha256 = Object.freeze({
  package: "ed4aab6137bbc7a43bac92bec609201788d8bb46f4ddb0d649227cd6ae593d5d",
  capture: "5fc92f0d44df9559b80dc1835a719ab6993d6561c79bb3eeb5ec80d583881d87",
  catalog: "09dfd261b2f4b2e261a01abd2d117259970b939ac199a3658d094fd260e16ed6",
  server: "a487818807c683e561687ea0ad1f2a5ba2adcaccb3810ad3d18be081b3bd5d6f",
});
const presenceHelper = path.join(__dirname, "candidate8h-mining-vehicle-presence.cjs");
const expectedPresenceHelperSha256 = "effe4355c6e7787c83bc3c6acf21c60d61986b49916fd6acac107bdfa5453e66";
const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");
const source = {};
for (const [name, file] of Object.entries(files)) {
  must(fs.existsSync(file), `missing ${path.relative(root, file)}`);
  source[name] = fs.readFileSync(file, "utf8");
  must(sha256(source[name]) === expectedSha256[name], `${name} is not the pinned Candidate 8g source`);
}
must(fs.existsSync(presenceHelper), "vehicle-presence helper source is missing");
const presenceHelperSource = fs.readFileSync(presenceHelper, "utf8");
must(sha256(presenceHelperSource) === expectedPresenceHelperSha256, "vehicle-presence helper source hash changed");

const pkg = JSON.parse(source.package);
must(pkg.version === "0.1.44-r31.alpha22.candidate8g", `expected exact Candidate 8g base, got ${pkg.version}`);

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  must(first >= 0, `${label} anchor missing`);
  must(text.indexOf(before, first + before.length) < 0, `${label} anchor is not unique`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

function replaceThrough(text, start, end, replacement, label) {
  const first = text.indexOf(start);
  must(first >= 0, `${label} start anchor missing`);
  must(text.indexOf(start, first + start.length) < 0, `${label} start anchor is not unique`);
  const last = text.indexOf(end, first + start.length);
  must(last >= 0, `${label} end anchor missing`);
  return text.slice(0, first) + replacement + text.slice(last);
}

pkg.version = "0.1.44-r31.alpha22.candidate8h";
pkg.description = "ArchVerse Alpha22 Candidate 8h: resilient vehicle-gated Mining cadence and coordinate-safe RS OCR";
source.package = JSON.stringify(pkg, null, 2) + "\n";

source.capture = replaceOnce(
  source.capture,
  `const { classifyMiningSignature, miningSignatureLabel } = require("./mining-signature-catalog.cjs"); // ARCHVERSE_LINUX_MINING_SIGNATURE_CATALOG_V1`,
  `const { classifyMiningSignature, miningSignatureLabel } = require("./mining-signature-catalog.cjs"); // ARCHVERSE_LINUX_MINING_SIGNATURE_CATALOG_V1
const { createMiningVehiclePresenceClient } = require("./mining-vehicle-presence.cjs"); // ARCHVERSE_LINUX_MINING_VEHICLE_PRESENCE_LIVENESS`,
  "vehicle-presence helper import",
);
source.capture = replaceOnce(
  source.capture,
  `const VEHICLE_PRESENCE_CACHE_MS = 500;
const VEHICLE_PRESENCE_GRACE_MS = 2500;`,
  `const VEHICLE_PRESENCE_CACHE_MS = 500;`,
  "fail-closed presence grace constants",
);
source.capture = replaceThrough(
  source.capture,
  `  let vehiclePresenceCache = { active: false, source: "none", ship: null, controlled: [], changedAt: 0 };`,
  `  // ARCHVERSE_LINUX_ASYNC_MINING_TELEMETRY:`,
  `  // ARCHVERSE_LINUX_MINING_VEHICLE_PRESENCE_LIVENESS: an IPC timeout is not a Game.log
  // departure. Keep the last confirmed state and use bounded retry. Every successful screen-read
  // also carries the sidecar's current authority state, which immediately reconciles a real exit.
  const vehiclePresenceClient = createMiningVehiclePresenceClient({
    endpoint: \`http://localhost:\${port}/api/vehicle-presence\`,
    fetchImpl: fetch,
    logger: console,
    cacheMs: VEHICLE_PRESENCE_CACHE_MS,
  });
  const getVehiclePresence = () => vehiclePresenceClient.get();
`,
  "vehicle-presence cache semantics",
);
source.capture = replaceOnce(
  source.capture,
  `  const LINUX_BACKGROUND_RESULT_TTL_MS = 6500;`,
  `  const LINUX_BACKGROUND_RESULT_TTL_MS = 6500;
  // ARCHVERSE_LINUX_BACKGROUND_OCR_FAILURE_BACKOFF: a failed auxiliary lane must not launch
  // another multi-second RapidOCR/Tesseract fallback on every Mining tick.
  const LINUX_BACKGROUND_BACKOFF_BASE_MS = 15000;
  const LINUX_BACKGROUND_BACKOFF_MAX_MS = 120000;
  let linuxBackgroundFailureCount = 0;
  let linuxBackgroundBackoffUntil = 0;`,
  "background OCR backoff state",
);
source.capture = replaceOnce(
  source.capture,
  `        const readRegion = async (key, enabled, everyMs = POLL_MS, alreadyDue = false) => {`,
  `        const readRegion = async (key, enabled, everyMs = POLL_MS, alreadyDue = false, propagateFailure = false) => {`,
  "background OCR failure propagation parameter",
);
source.capture = replaceOnce(
  source.capture,
  `          } catch (error) {
            stage[\`ocr_\${key}_error\`] = String(error?.message || error).slice(0, 180);
            console.warn(\`[ocr] \${key} crop failed:\`, error?.message || error);
            return null;
          }`,
  `          } catch (error) {
            stage[\`ocr_\${key}_error\`] = String(error?.message || error).slice(0, 180);
            if (propagateFailure) throw error;
            console.warn(\`[ocr] \${key} crop failed:\`, error?.message || error);
            return null;
          }`,
  "background OCR failure propagation",
);
source.capture = replaceThrough(
  source.capture,
  `        runLinuxBackgroundOcr = () => {`,
  `      } else {`,
  `        runLinuxBackgroundOcr = () => {
          const a = linuxOcrRegion(cfg, "fabricator"), b = linuxOcrRegion(cfg, "claimContext");
          const sameClaimRegion = ["x", "y", "w", "h"].every((k) => Math.abs(a[k] - b[k]) < 0.00001);
          const enabled = { fabricator: !!fab, claimContext: !!claim && !(sameClaimRegion && fab), mission: !!miss, refinery: !!mining };
          // At most one auxiliary OCR process is dispatched at once. A failed lane backs off as a
          // group because every auxiliary lane shares the same worker/fallback resource budget.
          const backgroundNow = Date.now();
          if (linuxBackgroundInFlight.size || backgroundNow < linuxBackgroundBackoffUntil) return false;
          for (let step = 0; step < linuxBackgroundKeys.length; step += 1) {
            const idx = (linuxBackgroundCursor + step) % linuxBackgroundKeys.length;
            const key = linuxBackgroundKeys[idx];
            if (!enabled[key] || !linuxOcrDue(key, POLL_MS)) continue;
            linuxBackgroundCursor = (idx + 1) % linuxBackgroundKeys.length;
            linuxBackgroundInFlight.add(key);
            const launchedAt = Date.now();
            void readRegion(key, true, POLL_MS, true, true).then((value) => {
              linuxBackgroundFailureCount = 0;
              linuxBackgroundBackoffUntil = 0;
              if (value) {
                linuxBackgroundLatest.set(key, { at: Date.now(), value });
                if (key === "fabricator" && sameClaimRegion && claim)
                  linuxBackgroundLatest.set("claimContext", { at: Date.now(), value });
              }
            }).catch((error) => {
              linuxBackgroundFailureCount = Math.min(8, linuxBackgroundFailureCount + 1);
              const delay = Math.min(LINUX_BACKGROUND_BACKOFF_MAX_MS,
                LINUX_BACKGROUND_BACKOFF_BASE_MS * (2 ** Math.min(3, linuxBackgroundFailureCount - 1)));
              linuxBackgroundBackoffUntil = Date.now() + delay;
              console.warn(\`[ocr-bg] \${key} lane failed; auxiliary OCR paused for \${delay}ms:\`, error?.message || error);
            }).finally(() => {
              linuxBackgroundInFlight.delete(key);
              const ms = Date.now() - launchedAt;
              if (ms >= 1500) console.log(\`[ocr-bg] \${key} lane settled in \${ms}ms\`);
            });
            return true;
          }
          return false;
        };
`,
  "background OCR failure backoff",
);
source.capture = replaceOnce(
  source.capture,
  `      const vehiclePresence = mining && process.platform === "linux"`,
  `      let vehiclePresence = mining && process.platform === "linux"`,
  "mutable authoritative vehicle state",
);
source.capture = replaceOnce(
  source.capture,
  `          const rr3 = await r3.json();
          const rr3Signature = typeof rr3.signature === "number" ? rr3.signature : null;`,
  `          const rr3 = await r3.json();
          // The inline response is fresher than the scheduling GET and comes from the same
          // sidecar authority that accepts or refuses the read. Reconcile a real vehicle exit now.
          if (process.platform === "linux" && rr3.vehiclePresence) {
            vehiclePresence = vehiclePresenceClient.accept(rr3.vehiclePresence, "screen-read");
            stage.vehicleGate = vehiclePresence.active === true;
            stage.vehicleGateSource = vehiclePresence.source;
          }
          const rr3Signature = typeof rr3.signature === "number" ? rr3.signature : null;`,
  "inline vehicle-state reconciliation",
);
source.capture = replaceOnce(
  source.capture,
  `        if (confirmed && !integratedMiningCommit) {
          queueMiningScanPost({
            signature: read.signature, confirmed: true,
            raw: read.raw, text: read.text, pollMs: rate, scanHud: read.scanHud === true,
            scanMode: { confidence: 100, method: "gamelog-vehicle+rs", source: vehiclePresence.source || "non-linux", ship: vehiclePresence.ship || null, controlled: vehiclePresence.controlled || [] },
            frame: { w: shot.getSize().width, h: shot.getSize().height },
          });
        } else if (Date.now() - lastMiningAuthorityRejectAt >= 5000) {`,
  `        if (confirmed) {
          if (!integratedMiningCommit) {
            queueMiningScanPost({
              signature: read.signature, confirmed: true,
              raw: read.raw, text: read.text, pollMs: rate, scanHud: read.scanHud === true,
              scanMode: { confidence: 100, method: "gamelog-vehicle+rs", source: vehiclePresence.source || "non-linux", ship: vehiclePresence.ship || null, controlled: vehiclePresence.controlled || [] },
              frame: { w: shot.getSize().width, h: shot.getSize().height },
            });
          }
        } else if (Date.now() - lastMiningAuthorityRejectAt >= 5000) {`,
  "integrated commit authority diagnostic",
);

source.server = replaceOnce(
  source.server,
  `function parseSignature(text) {
  if (!/\\d/.test(text)) return null;`,
  `// ARCHVERSE_LINUX_MINING_COORDINATE_REJECTION: navigation coordinates can contain a legal
// dot-grouped RS value (for example 48.000). Reject coordinate-shaped groups before admission,
// while preserving a standalone dot-grouped signature and ordinary strength text such as 90°.
function isNavigationCoordinateText(text) {
  const value = String(text || "");
  const decimals = value.match(/(?<!\\d)\\d{1,3}\\.\\d{2,3}(?!\\d)/g) || [];
  return decimals.length >= 3 || (decimals.length >= 2 && /[°º]/.test(value));
}
function parseSignature(text) {
  if (!/\\d/.test(text) || isNavigationCoordinateText(text)) return null;`,
  "navigation coordinate rejection",
);
source.server = replaceOnce(
  source.server,
  `function bestSignatureLine(lines, centerX) {
  const normalized = lines.filter((l) => !!l && typeof l === "object" && typeof l.text === "string");
  const cands = normalized.map((l) => ({ l, sig: parseSignature(l.text) })).filter((c) => c.sig != null);`,
  `function bestSignatureLine(lines, centerX) {
  const normalized = lines.filter((l) => !!l && typeof l === "object" && typeof l.text === "string");
  if (isNavigationCoordinateText(normalized.map((l) => l.text).join(" "))) return null;
  const cands = normalized.map((l) => ({ l, sig: parseSignature(l.text) })).filter((c) => c.sig != null);`,
  "multi-line navigation coordinate rejection",
);
source.server = replaceOnce(
  source.server,
  `    let miningCommit = null;
    if (body.miningCrop === true && body.commitMining === true`,
  `    const miningPresence = body.miningCrop === true ? vehiclePresenceInfo() : null;
    let miningCommit = null;
    if (body.miningCrop === true && body.commitMining === true`,
  "screen-read vehicle authority response",
);
source.server = replaceOnce(
  source.server,
  `      const presence = vehiclePresenceInfo();
      const confirmed = presence.active === true;`,
  `      const presence = miningPresence;
      const confirmed = presence.active === true;`,
  "single vehicle authority snapshot",
);
source.server = replaceOnce(
  source.server,
  `    res.end(JSON.stringify({ ...result, scanHud, miningCommit }));`,
  `    res.end(JSON.stringify({ ...result, scanHud, miningCommit, vehiclePresence: miningPresence }));`,
  "vehicle authority response payload",
);

for (const [name, file] of Object.entries(files)) fs.writeFileSync(file, source[name]);
fs.writeFileSync(path.join(root, "app/electron/mining-vehicle-presence.cjs"), presenceHelperSource);

console.log("Candidate 8h applied: resilient Game.log gate liveness, auxiliary OCR backoff, and coordinate-safe RS admission");
