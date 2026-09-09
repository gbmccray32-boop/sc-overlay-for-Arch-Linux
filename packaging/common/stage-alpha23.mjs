#!/usr/bin/env node
import { chmodSync, cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const [baselineArg, targetArg] = process.argv.slice(2);
if (!baselineArg || !targetArg) throw new Error('usage: stage-alpha23.mjs <verified-c8k-root> <new-output-root>');
const baseline = resolve(baselineArg), target = resolve(targetArg);
if (existsSync(target)) throw new Error('staging output must not exist');
const version = '0.1.46-r31.alpha23.candidate1';
cpSync(baseline, target, { recursive: true });
// Retain package-only Linux renderer helpers while replacing upstream files and data.
cpSync('build/server', join(target, 'app/server'), { recursive: true });
for (const script of ['port-alpha23-widgets.cjs', 'port-alpha23-sidecar.mjs', 'port-alpha23-location-ui.mjs']) {
  const args = script === 'port-alpha23-widgets.cjs' ? [target] : [baseline, target];
  execFileSync(process.execPath, [join('packaging/common', script), ...args], { stdio: 'inherit' });
}
const packagePath = join(target, 'app/package.json');
const pkg = JSON.parse(readFileSync(packagePath));
pkg.version = version;
pkg.description = 'ArchVerse Alpha23 field candidate: upstream 0.1.46 with Candidate 8k Mining and field-safe sidecar supervision.';
writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
const settingsPath = join(target, 'app/server/overlay/config.html');
let settings = readFileSync(settingsPath, 'utf8');
settings = settings.replace('id="repScan" />', 'id="repScan" disabled title="Reputation screen sync is unavailable in Alpha23 Candidate 1." />');
if (!settings.includes('id="repScan" disabled')) throw new Error('reputation availability control missing');
writeFileSync(settingsPath, settings);
writeFileSync(join(target, 'FIELD-TEST.md'), `# ArchVerse Alpha23 Candidate 1

Version: ${version}. Internal field candidate, not a release.

This candidate brings in the frozen upstream 0.1.46 backend and renderer, including Log,
Verse Finder, and expanded Hauling. Candidate 8k Mining capture, transport, PipeWire stream,
and supervision remain unchanged. One-shot Location Sync is retained.

Close ArchVerse, extract this folder beside Candidate 8k, then run ./bin/sc-blueprint-tracker.
Use your existing Star Citizen launcher. No launcher-script changes are needed.

Test held F and Shift+F6, Log and Verse Finder persistence, Mining without focus actions,
on-foot Mining refusal, Hauling and one-shot Location Sync, and a long Mining session.
Save complete electron.log and sidecar.log. Gamescope must report gamescope-pipewire and its node.
Also test one default non-Gamescope launch before release approval.
`);
writeFileSync(join(target, 'verify-alpha.sh'), `#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
sha256sum -c SHA256SUMS
`);
chmodSync(join(target, 'verify-alpha.sh'), 0o755);
const protectedFiles = ['capture.cjs', 'mining-result-transport.cjs', 'mining-vehicle-presence.cjs', 'mining-signature-catalog.cjs', 'persistent-gamescope-pipewire.cjs', 'sidecar-health-watchdog.cjs', 'location-sync-v3.cjs'];
const hashes = {};
for (const file of protectedFiles) {
  const relative = 'app/electron/' + file;
  const sha = (root) => createHash('sha256').update(readFileSync(join(root, relative))).digest('hex');
  hashes[relative] = sha(target);
  if (sha(baseline) !== hashes[relative]) throw new Error('Linux baseline changed: ' + file);
}
writeFileSync(join(target, 'ALPHA23-PROVENANCE.json'), JSON.stringify({ version, upstream: 'fbe3faedb38c82d11650ef6424e4037a9806cf95', baselineArtifact: 10024814784, protectedFiles: hashes, fieldVerified: false }, null, 2) + '\n');
console.log('Alpha23 staging completed; validation and field gates remain required');
