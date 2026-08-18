/**
 * Build the current upstream sidecar for ArchVerse Linux.
 *
 * Upstream owns mission/hauling/mining business logic and the high-churn pages. ArchVerse applies
 * Linux-only contracts to an in-memory server source and to staged HTML, so source stays rebaseable.
 */
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { basename, resolve } from "node:path";
import { applyArchVerseOverlayPatches } from "./archverse-overlay-patches.mjs";
import { applyArchVerseServerSourcePatches } from "./archverse-server-patches.mjs";

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
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: `${out}/server.mjs`,
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});

const OLD_DATASET = /^blueprint(?:s|-detail)\.\d+\.json$/;
for (const dir of ["overlay", "data"]) {
  cpSync(dir, `${out}/${dir}`, {
    recursive: true,
    filter: (src) => basename(src) !== "config.json" && !OLD_DATASET.test(basename(src)),
  });
  console.log(`copied ${dir}/ -> ${out}/${dir}/`);
}

applyArchVerseOverlayPatches(out);

// Check emitted semantics rather than source comments: esbuild is free to discard comments.
const server = readFileSync(`${out}/server.mjs`, "utf8");
for (const marker of [
  "SC_TRACKER_CONFIG_DIR",
  "Shift+F6",
  "ArchVerse Linux RapidOCR (Electron capture)",
  "logbackups",
  "startPosition",
]) {
  if (!server.includes(marker)) throw new Error(`built server lost required Linux/upstream contract: ${marker}`);
}
console.log("server bundle ->", out);
