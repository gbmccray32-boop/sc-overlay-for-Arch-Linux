#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = process.argv[2];
if (!root) throw new Error("usage: apply-alpha22-candidate8i.cjs <staged-candidate8h-root>");
const must = (value, message) => { if (!value) throw new Error(`Candidate 8i apply: ${message}`); };
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const files = {
  package: path.join(root, "app/package.json"),
  capture: path.join(root, "app/electron/capture.cjs"),
  pipewire: path.join(root, "app/electron/native-linux-gamescope-pipewire.cjs"),
  ocr: path.join(root, "app/electron/native-linux-ocr.cjs"),
  rapidClient: path.join(root, "app/electron/rapidocr-client.cjs"),
  presence: path.join(root, "app/electron/mining-vehicle-presence.cjs"),
  server: path.join(root, "app/server/server.mjs"),
};
const expectedSha256 = Object.freeze({
  package: "81a89322e89bbe200a5dc0f7783997d68ff4b73f834aee87023662abaa0576b0",
  capture: "e39393c0beb5b149b1fb9a7817a7d2debe35655b0f22323a37fe0a8a2f8e6014",
  pipewire: "78d53614e05e7909ece4c46eb94ace524251918f5e5f9d1e3e78c5b5e4d81cd4",
  ocr: "5e7203692dc5bef9e2a67d952a601cfe478d50d0083439ef7540a9c94dbb00ab",
  rapidClient: "e15f0be3b23a7a984b14b0849c0ca7094db2ddae079dca2b802f34a212f79a9f",
  presence: "effe4355c6e7787c83bc3c6acf21c60d61986b49916fd6acac107bdfa5453e66",
  server: "5a22b62912f6551ae419c288494020842c5efad5509166bed7dda70a8722b401",
});

const source = {};
for (const [name, file] of Object.entries(files)) {
  must(fs.existsSync(file), `missing ${path.relative(root, file)}`);
  source[name] = fs.readFileSync(file, "utf8");
  must(sha256(source[name]) === expectedSha256[name], `${name} is not the pinned Candidate 8h source`);
}

const helperSources = {
  persistent: {
    source: path.join(__dirname, "candidate8i-persistent-pipewire.cjs"),
    target: path.join(root, "app/electron/persistent-gamescope-pipewire.cjs"),
    sha: "831fdf3584cfa0cd0df15076ab0d6a5c5e010c842b12f08bf3c87ec82333b07b",
  },
  rapidClient: {
    source: path.join(__dirname, "candidate8i-rapidocr-client.cjs"),
    target: files.rapidClient,
    sha: "ef267ff3763271d7825438701fec71215c30159369663a6bc12088dfe26923b0",
  },
  presence: {
    source: path.join(__dirname, "candidate8i-mining-vehicle-presence.cjs"),
    target: files.presence,
    sha: "3400d706a7c8b8d8d783c2cdc39051e4958def1a0aa95da6ed98bfca36a64cf8",
  },
};
for (const [name, helper] of Object.entries(helperSources)) {
  must(fs.existsSync(helper.source), `missing ${path.basename(helper.source)}`);
  const value = fs.readFileSync(helper.source, "utf8");
  must(sha256(value) === helper.sha, `${name} helper source hash changed`);
  fs.writeFileSync(helper.target, value);
}

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

const pkg = JSON.parse(source.package);
must(pkg.version === "0.1.44-r31.alpha22.candidate8h", `expected exact Candidate 8h base, got ${pkg.version}`);
pkg.version = "0.1.44-r31.alpha22.candidate8i";
pkg.description = "ArchVerse Alpha22 Candidate 8i: persistent PipeWire Mining fast path and context-safe RS admission";
source.package = JSON.stringify(pkg, null, 2) + "\n";

