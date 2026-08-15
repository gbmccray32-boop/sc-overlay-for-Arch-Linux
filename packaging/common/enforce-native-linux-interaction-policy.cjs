#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

const [mainPath] = process.argv.slice(2);
if (!mainPath) {
  console.error('usage: enforce-native-linux-interaction-policy.cjs <main.cjs>');
  process.exit(2);
}

function must(cond, msg) {
  if (!cond) throw new Error(`Native Linux interaction policy: ${msg}`);
}

function replaceOnce(text, from, to, label) {
  if (text.includes(to)) return text;
  const count = text.split(from).length - 1;
  must(count === 1, `${label}: expected exactly one anchor, found ${count}`);
  return text.replace(from, to);
}

let main = fs.readFileSync(mainPath, 'utf8');

// If this payload already came through the Flatpak convergence path, promote the same behavior
// marker to the distro-neutral Linux contract rather than installing a second implementation.
if (!main.includes('ARCHVERSE_LINUX_HOVER_SCOPED_LATCH') && main.includes('ARCHVERSE_FLATPAK_HOVER_SCOPED_LATCH')) {
  const renames = [
    ['ARCHVERSE_FLATPAK_HOVER_SCOPED_LATCH', 'ARCHVERSE_LINUX_HOVER_SCOPED_LATCH'],
    ['postReleaseHoverTimer043', 'linuxHoverLatchTimer'],
    ['postReleaseHoverMissSince043', 'linuxHoverLatchMissSince'],
    ['POST_RELEASE_HOVER_MISS_MS_043', 'LINUX_HOVER_LATCH_MISS_MS'],
    ['postReleasePointerInsideWidget043', 'linuxPointerInsideClassifiedWidget'],
    ['tickPostReleaseHoverLatch043', 'tickLinuxHoverScopedLatch'],
    ['startPostReleaseHoverLatch043', 'startLinuxHoverScopedLatch'],
    ['stopPostReleaseHoverLatch043', 'stopLinuxHoverScopedLatch'],
    ['[focus-latch] pointer left all widgets after interaction-key release; click-through restored and previous focus returned',
      '[linux-interaction] pointer left all widgets; overlay released and previous focus restored'],
  ];
  for (const [from, to] of renames) main = main.split(from).join(to);
}

