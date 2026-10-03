import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { portWidgetWindowPreviewMain } from "./port-widget-window-preview-main.mjs";
import { portNativeLogWindow } from "./port-widget-window-log.mjs";

const [baseArg, outArg] = process.argv.slice(2);
if (!baseArg || !outArg) throw new Error("usage: stage-widget-window-preview.mjs <candidate19-root> <output>");
const base = path.resolve(baseArg);
const out = path.resolve(outArg);
const root = path.resolve(import.meta.dirname, "../..");
if (fs.existsSync(out) || base.startsWith(out + path.sep)) throw new Error("output must be a new directory outside the baseline");
const read = (file) => fs.readFileSync(path.join(base, file), "utf8");
const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
if (JSON.parse(read("app/package.json")).version !== "0.1.47-r31.alpha23.candidate19") throw new Error("Candidate 19 required");
for (const line of read("SHA256SUMS").split("\n").filter(Boolean)) {
  const match = /^([0-9a-f]{64})  \.\/(.+)$/.exec(line);
  if (!match || hash(path.join(base, match[2])) !== match[1]) throw new Error(`Candidate 19 manifest mismatch: ${line}`);
}

fs.cpSync(base, out, { recursive: true, preserveTimestamps: true });
fs.writeFileSync(path.join(out, "app/electron/main.cjs"), portWidgetWindowPreviewMain(read("app/electron/main.cjs")));
fs.writeFileSync(
  path.join(out, "app/server/overlay/logview.html"),
  portNativeLogWindow(read("app/server/overlay/logview.html")),
);
for (const file of ["widget-window-manager.cjs", "widget-window-log-preload.cjs"]) {
  fs.copyFileSync(path.join(root, "electron", file), path.join(out, "app/electron", file));
}
fs.copyFileSync(path.join(root, "packaging/common/sc-blueprint-tracker-window-preview"), path.join(out, "bin/sc-blueprint-tracker-window-preview"));
fs.chmodSync(path.join(out, "bin/sc-blueprint-tracker-window-preview"), 0o755);

const version = "0.1.47-r31.alpha23.candidate19.windowpreview6";
for (const file of ["app/package.json", "app/package-lock.json"]) {
  const data = JSON.parse(read(file));
  data.version = version;
  if (data.packages?.[""]) data.packages[""].version = version;
  fs.writeFileSync(path.join(out, file), `${JSON.stringify(data, null, 2)}\n`);
}
const provenance = JSON.parse(read("ALPHA23-PROVENANCE.json"));
provenance.version = version;
provenance.fieldVerified = false;
if (provenance.protectedFiles?.["app/electron/main.cjs"]) {
  provenance.protectedFiles["app/electron/main.cjs"] = hash(path.join(out, "app/electron/main.cjs"));
}
provenance.widgetWindowPreview = {
  productionWidgetsMigrated: 1,
  migratedWidgets: ["logView"],
  activation: "bin/sc-blueprint-tracker-window-preview",
  base: "Candidate 19",
};
provenance.widgetWindowPreviewChangedFiles = [
  "app/electron/main.cjs",
  "app/electron/widget-window-manager.cjs",
  "app/electron/widget-window-log-preload.cjs",
  "app/server/overlay/logview.html",
  "bin/sc-blueprint-tracker-window-preview",
  "app/package.json",
  "app/package-lock.json",
  "ALPHA23-PROVENANCE.json",
  "FIELD-TEST.md",
  "README.md",
];
fs.writeFileSync(path.join(out, "ALPHA23-PROVENANCE.json"), `${JSON.stringify(provenance, null, 2)}\n`);
fs.writeFileSync(path.join(out, "FIELD-TEST.md"), `# Candidate 19 native-window preview 6\n\nThis focused repair adds an explicit resize grip to the focusless native Log window. Run \`./bin/sc-blueprint-tracker-window-preview\`. SC Feed and every other production widget remain on the proven Candidate 19 Canvas.\n\n1. Enable Log and press Shift+F6. Confirm a diagonal resize grip appears in the lower-right corner.\n2. Drag the grip larger, then smaller. The minimum size is 260x160. The window must resize without taking Star Citizen focus or releasing its pointer confinement.\n3. Drag Log by an unused part of its header. Moving and resizing must remain separate operations.\n4. Press Shift+F6 again. Confirm the grip disappears and Log returns to hard click-through.\n5. Restart the preview launcher. Confirm the resized width, height, and position persist.\n6. Hold F over Log once and use one read-only control. Confirm Star Citizen retains focus. Do not test filter typing; native keyboard focus remains a separate gate.\n7. Close the preview and run \`./bin/sc-blueprint-tracker\`. Confirm the ordinary Candidate 19 Canvas mode remains unchanged.\n\nThe preview launcher writes \`~/.config/sc-blueprint-tracker/electron.log\`. Preserve that complete log. Capture, OCR, Mining, Hauling, Refinery, Gamescope, SC Feed, and per-widget hotkeys are unchanged.\n`);
fs.copyFileSync(path.join(out, "FIELD-TEST.md"), path.join(out, "README.md"));
fs.unlinkSync(path.join(out, "SHA256SUMS"));
console.log(`Staged ${version}`);
