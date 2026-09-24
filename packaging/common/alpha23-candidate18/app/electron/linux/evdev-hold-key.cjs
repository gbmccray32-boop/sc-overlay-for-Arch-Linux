"use strict";
const fs = require("node:fs");
const path = require("node:path");

const EV_KEY = 0x01;
const KEY_CODES = Object.freeze({
  ESCAPE: 1,
  F: 33,
  RIGHTALT: 100,
  ALTRIGHT: 100,
});

function normalizeAccelerator(accel) {
  return String(accel || "").replace(/[+\s_-]/g, "").toUpperCase();
}

function keyCodeForAccelerator(accel) {
  return KEY_CODES[normalizeAccelerator(accel)] ?? null;
}

function isPointerAuxiliaryPath(devicePath) {
  const identity = path.basename(String(devicePath || ""))
    .replace(/-event-kbd$/i, "")
    .toLowerCase();
  const namesPointer = /(mouse|trackball|touchpad|pointing)/.test(identity);
  const namesKeyboard = /(keyboard|keypad)/.test(identity);
  return namesPointer && !namesKeyboard;
}

function isExplicitKeyboardPath(devicePath) {
  const identity = path.basename(String(devicePath || ""))
    .replace(/-event-kbd$/i, "")
    .toLowerCase();
  return /(keyboard|keypad)/.test(identity);
}

function listKeyboardEventDevices({ fsImpl = fs, directories = ["/dev/input/by-id", "/dev/input/by-path"] } = {}) {
  const byRealPath = new Map();
  for (const dir of directories) {
    let names = [];
    try { names = fsImpl.readdirSync(dir); } catch { continue; }
    for (const name of names) {
      if (!name.endsWith("-event-kbd")) continue;
      const displayPath = path.join(dir, name);
      let realPath;
      try { realPath = fsImpl.realpathSync(displayPath); } catch { continue; }
      const current = byRealPath.get(realPath) || { realPath, displayPaths: [] };
      current.displayPaths.push(displayPath);
      byRealPath.set(realPath, current);
    }
  }
  return [...byRealPath.values()].map((device) => ({
    ...device,
    displayPath: device.displayPaths[0],
    pointerAuxiliary: device.displayPaths.some(isPointerAuxiliaryPath)
      && !device.displayPaths.some(isExplicitKeyboardPath),
  }));
}

function parseInputEvents(buffer, eventSize = 24) {
  const events = [];
  if (!Buffer.isBuffer(buffer) || eventSize < 8) return events;
  const typeOffset = eventSize - 8, codeOffset = eventSize - 6, valueOffset = eventSize - 4;
  for (let offset = 0; offset + eventSize <= buffer.length; offset += eventSize) {
    events.push({
      type: buffer.readUInt16LE(offset + typeOffset),
      code: buffer.readUInt16LE(offset + codeOffset),
      value: buffer.readInt32LE(offset + valueOffset),
    });
  }
  return events;
}