source.capture = replaceOnce(
  source.capture,
  'const { createGamescopePipeWireCapture } = require("./native-linux-gamescope-pipewire.cjs"); // ARCHVERSE_LINUX_GAMESCOPE_PIPEWIRE_CAPTURE',
  'const { createPersistentGamescopePipeWireCapture } = require("./persistent-gamescope-pipewire.cjs"); // ARCHVERSE_LINUX_GAMESCOPE_PIPEWIRE_CAPTURE',
  "persistent PipeWire import",
);
source.capture = replaceOnce(
  source.capture,
  'const gamescopePipeWire = createGamescopePipeWireCapture({ logger: console });\nprocess.once("exit", () => rapidOcrClient.close());',
  'const gamescopePipeWire = createPersistentGamescopePipeWireCapture({ logger: console }); // ARCHVERSE_LINUX_GAMESCOPE_PIPEWIRE_PERSISTENT_STREAM\nprocess.once("exit", () => { rapidOcrClient.close(); gamescopePipeWire.close?.(); });',
  "persistent PipeWire lifetime",
);
source.capture = replaceOnce(
  source.capture,
  '    sourceCrop: got.crop,\n  };',
  '    sourceCrop: got.crop,\n    frameAgeMs: got.frameAgeMs ?? null,\n    streamStartedAt: got.streamStartedAt ?? null,\n  };',
  "PipeWire frame timing metadata",
);

source.capture = replaceThrough(
  source.capture,
  '// ARCHVERSE_LINUX_OCR_INDEPENDENT_LANES',
  'function getOcrCaptureInfo() {',
  `// ARCHVERSE_LINUX_MINING_OCR_PRIORITY_LANES
// Mining owns one restartable worker. Every auxiliary reader shares one bounded background worker,
// which prevents several ONNX runtimes from oversubscribing the game and each other.
const LINUX_OCR_LANE_KEYS = Object.freeze(["resourceSignature", "background"]);
const linuxOcrLaneClients = {
  resourceSignature: createRapidOcrClient({
    logger: console, maxQueue: 1, timeoutMs: 900, restartOnFailure: true,
  }),
  background: createRapidOcrClient({
    logger: console, maxQueue: 1, timeoutMs: 5000, restartOnFailure: true,
  }),
};
const linuxOcrLanes = {
  resourceSignature: createLinuxOcrBackend({
    ocrRapidLines: (imgPath) => ocrRapidLinesWith(linuxOcrLaneClients.resourceSignature, imgPath),
    reportRapidOcrFailure,
    tesseractTimeoutMs: 600,
  }),
  background: createLinuxOcrBackend({
    ocrRapidLines: (imgPath) => ocrRapidLinesWith(linuxOcrLaneClients.background, imgPath),
    reportRapidOcrFailure,
    tesseractTimeoutMs: 3500,
  }),
};
const linuxOcrLane = (key) => key === "resourceSignature" ? linuxOcrLanes.resourceSignature : linuxOcrLanes.background;
process.once("exit", () => { for (const client of Object.values(linuxOcrLaneClients)) client.close(); });
const linuxOcr = linuxOcrLane("resourceSignature");
`,
  "two-lane OCR architecture",
);

