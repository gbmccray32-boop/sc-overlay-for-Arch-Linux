#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = process.argv[2];
if (!root) throw new Error("usage: apply-alpha23-candidate3.cjs <staged-candidate2-root>");
const must = (value, message) => { if (!value) throw new Error(`Alpha23 Candidate 3 apply: ${message}`); };
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const write = (relative, value) => fs.writeFileSync(path.join(root, relative), value);

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  must(first >= 0, `${label} anchor missing`);
  must(text.indexOf(before, first + before.length) < 0, `${label} anchor is not unique`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

let main = read("app/electron/main.cjs");
must(sha256(main) === "a4e888172f8ed7a103d389b6083d1a7a8406a0c2de6e7d3352393e2d187b8bf7",
  "main.cjs is not the pinned Alpha23 Candidate 2 source");
main = replaceOnce(main,
  `    if (overlayInteractionLatched && !fHoverHeld && !modalOpen && !moveMode && !notepadEditing && !dragging) {
      console.log(\`[focus-latch] \${button} down on transparent canvas at \${Math.round(globalPoint.x)},\${Math.round(globalPoint.y)}; releasing overlay interaction\`);`,
  `    if (overlayInteractionLatched && !fHoverHeld && !moveMode && !miningMoveMode && !notepadEditing && !dragging) {
      // ARCHVERSE_ALPHA23_STALE_MODAL_LATCH_RECOVERY: the renderer can close Hub/Settings while
      // its final modal=false IPC is lost during a focus handoff. The physical click is outside
      // every current DOM-classified region, so stale shell modal ownership must not trap the
      // whole transparent canvas. A real startup modal still remains blocking because it does not
      // have an F-created overlayInteractionLatched session.
      if (modalOpen) {
        modalOpen = false;
        maskModal = false;
        recomputeWebViewMask();
        console.warn("[focus-latch] cleared stale modal ownership after classified empty-canvas click");
      }
      console.log(\`[focus-latch] \${button} down on transparent canvas at \${Math.round(globalPoint.x)},\${Math.round(globalPoint.y)}; releasing overlay interaction\`);`,
  "empty-canvas stale-modal recovery");
main = replaceOnce(main,
  `function beginMiningOnlyInteractionFor30Seconds({ arrange = false } = {}) {
  if (unifiedInteractionActive) endUnifiedInteraction("switching to Mining-only interaction", { restoreFocus: false });
  miningAutoSuppress = 0;`,
  `function beginMiningOnlyInteractionFor30Seconds({ arrange = false } = {}) {
  if (unifiedInteractionActive) endUnifiedInteraction("switching to Mining-only interaction", { restoreFocus: false });
  if (overlayInteractionLatched || momentaryInteractionActive) {
    endFocusLatchedInteraction("Mining interaction superseded F latch", { suppressHeldKey: true });
  }
  miningAutoSuppress = 0;`,
  "Mining explicit-mode latch handoff");
main = replaceOnce(main,
  `function setMoveMode(on) {
  // Ctrl+Alt+M uses the upstream global arrange banner and Done button for all widgets.
  moveMode = on;`,
  `function setMoveMode(on) {
  // Ctrl+Alt+M uses the upstream global arrange banner and Done button for all widgets.
  if (overlayInteractionLatched || momentaryInteractionActive) {
    endFocusLatchedInteraction(on ? "arrange mode superseded F latch" : "arrange complete cleared F latch", { suppressHeldKey: true });
  }
  moveMode = on;`,
  "global arrange latch handoff");
write("app/electron/main.cjs", main);

let transport = read("app/electron/mining-result-transport.cjs");
must(sha256(transport) === "380274e0af93cef2b130f7ab9eda8a5725211f908c8c00acc8c3a6954b738dde",
  "mining-result-transport.cjs is not the pinned Alpha23 Candidate 2 source");
transport = replaceOnce(transport,
  `  const normalized = String(text).replace(/[oO]/g, "0").replace(/[lI|]/g, "1");
  const values = [];`,
  `  const normalized = String(text).replace(/[oO]/g, "0").replace(/[lI|]/g, "1");
  // ARCHVERSE_ALPHA23_DISTANCE_TOKEN_REJECTION: acquisition padding may include the nearby scan
  // target distance. Remove complete metre/kilometre tokens before looking for RS values so a
  // distance such as 2,000 m cannot be admitted as a resource signature.
  const signatureText = normalized.replace(/(?<!\\d)\\d{1,6}(?:[.,]\\d{1,3})?\\s*k?m\\b/gi, " ");
  const values = [];`,
  "distance-token filter");
transport = replaceOnce(transport, "while ((match = grouped.exec(normalized)))", "while ((match = grouped.exec(signatureText)))", "grouped signature source");
transport = replaceOnce(transport,
  'const withoutGrouped = normalized.replace(grouped, " ");',
  'const withoutGrouped = signatureText.replace(grouped, " ");',
  "ungrouped signature source");
write("app/electron/mining-result-transport.cjs", transport);

let capture = read("app/electron/capture.cjs");
must(sha256(capture) === "54fdf020046d03d04df8227c17142b5946d5b8f8c754cbd23827dd9571bc20ee",
  "capture.cjs is not the pinned Alpha23 Candidate 2 source");
capture = replaceOnce(capture,
  `let fallbackUpgradeNextAttemptAt = 0;
const FALLBACK_UPGRADE_PROBE_MS = 5000;`,
  `let fallbackUpgradeNextAttemptAt = 0;
const FALLBACK_UPGRADE_PROBE_MS = 5000;
// ARCHVERSE_ALPHA23_WINDOW_CAPTURE_DEADLINE: desktopCapturer window enumeration occasionally
// blocks for 8+ seconds on a normal KDE Wayland session. Keep one request in flight, stop waiting
// after 500ms, and use the monitor fallback. The direct Gamescope PipeWire path is unchanged.
const WINDOW_CAPTURE_DEADLINE_MS = 500;
const WINDOW_CAPTURE_RETRY_MS = 5000;
let pendingWindowCapture = null;
let windowCaptureRetryAt = 0;`,
  "window capture deadline state");
capture = replaceOnce(capture, "gamescope: captureWithGamescopeWindow,", "gamescope: captureWithBoundedGameWindow,", "bounded window backend");
capture = replaceOnce(capture,
  `async function captureWithElectron(disp) {`,
  `async function captureWithBoundedGameWindow(disp) {
  // A real Gamescope session keeps its existing window fallback semantics. Its primary authority
  // remains the persistent direct PipeWire stream attempted before this backend.
  if (scSession.current()?.gamescopePid) return captureWithGamescopeWindow(disp);
  const now = Date.now();
  if (now < windowCaptureRetryAt) {
    throw new Error(\`Star Citizen window capture circuit open for \${windowCaptureRetryAt - now}ms\`);
  }
  if (!pendingWindowCapture) {
    const request = captureWithGamescopeWindow(disp);
    pendingWindowCapture = request;
    request.then(
      () => { if (pendingWindowCapture === request) pendingWindowCapture = null; },
      () => { if (pendingWindowCapture === request) pendingWindowCapture = null; },
    );
  }
  const request = pendingWindowCapture;
  let timer = null;
  try {
    return await Promise.race([
      request,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(\`Star Citizen window capture exceeded \${WINDOW_CAPTURE_DEADLINE_MS}ms\`)), WINDOW_CAPTURE_DEADLINE_MS);
        timer.unref?.();
      }),
    ]);
  } catch (error) {
    if (/exceeded \\d+ms/.test(String(error?.message || error))) {
      windowCaptureRetryAt = Date.now() + WINDOW_CAPTURE_RETRY_MS;
      console.warn(\`[screen-read] Star Citizen window capture stalled; using monitor fallback for \${WINDOW_CAPTURE_RETRY_MS}ms\`);
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function captureWithElectron(disp) {`,
  "bounded window capture implementation");
capture = replaceOnce(capture,
  `  return { x, y, width, height };
}

function scanRegionPixels`,
  `  return { x, y, width, height };
}

/** Add a small acquisition-only safety margin around a deliberately tight calibration. The
 *  margin absorbs HUD drift between ship and planet-side views. Once a signature locks, the
 *  original user region remains the clamp authority. */
function expandMiningAcquisitionRegion(region, frameWidth, frameHeight) {
  const padX = Math.max(24, Math.round(frameWidth * 0.0125));
  const padY = Math.max(12, Math.round(frameHeight * 0.0112));
  const x = Math.max(0, region.x - padX);
  const y = Math.max(0, region.y - padY);
  const right = Math.min(frameWidth, region.x + region.width + padX);
  const bottom = Math.min(frameHeight, region.y + region.height + padY);
  return { x, y, width: right - x, height: bottom - y };
}

function scanRegionPixels`,
  "Mining acquisition padding helper");
capture = replaceOnce(capture,
  `          // Narrow to where the number actually was, when we know. Clamped inside \`full\`, so this
          // only ever shrinks the search — it can never look outside what the user configured.
          const region = locked ? tightenRegion(full, sigBox) : full;`,
  `          // During acquisition, tolerate modest ship/planet HUD drift around a tight calibration.
          // A lock still tightens inside the user's exact saved region. Distance-unit tokens in
          // the safety margin are rejected by mining-result-transport before catalog admission.
          const region = locked
            ? tightenRegion(full, sigBox)
            : expandMiningAcquisitionRegion(full, cap.width, cap.height);`,
  "Mining acquisition region selection");
capture = replaceOnce(capture,
  "fingerprintDistance, linuxOcrRegionPixels } };",
  "fingerprintDistance, linuxOcrRegionPixels, expandMiningAcquisitionRegion } };",
  "test export");
write("app/electron/capture.cjs", capture);

const packagePath = "app/package.json";
const pkg = JSON.parse(read(packagePath));
must(pkg.version === "0.1.46-r31.alpha23.candidate2", `unexpected package version ${pkg.version}`);
pkg.version = "0.1.46-r31.alpha23.candidate3";
pkg.description = "ArchVerse Alpha23 Candidate 3: focus-latch recovery, bounded normal-session capture, drift-tolerant Mining acquisition, and field-safe sidecar supervision";
write(packagePath, JSON.stringify(pkg, null, 2) + "\n");

write("FIELD-TEST.md", `# ArchVerse Alpha23 Candidate 3

Version: 0.1.46-r31.alpha23.candidate3. Internal field candidate, not a release.

Candidate 3 retains Candidate 2 and the frozen upstream 0.1.46 integration. It repairs a stale
modal flag that could leave the transparent overlay canvas focused after an F interaction. An
empty-canvas click now releases that latch, and Shift+F6 or Mining-only interaction explicitly
supersedes it.

On a normal KDE Wayland session, exact Star Citizen window capture now stops waiting after 500ms
and temporarily falls back to monitor capture instead of allowing an 8-second enumeration stall.
Direct Gamescope PipeWire remains unchanged and first authority. Mining acquisition adds a small
margin around a deliberately narrow saved region to tolerate ship/planet HUD drift. Values carrying
m or km units are removed before RS matching, while a locked signature stays clamped inside the
exact saved region.

Close ArchVerse, extract this folder beside Candidate 2, then run ./bin/sc-blueprint-tracker.
Test normal and Gamescope sessions. Verify Mining remains quick after Alt-Tab, ship-to-planet
transitions, and long sessions. Test held F on a widget, release F, then click empty canvas; focus
must return and remain click-through. Repeat before and after opening Hub/Settings, and verify
Shift+F6 cannot leave the canvas latched. Save complete electron.log and sidecar.log.
`);

const provenancePath = "ALPHA23-PROVENANCE.json";
const provenance = JSON.parse(read(provenancePath));
must(provenance.version === "0.1.46-r31.alpha23.candidate2", "Candidate 2 provenance missing");
provenance.version = "0.1.46-r31.alpha23.candidate3";
provenance.candidate2Artifact = 10136153055;
provenance.candidate2Run = 34435600250;
provenance.candidate2ArchiveSha256 = "23a6a5723db22f35004f75aff357a8abdb836518fd06c596a123edec4afe4f17";
provenance.protectedFiles["app/electron/main.cjs"] = sha256(main);
provenance.protectedFiles["app/electron/capture.cjs"] = sha256(capture);
provenance.protectedFiles["app/electron/mining-result-transport.cjs"] = sha256(transport);
provenance.fieldVerified = false;
write(provenancePath, JSON.stringify(provenance, null, 2) + "\n");

console.log("Alpha23 Candidate 3 apply OK: focus recovery, bounded window capture, and drift-safe Mining acquisition");