function openKeyboardStreams({
  onEvent,
  onReleaseAll = () => {},
  onStatus = () => {},
  log = console,
  fsImpl = fs,
  listDevices = () => listKeyboardEventDevices({ fsImpl }),
  scanIntervalMs = 5000,
} = {}) {
  let stopped = false, scanTimer = null, authoritative = false;
  const streams = new Map(), activeKeyboards = new Set(), denied = new Set(), ignored = new Set();

  const updateAuthority = (device = null) => {
    const next = activeKeyboards.size > 0;
    if (next === authoritative) return;
    authoritative = next;
    try {
      onStatus({
        authoritative,
        supported: authoritative,
        displayPath: device?.displayPath || null,
        activeKeyboardCount: activeKeyboards.size,
      });
    } catch {}
  };

  const closeDevice = (device) => {
    streams.delete(device.realPath);
    activeKeyboards.delete(device.realPath);
    updateAuthority(device);
    try { onReleaseAll(); } catch {}
  };

  const openDevice = (device) => {
    if (stopped || streams.has(device.realPath)) return;
    if (device.pointerAuxiliary) {
      if (!ignored.has(device.realPath)) {
        ignored.add(device.realPath);
        log.log?.(`[evdev] ignoring pointer auxiliary keyboard endpoint ${device.displayPath}`);
      }
      return;
    }

    const stream = fsImpl.createReadStream(device.realPath, { highWaterMark: 24 * 32 });
    let carry = Buffer.alloc(0), opened = false;
    streams.set(device.realPath, stream);
    stream.on("open", () => {
      opened = true;
      denied.delete(device.realPath);
      activeKeyboards.add(device.realPath);
      log.log?.(`[evdev] physical keyboard input active on ${device.displayPath}`);
      updateAuthority(device);
    });
    stream.on("data", (chunk) => {
      carry = carry.length ? Buffer.concat([carry, chunk]) : chunk;
      const usable = carry.length - (carry.length % 24);
      if (usable <= 0) return;
      const parsed = parseInputEvents(carry.subarray(0, usable), 24);
      carry = carry.subarray(usable);
      for (const event of parsed) {
        if (event.type !== EV_KEY) continue;
        try { onEvent?.(event, device); } catch {}
      }
    });
    stream.on("error", (error) => {
      if (!denied.has(device.realPath)) {
        denied.add(device.realPath);
        const recovery = error?.code === "EACCES"
          ? "; ArchVerse needs its active-session keyboard uaccess rule"
          : "";
        log.warn?.(`[evdev] cannot read physical keyboard ${device.displayPath}: ${error.message}${recovery}`);
      }
      closeDevice(device);
    });
    stream.on("close", () => {
      if (opened || activeKeyboards.has(device.realPath)) closeDevice(device);
      else streams.delete(device.realPath);
    });
  };

  const scan = () => {
    if (stopped) return;
    const devices = listDevices();
    for (const device of devices) openDevice(device);
    if (!devices.length) log.warn?.("[evdev] no *-event-kbd devices found under /dev/input/by-id or /dev/input/by-path");
    if (scanIntervalMs > 0) {
      scanTimer = setTimeout(scan, scanIntervalMs);
      scanTimer.unref?.();
    }
  };
  scan();

  return {
    configured: true,
    get supported() { return authoritative; },
    get authoritative() { return authoritative; },
    stop() {
      stopped = true;
      if (scanTimer) clearTimeout(scanTimer);
      for (const stream of streams.values()) {
        try { stream.destroy(); } catch {}
      }
      streams.clear();
      activeKeyboards.clear();
      updateAuthority();
      try { onReleaseAll(); } catch {}
    },
  };
}

function startEvdevHoldKey({ accelerator, onDown, onUp, onStatus, log = console, ...streamOptions } = {}) {
  const targetCode = keyCodeForAccelerator(accelerator);
  if (targetCode == null || typeof onDown !== "function" || typeof onUp !== "function") {
    return { configured: false, supported: false, authoritative: false, stop() {} };
  }
  let held = false;
  const releaseIfNeeded = () => {
    if (!held) return;
    held = false;
    try { onUp("evdev"); } catch {}
  };
  return openKeyboardStreams({
    ...streamOptions,
    log,
    onStatus,
    onReleaseAll: releaseIfNeeded,
    onEvent(event) {
      if (event.code !== targetCode) return;
      if (event.value === 1 && !held) {
        held = true;
        try { onDown("evdev"); } catch {}
      } else if (event.value === 0 && held) {
        held = false;
        try { onUp("evdev"); } catch {}
      }
    },
  });
}

module.exports = {
  EV_KEY,
  KEY_CODES,
  isPointerAuxiliaryPath,
  keyCodeForAccelerator,
  listKeyboardEventDevices,
  normalizeAccelerator,
  openKeyboardStreams,
  parseInputEvents,
  startEvdevHoldKey,
};
