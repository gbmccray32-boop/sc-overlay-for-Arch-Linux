"use strict";

const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const { getStarCitizenSessionBinder } = require("./star-citizen-session.cjs");

function parseProcessEnvironment(raw) {
  const values = {};
  for (const entry of Buffer.from(raw || "").toString("utf8").split("\0")) {
    const splitAt = entry.indexOf("=");
    if (splitAt <= 0) continue;
    values[entry.slice(0, splitAt)] = entry.slice(splitAt + 1);
  }
  return values;
}

function shellNumber(text, key) {
  const match = String(text || "").match(new RegExp(`^${key}=(-?\\d+)$`, "m"));
  return match ? Number(match[1]) : NaN;
}

function parseNestedPointer(pointerText, geometryText) {
  const x = shellNumber(pointerText, "X");
  const y = shellNumber(pointerText, "Y");
  const width = shellNumber(geometryText, "WIDTH");
  const height = shellNumber(geometryText, "HEIGHT");
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function mapNestedPointerToCanvas(pointer, canvas) {
  if (!pointer || !canvas) return null;
  const x = Number(pointer.x), y = Number(pointer.y);
  const sourceWidth = Number(pointer.width), sourceHeight = Number(pointer.height);
  const canvasX = Number(canvas.x), canvasY = Number(canvas.y);
  const canvasWidth = Number(canvas.width), canvasHeight = Number(canvas.height);
  if (![x, y, sourceWidth, sourceHeight, canvasX, canvasY, canvasWidth, canvasHeight].every(Number.isFinite)
      || sourceWidth <= 0 || sourceHeight <= 0 || canvasWidth <= 0 || canvasHeight <= 0) return null;
  const localX = Math.max(0, Math.min(sourceWidth - 1, x));
  const localY = Math.max(0, Math.min(sourceHeight - 1, y));
  return {
    x: Math.max(canvasX, Math.min(canvasX + canvasWidth - 1, Math.round(canvasX + (localX * canvasWidth / sourceWidth)))),
    y: Math.max(canvasY, Math.min(canvasY + canvasHeight - 1, Math.round(canvasY + (localY * canvasHeight / sourceHeight)))),
  };
}

class LinuxFocusController {
  constructor({ logger = console, platform = process.platform, sessionBinder = null, commandRunner = execFileSync, fileReader = fs.readFileSync } = {}) {
    this.logger = logger;
    this.platform = platform;
    this.sessionBinder = sessionBinder || getStarCitizenSessionBinder({ logger, platform });
    this.commandRunner = commandRunner;
    this.fileReader = fileReader;
    this.restoreWindowId = null;
    this.gamescopePointerContext = null;
    this.gamescopePointerRetryAt = 0;
    this.gamescopePointerFailureSession = null;
  }



  pointerLocation() {
    if (this.platform !== "linux") return null;
    try {
      const out = String(execFileSync("xdotool", ["getmouselocation", "--shell"], { encoding: "utf8", timeout: 1200, stdio: ["ignore", "pipe", "ignore"] }));
      const x = Number((out.match(/^X=(-?\d+)/m) || [])[1]);
      const y = Number((out.match(/^Y=(-?\d+)/m) || [])[1]);
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    } catch { return null; }
  }

  resolveGamescopePointerContext(session) {
    // A normal Wine/XWayland process also exposes DISPLAY, but that display is the host desktop.
    // Scaling its coordinates as a nested Gamescope canvas moves the interaction point and can
    // focus ArchVerse while the user is interacting with Star Citizen. Gamescope ancestry is the
    // authority for nested pointer mapping, just as it is for direct Gamescope capture.
    const gamescopePid = Number(session?.gamescopePid);
    if (!Number.isInteger(gamescopePid) || gamescopePid <= 0) return null;
    if (this.gamescopePointerContext?.sessionId === session.id) return this.gamescopePointerContext;
    if (Date.now() < this.gamescopePointerRetryAt) return null;

    const pids = [...new Set([session.gamePid, session.launcherPid, session.reaperPid]
      .map(Number).filter((pid) => Number.isInteger(pid) && pid > 0))];
    for (const pid of pids) {
      try {
        const procEnv = parseProcessEnvironment(this.fileReader(`/proc/${pid}/environ`));
        if (!procEnv.DISPLAY) continue;
        const nestedEnv = { ...process.env, DISPLAY: procEnv.DISPLAY };
        if (procEnv.XAUTHORITY) nestedEnv.XAUTHORITY = procEnv.XAUTHORITY;
        else delete nestedEnv.XAUTHORITY;
        if (procEnv.XDG_RUNTIME_DIR) nestedEnv.XDG_RUNTIME_DIR = procEnv.XDG_RUNTIME_DIR;
        const geometryText = String(this.commandRunner("xdotool", ["getdisplaygeometry", "--shell"], {
          encoding: "utf8", timeout: 1200, stdio: ["ignore", "pipe", "ignore"], env: nestedEnv,
        }));
        const width = shellNumber(geometryText, "WIDTH");
        const height = shellNumber(geometryText, "HEIGHT");
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) continue;
        this.gamescopePointerContext = {
          sessionId: session.id, pid, display: procEnv.DISPLAY, env: nestedEnv,
          geometryText, width, height,
        };
        this.gamescopePointerFailureSession = null;
        this.logger?.log?.(`[gamescope-pointer] using Star Citizen DISPLAY ${procEnv.DISPLAY} from PID ${pid} (${width}x${height})`);
        return this.gamescopePointerContext;
      } catch {}
    }
    this.gamescopePointerContext = null;
    this.gamescopePointerRetryAt = Date.now() + 1000;
    if (this.gamescopePointerFailureSession !== session.id) {
      this.gamescopePointerFailureSession = session.id;
      this.logger?.warn?.(`[gamescope-pointer] nested DISPLAY unavailable for Star Citizen PID ${session.gamePid}; using host pointer fallbacks`);
    }
    return null;
  }

  gamescopePointerLocation() {
    if (this.platform !== "linux") return null;
    const session = this.starCitizenSession();
    if (!session) {
      this.gamescopePointerContext = null;
      return null;
    }
    if (!Number.isInteger(Number(session.gamescopePid)) || Number(session.gamescopePid) <= 0) {
      // Clear a prior nested-display cache when the next Star Citizen launch is normal. Never let
      // a stale Gamescope coordinate domain cross the session boundary.
      this.gamescopePointerContext = null;
      this.gamescopePointerRetryAt = 0;
      this.gamescopePointerFailureSession = null;
      return null;
    }
    const context = this.resolveGamescopePointerContext(session);
    if (!context) return null;
    try {
      const pointerText = String(this.commandRunner("xdotool", ["getmouselocation", "--shell"], {
        encoding: "utf8", timeout: 1200, stdio: ["ignore", "pipe", "ignore"], env: context.env,
      }));
      const point = parseNestedPointer(pointerText, context.geometryText);
      return point ? { ...point, display: context.display, gamePid: session.gamePid } : null;
    } catch {
      this.gamescopePointerContext = null;
      this.gamescopePointerRetryAt = Date.now() + 250;
      return null;
    }
  }

  moveHostPointer(point) {
    if (this.platform !== "linux" || !point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return false;
    try {
      this.commandRunner("xdotool", ["mousemove", "--sync", "--", String(Math.round(Number(point.x))), String(Math.round(Number(point.y)))], {
        encoding: "utf8", timeout: 1200, stdio: ["ignore", "ignore", "ignore"], env: process.env,
      });
      return true;
    } catch { return false; }
  }

  activeWindowDetails() {
    if (this.platform !== "linux") return null;
    try {
      const id = String(execFileSync("xdotool", ["getactivewindow"], { encoding: "utf8", timeout: 1200, stdio: ["ignore", "pipe", "ignore"] })).trim();
      if (!/^\d+$/.test(id)) return null;
      const read = (args) => {
        try { return String(execFileSync("xdotool", args, { encoding: "utf8", timeout: 1200, stdio: ["ignore", "pipe", "ignore"] })).trim(); }
        catch { return ""; }
      };
      const title = read(["getwindowname", id]);
      const className = read(["getwindowclassname", id]);
      const pidText = read(["getwindowpid", id]);
      const pid = /^\d+$/.test(pidText) ? Number(pidText) : null;
      let cmdline = "";
      let comm = "";
      if (pid) {
        try { cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " "); } catch {}
        try { comm = fs.readFileSync(`/proc/${pid}/comm`, "utf8").trim(); } catch {}
      }
      return { id, title, className, pid, cmdline, comm };
    } catch { return null; }
  }

  detailsForWindowId(id) {
    if (this.platform !== "linux" || !/^\d+$/.test(String(id || ""))) return null;
    try {
      const read = (args) => {
        try { return String(execFileSync("xdotool", args, { encoding: "utf8", timeout: 1200, stdio: ["ignore", "pipe", "ignore"] })).trim(); }
        catch { return ""; }
      };
      const windowId = String(id);
      const title = read(["getwindowname", windowId]);
      const className = read(["getwindowclassname", windowId]);
      const pidText = read(["getwindowpid", windowId]);
      const pid = /^\d+$/.test(pidText) ? Number(pidText) : null;
      let cmdline = "";
      let comm = "";
      if (pid) {
        try { cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " "); } catch {}
        try { comm = fs.readFileSync(`/proc/${pid}/comm`, "utf8").trim(); } catch {}
      }
      return { id: windowId, title, className, pid, cmdline, comm };
    } catch { return null; }
  }

  detailsBlob(details) {
    return [details?.title, details?.className, details?.comm, details?.cmdline].filter(Boolean).join(" ");
  }

  isOwnOverlayWindow(details) {
    const blob = this.detailsBlob(details);
    return /sc-overlay-custom-linux|sc-blueprint-tracker|\bSC Overlay\b/i.test(blob);
  }

  starCitizenSession() {
    if (this.platform !== "linux") return null;
    return this.sessionBinder.current();
  }

  starCitizenProcessRunning() {
    return !!this.starCitizenSession();
  }

  activeBelongsToSession(details, session = this.starCitizenSession()) {
    if (!details || !session) return false;
    if (details.pid && this.sessionBinder.belongsToSession(details.pid, session)) return true;
    const blob = this.detailsBlob(details);
    // KWin can expose the Gamescope title/subtitle without a PID. Require both identities so a
    // browser tab merely mentioning Star Citizen cannot become the focus/capture target.
    return !details.pid && /gamescope(?:-wl)?/i.test(blob) && /Star\s*Citizen|StarCitizen/i.test(blob);
  }

  findStarCitizenWindowId() {
    if (this.platform !== "linux") return null;
    const session = this.starCitizenSession();
    if (!session) return null;
    const ownId = this.activeWindowDetails()?.id || null;
    const candidates = new Set();
    const searches = [
      ["search", "--onlyvisible", "--name", "Star Citizen"],
      ["search", "--onlyvisible", "--class", "StarCitizen"],
      ["search", "--onlyvisible", "--classname", "StarCitizen"],
      ["search", "--onlyvisible", "--class", "gamescope"],
      ["search", "--onlyvisible", "--name", "gamescope"],
    ];
    for (const args of searches) {
      try {
        const out = String(execFileSync("xdotool", args, { encoding: "utf8", timeout: 1500, stdio: ["ignore", "pipe", "ignore"] }));
        for (const id of out.split(/\s+/).filter((v) => /^\d+$/.test(v))) candidates.add(id);
      } catch {}
    }

    for (const id of candidates) {
      if (id === ownId) continue;
      const d = this.detailsForWindowId(id);
      if (!d || this.isOwnOverlayWindow(d)) continue;
      const blob = this.detailsBlob(d);
      if (/rsi launcher/i.test(blob)) continue;
      if (this.activeBelongsToSession(d, session)) return id;
    }
    return null;
  }

  isStarCitizenDirectlyActive() {
    const session = this.starCitizenSession();
    const d = this.activeWindowDetails();
    if (!session || !d || this.isOwnOverlayWindow(d)) return false;
    const blob = this.detailsBlob(d);
    if (/rsi launcher/i.test(blob)) return false;
    return this.activeBelongsToSession(d, session);
  }

  isStarCitizenActive() {
    const session = this.starCitizenSession();
    if (!session) return false;
    const d = this.activeWindowDetails();
    // A native Gamescope/Wayland surface can leave XWayland without a queryable active-window ID.
    // The exact PID-bound process tree is still alive, so this anonymous case is the game surface.
    if (!d) return true;
    const blob = this.detailsBlob(d);
    if (/rsi launcher/i.test(blob)) return false;
    if (this.activeBelongsToSession(d, session)) return true;
    // KWin can report our always-on-top XWayland overlay while Star Citizen remains underneath.
    if (this.isOwnOverlayWindow(d)) return true;
    if (!blob.trim()) return true;
    return false;
  }

  captureActiveWindow() {
    if (this.platform !== "linux") return;
    try {
      const active = this.activeWindowDetails();
      // Do not save the overlay itself as the restoration target. When KWin reports the toolbar
      // as active while Star Citizen is underneath, locate the visible game/Gamescope window.
      if (active && this.isOwnOverlayWindow(active) && this.starCitizenProcessRunning()) {
        const gameId = this.findStarCitizenWindowId();
        if (gameId) this.restoreWindowId = gameId;
        // Keep an earlier valid external target when window search is temporarily unavailable.
        return;
      }
      this.restoreWindowId = active && /^\d+$/.test(String(active.id || "")) ? String(active.id) : null;
    } catch { this.restoreWindowId = null; }
  }

  x11WindowId(win) {
    if (this.platform !== "linux" || !win || win.isDestroyed()) return null;
    try { const m = String(win.getMediaSourceId()).match(/^window:(\d+):/); return m ? m[1] : null; } catch { return null; }
  }

  focus(win) {
    if (!win || win.isDestroyed()) return;
    const focusNow = () => {
      if (!win || win.isDestroyed()) return;
      try { win.show(); } catch {}
      try { win.focus(); } catch {}
      try { win.webContents.focus(); } catch {}
      try { win.moveTop(); } catch {}
    };
    focusNow();
    if (this.platform === "linux") {
      const force = () => {
        const id = this.x11WindowId(win); if (!id) return;
        try { const child = spawn("xdotool", ["windowactivate", "--sync", id], { detached: true, stdio: "ignore" }); child.unref(); } catch {}
      };
      setTimeout(() => { focusNow(); force(); }, 60);
      setTimeout(focusNow, 250);
    }
  }

  restore() {
    if (this.platform !== "linux" || !this.restoreWindowId) return;
    const id = this.restoreWindowId; this.restoreWindowId = null;
    try { const child = spawn("xdotool", ["windowactivate", "--sync", id], { detached: true, stdio: "ignore" }); child.unref(); } catch {}
  }
}

module.exports = {
  LinuxFocusController,
  mapNestedPointerToCanvas,
  __test: { parseProcessEnvironment, parseNestedPointer, mapNestedPointerToCanvas },
};
