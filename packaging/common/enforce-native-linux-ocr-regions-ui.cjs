#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const [root] = process.argv.slice(2);
if (!root) { console.error('usage: enforce-native-linux-ocr-regions-ui.cjs <staged-app-root>'); process.exit(2); }
const must = (v, m) => { if (!v) throw new Error(`Native Linux OCR region UI: ${m}`); };
const missionsPath = path.join(root, 'app/server/overlay/missions.html');
const managerSource = path.join(__dirname, 'linux-ocr-region-manager.js');
const managerTarget = path.join(root, 'app/server/overlay/linux-ocr-region-manager.js');
must(fs.existsSync(missionsPath), 'missing missions.html');
must(fs.existsSync(managerSource), 'missing linux-ocr-region-manager.js');
fs.copyFileSync(managerSource, managerTarget);
let html = fs.readFileSync(missionsPath, 'utf8');

if (!html.includes('ARCHVERSE_LINUX_PER_WIDGET_OCR_REGION_UI_LOADER')) {
  const oldDisplay = 'const scanDisplay = () => canvasInfo || { px: 0, py: 0, pw: window.innerWidth, ph: window.innerHeight };';
  must(html.includes(oldDisplay), 'resource scanDisplay anchor missing');
  html = html.replace(oldDisplay,
    'const scanDisplay = () => window.__archverseOcrDisplay?.() || canvasInfo || { px: 0, py: 0, pw: window.innerWidth, ph: window.innerHeight };\n  window.__drawResourceScanBox = () => drawScanBox();');

  const oldSave = 'body: JSON.stringify({ scanRegion: f }),';
  must(html.includes(oldSave), 'resource ROI save anchor missing');
  html = html.replace(oldSave, 'body: JSON.stringify({ scanRegion: f, linuxOcrRegions: { resourceSignature: f } }),');

  const oldLoad = 'if (c && c.scanRegion) { scanRegion = c.scanRegion; drawScanBox(); }';
  must(html.includes(oldLoad), 'resource ROI load anchor missing');
  html = html.replace(oldLoad,
    'if (c && (c.linuxOcrRegions?.resourceSignature || c.scanRegion)) { scanRegion = c.linuxOcrRegions?.resourceSignature || c.scanRegion; drawScanBox(); }');

  const oldRsel = 'const RSEL = "body.scanbox #scanBox,';
  must(html.includes(oldRsel), 'Linux interaction region selector anchor missing');
  html = html.replace(oldRsel, 'const RSEL = ".ocr-capture-box.shown, body.scanbox #scanBox,');

  const oldClosest = 'el.closest?.("body.scanbox #scanBox, #globalCog';
  must(html.includes(oldClosest), 'Linux interaction chrome selector anchor missing');
  html = html.replace(oldClosest, 'el.closest?.(".ocr-capture-box.shown, body.scanbox #scanBox, #globalCog');

  must(html.includes('</body>'), 'missions.html body end missing');
  html = html.replace('</body>',
    '  <!-- ARCHVERSE_LINUX_PER_WIDGET_OCR_REGION_UI_LOADER -->\n  <script src="/linux-ocr-region-manager.js"></script>\n</body>');
}

must(html.includes('window.__archverseOcrDisplay?.()'), 'resource ROI is not bound to game capture geometry');
must(html.includes('linuxOcrRegions: { resourceSignature: f }'), 'resource ROI is not persisted into common region config');
must(html.includes('.ocr-capture-box.shown, body.scanbox #scanBox'), 'calibration boxes are not part of Linux F interaction classification');
must(html.includes('ARCHVERSE_LINUX_PER_WIDGET_OCR_REGION_UI_LOADER'), 'region manager loader missing');
fs.writeFileSync(missionsPath, html);
console.log('Native Linux per-widget OCR region UI enforced:', root);
