import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const [baseArg, previewArg] = process.argv.slice(2);
if (!baseArg || !previewArg) throw new Error("usage: widget-window-preview-package.test.mjs <candidate19-root> <preview-root>");
const base = path.resolve(baseArg);
const preview = path.resolve(previewArg);
const read = (root, file) => fs.readFileSync(path.join(root, file), "utf8");
const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const fingerprint = (file) => fs.lstatSync(file).isSymbolicLink()
  ? `link:${fs.readlinkSync(file)}`
  : `file:${hash(file)}`;
const walk = (root, relative = "") => {
  const result = [];
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const item = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...walk(root, item));
    else result.push(item);
  }
  return result;
};

assert.equal(JSON.parse(read(base, "app/package.json")).version, "0.1.47-r31.alpha23.candidate19");
assert.equal(JSON.parse(read(preview, "app/package.json")).version, "0.1.47-r31.alpha23.candidate19.windowpreview4");
const main = read(preview, "app/electron/main.cjs");
assert.match(main, /ARCHVERSE_WIDGET_WINDOW_PREVIEW_RUNTIME/);
assert.match(main, /screen\.getCursorScreenPoint\(\)/);
assert.match(main, /widgetWindowPreview\?\.updateHeldPointer\(nativePreviewPoint, true\)/);
assert.match(main, /widget-window:drag/);
assert.match(main, /startWidgetWindowPreviewDrag/);
assert.match(main, /preview-only arrange mode/);
assert.match(main, /ignored duplicate Shift\+F6 arrange transition/);
assert.match(main, /widgetWindowPreview\?\.setArrangeMode\(moveMode\)/);
assert.match(main, /widgetWindowPreview\?\.closeAll\(\)/);
assert.match(main, /widgetWindowPreview\?\.heldInteractionId\(\)/);
assert.match(main, /native SC Feed loaded; canvas copy disabled/);
assert.match(main, /overlay:scfeed-visible", \{ on: false, nativeWindow: true \}/);
assert.match(main, /id: "scFeed", page: "scfeed\.html", title: "SC Feed", notifier: true/);
assert.doesNotMatch(read(preview, "bin/sc-blueprint-tracker"), /SC_TRACKER_WIDGET_WINDOWS=preview/);
assert.match(read(preview, "bin/sc-blueprint-tracker-window-preview"), /SC_TRACKER_WIDGET_WINDOWS=preview/);
assert.match(read(preview, "bin/sc-blueprint-tracker-window-preview"), /electron\.log/);
assert.match(read(preview, "app/electron/widget-window-manager.cjs"), /focusless-all-modes/);
assert.match(read(preview, "app/electron/widget-window-manager.cjs"), /latched until interaction-key release/);
assert.match(read(preview, "app/electron/widget-window-manager.cjs"), /contentActive/);
assert.match(read(preview, "app/electron/widget-window-scfeed-preload.cjs"), /archverseNativeWidget/);
const scFeed = read(preview, "app/server/overlay/scfeed.html");
assert.match(scFeed, /NATIVE_WINDOW = PARAMS\.has\("widgetWindow"\)/);
assert.match(scFeed, /window\.archverseNativeWidget/);
assert.match(scFeed, /archverse-native-widget-window/);
assert.match(scFeed, /api\.drag\("start"/);

const allowed = new Set([
  "ALPHA23-PROVENANCE.json", "FIELD-TEST.md", "README.md", "app/package-lock.json", "app/package.json",
  "app/electron/main.cjs", "app/electron/widget-window-manager.cjs", "app/electron/widget-window-scfeed-preload.cjs",
  "app/server/overlay/scfeed.html", "bin/sc-blueprint-tracker-window-preview", "SHA256SUMS",
]);
const baseFiles = new Set(walk(base));
const previewFiles = new Set(walk(preview));
const all = new Set([...baseFiles, ...previewFiles]);
const changed = [];
for (const file of all) {
  const same = baseFiles.has(file) && previewFiles.has(file)
    && fingerprint(path.join(base, file)) === fingerprint(path.join(preview, file));
  if (!same) changed.push(file);
}
const unexpected = changed.filter((file) => !allowed.has(file));
assert.deepEqual(unexpected, [], `unexpected package changes: ${unexpected.join(", ")}`);
for (const required of allowed) {
  if (required === "SHA256SUMS") continue;
  assert.ok(changed.includes(required), `expected preview change is missing: ${required}`);
}

const provenance = JSON.parse(read(preview, "ALPHA23-PROVENANCE.json"));
assert.equal(provenance.widgetWindowPreview.productionWidgetsMigrated, 1);
assert.deepEqual(provenance.widgetWindowPreview.migratedWidgets, ["scFeed"]);
assert.equal(
  provenance.protectedFiles["app/electron/main.cjs"],
  hash(path.join(preview, "app/electron/main.cjs")),
  "main-process protected hash must describe the preview package",
);
console.log(`widget-window preview package test: passed (${changed.length} approved changes)`);
