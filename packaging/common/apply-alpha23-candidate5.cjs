#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = process.argv[2];
if (!root) throw new Error("usage: apply-alpha23-candidate5.cjs <staged-candidate4-root>");
const must = (value, message) => { if (!value) throw new Error(`Alpha23 Candidate 5 apply: ${message}`); };
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const write = (relative, value) => fs.writeFileSync(path.join(root, relative), value);
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  must(first >= 0, `${label} anchor missing`);
  must(text.indexOf(before, first + before.length) < 0, `${label} anchor is not unique`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

const baselineHashes = {
  "app/electron/capture.cjs": "b54deff758ac17ba093b04c49306115a5ba8e1f6d6a29da985542ebdc1611f87",
  "app/electron/main.cjs": "61a9f69584b7e2ba9b3fa3e1566ff1472638c9e81e862e30f13f4cb1f92b761d",
  "app/electron/preload.cjs": "34bb46eec03d2d8492bf3a6e76201d37276ac4c787258fe47501677270a90817",
  "app/electron/native-linux-ocr.cjs": "3dc782daca40a06eb22b80139fce858a06b481a319cf83655711dd2b32c5bd5b",
  "app/electron/mining-result-transport.cjs": "9046c37ed6eb94fb5538c79833cad1aea46050a39a3239b926ec18990a9f9bb9",
  "app/electron/persistent-gamescope-pipewire.cjs": "831fdf3584cfa0cd0df15076ab0d6a5c5e010c842b12f08bf3c87ec82333b07b",
  "app/electron/sidecar-health-watchdog.cjs": "f247c428924d9f85257534073e165476ac9f4d650123a23d0ef63fdd2afd899c",
  "app/server/server.mjs": "65f038af76318cc0b21b452cd98a92e19af2b9e2128c1605d1a9e6657c8c08f6",
  "app/server/overlay/config.html": "2499ce9be6a748b8b25a6d7fc5418f0aa831d6e79eed963cb0e740e7deb1f09a",
  "app/server/overlay/versefinder.html": "378b49ea3b732a6d4620d6988fe52de6c8fe69493eb14395efe44235987ec402",
  "app/server/overlay/changelog.json": "3c292cad4b2d308ce353b15348fcfac9469d89fb4d9b19c6c659566946ba52a3",
  "app/server/overlay/linux-ocr-region-manager.js": "e35abdcd2a3e57bfec7a37ca6acbf3bfdee34ed922367cd317b6e6d60c309de1",
};
for (const [relative, expected] of Object.entries(baselineHashes)) {
  must(sha256(read(relative)) === expected, `${relative} is not the verified Candidate 4 baseline`);
}

const repBarsSource = path.join(__dirname, "alpha23-candidate5", "rep-bars.cjs");
const repBarsTarget = path.join(root, "app/electron/rep-bars.cjs");
must(fs.existsSync(repBarsSource), "upstream v0.1.47 rep-bars.cjs is missing");
fs.copyFileSync(repBarsSource, repBarsTarget);

let nativeOcr = read("app/electron/native-linux-ocr.cjs");
nativeOcr = replaceOnce(nativeOcr,
  `  refinery:          { x: 0.08, y: 0.08, w: 0.84, h: 0.78 },`,
  `  refinery:          { x: 0.08, y: 0.08, w: 0.84, h: 0.78 },
  // The REP page spans most of the game display. Keep a small border out of OCR while retaining
  // the faction heading, section heading, every rank label, and the progress bars above them.
  reputation:         { x: 0.02, y: 0.04, w: 0.96, h: 0.90 },`,
  "Linux reputation OCR region");
write("app/electron/native-linux-ocr.cjs", nativeOcr);

let regionManager = read("app/server/overlay/linux-ocr-region-manager.js");
regionManager = replaceOnce(regionManager,
  `    refinery:     { x: 0.08, y: 0.08, w: 0.84, h: 0.78 },`,
  `    refinery:     { x: 0.08, y: 0.08, w: 0.84, h: 0.78 },
    reputation:   { x: 0.02, y: 0.04, w: 0.96, h: 0.90 },`,
  "reputation UI default");
regionManager = replaceOnce(regionManager,
  `    fabricator: 'Fabricator OCR', mission: 'Mission OCR', claimContext: 'Claim / context OCR', refinery: 'Refinery OCR',`,
  `    fabricator: 'Fabricator OCR', mission: 'Mission OCR', claimContext: 'Claim / context OCR', refinery: 'Refinery OCR',
    reputation: 'Reputation-page OCR',`,
  "reputation UI label");
regionManager = replaceOnce(regionManager,
  `    ocrMissionRegion: 'mission', ocrFabricatorRegion: 'fabricator', ocrClaimRegion: 'claimContext',`,
  `    ocrMissionRegion: 'mission', ocrFabricatorRegion: 'fabricator', ocrClaimRegion: 'claimContext',
    ocrReputationRegion: 'reputation',`,
  "reputation UI control map");
regionManager = replaceOnce(regionManager,
  `      ['ocrClaimRegion', 'claimContext', 'Show / adjust Claim/context OCR area'],`,
  `      ['ocrClaimRegion', 'claimContext', 'Show / adjust Claim/context OCR area'],
      ['ocrReputationRegion', 'reputation', 'Show / adjust Reputation OCR area'],`,
  "reputation UI control");
write("app/server/overlay/linux-ocr-region-manager.js", regionManager);

let config = read("app/server/overlay/config.html");
config = replaceOnce(config,
  `<input type="checkbox" id="repScan" disabled title="Reputation screen sync is unavailable in Alpha23 Candidate 1." />`,
  `<input type="checkbox" id="repScan" />`,
  "enable reputation setting");
write("app/server/overlay/config.html", config);

let server = read("app/server/server.mjs");
server = replaceOnce(server,
  `linuxOcrRegions: { resourceSignature: null, fabricator: null, mission: null, claimContext: null, refinery: null },`,
  `linuxOcrRegions: { resourceSignature: null, fabricator: null, mission: null, claimContext: null, refinery: null, reputation: null },`,
  "server reputation config default");
server = replaceOnce(server,
  `new Set(["resourceSignature", "fabricator", "mission", "claimContext", "refinery"])`,
  `new Set(["resourceSignature", "fabricator", "mission", "claimContext", "refinery", "reputation"])`,
  "server reputation config allowlist");
write("app/server/server.mjs", server);

let capture = read("app/electron/capture.cjs");
capture = replaceOnce(capture,
  `const { parseDisplayInfoLines, locationCropGeometry } = require("./location-sync-v3.cjs"); // ARCHVERSE_LOCATION_SYNC_V3`,
  `const { parseDisplayInfoLines, locationCropGeometry } = require("./location-sync-v3.cjs"); // ARCHVERSE_LOCATION_SYNC_V3
const { readBars, pixelsOf } = require("./rep-bars.cjs"); // ARCHVERSE_ALPHA23_REP_SCAN_PIXELS`,
  "reputation bar reader import");
capture = replaceOnce(capture,
  `const linuxBackgroundKeys = Object.freeze(["fabricator", "claimContext", "mission", "refinery"]);`,
  `const linuxBackgroundKeys = Object.freeze(["fabricator", "claimContext", "mission", "refinery", "reputation"]);`,
  "reputation background lane key");
capture = replaceOnce(capture,
  `  async function tick() {`,
  [
    '  // ARCHVERSE_ALPHA23_REP_SCAN_LINUX_ISOLATED: REP uses the existing auxiliary OCR worker',
    '  // and an independent adjustable crop. Mining vehicle authority defers this dispatcher below,',
    '  // so REP OCR and its loopback requests can never consume the latency-critical Mining lane.',
    '  async function postRepRead(repRead, image, frameWidth) {',
    '    if (!repRead || !image) return false;',
    '    let payload = null;',
    '    if (repRead.ok && Array.isArray(repRead.cards) && repRead.cards.length) {',
    '      payload = {',
    '        scope: repRead.scope,',
    '        giver: repRead.giver,',
    '        faction: repRead.faction,',
    '        bars: readBars(pixelsOf(image), repRead.cards, frameWidth),',
    '      };',
    '    } else if (!repRead.ok && repRead.report) {',
    '      payload = {',
    '        refusalOnly: repRead.refusal,',
    '        faction: repRead.faction,',
    '        section: repRead.section,',
    '        giver: repRead.giver,',
    '        tried: repRead.tried,',
    '      };',
    '    }',
    '    if (!payload) return false;',
    '    const response = await fetch(`http://127.0.0.1:${port}/api/rep-scan`, {',
    '      method: "POST",',
    '      headers: { "Content-Type": "application/json" },',
    '      body: JSON.stringify(payload),',
    '      signal: AbortSignal.timeout(3500),',
    '    });',
    '    if (!response.ok) throw new Error(`REP result delivery failed: HTTP ${response.status}`);',
    '    return true;',
    '  }',
    '',
    '  async function tick() {',
  ].join("\n"),
  "reputation result delivery");
capture = replaceOnce(capture,
  `    const miss = cfg.missionOcr === true;`,
  `    const miss = cfg.missionOcr === true;
    const rep = cfg.repScan === true;`,
  "reputation opt-in");
capture = replaceOnce(capture,
  `if (!fab && !miss && !mining && !claim && !locate) { emitContext("off"); return; }`,
  `if (!fab && !miss && !mining && !claim && !rep && !locate) { emitContext("off"); return; }`,
  "reputation arms capture");
capture = replaceOnce(capture,
  `if (!fab && !miss && !mining && !claim) { busy = false; busyAt = 0; return; }`,
  `if (!fab && !miss && !mining && !claim && !rep) { busy = false; busyAt = 0; return; }`,
  "reputation survives location-only shortcut");
capture = replaceOnce(capture,
  [
    '            const resp = await fetch(`http://localhost:${port}/api/screen-read`, {',
    '              method: "POST", headers: { "Content-Type": "application/json" },',
    '              body: JSON.stringify({',
    '                lines: got.lines, w: got.region.width, h: got.region.height, ocrRegion: key,',
    '                offsetX: got.region.x, offsetY: got.region.y, frameW: cap.width, frameH: cap.height,',
    '              }),',
    '              signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),',
    '            });',
    '            const read = await resp.json();',
    '            stage[`ocr_${key}`] = `${got.engine}:${Date.now() - t}ms:${got.region.width}x${got.region.height}`;',
    '            return { ...got, read };',
  ].join("\n"),
  [
    '            const repRegion = key === "reputation";',
    '            const endpoint = repRegion ? "/api/rep-read" : "/api/screen-read";',
    '            const resp = await fetch(`http://127.0.0.1:${port}${endpoint}`, {',
    '              method: "POST", headers: { "Content-Type": "application/json" },',
    '              body: JSON.stringify({',
    '                lines: got.lines, w: got.region.width, h: got.region.height, ocrRegion: key,',
    '                offsetX: got.region.x, offsetY: got.region.y, frameW: cap.width, frameH: cap.height,',
    '              }),',
    '              signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),',
    '            });',
    '            if (!resp.ok) throw new Error(`${key} OCR route failed: HTTP ${resp.status}`);',
    '            const read = await resp.json();',
    '            if (repRegion) await postRepRead(read, got.crop, got.region.width);',
    '            stage[`ocr_${key}`] = `${got.engine}:${Date.now() - t}ms:${got.region.width}x${got.region.height}`;',
    '            return repRegion ? null : { ...got, read };',
  ].join("\n"),
  "Linux reputation OCR route");
capture = replaceOnce(capture,
  `const enabled = { fabricator: !!fab, claimContext: !!claim && !(sameClaimRegion && fab), mission: !!miss, refinery: !!mining };`,
  `const enabled = { fabricator: !!fab, claimContext: !!claim && !(sameClaimRegion && fab), mission: !!miss, refinery: !!mining, reputation: !!rep };`,
  "reputation background dispatch");
capture = replaceOnce(capture,
  `const needGeneric = fab || miss || claim || mining;`,
  `const needGeneric = fab || miss || claim || mining || rep;`,
  "Windows reputation arming");
capture = replaceOnce(capture,
  `read = await resp.json(); stage.winOcr = Date.now() - t2;`,
  `read = await resp.json();
            if (rep && read?.rep) await postRepRead(read.rep, shot, cap.width);
            stage.winOcr = Date.now() - t2;`,
  "Windows reputation result delivery");
write("app/electron/capture.cjs", capture);

let verseFinder = read("app/server/overlay/versefinder.html");
verseFinder = replaceOnce(verseFinder,
  `          a.textContent = cf ? receiptAge(shownAt) : ageOf(shownAt);`,
  `          a.textContent = cf ? receiptAge(shownAt) : ageOf(shownAt);
          // Upstream v0.1.47: retain the full timestamp used at the 100-day band boundary.
          a.dataset.at = String(shownAt);`,
  "upstream v0.1.47 age-band timestamp");
write("app/server/overlay/versefinder.html", verseFinder);

const changelogPath = path.resolve(__dirname, "../../overlay/changelog.json");
const changelog = JSON.parse(read("app/server/overlay/changelog.json"));
const releaseChangelog = JSON.parse(fs.readFileSync(changelogPath, "utf8"));
must(releaseChangelog["0.1.47"], "repository v0.1.47 changelog entry missing");
must(!changelog["0.1.47"], "Candidate 4 unexpectedly already contains v0.1.47 changelog");
write("app/server/overlay/changelog.json", JSON.stringify({
  "0.1.47": releaseChangelog["0.1.47"],
  ...changelog,
}, null, 2) + "\n");

const packagePath = "app/package.json";
const pkg = JSON.parse(read(packagePath));
must(pkg.version === "0.1.46-r31.alpha23.candidate4", `unexpected package version ${pkg.version}`);
pkg.version = "0.1.47-r31.alpha23.candidate5";
pkg.description = "ArchVerse Alpha23 Candidate 5: upstream v0.1.47 with isolated Linux REP scanning and preserved Mining";
write(packagePath, JSON.stringify(pkg, null, 2) + "\n");

write("FIELD-TEST.md", `# ArchVerse Alpha23 Candidate 5

Version: 0.1.47-r31.alpha23.candidate5. Internal field candidate, not a release.

Candidate 5 starts from the exact checksum-verified Candidate 4 artifact and completes the
developer's v0.1.47 release. It adds the release age-band correction and changelog, then enables
the REP-page sync that earlier Alpha23 candidates deliberately kept disabled.

On Linux, REP uses an independent adjustable OCR region and the existing background OCR worker.
Game.log vehicle authority gives Mining exclusive use of OCR, so REP scanning pauses while aboard
a ship or controlling a ground vehicle. Candidate 4 capture, distinct-frame confirmation,
250/350/500 ms Mining cadence, direct Gamescope PipeWire, normal Wine/XWayland persistent capture,
held-F interaction, Shift+F6, click-through, and one-cursor behavior remain.

Close ArchVerse, extract this folder, then run ./bin/sc-blueprint-tracker. First repeat Candidate 4's
normal non-Gamescope and Gamescope Mining checks. Then leave the vehicle, enable "Sync my reputation
from the in-game REP page", open mobiGlas -> REP, and confirm the widget reports a successful update
or a specific refusal. Use "Show / adjust Reputation OCR area" only if the default crop misses part
of the page. Save complete electron.log and sidecar.log.
`);

const provenancePath = "ALPHA23-PROVENANCE.json";
const provenance = JSON.parse(read(provenancePath));
must(provenance.version === "0.1.46-r31.alpha23.candidate4", "Candidate 4 provenance missing");
provenance.version = "0.1.47-r31.alpha23.candidate5";
provenance.upstream = "e482c1ce3d461b390079486115293535be9b2ab7";
provenance.candidate4Artifact = 10290507069;
provenance.candidate4Run = 34670191831;
provenance.candidate4ArchiveSha256 = "c8b11e378016e123ae0c59252b33ebb3f19781cb8a756caff7ebbdf87e82e82d";
for (const relative of [
  "app/electron/capture.cjs",
  "app/electron/rep-bars.cjs",
  "app/electron/native-linux-ocr.cjs",
  "app/server/server.mjs",
  "app/server/overlay/config.html",
  "app/server/overlay/versefinder.html",
  "app/server/overlay/changelog.json",
  "app/server/overlay/linux-ocr-region-manager.js",
]) provenance.protectedFiles[relative] = sha256(read(relative));
provenance.fieldVerified = false;
write(provenancePath, JSON.stringify(provenance, null, 2) + "\n");

console.log("Alpha23 Candidate 5 apply OK: upstream v0.1.47, Linux REP scan, and Mining isolation");
