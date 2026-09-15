"use strict";

// ARCHVERSE_ALPHA23_ISOLATED_WINDOW_CAPTURE_HELPER
// This separate Electron application owns the normal-launch portal session and MediaStream. Slow
// KDE source selection cannot block ArchVerse input, scheduling, or the overlay renderer.

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { app, BrowserWindow, desktopCapturer, ipcMain } = require("electron");

const outputDirectory = path.resolve(process.argv[2] || "");
const targetWindowId = /^\d+$/.test(String(process.argv[3] || "")) ? String(process.argv[3]) : "";
if (!outputDirectory) throw new Error("window capture helper requires an output directory");
fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
// The overlay stays on X11/XWayland for its proven input contract. Only this isolated helper uses
// native Wayland so Chromium routes window capture through the XDG ScreenCast portal and PipeWire.
const hostWaylandDisplay = String(process.env.SC_TRACKER_HOST_WAYLAND_DISPLAY || process.env.WAYLAND_DISPLAY || "");
if (hostWaylandDisplay) {
  process.env.WAYLAND_DISPLAY = hostWaylandDisplay;
  process.env.XDG_SESSION_TYPE = "wayland";
  delete process.env.ELECTRON_OZONE_PLATFORM_HINT;
  app.commandLine.appendSwitch("ozone-platform", "wayland");
  app.commandLine.appendSwitch("enable-features", "WebRTCPipeWireCapturer");
}
const configDirectory = String(process.env.SC_TRACKER_CONFIG_DIR || "").trim();
const portalProfileDirectory = configDirectory
  ? path.join(path.resolve(configDirectory), "portal-capture-profile")
  : path.join(outputDirectory, "electron-profile");
fs.mkdirSync(portalProfileDirectory, { recursive: true, mode: 0o700 });
// A stable profile lets Chromium and the desktop portal retain their permitted session state.
app.setPath("userData", portalProfileDirectory);

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
  captureWindow.webContents.session.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      // Wayland delegates this WINDOW request to the XDG portal and returns one user-approved
      // PipeWire source. X11 enumerates windows, where the bound XID selects Star Citizen exactly.
      const sources = await desktopCapturer.getSources({
        types: ["window"],
        thumbnailSize: { width: 1, height: 1 },
        fetchWindowIcons: false,
      });
      const source = (targetWindowId
        ? sources.find((item) => String(item.id || "").startsWith(`window:${targetWindowId}:`))
        : null) || sources.find((item) => /^Star\s*Citizen$/i.test(String(item.name || "").trim()));
      if (!source) {
        const inventory = sources.slice(0, 12).map((item) => ({
          id: String(item.id || "").slice(0, 96),
          name: String(item.name || "").replace(/[\r\n]+/g, " ").slice(0, 96),
        }));
        throw new Error(`select the Star Citizen window; targetWindowId=${targetWindowId || "none"}; sources=${JSON.stringify(inventory)}`);
      }
      callback({ video: source });
    } catch (error) {
      send({ type: "error", id: 0, error: String(error?.message || error) });
      callback({});
    }
  });
  captureWindow.webContents.once("did-finish-load", () => {
    captureWindow.webContents.send("archverse-window-stream:init", {
      outputDirectory,
      transport: hostWaylandDisplay ? "portal-pipewire-window" : "electron-x11-window-stream",
    });
  });
  await captureWindow.loadURL("data:text/html;charset=utf-8,<html><body><p>Choose the Star Citizen window for ArchVerse capture.</p></body></html>");
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
