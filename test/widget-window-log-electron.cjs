"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");

const candidate = path.resolve(process.env.ARCHVERSE_TEST_CANDIDATE || process.argv.at(-1) || "");
const port = Number(process.env.OVERLAY_PORT || 18778);
if (!candidate || !fs.existsSync(path.join(candidate, "app/electron/widget-window-manager.cjs"))) {
  throw new Error("usage: electron widget-window-log-electron.cjs <staged-candidate>");
}
const { WidgetWindowManager } = require(path.join(candidate, "app/electron/widget-window-manager.cjs"));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "archverse-log-window-"));

const waitFor = async (predicate, label) => {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for ${label}`);
};

(async () => {
  await app.whenReady();
  const manager = new WidgetWindowManager({
    BrowserWindow,
    preloadPath: path.join(candidate, "app/electron/widget-window-log-preload.cjs"),
    baseUrl: `http://127.0.0.1:${port}/missions.html`,
    platform: "linux",
    env: { SC_TRACKER_WIDGET_WINDOWS: "preview" },
    layoutPath: path.join(temporary, "layout.json"),
  });
  const owns = (event) => event?.sender === manager.get("logView")?.webContents;
  ipcMain.on("widget-window:ready", (event) => { if (owns(event)) manager.sendState("logView"); });
  ipcMain.on("widget-window:resize", (event, value) => {
    if (!owns(event) || !value || typeof value !== "object") return;
    const point = { x: Number(value.x), y: Number(value.y) };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    if (value.phase === "start") manager.beginResize("logView", point);
    else if (value.phase === "move") manager.resizeTo("logView", point);
    else if (value.phase === "end") manager.endResize("logView");
  });

  const win = manager.create({
    id: "logView",
    page: "logview.html",
    title: "Log",
    bounds: { x: 20, y: 20, width: 520, height: 420 },
  });
  await new Promise((resolve, reject) => {
    win.webContents.once("did-finish-load", resolve);
    win.webContents.once("did-fail-load", (_event, code, description) => reject(new Error(`${code}: ${description}`)));
  });
  manager.show("logView");
  assert.equal(await win.webContents.executeJavaScript("typeof window.archverseNativeWidget"), "object");
  assert.equal(await win.webContents.executeJavaScript("new URLSearchParams(location.hash.slice(1)).get('widgetId')"), "logView");
  assert.equal(await win.webContents.executeJavaScript("!!document.getElementById('archverse-native-widget-window')"), true);
  assert.equal(await win.webContents.executeJavaScript("document.body.classList.contains('native-window')"), true);
  assert.equal(manager.state("logView").contentActive, true, "Log is continuously active while shown");
  assert.equal(manager.state("logView").requestedVisible, true);

  await win.webContents.executeJavaScript("document.getElementById('pauseBtn').click()");
  assert.match(await win.webContents.executeJavaScript("document.getElementById('pauseBtn').textContent"), /Resume/);

  manager.setArrangeMode(true);
  await waitFor(
    () => win.webContents.executeJavaScript("document.documentElement.classList.contains('native-arrange')"),
    "native Log arrange state",
  );
  assert.equal(
    await win.webContents.executeJavaScript("getComputedStyle(document.querySelector('.archverse-native-resize-handle')).display"),
    "block",
  );
  assert.equal(manager.beginDrag("logView", { x: 30, y: 30 }), true);
  assert.equal(manager.dragTo("logView", { x: 60, y: 70 }), true);
  assert.equal(manager.endDrag("logView"), true);
  await win.webContents.executeJavaScript("window.archverseNativeWidget.resize('start', 100, 100)");
  await win.webContents.executeJavaScript("window.archverseNativeWidget.resize('move', 220, 180)");
  await waitFor(() => manager.bounds("logView").width === 640, "native Log resize IPC");
  await win.webContents.executeJavaScript("window.archverseNativeWidget.resize('end', 220, 180)");
  assert.deepEqual(manager.bounds("logView"), { x: 50, y: 60, width: 640, height: 500 });
  manager.setArrangeMode(false);
  await waitFor(
    async () => await win.webContents.executeJavaScript("getComputedStyle(document.querySelector('.archverse-native-resize-handle')).display") === "none",
    "native Log resize handle hide",
  );
  assert.equal(manager.state("logView").focusPolicy, "focusless-all-modes");

  manager.hide("logView");
  assert.equal(manager.state("logView").requestedVisible, false);
  assert.equal(manager.updateHeldPointer({ x: 40, y: 40 }, true), null, "hidden Log must not own held F");
  manager.updateHeldPointer(null, false);
  manager.closeAll();
  console.log("native Log Electron smoke test: passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  ipcMain.removeAllListeners("widget-window:ready");
  ipcMain.removeAllListeners("widget-window:resize");
  app.exit(process.exitCode || 0);
});
