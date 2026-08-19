'use strict';

// ARCHVERSE_LOCATION_SYNC_PIPEWIRE_DIAGNOSTIC_V1
// Quarantined one-shot diagnostic. It does not alter hauling state or the normal capture loop.
// It compares the field-proven direct Gamescope PipeWire source against Electron's explicit
// Gamescope/Star Citizen window source for the upstream r_DisplayInfo CamPos read.
// Privacy rule: only the bounded CamPos search crops are persisted. No full frame is written.

const { app, desktopCapturer, nativeImage } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { getStarCitizenSessionBinder } = require('./linux/star-citizen-session.cjs');
const {
  parsePwDump,
  selectGamescopeNode,
  parseEnumFormat,
} = require('./native-linux-gamescope-pipewire.cjs');
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

function parseCamPos(lines) {
  const texts = (Array.isArray(lines) ? lines : []).map((line) => String(line?.text ?? line ?? ''));
  for (const text of texts) {
    const match = CAM_POS_RE.exec(text);
    if (match) return { x: Number(match[1]), y: Number(match[2]), z: Number(match[3]) };
  }
  const joined = texts.join(' ');
  const match = CAM_POS_RE.exec(joined);
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
  return {
    scale,
    width: Math.max(crop.width, Math.round(crop.width * scale)),
    height: Math.max(crop.height, Math.round(crop.height * scale)),
  };
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function outputRoot() {
  const base = process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
  return path.join(base, 'archverse-overlay', 'location-sync-diagnostic', stamp());
}

async function discoverPipeWire(gamescopePid) {
  const t0 = Date.now();
  const dump = await runFile('pw-dump', [], { timeout: 3500, maxBuffer: 16 * 1024 * 1024 });
  const node = selectGamescopeNode(parsePwDump(dump.stdout), gamescopePid);
  const formats = await runFile('pw-cli', ['enum-params', String(node.id), 'EnumFormat'], {
    timeout: 3500,
    maxBuffer: 4 * 1024 * 1024,
  });
  const frame = parseEnumFormat(formats.stdout);
  return { node, frame, discoverMs: Date.now() - t0 };
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
      '-q', '-e',
      'pipewiresrc', `path=${info.node.id}`, 'num-buffers=1', 'do-timestamp=true', '!',
      `video/x-raw,format=BGRx,width=${info.frame.width},height=${info.frame.height}`, '!',
      'videocrop', `left=${crop.x}`, `right=${right}`, `top=${crop.y}`, `bottom=${bottom}`, '!',
      'videoconvert', '!', 'pngenc', '!',
      'filesink', `location=${tempPath}`,
    ], { timeout: 6500, maxBuffer: 2 * 1024 * 1024 });
    const image = nativeImage.createFromPath(tempPath);
    if (!image || image.isEmpty()) throw new Error('direct PipeWire crop decoded empty');
    const target = ocrTargetSize(crop);
    const enlarged = image.resize({ width: target.width, height: target.height, quality: 'best' });
    fs.writeFileSync(finalPath, enlarged.toPNG());
    return {
      method: 'gamescope-pipewire',
      sourceName: `Gamescope PipeWire node ${info.node.id}`,
      binding: info.node.binding,
      sourceFrame: info.frame,
      nativeCrop: crop,
      ocrSize: { width: target.width, height: target.height, scale: target.scale },
      captureMs: Date.now() - t0,
    };
  } finally {
    try { fs.unlinkSync(tempPath); } catch {}
  }
}

function sourceRank(source) {
  const name = String(source?.name || '');
  if (/gamescope/i.test(name) && /star\s*citizen/i.test(name)) return 4;
  if (/^Star\s*Citizen$/i.test(name.trim())) return 3;
  if (/star\s*citizen/i.test(name)) return 2;
  if (/gamescope/i.test(name)) return 1;
  return 0;
}

