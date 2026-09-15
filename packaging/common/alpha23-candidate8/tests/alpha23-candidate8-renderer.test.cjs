"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const baseline = process.argv[2];
assert(baseline, "supply Candidate 7 root for the negative control");
function launch(helper) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "archverse-renderer-test-"));
  const env = { ...process.env, ARCHVERSE_CAPTURE_SELFTEST: "1", SC_TRACKER_CONFIG_DIR: dir };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.WAYLAND_DISPLAY;
  delete env.SC_TRACKER_HOST_WAYLAND_DISPLAY;
  return spawnSync(path.join(root, "runtime/electron/electron"),
    ["--no-sandbox", helper, dir, "1234"],
    { env, timeout: 20000, killSignal: "SIGKILL", encoding: "utf8", maxBuffer: 1024 * 1024 });
}
const negative = launch(path.join(path.resolve(baseline), "app/electron/star-citizen-window-helper.cjs"));
assert.match(negative.stdout || "", /getDisplayMedia/, JSON.stringify(negative));
assert.notEqual(negative.status, 0, "the actual Candidate 7 data-origin failure must reproduce");
const positive = launch(path.join(root, "app/electron/star-citizen-window-helper.cjs"));
assert.equal(positive.status, 0, JSON.stringify(positive));
assert.match(positive.stderr, /secure=true origin=file: displayMedia=true/);
assert.match(positive.stdout, /"type":"selftest","passed":true/);
console.log("Actual packaged Electron: Candidate 7 negative control reproduced; Candidate 8 secure renderer reached display-media handler");
