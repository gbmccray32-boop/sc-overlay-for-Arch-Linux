#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const [baseArg, outArg] = process.argv.slice(2);
if (!baseArg || !outArg) throw new Error("usage: stage-alpha23-candidate14.mjs <candidate13-root> <candidate14-root>");
const base = path.resolve(baseArg), out = path.resolve(outArg);
if (out === base || base.startsWith(out + path.sep) || fs.existsSync(out)) throw new Error("output must be a new candidate directory");
const common = path.dirname(fileURLToPath(import.meta.url));
const patchRoot = path.join(common, "alpha23-candidate14");
const nativeHelper = path.join(patchRoot, "app/electron/archverse-portal-pipewire");
if (!fs.existsSync(nativeHelper)) throw new Error("compile archverse-portal-pipewire before staging Candidate 14");
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const manifest = fs.readFileSync(path.join(base, "SHA256SUMS"), "utf8");
for (const line of manifest.split("\n").filter(Boolean)) {
  const match = /^([0-9a-f]{64})  \.\/(.+)$/.exec(line);
  if (!match || hash(path.join(base, match[2])) !== match[1]) throw new Error("Candidate 13 manifest mismatch: " + line.slice(0, 100));
}
const provenance = JSON.parse(fs.readFileSync(path.join(base, "ALPHA23-PROVENANCE.json")));
if (JSON.parse(fs.readFileSync(path.join(base, "app/package.json"))).version !== "0.1.47-r31.alpha23.candidate13") throw new Error("Candidate 13 baseline required");
for (const [file, wanted] of Object.entries(provenance.protectedFiles)) {
  if (hash(path.join(base, file)) !== wanted) throw new Error("baseline protected mismatch: " + file);
}

fs.cpSync(base, out, { recursive: true, preserveTimestamps: true });
fs.cpSync(patchRoot, out, { recursive: true, force: true });
const version = "0.1.47-r31.alpha23.candidate14";
for (const file of ["app/package.json", "app/package-lock.json"]) {
  const target = path.join(out, file), data = JSON.parse(fs.readFileSync(target));
  data.version = version;
  if (data.packages?.[""]) data.packages[""].version = version;
  fs.writeFileSync(target, JSON.stringify(data, null, 2) + "\n");
}
const changed = new Set([
	"app/electron/archverse-portal-pipewire",
	"app/electron/native-portal-pipewire.c",
]);
for (const [file, wanted] of Object.entries(provenance.protectedFiles)) {
  const got = hash(path.join(out, file));
  if (!changed.has(file) && got !== wanted) throw new Error("protected candidate mismatch: " + file);
  provenance.protectedFiles[file] = got;
}
provenance.protectedFiles["app/electron/archverse-portal-pipewire"] = hash(path.join(out, "app/electron/archverse-portal-pipewire"));
provenance.protectedFiles["app/electron/native-portal-pipewire.c"] = hash(path.join(out, "app/electron/native-portal-pipewire.c"));
provenance.protectedFiles["app/electron/portal-raw-frame.cjs"] = hash(path.join(out, "app/electron/portal-raw-frame.cjs"));
provenance.version = version;
provenance.baselineArtifact = 10588907705;
provenance.candidate13ArchiveSha256 = "64c5a5752e7d4a70790ddb7e967a570a153f03c77982dcec8406fe0dd6f49093";
provenance.fieldVerified = false;
fs.writeFileSync(path.join(out, "ALPHA23-PROVENANCE.json"), JSON.stringify(provenance, null, 2) + "\n");
console.log("Staged Candidate 14 with Candidate 13 manifest, KDE session-handle repair, and protected files verified");