async function captureElectronWindowCrop(expectedFrame, finalPath) {
  const wantedW = Math.max(1280, Number(expectedFrame?.width) || Number(process.env.SC_OVERLAY_CANVAS_WIDTH) || 3840);
  const wantedH = Math.max(720, Number(expectedFrame?.height) || Number(process.env.SC_OVERLAY_CANVAS_HEIGHT) || 2160);
  const t0 = Date.now();
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: wantedW, height: wantedH },
    fetchWindowIcons: false,
  });
  const candidates = sources.filter((source) => !source.thumbnail.isEmpty() && sourceRank(source) > 0);
  candidates.sort((a, b) => {
    const rankDelta = sourceRank(b) - sourceRank(a);
    if (rankDelta) return rankDelta;
    const as = a.thumbnail.getSize();
    const bs = b.thumbnail.getSize();
    return bs.width * bs.height - as.width * as.height;
  });
  if (!candidates.length) {
    const names = sources.slice(0, 12).map((source) => source.name || '(unnamed)').join(', ');
    throw new Error(`no explicit Gamescope/Star Citizen Electron window source${names ? `; visible=${names}` : ''}`);
  }
  const source = candidates[0];
  const full = source.thumbnail;
  const size = full.getSize();
  const crop = topRightCrop(size.width, size.height);
  const target = ocrTargetSize(crop);
  const enlarged = full.crop(crop).resize({ width: target.width, height: target.height, quality: 'best' });
  fs.writeFileSync(finalPath, enlarged.toPNG());
  return {
    method: 'electron-game-window-fallback',
    sourceName: source.name || '(unnamed game window)',
    sourceFrame: size,
    nativeCrop: crop,
    ocrSize: { width: target.width, height: target.height, scale: target.scale },
    captureMs: Date.now() - t0,
    visibleWindowSources: sources.length,
  };
}

async function foregroundEvidence(session, binder) {
  try {
    const script = [
      'wid=$(xdotool getactivewindow 2>/dev/null || true)',
      'pid=""; title=""; class=""',
      'if [ -n "$wid" ]; then pid=$(xdotool getwindowpid "$wid" 2>/dev/null || true); title=$(xdotool getwindowname "$wid" 2>/dev/null | tr "\\n" " " || true); class=$(xprop -id "$wid" WM_CLASS 2>/dev/null | tr "\\n" " " || true); fi',
      'printf "PID=%s\\nTITLE=%s\\nCLASS=%s\\n" "$pid" "$title" "$class"',
    ].join('; ');
    const { stdout } = await runFile('sh', ['-lc', script], { timeout: 2500 });
    const values = {};
    for (const line of stdout.split(/\r?\n/)) {
      const match = line.match(/^([A-Z]+)=(.*)$/);
      if (match) values[match[1]] = match[2];
    }
    const pid = /^\d+$/.test(values.PID || '') ? Number(values.PID) : null;
    const blob = `${values.TITLE || ''} ${values.CLASS || ''}`.trim();
    const bound = pid ? binder.belongsToSession(pid, session) : false;
    const knownGamescope = pid && session?.gamescopePid ? pid === session.gamescopePid : false;
    const namedGame = /star\s*citizen|gamescope/i.test(blob);
    return { detectable: true, pid, title: values.TITLE || '', className: values.CLASS || '', bound: !!bound, knownGamescope: !!knownGamescope, namedGame, looksLikeGame: !!(bound || knownGamescope || namedGame) };
  } catch (error) {
    return { detectable: false, looksLikeGame: null, error: String(error?.message || error) };
  }
}

async function runOcr(client, imagePath) {
  const t0 = Date.now();
  const detected = await client.detect(imagePath);
  const records = Array.isArray(detected) ? detected : (Array.isArray(detected?.texts) ? detected.texts : []);
  const lines = records.map((record) => ({ text: String(record?.text || '') })).filter((line) => line.text.trim());
  return { ocrMs: Date.now() - t0, lines, pos: parseCamPos(lines) };
}

