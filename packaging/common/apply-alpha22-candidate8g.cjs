#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = process.argv[2];
if (!root) throw new Error("usage: apply-alpha22-candidate8g.cjs <staged-candidate8f-root>");
const must = (value, message) => { if (!value) throw new Error(`Candidate 8g apply: ${message}`); };

const files = {
  package: path.join(root, "app/package.json"),
  capture: path.join(root, "app/electron/capture.cjs"),
  catalog: path.join(root, "app/electron/mining-signature-catalog.cjs"),
  server: path.join(root, "app/server/server.mjs"),
};
const expectedSha256 = Object.freeze({
  package: "2f2d2bb4cf2ffdb4d95db034081900d63cdeca0b99c2b7a15093a982ebf1edf4",
  capture: "5f373dd32ec309ccc002aed73d94ada06f9bcb6824ca4c301fde5f130d7dd80a",
  catalog: "7529193e6b7e9a288861aa3ef5434af91a2b59915f8a2808ff56dd74911a0086",
  server: "ad7047943a631eb4dd6efaac1946aa5136932646db2028c0b064b05a890fda58",
});
const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");
const source = {};
for (const [name, file] of Object.entries(files)) {
  must(fs.existsSync(file), `missing ${path.relative(root, file)}`);
  source[name] = fs.readFileSync(file, "utf8");
  must(sha256(source[name]) === expectedSha256[name], `${name} is not the pinned Candidate 8f source`);
}

const pkg = JSON.parse(source.package);
must(pkg.version === "0.1.44-r31.alpha22.candidate8f", `expected exact Candidate 8f base, got ${pkg.version}`);

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

pkg.version = "0.1.44-r31.alpha22.candidate8g";
source.package = JSON.stringify(pkg, null, 2) + "\n";

source.catalog = replaceOnce(
  source.catalog,
  `// ARCHVERSE_LINUX_MINING_SIGNATURE_CATALOG_V1
// Current 4.7 RS base values supplied from the field. Ship-mineable clusters are capped at n=10;
// FPS mineables use n*3000 through n=30; ground-vehicle deposits use n*4000 through n=30.`,
  `// ARCHVERSE_LINUX_MINING_SIGNATURE_CATALOG_V1
// ARCHVERSE_LINUX_MINING_RS_CATALOG_V2: one exact vocabulary is used by OCR admission and Mining.
// Current 4.7 RS base values supplied from the field. Ship-mineable clusters are capped at n=10;
// FPS mineables use n*3000 through n=30; ground-vehicle deposits use n*4000 through n=30.
// Debris and harvestables retain the original 2,000-step vocabulary through 12 panels (24,000).`,
  "catalog contract",
);
source.catalog = replaceOnce(
  source.catalog,
  `const GROUND_VEHICLE_BASE = 4000;
const GROUND_VEHICLE_MAX_N = 30;
const SHIP_MINEABLE_MAX_N = 10;`,
  `const GROUND_VEHICLE_BASE = 4000;
const GROUND_VEHICLE_MAX_N = 30;
const DEBRIS_BASE = 2000;
const DEBRIS_MAX_N = 12;
const SHIP_MINEABLE_MAX_N = 10;`,
  "debris constants",
);
source.catalog = replaceOnce(
  source.catalog,
  `for (let n = 1; n <= GROUND_VEHICLE_MAX_N; n += 1) {
  add(GROUND_VEHICLE_BASE * n, { kind: "ground", resource: "Ground Vehicle Deposit", base: GROUND_VEHICLE_BASE, n });
}
for (const [total, rows] of signatureIndex) signatureIndex.set(total, Object.freeze(rows.slice()));`,
  `for (let n = 1; n <= GROUND_VEHICLE_MAX_N; n += 1) {
  add(GROUND_VEHICLE_BASE * n, { kind: "ground", resource: "Ground Vehicle Deposit", base: GROUND_VEHICLE_BASE, n });
}
for (let n = 1; n <= DEBRIS_MAX_N; n += 1) {
  add(DEBRIS_BASE * n, { kind: "debris", resource: "Debris / Harvestable", base: DEBRIS_BASE, n });
}
for (const [total, rows] of signatureIndex) signatureIndex.set(total, Object.freeze(rows.slice()));`,
  "debris catalog rows",
);
source.catalog = replaceOnce(
  source.catalog,
  `  GROUND_VEHICLE_BASE,
  GROUND_VEHICLE_MAX_N,
  MIN_VALID_SIGNATURE,`,
  `  GROUND_VEHICLE_BASE,
  GROUND_VEHICLE_MAX_N,
  DEBRIS_BASE,
  DEBRIS_MAX_N,
  MIN_VALID_SIGNATURE,`,
  "debris exports",
);

