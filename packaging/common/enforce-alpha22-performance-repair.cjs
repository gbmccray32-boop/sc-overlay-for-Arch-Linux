#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const [root] = process.argv.slice(2);
if (!root) throw new Error('usage: enforce-alpha22-performance-repair.cjs <staged-app-root>');
const must = (v, m) => { if (!v) throw new Error(`Alpha22 performance repair: ${m}`); };
const replaceOnce = (s, from, to, label) => {
  if (s.includes(to)) return s;
  const n = s.split(from).length - 1;
  must(n === 1, `${label}: expected one anchor, found ${n}`);
  return s.replace(from, to);
};

const capturePath = path.join(root, 'app/electron/capture.cjs');
const pipewirePath = path.join(root, 'app/electron/native-linux-gamescope-pipewire.cjs');
const serverPath = path.join(root, 'app/server/server.mjs');
const configPath = path.join(root, 'app/server/overlay/config.html');
for (const p of [capturePath, pipewirePath, serverPath, configPath]) must(fs.existsSync(p), `missing ${path.relative(root, p)}`);

let capture = fs.readFileSync(capturePath, 'utf8');
let pipewire = fs.readFileSync(pipewirePath, 'utf8');
let server = fs.readFileSync(serverPath, 'utf8');
let config = fs.readFileSync(configPath, 'utf8');

// 1) PipeWire fallback is never permanent. Probe Gamescope PipeWire asynchronously while a
// fallback is in use, then promote it on the NEXT capture without delaying the current frame.
if (!pipewire.includes('ARCHVERSE_LINUX_PIPEWIRE_RECOVERY_PROBE')) {
  pipewire = replaceOnce(pipewire,
    "  function invalidate() { cached = null; }\n  return { capture, invalidate };",
    `  // ARCHVERSE_LINUX_PIPEWIRE_RECOVERY_PROBE: discovery-only health check. This intentionally\n  // does not capture a frame, so a missing/recovering node can be checked without delaying OCR.\n  async function probe(gamescopePid) {\n    const info = await discover(gamescopePid);\n    return { node: info.node, frame: info.frame, at: Date.now() };\n  }\n\n  function invalidate() { cached = null; }\n  return { capture, probe, invalidate };`,
    'PipeWire recovery probe export');
}

if (!capture.includes('ARCHVERSE_LINUX_PIPEWIRE_REPROBE')) {
  capture = replaceOnce(capture,
    'let preferredCaptureBackend = "";',
    `let preferredCaptureBackend = "";\n// ARCHVERSE_LINUX_PIPEWIRE_REPROBE: a successful fallback is not a lifetime decision. Gamescope\n// can publish its PipeWire source after ArchVerse has already started, so probe in the background\n// and promote direct capture as soon as it exists. Never pw-dump at all when there is no Gamescope.\nlet pipeWireRecoveryProbeInFlight = false;\nlet lastPipeWireRecoveryProbeAt = 0;\nconst PIPEWIRE_RECOVERY_PROBE_MS = 5000;\nfunction schedulePipeWireRecoveryProbe() {\n  if (process.platform !== "linux" || preferredCaptureBackend === "pipewire" || pipeWireRecoveryProbeInFlight) return;\n  const session = scSession.current();\n  if (!session?.gamescopePid || typeof gamescopePipeWire.probe !== "function") return;\n  const now = Date.now();\n  if (now - lastPipeWireRecoveryProbeAt < PIPEWIRE_RECOVERY_PROBE_MS) return;\n  lastPipeWireRecoveryProbeAt = now;\n  pipeWireRecoveryProbeInFlight = true;\n  gamescopePipeWire.probe(session.gamescopePid).then((info) => {\n    preferredCaptureBackend = "pipewire";\n    console.log(\`[screen-read] Gamescope PipeWire recovered; promoting node \${info?.node?.id ?? "?"} on next capture\`);\n  }).catch(() => {}).finally(() => { pipeWireRecoveryProbeInFlight = false; });\n}`,
    'PipeWire asynchronous recovery state');
  capture = replaceOnce(capture,
    '  const errors = [];\n\n  // Probe capture backends once, then reuse the winner for the session.',
    '  const errors = [];\n  schedulePipeWireRecoveryProbe();\n\n  // Probe capture backends once, then reuse the winner for the session.',
    'PipeWire recovery scheduling');
}

