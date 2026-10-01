"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const path = require("node:path");
const {
  WidgetWindowManager,
  kwinRuleHints,
  normalizeBounds,
  widgetWindowMode,
  windowTitle,
} = require("../electron/widget-window-manager.cjs");

class FakeBrowserWindow extends EventEmitter {
  static created = [];

  constructor(options) {
    super();
    this.options = options;
    this.destroyed = false;
    this.calls = [];
    this.webContents = {
      setWindowOpenHandler: (handler) => { this.windowOpenHandler = handler; },
      send: (...args) => { this.calls.push(["send", ...args]); },
    };
    FakeBrowserWindow.created.push(this);
  }

  loadURL(url) { this.url = url; }
  setIgnoreMouseEvents(...args) { this.calls.push(["ignore", ...args]); }
  setFocusable(value) { this.calls.push(["focusable", value]); }
  showInactive() { this.calls.push(["showInactive"]); }
  hide() { this.calls.push(["hide"]); }
  setBounds(bounds) { this.calls.push(["bounds", bounds]); }
  getBounds() { return this.calls.findLast((call) => call[0] === "bounds")?.[1] || {
    x: this.options.x, y: this.options.y, width: this.options.width, height: this.options.height,
  }; }
  setMinimumSize(...args) { this.calls.push(["minimumSize", ...args]); }
  setMovable(value) { this.calls.push(["movable", value]); }
  setResizable(value) { this.calls.push(["resizable", value]); }
  moveTop() { this.calls.push(["moveTop"]); }
  focus() { this.calls.push(["focus"]); }
  show() { this.calls.push(["show"]); }
  destroy() { this.destroyed = true; this.emit("closed"); }
  isDestroyed() { return this.destroyed; }
}

assert.equal(widgetWindowMode({ platform: "linux", env: {} }), "canvas");
assert.equal(widgetWindowMode({ platform: "linux", env: { SC_TRACKER_WIDGET_WINDOWS: "1" } }), "canvas");
assert.equal(widgetWindowMode({ platform: "linux", env: { SC_TRACKER_WIDGET_WINDOWS: "preview" } }), "preview");
assert.equal(widgetWindowMode({ platform: "win32", env: { SC_TRACKER_WIDGET_WINDOWS: "preview" } }), "canvas");

const common = {
  BrowserWindow: FakeBrowserWindow,
  preloadPath: path.join("/opt", "archverse", "electron", "preload.cjs"),
  baseUrl: "http://127.0.0.1:8778/",
  platform: "linux",
  logger: { log() {} },
};

const dormant = new WidgetWindowManager({ ...common, env: {} });
assert.equal(dormant.create({ id: "scFeed", page: "scfeed.html" }), null);
assert.equal(FakeBrowserWindow.created.length, 0, "default canvas mode must not create a native window");

const manager = new WidgetWindowManager({
  ...common,
  env: { SC_TRACKER_WIDGET_WINDOWS: "preview", SC_TRACKER_NATIVE_WAYLAND: "1" },
});
assert.equal(manager.stackingOwner(), "kwin");
const win = manager.create({
  id: "scFeed",
  page: "scfeed.html",
  title: "SC Feed",
  bounds: { x: 480.4, y: 560.6, width: 340, height: 140 },
});
assert.equal(win.options.title, "ArchVerse Widget [scFeed]");
assert.equal(win.options.type, "toolbar");
assert.equal(win.options.alwaysOnTop, true);
assert.equal(win.options.skipTaskbar, true);
assert.equal(win.options.focusable, false);
assert.equal(win.options.webPreferences.contextIsolation, true);
assert.equal(win.options.webPreferences.nodeIntegration, false);
assert.equal(win.options.webPreferences.sandbox, true);
assert.deepEqual(
  { x: win.options.x, y: win.options.y, width: win.options.width, height: win.options.height },
  { x: 480, y: 561, width: 340, height: 140 },
);
assert.deepEqual(win.calls[0], ["ignore", true, { forward: true }]);
assert.deepEqual(win.windowOpenHandler(), { action: "deny" });
const loaded = new URL(win.url);
assert.equal(loaded.pathname, "/scfeed.html");
assert.equal(loaded.searchParams.get("widgetWindow"), "1");
assert.equal(loaded.searchParams.get("widgetId"), "scFeed");

