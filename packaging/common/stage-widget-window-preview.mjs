import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { portWidgetWindowPreviewMain } from "./port-widget-window-preview-main.mjs";
import { portNativeLogWindow } from "./port-widget-window-log.mjs";
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
for (const file of ["widget-window-manager.cjs", "widget-window-log-preload.cjs"]) {
  fs.copyFileSync(path.join(root, "electron", file), path.join(out, "app/electron", file));
}
fs.copyFileSync(path.join(root, "packaging/common/sc-blueprint-tracker-window-preview"), path.join(out, "bin/sc-blueprint-tracker-window-preview"));
fs.chmodSync(path.join(out, "bin/sc-blueprint-tracker-window-preview"), 0o755);

const version = "0.1.47-r31.alpha23.candidate19.windowpreview8";
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
  productionWidgetsMigrated: 1,
  migratedWidgets: ["logView"],
  activation: "bin/sc-blueprint-tracker-window-preview",
  base: "Candidate 19",
};
provenance.widgetWindowPreviewChangedFiles = [
  "app/electron/main.cjs",
  "app/electron/rapidocr-worker.cjs",
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
fs.writeFileSync(path.join(out, "FIELD-TEST.md"), `# Candidate 19 native-window preview 8\n\nThis milestone retains Preview 7's field-working native Log menu and prevents a late RapidOCR worker result from raising EPIPE after taskbar Quit closes the parent IPC pipe. Run \`./bin/sc-blueprint-tracker-window-preview\`. Every other production widget remains on the proven Candidate 19 Canvas.\n\n1. Hold F over Log and click its gear. Confirm the native menu shows Text size, Panel fade, Text fade, Full on hover, Reset, Arrange, Overlay App cog, and full Settings actions.\n2. Change Text size and both fade values. Release F, then hold F again and confirm the values persist and Log returns to hard click-through between interactions.\n3. Select Show Overlay App cog. Confirm the Canvas global cog appears without focusing the Canvas or taking Star Citizen's pointer confinement. Release F, then hold F over that cog to open its existing application menu.\n4. Open full Settings from the native menu, close Settings, and confirm control returns to Star Citizen.\n5. Use Arrange widget windows, drag and resize Log, then leave arrange mode. Confirm the menu, gear, and resize grip do not remain interactive.\n6. Restart the preview launcher. Confirm position, size, and appearance persist.\n7. Use Reset and confirm Log returns to its default native bounds and appearance.\n8. Close the preview and run \`./bin/sc-blueprint-tracker\`. Confirm the ordinary Candidate 19 Canvas mode remains unchanged.\n9. While Mining or Refinery OCR is active, select Quit from the taskbar menu. Confirm ArchVerse exits without an EPIPE or corrupt/error warning.\n\nDo not test Log filter typing; native keyboard focus remains a separate gate. The preview launcher writes \`~/.config/sc-blueprint-tracker/electron.log\`. Preserve that complete log. Capture, OCR, Mining, Hauling, Refinery, Gamescope, and per-widget hotkeys are otherwise unchanged.\n`);
fs.copyFileSync(path.join(out, "FIELD-TEST.md"), path.join(out, "README.md"));
fs.unlinkSync(path.join(out, "SHA256SUMS"));
console.log(`Staged ${version}`);
