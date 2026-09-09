#!/usr/bin/env node
/** Port proven package-only policies at checked seams of the new sidecar bundle. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const [baselineRoot, stagedRoot] = process.argv.slice(2);
if (!baselineRoot || !stagedRoot) throw new Error('usage: port-alpha23-sidecar.mjs <verified-c8k-root> <staged-root>');
const baseline = readFileSync(join(baselineRoot, 'app/server/server.mjs'), 'utf8');
if (createHash('sha256').update(baseline).digest('hex') !== 'e572e2f4e806a3a354dd7fa44689c8703c608ba7349295e1483949a42b441ec2') throw new Error('Candidate 8k server provenance mismatch');
const target = join(stagedRoot, 'app/server/server.mjs');
let source = readFileSync(target, 'utf8');
const catalog = readFileSync(join(baselineRoot, 'app/electron/mining-signature-catalog.cjs'));
if (createHash('sha256').update(catalog).digest('hex') !== '09dfd261b2f4b2e261a01abd2d117259970b939ac199a3658d094fd260e16ed6') throw new Error('Candidate 8k catalog provenance mismatch');
function once(text, from, to) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`Alpha23 sidecar seam: ${from}: expected one, found ${count}`);
  return text.replace(from, to);
}
function section(text, start, end) {
  if (text.split(start).length !== 2) throw new Error(`ambiguous section start: ${start}`);
  const a = text.indexOf(start), b = text.indexOf(end, a + start.length);
  if (b < 0) throw new Error(`missing section end: ${end}`);
  return text.slice(a, b);
}
function transplant(start, end, baselineStart = start) {
  source = once(source, section(source, start, end), section(baseline, baselineStart, end));
}
function before(anchor, text) { source = once(source, anchor, text + anchor); }

before('import { createServer }', `const { classifyMiningSignature, miningSignatureLabel, MAX_VALID_SIGNATURE } = require('../electron/mining-signature-catalog.cjs'); // ARCHVERSE_LINUX_MINING_SIGNATURE_CATALOG_V1\n`);
transplant('  applyMineableRead(', '  setTarget(');
transplant('function parseSignature(text)', 'function parseDuration(text)', '// ARCHVERSE_LINUX_MINING_COORDINATE_REJECTION');
before('var MFR_THEME =', section(baseline, '// ARCHVERSE_LINUX_GAMELOG_VEHICLE_PRESENCE:', 'var MFR_THEME ='));
source = once(source, 'let seedMfr = null, seedShip = null;', `let seedMfr = null, seedShip = null;
    shipChannelAboard = false;
    shipChannelAboardName = null;
    controlledVehicleEntities.clear();
    vehiclePresenceChangedAt = Date.now();`);
for (const ev of ['ev', 'me']) source = once(source, `applyChatSignals(${ev});`, `applyChatSignals(${ev});\n      applyVehicleControlPresence(${ev});`);
for (const line of ['line', 'e.message']) source = once(source, `const chan = shipChannelEvent(${line});`, `const chan = shipChannelEvent(${line});\n    setShipChannelPresence(chan);`);
before('  if (url === "/api/blueprint-names"', section(baseline, '  if (url === "/api/vehicle-presence"', '  if (url === "/api/blueprint-names"'));
before('var miningClients =', 'var inlineMiningLastPublishKey = "";\nvar inlineMiningLastPublishAt = 0;\n');
transplant('    if (body.miningCrop === true && Array.isArray(body.lines)) {', '    } else if (body.contractCrop');
before('    if (rd.kind === "refinery")', section(baseline, '    if (rd.kind === "mining-observation")', '    if (rd.kind === "refinery")'));
const response = '    res.end(JSON.stringify({ ...result, scanHud, rep: repRead }));';
const commit = section(baseline, '    // ARCHVERSE_LINUX_MINING_INLINE_COMMIT_SERVER:', '    res.writeHead(200,');
source = once(source, '    res.writeHead(200, { "Content-Type": "application/json" });\n' + response,
  commit + '    res.writeHead(200, { "Content-Type": "application/json" });\n    res.end(JSON.stringify({ ...result, scanHud, rep: repRead, miningCommit, vehiclePresence: miningPresence }));');

// Location Sync keeps its one-shot durable transport. Resolve body coordinates against the same
// active-stop set as Candidate 8k, while retaining upstream terminal detection as the fallback.
before('import { createServer }', `const { nearestActiveStop } = require('../electron/location-sync-v3.cjs'); // ARCHVERSE_LOCATION_SYNC_V3\nconst avFs = require('node:fs');\nconst avPath = require('node:path');\n`);
let locateState = section(baseline, '// ARCHVERSE_LOCATION_SYNC_V3_STATE', 'var payoutScanner =');
for (const [old, replacement] of [['join13', 'avPath.join'], ['existsSync12', 'avFs.existsSync'], ['readFileSync12', 'avFs.readFileSync'], ['rmSync', 'avFs.rmSync']]) locateState = locateState.replaceAll(old + '(', replacement + '(');
before('var payoutScanner =', locateState);
before('  haulingOpen: false,', '  haulingLocateAt: 0,\n');
before('  if (url === "/api/hauling/place"', section(baseline, '  // ARCHVERSE_LOCATION_SYNC_V3_API', '  if (url === "/api/hauling/place"'));
before('  const knownNames = new Map(nameByLoc);', section(baseline, '  // ARCHVERSE_LOCATION_SYNC_V3_PLAN:', '  const detected = posMatch?.id ?? null;'));
source = once(source, '  const seen = byToken;', '  const seen = posMatch?.id ?? byToken;');
source = once(source, '    detectedBy: byToken ? "terminal" : null', `    detectedBy: posMatch ? "coordinates" : byToken ? "terminal" : null,
    detectedMetres: posMatch?.metres ?? null,
    detectedFrame: opts.atPos?.frame ?? null,
    detectedBody: opts.atPos?.body ?? null,
    detectedSystem: opts.atPos?.system ?? null,
    detectedSource: opts.atPos?.source ?? null`);
const startAt = '      startAt: typeof body.startAt === "string" && body.startAt ? body.startAt : null,';
source = once(source, startAt, startAt + '\n      atPos: haulingLocate?.ok ? haulingLocate : null,\n      snapMetres: HAULING_LOCATE_SNAP_M,');

// Retain atomic config replacement despite upstream's split config module.
source = once(source, '    await writeFile2(configPath, JSON.stringify(config, null, 2));', `    // ARCHVERSE_CONFIG_ATOMIC_SAVE
    const temporary = configPath + '.tmp-' + process.pid + '-' + Date.now();
    try {
      avFs.writeFileSync(temporary, JSON.stringify(config, null, 2), 'utf8');
      avFs.renameSync(temporary, configPath);
    } finally {
      avFs.rmSync(temporary, { force: true });
    }`);

// Nothing is written until every semantic seam has matched.
writeFileSync(target, source);
console.log('Alpha23 sidecar Mining authority, parser, observation, and inline commit ported');
