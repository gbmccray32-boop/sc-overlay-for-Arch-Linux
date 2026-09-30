const mustReplace = (source, before, after, label) => {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one anchor, found ${count}`);
  return source.replace(before, after);
};

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
  main = mustReplace(
    main,
    "// What the shell believes about the displays and where it actually put the window. Posted to the",
    `// ARCHVERSE_WIDGET_WINDOW_PREVIEW_RUNTIME\nlet widgetWindowPreviewIpcReady = false;\nfunction registerWidgetWindowPreviewIpc() {\n  if (widgetWindowPreviewIpcReady) return;\n  widgetWindowPreviewIpcReady = true;\n  const ownsSender = (event) => event?.sender === widgetWindowPreview?.get(\"windowProbe\")?.webContents;\n  ipcMain.on(\"widget-window-preview:ready\", (event) => {\n    if (ownsSender(event)) widgetWindowPreview.sendState(\"windowProbe\");\n  });\n  ipcMain.on(\"widget-window-preview:action\", (event, action) => {\n    if (!ownsSender(event)) return;\n    if (action === \"grow\") widgetWindowPreview.resizeBy(\"windowProbe\", 40, 30);\n    else if (action === \"shrink\") widgetWindowPreview.resizeBy(\"windowProbe\", -40, -30);\n    else if (action === \"reset\") widgetWindowPreview.resetBounds(\"windowProbe\");\n    else if (action === \"done\") setMoveMode(false);\n    else if (action === \"clicked\") console.log(\"[widget-window] held-F interaction test clicked\");\n  });\n}\nfunction createWidgetWindowPreview() {\n  if (widgetWindowPreview) return widgetWindowPreview.enabled();\n  widgetWindowPreview = new WidgetWindowManager({\n    BrowserWindow,\n    preloadPath: path.join(__dirname, \"widget-window-preview-preload.cjs\"),\n    baseUrl: pathToFileURL(__dirname + path.sep).toString(),\n    platform: process.platform,\n    env: process.env,\n    logger: console,\n    layoutPath: path.join(CONFIG_DIR, \"widget-window-preview.json\"),\n  });\n  if (!widgetWindowPreview.enabled()) return false;\n  registerWidgetWindowPreviewIpc();\n  const zone = centeredDefaultZone();\n  const win = widgetWindowPreview.create({\n    id: \"windowProbe\", page: \"widget-window-preview.html\", title: \"Native widget probe\",\n    bounds: { x: zone.x + Math.max(24, zone.width - 400), y: zone.y + 80, width: 360, height: 300 },\n  });\n  win?.webContents?.once(\"did-finish-load\", () => {\n    widgetWindowPreview.show(\"windowProbe\");\n    widgetWindowPreview.sendState(\"windowProbe\");\n  });\n  console.log(\"[widget-window] diagnostic preview enabled; production widgets remain on the canvas\");\n  return true;\n}\n\n// What the shell believes about the displays and where it actually put the window. Posted to the`,
    "widget preview runtime",
  );
  main = mustReplace(
    main,
    "  reportGeometry();\n}\n// ARCHVERSE_WIDGET_WINDOW_PREVIEW_RUNTIME",
    "  reportGeometry();\n  widgetWindowPreview?.sendState(\"windowProbe\");\n}\n// ARCHVERSE_WIDGET_WINDOW_PREVIEW_RUNTIME",
    "display refit preview update",
  );
  main = mustReplace(
    main,
    "function updateFHoverHit() {\n  if (!fHoverHeld || !overlay || overlay.isDestroyed()) return;",
    "function updateFHoverHit() {\n  if (!fHoverHeld || !overlay || overlay.isDestroyed()) return;",
    "held-F update anchor",
  );
  main = mustReplace(
    main,
    "  if (lastGlobalPointer) {\n    const canvas = fullDisplayBounds();",
    "  const previewHit = widgetWindowPreview?.updateHeldPointer(lastGlobalPointer, true);\n  if (previewHit) {\n    if (fHoverPointerPhase !== \"host\") {\n      overlayWindows.moveHostPointer?.(lastGlobalPointer);\n      fHoverPointerPhase = \"host\";\n      fHoverHostHookAuthoritative = false;\n      resetFHoverHostHandoff();\n      console.log(\"[widget-window] held-F pointer transferred to native probe\");\n    }\n    applyFHoverClassification(false, null, \"native-widget-preview\");\n    return;\n  }\n  if (lastGlobalPointer) {\n    const canvas = fullDisplayBounds();",
    "held-F preview classification",
  );
  main = mustReplace(
    main,
    "    fHoverHeld = false;\n    browserController?.setInteractionKeyHeld(false);",
    "    fHoverHeld = false;\n    widgetWindowPreview?.updateHeldPointer(null, false);\n    browserController?.setInteractionKeyHeld(false);",
    "held-F preview release",
  );
  main = mustReplace(
    main,
    "  moveMode = on;\n  if (LINUX_HARD_CLICK_THROUGH) {",
    "  moveMode = on;\n  widgetWindowPreview?.setArrangeMode(moveMode);\n  if (LINUX_HARD_CLICK_THROUGH) {",
    "arrange preview integration",
  );
  main = mustReplace(
    main,
    "    overlayEnabled = readOverlayEnabled();",
    "    createWidgetWindowPreview();\n    overlayEnabled = readOverlayEnabled();",
    "preview startup",
  );
  main = mustReplace(
    main,
    "    hotkeys.unregisterAll();\n    if (process.platform === \"win32\") foreground.stop();",
    "    hotkeys.unregisterAll();\n    widgetWindowPreview?.closeAll();\n    if (process.platform === \"win32\") foreground.stop();",
    "preview shutdown",
  );
  return main;
}
