#!/usr/bin/env node
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('usage: alpha23-candidate4-selftest.mjs <candidate-root>');
const must = (value, message) => { if (!value) throw new Error(`Alpha23 Candidate 4 self-test: ${message}`); };
const require = createRequire(import.meta.url);
const capture = await readFile(path.join(root, 'app/electron/capture.cjs'), 'utf8');
const server = await readFile(path.join(root, 'app/server/server.mjs'), 'utf8');
const helper = await readFile(path.join(root, 'app/electron/star-citizen-window-helper.cjs'), 'utf8');
const preload = await readFile(path.join(root, 'app/electron/star-citizen-window-preload.cjs'), 'utf8');
const pkg = JSON.parse(await readFile(path.join(root, 'app/package.json'), 'utf8'));

must(pkg.version === '0.1.46-r31.alpha23.candidate4', `wrong version ${pkg.version}`);
must(capture.includes('createPersistentStarCitizenWindowCapture'), 'persistent Wine/XWayland stream is not wired');
must(capture.includes('gameStartTicks: session.gameStartTicks'), 'window helper session key is not PID/start-tick bound');
must(capture.includes('HOST_IS_WAYLAND ? ["window", "spectacle", "electron"]'), 'Wayland fallback can still block main-process capture first');
must(capture.includes('method: "gamescope-pipewire"'), 'direct Gamescope PipeWire method changed');
must(capture.includes('? ["pipewire", "gamescope", "electron", "spectacle"]'), 'Gamescope backend order changed');
must(capture.includes('const MINING_CONFIRM_MS = 250;'), 'confirmation cadence is not 250ms');
must(capture.includes('const FAST_MS = 350;'), 'locked cadence is not 350ms');
must(capture.includes('const MINING_VEHICLE_IDLE_MS = 500;'), 'acquisition cadence is not 500ms');
must(capture.includes('commitMining: confirmation.status === "confirmed"'), 'unconfirmed OCR can reach commit authority');
must(capture.includes('capture=${_lastOcrCaptureInfo?.method || "unknown"}:${_lastOcrCaptureInfo?.captureMs ?? "?"}ms'), 'capture timing is absent from heartbeat');
must(helper.includes('thumbnailSize: { width: 1, height: 1 }'), 'helper discovery requests a full thumbnail');
must(helper.includes('app.disableHardwareAcceleration()'), 'isolated helper GPU guard missing');
must(preload.includes('chromeMediaSourceId'), 'persistent MediaStream does not bind the exact source ID');
must(preload.includes('frame is stale for more than 1500ms'), 'stale-frame rejection missing');
must(server.includes('ARCHVERSE_ALPHA23_NO_WHITESPACE_DIGIT_JOIN'), 'sidecar parser was not hardened');

const transport = require(path.join(root, 'app/electron/mining-result-transport.cjs'));
must(transport.signatureValues('DISABLED IN ATMOSPHERE | 60 30 100 | A | 87 | 188').length === 0,
  'Candidate 3 false 30100 still parses');
must(JSON.stringify(transport.signatureValues('30,100')) === '[30100]', 'comma-grouped 30100 rejected');
must(JSON.stringify(transport.signatureValues('30.100')) === '[30100]', 'dot-grouped 30100 rejected');
must(JSON.stringify(transport.signatureValues('30100')) === '[30100]', 'compact 30100 rejected');
const split = transport.classifyMiningOcrLines([
  { text: '30', x: 100, y: 40, w: 25, h: 20 },
  { text: '100', x: 132, y: 40, w: 35, h: 20 },
], { width: 300 });
must(split.kind === 'mineable' && split.signature === 30100, 'adjacent split grouped signature rejected');

const { createMiningSignatureConfirmation } = require(path.join(root, 'app/electron/mining-signature-confirmation.cjs'));
let clock = 1000;
const confirmation = createMiningSignatureConfirmation({ now: () => clock });
const result = { kind: 'mineable', signature: 30100, text: { x: 100, y: 40, w: 70, h: 20 } };
must(confirmation.observe(result, 'frame-a').status === 'pending', 'first frame was not held pending');
clock += 250;
must(confirmation.observe(result, 'frame-a').status === 'pending', 'same source frame confirmed itself');
clock += 250;
must(confirmation.observe(result, 'frame-b').status === 'confirmed', 'second distinct frame did not confirm');
clock += 100;
must(confirmation.observe({ ...result, signature: 32000 }, 'frame-c').status === 'pending', 'changed signature bypassed confirmation');
clock += 1700;
must(confirmation.observe(null, 'frame-d').status === 'none' && !confirmation.isPending(), 'expired candidate remained pending');

console.log('Alpha23 Candidate 4 self-test OK: isolated stream, safe parser, distinct-frame authority, cadence, timing, and PipeWire contract');
