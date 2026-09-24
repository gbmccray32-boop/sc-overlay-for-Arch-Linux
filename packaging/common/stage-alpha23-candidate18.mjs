#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const [baseArg, outArg] = process.argv.slice(2);
if (!baseArg || !outArg) throw new Error("usage: stage-alpha23-candidate18.mjs <candidate17-root> <candidate18-root>");
const base = path.resolve(baseArg), out = path.resolve(outArg);
if (out === base || base.startsWith(out + path.sep) || fs.existsSync(out)) {
  throw new Error("output must be a new candidate directory");
}
const common = path.dirname(fileURLToPath(import.meta.url));
const patchRoot = path.join(common, "alpha23-candidate18");
const hash = (file) => execFileSync("sha256sum", [file], { encoding: "utf8" }).slice(0, 64);

const manifest = fs.readFileSync(path.join(base, "SHA256SUMS"), "utf8");
for (const line of manifest.split("\n").filter(Boolean)) {
  const match = /^([0-9a-f]{64})  \.\/(.+)$/.exec(line);
  if (!match || hash(path.join(base, match[2])) !== match[1]) {
    throw new Error("Candidate 17 manifest mismatch: " + line.slice(0, 100));
  }
}
const provenance = JSON.parse(fs.readFileSync(path.join(base, "ALPHA23-PROVENANCE.json")));
if (JSON.parse(fs.readFileSync(path.join(base, "app/package.json"))).version !== "0.1.47-r31.alpha23.candidate17") {
  throw new Error("Candidate 17 baseline required");
}
for (const [file, wanted] of Object.entries(provenance.protectedFiles)) {
  if (hash(path.join(base, file)) !== wanted) throw new Error("baseline protected mismatch: " + file);
}

fs.cpSync(base, out, { recursive: true, preserveTimestamps: true });
fs.cpSync(patchRoot, out, { recursive: true, force: true });
fs.copyFileSync(path.join(out, "FIELD-TEST.md"), path.join(out, "README.md"));

const mainPath = path.join(out, "app/electron/main.cjs");
let main = fs.readFileSync(mainPath, "utf8");
const arbitration = 'source === "uiohook" && evdevInteractController?.supported';
if (main.split(arbitration).length - 1 !== 2) throw new Error("Candidate 17 input arbitration shape changed");
main = main.split(arbitration).join('source === "uiohook" && evdevInteractController?.authoritative');

const oldRegistration = `    evdevInteractController = startEvdevHoldKey({ accelerator: accel, onDown: () => onDown("evdev"), onUp: () => onUp("evdev") });
    if (evdevInteractController?.supported) console.log(\`[f-hover] \${accel} keyboard authority=evdev; uIOhook key transitions retained as fallback only\`);`;
const newRegistration = `    evdevInteractController = startEvdevHoldKey({
      accelerator: accel,
      onDown: () => onDown("evdev"),
      onUp: () => onUp("evdev"),
      onStatus: ({ authoritative, displayPath }) => {
        if (authoritative) {
          console.log(\`[f-hover] \${accel} keyboard authority=evdev active on \${displayPath}; uIOhook transitions retained as fallback only\`);
        } else {
          console.warn(\`[f-hover] \${accel} evdev keyboard authority unavailable; uIOhook transitions restored\`);
        }
      },
    });`;
if (!main.includes(oldRegistration)) throw new Error("Candidate 17 evdev registration shape changed");
main = main.replace(oldRegistration, newRegistration);

const oldResult = "return (r.ok || evdevInteractController?.supported) ? { ok: true } : r;";
const newResult = "return (r.ok || evdevInteractController?.configured) ? { ok: true } : r;";
if (!main.includes(oldResult)) throw new Error("Candidate 17 evdev result shape changed");
main = main.replace(oldResult, newResult);
fs.writeFileSync(mainPath, main);

const version = "0.1.47-r31.alpha23.candidate18";
for (const file of ["app/package.json", "app/package-lock.json"]) {
  const target = path.join(out, file), data = JSON.parse(fs.readFileSync(target));
  data.version = version;
  if (data.packages?.[""]) data.packages[""].version = version;
  fs.writeFileSync(target, JSON.stringify(data, null, 2) + "\n");
}

const changedProtected = new Set([
  "app/electron/main.cjs",
  "app/electron/linux/evdev-hold-key.cjs",
]);
for (const [file, wanted] of Object.entries(provenance.protectedFiles)) {
  if (changedProtected.has(file)) continue;
  if (hash(path.join(out, file)) !== wanted) throw new Error("protected candidate mismatch: " + file);
}
for (const file of changedProtected) provenance.protectedFiles[file] = hash(path.join(out, file));
provenance.version = version;
provenance.baselineArtifact = 10733032746;
provenance.candidate17ArchiveSha256 = "90b75e9ceb4c075eadd205284128d01a17cac2489fac8697dde32310995aab06";
provenance.fieldVerified = false;
fs.writeFileSync(path.join(out, "ALPHA23-PROVENANCE.json"), JSON.stringify(provenance, null, 2) + "\n");
console.log("Staged Candidate 18 with truthful physical-keyboard authority");
