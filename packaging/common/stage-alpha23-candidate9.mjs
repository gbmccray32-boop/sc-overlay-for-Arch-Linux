#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
const [baseArg, outArg] = process.argv.slice(2);
if (!baseArg || !outArg) throw new Error("usage: stage-alpha23-candidate9.mjs <candidate8-root> <candidate9-root>");
const base = path.resolve(baseArg), out = path.resolve(outArg);
if (out === base || base.startsWith(out + path.sep)) throw new Error("output cannot overwrite baseline");
if (fs.existsSync(out)) throw new Error("output must be a new candidate directory");
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const runtimeHash = "634e08894a81dda930b997f46ea1959a721ae756ed4882adbd8ae8747a7cda5a";
if (hash(path.join(base, "runtime/electron/electron")) !== runtimeHash) throw new Error("Candidate 8 Electron runtime checksum mismatch");
const provenance = JSON.parse(fs.readFileSync(path.join(base, "ALPHA23-PROVENANCE.json")));
if (JSON.parse(fs.readFileSync(path.join(base, "app/package.json"))).version !== "0.1.47-r31.alpha23.candidate8") throw new Error("Candidate 8 baseline required");
for (const [file, wanted] of Object.entries(provenance.protectedFiles)) {
  if (hash(path.join(base, file)) !== wanted) throw new Error("baseline protected mismatch: " + file);
}
fs.cpSync(base, out, { recursive: true, preserveTimestamps: true });
fs.cpSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "alpha23-candidate9"), out, { recursive: true, force: true });
const version = "0.1.47-r31.alpha23.candidate9";
for (const file of ["app/package.json", "app/package-lock.json"]) {
  const target = path.join(out, file), data = JSON.parse(fs.readFileSync(target));
  data.version = version;
  if (data.packages?.[""]) data.packages[""].version = version;
  fs.writeFileSync(target, JSON.stringify(data, null, 2) + "\n");
}
const changed = new Set(["app/electron/persistent-star-citizen-window.cjs", "app/electron/star-citizen-window-helper.cjs", "app/electron/star-citizen-window-preload.cjs"]);
for (const [file, wanted] of Object.entries(provenance.protectedFiles)) {
  const got = hash(path.join(out, file));
  if (!changed.has(file) && got !== wanted) throw new Error("protected candidate mismatch: " + file);
  provenance.protectedFiles[file] = got;
}
provenance.version = version;
provenance.baselineArtifact = 10412447176;
provenance.candidate8ArchiveSha256 = "8919ba757eee1be95e8adf2f7dfde7c658ec7060081842b75604a186ae94807f";
provenance.fieldVerified = false;
fs.writeFileSync(path.join(out, "ALPHA23-PROVENANCE.json"), JSON.stringify(provenance, null, 2) + "\n");
console.log("Staged Candidate 9 with all unchanged protected files verified");