// Durable native-Linux behavior contract shared by Arch, Fedora and Debian packages:
//  1. Holding the interaction key over transparent canvas does not focus the overlay.
//  2. Focus is taken only after entering a classified widget.
//  3. A clicked widget may remain interactive after key-up for typing/checkboxes/scrolling.
//  4. That latch is hover-scoped: leaving every classified widget releases overlay ownership
//     after a tiny debounce, restores click-through first, then restores the exact native window
//     that had focus before ArchVerse took it.
//  5. No later click, Alt-Tab, Super-key selection, or Star-Citizen-specific synthetic click is
//     required to escape the transparent canvas.
//  6. Future upstream refactors must either preserve this marker/implementation or expose the
//     lifecycle hooks below. Otherwise packaging fails closed instead of silently changing Linux
//     interaction behavior.
if (!main.includes('ARCHVERSE_LINUX_HOVER_SCOPED_LATCH')) {
  const lifecycleAnchor = 'let linuxScLifecycleTimer = null;';
  must(main.includes(lifecycleAnchor), 'missing Linux desktop-focus lifecycle anchor');
  must(main.includes('function releaseOverlayOwnershipToDesktop('), 'missing overlay ownership release helper');
  must(main.includes('function restoreLinuxPreviousWindow()'), 'missing previous-window focus restore helper');
  must(main.includes('function overlayRegionAtPoint('), 'missing classified widget hit-test helper');

  const policy = `let linuxHoverLatchTimer = null;\nlet linuxHoverLatchMissSince = 0;\nconst LINUX_HOVER_LATCH_MISS_MS = 90;\n\nfunction linuxPointerInsideClassifiedWidget() {\n  let p = null;\n  try { p = overlayWindows.pointerLocation?.(); } catch {}\n  if (!p || !Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.y))) {\n    try { p = screen.getCursorScreenPoint(); } catch {}\n  }\n  // Unknown pointer state is fail-safe: retain the active widget rather than dropping focus\n  // while the compositor is between pointer samples.\n  if (!p || !Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.y))) return true;\n  try { return !!overlayRegionAtPoint({ x: Number(p.x), y: Number(p.y) }); } catch { return true; }\n}\n\nfunction tickLinuxHoverScopedLatch() {\n  // ARCHVERSE_LINUX_HOVER_SCOPED_LATCH\n  if (fHoverHeld || !overlayInteractionLatched || modalOpen || dragging || moveMode || miningMoveMode) {\n    linuxHoverLatchMissSince = 0;\n    return;\n  }\n  if (linuxPointerInsideClassifiedWidget()) {\n    linuxHoverLatchMissSince = 0;\n    return;\n  }\n  const now = Date.now();\n  if (!linuxHoverLatchMissSince) {\n    linuxHoverLatchMissSince = now;\n    return;\n  }\n  if (now - linuxHoverLatchMissSince < LINUX_HOVER_LATCH_MISS_MS) return;\n\n  linuxHoverLatchMissSince = 0;\n  const released = releaseOverlayOwnershipToDesktop("pointer left all widgets after interaction-key release");\n  if (!released) return;\n\n  // Click-through is restored before native focus handoff. Never synthesize a gameplay click.\n  setTimeout(() => {\n    if (overlayExclusiveInteractionActive()) return;\n    restoreLinuxPreviousWindow();\n    console.log("[linux-interaction] pointer left all widgets; overlay released and previous focus restored");\n  }, 35);\n}\n\nfunction startLinuxHoverScopedLatch() {\n  if (linuxHoverLatchTimer) return;\n  linuxHoverLatchTimer = setInterval(tickLinuxHoverScopedLatch, 32);\n  linuxHoverLatchTimer.unref?.();\n}\n\nfunction stopLinuxHoverScopedLatch() {\n  if (linuxHoverLatchTimer) clearInterval(linuxHoverLatchTimer);\n  linuxHoverLatchTimer = null;\n  linuxHoverLatchMissSince = 0;\n}\n\n${lifecycleAnchor}`;
  main = main.replace(lifecycleAnchor, policy);

  const startAnchor = 'function startLinuxDesktopFocusWatch() {\n  if (process.platform !== "linux" || linuxScLifecycleTimer) return;';
  const startReplacement = 'function startLinuxDesktopFocusWatch() {\n  if (process.platform !== "linux" || linuxScLifecycleTimer) return;\n  startLinuxHoverScopedLatch();';
  main = replaceOnce(main, startAnchor, startReplacement, 'policy startup hook');

  const stopAnchor = 'function stopLinuxDesktopFocusWatch() {\n  if (linuxScLifecycleTimer) clearInterval(linuxScLifecycleTimer);';
  const stopReplacement = 'function stopLinuxDesktopFocusWatch() {\n  stopLinuxHoverScopedLatch();\n  if (linuxScLifecycleTimer) clearInterval(linuxScLifecycleTimer);';
  main = replaceOnce(main, stopAnchor, stopReplacement, 'policy shutdown hook');
}

must(main.includes('ARCHVERSE_LINUX_HOVER_SCOPED_LATCH'), 'hover-scoped latch marker missing after enforcement');
must(main.includes('LINUX_HOVER_LATCH_MISS_MS = 90'), 'hover-latch debounce contract missing');
must(main.includes('pointer left all widgets; overlay released and previous focus restored'), 'focus-release diagnostic missing');
must(main.includes('restoreLinuxPreviousWindow()'), 'native focus restore path missing');

fs.writeFileSync(mainPath, main);
console.log('[native-linux-policy] hover-scoped interaction latch enforced');