source.capture = replaceOnce(
  source.capture,
  '    cacheMs: VEHICLE_PRESENCE_CACHE_MS,\n  });',
  '    cacheMs: VEHICLE_PRESENCE_CACHE_MS,\n  }); // ARCHVERSE_LINUX_MINING_VEHICLE_PRESENCE_STREAM',
  "pushed vehicle presence marker",
);
source.capture = replaceOnce(
  source.capture,
  '      stage.capture = Date.now() - t0;\n      stage.frame = `${cap.width}x${cap.height}`;',
  '      stage.capture = Date.now() - t0;\n      stage.frameAge = Number.isFinite(cap.frameAgeMs) ? cap.frameAgeMs : null;\n      stage.frame = `${cap.width}x${cap.height}`;',
  "frame-age telemetry",
);
source.capture = replaceOnce(
  source.capture,
  '      stage.frameAge = Number.isFinite(cap.frameAgeMs) ? cap.frameAgeMs : null;\n      stage.frame = `${cap.width}x${cap.height}`;',
  '      stage.frameAge = Number.isFinite(cap.frameAgeMs) ? cap.frameAgeMs : null;\n      stage.frame = `${cap.width}x${cap.height}`;\n      stage.miningOcrQueue = linuxOcrLaneClients.resourceSignature.queueDepth();\n      stage.miningOcrRestarts = linuxOcrLaneClients.resourceSignature.restartCount();\n      stage.backgroundOcrQueue = linuxOcrLaneClients.background.queueDepth();\n      stage.backgroundOcrRestarts = linuxOcrLaneClients.background.restartCount();',
  "OCR queue and recovery telemetry",
);
source.capture = replaceOnce(
  source.capture,
  '      if (runLinuxBackgroundOcr && !(vehiclePresence.active === true && typeof read.signature === "number")) {',
  '      // ARCHVERSE_LINUX_MINING_EXCLUSIVE_OCR: no auxiliary OCR process may compete while\n      // Game.log keeps the latency-critical Mining lane active.\n      if (runLinuxBackgroundOcr && !(mining && process.platform === "linux" && vehiclePresence.active === true)) {',
  "exclusive Mining background gate",
);
source.capture = replaceOnce(
  source.capture,
  '            console.warn("[mining-ocr] Linux OCR exhausted (RapidOCR/Tesseract); retrying next tick:", e && e.message); // ARCHVERSE_LINUX_OCR_EXHAUSTED_RETRY',
  '            console.warn("[mining-ocr] bounded OCR attempt failed; stale frame discarded and worker recovery scheduled:", e && e.message); // ARCHVERSE_LINUX_MINING_OCR_RECOVERY',
  "bounded Mining failure log",
);
source.capture = replaceOnce(
  source.capture,
  '          const rr3Signature = typeof rr3.signature === "number" ? rr3.signature : null;',
  `          const rr3Observed = typeof rr3.observedSignature === "number" ? rr3.observedSignature : null;
          const rr3Signature = typeof rr3.signature === "number" ? rr3.signature : null;`,
  "unclassified RS diagnostic",
);
source.capture = replaceOnce(
  source.capture,
  '          const miningOcrNow = Date.now();\n          if (rr3.kind === "mineable" && rr3SignatureAllowed) {',
  `          const miningOcrNow = Date.now();
          if (rr3.kind === "mining-observation" && rr3Observed !== null
              && (lastMiningOcrSig !== \`observed:\${rr3Observed}\` || miningOcrNow - lastMiningOcrLogAt >= 5000)) {
            console.log(\`[mining-ocr] observed unclassified RS \${rr3Observed} via \${cap.method}; not committed; context=\${rr3.context || "structural"} text="\${miningOcrSample}"\`);
            lastMiningOcrLogAt = miningOcrNow;
            lastMiningOcrSig = \`observed:\${rr3Observed}\`;
          }
          if (rr3.kind === "mineable" && rr3SignatureAllowed) {`,
  "unclassified RS log",
);

source.capture = replaceOnce(
  source.capture,
  `      if (want !== rate) {
        rate = want;
        clearInterval(timer);
        timer = setInterval(tick, rate);
        timer.unref?.();
        console.log(\`[fab-capture] poll \${rate}ms\${rate === FAST_MS ? " (scanning)" : ""}\`);
      }`,
  `      if (want !== rate) {
        rate = want;
        console.log(\`[fab-capture] poll \${rate}ms\${rate === FAST_MS ? " (scanning)" : ""}\`);
      }`,
  "self-scheduled rate change",
);
source.capture = replaceOnce(
  source.capture,
  `  let timer = setInterval(tick, POLL_MS);
  timer.unref?.();
  const drainTimer = setInterval(drainPending, DRAIN_MS);
  drainTimer.unref?.();
  console.log("[fab-capture] loop armed (opt-in via config.fabCapture)");
  return () => { clearInterval(timer); clearInterval(drainTimer); _rapidFailureReporter = null; };`,
  `  // ARCHVERSE_LINUX_MINING_LATEST_FRAME_SCHEDULER: schedule from each tick's start time.
  // A slow tick never overlaps another tick and does not add a second full polling delay.
  let timer = null;
  let schedulerClosed = false;
  const scheduleNextTick = (elapsedMs = 0) => {
    if (schedulerClosed) return;
    timer = setTimeout(runScheduledTick, Math.max(25, rate - elapsedMs));
    timer.unref?.();
  };
  const runScheduledTick = async () => {
    const startedAt = Date.now();
    try { await tick(); }
    finally { scheduleNextTick(Date.now() - startedAt); }
  };
  scheduleNextTick(0);
  const drainTimer = setInterval(drainPending, DRAIN_MS);
  drainTimer.unref?.();
  console.log("[fab-capture] loop armed with latest-frame self-scheduler (opt-in via config.fabCapture)");
  return () => {
    schedulerClosed = true;
    clearTimeout(timer);
    clearInterval(drainTimer);
    vehiclePresenceClient.close?.();
    _rapidFailureReporter = null;
  };`,
  "latest-frame scheduler",
);

