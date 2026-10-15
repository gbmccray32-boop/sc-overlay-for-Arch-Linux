"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");

const candidate = path.resolve(process.env.ARCHVERSE_TEST_CANDIDATE || process.argv.at(-1) || "");
const port = Number(process.env.OVERLAY_PORT || 18778);
if (!candidate || !fs.existsSync(path.join(candidate, "app/electron/widget-window-manager.cjs"))) {
  throw new Error("usage: electron widget-window-bindingchart-electron.cjs <staged-candidate>");
}
const { WidgetWindowManager } = require(path.join(candidate, "app/electron/widget-window-manager.cjs"));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "archverse-binding-window-"));

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
  const owns = (event) => event?.sender === manager.get("bindingChart")?.webContents;
  let appearance = { text: 1, dim: 1, dimText: 1, hoverFull: true };
  let picked = 0;
  ipcMain.on("widget-window:ready", (event) => { if (owns(event)) manager.sendState("bindingChart"); });
  ipcMain.on("widget-window:summon-cog", () => {});
  ipcMain.handle("widget-window:menu-state", (event) => owns(event) ? appearance : null);
  ipcMain.handle("widget-window:update-appearance", (event, value) => {
    if (!owns(event) || !value || typeof value !== "object") return null;
    appearance = { ...appearance, ...value };
    return appearance;
  });
  ipcMain.handle("widget-window:menu-action", (event) => owns(event) ? appearance : null);
  ipcMain.handle("widget-window:binding-pick-png", (event) => {
    if (!owns(event)) return null;
    picked += 1;
    return "/tmp/archverse-binding-test.png";
  });
  ipcMain.on("widget-window:resize", (event, value) => {
    if (!owns(event) || !value || typeof value !== "object") return;
    const point = { x: Number(value.x), y: Number(value.y) };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    if (value.phase === "start") manager.beginResize("bindingChart", point);
    else if (value.phase === "move") manager.resizeTo("bindingChart", point);
    else if (value.phase === "end") manager.endResize("bindingChart");
  });

  const win = manager.create({
    id: "bindingChart",
    page: "bindingwidget.html",
    title: "Infographic Viewer",
    preloadPath: path.join(candidate, "app/electron/widget-window-bindingchart-preload.cjs"),
    bounds: { x: 40, y: 40, width: 620, height: 340 },
  });
  await new Promise((resolve, reject) => {
    win.webContents.once("did-finish-load", resolve);
    win.webContents.once("did-fail-load", (_event, code, description) => reject(new Error(`${code}: ${description}`)));
  });
  manager.show("bindingChart");
  assert.equal(await win.webContents.executeJavaScript("typeof window.archverseNativeWidget"), "object");
  assert.equal(await win.webContents.executeJavaScript("new URLSearchParams(location.hash.slice(1)).get('widgetId')"), "bindingChart");
  assert.equal(await win.webContents.executeJavaScript("document.body.classList.contains('native-window')"), true);
  assert.equal(await win.webContents.executeJavaScript("!!document.querySelector('.archverse-native-menu-button')"), true);
  assert.equal(manager.state("bindingChart").contentActive, true);

  await win.webContents.executeJavaScript("document.getElementById('oneBtn').click()");
  assert.equal(await win.webContents.executeJavaScript("document.getElementById('wrap').classList.contains('actual')"), true);
  await win.webContents.executeJavaScript("document.getElementById('fitBtn').click()");
  assert.equal(await win.webContents.executeJavaScript("document.getElementById('wrap').classList.contains('fit')"), true);
  await win.webContents.executeJavaScript("document.getElementById('pickBtn').click()");
  await waitFor(() => picked === 1, "sender-validated PNG picker bridge");

  await win.webContents.executeJavaScript("document.querySelector('.archverse-native-menu-button').click()");
  await win.webContents.executeJavaScript("document.querySelector('[data-native-text=\"0.1\"]').click()");
  await waitFor(() => appearance.text === 1.1, "independent Infographic Viewer appearance");

  manager.setArrangeMode(true);
  await waitFor(
    () => win.webContents.executeJavaScript("document.documentElement.classList.contains('native-arrange')"),
    "Infographic Viewer arrange state",
  );
  await win.webContents.executeJavaScript("window.archverseNativeWidget.resize('start', 100, 100)");
  await win.webContents.executeJavaScript("window.archverseNativeWidget.resize('move', 180, 160)");
  await waitFor(() => manager.bounds("bindingChart").width === 700, "Infographic Viewer resize IPC");
  await win.webContents.executeJavaScript("window.archverseNativeWidget.resize('end', 180, 160)");
  manager.setArrangeMode(false);
  assert.deepEqual(manager.bounds("bindingChart"), { x: 40, y: 40, width: 700, height: 400 });
  assert.equal(manager.state("bindingChart").focusPolicy, "focusless-all-modes");

  manager.hide("bindingChart");
  assert.equal(manager.updateHeldPointer({ x: 50, y: 50 }, true), null, "hidden Infographic Viewer must not own held F");
  manager.updateHeldPointer(null, false);
  manager.closeAll();
  console.log("native Infographic Viewer Electron smoke test: passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  ipcMain.removeAllListeners("widget-window:ready");
  ipcMain.removeAllListeners("widget-window:summon-cog");
  ipcMain.removeAllListeners("widget-window:resize");
  ipcMain.removeHandler("widget-window:menu-state");
  ipcMain.removeHandler("widget-window:update-appearance");
  ipcMain.removeHandler("widget-window:menu-action");
  ipcMain.removeHandler("widget-window:binding-pick-png");
  app.exit(process.exitCode || 0);
});
