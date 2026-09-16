// Fabricator screen-capture loop (opt-in).
// ARCHVERSE_ALPHA22_PERFORMANCE_REPAIR
//
// On a low-frequency poll, and ONLY while Star Citizen is the FOREGROUND window
// (privacy: we never capture/OCR any other app), grab a full screenshot and ask the
// sidecar's /api/screen-read to OCR it. If the fabricator is showing an item we don't
// have a capture for yet, crop its render and save it locally; a later step uploads
// these to subliminal.gg. A tracked-mission read is logged for the picker wiring.
//
// This runs only in the Electron main process (needs desktopCapturer + nativeImage).

const { desktopCapturer, screen, nativeImage } = require("electron");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { getStarCitizenSessionBinder } = require("./linux/star-citizen-session.cjs");
const { createRapidOcrClient } = require("./rapidocr-client.cjs");
const { detectScanModeRadarIcon } = require("./scan-mode-gate.cjs");
const { classifyMiningSignature, miningSignatureLabel } = require("./mining-signature-catalog.cjs"); // ARCHVERSE_LINUX_MINING_SIGNATURE_CATALOG_V1
const { createMiningVehiclePresenceClient } = require("./mining-vehicle-presence.cjs"); // ARCHVERSE_LINUX_MINING_VEHICLE_PRESENCE_LIVENESS
const { createMiningResultTransport, classifyMiningOcrLines } = require("./mining-result-transport.cjs"); // ARCHVERSE_LINUX_MINING_RESULT_TRANSPORT_V1
const { createLinuxOcrBackend, regionFor: linuxOcrRegion, regionPixels: linuxOcrRegionPixels, normalizedRegions: normalizedLinuxOcrRegions } = require("./native-linux-ocr.cjs"); // ARCHVERSE_LINUX_OCR_CONTRACT_V1
const { createPersistentGamescopePipeWireCapture } = require("./persistent-gamescope-pipewire.cjs"); // ARCHVERSE_LINUX_GAMESCOPE_PIPEWIRE_CAPTURE
const { createPersistentStarCitizenWindowCapture } = require("./persistent-star-citizen-window.cjs"); // ARCHVERSE_ALPHA23_ISOLATED_WINDOW_CAPTURE
const { createMiningSignatureConfirmation } = require("./mining-signature-confirmation.cjs"); // ARCHVERSE_ALPHA23_DISTINCT_FRAME_CONFIRMATION
const { parseDisplayInfoLines, locationCropGeometry } = require("./location-sync-v3.cjs"); // ARCHVERSE_LOCATION_SYNC_V3
const { normalCanvasDisplayCrop } = require("./normal-canvas-geometry.cjs"); // ARCHVERSE_ALPHA23_NORMAL_CANVAS_GEOMETRY
const { createExactX11Capture } = require("./exact-x11-capture.cjs");
const { readBars, pixelsOf } = require("./rep-bars.cjs"); // ARCHVERSE_ALPHA23_REP_SCAN_PIXELS

const scSession = getStarCitizenSessionBinder(); // ARCHVERSE_LINUX_EXACT_SC_SESSION_BINDING
const rapidOcrClient = createRapidOcrClient({ logger: console });
let _lastOcrCaptureInfo = null;
const gamescopePipeWire = createPersistentGamescopePipeWireCapture({ logger: console }); // ARCHVERSE_LINUX_GAMESCOPE_PIPEWIRE_PERSISTENT_STREAM
const starCitizenWindow = createPersistentStarCitizenWindowCapture({ logger: console });
const exactX11Capture = createExactX11Capture({
  run: runFile, decode: (file) => nativeImage.createFromPath(file),
  remove: (file) => { try { fs.unlinkSync(file); } catch {} },
});
process.once("exit", () => { rapidOcrClient.close(); gamescopePipeWire.close?.(); starCitizenWindow.close?.(); });

const POLL_MS = 3000;
// Ore scanning is a live feedback loop — you scan a rock and want to hear what it is NOW — so the
// loop speeds up while the scan HUD is actually on screen, then falls back. Sub, 2026-07-29:
// "while I'm scanning for ore I want it to be as fast as possible", but explicitly NOT at the
// fabricator, where rushing risks capturing a half-loaded render.
// ARCHVERSE_ALPHA23_MINING_SUBSECOND_CADENCE
// A recognized/locked RS is sampled every 600ms; in-vehicle acquisition is sampled every 800ms.
// The latest-frame scheduler remains single-flight, so a slow backend cannot overlap itself.
const FAST_MS = 350;
const MINING_CONFIRM_MS = 250;
// How long a sighting of the scan HUD keeps the loop fast. Comfortably longer than the gap
// between scans, so a scanning session doesn't drop back to 3s between rocks.
const FAST_WINDOW_MS = 20000;
// ARCHVERSE_LINUX_GAMELOG_VEHICLE_MINING_CADENCE
// Mining no longer infers Scan Mode from a HUD icon. The sidecar's existing Game.log watcher tells
// us whether the player is aboard a ship / controlling a ground vehicle. While aboard, the tiny RS
// crop runs at a bounded cadence; on foot Mining OCR is dormant.
const MINING_VEHICLE_IDLE_MS = 500;
const VEHICLE_PRESENCE_CACHE_MS = 500;
// The kiosk render fades in over ~1-2s. This is the wait the 3s tick was implicitly giving it.
const SETTLE_MS = 3000;

// Return the FOREGROUND window's process name AND its screen rectangle. The rect lets us capture
// the monitor the game is actually on (not a blind sources[0]) — critical on multi-monitor rigs.
const fgPs1 = path.join(os.tmpdir(), "sc-fgwin.ps1");
let fgPs1Written = false;
function writeFgPs1() {
  if (fgPs1Written) return;
  fs.writeFileSync(fgPs1, [
    'Add-Type @"',
    "using System;using System.Runtime.InteropServices;",
    "public class FGW{",
    ' [DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();',
    ' [DllImport("user32.dll")]public static extern int GetWindowThreadProcessId(IntPtr h,out int pid);',
    " [StructLayout(LayoutKind.Sequential)]public struct RECT{public int Left,Top,Right,Bottom;}",
    ' [DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr h,out RECT r);',
    "}",
    '"@',
    "$h=[FGW]::GetForegroundWindow();$procId=0;[void][FGW]::GetWindowThreadProcessId($h,[ref]$procId)",
    "$r=New-Object FGW+RECT;[void][FGW]::GetWindowRect($h,[ref]$r)",
    "$n=try{(Get-Process -Id $procId -ErrorAction Stop).ProcessName}catch{''}",
    'Write-Output ("$n|$($r.Left)|$($r.Top)|$([int]($r.Right-$r.Left))|$([int]($r.Bottom-$r.Top))")',
  ].join("\n"));
  fgPs1Written = true;
}
function cleanX11Field(value) {
  const text = String(value || "").trim();
  return /^(?:\(?null\)?|WM_CLASS:\s*not found\.?|[^:]+:\s*not found\.?)$/i.test(text) ? "" : text;
}

// Bind each launch to the exact StarCitizen.exe PID and /proc start time. When Gamescope remains
// in the ancestor chain it is validated too; detached Wine launches retain the exact game-only
// identity instead of leaving OCR permanently paused. KWin may still expose an anonymous XWayland
// root; that fallback is accepted only while this exact bound game session is alive.
function classifyLinuxForeground(values, {
  session = scSession.current(),
  processName = null,
  belongsToSession = (pid) => scSession.belongsToSession(pid, session),
} = {}) {
  const pid = String(values?.PID || "").trim();
  const windowId = /^\d+$/.test(String(values?.WINDOW || "").trim()) ? String(values.WINDOW).trim() : "";
  const title = cleanX11Field(values?.TITLE);
  const className = cleanX11Field(values?.CLASS);
  let resolvedProcess = String(processName || "");
  if (!resolvedProcess && /^\d+$/.test(pid)) {
    try { resolvedProcess = fs.readFileSync(`/proc/${pid}/comm`, "utf8").trim(); } catch {}
  }
  const blob = `${title} ${className} ${resolvedProcess}`.trim();
  const boundPid = !!session && /^\d+$/.test(pid) && belongsToSession(Number(pid));
  const ownOverlay = !!session && (
    (/^\d+$/.test(pid) && Number(pid) === process.pid) ||
    /^(?:SC Blueprint Tracker|ArchVerse(?: Overlay)?)$/i.test(title) ||
    /sc-blueprint-tracker|archverse/i.test(className)
  ); // ARCHVERSE_LINUX_TRUSTED_OVERLAY_CAPTURE
  const gameIdentity = /Star\s*Citizen|StarCitizen(?:\.exe)?|StarCitizen[/\\]LIVE/i.test(blob);
  const gamescopeIdentity = /gamescope(?:-wl)?/i.test(blob);
  const directGame = !!session && (
    (boundPid && (/^StarCitizen(?:\.exe)?$/i.test(resolvedProcess) || gamescopeIdentity || gameIdentity)) ||
    (!pid && gamescopeIdentity && gameIdentity)
  );
  const anonymousXwaylandRoot = !!session && !pid && !blob;
  const x = Number(values?.X), y = Number(values?.Y), w = Number(values?.WIDTH), h = Number(values?.HEIGHT);
  const rect = Number.isFinite(x) && Number.isFinite(y) && w > 0 && h > 0 ? { x, y, width: w, height: h } : null;
  const sessionInfo = session ? {
    gamePid: session.gamePid,
    gamescopePid: session.gamescopePid,
    launcherPid: session.launcherPid || null,
  } : null;

  if (directGame) return { name: "StarCitizen", title, className, windowId, rect, gate: "pid-bound-active-window", session: sessionInfo };
  if (ownOverlay) return { name: "ArchVerseOverlay", title, className, rect: null, gate: "own-overlay-bound-game-session", session: sessionInfo };
  if (anonymousXwaylandRoot) {
    // Null deliberately selects the configured primary monitor rather than the 6360x2560 XWayland
    // root. A named browser/terminal/overlay surface never reaches this branch.
    return { name: "StarCitizen", title, className, windowId: "", rect: null, gate: "pid-bound-anonymous-wayland", session: sessionInfo };
  }
  return { name: resolvedProcess, title, className, rect, gate: session ? "not-bound-game-surface" : "no-bound-game-session", session: sessionInfo };
}

function foregroundWindow() {
  if (process.platform === "win32") {
    return new Promise((resolve) => {
      try { writeFgPs1(); } catch { return resolve({ name: "", rect: null, gate: "unavailable" }); }
      execFile("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", fgPs1], { windowsHide: true, timeout: 4000 }, (err, out) => {
        if (err) return resolve({ name: "", rect: null, gate: "unavailable" });
        const p = String(out).trim().split("|");
        const x = +p[1], y = +p[2], w = +p[3], h = +p[4];
        resolve({ name: p[0] || "", rect: w > 0 && h > 0 ? { x, y, width: w, height: h } : null, gate: "win32-active-window" });
      });
    });
  }

  const session = scSession.current();
  if (!session) return Promise.resolve({ name: "", rect: null, gate: "no-bound-game-session", session: null });
  return new Promise((resolve) => {
    const script = [
      'wid=$(xdotool getactivewindow 2>/dev/null || true)',
      'pid=""; title=""; class=""',
      'if [ -n "$wid" ]; then pid=$(xdotool getwindowpid "$wid" 2>/dev/null || true); title=$(xdotool getwindowname "$wid" 2>/dev/null | tr "\\n" " " || true); class=$(xprop -id "$wid" WM_CLASS 2>/dev/null | tr "\\n" " " || true); fi',
      'printf "WINDOW=%s\\nPID=%s\\nTITLE=%s\\nCLASS=%s\\n" "$wid" "$pid" "$title" "$class"',
      'if [ -n "$wid" ]; then xdotool getwindowgeometry --shell "$wid" 2>/dev/null || true; fi',
    ].join('; ');
    execFile("sh", ["-lc", script], { timeout: 2500 }, (_err, out) => {
      const values = {};
      for (const line of String(out || "").split(/\r?\n/)) {
        const m = line.match(/^([A-Z]+)=(.*)$/);
        if (m) values[m[1]] = m[2];
      }
      resolve(classifyLinuxForeground(values, { session }));
    });
  });
}

// Capture the display the GAME window is on (matched by display_id), at that monitor's full
// resolution → nativeImage. KDE Wayland frequently gives Electron an empty/KMS-denied thumbnail;
// the v2 calibration proved Spectacle can capture this exact desktop reliably, so r24 uses it as
// the primary Wayland backend and retains desktopCapturer as the X11/fallback backend.
const spectacleCapturePath = path.join(os.tmpdir(), `sc-overlay-spectacle-${process.pid}.png`);
const x11WindowCapturePath = path.join(os.tmpdir(), `archverse-x11-window-${process.pid}.png`);
const HOST_SESSION_TYPE = String(process.env.SC_TRACKER_HOST_XDG_SESSION_TYPE || process.env.XDG_SESSION_TYPE || "").toLowerCase();
const HOST_WAYLAND_DISPLAY = String(process.env.SC_TRACKER_HOST_WAYLAND_DISPLAY || process.env.WAYLAND_DISPLAY || "");
const HOST_IS_WAYLAND = process.platform === "linux" && (HOST_SESSION_TYPE === "wayland" || !!HOST_WAYLAND_DISPLAY);
let lastBackendWarning = "";
let preferredCaptureBackend = "";
let captureSessionKey = "";
// ARCHVERSE_ALPHA23_FALLBACK_UPGRADE_PROBE: Spectacle is safe but expensive. A compositor may
// expose the Star Citizen window or monitor only after launch settles, so a cached Spectacle
// fallback periodically gives faster non-PipeWire sources another chance.
let fallbackUpgradeNextAttemptAt = 0;
const FALLBACK_UPGRADE_PROBE_MS = 5000;
// ARCHVERSE_ALPHA23_WINDOW_STREAM_UPGRADE: the isolated helper warms without blocking the
// overlay. A healthy monitor fallback probes it at a bounded rate and promotes it after one frame.
let windowStreamNextProbeAt = 0;
const WINDOW_STREAM_PROBE_MS = 10000;
let boundGameWindowId = "";
let boundGameWindowPid = 0;
// ARCHVERSE_LINUX_CAPTURE_COORDINATE_CANONICALIZATION: every backend must hand Mining the same
// display-coordinate space. Direct Gamescope PipeWire is the field-proven authority; once it has
// succeeded, its output size becomes the canonical display size. Fallbacks are resized into that
// same coordinate space before OCR/glyph logic sees them. Without this, a 2x Spectacle screenshot
// made valid OCR coordinates incompatible with findScanGlyph().
let canonicalDisplaySize = null;
let lastFallbackNormalizationLog = "";
function rememberCanonicalDisplay(disp, width, height) {
  if (!(width > 0 && height > 0)) return;
  canonicalDisplaySize = { displayId: String(disp?.id ?? ""), width: Math.round(width), height: Math.round(height) };
}
function canonicalSizeForDisplay(disp) {
  if (canonicalDisplaySize && (!canonicalDisplaySize.displayId || canonicalDisplaySize.displayId === String(disp?.id ?? ""))) {
    return { width: canonicalDisplaySize.width, height: canonicalDisplaySize.height };
  }
  const b = disp?.bounds || {};
  return { width: Math.max(8, Math.round(Number(b.width) || 0)), height: Math.max(8, Math.round(Number(b.height) || 0)) };
}
function normalizeFallbackImage(image, disp, method) {
  if (!image || image.isEmpty()) return image;
  const size = image.getSize();
  const target = canonicalSizeForDisplay(disp);
  if (!(target.width > 0 && target.height > 0)) return image;
  if (Math.abs(size.width - target.width) <= 2 && Math.abs(size.height - target.height) <= 2) return image;
  const key = `${method}:${size.width}x${size.height}->${target.width}x${target.height}`;
  if (key !== lastFallbackNormalizationLog) {
    lastFallbackNormalizationLog = key;
    console.log(`[screen-read] normalized ${method} ${size.width}x${size.height} -> ${target.width}x${target.height} canonical display coordinates`);
  }
  return image.resize({ width: target.width, height: target.height, quality: "good" });
}

// ARCHVERSE_LINUX_PIPEWIRE_REPROBE: bounded rediscovery retained; promotion requires frame health.
// ARCHVERSE_LINUX_PIPEWIRE_RECOVERY_STATE_V2: discovery is not frame health. Candidate 8b treated
// `pw-dump` discovery as recovery, then retried a broken GStreamer frame every few seconds and
// announced "promoting" thousands of times. A discovered node is only a recovery CANDIDATE. The
// cached fallback remains authoritative until a real PipeWire frame succeeds; failed health checks
// back off exponentially and never erase the working fallback.
let pipeWireRecoveryProbeInFlight = false;
let lastPipeWireRecoveryProbeAt = 0;
let pipeWireRecoveryCandidate = null;
let pipeWireRecoveryFailureCount = 0;
let pipeWireRecoveryNextAttemptAt = 0;
let lastPipeWireRecoveryCandidateKey = "";
const PIPEWIRE_RECOVERY_PROBE_MS = 5000;
function pipeWireBackoffMs() {
  return Math.min(60000, 5000 * (2 ** Math.min(4, Math.max(0, pipeWireRecoveryFailureCount - 1))));
}
function notePipeWireFrameSuccess() {
  pipeWireRecoveryCandidate = null;
  pipeWireRecoveryFailureCount = 0;
  pipeWireRecoveryNextAttemptAt = 0;
}
function notePipeWireFrameFailure() {
  pipeWireRecoveryCandidate = null;
  pipeWireRecoveryFailureCount = Math.min(8, pipeWireRecoveryFailureCount + 1);
  pipeWireRecoveryNextAttemptAt = Date.now() + pipeWireBackoffMs();
}
function schedulePipeWireRecoveryProbe() {
  if (process.platform !== "linux" || !preferredCaptureBackend || preferredCaptureBackend === "pipewire" || pipeWireRecoveryProbeInFlight) return;
  const session = scSession.current();
  if (!session?.gamescopePid || typeof gamescopePipeWire.probe !== "function") return;
  const now = Date.now();
  if (now < pipeWireRecoveryNextAttemptAt || now - lastPipeWireRecoveryProbeAt < PIPEWIRE_RECOVERY_PROBE_MS) return;
  lastPipeWireRecoveryProbeAt = now;
  pipeWireRecoveryProbeInFlight = true;
  gamescopePipeWire.probe(session.gamescopePid).then((info) => {
    if (captureSessionKey !== `${session.gamePid}:${session.gameStartTicks}:${session.gamescopePid || 0}`) return;
    pipeWireRecoveryCandidate = info;
    const key = `${info?.node?.id ?? "?"}:${info?.frame?.width ?? "?"}x${info?.frame?.height ?? "?"}`;
    if (key !== lastPipeWireRecoveryCandidateKey) {
      lastPipeWireRecoveryCandidateKey = key;
      console.log(`[screen-read] Gamescope PipeWire source ${info?.node?.id ?? "?"} rediscovered; queued one frame-health check`);
    }
  }).catch(() => {}).finally(() => { pipeWireRecoveryProbeInFlight = false; });
}

