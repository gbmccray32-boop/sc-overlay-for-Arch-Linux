'use strict';

// ARCHVERSE_LOCATION_SYNC_PIPEWIRE_DIAGNOSTIC_V2
// Quarantined one-shot diagnostic. It does not alter hauling state or the normal capture loop.
// It compares direct Gamescope PipeWire against the actual KDE Spectacle fallback used on Linux.
// Privacy rule: only bounded top-right CamPos search crops are persisted. No full frame is written.

const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { getStarCitizenSessionBinder } = require('./linux/star-citizen-session.cjs');
const { parsePwDump, selectGamescopeNode, parseEnumFormat } = require('./native-linux-gamescope-pipewire.cjs');
const { createRapidOcrClient } = require('./rapidocr-client.cjs');

const WIDTH_FRAC = 0.62;
const HEIGHT_FRAC = 0.42;
const MAX_NATIVE_WIDTH = 2400;
const MAX_NATIVE_HEIGHT = 1000;
const MIN_NATIVE_WIDTH = 1100;
const MIN_NATIVE_HEIGHT = 520;
const MAX_OCR_WIDTH = 5200;
const REQUESTED_SCALE = 3;
const DEFAULT_DELAY_MS = 6000;
const CAM_POS_RE = /(?:cam|can|carn)\s*pos[^\n]*?zone\s*[:.]?\s*(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)/i;

function runFile(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || stdout || error.message || error).trim();
        const wrapped = new Error(detail || String(error));
        wrapped.code = error.code;
        reject(wrapped);
        return;
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function propsOf(object) { return object?.info?.props && typeof object.info.props === 'object' ? object.info.props : {}; }
function numericPid(value) {
  const n = Number(String(value ?? '').trim());
  return Number.isInteger(n) && n > 1 ? n : null;
}
function clientPid(client) {
  const p = propsOf(client);
  for (const key of ['application.process.id', 'pipewire.client.pid', 'process.id', 'application.process.pid']) {
    const pid = numericPid(p[key]);
    if (pid) return pid;
  }
  return null;
}

function parseCamPos(lines) {
  const texts = (Array.isArray(lines) ? lines : []).map((line) => String(line?.text ?? line ?? ''));
  for (const text of texts) {
    const match = CAM_POS_RE.exec(text);
    if (match) return { x: Number(match[1]), y: Number(match[2]), z: Number(match[3]) };
  }
  const match = CAM_POS_RE.exec(texts.join(' '));
  return match ? { x: Number(match[1]), y: Number(match[2]), z: Number(match[3]) } : null;
}

function topRightCrop(width, height) {
  const wantedW = Math.round(width * WIDTH_FRAC);
  const wantedH = Math.round(height * HEIGHT_FRAC);
  const cropW = Math.min(width, Math.max(Math.min(width, MIN_NATIVE_WIDTH), Math.min(wantedW, MAX_NATIVE_WIDTH)));
  const cropH = Math.min(height, Math.max(Math.min(height, MIN_NATIVE_HEIGHT), Math.min(wantedH, MAX_NATIVE_HEIGHT)));
  return { x: Math.max(0, width - cropW), y: 0, width: cropW, height: cropH };
}

function ocrTargetSize(crop) {
  const scale = Math.min(REQUESTED_SCALE, MAX_OCR_WIDTH / Math.max(1, crop.width));
  return { scale, width: Math.max(crop.width, Math.round(crop.width * scale)), height: Math.max(crop.height, Math.round(crop.height * scale)) };
}

function stamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }
function outputRoot() {
  const base = process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
  return path.join(base, 'archverse-overlay', 'location-sync-diagnostic', stamp());
}

function pipeWireInventory(objects) {
  const clients = new Map((objects || [])
    .filter((o) => o?.type === 'PipeWire:Interface:Client')
    .map((o) => [Number(o.id), o]));
  return (objects || [])
    .filter((o) => o?.type === 'PipeWire:Interface:Node' && propsOf(o)['media.class'] === 'Video/Source')
    .map((o) => {
      const p = propsOf(o);
      const clientId = Number(p['client.id']);
      const client = clients.get(clientId);
      const cp = propsOf(client);
      return {
        id: Number(o.id),
        nodeName: String(p['node.name'] || ''),
        nodeNick: String(p['node.nick'] || ''),
        description: String(p['node.description'] || p['device.description'] || ''),
        clientId: Number.isFinite(clientId) ? clientId : null,
        pid: clientPid(client),
        applicationName: String(cp['application.name'] || cp['application.process.binary'] || ''),
      };
    });
}