source.ocr = replaceOnce(
  source.ocr,
  'function tesseractLines(imagePath, { numeric = false } = {}) {',
  'function tesseractLines(imagePath, { numeric = false, timeoutMs = 3500 } = {}) {',
  "configurable Tesseract deadline",
);
source.ocr = replaceOnce(
  source.ocr,
  "    execFile('tesseract', args, { timeout: 3500, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {",
  "    execFile('tesseract', args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {",
  "Tesseract deadline use",
);
source.ocr = replaceOnce(
  source.ocr,
  'function createLinuxOcrBackend({ ocrRapidLines, reportRapidOcrFailure }) {',
  'function createLinuxOcrBackend({ ocrRapidLines, reportRapidOcrFailure, tesseractTimeoutMs = 3500 }) {',
  "OCR backend Tesseract deadline",
);
source.ocr = replaceOnce(
  source.ocr,
  "      return { engine: 'tesseract', lines: await tesseractLines(imagePath, { numeric }) };",
  "      return { engine: 'tesseract', lines: await tesseractLines(imagePath, { numeric, timeoutMs: tesseractTimeoutMs }) };",
  "bounded Tesseract fallback",
);
source.ocr = source.ocr.replace(
  "// ARCHVERSE_LINUX_OCR_CONTRACT_V1",
  "// ARCHVERSE_LINUX_OCR_CONTRACT_V1\n// ARCHVERSE_LINUX_MINING_TESSERACT_BOUNDED_FALLBACK",
);

source.server = replaceOnce(
  source.server,
  'var missionClients = /* @__PURE__ */ new Set();\nvar shipManufacturer = null;',
  `var missionClients = /* @__PURE__ */ new Set();
// ARCHVERSE_LINUX_MINING_VEHICLE_PRESENCE_STREAM: push Game.log authority changes instead of
// polling localhost on every capture tick.
var vehiclePresenceClients = /* @__PURE__ */ new Set();
function broadcastVehiclePresence() {
  const message = \`data: \${JSON.stringify(vehiclePresenceInfo())}\\n\\n\`;
  for (const client of vehiclePresenceClients) {
    try { client.write(message); } catch { vehiclePresenceClients.delete(client); }
  }
}
var shipManufacturer = null;`,
  "vehicle presence SSE state",
);
source.server = replaceThrough(
  source.server,
  'function setShipChannelPresence(chan) {',
  'function applyVehicleControlPresence(ev) {',
  `function setShipChannelPresence(chan) {
  if (!chan) return;
  let changed = false;
  if (chan.action === "enter") {
    changed = !shipChannelAboard || shipChannelAboardName !== (chan.ship || null);
    shipChannelAboard = true;
    shipChannelAboardName = chan.ship || null;
  } else if (chan.action === "leave" && (!shipChannelAboardName || chan.ship === shipChannelAboardName)) {
    changed = shipChannelAboard || shipChannelAboardName !== null;
    shipChannelAboard = false;
    shipChannelAboardName = null;
  }
  if (changed) {
    vehiclePresenceChangedAt = Date.now();
    broadcastVehiclePresence();
  }
}
`,
  "ship-channel presence broadcast",
);
source.server = replaceThrough(
  source.server,
  'function applyVehicleControlPresence(ev) {',
  'function vehiclePresenceInfo() {',
  `function applyVehicleControlPresence(ev) {
  if (!ev || ev.kind !== "vehicleControl") return;
  let changed = false;
  if (ev.action === "grant") {
    const prior = controlledVehicleEntities.get(ev.entityId);
    const nextModel = ev.model || null;
    changed = !prior || prior.model !== nextModel;
    controlledVehicleEntities.set(ev.entityId, { model: nextModel, at: Date.now() });
  } else if (ev.action === "release") {
    changed = controlledVehicleEntities.delete(ev.entityId);
  }
  if (changed) {
    vehiclePresenceChangedAt = Date.now();
    broadcastVehiclePresence();
  }
}
`,
  "vehicle-control presence broadcast",
);

source.server = replaceOnce(
  source.server,
  '  if (url === "/api/vehicle-presence" && req.method === "GET") {',
  `  if (url === "/api/vehicle-presence/events" && req.method === "GET") {
    if (!fromThisMachine(req)) {
      res.writeHead(403, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ error: "Vehicle presence can only be read from this machine." }));
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
    });
    res.write("retry: 1000\\n");
    res.write(\`data: \${JSON.stringify(vehiclePresenceInfo())}\\n\\n\`);
    vehiclePresenceClients.add(res);
    req.on("close", () => vehiclePresenceClients.delete(res));
    return;
  }
  if (url === "/api/vehicle-presence" && req.method === "GET") {`,
  "vehicle presence SSE endpoint",
);

