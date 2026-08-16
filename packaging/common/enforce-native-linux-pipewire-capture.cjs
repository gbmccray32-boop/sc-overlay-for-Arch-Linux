#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const [root] = process.argv.slice(2);
if (!root) {
  console.error('usage: enforce-native-linux-pipewire-capture.cjs <staged-app-root>');
  process.exit(2);
}

const fail = (m) => { throw new Error(`Gamescope PipeWire capture policy: ${m}`); };
const must = (v, m) => { if (!v) fail(m); };
const countOf = (s, n) => s.split(n).length - 1;
function replaceOnce(s, from, to, label) {
  if (s.includes(to)) return s;
  const n = countOf(s, from);
  must(n === 1, `${label}: expected exactly one anchor, found ${n}`);
  return s.replace(from, to);
}

const capturePath = path.join(root, 'app/electron/capture.cjs');
const helperSource = path.join(__dirname, 'native-linux-gamescope-pipewire.cjs');
const helperTarget = path.join(root, 'app/electron/native-linux-gamescope-pipewire.cjs');
must(fs.existsSync(capturePath), 'missing app/electron/capture.cjs');
must(fs.existsSync(helperSource), 'missing packaging/common/native-linux-gamescope-pipewire.cjs');
fs.copyFileSync(helperSource, helperTarget);

let capture = fs.readFileSync(capturePath, 'utf8');

if (!capture.includes('ARCHVERSE_LINUX_GAMESCOPE_PIPEWIRE_CAPTURE')) {
  const ocrImport = 'const { createLinuxOcrBackend, regionFor: linuxOcrRegion, regionPixels: linuxOcrRegionPixels, normalizedRegions: normalizedLinuxOcrRegions } = require("./native-linux-ocr.cjs"); // ARCHVERSE_LINUX_OCR_CONTRACT_V1';
  capture = replaceOnce(capture, ocrImport,
    `${ocrImport}\nconst { createGamescopePipeWireCapture } = require("./native-linux-gamescope-pipewire.cjs"); // ARCHVERSE_LINUX_GAMESCOPE_PIPEWIRE_CAPTURE`,
    'PipeWire helper import');

  capture = replaceOnce(capture,
    'let _lastOcrCaptureInfo = null;\nprocess.once("exit", () => rapidOcrClient.close());',
    'let _lastOcrCaptureInfo = null;\nconst gamescopePipeWire = createGamescopePipeWireCapture({ logger: console });\nprocess.once("exit", () => rapidOcrClient.close());',
    'PipeWire helper initialization');

  capture = replaceOnce(capture,
    'const CAPTURE_BACKENDS = Object.freeze({\n  gamescope: captureWithGamescopeWindow,',
    'const CAPTURE_BACKENDS = Object.freeze({\n  pipewire: captureWithGamescopePipeWire,\n  gamescope: captureWithGamescopeWindow,',
    'PipeWire backend registration');

  const spectacleAnchor = 'async function captureWithSpectacle(disp) {';
  const pipewireFunction = `async function captureWithGamescopePipeWire(disp) {
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
  catch (error) { gamescopePipeWire.invalidate(); throw new Error(\`could not decode Gamescope PipeWire PNG: \${error.message}\`); }
  if (!image || image.isEmpty()) {
    gamescopePipeWire.invalidate();
    throw new Error("Gamescope PipeWire frame decoded empty");
  }
  const outSize = image.getSize();
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
    sourceName: \`Gamescope PipeWire node \${got.node.id}\`,
    sourceSize: { width: got.frame.width, height: got.frame.height },
    sourceCrop: got.crop,
  };
}

`;
  capture = replaceOnce(capture, spectacleAnchor, pipewireFunction + spectacleAnchor, 'PipeWire backend function');

  capture = replaceOnce(capture,
    '  const normalOrder = HOST_IS_WAYLAND\n    ? ["gamescope", "spectacle", "electron"]\n    : ["electron", ...(process.platform === "linux" ? ["spectacle"] : [])];',
    '  const normalOrder = process.platform === "linux"\n    ? (HOST_IS_WAYLAND\n      ? ["pipewire", "gamescope", "spectacle", "electron"]\n      : ["pipewire", "electron", "gamescope", "spectacle"])\n    : ["electron"];',
    'Linux PipeWire backend priority');

  capture = replaceOnce(capture,
    '  const canvasW = Math.max(640, Number(process.env.SC_OVERLAY_CANVAS_WIDTH) || 6360);\n  const canvasH = Math.max(360, Number(process.env.SC_OVERLAY_CANVAS_HEIGHT) || 2160);',
    '  const canvasDisplays = screen.getAllDisplays();\n  const canvasLeft = Math.min(...canvasDisplays.map((d) => d.bounds.x));\n  const canvasRight = Math.max(...canvasDisplays.map((d) => d.bounds.x + d.bounds.width));\n  const primaryBounds = screen.getPrimaryDisplay().bounds;\n  const canvasW = Math.max(640, Number(process.env.SC_OVERLAY_CANVAS_WIDTH) || (canvasRight - canvasLeft));\n  const canvasH = Math.max(360, Number(process.env.SC_OVERLAY_CANVAS_HEIGHT) || primaryBounds.height);',
    'remove machine-specific fallback Gamescope canvas size');

  const oldMining = `    const mining = cfg.miningAssistant === true
      && (cfg.miningOpen === true || cfg.miningAutoShow === true);`;
  const newMining = `    // ARCHVERSE_LINUX_MINING_ARMED_INDEPENDENT_VISIBILITY: Linux OCR is a background data
    // collector once the user enables Mining Assistant. Widget visibility, auto-show, F, hover and
    // overlay focus are UI state only and must never arm/disarm the scanner.
    const mining = cfg.miningAssistant === true
      && (process.platform === "linux" || cfg.miningOpen === true || cfg.miningAutoShow === true);`;
  capture = replaceOnce(capture, oldMining, newMining, 'visibility-independent Linux mining arming');
}