const CAPTURE_BACKENDS = Object.freeze({
  pipewire: captureWithGamescopePipeWire,
  gamescope: captureWithGamescopeWindow,
  window: captureWithPersistentStarCitizenWindow,
  x11: captureWithX11Window,
  spectacle: captureWithSpectacle,
  electron: captureWithElectron,
});

function runFile(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (err, stdout, stderr) => {
      if (err) {
        const detail = String(stderr || stdout || err.message || err).trim();
        const wrapped = new Error(detail || String(err));
        wrapped.code = err.code;
        return reject(wrapped);
      }
      resolve({ stdout, stderr });
    });
  });
}
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function captureWarning(message) {
  const text = String(message || "").trim();
  if (!text || text === lastBackendWarning) return;
  lastBackendWarning = text;
  console.warn(`[screen-read] capture backend fallback: ${text}`);
}
function spectacleEnvironment() {
  const env = { ...process.env };
  const copy = (dst, src) => {
    const value = process.env[src];
    if (value) env[dst] = value;
  };
  copy("WAYLAND_DISPLAY", "SC_TRACKER_HOST_WAYLAND_DISPLAY");
  copy("DISPLAY", "SC_TRACKER_HOST_DISPLAY");
  copy("XDG_RUNTIME_DIR", "SC_TRACKER_HOST_XDG_RUNTIME_DIR");
  copy("DBUS_SESSION_BUS_ADDRESS", "SC_TRACKER_HOST_DBUS_SESSION_BUS_ADDRESS");
  if (HOST_IS_WAYLAND) {
    env.XDG_SESSION_TYPE = "wayland";
    env.QT_QPA_PLATFORM = "wayland";
  }
  // These variables are intentionally applied to Electron's software renderer, but inheriting
  // them into a Qt screenshot process can prevent Spectacle from connecting to KWin/Wayland.
  delete env.GDK_BACKEND;
  delete env.ELECTRON_OZONE_PLATFORM_HINT;
  delete env.LIBGL_ALWAYS_SOFTWARE;
  delete env.MESA_LOADER_DRIVER_OVERRIDE;
  delete env.ANGLE_DEFAULT_PLATFORM;
  return env;
}
async function waitForCaptureFile(filePath, timeoutMs = 6000) {
  const until = Date.now() + timeoutMs;
  let lastSize = -1;
  let stablePolls = 0;
  while (Date.now() < until) {
    try {
      const size = fs.statSync(filePath).size;
      if (size > 0) {
        if (size === lastSize) stablePolls += 1;
        else { lastSize = size; stablePolls = 0; }
        // KDE's screenshot portal can return before the PNG writer is fully closed. Require the
        // size to stop changing, then prove Electron can decode it before accepting the frame.
        if (stablePolls >= 1) {
          const image = nativeImage.createFromPath(filePath);
          if (image && !image.isEmpty()) return image;
        }
      }
    } catch {}
    await delay(100);
  }
  return null;
}
async function captureWithGamescopePipeWire(disp) {
  const session = scSession.current();
  if (!session?.gamescopePid) throw new Error("bound Star Citizen session has no Gamescope ancestor");
  const canvasW = Number(process.env.SC_OVERLAY_CANVAS_WIDTH) > 0 ? Number(process.env.SC_OVERLAY_CANVAS_WIDTH) : null;
  const canvasH = Number(process.env.SC_OVERLAY_CANVAS_HEIGHT) > 0 ? Number(process.env.SC_OVERLAY_CANVAS_HEIGHT) : null;
  const got = await gamescopePipeWire.capture({
    gamescopePid: session.gamescopePid,
    disp,
    displays: screen.getAllDisplays(),
    canvasW,
    canvasH,
  });
  let image;
  try { image = nativeImage.createFromBuffer(fs.readFileSync(got.path)); }
  catch (error) { gamescopePipeWire.invalidate(); throw new Error(`could not decode Gamescope PipeWire PNG: ${error.message}`); }
  if (!image || image.isEmpty()) {
    gamescopePipeWire.invalidate();
    throw new Error("Gamescope PipeWire frame decoded empty");
  }
  const outSize = image.getSize();
  rememberCanonicalDisplay(disp, outSize.width, outSize.height);
  _lastOcrCaptureInfo = {
    ...(_lastOcrCaptureInfo || {}),
    x: disp.bounds.x, y: disp.bounds.y, width: disp.bounds.width, height: disp.bounds.height,
    pixelWidth: outSize.width, pixelHeight: outSize.height,
    backend: "gamescope-pipewire", sourceWidth: got.frame.width, sourceHeight: got.frame.height,
    at: Date.now(),
  };
  return {
    image,
    width: outSize.width,
    height: outSize.height,
    method: "gamescope-pipewire",
    sourceName: `Gamescope PipeWire node ${got.node.id}`,
    sourceSize: { width: got.frame.width, height: got.frame.height },
    sourceCrop: got.crop,
    frameAgeMs: got.frameAgeMs ?? null,
    streamStartedAt: got.streamStartedAt ?? null,
    frameToken: (() => { try { const stat = fs.statSync(got.path); return `gamescope-pipewire:${got.path}:${stat.mtimeMs}`; } catch { return null; } })(),
  };
}

async function captureWithSpectacle(disp) {
  try { fs.unlinkSync(spectacleCapturePath); } catch {}
  await runFile("spectacle", ["-b", "-n", "-o", spectacleCapturePath], {
    timeout: 20_000,
    env: spectacleEnvironment(),
  });
  const full = await waitForCaptureFile(spectacleCapturePath);
  if (!full || full.isEmpty()) {
    throw new Error("Spectacle returned before a complete decodable screenshot became available");
  }

  const displays = screen.getAllDisplays();
  const left = Math.min(...displays.map((d) => d.bounds.x));
  const top = Math.min(...displays.map((d) => d.bounds.y));
  const right = Math.max(...displays.map((d) => d.bounds.x + d.bounds.width));
  const bottom = Math.max(...displays.map((d) => d.bounds.y + d.bounds.height));
  const virtualW = Math.max(1, right - left), virtualH = Math.max(1, bottom - top);
  const size = full.getSize();
  const sx = size.width / virtualW, sy = size.height / virtualH;
  const crop = {
    x: Math.max(0, Math.round((disp.bounds.x - left) * sx)),
    y: Math.max(0, Math.round((disp.bounds.y - top) * sy)),
    width: Math.max(8, Math.round(disp.bounds.width * sx)),
    height: Math.max(8, Math.round(disp.bounds.height * sy)),
  };
  crop.width = Math.min(crop.width, size.width - crop.x);
  crop.height = Math.min(crop.height, size.height - crop.y);
  if (crop.width < 8 || crop.height < 8) {
    throw new Error(`Spectacle monitor crop invalid: ${JSON.stringify(crop)} from ${size.width}x${size.height}`);
  }
  const rawImage = full.crop(crop);
  const image = normalizeFallbackImage(rawImage, disp, "spectacle-wayland");
  const outSize = image.getSize();
  lastBackendWarning = "";
  return {
    image,
    width: outSize.width,
    height: outSize.height,
    method: "spectacle-wayland",
    sourceName: "KDE Spectacle full-desktop crop",
    sourceSize: size,
  };
}
async function captureWithGamescopeWindow(disp) {
  const canvasDisplays = screen.getAllDisplays();
  const canvasLeft = Math.min(...canvasDisplays.map((d) => d.bounds.x));
  const canvasRight = Math.max(...canvasDisplays.map((d) => d.bounds.x + d.bounds.width));
  const primaryBounds = screen.getPrimaryDisplay().bounds;
  const canvasW = Math.max(640, Number(process.env.SC_OVERLAY_CANVAS_WIDTH) || (canvasRight - canvasLeft));
  const canvasH = Math.max(360, Number(process.env.SC_OVERLAY_CANVAS_HEIGHT) || primaryBounds.height);
  const sources = await desktopCapturer.getSources({
    types: ["window"],
    thumbnailSize: { width: canvasW, height: canvasH },
    fetchWindowIcons: false,
  });
  const candidates = sources.filter((source) => {
    const name = String(source.name || "").trim();
    return !source.thumbnail.isEmpty() && (/gamescope/i.test(name) || /^Star\s*Citizen$/i.test(name));
  });
  if (!candidates.length) {
    const names = sources.slice(0, 8).map((source) => source.name || "(unnamed)").join(", ");
    throw new Error(`no Gamescope/Star Citizen window source${names ? `; visible sources: ${names}` : ""}`);
  }
  candidates.sort((a, b) => {
    const rank = (source) => {
      const name = String(source.name || "");
      if (/gamescope/i.test(name) && /star\s*citizen/i.test(name)) return 3;
      if (/^Star\s*Citizen$/i.test(name.trim())) return 2;
      if (/gamescope/i.test(name)) return 1;
      return 0;
    };
    const aGame = rank(a), bGame = rank(b);
    if (aGame !== bGame) return bGame - aGame;
    const as = a.thumbnail.getSize(), bs = b.thumbnail.getSize();
    return (bs.width * bs.height) - (as.width * as.height);
  });
  const source = candidates[0];
  const full = source.thumbnail;
  const size = full.getSize();
  // ARCHVERSE_ALPHA23_DIRECT_SC_WINDOW_CAPTURE: a normal non-Gamescope Star Citizen source is
  // already the complete game canvas. Applying the panoramic Gamescope monitor crop to it either
  // rejects the source or cuts away the top-right r_DisplayInfo block.
  const sourceName = String(source.name || "").trim();
  if (/^Star\s*Citizen$/i.test(sourceName) && !/gamescope/i.test(sourceName)) {
    const image = normalizeFallbackImage(full, disp, "electron-star-citizen-window");
    const outSize = image.getSize();
    return {
      image,
      width: outSize.width,
      height: outSize.height,
      method: "electron-star-citizen-window",
      sourceName,
      sourceSize: size,
    };
  }
  const displays = screen.getAllDisplays();
  const left = Math.min(...displays.map((d) => d.bounds.x));
  const top = Math.min(...displays.map((d) => d.bounds.y));
  const xScale = size.width / canvasW;
  const yScale = size.height / canvasH;
  const crop = {
    x: Math.max(0, Math.round((disp.bounds.x - left) * xScale)),
    y: Math.max(0, Math.round((disp.bounds.y - top) * yScale)),
    width: Math.max(8, Math.round(disp.bounds.width * xScale)),
    height: Math.max(8, Math.round(Math.min(disp.bounds.height, canvasH) * yScale)),
  };
  crop.width = Math.min(crop.width, size.width - crop.x);
  crop.height = Math.min(crop.height, size.height - crop.y);
  if (crop.width < 8 || crop.height < 8) {
    throw new Error(`Gamescope window crop invalid: ${JSON.stringify(crop)} from ${size.width}x${size.height}`);
  }
  const rawImage = full.crop(crop);
  const image = normalizeFallbackImage(rawImage, disp, "electron-gamescope-window");
  const outSize = image.getSize();
  return {
    image,
    width: outSize.width,
    height: outSize.height,
    method: "electron-gamescope-window",
    sourceName: source.name || "gamescope",
    sourceSize: size,
  };
}
async function captureWithPersistentStarCitizenWindow(disp) {
  const session = scSession.current();
  if (!session || session.gamescopePid) throw new Error("isolated Star Citizen window stream is for non-Gamescope sessions only");
  const gameWindowId = boundGameWindowPid === Number(session.gamePid) ? boundGameWindowId : "";
  const got = await starCitizenWindow.capture({
    gamePid: session.gamePid,
    gameStartTicks: session.gameStartTicks,
    gameWindowId,
  });
  let full;
  try { full = nativeImage.createFromPath(got.path); }
  catch (error) { starCitizenWindow.stop?.("invalid PNG"); throw new Error(`could not decode isolated Star Citizen window frame: ${error.message}`); }
  if (!full || full.isEmpty()) {
    starCitizenWindow.stop?.("empty PNG");
    throw new Error("isolated Star Citizen window frame decoded empty");
  }
  const sourceSize = full.getSize();
  const rawImage = cropFullCanvasToDisplay(full, disp);
  const method = got.transport === "portal-pipewire-window" ? "portal-pipewire-window" : "electron-x11-window-stream";
  const image = normalizeFallbackImage(rawImage, disp, method);
  const size = image.getSize();
  return {
    image,
    width: size.width,
    height: size.height,
    method,
    sourceName: got.sourceName || "Star Citizen",
    sourceSize,
    frameAgeMs: Math.max(0, Date.now() - Number(got.capturedAt || Date.now())),
    frameToken: `${method}:${Number(got.videoTime).toFixed(6)}`,
  };
}

function cropFullCanvasToDisplay(full, disp) {
  const size = full.getSize();
  const displays = screen.getAllDisplays();
  const right = Math.max(...displays.map((item) => item.bounds.x + item.bounds.width));
  const left = Math.min(...displays.map((item) => item.bounds.x));
  const bottom = Math.max(...displays.map((item) => item.bounds.y + item.bounds.height));
  const top = Math.min(...displays.map((item) => item.bounds.y));
  const canvasW = Math.max(1, Number(process.env.SC_OVERLAY_CANVAS_WIDTH) || right - left);
  const canvasH = Math.max(1, Number(process.env.SC_OVERLAY_CANVAS_HEIGHT) || bottom - top);
  const crop = normalCanvasDisplayCrop({
    sourceSize: size, displayBounds: disp.bounds, displays, canvasWidth: canvasW, canvasHeight: canvasH,
  });
  return crop ? full.crop(crop) : full;
}

async function captureFullX11Window() {
  if (!/^\d+$/.test(boundGameWindowId)) throw new Error("bound Star Citizen X11 window ID is unavailable");
  const session = scSession.current();
  const display = process.env.SC_TRACKER_HOST_DISPLAY || process.env.DISPLAY;
  return exactX11Capture({
    key: `${session?.gamePid}:${session?.gameStartTicks}:${boundGameWindowId}:${display}`,
    xid: boundGameWindowId, display, output: x11WindowCapturePath, env: process.env,
  });
}

async function captureWithX11Window(disp) {
  const full = await captureFullX11Window();
  const sourceSize = full.getSize();
  const rawImage = cropFullCanvasToDisplay(full, disp);
  const image = normalizeFallbackImage(rawImage, disp, "x11-window");
  const size = image.getSize();
  return {
    image, width: size.width, height: size.height, method: "x11-window",
    sourceName: `Star Citizen X11 window ${boundGameWindowId}`, sourceSize,
  };
}
async function captureWithElectron(disp) {
  const width = Math.round(disp.size.width * disp.scaleFactor);
  const height = Math.round(disp.size.height * disp.scaleFactor);
  const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width, height } });
  const exact = sources.find((source) => source.display_id && String(source.display_id) === String(disp.id));
  const orderedDisplays = screen.getAllDisplays().slice().sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
  const displayIndex = Math.max(0, orderedDisplays.findIndex((candidate) => String(candidate.id) === String(disp.id)));
  const byOrdinal = sources.find((source) =>
    new RegExp(`(?:screen|display)\\s*${displayIndex + 1}\\b`, "i").test(String(source.name || "")));
  const source = exact || byOrdinal || sources[displayIndex] || sources[0];
  if (!source || source.thumbnail.isEmpty()) throw new Error("desktopCapturer returned no usable screen source");
  const rawImage = source.thumbnail;
  const image = normalizeFallbackImage(rawImage, disp, exact ? "electron-display-id" : "electron-screen-fallback");
  const size = image.getSize();
  return {
    image,
    width: size.width || width,
    height: size.height || height,
    method: exact ? "electron-display-id" : "electron-screen-fallback",
    sourceName: source.name || "(unnamed screen)",
    sourceId: source.display_id || "",
    sourceInventory: sources.map((item) => `${item.name || "(unnamed)"}#${item.display_id || "no-id"}`).join(", "),
  };
}
let captureSequence = 0;
function recordCaptureResult(result, startedAt) {
  const captureMs = Math.max(0, Date.now() - startedAt);
  if (!result.frameToken) result.frameToken = `${result.method}:${++captureSequence}:${Date.now()}`;
  result.captureMs = captureMs;
  _lastOcrCaptureInfo = {
    ...(_lastOcrCaptureInfo || {}),
    method: result.method,
    sourceName: result.sourceName || "",
    captureMs,
    frameAgeMs: result.frameAgeMs ?? null,
    at: Date.now(),
  };
  return result;
}
async function captureGame(winRect) {
  const captureStartedAt = Date.now();
  const disp = winRect ? screen.getDisplayMatching(winRect) : screen.getPrimaryDisplay();
  _lastOcrCaptureInfo = {
    x: disp.bounds.x, y: disp.bounds.y, width: disp.bounds.width, height: disp.bounds.height,
    displayId: String(disp.id), configDir: _lastOcrCaptureInfo?.configDir || "", at: Date.now(),
  };
  const session = scSession.current();
  const sessionKey = `${session?.gamePid}:${session?.gameStartTicks}:${session?.gamescopePid || 0}`;
  if (captureSessionKey !== sessionKey) {
    captureSessionKey = sessionKey;
    preferredCaptureBackend = "";
    canonicalDisplaySize = null;
    pipeWireRecoveryCandidate = null;
    pipeWireRecoveryFailureCount = 0;
    pipeWireRecoveryNextAttemptAt = 0;
    lastPipeWireRecoveryProbeAt = 0;
    lastPipeWireRecoveryCandidateKey = "";
    fallbackUpgradeNextAttemptAt = 0;
    windowStreamNextProbeAt = 0;
  }
  const errors = [];
  schedulePipeWireRecoveryProbe();

  // If a fallback is currently healthy and discovery says Gamescope is back, perform ONE real
  // frame-health check. Only that successful frame is allowed to promote PipeWire. Discovery by
  // itself never changes the cached backend.
  if (process.platform === "linux" && preferredCaptureBackend && preferredCaptureBackend !== "pipewire"
      && pipeWireRecoveryCandidate && Date.now() >= pipeWireRecoveryNextAttemptAt) {
    const fallbackName = preferredCaptureBackend;
    try {
      const result = await CAPTURE_BACKENDS.pipewire(disp);
      preferredCaptureBackend = "pipewire";
      notePipeWireFrameSuccess();
      console.log(`[screen-read] Gamescope PipeWire frame health recovered; promoted over ${fallbackName}`);
      return recordCaptureResult(result, captureStartedAt);
    } catch (e) {
      errors.push(`pipewire-recovery: ${e?.message || e}`);
      notePipeWireFrameFailure();
      console.warn(`[screen-read] Gamescope PipeWire recovery frame failed; keeping ${fallbackName}, retry in ${pipeWireBackoffMs()}ms`);
    }
  }

  // Gamescope keeps its field-proven direct PipeWire path and existing window fallback. A
  // normal Wine/XWayland launch uses the isolated persistent stream before monitor fallbacks.
  const hasGamescope = !!scSession.current()?.gamescopePid;
  const normalOrder = process.platform === "linux"
    ? (hasGamescope
      ? ["pipewire", "gamescope", "electron", "spectacle"]
      : (HOST_IS_WAYLAND ? ["window", "x11", "spectacle", "electron"] : ["window", "x11", "electron", "spectacle"]))
    : ["electron"];
  const probeWindowStream = process.platform === "linux" && !hasGamescope
    && preferredCaptureBackend && preferredCaptureBackend !== "window" && Date.now() >= windowStreamNextProbeAt;
  if (probeWindowStream) windowStreamNextProbeAt = Date.now() + WINDOW_STREAM_PROBE_MS;
  const probeFasterFallback = process.platform === "linux" && HOST_IS_WAYLAND && hasGamescope
    && preferredCaptureBackend === "spectacle" && Date.now() >= fallbackUpgradeNextAttemptAt;
  if (probeFasterFallback) fallbackUpgradeNextAttemptAt = Date.now() + FALLBACK_UPGRADE_PROBE_MS;
  const order = probeWindowStream
    ? ["window", preferredCaptureBackend, ...normalOrder.filter((name) => name !== "window" && name !== preferredCaptureBackend)]
    : (probeFasterFallback
      ? ["pipewire", "gamescope", "electron", "spectacle"]
      : (preferredCaptureBackend
        ? [preferredCaptureBackend, ...normalOrder.filter((name) => name !== preferredCaptureBackend && name !== "pipewire")]
        : normalOrder));
  for (const name of order) {
    try {
      const result = await CAPTURE_BACKENDS[name](disp);
      if (name === "pipewire") notePipeWireFrameSuccess();
      if (preferredCaptureBackend !== name) {
        preferredCaptureBackend = name;
        console.log(`[screen-read] capture backend cached for this session: ${name}`);
      }
      if (errors.length) captureWarning(errors.join("; "));
      return recordCaptureResult(result, captureStartedAt);
    } catch (e) {
      errors.push(`${name}: ${e?.message || e}`);
      if (name === "pipewire") notePipeWireFrameFailure();
      if (preferredCaptureBackend === name) preferredCaptureBackend = "";
    }
  }
  throw new Error(errors.join("; ") || "no screen-capture backend succeeded");
}