source.server = replaceThrough(
  source.server,
  'function parseSignature(text) {',
  'function bestSignatureLine(lines, centerX) {',
  `// ARCHVERSE_LINUX_MINING_CONTEXT_SAFE_RS_ADMISSION
var MINING_GLOBAL_NEGATIVE_CONTEXT = /\\b(?:SHIP\\s+IN\\s+DIST[A-Z]*|WRECKAGE|CURRENT\\s+FLOOR|HAB\\s+FLOOR|LOBBY|LIFT\\s+SYSTEM|ELEVATOR|HANGAR)\\b/i;
var MINING_LINE_NEGATIVE_CONTEXT = /\\b(?:CARGO|FREIGHT|INVENTORY|STORAGE|CONTAINER)\\b/i;
var MINING_IDENTIFIER = /\\b[A-Z0-9]{1,4}-\\d{4,6}\\b/i;
function signatureValues(text) {
  if (!/\\d/.test(text) || isNavigationCoordinateText(text)) return [];
  const normalized = String(text).replace(/[oO]/g, "0").replace(/[lI|]/g, "1");
  const values = [];
  const grouped = /(?<!\\d)(\\d{1,3})\\s*(?:[.,'’:]\\s*|\\s+)(\\d{3})(?!\\d)/g;
  let match;
  while ((match = grouped.exec(normalized))) {
    const value = Number(match[1] + match[2]);
    if (value >= 2e3 && value <= MAX_VALID_SIGNATURE) values.push(value);
  }
  const withoutGrouped = normalized.replace(grouped, " ");
  for (const run of withoutGrouped.match(/(?<!\\d)\\d{4,6}(?!\\d)/g) || []) {
    const value = Number(run);
    if (value >= 2e3 && value <= MAX_VALID_SIGNATURE) values.push(value);
  }
  return [...new Set(values)];
}
function structuralMiningContext(text) {
  const value = String(text || "");
  const unknown = /\\bUNKNOWN\\b/i.test(value);
  const distance = /\\b\\d+(?:[.,]\\d+)?\\s*k?m\\b/i.test(value);
  const signal = /\\b(?:STRONG|MODERATE|WEAK)\\b/i.test(value);
  const angle = /\\b\\d{1,3}\\s*[°º]/.test(value);
  return unknown && (distance || signal || angle);
}
function parseSignature(text) {
  const values = signatureValues(text);
  return values.length === 1 ? values[0] : null;
}
`,
  "context-safe signature parser",
);
source.server = replaceThrough(
  source.server,
  'function bestSignatureLine(lines, centerX) {',
  'function parseDuration(text) {',
  `function bestSignatureLine(lines, centerX) {
  const normalized = lines.filter((line) => !!line && typeof line === "object" && typeof line.text === "string");
  const allText = normalized.map((line) => line.text).join(" | ");
  if (isNavigationCoordinateText(allText) || MINING_GLOBAL_NEGATIVE_CONTEXT.test(allText)) return null;
  const acceptsLine = (line) => !MINING_LINE_NEGATIVE_CONTEXT.test(line.text)
    && !MINING_IDENTIFIER.test(line.text);
  const candidates = normalized.filter(acceptsLine)
    .map((line) => ({ l: line, sig: parseSignature(line.text) }))
    .filter((candidate) => candidate.sig != null);
  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      const a = normalized[i], b = normalized[j];
      const ah = Math.max(1, Number(a.h) || 1), bh = Math.max(1, Number(b.h) || 1);
      if (Math.abs(a.y + ah / 2 - (b.y + bh / 2)) > Math.max(ah, bh) * 0.65) continue;
      const left = a.x <= b.x ? a : b;
      const right = left === a ? b : a;
      const gap = right.x - (left.x + left.w);
      if (gap < -Math.max(ah, bh) * 0.25 || gap > Math.max(ah, bh) * 2.5) continue;
      const joined = String(left.text) + " " + String(right.text);
      if (MINING_LINE_NEGATIVE_CONTEXT.test(joined) || MINING_IDENTIFIER.test(joined)) continue;
      const signature = parseSignature(joined);
      if (signature == null) continue;
      const x0 = Math.min(left.x, right.x), y0 = Math.min(left.y, right.y);
      const x1 = Math.max(left.x + left.w, right.x + right.w), y1 = Math.max(left.y + left.h, right.y + right.h);
      candidates.push({ l: { text: joined, x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, sig: signature });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((left, right) => Math.abs(left.l.x + left.l.w / 2 - centerX)
    - Math.abs(right.l.x + right.l.w / 2 - centerX));
  return { ...candidates[0], context: structuralMiningContext(allText) ? "scan-structure" : "catalog-only" };
}
`,
  "context-safe best signature",
);

