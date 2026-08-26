#!/usr/bin/env node
'use strict';

// ARCHVERSE_LOCATION_SYNC_V3B_ENFORCER
// Candidate 7b: make the one-shot Location Sync result handoff durable and idempotent.

const fs = require('node:fs');
const path = require('node:path');

const root = process.argv[2];
if (!root) throw new Error('usage: enforce-location-sync-v3b.cjs <staged-app-root>');

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function write(rel, text) { fs.writeFileSync(path.join(root, rel), text); }
function replaceOnce(text, oldText, newText, label) {
  const i = text.indexOf(oldText);
  if (i < 0) throw new Error(`Candidate 7b patch target missing: ${label}`);
  if (text.indexOf(oldText, i + oldText.length) >= 0) throw new Error(`Candidate 7b patch target ambiguous: ${label}`);
  return text.slice(0, i) + newText + text.slice(i + oldText.length);
}

// Electron: durable file first, optional HTTP hint second; never await localhost delivery.
{
  const rel = 'app/electron/capture.cjs';
  let s = read(rel);
  const oldTransport = `  const tmpLocateCrop = path.join(os.tmpdir(), \`archverse-location-sync-\${process.pid}.png\`);\n  let lastLocationRequestAt = 0;\n  const postLocationResult = async (payload) => {\n    try {\n      await fetch(\`http://localhost:\${port}/api/hauling/locate-result\`, {\n        method: "POST", headers: { "Content-Type": "application/json" },\n        body: JSON.stringify(payload), signal: AbortSignal.timeout(3500),\n      });\n    } catch (error) {\n      console.warn("[location-sync] result post failed:", error?.message || error);\n    }\n  };\n`;
  const newTransport = `  const tmpLocateCrop = path.join(os.tmpdir(), \`archverse-location-sync-\${process.pid}.png\`);\n  // ARCHVERSE_LOCATION_SYNC_DURABLE_HANDOFF: the authoritative result transport is an atomic file\n  // in SC_TRACKER_CONFIG_DIR. A busy localhost sidecar must never destroy a successful 4-second\n  // capture/OCR result. HTTP remains a best-effort low-latency hint only.\n  const locationResultPath = path.join(configDir, "location-sync-result.json");\n  let lastLocationRequestAt = 0;\n  const writeLocationResultDurable = (payload) => {\n    const t0 = Date.now();\n    fs.mkdirSync(configDir, { recursive: true });\n    const envelope = {\n      schema: "archverse-location-sync-result/1",\n      completedAt: Date.now(),\n      ...payload,\n    };\n    const tmp = \`\${locationResultPath}.tmp-\${process.pid}-\${Date.now()}-\${Math.random().toString(16).slice(2)}\`;\n    try {\n      fs.writeFileSync(tmp, JSON.stringify(envelope, null, 2) + "\\n", { mode: 0o600 });\n      try { fs.chmodSync(tmp, 0o600); } catch {}\n      fs.renameSync(tmp, locationResultPath);\n    } finally {\n      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}\n    }\n    return { envelope, durableWriteMs: Date.now() - t0 };\n  };\n  const postLocationResultFast = (payload) => {\n    const t0 = Date.now();\n    void fetch(\`http://localhost:\${port}/api/hauling/locate-result\`, {\n      method: "POST", headers: { "Content-Type": "application/json" },\n      body: JSON.stringify(payload), signal: AbortSignal.timeout(1200),\n    }).then((res) => {\n      if (!res.ok) throw new Error(\`HTTP \${res.status}\`);\n      console.log(\`[location-sync] optional HTTP fast-path delivered in \${Date.now() - t0}ms\`);\n    }).catch((error) => {\n      console.log(\`[location-sync] optional HTTP fast-path unavailable after \${Date.now() - t0}ms; durable result retained: \${error?.message || error}\`);\n    });\n  };\n  const deliverLocationResult = (payload) => {\n    let delivered = payload;\n    try {\n      const { envelope, durableWriteMs } = writeLocationResultDurable(payload);\n      delivered = envelope;\n      console.log(\`[location-sync] durable result committed request=\${Number(payload.requestAt || 0)} write=\${durableWriteMs}ms\`);\n    } catch (error) {\n      // Emergency compatibility fallback. The durable file is authoritative when available, but a\n      // filesystem failure should still give the existing localhost path one chance to deliver.\n      console.warn(\`[location-sync] durable result write failed: \${error?.message || error}\`);\n    }\n    postLocationResultFast(delivered);\n  };\n`;
  s = replaceOnce(s, oldTransport, newTransport, 'Electron location-result transport');
  const replacements = [
    ['        await postLocationResult({\n          error: parsed.error, frame: null, body: parsed.body || null, system: parsed.system || null,\n          currentLocation: parsed.currentLocation || null, captureMethod: cap.method, sourceName: cap.sourceName,\n          captureMs, ocrMs, engine: ocr.engine, sample, requestAt,\n        });',
     '        deliverLocationResult({\n          error: parsed.error, frame: null, body: parsed.body || null, system: parsed.system || null,\n          currentLocation: parsed.currentLocation || null, captureMethod: cap.method, sourceName: cap.sourceName,\n          captureMs, ocrMs, engine: ocr.engine, sample, requestAt, totalMs: Date.now() - started,\n        });'],
    ['      await postLocationResult({\n        pos: parsed.pos, frame: parsed.frame, body: parsed.body || null, system: parsed.system || null,\n        source: parsed.source, zoneLabel: parsed.zoneLabel || null, currentLocation: parsed.currentLocation || null,\n        captureMethod: cap.method, sourceName: cap.sourceName, sourceFrame: cap.sourceFrame || null,\n        nativeCrop: cap.nativeCrop || null, ocrSize: cap.ocrSize || null, captureMs, ocrMs, engine: ocr.engine,\n        requestAt, totalMs: Date.now() - started,\n      });',
     '      deliverLocationResult({\n        pos: parsed.pos, frame: parsed.frame, body: parsed.body || null, system: parsed.system || null,\n        source: parsed.source, zoneLabel: parsed.zoneLabel || null, currentLocation: parsed.currentLocation || null,\n        captureMethod: cap.method, sourceName: cap.sourceName, sourceFrame: cap.sourceFrame || null,\n        nativeCrop: cap.nativeCrop || null, ocrSize: cap.ocrSize || null, captureMs, ocrMs, engine: ocr.engine,\n        requestAt, totalMs: Date.now() - started,\n      });'],
    ['      await postLocationResult({ error: String(error?.message || error).slice(0, 220), requestAt });',
     '      deliverLocationResult({ error: String(error?.message || error).slice(0, 220), requestAt, totalMs: Date.now() - started });'],
    ['        await postLocationResult({ error: "Star Citizen was not the active bound game window — bring the game/ArchVerse overlay forward and press Sync again.", requestAt: locateAt });',
     '        deliverLocationResult({ error: "Star Citizen was not the active bound game window — bring the game/ArchVerse overlay forward and press Sync again.", requestAt: locateAt, totalMs: 0 });'],
  ];
  for (const [a,b] of replacements) s = replaceOnce(s, a, b, 'Electron delivery call');
  if (/await\s+postLocationResult\b|const postLocationResult\s*=/.test(s)) throw new Error('obsolete awaited Location Sync POST survived');
  write(rel, s);
}