function gamescopeProcessEvidence(pid) {
  if (!pid) return null;
  try {
    const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`).toString('utf8').split('\0').filter(Boolean);
    let comm = '';
    try { comm = fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim(); } catch {}
    return { pid, comm, cmdline };
  } catch (error) {
    return { pid, error: String(error?.message || error) };
  }
}

async function discoverPipeWire(gamescopePid) {
  const t0 = Date.now();
  const dump = await runFile('pw-dump', [], { timeout: 3500, maxBuffer: 16 * 1024 * 1024 });
  const objects = parsePwDump(dump.stdout);
  const inventory = pipeWireInventory(objects);
  let node;
  try { node = selectGamescopeNode(objects, gamescopePid); }
  catch (error) {
    return { available: false, inventory, discoverMs: Date.now() - t0, error: String(error?.message || error) };
  }
  const formats = await runFile('pw-cli', ['enum-params', String(node.id), 'EnumFormat'], { timeout: 3500, maxBuffer: 4 * 1024 * 1024 });
  const frame = parseEnumFormat(formats.stdout);
  return { available: true, node, frame, inventory, discoverMs: Date.now() - t0 };
}

async function capturePipeWireCrop(info, finalPath) {
  const crop = topRightCrop(info.frame.width, info.frame.height);
  const tempPath = path.join(os.tmpdir(), `archverse-location-sync-pipewire-${process.pid}.png`);
  const right = Math.max(0, info.frame.width - crop.x - crop.width);
  const bottom = Math.max(0, info.frame.height - crop.y - crop.height);
  try { fs.unlinkSync(tempPath); } catch {}
  const t0 = Date.now();
  try {
    await runFile('gst-launch-1.0', [
      '-q', '-e', 'pipewiresrc', `path=${info.node.id}`, 'num-buffers=1', 'do-timestamp=true', '!',
      `video/x-raw,format=BGRx,width=${info.frame.width},height=${info.frame.height}`, '!',
      'videocrop', `left=${crop.x}`, `right=${right}`, `top=${crop.y}`, `bottom=${bottom}`, '!',
      'videoconvert', '!', 'pngenc', '!', 'filesink', `location=${tempPath}`,
    ], { timeout: 6500, maxBuffer: 2 * 1024 * 1024 });
    const image = nativeImage.createFromPath(tempPath);
    if (!image || image.isEmpty()) throw new Error('direct PipeWire crop decoded empty');
    const target = ocrTargetSize(crop);
    const enlarged = image.resize({ width: target.width, height: target.height, quality: 'best' });
    fs.writeFileSync(finalPath, enlarged.toPNG());
    return {
      method: 'gamescope-pipewire', sourceName: `Gamescope PipeWire node ${info.node.id}`,
      binding: info.node.binding, sourceFrame: info.frame, nativeCrop: crop,
      ocrSize: { width: target.width, height: target.height, scale: target.scale }, captureMs: Date.now() - t0,
    };
  } finally { try { fs.unlinkSync(tempPath); } catch {} }
}

function spectacleEnvironment() {
  const env = { ...process.env };
  const copy = (dst, src) => { if (process.env[src]) env[dst] = process.env[src]; };
  copy('WAYLAND_DISPLAY', 'SC_TRACKER_HOST_WAYLAND_DISPLAY');
  copy('DISPLAY', 'SC_TRACKER_HOST_DISPLAY');
  copy('XDG_RUNTIME_DIR', 'SC_TRACKER_HOST_XDG_RUNTIME_DIR');
  copy('DBUS_SESSION_BUS_ADDRESS', 'SC_TRACKER_HOST_DBUS_SESSION_BUS_ADDRESS');
  if (env.WAYLAND_DISPLAY) { env.XDG_SESSION_TYPE = 'wayland'; env.QT_QPA_PLATFORM = 'wayland'; }
  delete env.GDK_BACKEND;
  delete env.ELECTRON_OZONE_PLATFORM_HINT;
  delete env.LIBGL_ALWAYS_SOFTWARE;
  delete env.MESA_LOADER_DRIVER_OVERRIDE;
  delete env.ANGLE_DEFAULT_PLATFORM;
  return env;
}

async function waitForFile(filePath, timeoutMs = 3000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try { if (fs.statSync(filePath).size > 0) return; } catch {}
    await sleep(100);
  }
  throw new Error('Spectacle returned without a usable screenshot file');
}

async function captureSpectacleCrop(finalPath) {
  const tempPath = path.join(os.tmpdir(), `archverse-location-sync-spectacle-${process.pid}.png`);
  try { fs.unlinkSync(tempPath); } catch {}
  const t0 = Date.now();
  try {
    await runFile('spectacle', ['-b', '-n', '-o', tempPath], { timeout: 20000, env: spectacleEnvironment() });
    await waitForFile(tempPath);
    const full = nativeImage.createFromPath(tempPath);
    if (!full || full.isEmpty()) throw new Error('Spectacle created no usable screenshot');
    const size = full.getSize();
    const crop = topRightCrop(size.width, size.height);
    const target = ocrTargetSize(crop);
    const enlarged = full.crop(crop).resize({ width: target.width, height: target.height, quality: 'best' });
    fs.writeFileSync(finalPath, enlarged.toPNG());
    return {
      method: 'spectacle-wayland', sourceName: 'KDE Spectacle full-desktop top-right crop',
      sourceFrame: size, nativeCrop: crop,
      ocrSize: { width: target.width, height: target.height, scale: target.scale }, captureMs: Date.now() - t0,
    };
  } finally { try { fs.unlinkSync(tempPath); } catch {} }
}

async function foregroundEvidence(session, binder) {
  try {
    const script = [
      'wid=$(xdotool getactivewindow 2>/dev/null || true)', 'pid=""; title=""; class=""',
      'if [ -n "$wid" ]; then pid=$(xdotool getwindowpid "$wid" 2>/dev/null || true); title=$(xdotool getwindowname "$wid" 2>/dev/null | tr "\\n" " " || true); class=$(xprop -id "$wid" WM_CLASS 2>/dev/null | tr "\\n" " " || true); fi',
      'printf "PID=%s\\nTITLE=%s\\nCLASS=%s\\n" "$pid" "$title" "$class"',
    ].join('; ');
    const { stdout } = await runFile('sh', ['-lc', script], { timeout: 2500 });
    const values = {};
    for (const line of stdout.split(/\r?\n/)) { const m = line.match(/^([A-Z]+)=(.*)$/); if (m) values[m[1]] = m[2]; }
    const pid = /^\d+$/.test(values.PID || '') ? Number(values.PID) : null;
    const blob = `${values.TITLE || ''} ${values.CLASS || ''}`.trim();
    const bound = pid ? binder.belongsToSession(pid, session) : false;
    const knownGamescope = pid && session?.gamescopePid ? pid === session.gamescopePid : false;
    const namedGame = /star\s*citizen|gamescope/i.test(blob);
    return { detectable: true, pid, title: values.TITLE || '', className: values.CLASS || '', bound: !!bound, knownGamescope: !!knownGamescope, namedGame, looksLikeGame: !!(bound || knownGamescope || namedGame) };
  } catch (error) { return { detectable: false, looksLikeGame: null, error: String(error?.message || error) }; }
}

async function runOcr(client, imagePath) {
  const t0 = Date.now();
  const detected = await client.detect(imagePath);
  const records = Array.isArray(detected) ? detected : (Array.isArray(detected?.texts) ? detected.texts : []);
  const lines = records.map((record) => ({ text: String(record?.text || '') })).filter((line) => line.text.trim());
  return { ocrMs: Date.now() - t0, lines, pos: parseCamPos(lines) };
}

function distance(a, b) { return a && b ? Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) : null; }

async function main() {
  if (process.platform !== 'linux') throw new Error('this diagnostic is Linux-only');
  const binder = getStarCitizenSessionBinder();
  const session = binder.current();
  if (!session?.gamePid) throw new Error('no active StarCitizen.exe session was found');

  const outDir = outputRoot();
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const resultPath = path.join(outDir, 'location-sync-result.json');
  const rapid = createRapidOcrClient({ logger: console, maxQueue: 1, timeoutMs: 7000 });
  const result = {
    schema: 'archverse-location-sync-diagnostic/2', at: new Date().toISOString(),
    privacy: 'Only bounded top-right CamPos search crops are persisted; no full frame is written.',
    session: { gamePid: session.gamePid, gamescopePid: session.gamescopePid || null, launcherPid: session.launcherPid || null },
    gamescopeProcess: gamescopeProcessEvidence(session.gamescopePid || null),
    cropPolicy: { widthFrac: WIDTH_FRAC, heightFrac: HEIGHT_FRAC, maxNativeWidth: MAX_NATIVE_WIDTH, maxNativeHeight: MAX_NATIVE_HEIGHT, maxOcrWidth: MAX_OCR_WIDTH },
    foreground: null, pipewireInventory: [], pipewire: null, fallback: null, comparison: null,
  };

  try {
    const delayMs = Math.max(0, Math.min(15000, Number(process.env.ARCHVERSE_LOCATION_DIAG_DELAY_MS) || DEFAULT_DELAY_MS));
    console.log('\nArchVerse Location Sync Capture Diagnostic v2');
    console.log('------------------------------------------------------------');
    console.log('In Star Citizen, enable: r_DisplayInfo 1');
    console.log(`Focus Star Citizen now. Capture begins in ${Math.round(delayMs / 1000)} seconds.`);
    console.log(`Only bounded CamPos crops will be saved under: ${outDir}`);
    for (let remaining = delayMs; remaining > 0; remaining -= 1000) { console.log(`[location-diag] capture in ${Math.ceil(remaining / 1000)}...`); await sleep(Math.min(1000, remaining)); }

    result.foreground = await foregroundEvidence(session, binder);
    console.log(`[location-diag] foreground=${JSON.stringify(result.foreground)}`);

    if (session.gamescopePid) {
      try {
        const info = await discoverPipeWire(session.gamescopePid);
        result.pipewireInventory = info.inventory || [];
        console.log(`[location-diag] PipeWire Video/Source inventory=${JSON.stringify(result.pipewireInventory)}`);
        if (!info.available) throw new Error(info.error || 'Gamescope PipeWire source unavailable');
        const cropPath = path.join(outDir, 'pipewire-campos.png');
        const capture = await capturePipeWireCrop(info, cropPath);
        const ocr = await runOcr(rapid, cropPath);
        result.pipewire = { ok: !!ocr.pos, available: true, discoverMs: info.discoverMs, cropFile: path.basename(cropPath), ...capture, ...ocr };
      } catch (error) {
        result.pipewire = { ok: false, available: false, error: String(error?.message || error) };
      }
    } else {
      result.pipewire = { ok: false, available: false, error: 'active Star Citizen session has no Gamescope ancestor; direct Gamescope PipeWire is not applicable' };
    }

    try {
      const cropPath = path.join(outDir, 'fallback-campos.png');
      const capture = await captureSpectacleCrop(cropPath);
      const ocr = await runOcr(rapid, cropPath);
      result.fallback = { ok: !!ocr.pos, available: true, cropFile: path.basename(cropPath), ...capture, ...ocr };
    } catch (error) {
      result.fallback = { ok: false, available: false, error: String(error?.message || error) };
    }

    result.comparison = {
      bothParsed: !!(result.pipewire?.pos && result.fallback?.pos),
      coordinateDelta: distance(result.pipewire?.pos, result.fallback?.pos),
      pipewireTotalMs: result.pipewire?.available ? Number(result.pipewire.discoverMs || 0) + Number(result.pipewire.captureMs || 0) + Number(result.pipewire.ocrMs || 0) : null,
      fallbackTotalMs: result.fallback?.available ? Number(result.fallback.captureMs || 0) + Number(result.fallback.ocrMs || 0) : null,
    };

    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
    console.log('\n[location-diag] RESULT');
    console.log(JSON.stringify(result, null, 2));
    console.log(`[location-diag] saved: ${resultPath}`);
    return result.pipewire?.pos || result.fallback?.pos ? 0 : 3;
  } finally {
    try { rapid.close(); } catch {}
    try { fs.writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 }); } catch {}
  }
}

app.whenReady().then(async () => {
  let code = 1;
  try { code = await main(); }
  catch (error) { console.error(`[location-diag] fatal: ${error?.stack || error}`); code = 2; }
  app.exit(code);
});
