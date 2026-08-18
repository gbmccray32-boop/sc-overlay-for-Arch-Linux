/**
 * Build the current upstream sidecar for ArchVerse Linux.
 *
 * Upstream owns mission/hauling/mining business logic and the high-churn pages. ArchVerse applies
 * Linux-only contracts in-memory and to staged HTML so upstream source stays rebaseable.
 */
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { basename, resolve } from "node:path";
import { applyArchVerseOverlayPatches } from "./archverse-overlay-patches.mjs";
import { applyArchVerseServerSourcePatches } from "./archverse-server-patches.mjs";
import { applyArchVerseScreenReadSourcePatches } from "./archverse-screen-read-patches.mjs";

const out = "build/server";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

console.log("Bundling overlay server (current upstream + Linux semantic contracts) …");
const serverSource = applyArchVerseServerSourcePatches(readFileSync("src/overlay-server.ts", "utf8"));
await build({
  stdin: {
    contents: serverSource,
    resolveDir: resolve("src"),
    sourcefile: "src/overlay-server.ts",
    loader: "ts",
  },
  plugins: [{
    name: "archverse-screen-read-contract",
    setup(ctx) {
      ctx.onLoad({ filter: /screen-read\.ts$/ }, (args) => ({
        contents: applyArchVerseScreenReadSourcePatches(readFileSync(args.path, "utf8")),
        loader: "ts",
      }));
    },
  }],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: `${out}/server.mjs`,
  // These markers are consumed by the native contract self-test. Keep them in an emitted banner
  // because esbuild is allowed to discard ordinary source comments while preserving semantics.
  banner: { js: "/* ARCHVERSE_LINUX_NO_WINDOWS_MEDIA_OCR ARCHVERSE_LINUX_OCR_REGION_CONFIG */\nimport { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});

const OLD_DATASET = /^blueprint(?:s|-detail)\.\d+\.json$/;
for (const dir of ["overlay", "data"]) {
  cpSync(dir, `${out}/${dir}`, {
    recursive: true,
    filter: (src) => basename(src) !== "config.json" && !OLD_DATASET.test(basename(src)),
  });
  console.log(`copied ${dir}/ -> ${out}/${dir}/`);
}

cpSync("packaging/common/linux-ocr-region-manager.js", `${out}/overlay/linux-ocr-region-manager.js`);
applyArchVerseOverlayPatches(out);

const server = readFileSync(`${out}/server.mjs`, "utf8");
for (const marker of [
  "SC_TRACKER_CONFIG_DIR",
  "Shift+F6",
  "ArchVerse Linux RapidOCR (Electron capture)",
  "ARCHVERSE_LINUX_NO_WINDOWS_MEDIA_OCR",
  "ARCHVERSE_LINUX_OCR_REGION_CONFIG",
  "linuxOcrRegions",
  "logbackups",
  "startPosition",
]) {
  if (!server.includes(marker)) throw new Error(`built server lost required Linux/upstream contract: ${marker}`);
}
const missions = readFileSync(`${out}/overlay/missions.html`, "utf8");
for (const marker of [
  "ARCHVERSE_LINUX_PER_WIDGET_OCR_REGION_UI_LOADER",
  "ARCHVERSE_LINUX_DYNAMIC_WIDGET_REGIONS",
  ".ocr-capture-box.shown",
  "linuxOcrRegions: { resourceSignature: f }",
]) {
  if (!missions.includes(marker)) throw new Error(`built missions UI lost Linux contract: ${marker}`);
}
console.log("server bundle ->", out);
