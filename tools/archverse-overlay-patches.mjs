/** ArchVerse build-time overlay patches.
 *
 * High-churn upstream HTML remains authoritative. Linux additions are injected only into the
 * staged build output so upstream UI fixes can be accepted without maintaining page forks.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function must(cond, msg) {
  if (!cond) throw new Error(`ArchVerse overlay patch: ${msg}`);
}
function countOf(text, needle) { return text.split(needle).length - 1; }
function replaceOnce(text, from, to, label) {
  if (text.includes(to)) return text;
  const count = countOf(text, from);
  must(count === 1, `${label}: expected exactly one anchor, found ${count}`);
  return text.replace(from, to);
}
function rewrite(path, mutate) {
  const before = readFileSync(path, "utf8");
  const after = mutate(before);
  if (after === before) throw new Error(`ArchVerse patch made no change: ${path}`);
  writeFileSync(path, after, "utf8");
}
function appendScript(html, src, marker) {
  if (html.includes(marker)) return html;
  must(html.includes("</body>"), `cannot inject ${src}: </body> not found`);
  return html.replace("</body>", `  <!-- ${marker} -->\n  <script src="${src}"></script>\n</body>`);
}

function patchMissionInteractionRegions(html) {
  if (html.includes('ARCHVERSE_LINUX_DYNAMIC_WIDGET_REGIONS')) return html;
  // Keep upstream's carefully scoped hit-test list intact. In particular, its display-only OCR
  // guide boxes intentionally remain pointer-events:none and MUST NOT become giant click targets.
  // We add only an explicit opt-in selector for future Linux-only controls.
  let s = replaceOnce(
    html,
    'const RSEL = "body.scanbox #scanBox, body.boardbox #boardBox, body.payoutscan #payoutPanel, #panel, #globalCog, #hub, #cogMenu, #whatsnew, #setupNudge.show, #svcDown.show, #ocrWarn.show, #arrangeScrim .ab, #arrangeScrim .nudge, .widget:not(.notifier), .widget.notifier.live, .widget.notifier.moving, .widget.notifier.cfgopen, .widget:hover .whead, .widget.touched .whead, .widget.grouped .whead, #panel:hover .whead, #panel.touched .whead, #panel.grouped .whead";',
    'const RSEL = "body.scanbox #scanBox, body.boardbox #boardBox, body.payoutscan #payoutPanel, #panel, #globalCog, #hub, #cogMenu, #whatsnew, #setupNudge.show, #svcDown.show, #ocrWarn.show, #arrangeScrim .ab, #arrangeScrim .nudge, .widget:not(.notifier), .widget.notifier.live, .widget.notifier.moving, .widget.notifier.cfgopen, .widget:hover .whead, .widget.touched .whead, .widget.grouped .whead, #panel:hover .whead, #panel.touched .whead, #panel.grouped .whead, [data-archverse-interactive=\\"true\\"]"; // ARCHVERSE_LINUX_DYNAMIC_WIDGET_REGIONS',
    'mission interaction region selector',
  );
  s = replaceOnce(
    s,
    'setInterval(reportRegions, 100);\n      reportRegions();',
    `// Linux interaction ownership depends on these rectangles staying current while widgets\n      // expand, collapse, animate, calibrate or scroll. Upstream's periodic report remains the\n      // fallback; observers make state transitions immediate and do not change the wire format.\n      let regionFrame = 0;\n      const scheduleRegionReport = () => {\n        if (regionFrame) return;\n        regionFrame = requestAnimationFrame(() => { regionFrame = 0; reportRegions(); });\n      };\n      const regionMutationObserver = new MutationObserver(scheduleRegionReport);\n      regionMutationObserver.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });\n      window.addEventListener("resize", scheduleRegionReport, { passive: true });\n      document.addEventListener("scroll", scheduleRegionReport, { passive: true, capture: true });\n      document.addEventListener("transitionend", scheduleRegionReport, true);\n      if (typeof ResizeObserver === "function") {\n        const ro = new ResizeObserver(scheduleRegionReport);\n        const refreshObservedRegions = () => document.querySelectorAll(RSEL).forEach((el) => ro.observe(el));\n        refreshObservedRegions();\n        new MutationObserver(refreshObservedRegions).observe(document.documentElement, { subtree: true, childList: true });\n      }\n      window.__archverseClassifyOverlayPoint = (x, y) => {\n        const hit = Array.from(document.querySelectorAll(RSEL)).filter((el) => el.offsetParent !== null).find((el) => {\n          const r = el.getBoundingClientRect();\n          return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;\n        });\n        return { interactive: !!hit, selector: hit ? (hit.id ? "#" + hit.id : hit.className || hit.tagName) : null };\n      };\n      // Optional diagnostic bridge. Older verified Linux shells do not expose it, so this is a\n      // no-op there; when present it can prove that a physical point and renderer classification agree.\n      window.overlayApi?.onProbePoint?.((p) => {\n        const c = window.__archverseClassifyOverlayPoint(Number(p?.x) || 0, Number(p?.y) || 0);\n        window.overlayApi?.reportPointClassification?.({ ...p, ...c });\n      });\n      setInterval(reportRegions, 100);\n      reportRegions();`,
    'dynamic mission interaction region reporter',
  );
  return s;
}

function patchLinuxSettings(html) {
  if (html.includes('ARCHVERSE_LINUX_SETTINGS_CONTRACT')) return html;
  let s = html;
  s = replaceOnce(
    s,
    '  let cfg = { logPath: "" };',
    `  let cfg = { logPath: "" };\n  // ARCHVERSE_LINUX_SETTINGS_CONTRACT\n  const ARCHVERSE_LINUX_DESKTOP = () => cfg && cfg.platform === "linux";\n  function applyArchVerseLinuxSettings() {\n    if (!ARCHVERSE_LINUX_DESKTOP()) return;\n    setHotkeyDisplay("interact", "F");\n    const ib = document.getElementById("interactHotkeyBtn"); if (ib) ib.disabled = true;\n    const ic = document.getElementById("interactHotkeyClear"); if (ic) ic.style.display = "none";\n    const ih = document.getElementById("interactHotkeyHint"); if (ih) ih.textContent = "Linux keeps F as the permanent hold-to-interact key so the overlay cannot become unreachable.";\n    setHotkeyDisplay("move", "Shift+F6");\n    const mb = document.getElementById("moveHotkeyBtn"); if (mb) mb.disabled = true;\n    const mc = document.getElementById("moveHotkeyClear"); if (mc) mc.style.display = "none";\n    const mh = document.getElementById("moveHotkeyHint"); if (mh) mh.textContent = "Linux keeps Shift+F6 as the permanent arrange-mode key.";\n    const hold = document.getElementById("holdToInteract");\n    if (hold) { hold.checked = true; hold.disabled = true; hold.title = "Required by the ArchVerse Linux interaction contract"; }\n  }`,
    'Linux Settings helper',
  );

  s = replaceOnce(
    s,
    '    document.getElementById("holdToInteract").checked = !!cfg.holdToInteract;',
    '    document.getElementById("holdToInteract").checked = !!cfg.holdToInteract;\n    applyArchVerseLinuxSettings();',
    'Linux Settings load-time lock',
  );

  s = replaceOnce(
    s,
    '    const token = document.getElementById("syncToken").value.trim();',
    '    if (ARCHVERSE_LINUX_DESKTOP()) {\n      body.interactHotkey = "F";\n      body.holdToInteract = true;\n      body.moveHotkey = "Shift+F6";\n    }\n    const token = document.getElementById("syncToken").value.trim();',
    'Linux Settings save repair',
  );

  s = replaceOnce(
    s,
    '  async function clearHotkey(which) {',
    '  async function clearHotkey(which) {\n    if (ARCHVERSE_LINUX_DESKTOP() && (which === "interact" || which === "move")) return;',
    'Linux immutable hotkey clear guard',
  );
  s = replaceOnce(
    s,
    '  function startCaptureHotkey(which) {',
    '  function startCaptureHotkey(which) {\n    if (ARCHVERSE_LINUX_DESKTOP() && (which === "interact" || which === "move")) return;',
    'Linux immutable hotkey capture guard',
  );
  s = replaceOnce(
    s,
    '  function onHoldModeToggle() {\n    const on = document.getElementById("holdToInteract").checked;',
    '  function onHoldModeToggle() {\n    if (ARCHVERSE_LINUX_DESKTOP()) {\n      document.getElementById("holdToInteract").checked = true;\n      window.overlayConfig?.setHoldMode?.(true);\n      save();\n      return;\n    }\n    const on = document.getElementById("holdToInteract").checked;',
    'Linux hold-mode guard',
  );

  // The staged build is Linux-only; do not tell users its OCR is Windows OCR.
  s = s.replace(
    "Uses Windows' built-in text recognition, only while Star Citizen is focused. These two are for you — nothing leaves your PC.",
    "Uses ArchVerse's native Linux OCR pipeline only while Star Citizen is focused. These two are for you — nothing leaves your PC.",
  );

  must(s.includes('ARCHVERSE_LINUX_SETTINGS_CONTRACT'), 'Linux Settings marker missing');
  must(s.includes('body.interactHotkey = "F"'), 'Settings does not repair F');
  must(s.includes('body.moveHotkey = "Shift+F6"'), 'Settings does not repair Shift+F6');
  must(s.includes('body.holdToInteract = true'), 'Settings does not repair hold mode');
  return s;
}

export function applyArchVerseOverlayPatches(outDir) {
  const overlay = join(outDir, "overlay");

  rewrite(join(overlay, "missions.html"), (html) => {
    let next = html.replaceAll("Mining Scanner", "Resource Scanner");
    next = patchMissionInteractionRegions(next);
    next = appendScript(next, "/archverse-widget-appearance.js", "ARCHVERSE_WIDGET_APPEARANCE_V1");
    return next;
  });

  rewrite(join(overlay, "mining.html"), (html) => {
    let next = html.replaceAll("Mining Scanner", "Resource Scanner");
    next = next.replaceAll("Mining assistant ready", "Resource scanner ready");
    next = appendScript(next, "/archverse-resource-scanner.js", "ARCHVERSE_RESOURCE_SCANNER_V1");
    return next;
  });

  rewrite(join(overlay, "config.html"), (html) => {
    let next = html.replaceAll("Mining Scanner", "Resource Scanner").replaceAll("Mining Assistant", "Resource Scanner");
    next = patchLinuxSettings(next);
    return next;
  });

  console.log("applied ArchVerse Resource Scanner, Linux Settings and dynamic interaction-region patches");
}
