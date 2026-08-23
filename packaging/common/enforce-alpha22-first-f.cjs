#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const [root] = process.argv.slice(2);
if (!root) { console.error('usage: enforce-alpha22-first-f.cjs <staged-app-root>'); process.exit(2); }
const must = (cond, msg) => { if (!cond) throw new Error(`Alpha22 first-F fixes: ${msg}`); };
const replaceOnce = (text, from, to, label) => {
  if (text.includes(to)) return text;
  const n = text.split(from).length - 1;
  must(n === 1, `${label}: expected one anchor, found ${n}`);
  return text.replace(from, to);
};

const mainPath = path.join(root, 'app/electron/main.cjs');
const missionsPath = path.join(root, 'app/server/overlay/missions.html');
for (const p of [mainPath, missionsPath]) must(fs.existsSync(p), `missing ${path.relative(root, p)}`);

let main = fs.readFileSync(mainPath, 'utf8');
let missions = fs.readFileSync(missionsPath, 'utf8');

// Candidate 4 exposed a bridge-name mismatch: Electron asks for __overlayClassifyPoint, while
// the renderer exported only __archverseClassifyOverlayPoint. Make one DOM classifier authoritative
// and export both names. elementFromPoint is preferred because it answers what is actually under
// the pointer now; rectangle scanning remains a fallback for pointer-events:none overlay chrome.
if (!missions.includes('ARCHVERSE_LINUX_FIRST_F_DOM_CLASSIFIER')) {
  const old = `      window.__archverseClassifyOverlayPoint = (x, y) => {\n        const hit = Array.from(document.querySelectorAll(RSEL)).filter((el) => el.offsetParent !== null).find((el) => {\n          const r = el.getBoundingClientRect();\n          return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;\n        });\n        return { interactive: !!hit, selector: hit ? (hit.id ? "#" + hit.id : hit.className || hit.tagName) : null };\n      };`;
  const neu = `      // ARCHVERSE_LINUX_FIRST_F_DOM_CLASSIFIER: authoritative first-press F hit test.\n      const classifyOverlayPoint = (x, y) => {\n        x = Number(x); y = Number(y);\n        if (!Number.isFinite(x) || !Number.isFinite(y)) return { hit: false, interactive: false, classification: "renderer-invalid-point" };\n        const visibleAt = (el) => {\n          if (!el) return false;\n          const r = el.getBoundingClientRect();\n          if (!(r.width > 1 && r.height > 1)) return false;\n          const s = getComputedStyle(el);\n          return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity || 1) > 0;\n        };\n        const top = document.elementFromPoint(x, y);\n        let hit = top?.closest?.(RSEL) || null;\n        if (hit && !visibleAt(hit)) hit = null;\n        if (!hit) {\n          hit = Array.from(document.querySelectorAll(RSEL)).find((el) => {\n            if (!visibleAt(el)) return false;\n            const r = el.getBoundingClientRect();\n            return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;\n          }) || null;\n        }\n        const selector = hit ? (hit.id ? "#" + hit.id : String(hit.className || hit.tagName || "widget")) : null;\n        const key = hit ? String(hit.dataset?.archverseKey || hit.dataset?.widgetKey || hit.id || selector || "widget") : null;\n        const title = hit ? String(hit.getAttribute?.("aria-label") || hit.getAttribute?.("title") || hit.dataset?.title || key || "widget") : null;\n        return { hit: !!hit, interactive: !!hit, key, id: key, title, classification: hit ? "renderer-dom-hit" : "renderer-dom-miss", selector };\n      };\n      window.__overlayClassifyPoint = classifyOverlayPoint;\n      window.__archverseClassifyOverlayPoint = classifyOverlayPoint;`;
  missions = replaceOnce(missions, old, neu, 'renderer point-classifier bridge');
}

