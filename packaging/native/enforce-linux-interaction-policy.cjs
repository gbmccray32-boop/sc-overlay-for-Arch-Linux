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

function replaceFunctionRegion(text, startMarker, nextMarker, replacement, label) {
  const starts = text.split(startMarker).length - 1;
  const nexts = text.split(nextMarker).length - 1;
  must(starts === 1, `${label}: expected one ${startMarker} boundary, found ${starts}`);
  must(nexts === 1, `${label}: expected one ${nextMarker} boundary, found ${nexts}`);
  const start = text.indexOf(startMarker);
  const next = text.indexOf(nextMarker, start + startMarker.length);
  must(next > start, `${label}: invalid function boundary ordering`);
  return text.slice(0, start) + replacement + '\n' + text.slice(next);
}

let main = fs.readFileSync(mainPath, 'utf8');

// ---------------------------------------------------------------------------
// 1. Hover-scoped interaction latch is a Linux requirement, not a distro tweak.
// ---------------------------------------------------------------------------
if (!main.includes('ARCHVERSE_LINUX_HOVER_SCOPED_LATCH')) {
  const stateAnchor = 'let fHoverPollTimer = null;';
  must(main.includes(stateAnchor), 'missing held-F polling state anchor');
  main = main.replace(stateAnchor, `${stateAnchor}\nlet linuxHoverLatchMissSince = 0;\nconst LINUX_HOVER_LATCH_MISS_MS = 90; // ARCHVERSE_LINUX_HOVER_SCOPED_LATCH`);

  const claimAnchor = `  overlayInteractionLatched = true;\n  overlayInteractionClaimSource = String(source || "widget");`;
  const claimReplacement = `  overlayInteractionLatched = true;\n  linuxHoverLatchMissSince = 0;\n  // Keep the existing pointer sampler alive after F-up so the latch is scoped to widget hover.\n  startFHoverPolling();\n  overlayInteractionClaimSource = String(source || "widget");`;
  main = replaceOnce(main, claimAnchor, claimReplacement, 'widget latch claim hook');

  const newPoll = `function startFHoverPolling() {\n  stopFHoverPolling();\n  const tick = () => {\n    if (!fHoverHeld && !overlayInteractionLatched) return;\n    try {\n      const p = screen.getCursorScreenPoint();\n      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) lastGlobalPointer = { x: p.x, y: p.y };\n    } catch {\n      lastGlobalPointer = overlayWindows.pointerLocation() || lastGlobalPointer;\n    }\n\n    // ARCHVERSE_LINUX_HOVER_SCOPED_LATCH: while F is held, preserve the proven native\n    // hover behavior unchanged. After a widget click and F-up, keep that widget usable only\n    // while the pointer remains inside any classified widget. The transparent canvas must stop\n    // owning input as soon as the pointer leaves all widget regions.\n    if (!fHoverHeld && overlayInteractionLatched && !modalOpen && !dragging && !moveMode && !miningMoveMode) {\n      const insideWidget = pointIsInsideOverlayRegion(lastGlobalPointer);\n      if (insideWidget) {\n        linuxHoverLatchMissSince = 0;\n        return;\n      }\n      const now = Date.now();\n      if (!linuxHoverLatchMissSince) {\n        linuxHoverLatchMissSince = now;\n        return;\n      }\n      if (now - linuxHoverLatchMissSince < LINUX_HOVER_LATCH_MISS_MS) return;\n\n      linuxHoverLatchMissSince = 0;\n      endFocusLatchedInteraction("pointer left all widgets after interaction-key release", { suppressHeldKey: false });\n      stopFHoverPolling();\n      // Input shape is restored before native focus. No click is synthesized into Star Citizen\n      // or any other application; the next real click belongs naturally to the window below.\n      setTimeout(() => {\n        if (overlayInteractionLatched || momentaryInteractionActive || unifiedInteractionActive || modalOpen || dragging || moveMode || miningMoveMode) return;\n        restoreLinuxPreviousWindow();\n        console.log("[linux-interaction] pointer left all widgets; overlay released and previous focus restored");\n      }, 35);\n      return;\n    }\n\n    if (fHoverHeld) {\n      linuxHoverLatchMissSince = 0;\n      updateFHoverHit();\n    }\n  };\n  tick();\n  fHoverPollTimer = setInterval(tick, 32);\n}\n`;
  main = replaceFunctionRegion(main, 'function startFHoverPolling() {', 'function applyMouse() {', newPoll, 'held-F polling policy');

  main = main.replace(
    '[focus-latch] ${overlayInteractionClaimSource} clicked; overlay owns keyboard/mouse until an external window is clicked',
    '[focus-latch] ${overlayInteractionClaimSource} clicked; overlay remains interactive while pointer stays inside a widget'
  );
  main = main.replace(
    '[focus-latch] ${accel} released via ${source} after widget click; overlay remains focused until Star Citizen is clicked',
    '[focus-latch] ${accel} released via ${source} after widget click; hover-scoped widget latch remains active'
  );
}

