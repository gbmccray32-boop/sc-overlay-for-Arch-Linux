"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");

const candidate = path.resolve(process.argv[2] || "");
const port = Number(process.env.OVERLAY_PORT || 18778);
if (!candidate || !fs.existsSync(path.join(candidate, "app/electron/widget-window-manager.cjs"))) {
  throw new Error("usage: electron widget-window-scfeed-electron.cjs <staged-candidate>");
}
const { WidgetWindowManager } = require(path.join(candidate, "app/electron/widget-window-manager.cjs"));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "archverse-scfeed-window-"));

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
    preloadPath: path.join(candidate, "app/electron/widget-window-scfeed-preload.cjs"),
    baseUrl: `http://127.0.0.1:${port}/missions.html`,
    platform: "linux",
    env: { SC_TRACKER_WIDGET_WINDOWS: "preview" },
    layoutPath: path.join(temporary, "layout.json"),
  });
  const owns = (event) => event?.sender === manager.get("scFeed")?.webContents;
  ipcMain.on("widget-window:ready", (event) => { if (owns(event)) manager.sendState("scFeed"); });
  ipcMain.on("widget-window:active", (event, on) => { if (owns(event)) manager.setContentActive("scFeed", on === true); });

  const win = manager.create({
    id: "scFeed",
    page: "scfeed.html",
    title: "SC Feed",
    notifier: true,
    bounds: { x: 20, y: 20, width: 340, height: 140 },
  });
  await new Promise((resolve, reject) => {
    win.webContents.once("did-finish-load", resolve);
    win.webContents.once("did-fail-load", (_event, code, description) => reject(new Error(`${code}: ${description}`)));
  });
  assert.equal(await win.webContents.executeJavaScript("typeof window.archverseNativeWidget"), "object");
  assert.equal(await win.webContents.executeJavaScript("new URLSearchParams(location.search).get('widgetId')"), "scFeed");
  assert.equal(await win.webContents.executeJavaScript("!!document.getElementById('archverse-native-widget-window')"), true);
  assert.equal(manager.state("scFeed").contentActive, false, "an idle notifier starts outside native hit testing");

  manager.setArrangeMode(true);
  await waitFor(
    () => win.webContents.executeJavaScript("document.documentElement.classList.contains('native-arrange') && document.getElementById('card').classList.contains('show')"),
    "native SC Feed arrange preview",
  );
  await waitFor(() => manager.state("scFeed").contentActive === true, "native SC Feed active IPC");
  assert.equal(manager.beginDrag("scFeed", { x: 30, y: 30 }), true);
  assert.equal(manager.dragTo("scFeed", { x: 60, y: 70 }), true);
  assert.equal(manager.endDrag("scFeed"), true);
  manager.setArrangeMode(false);
  manager.closeAll();
  console.log("native SC Feed Electron smoke test: passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  ipcMain.removeAllListeners("widget-window:ready");
  ipcMain.removeAllListeners("widget-window:active");
  app.quit();
});
