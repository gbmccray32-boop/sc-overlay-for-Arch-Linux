const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const target = path.resolve(process.argv[2]);
if (!fs.existsSync(target)) throw new Error('usage: alpha23-main-startup-selftest.cjs <main.cjs>');
const harnessPath = path.resolve(__dirname, '../../linux-port/alpha18-main-startup-smoke.sh');
const shell = fs.readFileSync(harnessPath, 'utf8');
let harness = shell.split("cat > \"$TMP/main-smoke.cjs\" <<'NODE'\n")[1]?.split('\nNODE\n')[0];
if (!harness) throw new Error('startup harness source seam changed');
harness = harness.replace("return '0.1.41-r31-alpha.18';", "return '0.1.46-r31.alpha23.candidate1';");
harness = harness.replace(
  "if (!ipcListeners.has('app:set-mining'))",
  "for (const channel of ['app:set-logview', 'app:set-versefinder']) { if (!ipcListeners.has(channel)) throw new Error('missing Alpha23 widget IPC: ' + channel); }\n  if (!ipcListeners.has('app:set-mining'))",
);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha23-main-smoke-'));
const script = path.join(temp, 'main-smoke.cjs');
try {
  fs.writeFileSync(script, harness);
  const result = spawnSync(process.execPath, [script, target], { encoding: 'utf8', timeout: 15000 });
  process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
  if (result.status !== 0) throw new Error(`Alpha23 main startup smoke exited ${result.status}`);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
