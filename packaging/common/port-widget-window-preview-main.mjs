const mustReplace = (source, before, after, label) => {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one anchor, found ${count}`);
  return source.replace(before, after);
};

const previewRuntime = `// ARCHVERSE_WIDGET_WINDOW_PREVIEW_RUNTIME
let widgetWindowPreviewIpcReady = false;
let widgetWindowPreviewPointerTimer = null;
let widgetWindowPreviewArrangeToggleAt = 0;
function nativeLogPreviewRequested() {
  return process.platform === "linux" && process.env.SC_TRACKER_WIDGET_WINDOWS === "preview";
}
function stopWidgetWindowPreviewPointerOperation() {
  if (widgetWindowPreviewPointerTimer) clearInterval(widgetWindowPreviewPointerTimer);
  widgetWindowPreviewPointerTimer = null;
}
function startWidgetWindowPreviewDrag(id, point) {
  if (!widgetWindowPreview.beginDrag(id, point)) return;
  stopWidgetWindowPreviewPointerOperation();
  widgetWindowPreviewPointerTimer = setInterval(() => {
    try {
      const cursor = screen.getCursorScreenPoint();
      if (cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y)) {
        widgetWindowPreview.dragTo(id, cursor);
      }
    } catch {}
  }, 16);
  widgetWindowPreviewPointerTimer.unref?.();
}
function endWidgetWindowPreviewDrag(id) {
  stopWidgetWindowPreviewPointerOperation();
  widgetWindowPreview.endDrag(id);
}
function startWidgetWindowPreviewResize(id, point) {
  if (!widgetWindowPreview.beginResize(id, point)) return;
  stopWidgetWindowPreviewPointerOperation();
  widgetWindowPreviewPointerTimer = setInterval(() => {
    try {
      const cursor = screen.getCursorScreenPoint();
      if (cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y)) {
        widgetWindowPreview.resizeTo(id, cursor);
      }
    } catch {}
  }, 16);
  widgetWindowPreviewPointerTimer.unref?.();
}
function endWidgetWindowPreviewResize(id) {
  stopWidgetWindowPreviewPointerOperation();
  widgetWindowPreview.endResize(id);
}
function registerWidgetWindowPreviewIpc() {
  if (widgetWindowPreviewIpcReady) return;
  widgetWindowPreviewIpcReady = true;
  const ownsSender = (event, id) => event?.sender === widgetWindowPreview?.get(id)?.webContents;
  ipcMain.on("widget-window:ready", (event) => {
    if (ownsSender(event, "logView")) widgetWindowPreview.sendState("logView");
  });
  ipcMain.on("widget-window:typing-requested", (event) => {
    if (ownsSender(event, "logView")) {
      console.log("[widget-window] Log filter typing deferred; focusless Preview 6 remains read-only");
    }
  });
  ipcMain.on("widget-window:typing-ended", (event) => {
    if (ownsSender(event, "logView")) widgetWindowPreview.sendState("logView");
  });
  ipcMain.on("widget-window:drag", (event, value) => {
    if (!ownsSender(event, "logView") || !value || typeof value !== "object") return;
    const point = { x: Number(value.x), y: Number(value.y) };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    if (value.phase === "start") startWidgetWindowPreviewDrag("logView", point);
    else if (value.phase === "move") widgetWindowPreview.dragTo("logView", point);
    else if (value.phase === "end") endWidgetWindowPreviewDrag("logView");
  });
  ipcMain.on("widget-window:resize", (event, value) => {
    if (!ownsSender(event, "logView") || !value || typeof value !== "object") return;
    const point = { x: Number(value.x), y: Number(value.y) };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    if (value.phase === "start") startWidgetWindowPreviewResize("logView", point);
    else if (value.phase === "move") widgetWindowPreview.resizeTo("logView", point);
    else if (value.phase === "end") endWidgetWindowPreviewResize("logView");
  });
}
function ensureNativeLogWindow() {
  if (!widgetWindowPreview?.enabled()) return null;
  const existing = widgetWindowPreview.get("logView");
  if (existing && !existing.isDestroyed?.()) return existing;
  const zone = centeredDefaultZone();
  const win = widgetWindowPreview.create({
    id: "logView", page: "logview.html", title: "Log",
    bounds: { x: zone.x + 40, y: zone.y + 60, width: 520, height: 420 },
  });
  win?.webContents?.once("did-finish-load", () => {
    if (logViewVisible) widgetWindowPreview.show("logView");
    widgetWindowPreview.sendState("logView");
    console.log("[widget-window] native Log loaded; canvas copy disabled; filter typing remains deferred");
  });
  return win;
}
function syncNativeLogWindow(on) {
  if (!nativeLogPreviewRequested() || !widgetWindowPreview?.enabled()) return false;
  if (on) {
    ensureNativeLogWindow();
    widgetWindowPreview.show("logView");
  } else {
    widgetWindowPreview.hide("logView");
  }
  return true;
}
function createWidgetWindowPreview() {
  if (widgetWindowPreview) return widgetWindowPreview.enabled();
  widgetWindowPreview = new WidgetWindowManager({
    BrowserWindow,
    preloadPath: path.join(__dirname, "widget-window-log-preload.cjs"),
    baseUrl: HUD_URL,
    platform: process.platform,
    env: process.env,
    logger: console,
    layoutPath: path.join(CONFIG_DIR, "widget-window-preview.json"),
  });
  if (!widgetWindowPreview.enabled()) return false;
  registerWidgetWindowPreviewIpc();
  console.log("[widget-window] Log native-window preview enabled; all other widgets remain on the canvas");
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
    "let relockTimer = null; // Linux safety: automatically restore click-through after temporary interaction\nlet widgetWindowPreview = null; // ARCHVERSE_WIDGET_WINDOW_PREVIEW: opt-in Log migration",
    "widget preview state",
  );
  main = mustReplace(main, "// What the shell believes about the displays and where it actually put the window. Posted to the", previewRuntime, "widget preview runtime");
  main = mustReplace(
    main,
    "  reportGeometry();\n}\n// ARCHVERSE_WIDGET_WINDOW_PREVIEW_RUNTIME",
    "  reportGeometry();\n  widgetWindowPreview?.sendState(\"logView\");\n}\n// ARCHVERSE_WIDGET_WINDOW_PREVIEW_RUNTIME",
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
    'function sendLogViewVisible(state) { try { overlay?.webContents.send("overlay:logView-visible", state); } catch {} }',
    'function sendLogViewVisible(state) {\n  const on = state?.on === true;\n  if (nativeLogPreviewRequested()) {\n    try { overlay?.webContents.send("overlay:logView-visible", { on: false, nativeWindow: true }); } catch {}\n    syncNativeLogWindow(on);\n    return;\n  }\n  try { overlay?.webContents.send("overlay:logView-visible", state); } catch {}\n}',
    "native Log visibility routing",
  );
  main = mustReplace(
    main,
    "  moveMode = on;\n  if (LINUX_HARD_CLICK_THROUGH) {",
    `  moveMode = on;
  if (!moveMode) stopWidgetWindowPreviewPointerOperation();
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
    "    hotkeys.unregisterAll();\n    stopWidgetWindowPreviewPointerOperation();\n    widgetWindowPreview?.closeAll();\n    if (process.platform === \"win32\") foreground.stop();",
    "preview shutdown",
  );
  return main;
}