// Sidecar: polling GET consumes the atomic result file; requestAt prevents stale or duplicate application.
{
  const rel = 'app/server/server.mjs';
  let s = read(rel);
  const oldState = `// ARCHVERSE_LOCATION_SYNC_V3_STATE\nconst HAULING_LOCATE_TTL_MS = 20_000;\nconst HAULING_LOCATE_SNAP_M = 12_000;\nlet haulingLocate = null;\n`;
  const newState = `// ARCHVERSE_LOCATION_SYNC_V3_STATE\nconst HAULING_LOCATE_TTL_MS = 20_000;\nconst HAULING_LOCATE_SNAP_M = 12_000;\nconst haulingLocateResultPath = join13(userDir, "location-sync-result.json");\nlet haulingLocate = null;\n\n// ARCHVERSE_LOCATION_SYNC_DURABLE_CONSUMER: consume Electron's atomic result file on demand.\n// requestAt is the nonce. A stale file from an earlier press can never become the current position.\nfunction applyHaulingLocatePayload(body, deliveryTransport) {\n  const n = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;\n  const requestAt = n(body?.requestAt);\n  const expectedAt = n(config.haulingLocateAt) ?? 0;\n  if (!requestAt) return { accepted: false, reason: "missing-requestAt" };\n  if (haulingLocate?.requestAt === requestAt) return { accepted: false, duplicate: true, reason: "duplicate" };\n  if (expectedAt <= 0 || requestAt !== expectedAt) return { accepted: false, stale: true, reason: \`stale-request expected=\${expectedAt} got=\${requestAt}\` };\n\n  const p = body?.pos;\n  const x = n(p?.x), y = n(p?.y), z = n(p?.z);\n  const frame = body?.frame === "body" || body?.frame === "system" ? body.frame : null;\n  const completedAt = n(body?.completedAt);\n  const handoffMs = completedAt ? Math.max(0, Date.now() - completedAt) : null;\n  if (x != null && y != null && z != null && frame) {\n    haulingLocate = {\n      at: Date.now(), requestAt, ok: true, pos: { x, y, z }, frame,\n      body: typeof body.body === "string" && body.body ? body.body : null,\n      system: typeof body.system === "string" && body.system ? body.system : null,\n      source: typeof body.source === "string" ? body.source : null,\n      zoneLabel: typeof body.zoneLabel === "string" ? body.zoneLabel : null,\n      currentLocation: typeof body.currentLocation === "string" ? body.currentLocation : null,\n      captureMethod: typeof body.captureMethod === "string" ? body.captureMethod : null,\n      captureMs: n(body.captureMs), ocrMs: n(body.ocrMs), totalMs: n(body.totalMs),\n      engine: typeof body.engine === "string" ? body.engine : null,\n      deliveryTransport,\n      handoffMs,\n    };\n  } else {\n    haulingLocate = {\n      at: Date.now(), requestAt, ok: false,\n      error: typeof body?.error === "string" ? body.error : "No usable location coordinates were read.",\n      deliveryTransport, handoffMs,\n    };\n  }\n  config.haulingLocateAt = 0;\n  void saveConfig();\n  hauling.emit("change");\n  console.log(haulingLocate.ok\n    ? \`[hauling-location] \${haulingLocate.frame} \${haulingLocate.body || haulingLocate.system || "unknown"} via \${haulingLocate.captureMethod || "capture"} delivery=\${deliveryTransport} handoff=\${handoffMs ?? "?"}ms pos=\${haulingLocate.pos.x.toFixed(1)},\${haulingLocate.pos.y.toFixed(1)},\${haulingLocate.pos.z.toFixed(1)}m\`\n    : \`[hauling-location] failed delivery=\${deliveryTransport}: \${haulingLocate.error}\`);\n  return { accepted: true, result: haulingLocate };\n}\n\nfunction consumeHaulingLocateResultFile() {\n  if (!existsSync12(haulingLocateResultPath)) return { consumed: false };\n  try {\n    const body = JSON.parse(readFileSync12(haulingLocateResultPath, "utf8"));\n    const applied = applyHaulingLocatePayload(body, "durable-file");\n    rmSync(haulingLocateResultPath, { force: true });\n    if (applied.accepted) console.log(\`[location-sync] durable result consumed request=\${body.requestAt}\`);\n    else if (!applied.duplicate) console.log(\`[location-sync] discarded durable result: \${applied.reason}\`);\n    return { consumed: !!applied.accepted, ...applied };\n  } catch (error) {\n    console.warn(\`[location-sync] durable result read failed: \${error?.message || error}\`);\n    try { rmSync(haulingLocateResultPath, { force: true }); } catch {}\n    return { consumed: false, error: String(error?.message || error) };\n  }\n}\n`;
  s = replaceOnce(s, oldState, newState, 'sidecar durable state');
  const start = s.indexOf('  // ARCHVERSE_LOCATION_SYNC_V3_API — one press, one bounded screen read.');
  const end = s.indexOf('  if (url === "/api/hauling/place" && req.method === "POST") {', start);
  if (start < 0 || end < 0) throw new Error('Candidate 7b API block bounds missing');
  const newApi = `  // ARCHVERSE_LOCATION_SYNC_V3_API — one press, one bounded screen read.\n  if (url === "/api/hauling/locate" && req.method === "POST") {\n    // A new press invalidates any unconsumed result from an older request before arming a fresh nonce.\n    try { rmSync(haulingLocateResultPath, { force: true }); } catch {}\n    config.haulingLocateAt = Date.now();\n    haulingLocate = null;\n    await saveConfig();\n    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });\n    res.end(JSON.stringify({ ok: true, armed: true, at: config.haulingLocateAt, transport: "durable-file+http-hint" }));\n    return;\n  }\n  if (url === "/api/hauling/locate" && req.method === "GET") {\n    // Polling the existing endpoint is also the durable consumer. No background watcher and no\n    // continuous OCR are introduced: if the widget is not waiting, nothing reads this file.\n    const delivery = consumeHaulingLocateResultFile();\n    const pending = Date.now() - Number(config.haulingLocateAt || 0) < HAULING_LOCATE_TTL_MS && !haulingLocate;\n    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });\n    res.end(JSON.stringify({ ok: true, pending, result: haulingLocate, delivery: delivery.consumed ? "durable-file" : null }));\n    return;\n  }\n  if (url === "/api/hauling/locate-result" && req.method === "POST") {\n    // Optional low-latency hint only. The Electron side writes the durable file first and never waits\n    // for this request. requestAt makes races with the durable consumer idempotent.\n    const body = await readBody(req);\n    const applied = applyHaulingLocatePayload(body, "http-fast-path");\n    res.writeHead(applied.accepted || applied.duplicate ? 200 : 202, { "Content-Type": "application/json", "Cache-Control": "no-store" });\n    res.end(JSON.stringify({ ok: true, accepted: !!applied.accepted, duplicate: !!applied.duplicate, reason: applied.reason || null }));\n    return;\n  }\n`;
  s = s.slice(0, start) + newApi + s.slice(end);
  write(rel, s);
}