// ---------------------------------------------------------------------------
// 2. Preserve the Flatpak-discovered Star Citizen focus-handoff race fix.
//    Only restore the captured pre-overlay window when SC itself won the blur.
// ---------------------------------------------------------------------------
if (!main.includes('ARCHVERSE_LINUX_GAME_FOCUS_HANDOFF')) {
  const oldFocusLoss = `    const reason = overlayWindows.isStarCitizenDirectlyActive?.()\n      ? "Star Citizen clicked"\n      : \`external window clicked\${active?.title ? \`: \${active.title}\` : ""}\`;\n    endFocusLatchedInteraction(reason, { suppressHeldKey: true });`;

  const newFocusLoss = `    const gameActive = !!overlayWindows.isStarCitizenDirectlyActive?.();\n    const reason = gameActive\n      ? "Star Citizen clicked"\n      : \`external window clicked\${active?.title ? \`: \${active.title}\` : ""}\`;\n    const hadInteraction = overlayInteractionLatched || momentaryInteractionActive;\n    endFocusLatchedInteraction(reason, { suppressHeldKey: true });\n    if (gameActive && hadInteraction) {\n      // ARCHVERSE_LINUX_GAME_FOCUS_HANDOFF: native blur can win the same race that was found\n      // under Flatpak. Clear overlay ownership first, then restore the exact pre-overlay X11\n      // window. Never synthesize or replay the user's gameplay click.\n      setTimeout(() => {\n        if (overlayInteractionLatched || momentaryInteractionActive || unifiedInteractionActive || modalOpen || dragging || moveMode || miningMoveMode) return;\n        if (overlayWindows.starCitizenProcessRunning && !overlayWindows.starCitizenProcessRunning()) return;\n        restoreLinuxPreviousWindow();\n        console.log("[game-focus] Star Citizen click handoff restored the pre-overlay game focus");\n      }, 35);\n    }`;

  main = replaceOnce(main, oldFocusLoss, newFocusLoss, 'Star Citizen blur focus handoff');
}