// 2) Give each Linux OCR consumer an independent RapidOCR worker/queue. This is intentionally
// hardware-neutral: no taskset, nice, CCD, SMT, or CPU topology assumptions.
if (!capture.includes('ARCHVERSE_LINUX_OCR_INDEPENDENT_LANES')) {
  capture = replaceOnce(capture,
    `async function ocrRapidLines(imgPath) {\n  const detected = await rapidOcrClient.detect(imgPath);\n  const res = Array.isArray(detected) ? detected : (Array.isArray(detected?.texts) ? detected.texts : []);`,
    `async function ocrRapidLinesWith(client, imgPath) {\n  const detected = await client.detect(imgPath);\n  const res = Array.isArray(detected) ? detected : (Array.isArray(detected?.texts) ? detected.texts : []);`,
    'parameterize RapidOCR client');
  capture = replaceOnce(capture,
    `  }).filter((row) => row.text.trim());\n}\nasync function ocrRapidLinesOptional(imgPath) {`,
    `  }).filter((row) => row.text.trim());\n}\nasync function ocrRapidLines(imgPath) { return ocrRapidLinesWith(rapidOcrClient, imgPath); }\nasync function ocrRapidLinesOptional(imgPath) {`,
    'restore shared OCR wrapper');
  capture = replaceOnce(capture,
    'const linuxOcr = createLinuxOcrBackend({ ocrRapidLines, reportRapidOcrFailure });',
    `// ARCHVERSE_LINUX_OCR_INDEPENDENT_LANES\n// Each consumer owns one bounded, latest-work RapidOCR process. Linux decides where those\n// processes run; ArchVerse deliberately does not pin cores or assume a particular CPU topology.\nconst LINUX_OCR_LANE_KEYS = Object.freeze(["resourceSignature", "fabricator", "mission", "claimContext", "refinery"]);\nconst linuxOcrLaneClients = Object.fromEntries(LINUX_OCR_LANE_KEYS.map((key) => [key, createRapidOcrClient({\n  logger: console, maxQueue: 1, timeoutMs: key === "resourceSignature" ? 5000 : 7000,\n})]));\nconst linuxOcrLanes = Object.fromEntries(LINUX_OCR_LANE_KEYS.map((key) => [key, createLinuxOcrBackend({\n  ocrRapidLines: (imgPath) => ocrRapidLinesWith(linuxOcrLaneClients[key], imgPath),\n  reportRapidOcrFailure,\n})]));\nconst linuxOcrLane = (key) => linuxOcrLanes[key] || linuxOcrLanes.resourceSignature;\nprocess.once("exit", () => { for (const client of Object.values(linuxOcrLaneClients)) client.close(); });\nconst linuxOcr = linuxOcrLane("resourceSignature");`,
    'independent Linux OCR lanes');
  capture = capture.replace('const got = await linuxOcr.readCrop({ shot, frameW: cap.width, frameH: cap.height, cfg, key });',
    'const got = await linuxOcrLane(key).readCrop({ shot, frameW: cap.width, frameH: cap.height, cfg, key });');
  capture = capture.replace('? await linuxOcr.ocrLines(tmpMiningCrop, { key: "resourceSignature", numeric: true })',
    '? await linuxOcrLane("resourceSignature").ocrLines(tmpMiningCrop, { key: "resourceSignature", numeric: true })');
}

