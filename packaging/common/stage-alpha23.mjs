#!/usr/bin/env node
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
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
