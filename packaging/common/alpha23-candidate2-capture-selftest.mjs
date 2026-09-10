import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('usage: alpha23-candidate2-capture-selftest.mjs <candidate-root>');
const must = (value, message) => { if (!value) throw new Error(`Alpha23 Candidate 2 capture self-test: ${message}`); };
const capture = await readFile(path.join(root, 'app/electron/capture.cjs'), 'utf8');
const pkg = JSON.parse(await readFile(path.join(root, 'app/package.json'), 'utf8'));

must(pkg.version === '0.1.46-r31.alpha23.candidate2', `wrong version ${pkg.version}`);
must(capture.includes('ARCHVERSE_ALPHA23_DIRECT_SC_WINDOW_CAPTURE'), 'direct Star Citizen window path missing');
must(capture.includes('method: "electron-star-citizen-window"'), 'direct window capture method missing');
must(capture.includes('ARCHVERSE_ALPHA23_FALLBACK_UPGRADE_PROBE'), 'Spectacle upgrade probe missing');
must(capture.includes('? ["pipewire", "gamescope", "electron", "spectacle"]'), 'Wayland capture order is not PipeWire/window/monitor/Spectacle');
must(capture.includes('? ["gamescope", "electron", "spectacle"]'), 'cached Spectacle cannot probe faster sources');
must(capture.includes('const FAST_MS = 600;'), 'locked Mining cadence is not 600ms');
must(capture.includes('const MINING_VEHICLE_IDLE_MS = 800;'), 'acquisition Mining cadence is not 800ms');
must(capture.includes('ARCHVERSE_LINUX_MINING_LATEST_FRAME_SCHEDULER'), 'single-flight latest-frame scheduler changed');
must(capture.includes('method: "gamescope-pipewire"'), 'direct Gamescope PipeWire authority changed');
must(capture.indexOf('"pipewire", "gamescope", "electron", "spectacle"') < capture.indexOf('const order ='),
  'capture order is malformed');

console.log('Alpha23 Candidate 2 capture self-test OK: direct game/window preference, fallback upgrade, PipeWire authority, and 600/800ms cadence are intact');
