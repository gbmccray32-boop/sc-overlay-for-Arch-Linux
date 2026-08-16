'use strict';

// ARCHVERSE_LINUX_GAMESCOPE_PIPEWIRE_CAPTURE
// Native Linux capture source for OCR. Gamescope publishes its composed game canvas as a
// PipeWire Video/Source. We discover the node at runtime, negotiate its CURRENT BGRx size, crop
// only the physical display used for calibration, and return a PNG containing game pixels only.
// No node id, Gamescope resolution, monitor width or panorama width is hard-coded.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

function runFile(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (err, stdout, stderr) => {
      if (err) {
        const detail = String(stderr || stdout || err.message || err).trim();
        const wrapped = new Error(detail || String(err));
        wrapped.code = err.code;
        reject(wrapped);
        return;
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

function propsOf(object) {
  return object?.info?.props && typeof object.info.props === 'object' ? object.info.props : {};
}

function numericPid(value) {
  const n = Number(String(value ?? '').trim());
  return Number.isInteger(n) && n > 1 ? n : null;
}

function clientPid(client) {
  const p = propsOf(client);
  for (const key of [
    'application.process.id',
    'pipewire.client.pid',
    'process.id',
    'application.process.pid',
  ]) {
    const pid = numericPid(p[key]);
    if (pid) return pid;
  }
  return null;
}

function parsePwDump(text) {
  let objects;
  try { objects = JSON.parse(String(text || '')); }
  catch (error) { throw new Error(`pw-dump returned invalid JSON: ${error.message}`); }
  if (!Array.isArray(objects)) throw new Error('pw-dump did not return an object array');
  return objects;
}

function selectGamescopeNode(objects, gamescopePid = null) {
  const nodes = objects.filter((object) => {
    if (object?.type !== 'PipeWire:Interface:Node') return false;
    const p = propsOf(object);
    return p['media.class'] === 'Video/Source' && /^gamescope$/i.test(String(p['node.name'] || '').trim());
  });
  if (!nodes.length) throw new Error('no PipeWire Video/Source named gamescope');

  const clientsById = new Map(objects
    .filter((object) => object?.type === 'PipeWire:Interface:Client')
    .map((object) => [Number(object.id), object]));
  const targetPid = numericPid(gamescopePid);
  const enriched = nodes.map((node) => {
    const p = propsOf(node);
    const clientId = Number(p['client.id']);
    const pid = clientPid(clientsById.get(clientId));
    return { id: Number(node.id), serial: Number(p['object.serial']) || 0, clientId, pid, props: p };
  }).filter((node) => Number.isInteger(node.id) && node.id > 0);

  if (targetPid) {
    const exact = enriched.filter((node) => node.pid === targetPid);
    if (exact.length === 1) return { ...exact[0], binding: 'gamescope-pid' };
    if (exact.length > 1) {
      exact.sort((a, b) => b.serial - a.serial || b.id - a.id);
      return { ...exact[0], binding: 'gamescope-pid-newest' };
    }
  }
  if (enriched.length === 1) return { ...enriched[0], binding: 'single-gamescope-node' };
  throw new Error(`multiple Gamescope PipeWire nodes found (${enriched.map((n) => `${n.id}:pid=${n.pid || '?'}`).join(', ')}); refusing ambiguous capture`);
}

function parseEnumFormat(text) {
  const blocks = String(text || '').split(/(?=^\s*Object:\s)/m).filter(Boolean);
  const candidates = [];
  for (const block of blocks) {
    const formatMatch = block.match(/Spa:Enum:VideoFormat:([A-Za-z0-9_+-]+)/);
    const sizeMatch = block.match(/Rectangle\s+(\d+)x(\d+)/);
    if (!sizeMatch) continue;
    const width = Number(sizeMatch[1]), height = Number(sizeMatch[2]);
    if (!(width > 0 && height > 0)) continue;
    candidates.push({ format: formatMatch?.[1] || '', width, height });
  }
  const bgrx = candidates.find((c) => /^BGRx$/i.test(c.format));
  if (bgrx) return { ...bgrx, format: 'BGRx' };
  throw new Error(`Gamescope PipeWire node does not advertise raw BGRx (${candidates.map((c) => c.format || '?').join(', ') || 'no formats'})`);
}

function virtualBounds(displays) {
  const valid = (Array.isArray(displays) ? displays : []).filter((d) => d?.bounds && d.bounds.width > 0 && d.bounds.height > 0);
  if (!valid.length) return { left: 0, top: 0, right: 1, bottom: 1, width: 1, height: 1 };
  const left = Math.min(...valid.map((d) => d.bounds.x));
  const top = Math.min(...valid.map((d) => d.bounds.y));
  const right = Math.max(...valid.map((d) => d.bounds.x + d.bounds.width));
  const bottom = Math.max(...valid.map((d) => d.bounds.y + d.bounds.height));
  return { left, top, right, bottom, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

function nearly(a, b, tolerance = 0.035) {
  if (!(a > 0 && b > 0)) return false;
  return Math.abs(a - b) <= Math.max(3, Math.max(a, b) * tolerance);
}

function computeDisplayCrop({ frameW, frameH, disp, displays, canvasW = null, canvasH = null }) {
  if (!(frameW > 0 && frameH > 0)) throw new Error(`invalid PipeWire frame ${frameW}x${frameH}`);
  if (!disp?.bounds || !(disp.bounds.width > 0 && disp.bounds.height > 0)) {
    return { x: 0, y: 0, width: frameW, height: frameH, mapping: 'full-frame-no-display' };
  }

  const bounds = disp.bounds;
  // The common single-monitor Gamescope case: its stream already IS the game's target display.
  // ScaleFactor is considered because Electron bounds can be logical pixels on fractional-scale KDE.
  const physicalDispW = Math.round(bounds.width * (Number(disp.scaleFactor) || 1));
  const physicalDispH = Math.round(bounds.height * (Number(disp.scaleFactor) || 1));
  const sameLogical = nearly(frameW, bounds.width) && nearly(frameH, bounds.height);
  const samePhysical = nearly(frameW, physicalDispW) && nearly(frameH, physicalDispH);
  if ((!canvasW && !canvasH) && (sameLogical || samePhysical)) {
    return { x: 0, y: 0, width: frameW, height: frameH, mapping: 'single-display-full-frame' };
  }

  const vb = virtualBounds(displays);
  // Explicit launcher canvas dimensions win when supplied. Otherwise infer a panorama whenever
  // the live Gamescope stream is materially wider than the selected target display. The desktop
  // span is used only as a coordinate reference and is scaled to the ACTUAL PipeWire frame, so a
  // 5760x1080 rendered panorama on a 7680x1440 desktop still maps correctly.
  const selectedReferenceW = Math.max(bounds.width, physicalDispW);
  const panorama = Number(canvasW) > 0 || (Array.isArray(displays) && displays.length > 1 && frameW > selectedReferenceW * 1.15);
  if (!panorama) {
    return { x: 0, y: 0, width: frameW, height: frameH, mapping: 'gamescope-full-frame' };
  }

  const declaredW = Number(canvasW) > 0 ? Number(canvasW) : vb.width;
  const declaredH = Number(canvasH) > 0 ? Number(canvasH) : bounds.height;
  const sx = frameW / Math.max(1, declaredW);
  const sy = frameH / Math.max(1, declaredH);
  let x = Math.round((bounds.x - vb.left) * sx);
  // A normal Gamescope panorama is a single horizontal canvas. Without an explicit canvas Y
  // contract, do not inherit portrait-monitor desktop offsets into that game canvas.
  let y = Number(canvasH) > 0 ? Math.round(Math.max(0, bounds.y - vb.top) * sy) : 0;
  let width = Math.round(bounds.width * sx);
  let height = Math.round(Math.min(bounds.height, declaredH) * sy);

  x = Math.max(0, Math.min(frameW - 1, x));
  y = Math.max(0, Math.min(frameH - 1, y));
  width = Math.max(8, Math.min(frameW - x, width));
  height = Math.max(8, Math.min(frameH - y, height));
  if (width < 8 || height < 8) throw new Error(`invalid display crop ${width}x${height}@${x},${y}`);
  return { x, y, width, height, mapping: 'desktop-panorama' };
}

function gstCropArgs(nodeId, frame, crop, outputPath) {
  const right = Math.max(0, frame.width - (crop.x + crop.width));
  const bottom = Math.max(0, frame.height - (crop.y + crop.height));
  return [
    '-q', '-e',
    'pipewiresrc', `path=${nodeId}`, 'num-buffers=1', 'do-timestamp=true', '!',
    `video/x-raw,format=BGRx,width=${frame.width},height=${frame.height}`, '!',
    'videocrop', `left=${crop.x}`, `right=${right}`, `top=${crop.y}`, `bottom=${bottom}`, '!',
    'videoconvert', '!', 'pngenc', '!',
    'filesink', `location=${outputPath}`,
  ];
}

function createGamescopePipeWireCapture({ logger = console, runner = runFile } = {}) {
  let cached = null;
  let lastLogKey = '';
  const outputPath = path.join(os.tmpdir(), `archverse-gamescope-pipewire-${process.pid}.png`);

  async function discover(gamescopePid) {
    if (cached && cached.gamescopePid === numericPid(gamescopePid)) return cached;
    const dump = await runner('pw-dump', [], { timeout: 3500, maxBuffer: 16 * 1024 * 1024 });
    const node = selectGamescopeNode(parsePwDump(dump.stdout), gamescopePid);
    const formats = await runner('pw-cli', ['enum-params', String(node.id), 'EnumFormat'], { timeout: 3500, maxBuffer: 4 * 1024 * 1024 });
    const frame = parseEnumFormat(formats.stdout);
    cached = { gamescopePid: numericPid(gamescopePid), node, frame, at: Date.now() };
    return cached;
  }

  async function capture({ gamescopePid, disp, displays, canvasW = null, canvasH = null }) {
    let info;
    try { info = await discover(gamescopePid); }
    catch (error) { cached = null; throw error; }
    const crop = computeDisplayCrop({
      frameW: info.frame.width, frameH: info.frame.height, disp, displays, canvasW, canvasH,
    });
    try { fs.unlinkSync(outputPath); } catch {}
    try {
      await runner('gst-launch-1.0', gstCropArgs(info.node.id, info.frame, crop, outputPath), {
        timeout: 6000,
        maxBuffer: 2 * 1024 * 1024,
      });
    } catch (error) {
      cached = null;
      throw new Error(`Gamescope PipeWire frame failed: ${error.message}`);
    }
    let size = 0;
    try { size = fs.statSync(outputPath).size; } catch {}
    if (size <= 0) {
      cached = null;
      throw new Error('Gamescope PipeWire produced no frame');
    }
    const logKey = `${info.node.id}:${info.node.pid || '?'}:${info.frame.width}x${info.frame.height}:${crop.x},${crop.y},${crop.width},${crop.height}:${crop.mapping}`;
    if (logKey !== lastLogKey) {
      lastLogKey = logKey;
      logger.log?.(`[gamescope-pipewire] node=${info.node.id} binding=${info.node.binding} pid=${info.node.pid || gamescopePid || '?'} format=BGRx frame=${info.frame.width}x${info.frame.height} displayCrop=${crop.width}x${crop.height}@${crop.x},${crop.y} mapping=${crop.mapping}`);
    }
    return { path: outputPath, node: info.node, frame: info.frame, crop };
  }

  function invalidate() { cached = null; }
  return { capture, invalidate };
}

module.exports = {
  createGamescopePipeWireCapture,
  parsePwDump,
  selectGamescopeNode,
  parseEnumFormat,
  computeDisplayCrop,
  gstCropArgs,
  __test: { propsOf, clientPid, virtualBounds, nearly },
};