// ARCHVERSE_LOCATION_SYNC_V3_CAPTURE
// Location Sync is intentionally NOT the mining display crop. r_DisplayInfo is anchored to the
// top-right of the complete game canvas; on a panoramic Gamescope session that can be outside the
// calibrated/primary mining display. Direct PipeWire therefore crops the full Gamescope stream at
// GStreamer level. No full frame is written. Non-Gamescope sessions use the normal bound-game
// display capture and crop only its top-right.
const locationPipeWirePath = path.join(os.tmpdir(), `archverse-location-pipewire-${process.pid}.png`);
const locationSpectaclePath = path.join(os.tmpdir(), `archverse-location-spectacle-${process.pid}.png`);

function saveLocationCropFromImage(image, finalPath) {
  if (!image || image.isEmpty()) throw new Error("location capture decoded empty");
  const size = image.getSize();
  const g = locationCropGeometry(size.width, size.height);
  const out = image.crop(g.crop).resize({ width: g.target.width, height: g.target.height, quality: "best" });
  fs.writeFileSync(finalPath, out.toPNG());
  return { sourceFrame: size, nativeCrop: g.crop, ocrSize: g.target };
}

async function captureLocationWithPipeWire(finalPath) {
  const session = scSession.current();
  if (!session?.gamescopePid) throw new Error("bound Star Citizen session has no Gamescope ancestor");
  if (typeof gamescopePipeWire.probe !== "function") throw new Error("Gamescope PipeWire probe helper unavailable");
  const info = await gamescopePipeWire.probe(session.gamescopePid);
  const g = locationCropGeometry(info.frame.width, info.frame.height);
  const right = Math.max(0, info.frame.width - g.crop.x - g.crop.width);
  const bottom = Math.max(0, info.frame.height - g.crop.y - g.crop.height);
  try { fs.unlinkSync(locationPipeWirePath); } catch {}
  await runFile("gst-launch-1.0", [
    "-q", "-e", "pipewiresrc", `path=${info.node.id}`, "num-buffers=1", "do-timestamp=true", "!",
    `video/x-raw,format=BGRx,width=${info.frame.width},height=${info.frame.height}`, "!",
    "videocrop", `left=${g.crop.x}`, `right=${right}`, `top=${g.crop.y}`, `bottom=${bottom}`, "!",
    "videoconvert", "!", "pngenc", "!", "filesink", `location=${locationPipeWirePath}`,
  ], { timeout: 7000, maxBuffer: 2 * 1024 * 1024 });
  try {
    const raw = nativeImage.createFromPath(locationPipeWirePath);
    if (!raw || raw.isEmpty()) throw new Error("Gamescope PipeWire location crop decoded empty");
    const out = raw.resize({ width: g.target.width, height: g.target.height, quality: "best" });
    fs.writeFileSync(finalPath, out.toPNG());
    return {
      method: "gamescope-pipewire", sourceName: `Gamescope PipeWire node ${info.node.id}`,
      sourceFrame: info.frame, nativeCrop: g.crop, ocrSize: g.target, gamescopePid: session.gamescopePid,
    };
  } finally { try { fs.unlinkSync(locationPipeWirePath); } catch {} }
}

async function captureLocationWithSpectacleFullDesktop(finalPath) {
  try { fs.unlinkSync(locationSpectaclePath); } catch {}
  await runFile("spectacle", ["-b", "-n", "-o", locationSpectaclePath], { timeout: 20000, env: spectacleEnvironment() });
  const full = await waitForCaptureFile(locationSpectaclePath);
  try {
    if (!full || full.isEmpty()) throw new Error("Spectacle returned no usable location frame");
    const meta = saveLocationCropFromImage(full, finalPath);
    return { method: "spectacle-wayland", sourceName: "KDE Spectacle full-desktop top-right", ...meta };
  } finally { try { fs.unlinkSync(locationSpectaclePath); } catch {} }
}

async function captureLocationWithPortalWindow(finalPath) {
  const session = scSession.current();
  if (!session || session.gamescopePid) throw new Error("portal window location capture requires a normal Star Citizen session");
  const gameWindowId = boundGameWindowPid === Number(session.gamePid) ? boundGameWindowId : "";
  const got = await starCitizenWindow.capture({
    gamePid: session.gamePid,
    gameStartTicks: session.gameStartTicks,
    gameWindowId,
  });
  const full = nativeImage.createFromPath(got.path);
  if (!full || full.isEmpty()) throw new Error("portal PipeWire location frame decoded empty");
  const meta = saveLocationCropFromImage(full, finalPath);
  const method = got.transport === "portal-pipewire-window" ? "portal-pipewire-window" : "electron-x11-window-stream";
  return {
    method, sourceName: got.sourceName || "Star Citizen window stream",
    frameAgeMs: Math.max(0, Date.now() - Number(got.capturedAt || Date.now())), ...meta,
  };
}

async function captureLocationWithX11Window(finalPath) {
  const full = await captureFullX11Window();
  const meta = saveLocationCropFromImage(full, finalPath);
  return { method: "x11-window", sourceName: `Star Citizen X11 window ${boundGameWindowId}`, ...meta };
}

async function captureLocationSyncCrop(finalPath, winRect) {
  const errors = [];
  const session = scSession.current();
  if (process.platform === "linux" && session?.gamescopePid) {
    try { return await captureLocationWithPipeWire(finalPath); }
    catch (error) { errors.push(`pipewire: ${error?.message || error}`); }
    if (HOST_IS_WAYLAND) {
      try {
        const got = await captureLocationWithSpectacleFullDesktop(finalPath);
        if (errors.length) console.warn(`[location-sync] direct PipeWire unavailable; using Spectacle: ${errors.join("; ")}`);
        return got;
      } catch (error) { errors.push(`spectacle: ${error?.message || error}`); }
    }
  }
  if (!session?.gamescopePid) {
    // A normal panoramic Wine/XWayland window can place r_DisplayInfo on the far-right monitor.
    // Preserve the complete game canvas for Location Sync; the Mining path still crops its display.
    try { return await captureLocationWithPortalWindow(finalPath); }
    catch (error) { errors.push(`portal-window: ${error?.message || error}`); }
    try { return await captureLocationWithX11Window(finalPath); }
    catch (error) { errors.push(`x11-window: ${error?.message || error}`); }
    if (HOST_IS_WAYLAND) {
      try { return await captureLocationWithSpectacleFullDesktop(finalPath); }
      catch (error) { errors.push(`spectacle: ${error?.message || error}`); }
    }
  }
  try {
    const cap = await captureGame(winRect);
    const meta = saveLocationCropFromImage(cap.image, finalPath);
    return { method: cap.method, sourceName: cap.sourceName, ...meta };
  } catch (error) { errors.push(`game-display: ${error?.message || error}`); }
  throw new Error(errors.join("; ") || "no location capture backend succeeded");
}

// The kiosk's item render + name + category all live in the upper-right of the screen. Cropping to
// it before RapidOCR both (a) stops PP-OCR fusing the left material panel into the name and (b)
// speeds the read up. Fractions are of the captured GAME display (the fabricator is a fullscreen UI).
function rightPanelCrop(image, w, h) {
  const x = Math.round(w * 0.5);
  const cw = w - x, ch = Math.round(h * 0.72);
  return { img: image.crop({ x, y: 0, width: cw, height: ch }), w: cw, h: ch };
}

// The mining scan region, in pixels — deliberately duplicated from screen-read.ts's scanRegion()/
// DEFAULT_SCAN_REGION rather than imported: that module is TypeScript run via tsx in the sidecar
// process, and this file is plain CommonJS in the Electron main process with no build step wiring
// them together. Keep in sync if the default band or the validation rule ever changes there.
const DEFAULT_SCAN_REGION = { x: 0.5 - 0.17, y: 0.5 - 0.24, w: 0.34, h: 0.24 - 0.015 };
/** Tighten a scan region around the box the signature was last found in. Generous margins, and
 *  ALWAYS clamped inside the user's configured region — this narrows where we look, it never
 *  looks somewhere they didn't ask for. Extra room on the left because the scan-marker pin is
 *  drawn there and the glyph check needs it in frame. */
function tightenRegion(region, box) {
  const padL = Math.round(box.h * 6), padR = Math.round(box.h * 3), padY = Math.round(box.h * 2.5);
  const x = Math.max(region.x, box.x - padL);
  const y = Math.max(region.y, box.y - padY);
  const right = Math.min(region.x + region.width, box.x + box.w + padR);
  const bottom = Math.min(region.y + region.height, box.y + box.h + padY);
  const width = right - x, height = bottom - y;
  // A degenerate box (a bad lock, a zero-height bbox) must never produce an empty crop.
  if (width < 40 || height < 16) return region;
  return { x, y, width, height };
}

/** Add a small acquisition-only safety margin around a deliberately tight calibration. The
 *  margin absorbs HUD drift between ship and planet-side views. Once a signature locks, the
 *  original user region remains the clamp authority. */
function expandMiningAcquisitionRegion(region, frameWidth, frameHeight) {
  const padX = Math.max(24, Math.round(frameWidth * 0.0125));
  const padY = Math.max(12, Math.round(frameHeight * 0.0112));
  const x = Math.max(0, region.x - padX);
  const y = Math.max(0, region.y - padY);
  const right = Math.min(frameWidth, region.x + region.width + padX);
  const bottom = Math.min(frameHeight, region.y + region.height + padY);
  return { x, y, width: right - x, height: bottom - y };
}

function scanRegionPixels(saved, w, h) {
  const f = saved
    && Number.isFinite(saved.x) && Number.isFinite(saved.y)
    && Number.isFinite(saved.w) && Number.isFinite(saved.h)
    && saved.w > 0.02 && saved.h > 0.01
    && saved.x >= 0 && saved.y >= 0 && saved.x + saved.w <= 1.001 && saved.y + saved.h <= 1.001
    ? saved : DEFAULT_SCAN_REGION;
  return {
    x: Math.round(f.x * w), y: Math.round(f.y * h),
    width: Math.round(f.w * w), height: Math.round(f.h * h),
  };
}

// RapidOCR is isolated in a disposable Node child process. The Electron main process receives
// only plain OCR results, preserving Alpha17's bounded-resource/crash-containment contract.
let _rapidWarningShown = false;
let _rapidFailureReporter = null; // ARCHVERSE_LINUX_RAPIDOCR_FAILURE_REPORT
function reportRapidOcrFailure(error) {
  const message = String(error?.message || error || "unknown RapidOCR failure");
  try { _rapidFailureReporter?.(message); } catch {}
}
async function ocrRapidLinesWith(client, imgPath) {
  const detected = await client.detect(imgPath);
  const res = Array.isArray(detected) ? detected : (Array.isArray(detected?.texts) ? detected.texts : []);
  return res.map((r) => {
    const box = Array.isArray(r.box) ? r.box : [];
    const xs = box.map((pt) => Number(pt?.[0])).filter(Number.isFinite);
    const ys = box.map((pt) => Number(pt?.[1])).filter(Number.isFinite);
    const frame = r?.frame && typeof r.frame === "object" ? r.frame : null;
    const x = xs.length ? Math.min(...xs) : Number(frame?.left) || 0;
    const y = ys.length ? Math.min(...ys) : Number(frame?.top) || 0;
    return {
      text: String(r.text || ""), x, y,
      w: xs.length ? Math.max(...xs) - x : Number(frame?.width) || 0,
      h: ys.length ? Math.max(...ys) - y : Number(frame?.height) || 0,
      confidence: Number(r.score ?? r.confidence) || 0,
    };
  }).filter((row) => row.text.trim());
}
async function ocrRapidLines(imgPath) { return ocrRapidLinesWith(rapidOcrClient, imgPath); }
async function ocrRapidLinesOptional(imgPath) {
  try { return await ocrRapidLines(imgPath); }
  catch (error) {
    reportRapidOcrFailure(error);
    if (!_rapidWarningShown) {
      _rapidWarningShown = true;
      console.warn("[ocr] RapidOCR worker unavailable; continuing without RapidOCR for this read:", error?.message || error);
    }
    return [];
  }
}

// ARCHVERSE_LINUX_MINING_OCR_PRIORITY_LANES
// Mining owns one restartable worker. Every auxiliary reader shares one bounded background worker,
// which prevents several ONNX runtimes from oversubscribing the game and each other.
const LINUX_OCR_LANE_KEYS = Object.freeze(["resourceSignature", "background"]);
const linuxOcrLaneClients = {
  resourceSignature: createRapidOcrClient({
    logger: console, maxQueue: 1, timeoutMs: 900, restartOnFailure: true,
  }),
  background: createRapidOcrClient({
    logger: console, maxQueue: 1, timeoutMs: 5000, restartOnFailure: true,
  }),
};
const linuxOcrLanes = {
  resourceSignature: createLinuxOcrBackend({
    ocrRapidLines: (imgPath) => ocrRapidLinesWith(linuxOcrLaneClients.resourceSignature, imgPath),
    reportRapidOcrFailure,
    tesseractTimeoutMs: 600,
  }),
  background: createLinuxOcrBackend({
    ocrRapidLines: (imgPath) => ocrRapidLinesWith(linuxOcrLaneClients.background, imgPath),
    reportRapidOcrFailure,
    tesseractTimeoutMs: 3500,
  }),
};
const linuxOcrLane = (key) => key === "resourceSignature" ? linuxOcrLanes.resourceSignature : linuxOcrLanes.background;
process.once("exit", () => { for (const client of Object.values(linuxOcrLaneClients)) client.close(); });
const linuxOcr = linuxOcrLane("resourceSignature");
function getOcrCaptureInfo() {
  if (!_lastOcrCaptureInfo || !Number.isFinite(_lastOcrCaptureInfo.x)) return null;
  const cfg = readConfig(_lastOcrCaptureInfo.configDir || "");
  return { ..._lastOcrCaptureInfo, regions: normalizedLinuxOcrRegions(cfg) };
}

// Lightweight visual fingerprint primitives retained from ArchVerse Alpha13.
function visualFingerprint(image, width, height, roi) {
  const x = Math.max(0, Math.min(width - 1, Math.round(width * roi.x)));
  const y = Math.max(0, Math.min(height - 1, Math.round(height * roi.y)));
  const w = Math.max(8, Math.min(width - x, Math.round(width * roi.w)));
  const h = Math.max(8, Math.min(height - y, Math.round(height * roi.h)));
  const bitmap = image.crop({ x, y, width: w, height: h }).resize({ width: 48, height: 27, quality: "fast" }).toBitmap();
  const out = new Uint8Array(Math.floor(bitmap.length / 4));
  for (let src = 0, dst = 0; src + 3 < bitmap.length; src += 4, dst += 1) {
    out[dst] = Math.round((bitmap[src] + bitmap[src + 1] + bitmap[src + 2]) / (3 * 16));
  }
  return out;
}
function fingerprintDistance(a, b) {
  if (!a || !b || a.length !== b.length || !a.length) return Infinity;
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += Math.abs(a[i] - b[i]);
  return total / (a.length * 15);
}

