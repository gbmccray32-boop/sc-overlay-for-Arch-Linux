"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const focusPath = path.join(root, "app/electron/linux/focus-controller.cjs");
const source = fs.readFileSync(focusPath, "utf8");
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "./star-citizen-session.cjs") {
    return { getStarCitizenSessionBinder: () => ({ current: () => null }) };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const { LinuxFocusController } = require(focusPath);
Module._load = originalLoad;

const calls = [];
const controller = new LinuxFocusController({
  platform: "linux",
  logger: { log() {}, warn() {} },
  sessionBinder: { current: () => null },
  commandRunner: (command, args) => {
    calls.push([command, ...args]);
    if (command === "xprop" && args.join(" ") === "-id 2097152 WM_CLASS") {
      return 'WM_CLASS(STRING) = "starcitizen.exe", "starcitizen.exe"\n';
    }
    throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
  },
});

assert.equal(
  controller.windowClassName("2097152"),
  'WM_CLASS(STRING) = "starcitizen.exe", "starcitizen.exe"',
);
assert.deepEqual(calls, [["xprop", "-id", "2097152", "WM_CLASS"]]);
assert.equal(controller.windowClassName("not-a-window"), "", "invalid XIDs must not spawn a child");
assert.equal(calls.length, 1);

const missing = new LinuxFocusController({
  platform: "linux",
  sessionBinder: { current: () => null },
  commandRunner: () => { throw new Error("window disappeared"); },
});
assert.equal(missing.windowClassName("2097152"), "", "a stale XID must be an ordinary miss");
assert.doesNotMatch(source, /getwindowclassname/, "libxdo WM_CLASS lookup must remain removed");

console.log("Candidate 17 reads WM_CLASS through xprop and tolerates stale XIDs");