function distance(a, b) {
  if (!a || !b) return null;
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

async function main() {
  if (process.platform !== 'linux') throw new Error('this diagnostic is Linux-only');
  const binder = getStarCitizenSessionBinder();
  const session = binder.current();
  if (!session?.gamePid) throw new Error('no active StarCitizen.exe session was found');

  const outDir = outputRoot();
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const resultPath = path.join(outDir, 'location-sync-result.json');
  const rapid = createRapidOcrClient({ logger: console });
  let result = {
    schema: 'archverse-location-sync-diagnostic/1',
    at: new Date().toISOString(),
    privacy: 'Only bounded top-right CamPos search crops are persisted; no full frame is written.',
    session: { gamePid: session.gamePid, gamescopePid: session.gamescopePid || null, launcherPid: session.launcherPid || null },
    cropPolicy: { widthFrac: WIDTH_FRAC, heightFrac: HEIGHT_FRAC, maxNativeWidth: MAX_NATIVE_WIDTH, maxNativeHeight: MAX_NATIVE_HEIGHT, maxOcrWidth: MAX_OCR_WIDTH },
    foreground: null,
    pipewire: null,
    fallback: null,
    comparison: null,
  };

  try {
    const delayMs = Math.max(0, Math.min(15000, Number(process.env.ARCHVERSE_LOCATION_DIAG_DELAY_MS) || DEFAULT_DELAY_MS));
    console.log('\nArchVerse Location Sync PipeWire Diagnostic');
    console.log('------------------------------------------------------------');
    console.log('In Star Citizen, enable: r_DisplayInfo 1');
    console.log(`Focus Star Citizen now. Capture begins in ${Math.round(delayMs / 1000)} seconds.`);
    console.log(`Only CamPos search crops will be saved under: ${outDir}`);
    for (let remaining = delayMs; remaining > 0; remaining -= 1000) {
      console.log(`[location-diag] capture in ${Math.ceil(remaining / 1000)}...`);
      await sleep(Math.min(1000, remaining));
    }

    result.foreground = await foregroundEvidence(session, binder);
    console.log(`[location-diag] foreground=${JSON.stringify(result.foreground)}`);

    let pipeInfo = null;
    if (session.gamescopePid) {
      try {
        pipeInfo = await discoverPipeWire(session.gamescopePid);
        const cropPath = path.join(outDir, 'pipewire-campos.png');
        const capture = await capturePipeWireCrop(pipeInfo, cropPath);
        const ocr = await runOcr(rapid, cropPath);
        result.pipewire = { ok: !!ocr.pos, available: true, discoverMs: pipeInfo.discoverMs, cropFile: path.basename(cropPath), ...capture, ...ocr };
      } catch (error) {
        result.pipewire = { ok: false, available: false, error: String(error?.message || error) };
      }
    } else {
      result.pipewire = { ok: false, available: false, error: 'active Star Citizen session has no Gamescope ancestor; direct Gamescope PipeWire is not applicable' };
    }

    try {
      const cropPath = path.join(outDir, 'fallback-campos.png');
      const capture = await captureElectronWindowCrop(pipeInfo?.frame || null, cropPath);
      const ocr = await runOcr(rapid, cropPath);
      result.fallback = { ok: !!ocr.pos, available: true, cropFile: path.basename(cropPath), ...capture, ...ocr };
    } catch (error) {
      result.fallback = { ok: false, available: false, error: String(error?.message || error) };
    }

    const delta = distance(result.pipewire?.pos, result.fallback?.pos);
    result.comparison = {
      bothParsed: !!(result.pipewire?.pos && result.fallback?.pos),
      coordinateDelta: delta,
      pipewireTotalMs: result.pipewire?.available ? (Number(result.pipewire.discoverMs || 0) + Number(result.pipewire.captureMs || 0) + Number(result.pipewire.ocrMs || 0)) : null,
      fallbackTotalMs: result.fallback?.available ? (Number(result.fallback.captureMs || 0) + Number(result.fallback.ocrMs || 0)) : null,
    };

    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
    console.log('\n[location-diag] RESULT');
    console.log(JSON.stringify(result, null, 2));
    console.log(`[location-diag] saved: ${resultPath}`);
    if (result.pipewire?.pos) console.log(`[location-diag] PIPEWIRE XYZ: ${result.pipewire.pos.x} ${result.pipewire.pos.y} ${result.pipewire.pos.z}`);
    else console.log(`[location-diag] PIPEWIRE: ${result.pipewire?.error || 'CamPos not parsed'}`);
    if (result.fallback?.pos) console.log(`[location-diag] FALLBACK XYZ: ${result.fallback.pos.x} ${result.fallback.pos.y} ${result.fallback.pos.z}`);
    else console.log(`[location-diag] FALLBACK: ${result.fallback?.error || 'CamPos not parsed'}`);

    if (result.pipewire?.pos) return 0;
    return 3;
  } finally {
    try { rapid.close(); } catch {}
    try { fs.writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 }); } catch {}
  }
}

app.whenReady().then(async () => {
  let code = 1;
  try { code = await main(); }
  catch (error) {
    console.error(`[location-diag] fatal: ${error?.stack || error}`);
    code = 2;
  }
  app.exit(code);
});
