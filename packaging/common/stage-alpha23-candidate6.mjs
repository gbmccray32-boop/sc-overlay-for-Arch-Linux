#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const [baselineArg, outputArg] = process.argv.slice(2);
if (!baselineArg || !outputArg) {
  console.error("usage: stage-alpha23-candidate6.mjs <candidate5-root> <candidate6-root>");
  process.exit(2);
}

const baseline = path.resolve(baselineArg);
const output = path.resolve(outputArg);
const here = path.dirname(fileURLToPath(import.meta.url));
const overlay = path.join(here, "alpha23-candidate6");
const expected = new Map([
  ["app/electron/capture.cjs", "d8c8341331ba604fc6d915ab0dba4f466328cd287a391889b5393acd4d217600"],
  ["app/electron/mining-signature-confirmation.cjs", "08d165e58643b0cfc5e9ae17eda67413410420339ce4fc0c78419014793229ed"],
  ["app/electron/persistent-star-citizen-window.cjs", "6e78f3488910e72d5ad753fcc5691a9a9ce977253a1afd4cb006c5d67df73674"],
  ["app/electron/star-citizen-window-helper.cjs", "6dbc82d605d3f7615ca07c787e4bcde7e96f780dfb71787bf10ee0db9604d5b2"],
  ["app/electron/native-linux-gamescope-pipewire.cjs", "78d53614e05e7909ece4c46eb94ace524251918f5e5f9d1e3e78c5b5e4d81cd4"],
]);

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
for (const [relative, wanted] of expected) {
  const got = sha256(path.join(baseline, relative));
  if (got !== wanted) throw new Error(`Candidate 5 baseline mismatch for ${relative}: ${got}`);
}
const packageJson = JSON.parse(fs.readFileSync(path.join(baseline, "app/package.json"), "utf8"));
if (packageJson.version !== "0.1.47-r31.alpha23.candidate5") {
  throw new Error(`unexpected Candidate 5 version: ${packageJson.version}`);
}

fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(baseline, output, { recursive: true, preserveTimestamps: true });
fs.cpSync(overlay, output, { recursive: true, force: true, preserveTimestamps: true });

const staged = JSON.parse(fs.readFileSync(path.join(output, "app/package.json"), "utf8"));
if (staged.version !== "0.1.47-r31.alpha23.candidate6") throw new Error("Candidate 6 version was not staged");
for (const [relative, wanted] of Object.entries(JSON.parse(fs.readFileSync(path.join(output, "ALPHA23-PROVENANCE.json"), "utf8")).protectedFiles)) {
  const got = sha256(path.join(output, relative));
  if (got !== wanted) throw new Error(`Candidate 6 protected hash mismatch for ${relative}: ${got}`);
}
console.log(`Staged Alpha23 Candidate 6 at ${output}`);