// 3) Defer background consumers until AFTER the mining read, run them in parallel, and skip them
// entirely on a structurally active mining frame. The result is still one shared captured frame,
// so there is no concurrent capture race and no extra screenshot cost.
if (!capture.includes('ARCHVERSE_LINUX_OCR_BACKGROUND_LANES')) {
  capture = replaceOnce(capture,
    '      let read = { kind: "none" };\n      let renderSrc = shot;\n      if (process.platform === "linux") {',
    '      let read = { kind: "none" };\n      let renderSrc = shot;\n      let runLinuxBackgroundOcr = null; // ARCHVERSE_LINUX_OCR_BACKGROUND_LANES\n      if (process.platform === "linux") {',
    'background lane closure declaration');

  const oldGeneric = `        const fabRead = await readRegion("fabricator", fab);\n        if (fabRead?.read?.kind === "fabricator") { read = fabRead.read; renderSrc = fabRead.crop; }\n\n        if (claim) {\n          // Claim/context remains independent. Reuse only when the USER deliberately made both\n          // rectangles identical; otherwise each feature pays for and receives only its own crop.\n          const a = linuxOcrRegion(cfg, "fabricator"), b = linuxOcrRegion(cfg, "claimContext");\n          const same = ["x", "y", "w", "h"].every((k) => Math.abs(a[k] - b[k]) < 0.00001);\n          const claimRead = same && fabRead ? fabRead : await readRegion("claimContext", true);\n          if (read.kind === "none" && claimRead?.read?.kind === "fabricator") { read = claimRead.read; renderSrc = claimRead.crop; }\n        }\n\n        const missionRead = await readRegion("mission", miss);\n        if (read.kind === "none" && missionRead?.read?.kind === "mission") read = missionRead.read;\n\n        // Refinery is intentionally slow even while signatures are on the 900ms fast cadence.\n        const refineryRead = await readRegion("refinery", mining, POLL_MS);\n        if (read.kind === "none" && refineryRead?.read?.kind === "refinery") read = refineryRead.read;`;
  const newGeneric = `        runLinuxBackgroundOcr = async () => {\n          const a = linuxOcrRegion(cfg, "fabricator"), b = linuxOcrRegion(cfg, "claimContext");\n          const sameClaimRegion = ["x", "y", "w", "h"].every((k) => Math.abs(a[k] - b[k]) < 0.00001);\n          // Own worker per feature + parallel dispatch means one slow consumer cannot serialize all\n          // of the others. Mining runs before this closure and never shares these queues.\n          const [fabRead, claimSeparate, missionRead, refineryRead] = await Promise.all([\n            readRegion("fabricator", fab),\n            (sameClaimRegion && fab) ? Promise.resolve(null) : readRegion("claimContext", claim),\n            readRegion("mission", miss),\n            readRegion("refinery", mining, POLL_MS),\n          ]);\n          if (fabRead?.read?.kind === "fabricator") { read = fabRead.read; renderSrc = fabRead.crop; }\n          const claimRead = sameClaimRegion && fab && fabRead ? fabRead : claimSeparate;\n          if (read.kind === "none" && claimRead?.read?.kind === "fabricator") { read = claimRead.read; renderSrc = claimRead.crop; }\n          if (read.kind === "none" && missionRead?.read?.kind === "mission") read = missionRead.read;\n          if (read.kind === "none" && refineryRead?.read?.kind === "refinery") read = refineryRead.read;\n        };`;
  capture = replaceOnce(capture, oldGeneric, newGeneric, 'defer and parallelize background OCR');

  capture = replaceOnce(capture,
    '      // Cadence. Scanning ore is a live feedback loop:',
    `      // Mining is latency-critical. Background OCR is intentionally deferred until its read is\n      // complete, and an active radar/signature frame skips those unrelated consumers altogether.\n      // They resume automatically on the next non-scanning frame.\n      if (runLinuxBackgroundOcr && !archScanModeRead.active && typeof read.signature !== "number") {\n        await runLinuxBackgroundOcr();\n      } else if (runLinuxBackgroundOcr) {\n        stage.backgroundOcr = "deferred-for-mining";\n      }\n\n      // Cadence. Scanning ore is a live feedback loop:`,
    'run background OCR after mining');
}

// 4) The sidecar already returns full-frame pin/text coordinates when offsetX/offsetY are supplied.
// Never add the crop offset twice. Also permit 4x only when the lock really reduced pixel area.
if (!capture.includes('ARCHVERSE_LINUX_MINING_COORDINATE_AUTHORITY')) {
  capture = replaceOnce(capture,
    '          const MINING_OCR_SCALE = locked ? 4 : 2;',
    `          // ARCHVERSE_LINUX_MINING_SCALE_GUARD: 4x is reserved for a genuinely tight lock.\n          // If a coordinate regression ever leaves us with a large region, fail safe to 2x rather\n          // than turning a ~650x400 crop into a multi-megapixel OCR job.\n          const tightLock = locked && (region.width * region.height <= 120000)\n            && region.width <= Math.max(320, full.width * 0.75)\n            && region.height <= Math.max(140, full.height * 0.75);\n          const MINING_OCR_SCALE = tightLock ? 4 : 2;`,
    'mining scale area guard');

  const oldCoords = `          // rr3's pin/text are CROP-relative (the sidecar has no idea where in the full frame this\n          // crop came from) — translate back to full-frame pixels before anything downstream uses\n          // them against \`shot\`, which is the uncropped bitmap.\n          if (rr3.kind === "mineable" && typeof rr3.signature === "number" && rr3.pin && rr3.text) {\n            const shift = (r) => ({ x: r.x + region.x, y: r.y + region.y, w: r.w, h: r.h });\n            read = { ...read, kind: "mineable", signature: rr3.signature, raw: rr3.raw,\n              pin: shift(rr3.pin), text: shift(rr3.text) };\n            // Re-arm the lock from where the number REALLY is. Refreshed on every hit, so a HUD\n            // that drifts (head movement, resolution change) is tracked rather than lost.\n            sigBox = shift(rr3.text);\n            sigBoxAt = Date.now();`;
  const newCoords = `          // ARCHVERSE_LINUX_MINING_COORDINATE_AUTHORITY: /api/screen-read receives offsetX/Y and\n          // returns pin/text in FULL-FRAME coordinates. Adding region.x/y here a second time was\n          // the lock bug that turned a successful hit back into a full-size 4x OCR crop.\n          if (rr3.kind === "mineable" && typeof rr3.signature === "number" && rr3.pin && rr3.text) {\n            read = { ...read, kind: "mineable", signature: rr3.signature, raw: rr3.raw,\n              pin: rr3.pin, text: rr3.text };\n            sigBox = rr3.text;\n            sigBoxAt = Date.now();`;
  capture = replaceOnce(capture, oldCoords, newCoords, 'mining full-frame coordinate authority');
}