let _lastArchVerseScanDiagnostic = "";
// ARCHVERSE_LINUX_SCAN_MODE_RADAR_ONLY_AUTHORITY
// Candidate 8d deliberately removes the signal-strength/status witness from the active path.
// The Mining commit gate has exactly two authorities: the structural Scan radar icon in this frame
// and a current-catalog resource signature parsed from the Mining OCR crop in the same frame.
function scanModeDiagnosticKey(r) {
  const roi = r?.roi || {};
  const roiKey = [roi.x, roi.y, roi.w, roi.h].map((v) => Number.isFinite(v) ? Number(v).toFixed(4) : "-").join(",");
  return [r?.active ? 1 : 0, r?.visionWake === true ? 1 : 0, r?.authorityCandidate === true ? 1 : 0,
    r?.confidence || 0, r?.referenceAngle || 0, r?.templateScore || 0,
    r?.iconRecall || 0, r?.labelRecall || 0, r?.haloDensity || 0,
    r?.rejectionReason || "accepted", roiKey].join("|");
}
function archVerseScanMode(image, width, height, captureMethod = "unknown") {
  const normalizedWidth = 960;
  const normalizedHeight = Math.max(240, Math.round(normalizedWidth * height / width));
  const normalized = image.resize({ width: normalizedWidth, height: normalizedHeight, quality: "good" });
  const r = detectScanModeRadarIcon(normalized.toBitmap(), normalizedWidth, normalizedHeight);
  const key = scanModeDiagnosticKey(r);
  if (key !== _lastArchVerseScanDiagnostic) {
    _lastArchVerseScanDiagnostic = key;
    const roi = r?.roi || {};
    const roiKey = [roi.x, roi.y, roi.w, roi.h].map((v) => Number.isFinite(v) ? Number(v).toFixed(4) : "-").join(",");
    console.log(`[mining-scan-mode] ${r.active ? "radar seen" : "radar absent"}` +
      ` confidence=${r.confidence || 0}` +
      ` method=${r.method || "radar-icon-structure-search"}` +
      ` capture=${captureMethod}` +
      ` score=${r.templateScore || 0}` +
      ` wake=${r.visionWake === true ? 1 : 0}` +
      ` authority=${r.authorityCandidate === true ? 1 : 0}` +
      ` icon=${r.iconRecall || 0}` +
      ` label=${r.labelRecall || 0}` +
      ` halo=${r.haloDensity || 0}` +
      `${r.rejectionReason ? ` rejected=${r.rejectionReason}` : ""}` +
      `${roiKey !== "-,-,-,-" ? ` radarRoi=${roiKey}` : ""}`);
  }
  return r;
}

// ── Mining diagnostic frames (opt-in, config.miningDebug) ────────────────────────────────────
// Writes the magnified bitmap the OCR actually receives, plus the raw crop, into the per-user dir
// so the sidecar can serve them over HTTP. Deliberately NOT next to the binary (Program Files is
// read-only) and deliberately capped: this is a debugging aid someone will forget to switch off.
const DEBUG_FRAME_DIR = path.join(process.env.SC_TRACKER_CONFIG_DIR || process.env.APPDATA || path.join(process.env.HOME || os.tmpdir(), "sc-blueprint-tracker"), "debug-frames");
const DEBUG_FRAME_MAX = 12; // ~a minute of scanning; oldest pruned first
let debugFrameSeq = 0;
function saveDebugFrame(magnified, raw) {
  fs.mkdirSync(DEBUG_FRAME_DIR, { recursive: true });
  const n = String(++debugFrameSeq).padStart(4, "0");
  fs.writeFileSync(path.join(DEBUG_FRAME_DIR, `crop-${n}-magnified.png`), magnified.toPNG());
  fs.writeFileSync(path.join(DEBUG_FRAME_DIR, `crop-${n}-raw.png`), raw.toPNG());
  // Prune oldest by name — the sequence is monotonic, so lexical order IS chronological.
  const files = fs.readdirSync(DEBUG_FRAME_DIR).filter((f) => f.endsWith(".png")).sort();
  while (files.length > DEBUG_FRAME_MAX * 2) {
    try { fs.unlinkSync(path.join(DEBUG_FRAME_DIR, files.shift())); } catch { /* raced */ }
  }
}

const SCAN_MODE_DEBUG_RECENT_LIMIT = 8;
const SCAN_MODE_DEBUG_REFRESH_MS = 15000;
let scanModeDebugSequence = 0;
let lastSavedScanModeDiagnostic = "";
let lastSavedScanModeAt = 0;
function saveScanModeDebugFrame(shot, read, trigger) {
  try {
    const roi = read?.roi || {};
    if (![roi.x, roi.y, roi.w, roi.h].every(Number.isFinite)) return false;
    const size = shot.getSize();
    const box = {
      x: Math.max(0, Math.min(size.width - 1, Math.floor(size.width * roi.x))),
      y: Math.max(0, Math.min(size.height - 1, Math.floor(size.height * roi.y))),
      width: Math.max(1, Math.round(size.width * roi.w)),
      height: Math.max(1, Math.round(size.height * roi.h)),
    };
    box.width = Math.min(box.width, size.width - box.x);
    box.height = Math.min(box.height, size.height - box.y);
    const marginX = Math.max(box.width * 2, Math.round(size.width * 0.02));
    const marginY = Math.max(box.height, Math.round(size.height * 0.02));
    const cx = Math.max(0, box.x - marginX);
    const cy = Math.max(0, box.y - marginY);
    const context = {
      x: cx, y: cy,
      width: Math.min(size.width, box.x + box.width + marginX) - cx,
      height: Math.min(size.height, box.y + box.height + marginY) - cy,
    };
    fs.mkdirSync(DEBUG_FRAME_DIR, { recursive: true });
    const slot = String(scanModeDebugSequence++ % SCAN_MODE_DEBUG_RECENT_LIMIT).padStart(2, "0");
    const exact = shot.crop(box).resize({ width: Math.min(480, Math.max(120, box.width * 4)), quality: "best" });
    const around = shot.crop(context).resize({ width: Math.min(960, Math.max(360, context.width * 2)), quality: "best" });
    const exactPng = exact.toPNG();
    const contextPng = around.toPNG();
    fs.writeFileSync(path.join(DEBUG_FRAME_DIR, `scan-mode-match-${slot}.png`), exactPng);
    fs.writeFileSync(path.join(DEBUG_FRAME_DIR, `scan-mode-context-${slot}.png`), contextPng);
    fs.writeFileSync(path.join(DEBUG_FRAME_DIR, "latest-scan-mode-match.png"), exactPng);
    fs.writeFileSync(path.join(DEBUG_FRAME_DIR, "latest-scan-mode-context.png"), contextPng);
    const payload = { at: new Date().toISOString(), trigger, read, box, context };
    fs.writeFileSync(path.join(DEBUG_FRAME_DIR, `scan-mode-read-${slot}.json`), JSON.stringify(payload, null, 2) + "\n");
    fs.writeFileSync(path.join(DEBUG_FRAME_DIR, "latest-scan-mode-read.json"), JSON.stringify(payload, null, 2) + "\n");
    console.log(`[mining-scan-mode] diagnostic slot=${slot} saved (${trigger})`);
    return true;
  } catch (error) {
    console.warn("[mining-scan-mode] unable to save diagnostic frame:", error?.message || error);
    return false;
  }
}

// Is an item actually rendered in the crop, or did we catch the fabricator mid-load (just the
// teal background)? We test for STRUCTURE, not brightness. The 3D preview streams in when an
// item is selected; an empty kiosk is a smooth teal gradient with almost no hard edges, whereas
// ANY real render — including the DARK schematics quantum drives + some ship components show,
// which never "light up" — has silhouette/detail edges. (Brightness alone wrongly rejected those
// dark items: they add almost no bright pixels, so the gate sat on "waiting for render" forever.)
// Count pixels bordering a hard luminance step in either direction; a smooth gradient stays near
// zero (measured: empty kiosk ~0%), a lit item is several %, a dark schematic is still clearly
// above the floor. The settle poll already covers fade-in timing, so this only guards emptiness.
function hasRender(image) {
  const bmp = image.getBitmap();          // BGRA, 4 bytes/pixel
  const { width: w, height: h } = image.getSize();
  const total = w * h;
  if (total < 4 || w < 2 || h < 2) return false;
  const lumAt = (x, y) => { const i = (y * w + x) * 4; return 0.114 * bmp[i] + 0.587 * bmp[i + 1] + 0.299 * bmp[i + 2]; };
  let edges = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = lumAt(x, y);
      const gx = x + 1 < w ? Math.abs(l - lumAt(x + 1, y)) : 0;
      const gy = y + 1 < h ? Math.abs(l - lumAt(x, y + 1)) : 0;
      if (gx > 24 || gy > 24) edges++;
    }
  }
  return edges / total > 0.001;
}

// Did a real SCAN produce this number, or did the OCR just find a comma-grouped number floating
// near screen centre? A genuine mining signature is drawn beside a map-pin glyph; nothing else on
// the HUD pairs that glyph with a number. Windows OCR is text-only and can't see icons, so this is
// the only way to tell — and it's the difference between "Debris" meaning something and the widget
// calling out numbers the player never scanned.
//
// Measured on Sub's 3440×1440 frame (2026-07-24): pin 15×22px, mean RGB (190,200,113).
// 🔑 Colour ALONE cannot do it: G−R is +10 on the pin but −5 on the SCANNING label. What separates
// them is BLUE — the pin is a desaturated yellow-green (B≈133) while the HUD's yellow is B≈25–43.
// Restricting the test to a box beside a number is what makes the colour test safe.
// ⚠ The pill is TRANSLUCENT, so what shows through varies with the backdrop. The thresholds are
// deliberately loose and every read logs its measurements, so real scans can tighten them.
// Which way to err: a MISSED glyph costs almost nothing — a signature that resolves to a known
// ore is applied regardless, so ore detection can't break — it only means a real piece of debris
// goes unannounced. A FALSE glyph puts "Debris" back in the player's ear for a number they never
// scanned, which is the whole complaint. So the band is drawn to be sure, not to be generous...
// except that the pill is translucent, and a pin blended halfway into dark space is a REAL scan
// (measured 50% blend: 99,105,64). minB/minG sit just under that, still far above the HUD yellow
// (B 25–43) that has to stay out.
// 🔑 NO ABSOLUTE COLOUR. The pin's colour is the SHIP'S HUD colour, and that changes with the
// ship the player is flying (Sub, 2026-08-03) — so the old yellow-green band, tuned to one frame
// from one ship, could only ever work for that ship. Every other HUD read `confirmed: false`,
// which silently made pure debris un-announceable: debris has no rock-table match, so the glyph
// is the ONLY evidence it has, and a glyph that never confirms means no debris call-out ever.
// That is the "2,000 and 6,000 are never called out" report, and it was never about those values.
//
// 🔴 THE "SAME COLOUR AS THE NUMBER" INVARIANT WAS ITSELF WRONG, not just mistuned (Rytharr,
// 2026-08-07). A real capture showed the pin rendering GOLD (chroma ~0.42/0.38/0.20) beside a
// WHITE number (chroma ~0.33/0.34/0.33) on the same frame — chromaDist between them was 0.297,
// past the 0.22 threshold that assumed they'd match. That pin could never be found, at any
// brightness, because the reference it was being compared against was never its own colour to
// begin with. And the colour still can't be hardcoded — it demonstrably varies ship to ship.
//
// The invariant that actually holds: THE PIN IS THE ONLY COLOURFUL THING IN THIS BOX. Measured off
// that same real capture — the translucent pill background and the (apparently always neutral)
// number text both sit under 0.1 saturation; real pin ink measured 0.3–0.7 regardless of its hue.
// So instead of matching a specific colour, ask whether a pixel is colourful AT ALL (its
// saturation — how far its RGB sits from grey/white/black) rather than which colour it is. That
// works for a yellow HUD, a blue one, a gold one, a white one, and any future one, without ever
// needing to know in advance what "the pin's colour" is.
const GLYPH = {
  /** Fraction of the search box that must be pin-coloured ink. The pin is ~15×22 in a ~34×29
   *  box (~33%), so this stays generous for a heavily blended one. */
  minFraction: 0.04,
  /** How much of the largest bright BLOB must fill its own bounding box. A pin is close to solid
   *  (measured ~0.6-0.8); glyph strokes of HUD text fill maybe 0.3 of theirs, and a diffuse
   *  gradient far less. This is what stops bright-but-not-pin-shaped things counting. */
  minFill: 0.45,
  /** How far from square that blob may be. The pin is ~15x22 (aspect 1.5); a word, a HUD rule or
   *  a rock edge is far longer than it is tall. 3.0 leaves room for a partly-occluded pin. */
  maxAspect: 3.0,
  /** A hit must also be BRIGHT — at least this fraction of the NUMBER's own ink luminance — so
   *  near-black compression noise (which can read as spuriously "saturated" at tiny RGB values)
   *  doesn't count just for having an unstable colour ratio. Deliberately a fraction of the ink and
   *  NOT a step above the sampled background: a tight OCR bbox can be almost pure ink, making
   *  background ~= ink, and a floor derived from that gap then demands the pin be as bright as the
   *  number — which a translucent pin never is. 0.35 clears a pin blended 50% into space (measured
   *  ~52% of ink) with margin. */
  minLumRatio: 0.35,
  /** Below this the text sample is too dim/flat to trust as a reference (the number itself was
   *  probably not in the box we were handed) — see the fallback in findScanGlyph. */
  minInkLum: 40,
};

/** How far a pixel sits from the grey/white/black axis — 0 for any shade of grey, up toward 1 for
 *  a fully saturated colour. Colour-FAMILY agnostic on purpose: this asks "is it colourful" rather
 *  than "which colour is it", which is what lets one threshold cover a gold pin, a cyan one, a red
 *  one, whatever a given ship's HUD happens to use. */
function saturation(r, g, b) {
  const mx = Math.max(r, g, b);
  return mx > 0 ? (mx - Math.min(r, g, b)) / mx : 0;
}

/** Sample a rect and derive its INK: the colour of the bright minority (glyph strokes) rather
 *  than the dark majority (background). Percentile, not a fixed threshold, so it self-scales to
 *  whatever the HUD's brightness is. */
function sampleInk(bmp, w, x0, y0, x1, y1) {
  const lums = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      lums.push(0.114 * bmp[i] + 0.587 * bmp[i + 1] + 0.299 * bmp[i + 2]);
    }
  }
  if (!lums.length) return null;
  const sorted = lums.slice().sort((a, b) => a - b);
  // Top quartile = the strokes. Text is a minority of its own bounding box, so a mean over the
  // whole box would return the BACKGROUND and every comparison after it would be meaningless.
  const cut = sorted[Math.floor(sorted.length * 0.75)];
  const bg = sorted[Math.floor(sorted.length * 0.25)];
  let n = 0, sr = 0, sg = 0, sb = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      const l = 0.114 * bmp[i] + 0.587 * bmp[i + 1] + 0.299 * bmp[i + 2];
      if (l >= cut) { n++; sr += bmp[i + 2]; sg += bmp[i + 1]; sb += bmp[i]; }
    }
  }
  if (!n) return null;
  const mean = [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)];
  return { mean, lum: cut, bg };
}

/** Sample the box beside the signature number and decide whether the scan glyph is in it.
 *  Returns the measurements too — they go in the log so the thresholds can be tuned from real
 *  scans rather than guessed at a second time. */
function findScanGlyph(image, rect, textRect) {
  const { width: w, height: h } = image.getSize();
  const clamp = (r) => {
    const x0 = Math.max(0, Math.min(Math.round(r.x), w - 1));
    const y0 = Math.max(0, Math.min(Math.round(r.y), h - 1));
    return [x0, y0, Math.max(x0, Math.min(Math.round(r.x + r.w), w)), Math.max(y0, Math.min(Math.round(r.y + r.h), h))];
  };
  const [x0, y0, x1, y1] = clamp(rect);
  const total = (x1 - x0) * (y1 - y0);
  if (total <= 0) return { seen: false, fraction: 0, total: 0, mean: null, ref: null, why: "empty search box" };
  const bmp = image.getBitmap(); // BGRA, 4 bytes/pixel

  // The reference is the NUMBER's own ink luminance, purely as a BRIGHTNESS anchor — not its
  // colour (see the note above on why that assumption was wrong). Without a usable text rect
  // there is nothing to calibrate brightness against, so this refuses rather than guessing.
  const ink = textRect ? sampleInk(bmp, w, ...clamp(textRect)) : null;
  if (!ink || ink.lum < GLYPH.minInkLum) {
    return { seen: false, fraction: 0, total, mean: null, ref: null,
             why: ink ? `text ink too dim to calibrate (lum ${Math.round(ink.lum)})` : "no text rect to calibrate from" };
  }
  // A hit must be COLOURFUL (unlike the achromatic pill and the neutral number text) and bright
  // relative to the number's own luminance — saturation alone would accept near-black compression
  // noise, whose colour ratio is unstable at tiny RGB values.
  const lumFloor = ink.lum * GLYPH.minLumRatio;
  const bw = x1 - x0, bh = y1 - y0;
  const on = new Uint8Array(bw * bh);
  let hits = 0, sr = 0, sg = 0, sb = 0, hr = 0, hg = 0, hb = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      const b = bmp[i], g = bmp[i + 1], r = bmp[i + 2];
      sr += r; sg += g; sb += b;
      const lum = 0.114 * b + 0.587 * g + 0.299 * r;
      // 🔑 BRIGHTNESS ONLY — no colour term of any kind. Every previous version keyed on colour
      // and every one of them broke on a HUD it wasn't measured against: first an absolute
      // yellow-green band (worked for exactly one ship), then hue matched to the number (a real
      // capture had a GOLD pin beside a WHITE number, chromaDist 0.297 vs a 0.22 threshold), then
      // saturation (which cannot see a white pin — its own test asserts that, and Sub's HUD renders
      // the pin near-white). Manufacturer skins recolour this freely, so any colour constant is a
      // constant that isn't. What does NOT change is that the pin is a solid bright mark sitting
      // beside a number of known brightness — so threshold on brightness and settle it by SHAPE.
      if (lum >= lumFloor) {
        on[(y - y0) * bw + (x - x0)] = 1;
        hits++; hr += r; hg += g; hb += b;
      }
    }
  }
  // Largest 4-connected blob of bright pixels. Brightness alone is not enough on its own — HUD
  // lettering, a lit rock edge and a starfield all clear the floor. The pin is distinguished by
  // being ONE CONTIGUOUS MARK: text scatters into many small components, a gradient spreads thinly
  // across the whole box, and neither forms a single blob of the pin's size and squareness.
  const blob = largestBlob(on, bw, bh);
  const fraction = blob.size / total;
  const fill = blob.w && blob.h ? blob.size / (blob.w * blob.h) : 0;
  const aspect = blob.w && blob.h ? Math.max(blob.w / blob.h, blob.h / blob.w) : 99;
  const seen = fraction >= GLYPH.minFraction && fill >= GLYPH.minFill && aspect <= GLYPH.maxAspect;
  return {
    seen,
    fraction: Math.round(fraction * 1000) / 1000,
    total,
    mean: [Math.round(sr / total), Math.round(sg / total), Math.round(sb / total)],
    hitMean: hits ? [Math.round(hr / hits), Math.round(hg / hits), Math.round(hb / hits)] : null,
    // Every number the decision used, so a HUD that still fails is diagnosable from a user's
    // report without guessing — this is what the old absolute thresholds could never tell us.
    ref: { mean: ink.mean, lum: Math.round(ink.lum), bg: Math.round(ink.bg), lumFloor: Math.round(lumFloor) },
    blob: { w: blob.w, h: blob.h, size: blob.size, fill: Math.round(fill * 100) / 100, aspect: Math.round(aspect * 100) / 100 },
    why: seen
      ? `blob ${blob.w}x${blob.h} (${blob.size}px, fill ${fill.toFixed(2)}, aspect ${aspect.toFixed(2)}) in ${total}px box`
      : `no pin-shaped blob: largest ${blob.w}x${blob.h} ${blob.size}px, fraction ${fraction.toFixed(3)}` +
        `, fill ${fill.toFixed(2)}, aspect ${aspect.toFixed(2)} (need >=${GLYPH.minFraction}, >=${GLYPH.minFill}, <=${GLYPH.maxAspect})`,
  };
}

