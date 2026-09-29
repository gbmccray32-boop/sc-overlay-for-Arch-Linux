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
    };
    FakeBrowserWindow.created.push(this);
  }

  loadURL(url) { this.url = url; }
  setIgnoreMouseEvents(...args) { this.calls.push(["ignore", ...args]); }
  setFocusable(value) { this.calls.push(["focusable", value]); }
  showInactive() { this.calls.push(["showInactive"]); }
  hide() { this.calls.push(["hide"]); }
  setBounds(bounds) { this.calls.push(["bounds", bounds]); }
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
assert.deepEqual(win.calls.slice(-2), [["focusable", true], ["ignore", false, { forward: true }]]);
assert.equal(manager.setInteractive("scFeed", false), true);
assert.deepEqual(win.calls.slice(-2), [["focusable", false], ["ignore", true, { forward: true }]]);
assert.equal(manager.setBounds("scFeed", { x: -20, y: 10, width: 0, height: 90.7 }), true);
assert.deepEqual(win.calls.at(-1), ["bounds", { x: -20, y: 10, width: 1, height: 91 }]);
assert.equal(manager.hide("scFeed"), true);
assert.deepEqual(win.calls.at(-1), ["hide"]);

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
