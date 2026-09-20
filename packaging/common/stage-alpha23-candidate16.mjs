#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const [baseArg, outArg] = process.argv.slice(2);
if (!baseArg || !outArg) throw new Error("usage: stage-alpha23-candidate16.mjs <candidate15-root> <candidate16-root>");
const base = path.resolve(baseArg), out = path.resolve(outArg);
if (out === base || base.startsWith(out + path.sep) || fs.existsSync(out)) throw new Error("output must be a new candidate directory");
const common = path.dirname(fileURLToPath(import.meta.url));
const patchRoot = path.join(common, "alpha23-candidate16");

const hash = (file) => execFileSync("sha256sum", [file], { encoding: "utf8" }).slice(0, 64);
const manifest = fs.readFileSync(path.join(base, "SHA256SUMS"), "utf8");
for (const line of manifest.split("\n").filter(Boolean)) {
  const match = /^([0-9a-f]{64})  \.\/(.+)$/.exec(line);
  if (!match || hash(path.join(base, match[2])) !== match[1]) throw new Error("Candidate 15 manifest mismatch: " + line.slice(0, 100));
}
const provenance = JSON.parse(fs.readFileSync(path.join(base, "ALPHA23-PROVENANCE.json")));
if (JSON.parse(fs.readFileSync(path.join(base, "app/package.json"))).version !== "0.1.47-r31.alpha23.candidate15") {
  throw new Error("Candidate 15 baseline required");
}
for (const [file, wanted] of Object.entries(provenance.protectedFiles)) {
  if (hash(path.join(base, file)) !== wanted) throw new Error("baseline protected mismatch: " + file);
}

fs.cpSync(base, out, { recursive: true, preserveTimestamps: true });
fs.cpSync(patchRoot, out, { recursive: true, force: true });
const version = "0.1.47-r31.alpha23.candidate16";
for (const file of ["app/package.json", "app/package-lock.json"]) {
  const target = path.join(out, file), data = JSON.parse(fs.readFileSync(target));
  data.version = version;
  if (data.packages?.[""]) data.packages[""].version = version;
  fs.writeFileSync(target, JSON.stringify(data, null, 2) + "\n");
}

for (const [file, wanted] of Object.entries(provenance.protectedFiles)) {
  if (hash(path.join(out, file)) !== wanted) throw new Error("protected candidate mismatch: " + file);
}
provenance.protectedFiles["app/electron/linux/focus-controller.cjs"] = hash(
  path.join(out, "app/electron/linux/focus-controller.cjs"),
);
provenance.version = version;
provenance.baselineArtifact = 10596449945;
provenance.candidate15ArchiveSha256 = "5d2e130648131faa03f9688f850bf306b5c7e39ff925971233fc735f2965da61";
provenance.fieldVerified = false;
fs.writeFileSync(path.join(out, "ALPHA23-PROVENANCE.json"), JSON.stringify(provenance, null, 2) + "\n");
console.log("Staged Candidate 16 with strict normal/Gamescope pointer-mode isolation");