source.capture = replaceOnce(
  source.capture,
  `            body: JSON.stringify({ lines, w: region.width, h: region.height, miningCrop: true, ocrRegion: "resourceSignature", offsetX: region.x, offsetY: region.y, frameW: cap.width, frameH: cap.height }),`,
  `            // ARCHVERSE_LINUX_MINING_INLINE_COMMIT: the sidecar already has authoritative
            // Game.log vehicle presence, so commit the accepted read in this successful request.
            body: JSON.stringify({ lines, w: region.width, h: region.height, miningCrop: true,
              commitMining: process.platform === "linux", pollMs: rate,
              ocrRegion: "resourceSignature", offsetX: region.x, offsetY: region.y,
              frameW: cap.width, frameH: cap.height }),`,
  "inline commit request",
);
source.capture = replaceOnce(
  source.capture,
  `              console.log(\`[mining-ocr] signature \${rr3.signature} via \${cap.method}; rs="\${miningSignatureLabel(rr3SignatureClass)}" crop=\${stage.region} scale=\${MINING_OCR_SCALE} ocr=\${stage.rapidOcr}ms text="\${miningOcrSample}"\`);`,
  `              const commitState = rr3.miningCommit?.handled === true
                ? \`integrated:\${rr3.miningCommit.used === true ? "used" : "refused"}\`
                : "deferred";
              console.log(\`[mining-ocr] signature \${rr3.signature} via \${cap.method}; rs="\${miningSignatureLabel(rr3SignatureClass)}" crop=\${stage.region} scale=\${MINING_OCR_SCALE} ocr=\${stage.rapidOcr}ms commit=\${commitState} text="\${miningOcrSample}"\`);`,
  "integrated commit diagnostics",
);
source.capture = replaceOnce(
  source.capture,
  `            read = { ...read, kind: "mineable", signature: rr3.signature, raw: rr3.raw,
              pin: rr3.pin, text: rr3.text };`,
  `            read = { ...read, kind: "mineable", signature: rr3.signature, raw: rr3.raw,
              pin: rr3.pin, text: rr3.text, miningCommit: rr3.miningCommit ?? null };`,
  "inline commit result handoff",
);
source.capture = replaceOnce(
  source.capture,
  `        if (confirmed) {
          queueMiningScanPost({`,
  `        const integratedMiningCommit = process.platform === "linux" && read.miningCommit?.handled === true;
        if (confirmed && !integratedMiningCommit) {
          queueMiningScanPost({`,
  "legacy mining POST fallback",
);