// The verified hover loop references updateFHoverHit(), but Candidate 4 contained only the
// region-only fallback helper. Restore the intended function: sample the correct pointer domain,
// ask the renderer directly, then retain cached rectangles only as a fail-safe.
if (!main.includes('ARCHVERSE_LINUX_FIRST_F_DIRECT_PROBE')) {
  const anchor = `function scheduleFHoverMotionProbe() {`;
  const injected = `function updateFHoverHit() {\n  if (!fHoverHeld || !overlay || overlay.isDestroyed()) return;\n  if (fHoverPointerPhase === "host") refreshFHoverPointer({ preferHost: true });\n  else refreshFHoverPointer({ preferLinux: true });\n  if (lastGlobalPointer) {\n    const canvas = fullDisplayBounds();\n    const seq = ++fHoverProbeSeq;\n    void probeFHoverPointDirect({\n      x: Number(lastGlobalPointer.x) - canvas.x,\n      y: Number(lastGlobalPointer.y) - canvas.y,\n    }, seq); // ARCHVERSE_LINUX_FIRST_F_DIRECT_PROBE\n  }\n  updateFHoverHitFromRegions();\n}\n${anchor}`;
  main = replaceOnce(main, anchor, injected, 'first-F direct probe loop');

  main = replaceOnce(main,
    `    refreshFHoverPointer({ preferLinux: true, reason: "F-down pre-focus" });\n    updateFHoverHitFromRegions();`,
    `    refreshFHoverPointer({ preferLinux: true, reason: "F-down pre-focus" });\n    updateFHoverHit();`,
    'F-down direct probe');
  main = replaceOnce(main,
    `      refreshFHoverPointer({ preferLinux: true, reason: "F-down region refresh" });\n      updateFHoverHitFromRegions();`,
    `      refreshFHoverPointer({ preferLinux: true, reason: "F-down region refresh" });\n      updateFHoverHit();`,
    'F-down refreshed direct probe');
}

// Candidate 5 field test exposed one stale helper call in the post-F hover latch timer. The
// canonical geometry helper is overlayRegionAtPoint(); pointIsInsideOverlayRegion never existed in
// this runtime and caused a main-process ReferenceError as soon as F was released over a latched
// widget. Use the canonical helper directly and make the obsolete symbol a build-time failure.
if (!main.includes('ARCHVERSE_LINUX_F_LATCH_REGION_HELPER')) {
  main = replaceOnce(main,
    `      const insideWidget = pointIsInsideOverlayRegion(lastGlobalPointer);`,
    `      const insideWidget = !!overlayRegionAtPoint(lastGlobalPointer); // ARCHVERSE_LINUX_F_LATCH_REGION_HELPER`,
    'post-F latch region helper');
}

// Two Linux keyboard backends were generating competing F transitions in the field log. When
// evdev is available it is the key-state authority; uIOhook remains active for pointer/buttons and
// remains the F fallback on systems where evdev cannot be opened.
if (!main.includes('ARCHVERSE_LINUX_F_KEY_SOURCE_ARBITRATION')) {
  main = replaceOnce(main,
    `  const onDown = (source = "uiohook") => {\n`,
    `  const onDown = (source = "uiohook") => {\n    if (process.platform === "linux" && source === "uiohook" && evdevInteractController?.supported) return; // ARCHVERSE_LINUX_F_KEY_SOURCE_ARBITRATION\n`,
    'F key-down source arbitration');
  main = replaceOnce(main,
    `  const onUp = (source = "uiohook") => {\n`,
    `  const onUp = (source = "uiohook") => {\n    if (process.platform === "linux" && source === "uiohook" && evdevInteractController?.supported) return;\n`,
    'F key-up source arbitration');
  main = replaceOnce(main,
    `    evdevInteractController = startEvdevHoldKey({ accelerator: accel, onDown: () => onDown("evdev"), onUp: () => onUp("evdev") });\n`,
    `    evdevInteractController = startEvdevHoldKey({ accelerator: accel, onDown: () => onDown("evdev"), onUp: () => onUp("evdev") });\n    if (evdevInteractController?.supported) console.log(\`[f-hover] \${accel} keyboard authority=evdev; uIOhook key transitions retained as fallback only\`);\n`,
    'evdev authority logging');
}

must(missions.includes('ARCHVERSE_LINUX_FIRST_F_DOM_CLASSIFIER'), 'DOM classifier marker missing');
must(missions.includes('window.__overlayClassifyPoint = classifyOverlayPoint'), 'Electron renderer-classifier bridge missing');
must(main.includes('ARCHVERSE_LINUX_FIRST_F_DIRECT_PROBE'), 'direct first-F probe marker missing');
must(main.includes('ARCHVERSE_LINUX_F_KEY_SOURCE_ARBITRATION'), 'keyboard-source arbitration marker missing');
must(main.includes('ARCHVERSE_LINUX_F_LATCH_REGION_HELPER'), 'post-F latch helper marker missing');
must(!main.includes('pointIsInsideOverlayRegion('), 'obsolete undefined pointIsInsideOverlayRegion helper remains');
must(!main.includes('      updateFHoverHit();\n') || main.includes('function updateFHoverHit()'), 'updateFHoverHit call exists without implementation');

fs.writeFileSync(mainPath, main);
fs.writeFileSync(missionsPath, missions);
console.log('Alpha22 first-F fixes enforced:', root);
