const mustReplace = (source, before, after, label) => {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one anchor, found ${count}`);
  return source.replace(before, after);
};

const previewRuntime = `// ARCHVERSE_WIDGET_WINDOW_PREVIEW_RUNTIME
let widgetWindowPreviewIpcReady = false;
let widgetWindowPreviewDragTimer = null;
let widgetWindowPreviewArrangeToggleAt = 0;
function stopWidgetWindowPreviewDrag() {
  if (widgetWindowPreviewDragTimer) clearInterval(widgetWindowPreviewDragTimer);
  widgetWindowPreviewDragTimer = null;
}
function startWidgetWindowPreviewDrag(point) {
  stopWidgetWindowPreviewDrag();
  if (!widgetWindowPreview.beginDrag("windowProbe", point)) return;
  widgetWindowPreviewDragTimer = setInterval(() => {
    try {
      const cursor = screen.getCursorScreenPoint();
      if (cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y)) {
        widgetWindowPreview.dragTo("windowProbe", cursor);
      }
    } catch {}
  }, 16);
  widgetWindowPreviewDragTimer.unref?.();
}
function endWidgetWindowPreviewDrag() {
  stopWidgetWindowPreviewDrag();
  widgetWindowPreview.endDrag("windowProbe");
}
function registerWidgetWindowPreviewIpc() {
  if (widgetWindowPreviewIpcReady) return;
  widgetWindowPreviewIpcReady = true;
  const ownsSender = (event) => event?.sender === widgetWindowPreview?.get("windowProbe")?.webContents;
  ipcMain.on("widget-window-preview:ready", (event) => {
    if (ownsSender(event)) widgetWindowPreview.sendState("windowProbe");
  });
  ipcMain.on("widget-window-preview:action", (event, action) => {
    if (!ownsSender(event)) return;
    if (action === "grow") widgetWindowPreview.resizeBy("windowProbe", 40, 30);
    else if (action === "shrink") widgetWindowPreview.resizeBy("windowProbe", -40, -30);
    else if (action === "reset") widgetWindowPreview.resetBounds("windowProbe");
    else if (action === "done") setMoveMode(false);
    else if (action === "clicked") console.log("[widget-window] held-F interaction test clicked");
  });
  ipcMain.on("widget-window-preview:drag", (event, value) => {
    if (!ownsSender(event) || !value || typeof value !== "object") return;
    const point = { x: Number(value.x), y: Number(value.y) };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    if (value.phase === "start") startWidgetWindowPreviewDrag(point);
    else if (value.phase === "move") widgetWindowPreview.dragTo("windowProbe", point);
    else if (value.phase === "end") endWidgetWindowPreviewDrag();
  });
}
function createWidgetWindowPreview() {
  if (widgetWindowPreview) return widgetWindowPreview.enabled();
  widgetWindowPreview = new WidgetWindowManager({
    BrowserWindow,
    preloadPath: path.join(__dirname, "widget-window-preview-preload.cjs"),
    baseUrl: pathToFileURL(__dirname + path.sep).toString(),
    platform: process.platform,
    env: process.env,
    logger: console,
    layoutPath: path.join(CONFIG_DIR, "widget-window-preview.json"),
  });
  if (!widgetWindowPreview.enabled()) return false;
  registerWidgetWindowPreviewIpc();
  const zone = centeredDefaultZone();
  const win = widgetWindowPreview.create({
    id: "windowProbe", page: "widget-window-preview.html", title: "Native widget probe",
    bounds: { x: zone.x + Math.max(24, zone.width - 400), y: zone.y + 80, width: 360, height: 300 },
  });
  win?.webContents?.once("did-finish-load", () => {
    widgetWindowPreview.show("windowProbe");
    widgetWindowPreview.sendState("windowProbe");
  });
  console.log("[widget-window] diagnostic preview enabled; production widgets remain on the canvas");
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
      console.log(\`[widget-window] held-F native probe hit at \${nativePreviewPoint.x},\${nativePreviewPoint.y}; focus remains with Star Citizen\`);
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
    'const { OverlayWindowManager } = require("./window-manager.cjs");\nconst { WidgetWindowManager } = require("./widget-window-manager.cjs"); // ARCHVERSE_WIDGET_WINDOW_PREVIEW\nconst { pathToFileURL } = require("node:url");',
    "widget window manager import",
  );
  main = mustReplace(
    main,
    "let relockTimer = null; // Linux safety: automatically restore click-through after temporary interaction",
    "let relockTimer = null; // Linux safety: automatically restore click-through after temporary interaction\nlet widgetWindowPreview = null; // ARCHVERSE_WIDGET_WINDOW_PREVIEW: opt-in diagnostic only",
    "widget preview state",
  );
  main = mustReplace(main, "// What the shell believes about the displays and where it actually put the window. Posted to the", previewRuntime, "widget preview runtime");
  main = mustReplace(
    main,
    "  reportGeometry();\n}\n// ARCHVERSE_WIDGET_WINDOW_PREVIEW_RUNTIME",
    "  reportGeometry();\n  widgetWindowPreview?.sendState(\"windowProbe\");\n}\n// ARCHVERSE_WIDGET_WINDOW_PREVIEW_RUNTIME",
    "display refit preview update",
  );
  main = mustReplace(main, "  if (lastGlobalPointer) {\n    const canvas = fullDisplayBounds();", previewHeldF, "held-F preview classification");
  main = mustReplace(
    main,
    "    fHoverHeld = false;\n    browserController?.setInteractionKeyHeld(false);",
    "    fHoverHeld = false;\n    widgetWindowPreview?.updateHeldPointer(null, false);\n    browserController?.setInteractionKeyHeld(false);",
    "held-F preview release",
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
