#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
const [baseArg, outArg] = process.argv.slice(2);
if (!baseArg || !outArg) throw new Error("usage: stage-alpha23-candidate11.mjs <candidate10-root> <candidate11-root>");
const base = path.resolve(baseArg), out = path.resolve(outArg);
if (out === base || base.startsWith(out + path.sep)) throw new Error("output cannot overwrite baseline");
if (fs.existsSync(out)) throw new Error("output must be a new candidate directory");
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const runtimeHash = "634e08894a81dda930b997f46ea1959a721ae756ed4882adbd8ae8747a7cda5a";
if (hash(path.join(base, "runtime/electron/electron")) !== runtimeHash) throw new Error("Candidate 10 Electron runtime checksum mismatch");
const provenance = JSON.parse(fs.readFileSync(path.join(base, "ALPHA23-PROVENANCE.json")));
if (JSON.parse(fs.readFileSync(path.join(base, "app/package.json"))).version !== "0.1.47-r31.alpha23.candidate10") throw new Error("Candidate 10 baseline required");
for (const [file, wanted] of Object.entries(provenance.protectedFiles)) {
  if (hash(path.join(base, file)) !== wanted) throw new Error("baseline protected mismatch: " + file);
}
fs.cpSync(base, out, { recursive: true, preserveTimestamps: true });
fs.cpSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "alpha23-candidate11"), out, { recursive: true, force: true });
// The Candidate 10 test expects sharp in the renderer; CI runs it against the pinned baseline.
// The Candidate 11 package carries its replacement tests for nativeImage and real Electron.
fs.rmSync(path.join(out, "tests/alpha23-candidate10-encoder.test.cjs"));
const serverPath = path.join(out, "app/server/server.mjs");
let server = fs.readFileSync(serverPath, "utf8");
function replaceExactly(before, after) {
  if (server.split(before).length !== 2) throw new Error("sidecar parser anchor missing or duplicated: " + before.slice(0, 70));
  server = server.replace(before, after);
}
replaceExactly(
  "var MINING_LINE_NEGATIVE_CONTEXT = /\\b(?:CARGO|FREIGHT|INVENTORY|STORAGE|CONTAINER)\\b/i;",
  "var MINING_LINE_NEGATIVE_CONTEXT = /\\b(?:CARGO|FREIGHT|INVENTORY|STORAGE|CONTAINER)\\b/i;\nvar MINING_CARGO_QUANTITY_CONTEXT = /\\bVOLUME\\s*:|[µμu]SCU\\b/i;",
);
replaceExactly(
  "if (isNavigationCoordinateText(allText) || MINING_GLOBAL_NEGATIVE_CONTEXT.test(allText)) return null;",
  "if (isNavigationCoordinateText(allText) || MINING_GLOBAL_NEGATIVE_CONTEXT.test(allText) || MINING_CARGO_QUANTITY_CONTEXT.test(allText)) return null;",
);
fs.writeFileSync(serverPath, server);
const version = "0.1.47-r31.alpha23.candidate11";
for (const file of ["app/package.json", "app/package-lock.json"]) {
  const target = path.join(out, file), data = JSON.parse(fs.readFileSync(target));
  data.version = version;
  if (data.packages?.[""]) data.packages[""].version = version;
  fs.writeFileSync(target, JSON.stringify(data, null, 2) + "\n");
}
const changed = new Set([
  "app/electron/capture.cjs", "app/electron/mining-result-transport.cjs",
  "app/electron/persistent-star-citizen-window.cjs", "app/electron/star-citizen-window-helper.cjs",
  "app/electron/star-citizen-window-preload.cjs", "app/server/server.mjs",
]);
for (const [file, wanted] of Object.entries(provenance.protectedFiles)) {
  const got = hash(path.join(out, file));
  if (!changed.has(file) && got !== wanted) throw new Error("protected candidate mismatch: " + file);
  provenance.protectedFiles[file] = got;
}
provenance.version = version;
provenance.baselineArtifact = 10427872184;
provenance.candidate10ArchiveSha256 = "0983ef18d0b56a0e5a1ebe8e92f641055af7cc072b962d9cd1d1f38ee2b4a8fc";
provenance.fieldVerified = false;
fs.writeFileSync(path.join(out, "ALPHA23-PROVENANCE.json"), JSON.stringify(provenance, null, 2) + "\n");
console.log("Staged Candidate 11 with all unchanged protected files verified");