// 5) Mining telemetry is latest-value, bounded, and never awaited by the scanner.
if (!capture.includes('ARCHVERSE_LINUX_ASYNC_MINING_TELEMETRY')) {
  capture = replaceOnce(capture,
    '  let lastMiningOcrSig = null;',
    `  let lastMiningOcrSig = null;\n  // ARCHVERSE_LINUX_ASYNC_MINING_TELEMETRY: telemetry must never add network timeout latency to\n  // capture/OCR. One in flight + one newest pending payload; intermediate stale frames coalesce.\n  let miningScanPostInFlight = false;\n  let pendingMiningScanPayload = null;\n  const queueMiningScanPost = (payload) => {\n    pendingMiningScanPayload = payload;\n    if (miningScanPostInFlight) return;\n    miningScanPostInFlight = true;\n    const drain = async () => {\n      try {\n        while (pendingMiningScanPayload) {\n          const next = pendingMiningScanPayload;\n          pendingMiningScanPayload = null;\n          try {\n            await fetch(\`http://localhost:\${port}/api/mining/scan\`, {\n              method: "POST", headers: { "Content-Type": "application/json" },\n              body: JSON.stringify(next), signal: AbortSignal.timeout(1500),\n            });\n          } catch (error) { console.warn("[mining] scan telemetry post failed:", error?.message || error); }\n        }\n      } finally {\n        miningScanPostInFlight = false;\n        if (pendingMiningScanPayload) queueMiningScanPost(pendingMiningScanPayload);\n      }\n    };\n    void drain();\n  };`,
    'async mining telemetry queue');

  const oldPost = `        try {\n          // The measurements go WITH the verdict so the SIDECAR logs them. This process is a\n          // detached GUI app — its stdout goes nowhere, so logging here wrote the numbers into\n          // the void, which is exactly what happened to the ones asked for to tune the\n          // thresholds. sidecar.log is the file a user can actually read and send.\n          await fetch(\`http://localhost:\${port}/api/mining/scan\`, {\n            method: "POST",\n            headers: { "Content-Type": "application/json" },\n            body: JSON.stringify({\n              signature: read.signature,\n              confirmed: glyph.seen,\n              // \`ref\` (the number's own calibration ink/lum/floor) was computed by findScanGlyph but\n              // never forwarded — the sidecar's log line already knows how to print it, so a miss\n              // could never be told apart from "wrong hue" vs "not bright enough" without it.\n              glyph: { fraction: glyph.fraction, total: glyph.total, mean: glyph.mean, hitMean: glyph.hitMean, ref: glyph.ref },\n              // For the "scan read area" outline: the text the OCR actually saw, and where/how big\n              // it was. Sent as the raw frame rect plus the frame size, because only this process\n              // knows the captured frame's dimensions — the sidecar turns it into fractions.\n              raw: read.raw,\n              text: read.text,\n              // The poll rate RIDES ALONG rather than getting its own channel or its own log\n              // line. capture.cjs runs in the detached GUI process, whose stdout goes nowhere —\n              // the "[fab-capture] poll 900ms" line below has never reached a file anyone can\n              // read, which is why "it feels slower in this ship" could not be checked. Now every\n              // scan says what cadence it was polling at, in sidecar.log, next to its verdict.\n              pollMs: rate,\n              scanHud: read.scanHud === true,\n              frame: { w: shot.getSize().width, h: shot.getSize().height },\n            }),\n            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),\n          });\n        } catch (e) { console.warn("[mining] scan post failed:", e && e.message); }`;
  const newPost = `        // Do not await telemetry. It is observability/state propagation, not part of OCR.\n        queueMiningScanPost({\n          signature: read.signature, confirmed: glyph.seen,\n          glyph: { fraction: glyph.fraction, total: glyph.total, mean: glyph.mean, hitMean: glyph.hitMean, ref: glyph.ref },\n          raw: read.raw, text: read.text, pollMs: rate, scanHud: read.scanHud === true,\n          frame: { w: shot.getSize().width, h: shot.getSize().height },\n        });`;
  capture = replaceOnce(capture, oldPost, newPost, 'nonblocking mining telemetry');
}

