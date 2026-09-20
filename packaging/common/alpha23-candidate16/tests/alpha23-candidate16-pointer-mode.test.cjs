"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const focusPath = path.join(root, "app/electron/linux/focus-controller.cjs");
const main = fs.readFileSync(path.join(root, "app/electron/main.cjs"), "utf8");
const { LinuxFocusController } = require(focusPath);

let session = {
  id: "normal-702609",
  gamePid: 702609,
  launcherPid: null,
  reaperPid: null,
  gamescopePid: null,
};
const files = [];
const commands = [];
const controller = new LinuxFocusController({
  platform: "linux",
  logger: { log() {}, warn() {} },
  sessionBinder: { current: () => session },
  fileReader: (file) => {
    files.push(file);
    return Buffer.from("DISPLAY=:0\0XDG_RUNTIME_DIR=/run/user/1000\0");
  },
  commandRunner: (_command, args) => {
    commands.push(args);
    if (args[0] === "getdisplaygeometry") return "WIDTH=3840\nHEIGHT=2160\n";
    if (args[0] === "getmouselocation") return "X=3456\nY=1700\nSCREEN=0\nWINDOW=1\n";
    throw new Error(`unexpected command: ${args.join(" ")}`);
  },
});

assert.equal(
  controller.gamescopePointerLocation(),
  null,
  "a normal XWayland DISPLAY must not become a nested Gamescope coordinate source",
);
assert.deepEqual(files, [], "normal mode must not inspect a process DISPLAY for nested mapping");
assert.deepEqual(commands, [], "normal mode must not query or scale nested display coordinates");

session = {
  id: "gamescope-680769",
  gamePid: 680769,
  launcherPid: 680764,
  reaperPid: null,
  gamescopePid: 680156,
};
assert.deepEqual(controller.gamescopePointerLocation(), {
  x: 3456,
  y: 1700,
  width: 3840,
  height: 2160,
  display: ":0",
  gamePid: 680769,
});
assert.equal(files.length, 1, "Gamescope mode must resolve its nested display once");
assert.equal(commands.filter((args) => args[0] === "getdisplaygeometry").length, 1);

session = {
  id: "normal-703000",
  gamePid: 703000,
  launcherPid: null,
  reaperPid: null,
  gamescopePid: null,
};
assert.equal(controller.gamescopePointerLocation(), null, "switching to normal mode must discard the Gamescope cache");
assert.equal(controller.gamescopePointerContext, null, "no nested coordinate context may survive the mode change");
assert.equal(commands.length, 2, "normal mode must not issue another nested display command");

assert.match(
  fs.readFileSync(focusPath, "utf8"),
  /Number\.isInteger\(Number\(session\.gamescopePid\)\)[\s\S]{0,350}gamescopePointerContext = null/,
);
assert.match(
  main,
  /point = overlayWindows\.gamescopePointerLocation\?\.\(\) \|\| null;[\s\S]*source = "gamescope-display";[\s\S]*source = "xdotool-root";/,
  "main must retain the host-pointer fallback after strict Gamescope rejection",
);

console.log("Candidate 16 isolates normal host pointer coordinates from Gamescope nested mapping");