source.server = replaceOnce(
  source.server,
  `      result = best ? (() => {
        const onScreen = { ...best.l, x: best.l.x + offX, y: best.l.y + offY };
        return {
          kind: "mineable",
          signature: best.sig,
          raw: best.l.text.trim(),
          pin: glyphSearchBox(onScreen, frameW, frameH),
          text: { x: onScreen.x, y: onScreen.y, w: onScreen.w, h: onScreen.h }
        };
      })() : { kind: "none" };`,
  `      result = best ? (() => {
        const onScreen = { ...best.l, x: best.l.x + offX, y: best.l.y + offY };
        const currentRs = classifyMiningSignature(best.sig);
        if (!currentRs.valid) {
          return best.context === "scan-structure" ? {
            kind: "mining-observation",
            observedSignature: best.sig,
            classification: "unclassified",
            context: best.context,
            raw: best.l.text.trim(),
            text: { x: onScreen.x, y: onScreen.y, w: onScreen.w, h: onScreen.h },
          } : { kind: "none" };
        }
        return {
          kind: "mineable",
          signature: best.sig,
          raw: best.l.text.trim(),
          context: best.context,
          pin: glyphSearchBox(onScreen, frameW, frameH),
          text: { x: onScreen.x, y: onScreen.y, w: onScreen.w, h: onScreen.h }
        };
      })() : { kind: "none" };`,
  "classified versus observed RS",
);
source.server = replaceOnce(
  source.server,
  '      signature: typeof rd.signature === "number" ? rd.signature : null,',
  '      signature: typeof rd.signature === "number" ? rd.signature : typeof rd.observedSignature === "number" ? rd.observedSignature : null,',
  "unclassified observation diagnostics",
);
source.server = replaceOnce(
  source.server,
  '    if (rd.kind === "refinery") mining.applyRefineryRead(result);',
  `    if (rd.kind === "mining-observation") {
      miningSend({
        kind: "read", signature: rd.observedSignature, raw: rd.raw || null,
        confirmed: false, verdict: "unclassified", announced: false, used: false,
        why: "structurally confirmed RS is not in the current catalog", at: Date.now(),
      });
    }
    if (rd.kind === "refinery") mining.applyRefineryRead(result);`,
  "unclassified observation event",
);

for (const [name, file] of Object.entries(files)) {
  if (name === "pipewire" || name === "rapidClient" || name === "presence") continue;
  fs.writeFileSync(file, source[name]);
}

for (const marker of [
  "ARCHVERSE_LINUX_GAMESCOPE_PIPEWIRE_PERSISTENT_STREAM",
  "ARCHVERSE_LINUX_MINING_OCR_PRIORITY_LANES",
  "ARCHVERSE_LINUX_MINING_EXCLUSIVE_OCR",
  "ARCHVERSE_LINUX_MINING_LATEST_FRAME_SCHEDULER",
  "ARCHVERSE_LINUX_MINING_VEHICLE_PRESENCE_STREAM",
  "ARCHVERSE_LINUX_MINING_OCR_RECOVERY",
]) must(source.capture.includes(marker), `capture marker missing: ${marker}`);
must(source.ocr.includes("ARCHVERSE_LINUX_MINING_TESSERACT_BOUNDED_FALLBACK"), "bounded Tesseract marker missing");
must(source.server.includes("ARCHVERSE_LINUX_MINING_CONTEXT_SAFE_RS_ADMISSION"), "context-safe RS marker missing");
must(source.server.includes("/api/vehicle-presence/events"), "vehicle presence SSE endpoint missing");
must(!source.capture.includes("clearInterval(timer);\n        timer = setInterval(tick, rate);"), "dynamic interval scheduler remains");
must(!source.capture.includes("LINUX_OCR_LANE_KEYS = Object.freeze([\"resourceSignature\", \"fabricator\""), "per-feature OCR workers remain");

console.log("Candidate 8i applied: persistent PipeWire capture, Mining-priority OCR, pushed vehicle state, and context-safe RS admission");
