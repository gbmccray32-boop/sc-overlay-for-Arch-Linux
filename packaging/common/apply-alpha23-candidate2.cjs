#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = process.argv[2];
if (!root) throw new Error("usage: apply-alpha23-candidate2.cjs <staged-candidate1-root>");
const must = (value, message) => { if (!value) throw new Error(`Alpha23 Candidate 2 apply: ${message}`); };
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const write = (relative, value) => fs.writeFileSync(path.join(root, relative), value);

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  must(first >= 0, `${label} anchor missing`);
  must(text.indexOf(before, first + before.length) < 0, `${label} anchor is not unique`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

let capture = read("app/electron/capture.cjs");
must(sha256(capture) === "7be86162eb69a565b63780daf0af387b266f75d16a5dc65fd671de0bb034652a",
  "capture.cjs is not the pinned Alpha23 Candidate 1 source");

capture = replaceOnce(capture, "const FAST_MS = 900;", `// ARCHVERSE_ALPHA23_MINING_SUBSECOND_CADENCE
// A recognized/locked RS is sampled every 600ms; in-vehicle acquisition is sampled every 800ms.
// The latest-frame scheduler remains single-flight, so a slow backend cannot overlap itself.
const FAST_MS = 600;`, "locked Mining cadence");
capture = replaceOnce(capture, "const MINING_VEHICLE_IDLE_MS = 1200;", "const MINING_VEHICLE_IDLE_MS = 800;", "acquisition Mining cadence");

capture = replaceOnce(capture,
  `let preferredCaptureBackend = "";`,
  `let preferredCaptureBackend = "";
// ARCHVERSE_ALPHA23_FALLBACK_UPGRADE_PROBE: Spectacle is safe but expensive. A compositor may
// expose the Star Citizen window or monitor only after launch settles, so a cached Spectacle
// fallback periodically gives faster non-PipeWire sources another chance.
let fallbackUpgradeNextAttemptAt = 0;
const FALLBACK_UPGRADE_PROBE_MS = 5000;`,
  "fallback upgrade state");

capture = replaceOnce(capture,
  `  const source = candidates[0];
  const full = source.thumbnail;
  const size = full.getSize();`,
  `  const source = candidates[0];
  const full = source.thumbnail;
  const size = full.getSize();
  // ARCHVERSE_ALPHA23_DIRECT_SC_WINDOW_CAPTURE: a normal non-Gamescope Star Citizen source is
  // already the complete game canvas. Applying the panoramic Gamescope monitor crop to it either
  // rejects the source or cuts away the top-right r_DisplayInfo block.
  const sourceName = String(source.name || "").trim();
  if (/^Star\\s*Citizen$/i.test(sourceName) && !/gamescope/i.test(sourceName)) {
    const image = normalizeFallbackImage(full, disp, "electron-star-citizen-window");
    const outSize = image.getSize();
    return {
      image,
      width: outSize.width,
      height: outSize.height,
      method: "electron-star-citizen-window",
      sourceName,
      sourceSize: size,
    };
  }`,
  "direct Star Citizen window capture");

capture = replaceOnce(capture,
  `      ? ["pipewire", "gamescope", "spectacle", "electron"]
      : ["pipewire", "electron", "gamescope", "spectacle"])
    : ["electron"];
  const order = preferredCaptureBackend
    ? [preferredCaptureBackend, ...normalOrder.filter((name) => name !== preferredCaptureBackend && name !== "pipewire")]
    : normalOrder;`,
  `      ? ["pipewire", "gamescope", "electron", "spectacle"]
      : ["pipewire", "electron", "gamescope", "spectacle"])
    : ["electron"];
  const probeFasterFallback = process.platform === "linux" && HOST_IS_WAYLAND
    && preferredCaptureBackend === "spectacle" && Date.now() >= fallbackUpgradeNextAttemptAt;
  if (probeFasterFallback) fallbackUpgradeNextAttemptAt = Date.now() + FALLBACK_UPGRADE_PROBE_MS;
  const order = probeFasterFallback
    ? ["gamescope", "electron", "spectacle"]
    : (preferredCaptureBackend
      ? [preferredCaptureBackend, ...normalOrder.filter((name) => name !== preferredCaptureBackend && name !== "pipewire")]
      : normalOrder);`,
  "Wayland backend order and Spectacle upgrade probe");

write("app/electron/capture.cjs", capture);

const packagePath = "app/package.json";
const pkg = JSON.parse(read(packagePath));
must(pkg.version === "0.1.46-r31.alpha23.candidate1", `unexpected package version ${pkg.version}`);
pkg.version = "0.1.46-r31.alpha23.candidate2";
pkg.description = "ArchVerse Alpha23 Candidate 2: default-session capture repair and subsecond Mining cadence with field-safe sidecar supervision";
write(packagePath, JSON.stringify(pkg, null, 2) + "\n");

write("FIELD-TEST.md", `# ArchVerse Alpha23 Candidate 2

Version: 0.1.46-r31.alpha23.candidate2. Internal field candidate, not a release.

Candidate 2 retains Candidate 1's frozen upstream 0.1.46 integration and Candidate 8k Linux
contracts. It changes only the screen-capture selection and Mining cadence: a normal Wayland
session now prefers an exact Star Citizen window or Electron monitor before the slow Spectacle
fallback, periodically upgrades a cached Spectacle fallback, and targets 600ms locked / 800ms
in-vehicle acquisition opportunities. Direct Gamescope PipeWire remains first authority.

Close ArchVerse, extract this folder beside Candidate 1, then run ./bin/sc-blueprint-tracker.
Use your existing Star Citizen launcher. No launcher-script changes are needed.

Test one normal non-Gamescope launch first. Confirm electron.log reports
electron-star-citizen-window or electron-display-id/electron-screen-fallback when available, then
verify Location Sync reads r_DisplayInfo 1 and Mining recognizes RS values without F, Alt-Tab, or
opening the scan-area control. Next test Gamescope and confirm gamescope-pipewire remains selected.
Also test held F, Shift+F6, on-foot Mining refusal, and a long Mining session. Save complete
electron.log and sidecar.log. Recognition can meet the 100-900ms target only on a backend whose
capture itself completes inside that window; Spectacle remains a safe but slower last resort.
`);

const provenancePath = "ALPHA23-PROVENANCE.json";
const provenance = JSON.parse(read(provenancePath));
must(provenance.version === "0.1.46-r31.alpha23.candidate1", "Candidate 1 provenance missing");
provenance.version = "0.1.46-r31.alpha23.candidate2";
provenance.candidate1Artifact = 10109267555;
provenance.candidate1CaptureSha256 = "7be86162eb69a565b63780daf0af387b266f75d16a5dc65fd671de0bb034652a";
provenance.protectedFiles["app/electron/capture.cjs"] = sha256(capture);
provenance.fieldVerified = false;
write(provenancePath, JSON.stringify(provenance, null, 2) + "\n");

console.log("Alpha23 Candidate 2 apply OK: default-session capture can upgrade and Mining cadence is 600/800ms");
