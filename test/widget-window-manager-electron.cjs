"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");
const { WidgetWindowManager } = require("../electron/widget-window-manager.cjs");

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "archverse-widget-preview-"));
const page = fs.readFileSync(path.join(__dirname, "../electron/widget-window-preview.html"));
const server = http.createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(page);
});

function listening() {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

(async () => {
  await listening();
  await app.whenReady();
  const port = server.address().port;
  const manager = new WidgetWindowManager({
    BrowserWindow,
    preloadPath: path.join(__dirname, "../electron/widget-window-preview-preload.cjs"),
    baseUrl: `http://127.0.0.1:${port}/`,
    platform: "linux",
    env: { SC_TRACKER_WIDGET_WINDOWS: "preview" },
    layoutPath: path.join(temporary, "layout.json"),
  });
  const win = manager.create({ id: "windowProbe", page: "widget-window-preview.html", bounds: { x: 20, y: 20, width: 360, height: 300 } });
  await new Promise((resolve, reject) => {
    win.webContents.once("did-finish-load", resolve);
    win.webContents.once("did-fail-load", (_event, code, description) => reject(new Error(`${code}: ${description}`)));
  });
  manager.show("windowProbe");
  assert.equal(manager.updateHeldPointer({ x: 30, y: 30 }, true), "windowProbe");
  assert.equal(manager.state("windowProbe").interactive, true);
  manager.updateHeldPointer(null, false);
  assert.equal(manager.state("windowProbe").interactive, false);
  manager.setArrangeMode(true);
  assert.equal(manager.resizeBy("windowProbe", 20, 20), true);
  manager.setArrangeMode(false);
  manager.closeAll();
  assert.equal(fs.existsSync(path.join(temporary, "layout.json")), true);
  console.log("widget-window Electron smoke test: passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  server.close(() => app.quit());
});
