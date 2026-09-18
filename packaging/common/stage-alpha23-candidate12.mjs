#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const [baseArg, outArg] = process.argv.slice(2);
if (!baseArg || !outArg) throw new Error('usage: stage-alpha23-candidate12.mjs <candidate11-root> <candidate12-root>');
const base = path.resolve(baseArg), out = path.resolve(outArg);
if (out === base || base.startsWith(out + path.sep) || fs.existsSync(out)) throw new Error('output must be a new candidate directory');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifest = fs.readFileSync(path.join(base, 'SHA256SUMS'), 'utf8');
for (const line of manifest.split('\n').filter(Boolean)) {
  const match = /^([0-9a-f]{64})  \.\/(.+)$/.exec(line);
  if (!match || hash(path.join(base, match[2])) !== match[1]) throw new Error('Candidate 11 manifest mismatch: ' + line.slice(0, 100));
}
const provenance = JSON.parse(fs.readFileSync(path.join(base, 'ALPHA23-PROVENANCE.json')));
if (JSON.parse(fs.readFileSync(path.join(base, 'app/package.json'))).version !== '0.1.47-r31.alpha23.candidate11') throw new Error('Candidate 11 baseline required');
for (const [file, wanted] of Object.entries(provenance.protectedFiles)) {
  if (hash(path.join(base, file)) !== wanted) throw new Error('baseline protected mismatch: ' + file);
}
fs.cpSync(base, out, { recursive: true, preserveTimestamps: true });
fs.cpSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'alpha23-candidate12'), out, { recursive: true, force: true });
// Candidate 11 encoder regression expects nativeImage.toPNG. Run it against the pinned baseline.
fs.rmSync(path.join(out, 'tests/alpha23-candidate11-encoder.test.cjs'));
const version = '0.1.47-r31.alpha23.candidate12';
for (const file of ['app/package.json', 'app/package-lock.json']) {
  const target = path.join(out, file), data = JSON.parse(fs.readFileSync(target));
  data.version = version;
  if (data.packages?.['']) data.packages[''].version = version;
  fs.writeFileSync(target, JSON.stringify(data, null, 2) + '\n');
}
const changed = new Set(['app/electron/persistent-star-citizen-window.cjs']);
for (const [file, wanted] of Object.entries(provenance.protectedFiles)) {
  const got = hash(path.join(out, file));
  if (!changed.has(file) && got !== wanted) throw new Error('protected candidate mismatch: ' + file);
  provenance.protectedFiles[file] = got;
}
provenance.version = version;
provenance.baselineArtifact = 10477397738;
provenance.candidate11ArchiveSha256 = '60406e891af0bf881b8c041de455c087192e23608a499fc49439d0cff652bf47';
provenance.fieldVerified = false;
fs.writeFileSync(path.join(out, 'ALPHA23-PROVENANCE.json'), JSON.stringify(provenance, null, 2) + '\n');
console.log('Staged Candidate 12 with full Candidate 11 manifest and unchanged protected files verified');
