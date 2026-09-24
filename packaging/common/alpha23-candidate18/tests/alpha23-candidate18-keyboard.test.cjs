"use strict";
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const input = require(path.join(root, "app/electron/linux/evdev-hold-key.cjs"));

assert.equal(input.isPointerAuxiliaryPath("usb-Logitech_G300s_Optical_Gaming_Mouse-if01-event-kbd"), true);
assert.equal(input.isPointerAuxiliaryPath("usb-SINO_WEALTH_USB_KEYBOARD-event-kbd"), false);

const listed = input.listKeyboardEventDevices({
  directories: ["/by-id", "/by-path"],
  fsImpl: {
    readdirSync(directory) {
      return directory === "/by-id"
        ? ["usb-Logitech_G300s_Optical_Gaming_Mouse-if01-event-kbd"]
        : ["pci-test-usb-0:1:1.1-event-kbd"];
    },
    realpathSync() { return "/dev/input/event4"; },
  },
});
assert.equal(listed.length, 1);
assert.equal(listed[0].pointerAuxiliary, true, "generic by-path alias must not disguise a mouse endpoint");

class FakeStream extends EventEmitter {
  destroy() { this.emit("close"); }
}

const streams = new Map();
const warnings = [];
const fsImpl = {
  createReadStream(realPath) {
    const stream = new FakeStream();
    streams.set(realPath, stream);
    return stream;
  },
};
const devices = [
  {
    displayPath: "/dev/input/by-id/usb-Logitech_G300s_Optical_Gaming_Mouse-if01-event-kbd",
    displayPaths: ["/dev/input/by-id/usb-Logitech_G300s_Optical_Gaming_Mouse-if01-event-kbd"],
    realPath: "/dev/input/event4",
    pointerAuxiliary: true,
  },
  {
    displayPath: "/dev/input/by-id/usb-SINO_WEALTH_USB_KEYBOARD-event-kbd",
    displayPaths: ["/dev/input/by-id/usb-SINO_WEALTH_USB_KEYBOARD-event-kbd"],
    realPath: "/dev/input/event5",
    pointerAuxiliary: false,
  },
];
const statuses = [];
const controller = input.openKeyboardStreams({
  fsImpl,
  listDevices: () => devices,
  scanIntervalMs: 0,
  onStatus: (status) => statuses.push(status),
  log: { log() {}, warn: (message) => warnings.push(message) },
});

assert.equal(streams.has("/dev/input/event4"), false, "mouse auxiliary endpoint must not open");
assert.equal(controller.supported, false, "evdev cannot claim readiness before keyboard open");
const permissionError = Object.assign(new Error("permission denied"), { code: "EACCES" });
streams.get("/dev/input/event5").emit("error", permissionError);
assert.equal(controller.authoritative, false, "denied keyboard must leave uIOhook authoritative");
assert.match(warnings.join("\n"), /active-session keyboard uaccess rule/);

const recovered = new FakeStream();
streams.set("/dev/input/event5", recovered);
const recoveryController = input.openKeyboardStreams({
  fsImpl: { createReadStream: () => recovered },
  listDevices: () => [devices[1]],
  scanIntervalMs: 0,
  onStatus: (status) => statuses.push(status),
  log: { log() {}, warn() {} },
});
recovered.emit("open");
assert.equal(recoveryController.authoritative, true, "opened physical keyboard must become authoritative");
assert.equal(statuses.at(-1).displayPath, devices[1].displayPath);

const main = fs.readFileSync(path.join(root, "app/electron/main.cjs"), "utf8");
assert.match(main, /evdevInteractController\?\.authoritative/);
assert.doesNotMatch(main, /source === "uiohook" && evdevInteractController\?\.supported/);
assert.match(main, /keyboard authority=evdev active/);

controller.stop();
recoveryController.stop();
console.log("PASS: Candidate 18 keeps uIOhook active until a real keyboard stream opens");
