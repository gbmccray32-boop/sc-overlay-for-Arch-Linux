import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('usage: alpha23-candidate3-selftest.mjs <candidate-root>');
const must = (value, message) => { if (!value) throw new Error(`Alpha23 Candidate 3 self-test: ${message}`); };
const main = await readFile(path.join(root, 'app/electron/main.cjs'), 'utf8');
const capture = await readFile(path.join(root, 'app/electron/capture.cjs'), 'utf8');
const pkg = JSON.parse(await readFile(path.join(root, 'app/package.json'), 'utf8'));

must(pkg.version === '0.1.46-r31.alpha23.candidate3', `wrong version ${pkg.version}`);
must(main.includes('ARCHVERSE_ALPHA23_STALE_MODAL_LATCH_RECOVERY'), 'stale modal recovery missing');
must(main.includes('if (modalOpen) {\n        modalOpen = false;\n        maskModal = false;'), 'empty-canvas release does not clear stale modal ownership');
must(main.includes('!moveMode && !miningMoveMode && !notepadEditing && !dragging'), 'empty-canvas release lacks explicit-mode guards');
must(main.includes('arrange mode superseded F latch'), 'Shift+F6 cannot supersede an F latch');
must(main.includes('Mining interaction superseded F latch'), 'Mining-only interaction cannot supersede an F latch');

must(capture.includes('ARCHVERSE_ALPHA23_WINDOW_CAPTURE_DEADLINE'), 'normal-session capture deadline missing');
must(capture.includes('const WINDOW_CAPTURE_DEADLINE_MS = 500;'), 'window capture deadline is not 500ms');
must(capture.includes('gamescope: captureWithBoundedGameWindow'), 'window backend is not deadline bounded');
must(capture.includes('if (scSession.current()?.gamescopePid) return captureWithGamescopeWindow(disp);'), 'Gamescope window fallback contract changed');
must(capture.includes('method: "gamescope-pipewire"'), 'direct Gamescope PipeWire authority changed');
must(capture.includes('expandMiningAcquisitionRegion(full, cap.width, cap.height)'), 'Mining acquisition padding is not active');
must(capture.includes('? tightenRegion(full, sigBox)'), 'signature lock no longer uses the exact configured-region clamp');

const require = createRequire(import.meta.url);
const transport = require(path.join(root, 'app/electron/mining-result-transport.cjs'));
must(JSON.stringify(transport.signatureValues('64,000')) === '[64000]', 'valid grouped RS rejected');
must(JSON.stringify(transport.signatureValues('64000')) === '[64000]', 'valid compact RS rejected');
must(transport.signatureValues('2,000 m').length === 0, 'metre distance admitted as RS');
must(transport.signatureValues('64,000km').length === 0, 'kilometre distance admitted as RS');
must(JSON.stringify(transport.signatureValues('Distance 13.3 km | RS 64,000')) === '[64000]', 'distance filtering removed valid adjacent RS');

console.log('Alpha23 Candidate 3 self-test OK: focus recovery, capture deadline, PipeWire authority, padding, and distance rejection are intact');