/** Largest 4-connected component of set pixels, with its bounding box. Iterative flood fill —
 *  a recursive one blows the stack on a large bright region, which is exactly the pathological
 *  input here (a white flash, a lit rock filling the box). */
function largestBlob(on, bw, bh) {
  const seen = new Uint8Array(bw * bh);
  const stack = new Int32Array(bw * bh);
  let best = { size: 0, w: 0, h: 0 };
  for (let start = 0; start < on.length; start++) {
    if (!on[start] || seen[start]) continue;
    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    let size = 0, minX = bw, maxX = -1, minY = bh, maxY = -1;
    while (sp > 0) {
      const p = stack[--sp];
      const x = p % bw, y = (p / bw) | 0;
      size++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x > 0 && on[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
      if (x + 1 < bw && on[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0 && on[p - bw] && !seen[p - bw]) { seen[p - bw] = 1; stack[sp++] = p - bw; }
      if (y + 1 < bh && on[p + bw] && !seen[p + bw]) { seen[p + bw] = 1; stack[sp++] = p + bw; }
    }
    if (size > best.size) best = { size, w: maxX - minX + 1, h: maxY - minY + 1 };
  }
  return best;
}

const SITE = "https://subliminal.gg";

// Crop tight around the SUBJECT and re-centre on it, on BOTH axes. The kiosk shows the item
// floating on a smooth teal glow with a faint backdrop grid. The old approach kept the item's
// extent by colour-distance from the corner background — but the glow ALSO differs from the
// corners, so for a small, dark item (e.g. fuel components) it locked onto the glow and left the
// item tiny + off-centre. Instead we locate the item by its EDGES: a real 3D render has hard
// silhouette/detail edges, while the glow is smooth and the grid is low-contrast. We take the
// dominant contiguous edge cluster's bounding box on x and y and crop to it with a small margin.
function centerTighten(image, margin = 40) {
  const { width: w, height: h } = image.getSize();
  if (w < 40 || h < 40) return image;
  const bmp = image.getBitmap(); // BGRA
  const lumAt = (x, y) => { const i = (y * w + x) * 4; return 0.114 * bmp[i] + 0.587 * bmp[i + 1] + 0.299 * bmp[i + 2]; };
  const T = 28; // edge threshold: above the faint backdrop grid (~10-15), at/below item silhouette
  const colE = new Int32Array(w), rowE = new Int32Array(h);
  let totalE = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = lumAt(x, y);
      const gx = x + 1 < w ? Math.abs(l - lumAt(x + 1, y)) : 0;
      const gy = y + 1 < h ? Math.abs(l - lumAt(x, y + 1)) : 0;
      if (gx > T || gy > T) { colE[x]++; rowE[y]++; totalE++; }
    }
  }
  if (totalE < 50) return image; // no discernible subject — leave the anchor crop as-is
  // Dominant contiguous run in an edge-count projection (bridging small gaps), so a stray UI
  // sliver or grid speck loses to the item cluster. `span` is the perpendicular dimension.
  const domRun = (arr, n, span) => {
    const floor = Math.max(2, Math.round(0.008 * span)); // a line needs this many edge px to count
    const maxGap = Math.max(6, Math.round(n * 0.06));
    let bestL = -1, bestR = -1, bestSum = 0, i = 0;
    while (i < n) {
      if (arr[i] < floor) { i++; continue; }
      let segL = i, segR = i, sum = 0, gap = 0;
      while (i < n && gap <= maxGap) {
        if (arr[i] >= floor) { segR = i; sum += arr[i]; gap = 0; } else { gap++; }
        i++;
      }
      if (sum > bestSum) { bestSum = sum; bestL = segL; bestR = segR; }
    }
    return [bestL, bestR];
  };
  let [xL, xR] = domRun(colE, w, h);
  let [yT, yB] = domRun(rowE, h, w);
  if (xL < 0 || yT < 0) return image;
  // The edge cluster nails the item's HIGH-contrast (bright) parts but can miss a dark, low-contrast
  // region — a helmet's black visor, black-finish armor — that blends into the dark teal backdrop,
  // clipping it off. Grow the box outward to re-absorb any attached NON-TEAL "content": the kiosk
  // background and its glow are teal (green+blue clearly above red), whereas the item — red, grey or
  // near-black — is not. Growth only EXTENDS the box (never tightens), so it can NEVER introduce a
  // new clip; and a teal gap stops it, so it won't jump to a separated glyph (the X-close, stat text).
  const isItem = (x, y) => { const i = (y * w + x) * 4; const B = bmp[i], G = bmp[i + 1], R = bmp[i + 2]; return R + 12 >= Math.min(G, B); };
  const colItem = (x, t, b) => { let c = 0; for (let y = t; y <= b; y++) if (isItem(x, y)) c++; return c / (b - t + 1); };
  const rowItem = (y, l, r) => { let c = 0; for (let x = l; x <= r; x++) if (isItem(x, y)) c++; return c / (r - l + 1); };
  const FL = 0.06; // an adjacent line needs at least this fraction of item pixels to keep growing
  while (xL > 0 && colItem(xL - 1, yT, yB) > FL) xL--;
  while (xR < w - 1 && colItem(xR + 1, yT, yB) > FL) xR++;
  while (yT > 0 && rowItem(yT - 1, xL, xR) > FL) yT--;
  while (yB < h - 1 && rowItem(yB + 1, xL, xR) > FL) yB++;
  const nl = Math.max(0, xL - margin), nr = Math.min(w, xR + 1 + margin);
  const nt = Math.max(0, yT - margin), nb = Math.min(h, yB + 1 + margin);
  const nw = nr - nl, nh = nb - nt;
  if (nw >= 24 && nh >= 24 && (nw < w || nh < h)) return image.crop({ x: nl, y: nt, width: nw, height: nh });
  return image;
}

function readConfig(configDir) {
  try { return JSON.parse(fs.readFileSync(path.join(configDir, "config.json"), "utf8")); }
  catch { return {}; }
}

/** Start the opt-in capture loop. `configDir` = the %APPDATA%/sc-blueprint-tracker dir.
 *  `onStatus(s)` (optional) reports OCR activity to the overlay: {state} for
 *  off/idle/watching/settling, {state:"mission",title},
 *  {state:"captured",name,uploaded,queued} (uploaded:true = confirmed on the site; queued:true =
 *  saved locally + retrying, NOT done yet), {state:"shared",name,pending} (a queued upload finally
 *  landed on the site), {state:"have",name} (recognized, but the site already has the image —
 *  skipped), {state:"render",name,stuck} (recognized, waiting for the 3D render — stuck:true once
 *  it's clear the render won't load, e.g. quantum drives / ship components that show no lit model),
 *  or {state:"unresolved",nameRaw} (in the kiosk but the item couldn't be identified). */
