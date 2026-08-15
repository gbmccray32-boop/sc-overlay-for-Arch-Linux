#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

const [mainPath] = process.argv.slice(2);
if (!mainPath) {
  console.error('usage: enforce-linux-interaction-policy.cjs <electron/main.cjs>');
  process.exit(2);
}

function must(condition, message) {
  if (!condition) throw new Error(`Linux interaction policy: ${message}`);
}

function replaceOnce(text, from, to, label) {
  if (text.includes(to)) return text;
  const count = text.split(from).length - 1;
  must(count === 1, `${label}: expected exactly one anchor, found ${count}`);
  return text.replace(from, to);
}

let main = fs.readFileSync(mainPath, 'utf8');

if (!main.includes('ARCHVERSE_LINUX_HOVER_SCOPED_LATCH')) {
  const stateAnchor = 'let fHoverPollTimer = null;';
  must(main.includes(stateAnchor), 'missing held-F polling state anchor');
  main = main.replace(stateAnchor, `${stateAnchor}\nlet linuxHoverLatchMissSince = 0;\nconst LINUX_HOVER_LATCH_MISS_MS = 90; // ARCHVERSE_LINUX_HOVER_SCOPED_LATCH`);

  const claimAnchor = `  overlayInteractionLatched = true;\n  overlayInteractionClaimSource = String(source || "widget");`;
  const claimReplacement = `  overlayInteractionLatched = true;\n  linuxHoverLatchMissSince = 0;\n  // Keep the existing pointer sampler alive after F-up so the latch is scoped to widget hover.\n  startFHoverPolling();\n  overlayInteractionClaimSource = String(source || "widget");`;
  main = replaceOnce(main, claimAnchor, claimReplacement, 'widget latch claim hook');

  const oldPoll = `function startFHoverPolling() {\n  stopFHoverPolling();\n  const tick = () => {\n    if (!fHoverHeld) return;\n    try {\n      const p = screen.getCursorScreenPoint();\n      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) lastGlobalPointer = { x: p.x, y: p.y };\n    } catch {\n      lastGlobalPointer = overlayWindows.pointerLocation() || lastGlobalPointer;\n    }\n    updateFHoverHit();\n  };\n  tick();\n  fHoverPollTimer = setInterval(tick, 32);\n}`;

  const newPoll = `function startFHoverPolling() {\n  stopFHoverPolling();\n  const tick = () => {\n    if (!fHoverHeld && !overlayInteractionLatched) return;\n    try {\n      const p = screen.getCursorScreenPoint();\n      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) lastGlobalPointer = { x: p.x, y: p.y };\n    } catch {\n      lastGlobalPointer = overlayWindows.pointerLocation() || lastGlobalPointer;\n    }\n\n    // ARCHVERSE_LINUX_HOVER_SCOPED_LATCH: while F is held, preserve the proven native\n    // hover behavior unchanged. After a widget click and F-up, keep that widget usable only\n    // while the pointer remains inside any classified widget. The transparent canvas must stop\n    // owning input as soon as the pointer leaves all widget regions.\n    if (!fHoverHeld && overlayInteractionLatched && !modalOpen && !dragging && !moveMode && !miningMoveMode) {\n      const insideWidget = pointIsInsideOverlayRegion(lastGlobalPointer);\n      if (insideWidget) {\n        linuxHoverLatchMissSince = 0;\n        return;\n      }\n      const now = Date.now();\n      if (!linuxHoverLatchMissSince) {\n        linuxHoverLatchMissSince = now;\n        return;\n      }\n      if (now - linuxHoverLatchMissSince < LINUX_HOVER_LATCH_MISS_MS) return;\n\n      linuxHoverLatchMissSince = 0;\n      endFocusLatchedInteraction("pointer left all widgets after interaction-key release", { suppressHeldKey: false });\n      stopFHoverPolling();\n      // Input shape is restored before native focus. No click is synthesized into Star Citizen\n      // or any other application; the next real click belongs naturally to the window below.\n      setTimeout(() => {\n        if (overlayInteractionLatched || momentaryInteractionActive || unifiedInteractionActive || modalOpen || dragging || moveMode || miningMoveMode) return;\n        restoreLinuxPreviousWindow();\n        console.log("[linux-interaction] pointer left all widgets; overlay released and previous focus restored");\n      }, 35);\n      return;\n    }\n\n    if (fHoverHeld) {\n      linuxHoverLatchMissSince = 0;\n      updateFHoverHit();\n    }\n  };\n  tick();\n  fHoverPollTimer = setInterval(tick, 32);\n}`;
  main = replaceOnce(main, oldPoll, newPoll, 'held-F polling policy');

  main = main.replace(
    '[focus-latch] ${overlayInteractionClaimSource} clicked; overlay owns keyboard/mouse until an external window is clicked',
    '[focus-latch] ${overlayInteractionClaimSource} clicked; overlay remains interactive while pointer stays inside a widget'
  );
  main = main.replace(
    '[focus-latch] ${accel} released via ${source} after widget click; overlay remains focused until Star Citizen is clicked',
    '[focus-latch] ${accel} released via ${source} after widget click; hover-scoped widget latch remains active'
  );
}

must(main.includes('ARCHVERSE_LINUX_HOVER_SCOPED_LATCH'), 'policy marker missing');
must(main.includes('LINUX_HOVER_LATCH_MISS_MS = 90'), '90 ms hover miss debounce missing');
must(main.includes('if (!fHoverHeld && !overlayInteractionLatched) return;'), 'post-release pointer polling missing');
must(main.includes('pointIsInsideOverlayRegion(lastGlobalPointer)'), 'classified-widget hit test missing');
must(main.includes('endFocusLatchedInteraction("pointer left all widgets after interaction-key release"'), 'hover-exit ownership release missing');
must(main.includes('restoreLinuxPreviousWindow();'), 'previous-window focus restoration missing');
must(main.includes('[linux-interaction] pointer left all widgets; overlay released and previous focus restored'), 'release diagnostic missing');
must(!main.includes('overlay remains focused until Star Citizen is clicked'), 'old Star Citizen click-to-release wording remains');

fs.writeFileSync(mainPath, main);
console.log('Linux native interaction policy enforced:', mainPath);
