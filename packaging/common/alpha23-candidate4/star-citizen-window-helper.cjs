"use strict";

// ARCHVERSE_ALPHA23_ISOLATED_WINDOW_CAPTURE_HELPER
// This is a separate Electron application. Slow KDE source discovery can block this process, but
// it cannot block ArchVerse input, scheduling, sidecar supervision, or the overlay renderer.

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { app, BrowserWindow, desktopCapturer, ipcMain } = require("electron");

const outputDirectory = path.resolve(process.argv[2] || "");
if (!outputDirectory) throw new Error("window capture helper requires an output directory");
fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.setPath("userData", path.join(outputDirectory, "electron-profile"));

let captureWindow = null;
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

ipcMain.on("archverse-window-stream:ready", (_event, message) => send({ type: "ready", ...message }));
ipcMain.on("archverse-window-stream:frame", (_event, message) => send({ type: "frame", ...message }));
ipcMain.on("archverse-window-stream:error", (_event, message) => {
  send({ type: "error", ...message });
  // id=0 is stream initialization failure. Exit so the parent can retry discovery after its
  // bounded backoff instead of leaving a permanently warming helper.
  if (Number(message?.id) === 0) setTimeout(() => app.exit(3), 25);
});

async function boot() {
  // Use a 1x1 thumbnail only to discover the exact Wine/XWayland source ID. All later frames come
  // from one MediaStream; desktopCapturer enumeration is never repeated in the ArchVerse process.
  const sources = await desktopCapturer.getSources({
    types: ["window"],
    thumbnailSize: { width: 1, height: 1 },
    fetchWindowIcons: false,
  });
  const source = sources.find((item) => /^Star\s*Citizen$/i.test(String(item.name || "").trim()));
  if (!source) throw new Error("exact Star Citizen Wine/XWayland source is unavailable");
  captureWindow = new BrowserWindow({
    show: false,
    width: 16,
    height: 16,
    webPreferences: {
      preload: path.join(__dirname, "star-citizen-window-preload.cjs"),
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  captureWindow.webContents.once("did-finish-load", () => {
    captureWindow.webContents.send("archverse-window-stream:init", {
      sourceId: source.id,
      sourceName: source.name,
      outputDirectory,
    });
  });
  await captureWindow.loadURL("data:text/html;charset=utf-8,<html><body></body></html>");
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  input.on("line", (line) => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message?.type === "capture" && Number.isFinite(Number(message.id))) {
      captureWindow?.webContents.send("archverse-window-stream:capture", { id: Number(message.id) });
    }
  });
}

app.whenReady().then(boot).catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  app.exit(2);
});
app.on("window-all-closed", () => app.quit());
process.on("SIGTERM", () => app.quit());
