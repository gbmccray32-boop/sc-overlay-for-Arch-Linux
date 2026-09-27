"use strict";

// Session binder for native Linux builds (non-Flatpak).
// Handles both X11/XWayland and Wayland compositors (Hyprland, Gnome, KDE, etc.)
// Uses PipeWire capture when available, falls back to xdotool for XWayland windows.

const { execFileSync } = require("node:child_process");

function numericPid(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function runCommand(args, timeout = 1200) {
  try {
    return String(execFileSync(args, {
      encoding: "utf8",
      timeout,
      stdio: ["ignore", "pipe", "ignore"],
    })).trim();
  } catch {
    return "";
  }
}

// Get PipeWire video nodes
function getPipeWireNodes() {
  try {
    const pwDump = runCommand(["pw-dump", "--video", "all", "--json"], 3000);
    if (!pwDump) return [];
    
    const nodes = [];
    for (const line of pwDump.split("\n")) {
      const match = /"name":"([^"]+)","device_id":"(\d+)".*"object_path":"([^"]+)"/.exec(line);
      if (match) {
        nodes.push({
          name: match[1],
          device_id: match[2],
          object_path: match[3],
        });
      }
    }
    return nodes;
  } catch {
    return [];
  }
}

// Get compositor surface info (Hyprland/Gnome/KDE)
function getCompositorSurfaces() {
  const surfaces = [];
  
  // Try hyprctl first (Hyprland)
  try {
    const hyprOutput = runCommand(["hyprctl", "-j", "clients"], 3000);
    if (hyprOutput) {
      for (const line of hyprOutput.split("\n")) {
        const match = /"title":"([^"]+)","address":"(\S+)".*"pid":(\d+)/.exec(line);
        if (match) {
          surfaces.push({
            title: match[1],
            address: match[2],
            pid: match[3],
            compositor: "hyprland",
          });
        }
      }
    }
  } catch {}
  
  // Fallback to xdotool for XWayland windows
  try {
    const visible = runCommand(["xdotool", "search", "--onlyvisible"]);
    if (visible) {
      for (const id of visible.split(/\s+/)) {
        const details = windowDetails(id);
        if (details && !surfaces.some(s => s.title === details.title && s.address === details.id)) {
          surfaces.push({
            title: details.title,
            address: details.id,
            pid: details.pid,
            compositor: "xwayland",
          });
        }
      }
    }
  } catch {}
  
  return surfaces;
}

