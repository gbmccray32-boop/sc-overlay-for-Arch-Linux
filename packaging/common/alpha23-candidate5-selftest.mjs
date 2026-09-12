#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('usage: alpha23-candidate5-selftest.mjs <candidate-root>');
const must = (value, message) => { if (!value) throw new Error(`Alpha23 Candidate 5 self-test: ${message}`); };
const require = createRequire(import.meta.url);
const text = async (relative) => readFile(path.join(root, relative), 'utf8');
const digest = async (relative) => createHash('sha256').update(await readFile(path.join(root, relative))).digest('hex');

const [capture, nativeOcr, server, config, regionManager, verseFinder, changelogText, pkgText, provenanceText] = await Promise.all([
  text('app/electron/capture.cjs'),
  text('app/electron/native-linux-ocr.cjs'),
  text('app/server/server.mjs'),
  text('app/server/overlay/config.html'),
  text('app/server/overlay/linux-ocr-region-manager.js'),
  text('app/server/overlay/versefinder.html'),
  text('app/server/overlay/changelog.json'),
  text('app/package.json'),
  text('ALPHA23-PROVENANCE.json'),
]);
const pkg = JSON.parse(pkgText);
const provenance = JSON.parse(provenanceText);
const changelog = JSON.parse(changelogText);

must(pkg.version === '0.1.47-r31.alpha23.candidate5', `wrong version ${pkg.version}`);
must(provenance.upstream === 'e482c1ce3d461b390079486115293535be9b2ab7', 'wrong v0.1.47 upstream commit');
must(provenance.candidate4Artifact === 10290507069, 'wrong Candidate 4 artifact pin');
must(provenance.candidate4ArchiveSha256 === 'c8b11e378016e123ae0c59252b33ebb3f19781cb8a756caff7ebbdf87e82e82d',
  'wrong Candidate 4 archive checksum');
must(Array.isArray(changelog['0.1.47']?.notes) && changelog['0.1.47'].notes.some((note) =>
  String(note.label || '').includes('Reputation') || String(note.text || '').includes('REP page')),
  'v0.1.47 changelog is absent');
must(verseFinder.includes('a.dataset.at = String(shownAt);'), 'v0.1.47 exact age timestamp is absent');

must(config.includes('<input type="checkbox" id="repScan" />'), 'REP opt-in is still disabled');
must(nativeOcr.includes('reputation:         { x: 0.02, y: 0.04, w: 0.96, h: 0.90 }'), 'Linux REP crop default is absent');
must(regionManager.includes("ocrReputationRegion: 'reputation'"), 'Linux REP crop control is absent');
must(regionManager.includes('Show / adjust Reputation OCR area'), 'Linux REP crop is not user-adjustable');
must(server.includes('"refinery", "reputation"'), 'server rejects the REP crop setting');
must(server.includes('url === "/api/rep-read"'), 'REP layout endpoint is absent');
must(server.includes('url === "/api/rep-scan"'), 'REP result endpoint is absent');

must(capture.includes('require("./rep-bars.cjs")'), 'REP pixel reader is not wired');
must(capture.includes('"refinery", "reputation"'), 'REP does not have an isolated background lane');
must(capture.includes('const endpoint = repRegion ? "/api/rep-read" : "/api/screen-read";'), 'Linux REP OCR uses the wrong endpoint');
must(capture.includes('if (repRegion) await postRepRead(read, got.crop, got.region.width);'), 'Linux REP bar read does not use crop-local pixels');
must(capture.includes('if (!fab && !miss && !mining && !claim && !rep && !locate)'), 'REP does not arm capture');
must(capture.includes('!(mining && process.platform === "linux" && vehiclePresence.active === true)'),
  'Mining no longer has exclusive Linux OCR authority');
must(capture.includes('const MINING_CONFIRM_MS = 250;'), 'Mining confirmation cadence changed');
must(capture.includes('const FAST_MS = 350;'), 'Mining locked cadence changed');
must(capture.includes('const MINING_VEHICLE_IDLE_MS = 500;'), 'Mining acquisition cadence changed');
must(capture.includes('method: "gamescope-pipewire"'), 'direct Gamescope PipeWire contract changed');
must(capture.includes('commitMining: confirmation.status === "confirmed"'), 'unconfirmed Mining OCR can commit');

const protectedHashes = {
  'app/electron/main.cjs': '61a9f69584b7e2ba9b3fa3e1566ff1472638c9e81e862e30f13f4cb1f92b761d',
  'app/electron/preload.cjs': '34bb46eec03d2d8492bf3a6e76201d37276ac4c787258fe47501677270a90817',
  'app/electron/mining-result-transport.cjs': '9046c37ed6eb94fb5538c79833cad1aea46050a39a3239b926ec18990a9f9bb9',
  'app/electron/persistent-gamescope-pipewire.cjs': '831fdf3584cfa0cd0df15076ab0d6a5c5e010c842b12f08bf3c87ec82333b07b',
  'app/electron/sidecar-health-watchdog.cjs': 'f247c428924d9f85257534073e165476ac9f4d650123a23d0ef63fdd2afd899c',
};
for (const [relative, expected] of Object.entries(protectedHashes)) {
  must(await digest(relative) === expected, `${relative} changed from Candidate 4`);
}
must(await digest('app/electron/rep-bars.cjs') === '20cf399d5a30029b72fa53497d1087344b4743954898b4c36cecde0cf118337c',
  'REP pixel reader differs from upstream v0.1.47');

const { readBar } = require(path.join(root, 'app/electron/rep-bars.cjs'));
const box = { x: 0, y: 0, w: 100, h: 15 };
const green = readBar((x, y) => y === 5 && x >= 10 && x < 50
  ? { r: 130, g: 250, b: 200 } : { r: 50, g: 50, b: 50 }, box, 1000);
must(green.found && green.reached, `synthetic reached bar rejected: ${green.why}`);
const grey = readBar((x, y) => y === 5 && x >= 10 && x < 50
  ? { r: 65, g: 90, b: 115 } : { r: 50, g: 50, b: 50 }, box, 1000);
must(grey.found && !grey.reached, `synthetic locked bar promoted: ${grey.why}`);

console.log('Alpha23 Candidate 5 self-test OK: v0.1.47, isolated REP OCR, pixel bars, and protected Linux Mining contracts');
