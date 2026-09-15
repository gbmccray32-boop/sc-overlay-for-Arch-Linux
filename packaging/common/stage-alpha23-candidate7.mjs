#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const [baselineArg, outputArg] = process.argv.slice(2);
if (!baselineArg || !outputArg) {
  console.error("usage: stage-alpha23-candidate7.mjs <candidate6-root> <candidate7-root>");
  process.exit(2);
}

const baseline = path.resolve(baselineArg);
const output = path.resolve(outputArg);
const here = path.dirname(fileURLToPath(import.meta.url));
const overlay = path.join(here, "alpha23-candidate7");
const expected = new Map([
  ["app/package.json", "5039ad007cc06e8431adb45609d82a9f1bfd7c35a1554c76c12ad4f5cf168f70"],
  ["app/package-lock.json", "e1497fa211419a7c463d0779154a1b6259c86a4d0806d1b3bc759de3e7486ac4"],
  ["app/electron/capture.cjs", "4491cb3a739d112e97fc31fbada61c344bac70ae7c8644056ba584c3edb6df6d"],
  ["app/electron/persistent-star-citizen-window.cjs", "3240314214a87d1e40e57250b53914cc18843c68b93ce90a7238e0bdb949b83b"],
  ["app/electron/star-citizen-window-helper.cjs", "7f12a137d25d0f2aa5a0a64b7e562cbba779e521a6bd95c0d6c6bd57f8632a99"],
  ["app/electron/star-citizen-window-preload.cjs", "42223016f5ab2aa2e4cab6d6af69c0392a3ff7199cb84a5f1927da839feda308"],
  ["app/electron/native-linux-gamescope-pipewire.cjs", "78d53614e05e7909ece4c46eb94ace524251918f5e5f9d1e3e78c5b5e4d81cd4"],
]);

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
for (const [relative, wanted] of expected) {
  const got = sha256(path.join(baseline, relative));
  if (got !== wanted) throw new Error(`Candidate 6 baseline mismatch for ${relative}: ${got}`);
}
const packageJson = JSON.parse(fs.readFileSync(path.join(baseline, "app/package.json"), "utf8"));
if (packageJson.version !== "0.1.47-r31.alpha23.candidate6") {
  throw new Error(`unexpected Candidate 6 version: ${packageJson.version}`);
}

fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(baseline, output, { recursive: true, preserveTimestamps: true });
fs.cpSync(overlay, output, { recursive: true, force: true, preserveTimestamps: true });

const staged = JSON.parse(fs.readFileSync(path.join(output, "app/package.json"), "utf8"));
if (staged.version !== "0.1.47-r31.alpha23.candidate7") throw new Error("Candidate 7 version was not staged");
const provenance = JSON.parse(fs.readFileSync(path.join(output, "ALPHA23-PROVENANCE.json"), "utf8"));
for (const [relative, wanted] of Object.entries(provenance.protectedFiles)) {
  const got = sha256(path.join(output, relative));
  if (got !== wanted) throw new Error(`Candidate 7 protected hash mismatch for ${relative}: ${got}`);
}
console.log(`Staged Alpha23 Candidate 7 at ${output}`);