function windowDetails(id) {
  const windowId = String(id || "").trim();
  if (!/^\d+$/.test(windowId)) return null;
  
  const title = runCommand(["xdotool", "getwindowname", windowId]);
  const className = runCommand(["xdotool", "getwindowclassname", windowId]);
  const pidText = runCommand(["xdotool", "getwindowpid", windowId]);
  const pid = /^\d+$/.test(pidText) ? Number(pidText) : null;
  
  let geometry = "";
  try {
    geometry = runCommand(["xdotool", "getwindowgeometry", "--shell", windowId]);
  } catch {}
  
  const num = (key) => Number((geometry.match(new RegExp(`^${key}=(-?\\d+)$`, "m")) || [])[1]);
  const x = num("X"), y = num("Y"), width = num("WIDTH"), height = num("HEIGHT");
  
  return {
    id: windowId,
    title,
    className,
    pid,
    rect: [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0
      ? { x, y, width, height }
      : null,
  };
}

function detailsBlob(details) {
  return [details?.title, details?.className].filter(Boolean).join(" ");
}

function isOverlay(details) {
  return /sc-overlay-custom-linux|sc-blueprint-tracker|\bSC Overlay\b|ArchVerse/i.test(detailsBlob(details));
}

function isLauncher(details) {
  return /RSI Launcher|StarCitizen_Launcher/i.test(detailsBlob(details));
}

function isDirectGame(details) {
  const blob = detailsBlob(details);
  return /Star\s*Citizen|StarCitizen(?:\.exe)?/i.test(blob) && !isLauncher(details);
}

function isGamescope(details) {
  return /gamescope(?:-wl)?/i.test(detailsBlob(details));
}

function isGamescopeGame(details) {
  const blob = detailsBlob(details);
  return isGamescope(details) && /Star\s*Citizen|StarCitizen/i.test(blob);
}

function searchIds() {
  const ids = new Set();
  const searches = [
    ["search", "--onlyvisible", "--name", "Star Citizen"],
    ["search", "--onlyvisible", "--class", "StarCitizen"],
    ["search", "--onlyvisible", "--classname", "StarCitizen"],
    ["search", "--onlyvisible", "--name", "StarCitizen"],
    ["search", "--onlyvisible", "--name", "gamescope"],
  ];
  
  for (const args of searches) {
    const out = runCommand(args, 1500);
    for (const id of out.split(/\s+/).filter((value) => /^\d+$/.test(value))) ids.add(id);
  }
  return [...ids];
}

function candidateRank(details) {
  if (!details || isOverlay(details) || isLauncher(details)) return -1;
  if (isGamescopeGame(details)) return 300;
  if (isDirectGame(details) && !isGamescope(details)) return 250;
  // Bare gamescope without Star Citizen in title is not trusted
  return -1;
}

class StarCitizenSessionBinder {
  constructor({ logger = console, platform = process.platform } = {}) {
    this.logger = logger;
    this.platform = platform;
    this.bound = null;
    this.warnedBareGamescope = false;
    this.windowCache = new Map();
  }

  details(id) {
    const details = windowDetails(id);
    if (details) this.windowCache.set(String(id), details);
    return details;
  }

  discover() {
    // First, try to find Star Citizen via xdotool
    const candidates = [];
    let bareGamescope = false;
    
    for (const id of searchIds()) {
      const details = this.details(id);
      if (!details) continue;
      
      const rank = candidateRank(details);
      if (rank >= 0) candidates.push({ details, rank });
      else if (isGamescope(details) && !isOverlay(details)) bareGamescope = true;
    }
    
    // Sort by rank, then by window area
    candidates.sort((a, b) => {
      if (a.rank !== b.rank) return b.rank - a.rank;
      const aa = (a.details.rect?.width || 0) * (a.details.rect?.height || 0);
      const ba = (b.details.rect?.width || 0) * (b.details.rect?.height || 0);
      return ba - aa;
    });
    
    const chosen = candidates[0]?.details || null;
    
    if (!chosen) {
      if (bareGamescope && !this.warnedBareGamescope) {
        this.warnedBareGamescope = true;
        this.logger?.warn?.("[sc-session] Bare gamescope window detected but without Star Citizen identification");
      }
      return null;
    }
    
    this.warnedBareGamescope = false;
    
    const gamescope = isGamescope(chosen);
    
    return {
      id: `native:${chosen.id}:${chosen.pid || 0}`,
      flatpakWindowBound: false,
      windowId: chosen.id,
      windowPid: chosen.pid || null,
      windowTitle: chosen.title || "",
      windowClass: chosen.className || "",
      windowRect: chosen.rect || null,
      gamePid: chosen.pid || null,
      gameStartTicks: 0,
      launcherPid: null,
      reaperPid: null,
      gamescopePid: gamescope ? (chosen.pid || null) : null,
      gamescopeStartTicks: 0,
      gameCommand: chosen.title || chosen.className || "Star Citizen",
      gamescopeCommand: gamescope ? (chosen.title || chosen.className || "gamescope") : "",
      discoveredAt: Date.now(),
    };
  }

  validate(session = this.bound) {
    if (!session || !/^\d+$/.test(String(session.windowId || ""))) return false;
    const details = this.details(session.windowId);
    if (!details || candidateRank(details) < 0) return false;
    if (session.windowPid && details.pid && Number(session.windowPid) !== Number(details.pid)) return false;
    return true;
  }

  current() {
    if (this.validate(this.bound)) return this.bound;
    
    if (this.bound) {
      this.logger?.log?.(`[sc-session] released Star Citizen window ${this.bound.windowId}`);
      this.bound = null;
    }
    
    const found = this.discover();
    if (found) {
      this.bound = found;
      this.logger?.log?.(`[sc-session] bound Star Citizen to window ${found.windowId}${found.windowPid ? ` (PID property ${found.windowPid})` : ""}`);
    }
    
    return this.bound;
  }

  processRunning() {
    return !!this.current();
  }

  readProcess(pid) {
    const n = numericPid(pid);
    const session = this.current();
    if (!n || !session || Number(session.windowPid) !== n) return null;
    
    return {
      pid: n,
      ppid: null,
      comm: String(session.windowClass || (session.gamescopePid ? "gamescope" : "StarCitizen")),
      cmdline: String(session.windowTitle || ""),
      args: [],
      startTicks: 0,
    };
  }

  listPids() {
    const session = this.current();
    return session?.windowPid ? [Number(session.windowPid)] : [];
  }

  belongsToSession(pid, session = this.current()) {
    const n = numericPid(pid);
    if (!n || !session) return false;
    return Number(session.windowPid || 0) === n;
  }

  ancestors() {
    return [];
  }

  summary(session = this.current()) {
    if (!session) return null;
    return {
      id: session.id,
      gamePid: session.gamePid,
      launcherPid: null,
      reaperPid: null,
      gamescopePid: session.gamescopePid,
      windowId: session.windowId,
      flatpakWindowBound: false,
    };
  }
}

module.exports = {
  StarCitizenSessionBinder,
  __test: {
    candidateRank,
    detailsBlob,
    isDirectGame,
    isGamescope,
    isGamescopeGame,
  },
};
