import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { portWidgetWindowPreviewMain } from "./port-widget-window-preview-main.mjs";
import { portNativeLogWindow } from "./port-widget-window-log.mjs";
import { portNativeBindingChartWindow } from "./port-widget-window-bindingchart.mjs";
import { portRapidOcrWorkerShutdown } from "./port-rapidocr-worker-shutdown.mjs";

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
  path.join(out, "app/electron/rapidocr-worker.cjs"),
  portRapidOcrWorkerShutdown(read("app/electron/rapidocr-worker.cjs")),
);
fs.writeFileSync(
  path.join(out, "app/server/overlay/logview.html"),
  portNativeLogWindow(read("app/server/overlay/logview.html")),
);
fs.writeFileSync(
  path.join(out, "app/server/overlay/bindingwidget.html"),
  portNativeBindingChartWindow(read("app/server/overlay/bindingwidget.html")),
);
for (const file of ["widget-window-manager.cjs", "widget-window-log-preload.cjs", "widget-window-bindingchart-preload.cjs"]) {
  fs.copyFileSync(path.join(root, "electron", file), path.join(out, "app/electron", file));
}
fs.copyFileSync(path.join(root, "packaging/common/sc-blueprint-tracker-window-preview"), path.join(out, "bin/sc-blueprint-tracker-window-preview"));
fs.chmodSync(path.join(out, "bin/sc-blueprint-tracker-window-preview"), 0o755);

const version = "0.1.47-r31.alpha23.candidate19.windowpreview9";
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
if (provenance.protectedFiles?.["app/electron/rapidocr-worker.cjs"]) {
  provenance.protectedFiles["app/electron/rapidocr-worker.cjs"] = hash(path.join(out, "app/electron/rapidocr-worker.cjs"));
}
provenance.widgetWindowPreview = {
  productionWidgetsMigrated: 2,
  migratedWidgets: ["logView", "bindingChart"],
  activation: "bin/sc-blueprint-tracker-window-preview",
  base: "Candidate 19",
};
provenance.widgetWindowPreviewChangedFiles = [
  "app/electron/main.cjs",
  "app/electron/rapidocr-worker.cjs",
  "app/electron/widget-window-manager.cjs",
  "app/electron/widget-window-log-preload.cjs",
  "app/electron/widget-window-bindingchart-preload.cjs",
  "app/server/overlay/logview.html",
  "app/server/overlay/bindingwidget.html",
  "bin/sc-blueprint-tracker-window-preview",
  "app/package.json",
  "app/package-lock.json",
  "ALPHA23-PROVENANCE.json",
  "FIELD-TEST.md",
  "README.md",
];
fs.writeFileSync(path.join(out, "ALPHA23-PROVENANCE.json"), `${JSON.stringify(provenance, null, 2)}\n`);
fs.writeFileSync(path.join(out, "FIELD-TEST.md"), `# Candidate 19 native-window preview 9\n\nThis milestone keeps the field-proven native Log window and migrates only Infographic Viewer as the second production native window. Run \`./bin/sc-blueprint-tracker-window-preview\`. Every other production widget remains on the proven Candidate 19 Canvas.\n\n1. Enable Infographic Viewer from the taskbar Widgets menu. Confirm one native viewer appears and its old Canvas copy remains hidden.\n2. Hold F over the viewer. Test Fit, 1:1, reload, scrolling, and its gear menu. Release F and confirm Star Citizen immediately owns input again.\n3. Use Change… to select a PNG. Confirm the chosen image loads and remains after hiding and reopening the viewer.\n4. Change Text size and fade values. Confirm the viewer and Log keep separate appearance values.\n5. Select Arrange widget windows. Drag and resize both Log and Infographic Viewer, then leave arrange mode. Confirm both return to hard click-through.\n6. Restart the preview launcher. Confirm both windows retain their independent positions, sizes, and appearance.\n7. Hide Infographic Viewer. Hold F over its former position and confirm the hidden window cannot intercept input.\n8. Close the preview and run \`./bin/sc-blueprint-tracker\`. Confirm the ordinary Candidate 19 Canvas mode remains unchanged.\n\nDo not test Log filter typing; native keyboard focus remains a separate gate. The preview launcher writes \`~/.config/sc-blueprint-tracker/electron.log\`. Preserve that complete log. Capture, OCR, Mining, Hauling, Refinery, Gamescope, and per-widget hotkeys are unchanged.\n`);
fs.copyFileSync(path.join(out, "FIELD-TEST.md"), path.join(out, "README.md"));
fs.unlinkSync(path.join(out, "SHA256SUMS"));
console.log(`Staged ${version}`);
