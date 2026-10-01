const mustReplace = (source, before, after, label) => {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one anchor, found ${count}`);
  return source.replace(before, after);
};

const previewRuntime = `// ARCHVERSE_WIDGET_WINDOW_PREVIEW_RUNTIME
let widgetWindowPreviewIpcReady = false;
let widgetWindowPreviewDragTimer = null;
let widgetWindowPreviewArrangeToggleAt = 0;
function nativeScFeedPreviewRequested() {
  return process.platform === "linux" && process.env.SC_TRACKER_WIDGET_WINDOWS === "preview";
}
function stopWidgetWindowPreviewDrag() {
  if (widgetWindowPreviewDragTimer) clearInterval(widgetWindowPreviewDragTimer);
  widgetWindowPreviewDragTimer = null;
}
function startWidgetWindowPreviewDrag(id, point) {
  stopWidgetWindowPreviewDrag();
  if (!widgetWindowPreview.beginDrag(id, point)) return;
  widgetWindowPreviewDragTimer = setInterval(() => {
    try {
      const cursor = screen.getCursorScreenPoint();
      if (cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y)) {
        widgetWindowPreview.dragTo(id, cursor);
      }
    } catch {}
  }, 16);
  widgetWindowPreviewDragTimer.unref?.();
}
function endWidgetWindowPreviewDrag(id) {
  stopWidgetWindowPreviewDrag();
  widgetWindowPreview.endDrag(id);
}
function registerWidgetWindowPreviewIpc() {
  if (widgetWindowPreviewIpcReady) return;
  widgetWindowPreviewIpcReady = true;
  const ownsSender = (event, id) => event?.sender === widgetWindowPreview?.get(id)?.webContents;
  ipcMain.on("widget-window:ready", (event) => {
    if (ownsSender(event, "scFeed")) widgetWindowPreview.sendState("scFeed");
  });
  ipcMain.on("widget-window:active", (event, on) => {
    if (ownsSender(event, "scFeed")) widgetWindowPreview.setContentActive("scFeed", on === true);
  });
  ipcMain.on("widget-window:open-url", (event, url) => {
    if (ownsSender(event, "scFeed") && typeof url === "string" && /^https:\\/\\//i.test(url)) {
      shell.openExternal(url).catch(() => {});
    }
  });
  ipcMain.on("widget-window:drag", (event, value) => {
    if (!ownsSender(event, "scFeed") || !value || typeof value !== "object") return;
    const point = { x: Number(value.x), y: Number(value.y) };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    if (value.phase === "start") startWidgetWindowPreviewDrag("scFeed", point);
    else if (value.phase === "move") widgetWindowPreview.dragTo("scFeed", point);
    else if (value.phase === "end") endWidgetWindowPreviewDrag("scFeed");
  });
}
function ensureNativeScFeedWindow() {
  if (!widgetWindowPreview?.enabled()) return null;
  const existing = widgetWindowPreview.get("scFeed");
  if (existing && !existing.isDestroyed?.()) return existing;
  const zone = centeredDefaultZone();
  const win = widgetWindowPreview.create({
    id: "scFeed", page: "scfeed.html", title: "SC Feed", notifier: true,
    bounds: { x: zone.x + Math.max(24, zone.width - 380), y: zone.y + 80, width: 340, height: 140 },
  });
  win?.webContents?.once("did-finish-load", () => {
    if (scFeedVisible) widgetWindowPreview.show("scFeed");
    widgetWindowPreview.sendState("scFeed");
    console.log("[widget-window] native SC Feed loaded; canvas copy disabled");
  });
  return win;
}
function syncNativeScFeedWindow(on) {
  if (!nativeScFeedPreviewRequested() || !widgetWindowPreview?.enabled()) return false;
  if (on) {
    ensureNativeScFeedWindow();
    widgetWindowPreview.show("scFeed");
  } else {
    widgetWindowPreview.hide("scFeed");
  }
  return true;
}
function createWidgetWindowPreview() {
  if (widgetWindowPreview) return widgetWindowPreview.enabled();
  widgetWindowPreview = new WidgetWindowManager({
    BrowserWindow,
    preloadPath: path.join(__dirname, "widget-window-scfeed-preload.cjs"),
    baseUrl: HUD_URL,
    platform: process.platform,
    env: process.env,
    logger: console,
    layoutPath: path.join(CONFIG_DIR, "widget-window-preview.json"),
  });
  if (!widgetWindowPreview.enabled()) return false;
  registerWidgetWindowPreviewIpc();
  console.log("[widget-window] SC Feed native-window preview enabled; all other widgets remain on the canvas");
  return true;
}

// What the shell believes about the displays and where it actually put the window. Posted to the`;

const previewHeldF = `  let nativePreviewPoint = null;
  try {
    const p = screen.getCursorScreenPoint();
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) nativePreviewPoint = { x: p.x, y: p.y };
  } catch {}
  const previewHit = widgetWindowPreview?.updateHeldPointer(nativePreviewPoint, true);
  if (previewHit) {
    if (fHoverPointerPhase !== "host") {
      overlayWindows.moveHostPointer?.(nativePreviewPoint);
      fHoverPointerPhase = "host";
      fHoverHostHookAuthoritative = false;
      resetFHoverHostHandoff();
      console.log(\`[widget-window] held-F native widget hit id=\${previewHit} at \${nativePreviewPoint.x},\${nativePreviewPoint.y}; focus remains with Star Citizen\`);
    }
    applyFHoverClassification(false, null, "native-widget-preview");
    return;
  }
  if (lastGlobalPointer) {
    const canvas = fullDisplayBounds();`;