// 6) Strict Settings persistence: write, reopen, parse, verify canonical Linux values, and only
// then report success. Existing background saveConfig callers retain their best-effort behavior.
if (!server.includes('ARCHVERSE_CONFIG_STRICT_VERIFICATION')) {
  const saveAnchor = `var saveConfig = async () => {\n  repairArchVerseLinuxConfig(config);\n  try {\n    mkdirSync4(userDir, { recursive: true });\n    await writeFile2(configPath, JSON.stringify(config, null, 2));\n    lastSaveOk = (/* @__PURE__ */ new Date()).toISOString();\n    lastSaveError = null;\n  } catch (e) {\n    lastSaveError = { at: (/* @__PURE__ */ new Date()).toISOString(), error: String(e) };\n    console.error("[config] save failed:", String(e));\n  }\n};`;
  const saveReplacement = `${saveAnchor}\n// ARCHVERSE_CONFIG_STRICT_VERIFICATION\nasync function saveConfigVerified() {\n  await saveConfig();\n  if (lastSaveError) throw new Error(lastSaveError.error || "config write failed");\n  let persisted;\n  try { persisted = JSON.parse(readFileSync12(configPath, "utf8")); }\n  catch (error) { throw new Error(\`config read-back failed: \${error?.message || error}\`); }\n  repairArchVerseLinuxConfig(persisted);\n  const verifyKeys = [\n    "logPath", "hwAccel", "amdCompat", "unfocusedOpacity", "holdToInteract",\n    "revertThemeOnFoot", "syncEnabled", "fabCapture", "fabClaim", "missionOcr",\n    "miningAssistant", "shareLogs", "interactHotkey", "moveHotkey", "scanRegion",\n    "linuxOcrRegions", "widgetHotkeys",\n  ];\n  const mismatches = verifyKeys.filter((key) => JSON.stringify(persisted?.[key] ?? null) !== JSON.stringify(config?.[key] ?? null));\n  if (mismatches.length) throw new Error(\`config read-back mismatch: \${mismatches.join(", ")}\`);\n  if (process.platform === "linux" && (persisted.interactHotkey !== "F" || persisted.holdToInteract !== true || persisted.moveHotkey !== "Shift+F6")) {\n    throw new Error("Linux interaction contract did not persist canonically");\n  }\n  console.log(\`[config] saved and verified path=\${configPath}\`);\n  return persisted;\n}`;
  server = replaceOnce(server, saveAnchor, saveReplacement, 'strict config save helper');

  server = replaceOnce(server,
    '    await saveConfig();\n    broadcastMissions();',
    `    let persistedConfig;\n    try { persistedConfig = await saveConfigVerified(); }\n    catch (error) {\n      console.error("[config] manual save verification failed:", error?.message || error);\n      res.writeHead(500, { "Content-Type": "application/json", "Cache-Control": "no-store" });\n      res.end(JSON.stringify({ ok: false, verified: false, error: "config_save_failed", detail: String(error?.message || error).slice(0, 240) }));\n      return;\n    }\n    broadcastMissions();`,
    'manual config POST strict write');

  server = replaceOnce(server,
    `    res.end(JSON.stringify({\n      ok: true,\n      platform: process.platform,\n      screenReading: {`,
    `    res.end(JSON.stringify({\n      ok: true, verified: true,\n      platform: process.platform,\n      applied: {\n        interactHotkey: persistedConfig.interactHotkey, holdToInteract: persistedConfig.holdToInteract,\n        moveHotkey: persistedConfig.moveHotkey, fabCapture: persistedConfig.fabCapture === true,\n        fabClaim: persistedConfig.fabClaim === true, missionOcr: persistedConfig.missionOcr === true,\n        miningAssistant: persistedConfig.miningAssistant === true, linuxOcrRegions: persistedConfig.linuxOcrRegions,\n        scanRegion: persistedConfig.scanRegion, widgetHotkeys: persistedConfig.widgetHotkeys || {},\n      },\n      screenReading: {`,
    'config POST verified response');
}