// Widget: expose capture/progress states so a slow planner does not look like a dead button.
{
  const rel = 'app/server/overlay/hauling.html';
  let s = read(rel);
  s = replaceOnce(s,
    '        if (body.result) { result = body.result; break; }\n      }\n      if (!result) {',
    '        if (body.result) { result = body.result; break; }\n        const elapsed = 18000 - Math.max(0, deadline - Date.now());\n        if (elapsed > 3200) syncMsg("Reading coordinates…");\n        else if (elapsed > 900) syncMsg("Capturing position…");\n      }\n      if (!result) {',
    'widget polling progress');
  s = replaceOnce(s,
    '      } else {\n        await load();\n        const sr = (plan && plan.startResolved) || {};',
    '      } else {\n        // ARCHVERSE_LOCATION_SYNC_DURABLE_UI: the result is already safely captured before route\n        // resolution begins. Make that visible so a busy planner never looks like a dead button.\n        syncMsg("Position captured. Applying route origin…");\n        await load();\n        const sr = (plan && plan.startResolved) || {};',
    'widget captured/applying state');
  write(rel, s);
}

// Fail closed if the intended transport split is not visible in the staged runtime.
const cap = read('app/electron/capture.cjs');
const srv = read('app/server/server.mjs');
const ui = read('app/server/overlay/hauling.html');
for (const [needle, where] of [
  ['ARCHVERSE_LOCATION_SYNC_DURABLE_HANDOFF', cap],
  ['location-sync-result.json', cap],
  ['postLocationResultFast', cap],
  ['ARCHVERSE_LOCATION_SYNC_DURABLE_CONSUMER', srv],
  ['deliveryTransport', srv],
  ['ARCHVERSE_LOCATION_SYNC_DURABLE_UI', ui],
]) if (!where.includes(needle)) throw new Error(`Candidate 7b invariant missing: ${needle}`);

console.log('Candidate 7b durable Location Sync handoff enforced.');