// ---------------------------------------------------------------------------
// 3. A lost renderer mouse-up must never leave the Linux canvas interactive forever.
//    Apply the Flatpak 30-second drag-lock watchdog to BOTH native overlay drag channels.
// ---------------------------------------------------------------------------
if (!main.includes('ARCHVERSE_LINUX_DRAG_LOCK_WATCHDOG')) {
  const draggingState = 'let dragging = false; // an active drag/resize gesture on THIS window — force it interactive so it can\'t drop';
  must(main.includes(draggingState), 'missing native dragging state anchor');
  main = main.replace(draggingState, `${draggingState}\nlet linuxDragLockWatchdog = null; // ARCHVERSE_LINUX_DRAG_LOCK_WATCHDOG\nconst LINUX_DRAG_LOCK_WATCHDOG_MS = 30000;\nfunction setLinuxDragLock(on, source = "overlay") {\n  dragging = !!on;\n  if (linuxDragLockWatchdog) {\n    clearTimeout(linuxDragLockWatchdog);\n    linuxDragLockWatchdog = null;\n  }\n  if (dragging) {\n    linuxDragLockWatchdog = setTimeout(() => {\n      linuxDragLockWatchdog = null;\n      if (!dragging) return;\n      dragging = false;\n      applyMouse();\n      reapplyOverlayInputShape();\n      console.warn(\`[linux-interaction] \${source} drag lock watchdog released a stale drag after \${LINUX_DRAG_LOCK_WATCHDOG_MS}ms\`);\n    }, LINUX_DRAG_LOCK_WATCHDOG_MS);\n  }\n}`);

  const overlayDrag = `  ipcMain.on("overlay:drag-lock", (_e, on) => {\n    dragging = !!on;`;
  const overlayDragNew = `  ipcMain.on("overlay:drag-lock", (_e, on) => {\n    setLinuxDragLock(on, "overlay");`;
  main = replaceOnce(main, overlayDrag, overlayDragNew, 'overlay drag-lock watchdog hook');

  const miningDrag = `  ipcMain.on("mining:drag-lock",(_e,on)=>{dragging=!!on;applyMouse();});`;
  const miningDragNew = `  ipcMain.on("mining:drag-lock",(_e,on)=>{setLinuxDragLock(on,"mining");applyMouse();});`;
  main = replaceOnce(main, miningDrag, miningDragNew, 'mining drag-lock watchdog hook');

  const quitAnchor = `    if (serverRestartTimer) clearTimeout(serverRestartTimer);`;
  const quitNew = `    if (serverRestartTimer) clearTimeout(serverRestartTimer);\n    if (linuxDragLockWatchdog) { clearTimeout(linuxDragLockWatchdog); linuxDragLockWatchdog = null; }`;
  main = replaceOnce(main, quitAnchor, quitNew, 'drag watchdog quit cleanup');
}

// Fail loudly: these are Linux runtime requirements for every native package target.
must(main.includes('ARCHVERSE_LINUX_HOVER_SCOPED_LATCH'), 'hover-scoped latch policy marker missing');
must(main.includes('LINUX_HOVER_LATCH_MISS_MS = 90'), '90 ms hover miss debounce missing');
must(main.includes('if (!fHoverHeld && !overlayInteractionLatched) return;'), 'post-release pointer polling missing');
must(main.includes('pointIsInsideOverlayRegion(lastGlobalPointer)'), 'classified-widget hit test missing');
must(main.includes('endFocusLatchedInteraction("pointer left all widgets after interaction-key release"'), 'hover-exit ownership release missing');
must(main.includes('[linux-interaction] pointer left all widgets; overlay released and previous focus restored'), 'hover-exit release diagnostic missing');
must(!main.includes('overlay remains focused until Star Citizen is clicked'), 'old Star Citizen click-to-release wording remains');

must(main.includes('ARCHVERSE_LINUX_GAME_FOCUS_HANDOFF'), 'Star Citizen focus-handoff marker missing');
must(main.includes('const gameActive = !!overlayWindows.isStarCitizenDirectlyActive?.();'), 'direct Star Citizen active-window test missing');
must(main.includes('[game-focus] Star Citizen click handoff restored the pre-overlay game focus'), 'game focus handoff diagnostic missing');

must(main.includes('ARCHVERSE_LINUX_DRAG_LOCK_WATCHDOG'), 'drag-lock watchdog marker missing');
must(main.includes('LINUX_DRAG_LOCK_WATCHDOG_MS = 30000'), '30-second drag watchdog missing');
must(main.includes('setLinuxDragLock(on, "overlay")'), 'overlay drag channel is not watchdog protected');
must(main.includes('setLinuxDragLock(on,"mining")'), 'mining drag channel is not watchdog protected');

fs.writeFileSync(mainPath, main);
console.log('Linux native interaction policy enforced:', mainPath);