export function portWidgetWindowPreviewMain(input) {
  let main = input;
  main = mustReplace(
    main,
    'const { OverlayWindowManager } = require("./window-manager.cjs");',
    'const { OverlayWindowManager } = require("./window-manager.cjs");\nconst { WidgetWindowManager } = require("./widget-window-manager.cjs"); // ARCHVERSE_WIDGET_WINDOW_PREVIEW',
    "widget window manager import",
  );
  main = mustReplace(
    main,
    "let relockTimer = null; // Linux safety: automatically restore click-through after temporary interaction",
    "let relockTimer = null; // Linux safety: automatically restore click-through after temporary interaction\nlet widgetWindowPreview = null; // ARCHVERSE_WIDGET_WINDOW_PREVIEW: opt-in SC Feed migration",
    "widget preview state",
  );
  main = mustReplace(main, "// What the shell believes about the displays and where it actually put the window. Posted to the", previewRuntime, "widget preview runtime");
  main = mustReplace(
    main,
    "  reportGeometry();\n}\n// ARCHVERSE_WIDGET_WINDOW_PREVIEW_RUNTIME",
    "  reportGeometry();\n  widgetWindowPreview?.sendState(\"scFeed\");\n}\n// ARCHVERSE_WIDGET_WINDOW_PREVIEW_RUNTIME",
    "display refit preview update",
  );
  main = mustReplace(main, "  if (lastGlobalPointer) {\n    const canvas = fullDisplayBounds();", previewHeldF, "held-F preview classification");
  main = mustReplace(
    main,
    'function applyFHoverClassification(next, target = null, source = "regions") {\n  next = !!(fHoverHeld && !fHoverSuppressedUntilRelease && next);',
    'function applyFHoverClassification(next, target = null, source = "regions") {\n  if (widgetWindowPreview?.heldInteractionId()) { next = false; target = null; }\n  next = !!(fHoverHeld && !fHoverSuppressedUntilRelease && next);',
    "native latch excludes canvas classification",
  );
  main = mustReplace(
    main,
    "    fHoverHeld = false;\n    browserController?.setInteractionKeyHeld(false);",
    "    fHoverHeld = false;\n    widgetWindowPreview?.updateHeldPointer(null, false);\n    browserController?.setInteractionKeyHeld(false);",
    "held-F preview release",
  );
  main = mustReplace(
    main,
    '// SC Feed news notifier.\nfunction sendScFeedVisible(state) { try { overlay?.webContents.send("overlay:scfeed-visible", state); } catch {} }',
    '// SC Feed news notifier. Preview mode migrates only SC Feed and explicitly disables its Canvas copy.\nfunction sendScFeedVisible(state) {\n  const on = state?.on === true;\n  if (nativeScFeedPreviewRequested()) {\n    try { overlay?.webContents.send("overlay:scfeed-visible", { on: false, nativeWindow: true }); } catch {}\n    syncNativeScFeedWindow(on);\n    return;\n  }\n  try { overlay?.webContents.send("overlay:scfeed-visible", state); } catch {}\n}',
    "native SC Feed visibility routing",
  );
  main = mustReplace(
    main,
    "  moveMode = on;\n  if (LINUX_HARD_CLICK_THROUGH) {",
    `  moveMode = on;
  widgetWindowPreview?.setArrangeMode(moveMode);
  if (widgetWindowPreview?.enabled()) {
    locked = true;
    applyMouse();
    reapplyOverlayInputShape();
    try { overlay?.webContents.send("overlay:move-mode", false); } catch {}
    applyOverlayOpacity();
    refreshTray();
    console.log(\`[widget-window] preview-only arrange mode \${moveMode ? "enabled" : "disabled"}; canvas focus unchanged\`);
    return;
  }
  if (LINUX_HARD_CLICK_THROUGH) {`,
    "arrange preview integration",
  );
  main = mustReplace(
    main,
    "function toggleMove() { setMoveMode(!moveMode); }",
    `function toggleMove() {
  if (widgetWindowPreview?.enabled()) {
    const now = Date.now();
    if (now - widgetWindowPreviewArrangeToggleAt < 250) {
      console.log("[widget-window] ignored duplicate Shift+F6 arrange transition");
      return;
    }
    widgetWindowPreviewArrangeToggleAt = now;
  }
  setMoveMode(!moveMode);
}`,
    "preview arrange debounce",
  );
  main = mustReplace(main, "    overlayEnabled = readOverlayEnabled();", "    createWidgetWindowPreview();\n    overlayEnabled = readOverlayEnabled();", "preview startup");
  main = mustReplace(
    main,
    "    hotkeys.unregisterAll();\n    if (process.platform === \"win32\") foreground.stop();",
    "    hotkeys.unregisterAll();\n    stopWidgetWindowPreviewDrag();\n    widgetWindowPreview?.closeAll();\n    if (process.platform === \"win32\") foreground.stop();",
    "preview shutdown",
  );
  return main;
}
