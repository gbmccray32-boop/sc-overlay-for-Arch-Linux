import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { portCandidate19Server } from "./port-alpha23-candidate19-server.mjs";
import { lockWidgetHotkeyIpc, lockWidgetHotkeySettings, assertNoWidgetHotkeyEditor } from "../../tools/archverse-widget-hotkey-contract.mjs";

const [baseArg, outArg, buildArg = "build/server"] = process.argv.slice(2);
if (!baseArg || !outArg) throw new Error("usage: stage-alpha23-candidate19.mjs <candidate18-root> <new-output> [built-server-root]");
const base = path.resolve(baseArg), out = path.resolve(outArg), build = path.resolve(buildArg);
if (fs.existsSync(out) || base.startsWith(out + path.sep)) throw new Error("output must be a new directory outside the baseline");
const hash = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const read = file => fs.readFileSync(path.join(base, file), "utf8");
if (JSON.parse(read("app/package.json")).version !== "0.1.47-r31.alpha23.candidate18") throw new Error("Candidate 18 required");
for (const line of read("SHA256SUMS").split("\n").filter(Boolean)) {
  const match = /^([0-9a-f]{64})  \.\/(.+)$/.exec(line);
  if (!match || hash(path.join(base, match[2])) !== match[1]) throw new Error("Baseline manifest mismatch: " + line);
}
const provenance = JSON.parse(read("ALPHA23-PROVENANCE.json"));
for (const [file, wanted] of Object.entries(provenance.protectedFiles)) if (hash(path.join(base, file)) !== wanted) throw new Error("Protected baseline mismatch: " + file);
const replacements = new Map([
  ["app/electron/main.cjs", lockWidgetHotkeyIpc(read("app/electron/main.cjs"))],
  ["app/server/overlay/config.html", lockWidgetHotkeySettings(read("app/server/overlay/config.html"))],
  ["app/server/server.mjs", portCandidate19Server(read("app/server/server.mjs"), fs.readFileSync(path.join(build, "server.mjs"), "utf8"))],
]);
for (const file of ["hauling.html", "hauling-tab-trade.js"]) replacements.set("app/server/overlay/" + file, fs.readFileSync(path.join(build, "overlay", file), "utf8"));
assertNoWidgetHotkeyEditor(read("app/server/overlay/canvas.js")); assertNoWidgetHotkeyEditor(read("app/electron/preload.cjs"));
fs.cpSync(base, out, { recursive: true, preserveTimestamps: true });
for (const [file, contents] of replacements) fs.writeFileSync(path.join(out, file), contents);
const version = "0.1.47-r31.alpha23.candidate19";
for (const file of ["app/package.json", "app/package-lock.json"]) {
  const data = JSON.parse(read(file)); data.version = version;
  if (data.packages?.[""]) data.packages[""].version = version;
  fs.writeFileSync(path.join(out, file), JSON.stringify(data, null, 2) + "\n");
}
for (const [file, wanted] of Object.entries(provenance.protectedFiles)) {
  if (replacements.has(file)) provenance.protectedFiles[file] = hash(path.join(out, file));
  else if (hash(path.join(out, file)) !== wanted) throw new Error("Protected output mismatch: " + file);
}
provenance.version = version; provenance.fieldVerified = false;
provenance.candidate18ArchPackageSha256 = "8543c675437173761a04712e2e0c50468ec0261d92216f847162f950e140bc17";
provenance.candidate19ChangedFiles = [...replacements.keys(), "app/package.json", "app/package-lock.json"];
fs.writeFileSync(path.join(out, "ALPHA23-PROVENANCE.json"), JSON.stringify(provenance, null, 2) + "\n");
fs.writeFileSync(path.join(out, "FIELD-TEST.md"), "# Candidate 19 — unverified field candidate\n\nDo not publish before the complete packaged gates pass. Test Arch KDE and Nobara KDE, each with and without Gamescope. Verify held F, focus and click-through, Mining signatures, hauling, refinery timers, trade filters and Ledger audit. Widget hotkey editing must remain disabled. Candidate 18 is the rollback release.\n");
fs.copyFileSync(path.join(out, "FIELD-TEST.md"), path.join(out, "README.md"));
fs.unlinkSync(path.join(out, "SHA256SUMS"));
console.log("Staged Candidate 19; full packaged and field validation remain required");