function startFabCapture({ port, configDir, onStatus, onSidecarTransportFailure, onSidecarTransportSuccess, devTools = false }) {
  _lastOcrCaptureInfo = { ...(_lastOcrCaptureInfo || {}), configDir };
  _rapidFailureReporter = (message) => {
    const health = { ok: false, subsystem: "rapidocr", message, at: new Date().toISOString() };
    try { onStatus?.({ state: "error", ...health }); } catch {}
    try {
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, "rapidocr-health.json"), JSON.stringify(health, null, 2) + "\n");
    } catch {}
  };
  const captureDir = path.join(configDir, "fab-captures");
  const shotsDir = path.join(configDir, "fab-shots"); // full uncropped frames (mineable)
  // 🔑 TWO alternating names, never one. Writing the full frame to a single fixed path collided
  // with the sidecar's warm OCR worker still holding the PREVIOUS tick's file open: measured
  // 2026-08-08, exactly 25 of 50 mining ticks threw "UNKNOWN: unknown error, open …\sc-fab-shot.png"
  // after blocking ~1s on the open. Half of all ticks produced no read at all, which read as "the
  // scanner just sits there" rather than as an error, because this process has no console.
  // Six of them, rotated. Two was NOT enough — measured after that change, 14 of 33 full-glance
  // ticks still threw on BOTH names, so the worker holds a file well past the following tick.
  // Six slots at ~1-4s a tick means a name is reused minutes later, and the count stays bounded
  // (no unlink to fail, no temp dir to fill).
  const tmpShots = Array.from({ length: 6 }, (_, i) => path.join(os.tmpdir(), `sc-fab-shot-${i}.png`));
  let tmpShotIdx = 0;
  const tmpPanel = path.join(os.tmpdir(), "sc-fab-panel.png"); // upper-right crop fed to RapidOCR
  const tmpMiningCrop = path.join(os.tmpdir(), "sc-mining-crop.png"); // scan-region crop fed to RapidOCR
  const tmpLocateCrop = path.join(os.tmpdir(), `archverse-location-sync-${process.pid}.png`);
  // ARCHVERSE_LOCATION_SYNC_DURABLE_HANDOFF: the authoritative result transport is an atomic file
  // in SC_TRACKER_CONFIG_DIR. A busy localhost sidecar must never destroy a successful 4-second
  // capture/OCR result. HTTP remains a best-effort low-latency hint only.
  const locationResultPath = path.join(configDir, "location-sync-result.json");
  let lastLocationRequestAt = 0;
  const writeLocationResultDurable = (payload) => {
    const t0 = Date.now();
    fs.mkdirSync(configDir, { recursive: true });
    const envelope = {
      schema: "archverse-location-sync-result/1",
      completedAt: Date.now(),
      ...payload,
    };
    const tmp = `${locationResultPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(envelope, null, 2) + "\n", { mode: 0o600 });
      try { fs.chmodSync(tmp, 0o600); } catch {}
      fs.renameSync(tmp, locationResultPath);
    } finally {
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
    }
    return { envelope, durableWriteMs: Date.now() - t0 };
  };
  const postLocationResultFast = (payload) => {
    const t0 = Date.now();
    void fetch(`http://localhost:${port}/api/hauling/locate-result`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(1200),
    }).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      console.log(`[location-sync] optional HTTP fast-path delivered in ${Date.now() - t0}ms`);
    }).catch((error) => {
      console.log(`[location-sync] optional HTTP fast-path unavailable after ${Date.now() - t0}ms; durable result retained: ${error?.message || error}`);
    });
  };
  const deliverLocationResult = (payload) => {
    let delivered = payload;
    try {
      const { envelope, durableWriteMs } = writeLocationResultDurable(payload);
      delivered = envelope;
      console.log(`[location-sync] durable result committed request=${Number(payload.requestAt || 0)} write=${durableWriteMs}ms`);
    } catch (error) {
      // Emergency compatibility fallback. The durable file is authoritative when available, but a
      // filesystem failure should still give the existing localhost path one chance to deliver.
      console.warn(`[location-sync] durable result write failed: ${error?.message || error}`);
    }
    postLocationResultFast(delivered);
  };
  const runLocationSync = async (requestAt, winRect) => {
    lastLocationRequestAt = requestAt;
    const started = Date.now();
    try {
      const tCapture = Date.now();
      const cap = await captureLocationSyncCrop(tmpLocateCrop, winRect);
      const captureMs = Date.now() - tCapture;
      const tOcr = Date.now();
      const ocr = process.platform === "linux"
        ? await linuxOcrLane("locationSync").ocrLines(tmpLocateCrop, { key: "locationSync", numeric: false })
        : { engine: "rapidocr", lines: await ocrRapidLines(tmpLocateCrop) };
      const ocrMs = Date.now() - tOcr;
      const parsed = parseDisplayInfoLines(ocr.lines);
      const sample = ocr.lines.map((row) => String(row?.text || "").trim()).filter(Boolean).slice(0, 14);
      if (!parsed.ok) {
        console.warn(`[location-sync] parse failed via ${cap.method}; capture=${captureMs}ms ocr=${ocrMs}ms: ${parsed.error}`);
        deliverLocationResult({
          error: parsed.error, frame: null, body: parsed.body || null, system: parsed.system || null,
          currentLocation: parsed.currentLocation || null, captureMethod: cap.method, sourceName: cap.sourceName,
          captureMs, ocrMs, engine: ocr.engine, sample, requestAt, totalMs: Date.now() - started,
        });
        return;
      }
      console.log(`[location-sync] ${parsed.frame} position via ${cap.method}; body=${parsed.body || "-"} system=${parsed.system || "-"} pos=${parsed.pos.x.toFixed(1)},${parsed.pos.y.toFixed(1)},${parsed.pos.z.toFixed(1)}m capture=${captureMs}ms ocr=${ocrMs}ms`);
      deliverLocationResult({
        pos: parsed.pos, frame: parsed.frame, body: parsed.body || null, system: parsed.system || null,
        source: parsed.source, zoneLabel: parsed.zoneLabel || null, currentLocation: parsed.currentLocation || null,
        captureMethod: cap.method, sourceName: cap.sourceName, sourceFrame: cap.sourceFrame || null,
        nativeCrop: cap.nativeCrop || null, ocrSize: cap.ocrSize || null, captureMs, ocrMs, engine: ocr.engine,
        requestAt, totalMs: Date.now() - started,
      });
    } catch (error) {
      console.warn("[location-sync] failed:", error?.message || error);
      deliverLocationResult({ error: String(error?.message || error).slice(0, 220), requestAt, totalMs: Date.now() - started });
    } finally {
      try { fs.unlinkSync(tmpLocateCrop); } catch {}
    }
  };
  let busy = false;
  let busyAt = 0;             // when the current tick set busy (watchdog against a wedged loop)
  let lastSlowTickLogAt = 0;  // throttle diagnostics while one native/OCR cycle is still draining
  const TICK_WATCHDOG_MS = 15000; // report a slow tick, but never overlap its native image/OCR work
  const FETCH_TIMEOUT_MS = 8000;  // any single request must give up so it can't latch the loop
  const DRAIN_MS = 6000;          // how often the retry-upload loop drains captured-but-unshared items
  let lastContext = "";
  // Context = the steady on-screen state (off/idle/watching/fabricator); reported only on change,
  // drives the overlay diamond (fabricator -> gold). Events (settling/captured/mission) are discrete
  // and fire every time without disturbing the context.
  const emitContext = (state) => { if (state !== lastContext) { lastContext = state; onStatus?.({ state }); } };
  const emitEvent = (s) => { onStatus?.(s); };
  let lastMission = "";       // last mission title sent (throttle screen-read posts)
  let lastUnresolved = "";    // last unreadable kiosk item flagged (throttle the "can't read" note)
  let unresolvedTries = 0;    // consecutive polls a kiosk was on screen but unreadable
  let lastHave = "";          // last already-on-site item flagged (throttle the "already have" note)
  let lastRenderWait = "";    // last item stuck waiting on its render (throttle the "waiting" note)
  let renderTries = 0;        // consecutive polls the current item failed the render check
  let renderStuck = false;    // we've already told the user this item's render won't load
  let pendingItem = null;     // item seen earlier, awaiting its settle window before capture
  let pendingAt = 0;          // when we FIRST saw it — the settle is a duration, not a poll count
  let fastUntil = 0;          // poll fast after a valid in-vehicle RS; aboard state itself runs at 1.2s
  let lastTickMs = 0;         // how long the last poll actually took — the fast rate tunes off it
  let rate = POLL_MS;         // the interval currently armed, so we only re-arm on a real change
  let lastGameRect = null;    // preserve the exact game display while ArchVerse temporarily owns focus
  let lastForegroundGateLog = "";
  let lastMiningOcrLogAt = 0;
  let lastMiningOcrSig = null;
  // ARCHVERSE_LINUX_MINING_CURRENT_RS_VALIDATION: exact current RS totals are authoritative for
  // candidate admission. This supersedes the crude numeric floor while preserving fail-closed
  // behaviour: invalid HUD numbers never lock the crop or enter Mining IPC.
  const MINING_SIGNATURE_EARLY_FLOOR = 2000; // cheap prefilter only; catalog decides validity
  let lastMiningAuthorityRejectAt = 0;
  let lastMiningNumericProbeAt = 0;
  // ARCHVERSE_LINUX_MINING_VEHICLE_PRESENCE_LIVENESS: an IPC timeout is not a Game.log
  // departure. Keep the last confirmed state and use bounded retry. Every successful screen-read
  // also carries the sidecar's current authority state, which immediately reconciles a real exit.
  const vehiclePresenceClient = createMiningVehiclePresenceClient({
    endpoint: `http://127.0.0.1:${port}/api/vehicle-presence`,
    logger: console,
    cacheMs: VEHICLE_PRESENCE_CACHE_MS,
  }); // ARCHVERSE_LINUX_MINING_VEHICLE_PRESENCE_BOUNDED_GET
  const getVehiclePresence = () => vehiclePresenceClient.get();
  // ARCHVERSE_LINUX_ASYNC_MINING_TELEMETRY: Mining IPC never adds latency to capture/OCR.
  // ARCHVERSE_LINUX_MINING_TELEMETRY_LATEST_ONLY: one in flight + one newest confirmed payload.
  // Repeated unchanged signatures are suppressed; failures retain only the newest payload and retry
  // with bounded backoff instead of starting another timeout on every scanner tick.
  let miningScanPostInFlight = false;
  let pendingMiningScanPayload = null;
  let miningScanRetryTimer = null;
  let miningScanFailureCount = 0;
  let miningScanLastSuccessKey = "";
  let miningScanLastSuccessAt = 0;
  let miningScanLastFailureLogAt = 0;
  const miningScanPayloadKey = (p) => `${p?.signature ?? "-"}:${p?.confirmed === true ? 1 : 0}`;
  const queueMiningScanPost = (payload) => {
    const now = Date.now();
    const key = miningScanPayloadKey(payload);
    if (key === miningScanLastSuccessKey && now - miningScanLastSuccessAt < 5000) return;
    pendingMiningScanPayload = payload;
    if (miningScanPostInFlight || miningScanRetryTimer) return;
    miningScanPostInFlight = true;
    const drain = async () => {
      const next = pendingMiningScanPayload;
      pendingMiningScanPayload = null;
      if (!next) { miningScanPostInFlight = false; return; }
      try {
        const response = await fetch(`http://localhost:${port}/api/mining/scan`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next), signal: AbortSignal.timeout(1200),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        miningScanFailureCount = 0;
        miningScanLastSuccessKey = miningScanPayloadKey(next);
        miningScanLastSuccessAt = Date.now();
        miningScanPostInFlight = false;
        if (pendingMiningScanPayload) queueMiningScanPost(pendingMiningScanPayload);
      } catch (error) {
        miningScanFailureCount = Math.min(6, miningScanFailureCount + 1);
        if (!pendingMiningScanPayload) pendingMiningScanPayload = next;
        const delay = Math.min(5000, 500 * (2 ** Math.min(3, miningScanFailureCount - 1)));
        if (Date.now() - miningScanLastFailureLogAt >= 5000) {
          miningScanLastFailureLogAt = Date.now();
          console.warn(`[mining] scan IPC unavailable; newest confirmed read retained, retry in ${delay}ms:`, error?.message || error);
        }
        miningScanPostInFlight = false;
        miningScanRetryTimer = setTimeout(() => {
          miningScanRetryTimer = null;
          if (pendingMiningScanPayload) queueMiningScanPost(pendingMiningScanPayload);
        }, delay);
        miningScanRetryTimer.unref?.();
      }
    };
    void drain();
  };
  // ARCHVERSE_LINUX_MINING_NONBLOCKING_COMMIT: parsing and authoritative commit no longer
  // extend the capture/OCR tick. The helper retains at most one newest result during failure.
  let lastMiningCommitLogAt = 0;
  let lastMiningCommitKey = "";
  const miningResultTransport = createMiningResultTransport({
    endpoint: `http://127.0.0.1:${port}/api/screen-read`,
    logger: console,
    timeoutMs: 650,
    onResponse: (response, item) => {
      try { onSidecarTransportSuccess?.({ route: "/api/screen-read" }); }
      catch (observerError) { console.warn("[mining-ipc] sidecar watchdog success callback failed:", observerError?.message || observerError); }
      if (response?.vehiclePresence) vehiclePresenceClient.accept(response.vehiclePresence, "mining-commit");
      const local = item?.context?.localResult;
      const signature = Number(response?.signature ?? local?.signature);
      const commit = response?.miningCommit;
      const key = Number.isFinite(signature)
        ? `${signature}:${commit?.confirmed === true ? 1 : 0}:${commit?.used === true ? 1 : 0}`
        : `${response?.kind || "none"}`;
      const at = Date.now();
      if (key !== lastMiningCommitKey || at - lastMiningCommitLogAt >= 5000) {
        lastMiningCommitKey = key;
        lastMiningCommitLogAt = at;
        if (Number.isFinite(signature) && commit?.handled === true) {
          console.log(`[mining-commit] signature ${signature} acknowledged; authority=${commit.confirmed === true ? "vehicle" : "on-foot"} result=${commit.used === true ? "used" : "refused"} source=${commit.source || response?.vehiclePresence?.source || "none"}`);
        } else if (local?.kind !== "none" && item?.context?.confirmationStatus !== "pending") {
          console.log(`[mining-commit] sidecar classified local ${local.kind} as ${response?.kind || "none"}; no Mining state committed`);
        }
      }
    },
    onFailure: (error, state) => {
      try { onSidecarTransportFailure?.({ route: "/api/screen-read", error: String(error?.message || error), ...state }); }
      catch (observerError) { console.warn("[mining-ipc] sidecar watchdog callback failed:", observerError?.message || observerError); }
    },
  });
  const linuxOcrLastAt = new Map();
  // ARCHVERSE_LINUX_BACKGROUND_OCR_NONBLOCKING: completed auxiliary OCR is handed to a later
  // capture tick. Only one auxiliary lane may execute at once; resourceSignature remains fully
  // independent and latency-critical.
  const linuxBackgroundLatest = new Map();
  const linuxBackgroundInFlight = new Set();
  const linuxBackgroundKeys = Object.freeze(["fabricator", "claimContext", "mission", "refinery", "reputation"]);
  let linuxBackgroundCursor = 0;
  const LINUX_BACKGROUND_RESULT_TTL_MS = 6500;
  // ARCHVERSE_LINUX_BACKGROUND_OCR_FAILURE_BACKOFF: a failed auxiliary lane must not launch
  // another multi-second RapidOCR/Tesseract fallback on every Mining tick.
  const LINUX_BACKGROUND_BACKOFF_BASE_MS = 15000;
  const LINUX_BACKGROUND_BACKOFF_MAX_MS = 120000;
  let linuxBackgroundFailureCount = 0;
  let linuxBackgroundBackoffUntil = 0;
  const takeLinuxBackgroundResult = (key) => {
    const row = linuxBackgroundLatest.get(key);
    if (!row) return null;
    linuxBackgroundLatest.delete(key);
    return Date.now() - row.at <= LINUX_BACKGROUND_RESULT_TTL_MS ? row.value : null;
  };
  const linuxOcrDue = (key, everyMs) => {
    const now = Date.now(), last = linuxOcrLastAt.get(key) || 0;
    if (now - last < everyMs) return false;
    linuxOcrLastAt.set(key, now);
    return true;
  };
  // Where the signature was last actually found, in FULL-FRAME pixels. The configured scan region
  // is a coarse "look roughly here" band — Sub's is 1170x324, of which the number occupies about
  // 400x40 dead centre; the rest is POWER MANAGEMENT / SHLD / MISL / SCM / distances, which cost
  // 16x their area to magnify and supply the stray numbers that get mistaken for signatures (a real
  // read of "6666" came from unrelated cockpit HUD). Once a real signature has been located, crop
  // to THAT instead. Falls back to the configured region the moment the lock goes stale, so losing
  // the number always recovers on its own.
  let sigBox = null, sigBoxAt = 0;
  const miningSignatureConfirmation = createMiningSignatureConfirmation();
  let miningConfirmationPending = false;
  const SIG_LOCK_MS = 12000;  // a lock older than this is not trusted — the HUD may have moved
  const tickStages = [];      // per-tick stage timings, drained by the heartbeat below
  const TICK_STAGES_MAX = 40; // ~2 minutes of mining ticks; a rolling window, never a transcript
  let lastHeartbeatAt = 0;    // last compact diagnostic written directly to electron.log
  const HEARTBEAT_MS = 15000;    // bounded evidence even when the sidecar cannot answer
  const uploaded = new Set(); // items pushed to the site this session
  const pendingUploads = new Map(); // item UUID -> display name|null: captured locally but NOT yet
  //                                   confirmed on the site; the drain loop retries until it lands
  let drainBusy = false;      // guard for the independent upload-drain loop
  let seededPending = false;  // have we reconciled the local capture folder vs the site's have-list?
  let remoteHave = null;      // set of items the site already has (dedup)
  let remoteHaveRefresh = null;
  let remoteHaveAt = 0;       // when remoteHave was last fetched
  // If the site rejects the sync token (401), pause upload retries until the token changes.
  let blockedToken = "";
  let authNotifiedToken = "";
  const REMOTE_TTL_MS = 3 * 60_000; // re-fetch the site's have-list this often

  const clearTokenBlockIfChanged = (token) => {
    if (blockedToken && token && token !== blockedToken) {
      blockedToken = "";
      authNotifiedToken = "";
    }
  };

  // What does the site already have? Skip capturing those. Re-fetched every REMOTE_TTL_MS so a
  // server-side delete/replace (or a failed upload) becomes capturable again WITHOUT restarting.
  async function ensureRemoteHave() {
    if (remoteHave && Date.now() - remoteHaveAt < REMOTE_TTL_MS) return remoteHave;
    if (remoteHaveRefresh) return remoteHaveRefresh;
    remoteHaveRefresh = (async () => {
      try {
        const r = await fetch(`${SITE}/api/sc/fab-needed`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (!Array.isArray(j.have)) throw new Error("invalid remote catalogue");
        remoteHave = new Set(j.have);
        remoteHaveAt = Date.now();
        for (const it of uploaded) if (!remoteHave.has(it)) uploaded.delete(it);
      } catch {
        if (!remoteHave) remoteHave = new Set();
        // Keep the last catalogue and retry after 30 seconds, independently of screen reads.
        remoteHaveAt = Date.now() - REMOTE_TTL_MS + 30000;
      }
      return remoteHave;
    })();
    try { return await remoteHaveRefresh; }
    finally { remoteHaveRefresh = null; }
  }

  async function upload(item, jpeg, token) {
    try {
      const r = await fetch(`${SITE}/api/sc/fab-image?item=${encodeURIComponent(item)}`, {
        method: "POST",
        headers: { "Content-Type": "image/jpeg", Authorization: `Bearer ${token}` },
        body: jpeg,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (r.ok) { uploaded.add(item); remoteHave?.add(item); return "ok"; }
      if (r.status === 401) {
        blockedToken = token;
        if (authNotifiedToken !== token) {
          authNotifiedToken = token;
          emitEvent({ state: "auth", reason: "invalid_token" });
        }
        console.error(`[fab-capture] upload ${item} -> HTTP 401 (invalid sync token)`);
        return "auth";
      }
      console.error(`[fab-capture] upload ${item} -> HTTP ${r.status}`);
    } catch (e) { console.error("[fab-capture] upload error:", e && e.message); }
    return "retry";
  }

  // ARCHVERSE_ALPHA23_REP_SCAN_LINUX_ISOLATED: REP uses the existing auxiliary OCR worker
  // and an independent adjustable crop. Mining vehicle authority defers this dispatcher below,
  // so REP OCR and its loopback requests can never consume the latency-critical Mining lane.
  async function postRepRead(repRead, image, frameWidth) {
    if (!repRead || !image) return false;
    let payload = null;
    if (repRead.ok && Array.isArray(repRead.cards) && repRead.cards.length) {
      payload = {
        scope: repRead.scope,
        giver: repRead.giver,
        faction: repRead.faction,
        bars: readBars(pixelsOf(image), repRead.cards, frameWidth),
      };
    } else if (!repRead.ok && repRead.report) {
      payload = {
        refusalOnly: repRead.refusal,
        faction: repRead.faction,
        section: repRead.section,
        giver: repRead.giver,
        tried: repRead.tried,
      };
    }
    if (!payload) return false;
    const response = await fetch(`http://127.0.0.1:${port}/api/rep-scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) throw new Error(`REP result delivery failed: HTTP ${response.status}`);
    return true;
  }

  async function tick() {
    const cfg = readConfig(configDir);
    clearTokenBlockIfChanged(cfg.syncToken || "");
    // Two independent opt-ins share one screen-read: image capture and pinned-mission OCR.
    // Either one arms the loop; each read is then gated by its own flag below.
    const fab = cfg.fabCapture === true;
    const miss = cfg.missionOcr === true;
    const rep = cfg.repScan === true;
    // Offer to tick blueprints the kiosk shows that we have no record of. Its own opt-in,
    // and enough on its own to justify arming the loop — it needs no upload and no token.
    const claim = cfg.fabClaim === true;
    // The Mining Assistant (refinery timers + signature scanner) also reads the screen;
    // refinery/mineable reads are routed to its tracker server-side in /api/screen-read.
    // 🔑 The opt-in alone is NOT enough — the widget also has to be able to use the answer.
    // This used to read the screen whenever `miningAssistant` was ticked, so a closed scanner
    // kept OCRing every tick forever, which is work nobody asked for and nobody could see.
    // Same rule as the widgets themselves: an invisible widget does no work beyond whatever is
    // needed to un-hide itself — hence `miningAutoShow`, which is exactly that exception: with
    // auto-show armed the scanner is closed ON PURPOSE and needs the read to pop itself open.
    // ARCHVERSE_LINUX_MINING_ARMED_INDEPENDENT_VISIBILITY: Linux OCR is a background data
    // collector once the user enables Mining Assistant. Widget visibility, auto-show, F, hover and
    // overlay focus are UI state only and must never arm/disarm the scanner.
    const mining = cfg.miningAssistant === true
      && (process.platform === "linux" || cfg.miningOpen === true || cfg.miningAutoShow === true);
    // ARCHVERSE_LOCATION_SYNC_V3_ONE_SHOT: a fresh Sync press arms exactly one bounded read even
    // when every continuous OCR feature is disabled. The timestamp expires by itself and each
    // request id is served at most once by this Electron process.
    const locateAt = Number(cfg.haulingLocateAt || 0);
    const locate = locateAt > 0 && Date.now() - locateAt < 20_000 && locateAt !== lastLocationRequestAt;
    // The foreground watcher is only worth running while something here is armed — with all three
    // opt-ins off this loop does nothing but re-read a config file every 3s, and shouldn't be
    // keeping a helper process alive to do it.
    if (!fab && !miss && !mining && !claim && !rep && !locate) { emitContext("off"); return; }
    // Never start a second capture/OCR cycle while the first still owns native image objects.
    // Clearing `busy` from a watchdog leaves the first async tick alive and can overlap
    // RapidOCR/sharp/libvips work. Report a slow cycle and skip this interval instead; the
    // original tick's finally block is the only place allowed to unlock the loop.
    if (busy) {
      const elapsed = Date.now() - busyAt;
      if (elapsed >= TICK_WATCHDOG_MS && Date.now() - lastSlowTickLogAt >= TICK_WATCHDOG_MS) {
        lastSlowTickLogAt = Date.now();
        console.warn(`[fab-capture] prior OCR tick still running after ${Math.round(elapsed / 1000)}s; skipping overlap (RapidOCR queue=${rapidOcrClient.queueDepth()})`);
      }
      return;
    }
    const tFg = Date.now();
    const fg = await foregroundWindow();
    const gameForeground = /^StarCitizen$/i.test(fg.name);
    const overlayForeground = fg.name === "ArchVerseOverlay";
    if (!gameForeground && !overlayForeground) {
      const gateKey = `${fg.gate || "unknown"}:${fg.name || "(none)"}`;
      if (gateKey !== lastForegroundGateLog) {
        lastForegroundGateLog = gateKey;
        console.log(`[screen-read] paused: foreground is not the bound game/ArchVerse (${gateKey})`);
      }
      if (locate) {
        lastLocationRequestAt = locateAt;
        deliverLocationResult({ error: "Star Citizen was not the active bound game window — bring the game/ArchVerse overlay forward and press Sync again.", requestAt: locateAt, totalMs: 0 });
      }
      emitContext("idle");
      return;
    }
    if (gameForeground && fg.rect) lastGameRect = fg.rect;
    if (gameForeground && /^\d+$/.test(String(fg.windowId || ""))) {
      boundGameWindowId = String(fg.windowId);
      boundGameWindowPid = Number(scSession.current()?.gamePid) || 0;
    }
    const gateKey = `${fg.gate || "unknown"}:${fg.name}`;
    if (gateKey !== lastForegroundGateLog) {
      lastForegroundGateLog = gateKey;
      console.log(`[screen-read] active capture gate: ${gateKey}`);
    }
    busy = true;
    busyAt = Date.now();
    // Per-stage timings for THIS tick. The loop self-tunes off the tick's total cost
    // (floor = lastTickMs * 1.5), so when a tick is slow the "fast" rate stops being fast — which
    // means knowing WHICH stage is expensive decides whether that is fixable. Filled in as the
    // tick proceeds and flushed with the heartbeat, so measuring costs no extra round-trips.
    const stage = { foreground: Date.now() - tFg };
    if (locate) {
      await runLocationSync(locateAt, gameForeground ? fg.rect : lastGameRect);
      stage.locationSync = "served";
      // A pure one-shot request must not pay for the ordinary OCR frame after it has its answer.
      if (!fab && !miss && !mining && !claim && !rep) { busy = false; busyAt = 0; return; }
    }
    // ARCHVERSE_LINUX_MINING_ELECTRON_HEARTBEAT: diagnostics stay visible even when the
    // sidecar is the failed component. Keep the record compact and bounded in electron.log.
    if (mining && Date.now() - lastHeartbeatAt > HEARTBEAT_MS) {
      lastHeartbeatAt = Date.now();
      const completed = tickStages.splice(0);
      const totals = completed.map((row) => Number(row?.total)).filter(Number.isFinite);
      const average = totals.length ? Math.round(totals.reduce((sum, value) => sum + value, 0) / totals.length) : 0;
      const maximum = totals.length ? Math.max(...totals) : 0;
      const transport = miningResultTransport.stats();
      console.log(`[mining-heartbeat] rate=${rate}ms last=${lastTickMs}ms samples=${totals.length} average=${average}ms max=${maximum}ms ipc_ack=${transport.acknowledged} ipc_failures=${transport.consecutiveFailures} ipc_pending=${transport.pending ? 1 : 0} capture=${_lastOcrCaptureInfo?.method || "unknown"}:${_lastOcrCaptureInfo?.captureMs ?? "?"}ms`);
    }
    try {
      // Remote Fabricator availability must never delay Mining or capture. The independent
      // upload drain shares this single refresh; capture uses the last completed catalogue.
      if (fab) void ensureRemoteHave();
      const have = fab ? (remoteHave || new Set()) : null;
      const t0 = Date.now();
      const cap = await captureGame(gameForeground ? fg.rect : lastGameRect); // ARCHVERSE_LINUX_TRUSTED_OVERLAY_CAPTURE: our overlay may own focus, but capture remains the bound game display
      const shot = cap && cap.image;
      if (!shot) return;
      // ARCHVERSE_LINUX_GAMELOG_VEHICLE_MINING_GATE: reuse the sidecar's authoritative Game.log
      // session state. Radar pixels, OCR vocabulary and signature glyphs cannot arm/disarm Mining.
      let vehiclePresence = mining && process.platform === "linux"
        ? await getVehiclePresence()
        : { active: mining === true, source: process.platform === "linux" ? "none" : "non-linux", ship: null, controlled: [] };
      stage.vehicleGate = vehiclePresence.active === true;
      stage.vehicleGateSource = vehiclePresence.source;
      stage.capture = Date.now() - t0;
      stage.frameAge = Number.isFinite(cap.frameAgeMs) ? cap.frameAgeMs : null;
      stage.frame = `${cap.width}x${cap.height}`;
      stage.miningOcrQueue = linuxOcrLaneClients.resourceSignature.queueDepth();
      stage.miningOcrRestarts = linuxOcrLaneClients.resourceSignature.restartCount();
      stage.backgroundOcrQueue = linuxOcrLaneClients.background.queueDepth();
      stage.backgroundOcrRestarts = linuxOcrLaneClients.background.restartCount();
      // 🔑 SKIP THE WHOLE-FRAME PASS WHILE ACTIVELY SCANNING. Measured 2026-08-08: encoding the
      // 3440x1440 PNG costs 1,104ms and the Windows OCR over it another 227ms — 1.33s of every
      // 4.6s tick — and for mining it produces nothing but wrong numbers (1922, 8401, 6001, 2006
      // in one session; zero correct reads, while the RapidOCR crop got every one right). It is
      // still the only thing that finds the fabricator kiosk and the pinned mission, so it is
      // skipped rather than removed, and only while a live signature lock says we are at a rock —
      // you cannot be at a kiosk and scanning an asteroid at the same time. The lock expires, so
      // a tick that finds nothing pays the full glance again and everything re-detects normally.
      const locked = mining && sigBox && Date.now() - sigBoxAt < SIG_LOCK_MS;
      let read = { kind: "none" };
      let renderSrc = shot;
      let runLinuxBackgroundOcr = null; // ARCHVERSE_LINUX_OCR_BACKGROUND_LANES
      if (process.platform === "linux") {
        // ARCHVERSE_LINUX_PER_WIDGET_OCR_REGIONS: Linux never OCRs the full frame. Each enabled
        // consumer reads only its independently calibrated region on the bound Star Citizen frame.
        stage.skippedFullFrame = true;
        const readRegion = async (key, enabled, everyMs = POLL_MS, alreadyDue = false, propagateFailure = false) => {
          if (!enabled || (!alreadyDue && !linuxOcrDue(key, everyMs))) return null;
          const t = Date.now();
          try {
            const got = await linuxOcrLane(key).readCrop({ shot, frameW: cap.width, frameH: cap.height, cfg, key });
            const repRegion = key === "reputation";
            const endpoint = repRegion ? "/api/rep-read" : "/api/screen-read";
            const resp = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                lines: got.lines, w: got.region.width, h: got.region.height, ocrRegion: key,
                offsetX: got.region.x, offsetY: got.region.y, frameW: cap.width, frameH: cap.height,
              }),
              signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
            if (!resp.ok) throw new Error(`${key} OCR route failed: HTTP ${resp.status}`);
            const read = await resp.json();
            if (repRegion) await postRepRead(read, got.crop, got.region.width);
            stage[`ocr_${key}`] = `${got.engine}:${Date.now() - t}ms:${got.region.width}x${got.region.height}`;
            return repRegion ? null : { ...got, read };
          } catch (error) {
            stage[`ocr_${key}_error`] = String(error?.message || error).slice(0, 180);
            if (propagateFailure) throw error;
            console.warn(`[ocr] ${key} crop failed:`, error?.message || error);
            return null;
          }
        };

        {
          // Consume only completed, recent background results. A result is single-use so an old
          // kiosk/mission observation cannot keep replaying after the player has moved away.
          const fabRead = takeLinuxBackgroundResult("fabricator");
          const claimRead = takeLinuxBackgroundResult("claimContext");
          const missionRead = takeLinuxBackgroundResult("mission");
          const refineryRead = takeLinuxBackgroundResult("refinery");
          if (fabRead?.read?.kind === "fabricator") { read = fabRead.read; renderSrc = fabRead.crop; }
          if (read.kind === "none" && claimRead?.read?.kind === "fabricator") { read = claimRead.read; renderSrc = claimRead.crop; }
          if (read.kind === "none" && missionRead?.read?.kind === "mission") read = missionRead.read;
          if (read.kind === "none" && refineryRead?.read?.kind === "refinery") read = refineryRead.read;
        }

        runLinuxBackgroundOcr = () => {
          const a = linuxOcrRegion(cfg, "fabricator"), b = linuxOcrRegion(cfg, "claimContext");
          const sameClaimRegion = ["x", "y", "w", "h"].every((k) => Math.abs(a[k] - b[k]) < 0.00001);
          const enabled = { fabricator: !!fab, claimContext: !!claim && !(sameClaimRegion && fab), mission: !!miss, refinery: !!mining, reputation: !!rep };
          // At most one auxiliary OCR process is dispatched at once. A failed lane backs off as a
          // group because every auxiliary lane shares the same worker/fallback resource budget.
          const backgroundNow = Date.now();
          if (linuxBackgroundInFlight.size || backgroundNow < linuxBackgroundBackoffUntil) return false;
          for (let step = 0; step < linuxBackgroundKeys.length; step += 1) {
            const idx = (linuxBackgroundCursor + step) % linuxBackgroundKeys.length;
            const key = linuxBackgroundKeys[idx];
            if (!enabled[key] || !linuxOcrDue(key, POLL_MS)) continue;
            linuxBackgroundCursor = (idx + 1) % linuxBackgroundKeys.length;
            linuxBackgroundInFlight.add(key);
            const launchedAt = Date.now();
            void readRegion(key, true, POLL_MS, true, true).then((value) => {
              linuxBackgroundFailureCount = 0;
              linuxBackgroundBackoffUntil = 0;
              if (value) {
                linuxBackgroundLatest.set(key, { at: Date.now(), value });
                if (key === "fabricator" && sameClaimRegion && claim)
                  linuxBackgroundLatest.set("claimContext", { at: Date.now(), value });
              }
            }).catch((error) => {
              linuxBackgroundFailureCount = Math.min(8, linuxBackgroundFailureCount + 1);
              const delay = Math.min(LINUX_BACKGROUND_BACKOFF_MAX_MS,
                LINUX_BACKGROUND_BACKOFF_BASE_MS * (2 ** Math.min(3, linuxBackgroundFailureCount - 1)));
              linuxBackgroundBackoffUntil = Date.now() + delay;
              console.warn(`[ocr-bg] ${key} lane failed; auxiliary OCR paused for ${delay}ms:`, error?.message || error);
            }).finally(() => {
              linuxBackgroundInFlight.delete(key);
              const ms = Date.now() - launchedAt;
              if (ms >= 1500) console.log(`[ocr-bg] ${key} lane settled in ${ms}ms`);
            });
            return true;
          }
          return false;
        };
      } else {
        // Windows keeps the upstream Windows.Media.Ocr full-frame glance. Linux cannot enter here.
        const needGeneric = fab || miss || claim || mining || rep;
        if (!locked && needGeneric) {
          try {
            const t1 = Date.now();
            const tmpShot = tmpShots[tmpShotIdx = (tmpShotIdx + 1) % tmpShots.length];
            fs.writeFileSync(tmpShot, shot.toPNG());
            stage.pngFull = Date.now() - t1;
            const t2 = Date.now();
            const resp = await fetch(`http://localhost:${port}/api/screen-read`, {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: tmpShot }),
              signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
            read = await resp.json();
            if (rep && read?.rep) await postRepRead(read.rep, shot, cap.width);
            stage.winOcr = Date.now() - t2;
          } catch (e) { stage.glanceError = String(e?.message || e).slice(0, 200); }
        } else stage.skippedFullFrame = true;

        if (read.kind === "fabricator" && fab && cfg.rapidOcr !== false) {
          try {
            const panel = rightPanelCrop(shot, cap.width, cap.height); fs.writeFileSync(tmpPanel, panel.img.toPNG());
            const lines = await ocrRapidLines(tmpPanel);
            const r2 = await fetch(`http://localhost:${port}/api/screen-read`, {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines, w: panel.w, h: panel.h }),
              signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
            const rr = await r2.json();
            if (rr.kind === "fabricator" && rr.item) { read = rr; renderSrc = panel.img; }
          } catch (e) { console.warn("[fab-capture] RapidOCR re-read failed, using Windows OCR:", e && e.message); }
        }
      }
      // Pass 3 — same dual-engine idea, for the mining signature: once pass 1 says the scanner is
      // up (its own HUD text, or a signature already parsed), re-read JUST the configured scan
      // region with RapidOCR. Windows OCR mangles this number often enough that most scans never
      // produced a candidate to classify at all (Rytharr, 2026-08-07) — the same class of problem
      // Pass 2 already exists to solve for the kiosk. Cropped tight to the region rather than the
      // whole frame, so it's cheap even at the fast poll rate while actively scanning.
      // 🔑 NO Pass-1 PRECONDITION ANY MORE. This gate used to require `read.scanHud` or a Pass-1
      // signature — both of which come from the whole-frame Windows OCR, i.e. the pass that is now
      // skipped while locked and that fails outright ~42% of the time otherwise. Gating the ONLY
      // trustworthy mining reader behind the least trustworthy one is backwards: RapidOCR got every
      // signature right in a measured session while Windows OCR got none. If mining is armed, look.
      const linuxMiningNumericDue = process.platform !== "linux" || (vehiclePresence.active === true
        && (locked || Date.now() - lastMiningNumericProbeAt >= MINING_VEHICLE_IDLE_MS));
      // ARCHVERSE_LINUX_GAMELOG_VEHICLE_NUMERIC_GATE: on Linux the RS reader is dormant on foot and
      // runs every ~1.2s while Game.log says the player is aboard. No radar/OCR wording prerequisite.
      if (mining && (process.platform !== "linux" || linuxMiningNumericDue)) {
        try {
          if (process.platform === "linux") lastMiningNumericProbeAt = Date.now();
          const full = linuxOcrRegionPixels(cfg, "resourceSignature", cap.width, cap.height);
          // During acquisition, tolerate modest ship/planet HUD drift around a tight calibration.
          // A lock still tightens inside the user's exact saved region. Distance-unit tokens in
          // the safety margin are rejected by mining-result-transport before catalog admission.
          const region = locked
            ? tightenRegion(full, sigBox)
            : expandMiningAcquisitionRegion(full, cap.width, cap.height);
          const crop = shot.crop(region);
          // Magnify BEFORE OCR-ing, not for the player — this crop never touches the screen, it
          // only feeds the OCR engine. The signature text is ~19px tall in the raw crop; both OCR
          // engines are tuned on normal document-scale text and read small, thin HUD digits far
          // less reliably than the same shapes several times larger (6-vs-8 confusion especially —
          // the difference is a closed vs. open loop that gets much easier to resolve once it's not
          // a handful of pixels). MINING_OCR_SCALE stays local to this crop; nothing else changes.
          // 🔑 Magnification is spent where it pays. Locked, the crop is ~167x60, so 4x is only
          // 0.16MP and the extra detail is nearly free — worth having, since 6-vs-8 is a closed-vs-
          // open loop that needs the pixels. UNLOCKED, the crop is the whole configured band
          // (1170x324 on Sub's setup) and 4x makes it 6.07MP — larger in area than the full screen
          // it was meant to be cheaper than, at ~2.9s a tick. 2x keeps acquisition legible at a
          // quarter of the cost; once a signature is found the lock hands us the tight crop and the
          // detail comes back.
          // ARCHVERSE_LINUX_MINING_SCALE_GUARD: 4x is reserved for a genuinely tight lock.
          // If a coordinate regression ever leaves us with a large region, fail safe to 2x rather
          // than turning a ~650x400 crop into a multi-megapixel OCR job.
          const tightLock = locked && (region.width * region.height <= 120000)
            && region.width <= Math.max(320, full.width * 0.75)
            && region.height <= Math.max(140, full.height * 0.75);
          const MINING_OCR_SCALE = tightLock ? 4 : 2;
          const t3 = Date.now();
          const big = crop.resize({
            width: region.width * MINING_OCR_SCALE,
            height: region.height * MINING_OCR_SCALE,
            quality: "best",
          });
          fs.writeFileSync(tmpMiningCrop, big.toPNG());
          // 🔑 The magnified pixel COUNT is the number that matters — RapidOCR is PP-OCR, a
          // detection net whose cost scales with area, so 4x linear is 16x the work. Recorded so
          // the scale factor can be chosen by measurement instead of by feel.
          stage.cropPrep = Date.now() - t3;
          stage.cropPx = `${region.width * MINING_OCR_SCALE}x${region.height * MINING_OCR_SCALE}`;
          stage.scale = MINING_OCR_SCALE;
          stage.region = `${region.width}x${region.height}@${region.x},${region.y}`;
          // Opt-in capture of the EXACT bitmap the OCR was handed. Reading the parsed text tells
          // you what the engine decided; only the image tells you what it was looking at — whether
          // the number was even in the crop, how much unrelated HUD came with it, and whether the
          // magnification is helping or just costing. Kept to a small rolling set of files.
          if (cfg.miningDebug === true || process.env.SCBT_MINING_DEBUG === "1") { try { saveDebugFrame(big, crop); } catch { /* best effort */ } }
          const t4 = Date.now();
          const miningOcr = process.platform === "linux"
            ? await linuxOcrLane("resourceSignature").ocrLines(tmpMiningCrop, { key: "resourceSignature", numeric: true })
            : { engine: "rapidocr", lines: await ocrRapidLines(tmpMiningCrop) };
          const lines = miningOcr.lines.map((l) => ({
            text: l.text,
            x: l.x / MINING_OCR_SCALE, y: l.y / MINING_OCR_SCALE,
            w: l.w / MINING_OCR_SCALE, h: l.h / MINING_OCR_SCALE,
          })); // back to the ORIGINAL crop's pixel space before anything downstream sees them
          stage.rapidOcr = Date.now() - t4;
          stage.miningOcrEngine = miningOcr.engine;
          // ARCHVERSE_LINUX_MINING_LOCAL_ADMISSION: the exact catalog and false-context rules
          // run beside OCR. The authoritative sidecar repeats the same checks before state changes.
          const parseStartedAt = Date.now();
          const rr3 = classifyMiningOcrLines(lines, {
            width: region.width,
            offsetX: region.x,
            offsetY: region.y,
          });
          stage.miningParse = Date.now() - parseStartedAt;
          // A distinct frame is still mandatory. Stream backends retain the fast 1.6-second
          // window; screenshot backends get a measured deadline so a slow Spectacle cycle cannot
          // expire a valid first observation before the second frame exists.
          const confirmationWindowMs = /^(?:gamescope-pipewire|electron-star-citizen-window-stream)$/.test(cap.method)
            ? 1600
            : Math.min(15000, Math.max(1600, (Number(cap.captureMs) || 3125) * 4 + 2500));
          const confirmation = rr3.kind === "mineable"
            ? miningSignatureConfirmation.observe(rr3, cap.frameToken, { windowMs: confirmationWindowMs })
            : miningSignatureConfirmation.observe(null, cap.frameToken);
          miningConfirmationPending = confirmation.status === "pending" || miningSignatureConfirmation.isPending();
          const miningPayload = {
            lines, w: region.width, h: region.height, miningCrop: true,
            commitMining: confirmation.status === "confirmed", pollMs: rate,
            ocrRegion: "resourceSignature", offsetX: region.x, offsetY: region.y,
            frameW: cap.width, frameH: cap.height,
          };
          miningResultTransport.submit(miningPayload, {
            localResult: rr3,
            confirmationStatus: confirmation.status,
            captureMethod: cap.method,
            queuedAt: Date.now(),
          });
          stage.miningIpc = confirmation.status === "confirmed" ? "commit-queued" : "observation-queued";
          const rr3Observed = typeof rr3.observedSignature === "number" ? rr3.observedSignature : null;
          const rr3Signature = typeof rr3.signature === "number" ? rr3.signature : null;
          const rr3SignatureClass = Number.isFinite(rr3Signature) && rr3Signature >= MINING_SIGNATURE_EARLY_FLOOR
            ? classifyMiningSignature(rr3Signature)
            : { valid: false, reason: "below-prefilter", matches: [] };
          const rr3SignatureAllowed = rr3SignatureClass.valid === true;
          // ARCHVERSE_LINUX_MINING_OCR_DIAGNOSTICS
          const miningOcrSample = lines.map((l) => String(l.text || "").trim()).filter(Boolean).slice(0, 8).join(" | ");
          const miningOcrNow = Date.now();
          if (rr3.kind === "mining-observation" && rr3Observed !== null
              && (lastMiningOcrSig !== `observed:${rr3Observed}` || miningOcrNow - lastMiningOcrLogAt >= 5000)) {
            console.log(`[mining-ocr] observed unclassified RS ${rr3Observed} via ${cap.method}; not committed; context=${rr3.context || "structural"} text="${miningOcrSample}"`);
            lastMiningOcrLogAt = miningOcrNow;
            lastMiningOcrSig = `observed:${rr3Observed}`;
          }
          if (rr3.kind === "mineable" && rr3SignatureAllowed) {
            const miningOcrKey = `${rr3.signature}:${confirmation.status}`;
            if (miningOcrKey !== lastMiningOcrSig || miningOcrNow - lastMiningOcrLogAt >= 5000) {
              const commitState = confirmation.status === "confirmed" ? "queued" : "pending-distinct-frame";
              console.log(`[mining-ocr] signature ${rr3.signature} via ${cap.method}; rs="${miningSignatureLabel(rr3SignatureClass)}" crop=${stage.region} scale=${MINING_OCR_SCALE} ocr=${stage.rapidOcr}ms commit=${commitState} text="${miningOcrSample}"`);
              lastMiningOcrLogAt = miningOcrNow;
            }
            lastMiningOcrSig = miningOcrKey;
          } else if (rr3.kind === "mineable" && rr3Signature !== null && !rr3SignatureAllowed) {
            console.log(`[mining-ocr] rejected candidate ${rr3Signature} by current RS catalog (${rr3SignatureClass.reason || "invalid"}) via ${cap.method}; text="${miningOcrSample}"`);
            lastMiningOcrLogAt = miningOcrNow;
            lastMiningOcrSig = null;
          } else if (miningOcrNow - lastMiningOcrLogAt >= 5000) {
            console.log(`[mining-ocr] no signature via ${cap.method}; crop=${stage.region} scale=${MINING_OCR_SCALE} ocr=${stage.rapidOcr}ms text="${miningOcrSample}"`);
            lastMiningOcrLogAt = miningOcrNow;
            lastMiningOcrSig = null;
          }
          // ARCHVERSE_LINUX_MINING_COORDINATE_AUTHORITY: /api/screen-read receives offsetX/Y and
          // returns pin/text in FULL-FRAME coordinates. Adding region.x/y here a second time was
          // the lock bug that turned a successful hit back into a full-size 4x OCR crop.
          if (rr3.kind === "mineable" && rr3SignatureAllowed && rr3.pin && rr3.text) {
            // A first sighting narrows the next OCR crop but cannot change Mining state. Only the
            // same value at the same location on a distinct source frame is committed.
            if (confirmation.status === "confirmed") {
              read = { ...read, kind: "mineable", signature: rr3.signature, raw: rr3.raw,
                pin: rr3.pin, text: rr3.text, miningTransportQueued: true };
            }
            sigBox = rr3.text;
            sigBoxAt = Date.now();
          } else if (locked) {
            // Locked but the tight crop found nothing — drop the lock so the NEXT tick searches the
            // full region again. Without this a single bad lock could keep re-cropping empty space
            // and the scanner would go quiet until the timeout, every time.
            sigBox = null;
          }
        } catch (e) {
          if (process.platform === "linux") {
            console.warn("[mining-ocr] capture/OCR/local-parse stage failed; stale frame discarded and OCR worker recovery scheduled:", e && e.message); // ARCHVERSE_LINUX_MINING_OCR_RECOVERY
          } else {
            console.warn("[fab-capture] mining RapidOCR re-read failed; retaining Windows OCR result:", e && e.message);
          }
        }
      }
      // Mining is latency-critical. Background OCR is intentionally deferred until its read is
      // complete, and an active radar/signature frame skips those unrelated consumers altogether.
      // They resume automatically on the next non-scanning frame.
      // ARCHVERSE_LINUX_MINING_EXCLUSIVE_OCR: no auxiliary OCR process may compete while
      // Game.log keeps the latency-critical Mining lane active.
      if (runLinuxBackgroundOcr && !(mining && process.platform === "linux" && vehiclePresence.active === true)) {
        runLinuxBackgroundOcr();
        stage.backgroundOcr = linuxBackgroundInFlight.size ? "background-dispatched" : "background-idle";
      } else if (runLinuxBackgroundOcr) {
        stage.backgroundOcr = "deferred-for-mining";
      }

      // Cadence. Scanning ore is a live feedback loop: you shoot a rock and want to hear what it
      // is immediately, so while the scan HUD is on screen the loop runs at FAST_MS. Everything
      // else — and the fabricator ABOVE ALL — stays at the slow rate, because rushing a kiosk
      // risks grabbing a render mid-fade. A kiosk frame cancels fast mode outright.
      if (read.kind === "fabricator") fastUntil = 0;
      // 🔑 A PARSED SIGNATURE IS THE PROOF, not the HUD's wording. Fast mode used to arm only on
      // read.scanHud — an OCR text match for "scanning / ready to scan / strong / moderate /
      // weak". That is the mining scanner's vocabulary, and the line it comes from is USER
      // CONFIGURABLE: a player can restyle that HUD element or switch it off entirely, and head
      // position can carry it out of frame (Sub, in a Vulture, 2026-08-03 — the loop sat at 3s
      // while he was actively scanning). Same mistake as the absolute glyph colour: keying on
      // something that varies per player when a universal signal is right there.
      //
      // The signature number and its pin are the universal part — same place, same shape, in
      // every ship; only the colour changes. So a frame that yielded a signature IS a frame where
      // the player is scanning, whatever the HUD says or doesn't. scanHud is KEPT as an
      // additional trigger because it fires on "ready to scan", i.e. slightly BEFORE the first
      // number exists — useful when it happens to be there, never required.
      else if (mining && process.platform === "linux"
          && vehiclePresence.active === true && typeof read.signature === "number") fastUntil = Date.now() + FAST_WINDOW_MS;
      else if (mining && process.platform !== "linux"
          && (read.scanHud || typeof read.signature === "number")) fastUntil = Date.now() + FAST_WINDOW_MS;
      // Linux Mining uses exact acquisition and locked rates. The single-flight scheduler
      // already prevents overlapping work. Windows retains a rounded load-sensitive rate.
      const currentTickMs = Math.max(1, Date.now() - busyAt);
      // ARCHVERSE_LINUX_MINING_STABLE_CADENCE: acquisition uses 500ms, a pending candidate
      // requests a distinct frame after 250ms, and a confirmed lock uses 350ms. Single-flight OCR
      // prevents overlap, so a slow frame cannot create concurrent capture or OCR work.
      const linuxMiningRate = vehiclePresence.active === true
        ? (miningConfirmationPending ? MINING_CONFIRM_MS : (Date.now() < fastUntil ? FAST_MS : MINING_VEHICLE_IDLE_MS))
        : POLL_MS;
      const nonLinuxFloor = Math.max(FAST_MS, Math.min(POLL_MS, Math.ceil(currentTickMs * 1.5 / 100) * 100));
      const want = process.platform === "linux" && mining
        ? linuxMiningRate
        : (Date.now() < fastUntil ? nonLinuxFloor : POLL_MS);
      if (want !== rate) {
        rate = want;
        console.log(`[fab-capture] poll ${rate}ms${rate === FAST_MS ? " (scanning)" : ""}`);
      }

      // ARCHVERSE_LINUX_MINING_VEHICLE_RS_AUTHORITY: Linux commits only when (1) the existing
      // Game.log watcher says the player is aboard a ship / controlling a vehicle and (2) the
      // numeric Resource Signature passed the exact current RS catalog. Radar is not consulted.
      if (read.kind === "mineable" && typeof read.signature === "number" && read.pin) {
        const confirmed = process.platform !== "linux" || vehiclePresence.active === true;
        const integratedMiningCommit = process.platform === "linux" && read.miningTransportQueued === true;
        if (confirmed) {
          if (!integratedMiningCommit) {
            queueMiningScanPost({
              signature: read.signature, confirmed: true,
              raw: read.raw, text: read.text, pollMs: rate, scanHud: read.scanHud === true,
              scanMode: { confidence: 100, method: "gamelog-vehicle+rs", source: vehiclePresence.source || "non-linux", ship: vehiclePresence.ship || null, controlled: vehiclePresence.controlled || [] },
              frame: { w: shot.getSize().width, h: shot.getSize().height },
            });
          }
        } else if (Date.now() - lastMiningAuthorityRejectAt >= 5000) {
          lastMiningAuthorityRejectAt = Date.now();
          console.log(`[mining-authority] candidate ${read.signature} refused before IPC: vehicle=0 (valid RS present)`);
        }
      }
      // A kiosk on screen -> "fabricator" context (gold diamond) even if image capture is off;
      // anything else while watching -> "watching".
      emitContext(read.kind === "fabricator" ? "fabricator" : "watching");
      if (read.kind !== "fabricator") { lastUnresolved = ""; unresolvedTries = 0; lastHave = ""; lastRenderWait = ""; } // left the kiosk
      if (read.kind === "fabricator" && read.item) {
        lastUnresolved = ""; unresolvedTries = 0;
        // Claim prompt: the kiosk only lists blueprints you OWN, so a blueprint here that the
        // tracker has no record of is ownership the log never reported (a receipt that predates
        // the install, or one whose logbackup has rotated away). Offer to tick it.
        // 🔑 Deliberately BEFORE the `!fab` return: this is its own opt-in and needs neither an
        // upload nor a sync token, so it must work with image capture switched off.
        if (claim) {
          try {
            await fetch(`http://localhost:${port}/api/fab/seen`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ item: read.item, items: read.items || [], name: read.name || "" }),
              signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
          } catch (e) { console.warn("[fab-claim] seen post failed:", e && e.message); }
        }
        if (!fab) { pendingItem = null; return; } // image capture disabled — ignore kiosk frames
        const item = read.item; // canonical UUID — settle key + local file name
        // One display name can map to several distinct same-named items (e.g. the 3 sizes of
        // "Cinch Scraper Module"); the log/kiosk can't say which, so they share one image.
        // Capture as long as ANY sibling still lacks it, and upload to every missing one.
        const targets = Array.isArray(read.items) && read.items.length ? read.items : [item];
        const missing = targets.filter((t) => !uploaded.has(t) && !have.has(t));
        // Dedup: every sibling already covered (uploaded this session or the site has it).
        // Surface it once so the user sees it was recognized but there's nothing to capture.
        if (missing.length === 0) {
          pendingItem = null;
          if (item !== lastHave) { lastHave = item; emitEvent({ state: "have", name: read.name }); }
          return;
        }
        // Settle: the kiosk's 3D render fades in over ~1-2s, so a first-glimpse capture
        // can come out half-loaded / see-through. Require the item to still be on screen
        // SETTLE_MS later before capturing, giving the render time to finish.
        // 🔑 Measured in TIME, not in polls. It used to be "still there a poll later", which
        // silently meant ~3s only because the loop ticked every 3s — the moment the loop speeds
        // up for ore scanning, a poll-based settle would start grabbing kiosk renders mid-fade.
        // Sub's rule: going faster for mining must not change anything at the terminal.
        if (pendingItem !== item) {
          pendingItem = item;
          pendingAt = Date.now();
          renderTries = 0; renderStuck = false; // fresh item — reset the render-stuck tracking
          emitEvent({ state: "settling", name: read.name });
          console.log(`[fab-capture] ${read.name}: waiting for render to settle`);
          return;
        }
        // Still inside the settle window (a fast mining cadence can bring us back here in <1s).
        if (Date.now() - pendingAt < SETTLE_MS) return;
        const c = read.crop;
        // Crop the render from whichever frame produced `read` — the panel crop (RapidOCR path,
        // its crop is panel-relative) or the full frame (Windows OCR path).
        const cropped = centerTighten(renderSrc.crop({ x: c.x, y: c.y, width: c.w, height: c.h }));
        if (!hasRender(cropped)) {
          renderTries++;
          // Some items (quantum drives + certain ship components) show a dark schematic in the
          // kiosk, not a lit 3D model, so the render check never passes — the loop would otherwise
          // sit on "waiting for render…" forever. After several polls, report it as STUCK so the
          // widget can tell the user this item can't be captured, instead of looking like it's loading.
          const stuck = renderTries >= 4;
          if (item !== lastRenderWait) { lastRenderWait = item; emitEvent({ state: "render", name: read.name, stuck: false }); }
          if (stuck && !renderStuck) { renderStuck = true; emitEvent({ state: "render", name: read.name, stuck: true }); }
          console.log(`[fab-capture] ${read.name}: render not loaded (try ${renderTries})${stuck ? " — giving up: no capturable render" : ", will retry"}`);
          return; // keep pendingItem so the next poll retries
        }
        lastRenderWait = ""; renderTries = 0; renderStuck = false;
        // Opaque teal kiosk background -> JPEG (small, fits the ingest cap).
        const jpeg = cropped.toJPEG(82);
        fs.mkdirSync(captureDir, { recursive: true });
        fs.writeFileSync(path.join(captureDir, `${item}.jpg`), jpeg);
        // Keep the FULL uncropped frame too — it carries the materials list, stats,
        // fabrication time + recipe we may mine later. One per item.
        fs.mkdirSync(shotsDir, { recursive: true });
        fs.writeFileSync(path.join(shotsDir, `${item}.jpg`), (process.platform === "linux" ? renderSrc : shot).toJPEG(85)); // ARCHVERSE_LINUX_NO_FULL_FRAME_OCR_ARCHIVE
        let uploadedOk = false;
        let authFail = false;
        if (cfg.syncToken) {
          if (blockedToken && cfg.syncToken === blockedToken) {
            authFail = true;
            if (authNotifiedToken !== cfg.syncToken) {
              authNotifiedToken = cfg.syncToken;
              emitEvent({ state: "auth", reason: "invalid_token" });
            }
            // Token is known bad; queue locally and wait for a re-link rather than hammering.
            missing.forEach((t) => pendingUploads.set(t, read.name));
          } else {
            // Share the one capture across every sibling that still lacks it (name collision).
            const oks = await Promise.all(missing.map((t) => upload(t, jpeg, cfg.syncToken)));
            uploadedOk = oks.every((v) => v === "ok");
            authFail = oks.some((v) => v === "auth");
            // Any sibling whose upload didn't land: keep the local JPEG and QUEUE it. The drain loop
            // retries from disk until the server has it, so a transient failure (or a wedge) can't
            // leave a captured item silently unshared — and the user isn't told "done" when it isn't.
            missing.forEach((t, i) => { if (oks[i] !== "ok") pendingUploads.set(t, read.name); });
          }
          const label = missing.length > 1 ? `${read.name} (${missing.length} sizes)` : `${read.name} (${item})`;
          if (authFail) console.log(`[fab-capture] sync token invalid — queued locally until relink (${label})`);
          else console.log(`[fab-capture] ${uploadedOk ? "uploaded" : "upload failed — queued for retry"} ${label}`);
        } else {
          console.log(`[fab-capture] saved ${read.name} (${item}) — no sync token, not uploaded`);
        }
        // uploaded:true  => confirmed on the site. queued:true => saved + retrying (NOT done yet).
        emitEvent({ state: "captured", name: read.name, uploaded: uploadedOk, queued: !uploadedOk && !!cfg.syncToken });
        if (authFail) emitEvent({ state: "auth", reason: "invalid_token" });
      } else if (read.kind === "fabricator" && fab) {
        // In the kiosk with image capture on, but the item name didn't resolve to a known
        // blueprint (still rendering in, or an item not in our dataset) — so there's nothing
        // to tag a capture with. Surface it once per item so the user knows why no picture
        // was taken, rather than the loop failing silently.
        pendingItem = null;
        unresolvedTries++;
        const raw = (read.nameRaw || "").trim();
        // Require the unreadable state to persist a poll before warning, so a kiosk that's just
        // mid-load (the name/render still fading in) doesn't flash a false "couldn't read".
        if (unresolvedTries >= 2 && raw !== lastUnresolved) {
          lastUnresolved = raw;
          emitEvent({ state: "unresolved", nameRaw: raw });
          console.log(`[fab-capture] kiosk item not identified${raw ? `: "${raw}"` : ""}`);
        }
      } else if (read.kind === "mission" && miss && read.titleRaw && read.titleRaw !== lastMission) {
        // Tell the tracker which mission is pinned in-game (ground truth the log lacks).
        lastMission = read.titleRaw;
        emitEvent({ state: "mission", title: read.titleRaw });
        try {
          await fetch(`http://localhost:${port}/api/missions/screen`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: read.titleRaw }),
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });
        } catch { /* best effort */ }
      }
    } catch (e) {
      console.error("[fab-capture] tick error:", e && e.message);
      // 🔑 Carried on the tick record, not just console.error'd. This process is a detached GUI
      // child with no stdout, so a throw here is INVISIBLE — which is exactly how half of a
      // measured run came back with only the `capture` stage filled in and no explanation
      // (Sub, 2026-08-08). A stage that stops recording is a symptom; the message is the cause.
      stage.error = String((e && e.message) || e).slice(0, 300);
    } finally {
      lastTickMs = Date.now() - busyAt;
      // Buffered, not posted per tick — a round-trip inside the very loop being measured would
      // change the number it is trying to report. The heartbeat drains this.
      if (mining) {
        tickStages.push({ total: lastTickMs, ...stage });
        if (tickStages.length > TICK_STAGES_MAX) tickStages.shift();
      }
      busy = false;
      lastSlowTickLogAt = 0;
    }
  }

  // Independent upload-drain loop. Uploads captured-but-unconfirmed items from their saved local
  // JPEGs until the server actually has them — decoupled from the screen-read tick and its busy
  // flag, so it drains even while the user is off the kiosk (no re-scan needed). On the FIRST pass
  // it reconciles the whole fab-captures folder against the site's have-list, so captures stranded
  // by a past failure/wedge self-heal on the next launch instead of being silently lost.
  async function drainPending() {
    const cfg = readConfig(configDir);
    clearTokenBlockIfChanged(cfg.syncToken || "");
    if (cfg.fabCapture !== true || !cfg.syncToken) return; // needs opt-in + a token to upload
    if (blockedToken && cfg.syncToken === blockedToken) return; // known bad token; wait for re-link
    if (drainBusy) return;
    drainBusy = true;
    try {
      const have = await ensureRemoteHave();
      if (!seededPending) {
        seededPending = true;
        try {
          for (const f of fs.readdirSync(captureDir)) {
            if (!f.endsWith(".jpg")) continue;
            const it = f.slice(0, -4);
            if (!have.has(it) && !uploaded.has(it) && !pendingUploads.has(it)) pendingUploads.set(it, null);
          }
        } catch { /* no captures dir yet */ }
        if (pendingUploads.size) console.log(`[fab-capture] reconcile: ${pendingUploads.size} local capture(s) not on the server — uploading`);
      }
      for (const [it, name] of [...pendingUploads]) {
        if (have.has(it) || uploaded.has(it)) { pendingUploads.delete(it); continue; } // already there
        let jpeg;
        try { jpeg = fs.readFileSync(path.join(captureDir, `${it}.jpg`)); }
        catch { pendingUploads.delete(it); continue; } // local file gone — nothing to retry
        const st = await upload(it, jpeg, cfg.syncToken);
        if (st === "ok") {
          pendingUploads.delete(it);
          emitEvent({ state: "shared", name, pending: pendingUploads.size });
          console.log(`[fab-capture] retry uploaded ${name || it} (${pendingUploads.size} still pending)`);
        } else if (st === "auth") {
          return; // token invalid: stop retry churn until token changes
        }
      }
    } catch (e) {
      console.error("[fab-capture] drain error:", e && e.message);
    } finally {
      drainBusy = false;
    }
  }

  // ARCHVERSE_LINUX_MINING_LATEST_FRAME_SCHEDULER: schedule from each tick's start time.
  // A slow tick never overlaps another tick and does not add a second full polling delay.
  let timer = null;
  let schedulerClosed = false;
  const scheduleNextTick = (elapsedMs = 0) => {
    if (schedulerClosed) return;
    timer = setTimeout(runScheduledTick, Math.max(25, rate - elapsedMs));
    timer.unref?.();
  };
  const runScheduledTick = async () => {
    const startedAt = Date.now();
    try { await tick(); }
    finally { scheduleNextTick(Date.now() - startedAt); }
  };
  scheduleNextTick(0);
  const drainTimer = setInterval(drainPending, DRAIN_MS);
  drainTimer.unref?.();
  console.log("[fab-capture] loop armed with latest-frame self-scheduler (opt-in via config.fabCapture)");
  return () => {
    schedulerClosed = true;
    clearTimeout(timer);
    clearInterval(drainTimer);
    vehiclePresenceClient.close?.();
    miningResultTransport.close();
    _rapidFailureReporter = null;
  };
}

module.exports = { startFabCapture, getOcrCaptureInfo, centerTighten, findScanGlyph, GLYPH, __test: { classifyLinuxForeground, cleanX11Field, visualFingerprint, fingerprintDistance, linuxOcrRegionPixels, expandMiningAcquisitionRegion, recordCaptureResult } };