if (!config.includes('ARCHVERSE_CONFIG_SAVE_VERIFIED_UI')) {
  const oldUi = `    await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });\n    document.getElementById("syncToken").value = "";\n    // Unmissable confirmation: flip the Save button to a green "Saved ✓" for ~1.6s (+ keep the toast).`;
  const newUi = `    // ARCHVERSE_CONFIG_SAVE_VERIFIED_UI: the server does the authoritative disk read-back.\n    // Do not show success merely because fetch() resolved — HTTP 500 also resolves.\n    let savedReply;\n    try {\n      const response = await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });\n      savedReply = await response.json().catch(() => ({}));\n      if (!response.ok || savedReply?.ok !== true || savedReply?.verified !== true) {\n        throw new Error(savedReply?.detail || savedReply?.error || \`HTTP \${response.status}\`);\n      }\n      if (ARCHVERSE_LINUX_DESKTOP()) {\n        const a = savedReply.applied || {};\n        if (a.interactHotkey !== "F" || a.holdToInteract !== true || a.moveHotkey !== "Shift+F6") {\n          throw new Error("Linux interaction settings did not verify canonically");\n        }\n      }\n    } catch (error) {\n      const s = document.getElementById("saved");\n      if (s) {\n        s.textContent = \`Settings were not applied: \${error?.message || error}\`;\n        s.style.color = "var(--error)"; s.classList.add("show");\n        setTimeout(() => { s.classList.remove("show"); s.textContent = "Saved ✓"; s.style.color = ""; }, 5000);\n      }\n      const b = document.getElementById("saveBtn");\n      if (b) { b.textContent = "Save failed"; setTimeout(() => { b.textContent = "Save"; }, 2200); }\n      return;\n    }\n    document.getElementById("syncToken").value = "";\n    // Unmissable confirmation: flip the Save button to a green "Saved ✓" for ~1.6s (+ keep the toast).`;
  config = replaceOnce(config, oldUi, newUi, 'Settings verified UI');
}

// Marker-only safe diagnostic logging throttle: preserve all focus/pointer behavior. We do not
// alter the held-F timing contract in a performance candidate.
if (!capture.includes('ARCHVERSE_ALPHA22_PERFORMANCE_REPAIR')) {
  capture = capture.replace('// Fabricator screen-capture loop (opt-in).', '// Fabricator screen-capture loop (opt-in).\n// ARCHVERSE_ALPHA22_PERFORMANCE_REPAIR');
}

fs.writeFileSync(capturePath, capture);
fs.writeFileSync(pipewirePath, pipewire);
fs.writeFileSync(serverPath, server);
fs.writeFileSync(configPath, config);

for (const marker of [
  'ARCHVERSE_ALPHA22_PERFORMANCE_REPAIR',
  'ARCHVERSE_LINUX_PIPEWIRE_REPROBE',
  'ARCHVERSE_LINUX_OCR_INDEPENDENT_LANES',
  'ARCHVERSE_LINUX_OCR_BACKGROUND_LANES',
  'ARCHVERSE_LINUX_MINING_COORDINATE_AUTHORITY',
  'ARCHVERSE_LINUX_MINING_SCALE_GUARD',
  'ARCHVERSE_LINUX_ASYNC_MINING_TELEMETRY',
]) must(capture.includes(marker), `capture marker missing: ${marker}`);
must(pipewire.includes('ARCHVERSE_LINUX_PIPEWIRE_RECOVERY_PROBE'), 'PipeWire probe marker missing');
must(server.includes('ARCHVERSE_CONFIG_STRICT_VERIFICATION'), 'strict config marker missing');
must(config.includes('ARCHVERSE_CONFIG_SAVE_VERIFIED_UI'), 'Settings UI verification marker missing');

console.log('applied Alpha22 Candidate 3 performance + persistence repair');