source.server = replaceOnce(
  source.server,
  `const { classifyMiningSignature, miningSignatureLabel } = require("../electron/mining-signature-catalog.cjs"); // ARCHVERSE_LINUX_MINING_SIGNATURE_CATALOG_V1`,
  `const { classifyMiningSignature, miningSignatureLabel, MAX_VALID_SIGNATURE } = require("../electron/mining-signature-catalog.cjs"); // ARCHVERSE_LINUX_MINING_SIGNATURE_CATALOG_V1`,
  "catalog maximum import",
);
source.server = replaceOnce(
  source.server,
  `  const grouped = /(?:^|\\D)(\\d{1,2})\\s*(?:[.,'’:]\\s*|\\s+)(\\d{3})(?!\\d)/.exec(t);
  if (grouped) {
    const v = Number(grouped[1] + grouped[2]);
    return v >= 1e3 && v <= 3e4 ? v : null;
  }
  const runs = t.match(/(?<!\\d)\\d{4,5}(?!\\d)/g);
  if (runs && runs.length) {
    const v = Number(runs[runs.length - 1]);
    return v >= 1e3 && v <= 3e4 ? v : null;
  }`,
  `  const grouped = /(?:^|\\D)(\\d{1,3})\\s*(?:[.,'’:]\\s*|\\s+)(\\d{3})(?!\\d)/.exec(t);
  if (grouped) {
    const v = Number(grouped[1] + grouped[2]);
    return v >= 2e3 && v <= MAX_VALID_SIGNATURE ? v : null;
  }
  const runs = t.match(/(?<!\\d)\\d{4,6}(?!\\d)/g);
  if (runs && runs.length) {
    const v = Number(runs[runs.length - 1]);
    return v >= 2e3 && v <= MAX_VALID_SIGNATURE ? v : null;
  }`,
  "current catalog OCR range",
);
source.server = replaceThrough(
  source.server,
  `  /** A scanned signature number -> a verdict (see classifySignature) plus the matching rock(s).`,
  `  applyMineableRead(signature, confirmed = false) {`,
  `  /** A scanned signature number -> a verdict plus every matching current-catalog possibility.
   *  Exact current-RS membership is authoritative; no tolerance or post-admission repair is used.
   *
   *  \`confirmed\` = Linux capture had authoritative Game.log vehicle presence while this exact
   *  current-RS signature was visible. Radar/image matching is not an authority input. */
`,
  "tracker authority documentation",
);
source.server = replaceThrough(
  source.server,
  `    const repaired = confirmed ? repairConfusableDigits(signature, (n) => this.isLegalSignature(n)) : null;`,
  `    if (this.scan && this.scan.signature === signature) {`,
  `    // ARCHVERSE_LINUX_MINING_RS_CATALOG_V2: do not validate against the older 25,800
    // dataset ceiling after this exact current-catalog read has already passed admission.
    // Preserve every catalog collision so the overlay does not guess one resource.
    const known = this.data.index[String(signature)] ?? [];
    const matches = currentRs.matches.filter((m) => m.kind !== "debris").map((m) => {
      const name = m.kind === "fps" ? "Hand-mined Gem" : m.resource === "Aluminium" ? "Aluminum" : m.resource;
      return known.find((row) => row.name === name && row.count === m.n) ?? {
        name, count: m.n, ...(m.kind === "fps" ? { rarity: "Gem" } : {})
      };
    });
    const debris = currentRs.matches.some((m) => m.kind === "debris");
    const verdict = matches.length ? (debris ? "ore-or-debris" : "ore") : debris ? "debris" : "unknown";
    const out = (o) => o;
`,
  "tracker current catalog authority",
);
source.server = replaceOnce(
  source.server,
  `var miningClients = /* @__PURE__ */ new Set();`,
  `var miningClients = /* @__PURE__ */ new Set();
var inlineMiningLastPublishKey = "";
var inlineMiningLastPublishAt = 0;`,
  "inline Mining publication throttle",
);
source.server = replaceOnce(
  source.server,
  `    if (rd.kind === "refinery") mining.applyRefineryRead(result);
    else if (rd.kind === "fabricator" && rd.name) rd.items = tracker.itemUuidsForName(rd.name);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ...result, scanHud }));`,
  `    if (rd.kind === "refinery") mining.applyRefineryRead(result);
    else if (rd.kind === "fabricator" && rd.name) rd.items = tracker.itemUuidsForName(rd.name);
    // ARCHVERSE_LINUX_MINING_INLINE_COMMIT_SERVER: avoid a redundant second localhost POST.
    // This route already has the OCR result, and the sidecar owns authoritative Game.log presence.
    let miningCommit = null;
    if (body.miningCrop === true && body.commitMining === true
        && rd.kind === "mineable" && Number.isFinite(Number(rd.signature))) {
      const signature = Number(rd.signature);
      const presence = vehiclePresenceInfo();
      const confirmed = presence.active === true;
      const outcome = mining.applyMineableRead(signature, confirmed);
      const currentRs = classifyMiningSignature(signature);
      miningCommit = { handled: true, confirmed, source: presence.source, ...outcome };
      const publishAt = Date.now();
      const publishKey = \`\${signature}:\${confirmed ? 1 : 0}\`;
      if (outcome.announced === true || publishKey !== inlineMiningLastPublishKey
          || publishAt - inlineMiningLastPublishAt >= 5000) {
        inlineMiningLastPublishKey = publishKey;
        inlineMiningLastPublishAt = publishAt;
        console.log(
          \`[mining] signature \${signature} — vehicle+RS \${confirmed ? "CONFIRMED" : "not confirmed"}\` +
          \` — integrated screen-read — polling \${body.pollMs ?? "?"}ms\` +
          \`\${currentRs.valid ? \` — RS \${miningSignatureLabel(currentRs)}\` : ""}\` +
          \` — \${outcome.why}\`
        );
        const t = rd.text;
        const frameW = Number(body.frameW), frameH = Number(body.frameH);
        const frac = t && frameW && frameH
          ? { x: (t.x ?? 0) / frameW, y: (t.y ?? 0) / frameH, w: (t.w ?? 0) / frameW, h: (t.h ?? 0) / frameH }
          : null;
        miningSend({
          kind: "read", signature, raw: typeof rd.raw === "string" ? rd.raw : null,
          box: frac, confirmed, repairedFrom: outcome.repairedFrom ?? null,
          verdict: outcome.verdict, announced: outcome.announced, used: outcome.used,
          why: outcome.why, at: publishAt
        });
      }
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ...result, scanHud, miningCommit }));`,
  "inline Mining commit",
);
source.server = replaceOnce(
  source.server,
  "radar+RS",
  "vehicle+RS",
  "legacy mining log authority",
);

for (const [name, file] of Object.entries(files)) fs.writeFileSync(file, source[name]);

console.log("Candidate 8g applied: restored 2,000-step RS values, removed stale parser/tracker ceilings, and integrated the Linux Mining commit");
