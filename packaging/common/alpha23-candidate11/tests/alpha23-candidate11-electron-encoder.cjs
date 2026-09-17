"use strict";
// Run under the packaged Electron binary with Xvfb. The field failure occurred in a real preload,
// while Candidate 10's encoder test ran only under Node.
const { app, BrowserWindow, ipcMain, nativeImage } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "archverse-electron-encoder-"));
const encoderPath = path.resolve(__dirname, "../app/electron/window-frame-encoder.cjs");
const preloadPath = path.join(testDir, "preload.cjs");
const pngPath = path.join(testDir, "frame.png");
fs.writeFileSync(path.join(testDir, "index.html"), "<!doctype html><title>Trusted local capture test</title>\n");
fs.writeFileSync(preloadPath, `
  const { ipcRenderer } = require("electron");
  const fs = require("node:fs");
  const { encodeWindowFrame } = require(${JSON.stringify(encoderPath)});
  try {
    const width = 3840, height = 1322;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let pixel = 0; pixel < width * height; pixel++) {
      const at = pixel * 4;
      pixels[at] = pixel % 256;
      pixels[at + 1] = (pixel * 3) % 256;
      pixels[at + 2] = (pixel * 7) % 256;
      pixels[at + 3] = 255;
    }
    const before = performance.now();
    const png = encodeWindowFrame(pixels, width, height);
    const elapsed = performance.now() - before;
    fs.writeFileSync(${JSON.stringify(pngPath)}, png);
    ipcRenderer.send("archverse-encoder-test", { elapsed, length: png.length, width, height });
  } catch (error) {
    ipcRenderer.send("archverse-encoder-test", { error: String(error?.stack || error) });
  }
`);

let finished = false;
function finish(error) {
  if (finished) return;
  finished = true;
  if (error) { console.error(error); process.exitCode = 1; }
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  app.quit();
}
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: {
    preload: preloadPath, contextIsolation: true, sandbox: false, webSecurity: true,
  } });
  window.webContents.on("render-process-gone", (_event, details) => finish(new Error(`renderer exited: ${details.reason}`)));
  ipcMain.once("archverse-encoder-test", (_event, result) => {
    try {
      if (result.error) throw new Error(result.error);
      const image = nativeImage.createFromPath(pngPath);
      assert.deepEqual(image.getSize(), { width: result.width, height: result.height });
      const bytes = image.toBitmap();
      for (const pixel of [0, 11, 100000, result.width * result.height - 1]) {
        const at = pixel * 4;
        assert.deepEqual([...bytes.subarray(at, at + 4)], [(pixel * 7) % 256, (pixel * 3) % 256, pixel % 256, 255]);
      }
      console.log(`Candidate 11 real Electron preload PNG: ${Math.round(result.elapsed)}ms, ${result.length} bytes, exact pixel samples`);
      finish();
    } catch (error) { finish(error); }
  });
  await window.loadFile(path.join(testDir, "index.html"));
  setTimeout(() => finish(new Error("real Electron preload did not return a frame")), 15000).unref?.();
}).catch(finish);