must(capture.includes('ARCHVERSE_LINUX_GAMESCOPE_PIPEWIRE_CAPTURE'), 'capture marker missing');
must(capture.includes('createGamescopePipeWireCapture'), 'PipeWire helper is not imported');
must(capture.includes('pipewire: captureWithGamescopePipeWire'), 'PipeWire backend is not registered');
must(capture.includes('["pipewire", "gamescope", "spectacle", "electron"]'), 'PipeWire is not first Wayland backend');
must(capture.includes('["pipewire", "electron", "gamescope", "spectacle"]'), 'PipeWire is not first X11 Linux backend');
must(capture.includes('method: "gamescope-pipewire"'), 'PipeWire method marker missing');
must(capture.includes('session?.gamescopePid'), 'PipeWire capture is not tied to bound Gamescope session');
must(capture.includes('screen.getAllDisplays()'), 'dynamic display mapping missing');
must(capture.includes('ARCHVERSE_LINUX_MINING_ARMED_INDEPENDENT_VISIBILITY'), 'Linux mining arming marker missing');
must(capture.includes('process.platform === "linux" || cfg.miningOpen === true || cfg.miningAutoShow === true'), 'Linux mining still visibility-gated');
must(!capture.includes('Number(process.env.SC_OVERLAY_CANVAS_WIDTH) || 6360'), 'machine-specific 6360 fallback remains in active PipeWire path');

// Build-time geometry/session vectors. These numbers are regression fixtures only; the runtime
// obtains every real frame size from pw-cli EnumFormat.
const helper = require(helperSource);
const vectorObjects = [
  { id: 159, type: 'PipeWire:Interface:Client', info: { props: { 'application.process.id': '82521' } } },
  { id: 163, type: 'PipeWire:Interface:Node', info: { props: { 'media.class': 'Video/Source', 'node.name': 'gamescope', 'client.id': '159', 'object.serial': '10258' } } },
];
const vectorNode = helper.selectGamescopeNode(vectorObjects, 82521);
must(vectorNode.id === 163 && vectorNode.binding === 'gamescope-pid', 'exact Gamescope PipeWire PID binding self-test failed');
const vectorFormat = helper.parseEnumFormat('Object: size 1\n Id 8 (Spa:Enum:VideoFormat:BGRx)\n Rectangle 5120x1440\n');
must(vectorFormat.width === 5120 && vectorFormat.height === 1440, 'dynamic PipeWire size parse self-test failed');
const vectorDisplays = [
  { bounds: { x: 0, y: 0, width: 1080, height: 1920 }, scaleFactor: 1 },
  { bounds: { x: 1080, y: 0, width: 3840, height: 2160 }, scaleFactor: 1 },
  { bounds: { x: 4920, y: 0, width: 1440, height: 2560 }, scaleFactor: 1 },
];
const vectorCrop = helper.computeDisplayCrop({ frameW: 6360, frameH: 2160, disp: vectorDisplays[1], displays: vectorDisplays });
must(vectorCrop.x === 1080 && vectorCrop.width === 3840 && vectorCrop.height === 2160, 'panorama display mapping self-test failed');
const scaledDisplays = [
  { bounds: { x: 0, y: 0, width: 2560, height: 1440 }, scaleFactor: 1 },
  { bounds: { x: 2560, y: 0, width: 2560, height: 1440 }, scaleFactor: 1 },
  { bounds: { x: 5120, y: 0, width: 2560, height: 1440 }, scaleFactor: 1 },
];
const scaledCrop = helper.computeDisplayCrop({ frameW: 5760, frameH: 1080, disp: scaledDisplays[1], displays: scaledDisplays });
must(scaledCrop.x === 1920 && scaledCrop.width === 1920 && scaledCrop.height === 1080, 'scaled panorama mapping self-test failed');

fs.writeFileSync(capturePath, capture);
console.log('Gamescope PipeWire native Linux capture policy enforced:', root);