assert.equal(manager.show("scFeed"), true);
assert.deepEqual(win.calls.at(-1), ["showInactive"]);
assert.equal(manager.setInteractive("scFeed", true), true);
assert.equal(win.calls.findLast((call) => call[0] === "focusable")[1], false, "held-F interaction remains focusless");
assert.deepEqual(win.calls.findLast((call) => call[0] === "ignore"), ["ignore", false, { forward: true }]);
assert.equal(manager.setInteractive("scFeed", false), true);
assert.equal(win.calls.findLast((call) => call[0] === "focusable")[1], false);
assert.deepEqual(win.calls.findLast((call) => call[0] === "ignore"), ["ignore", true, { forward: true }]);
assert.equal(manager.setBounds("scFeed", { x: -20, y: 10, width: 0, height: 90.7 }), true);
assert.deepEqual(win.calls.findLast((call) => call[0] === "bounds"), ["bounds", { x: -20, y: 10, width: 1, height: 91 }]);
assert.equal(manager.hide("scFeed"), true);
assert.deepEqual(win.calls.at(-1), ["hide"]);

assert.equal(manager.containsPoint("scFeed", { x: -20, y: 11 }), true);
assert.equal(manager.containsPoint("scFeed", { x: -21, y: 11 }), false);
assert.equal(manager.updateHeldPointer({ x: -20, y: 11 }, true), "scFeed");
assert.equal(win.calls.some((call) => call[0] === "focus"), false, "held-F must not steal game focus");
assert.equal(manager.state("scFeed").focusPolicy, "focusless-held-f");
manager.updateHeldPointer(null, false);
manager.setArrangeMode(true);
assert.equal(manager.state("scFeed").arrangeMode, true);
assert.equal(manager.state("scFeed").focusPolicy, "arrange-only");
assert.equal(win.calls.some((call) => call[0] === "focus"), true, "arrange mode may own focus");
assert.equal(manager.beginDrag("scFeed", { x: 100, y: 200 }), true);
assert.equal(manager.dragTo("scFeed", { x: 145, y: 225 }), true);
assert.deepEqual(manager.bounds("scFeed"), { x: 25, y: 35, width: 1, height: 91 });
assert.equal(manager.endDrag("scFeed"), true);
assert.equal(manager.dragTo("scFeed", { x: 200, y: 300 }), false);
assert.equal(manager.resizeBy("scFeed", 50, 70), true);
assert.deepEqual(manager.bounds("scFeed"), { x: 25, y: 35, width: 260, height: 161 });
manager.setArrangeMode(false);
assert.equal(manager.beginDrag("scFeed", { x: 100, y: 200 }), false);

assert.equal(windowTitle("mining"), "ArchVerse Widget [mining]");
assert.deepEqual(kwinRuleHints("mining"), {
  description: "ArchVerse widget: mining",
  title: "ArchVerse Widget [mining]",
  titleMatch: "^ArchVerse Widget \\[mining\\]$",
  keepAbove: true,
  skipTaskbar: true,
  skipPager: true,
  skipSwitcher: true,
});
assert.deepEqual(normalizeBounds({ width: Number.NaN }), { x: 0, y: 0, width: 320, height: 240 });
assert.throws(() => manager.create({ id: "../mining", page: "mining.html" }), /invalid widget window id/);
assert.throws(() => manager.create({ id: "mining", page: "..\/mining.html" }), /invalid widget window page/);
assert.throws(() => manager.create({ id: "scFeed", page: "scfeed.html" }), /already exists/);

manager.closeAll();
assert.equal(win.destroyed, true);
assert.equal(manager.get("scFeed"), null);

console.log("widget-window foundation test: passed");
