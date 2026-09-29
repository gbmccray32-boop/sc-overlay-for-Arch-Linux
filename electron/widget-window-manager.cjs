"use strict";

const path = require("node:path");

const PREVIEW_MODE = "preview";
const WINDOW_TITLE_PREFIX = "ArchVerse Widget";
const WINDOW_ID_PATTERN = /^[a-z][A-Za-z0-9]*$/;
const PAGE_PATTERN = /^[a-z0-9][a-z0-9-]*\.html$/;

function widgetWindowMode({ platform = process.platform, env = process.env } = {}) {
  if (platform !== "linux") return "canvas";
  return env.SC_TRACKER_WIDGET_WINDOWS === PREVIEW_MODE ? PREVIEW_MODE : "canvas";
}

function nativeWaylandRequested(env = process.env) {
  return env.SC_TRACKER_NATIVE_WAYLAND === "1";
}

function normalizeBounds(bounds = {}) {
  const number = (value, fallback) => Number.isFinite(value) ? Math.round(value) : fallback;
  return {
    x: number(bounds.x, 0),
    y: number(bounds.y, 0),
    width: Math.max(1, number(bounds.width, 320)),
    height: Math.max(1, number(bounds.height, 240)),
  };
}

function normalizeDefinition(definition) {
  if (!definition || typeof definition !== "object") {
    throw new TypeError("widget window definition must be an object");
  }
  const id = String(definition.id || "");
  const page = String(definition.page || "");
  if (!WINDOW_ID_PATTERN.test(id)) throw new Error(`invalid widget window id: ${id || "(empty)"}`);
  if (!PAGE_PATTERN.test(page) || path.basename(page) !== page) {
    throw new Error(`invalid widget window page: ${page || "(empty)"}`);
  }
  return {
    id,
    page,
    title: String(definition.title || id),
    bounds: normalizeBounds(definition.bounds),
  };
}

function windowTitle(id) {
  if (!WINDOW_ID_PATTERN.test(id)) throw new Error(`invalid widget window id: ${id || "(empty)"}`);
  return `${WINDOW_TITLE_PREFIX} [${id}]`;
}

function kwinRuleHints(id) {
  return {
    description: `ArchVerse widget: ${id}`,
    title: windowTitle(id),
    titleMatch: `^ArchVerse Widget \\[${id}\\]$`,
    keepAbove: true,
    skipTaskbar: true,
    skipPager: true,
    skipSwitcher: true,
  };
}

class WidgetWindowManager {
  constructor({
    BrowserWindow,
    preloadPath,
    baseUrl,
    platform = process.platform,
    env = process.env,
    logger = console,
  } = {}) {
    if (typeof BrowserWindow !== "function") throw new TypeError("BrowserWindow constructor is required");
    if (!preloadPath) throw new TypeError("preloadPath is required");
    if (!baseUrl) throw new TypeError("baseUrl is required");
    this.BrowserWindow = BrowserWindow;
    this.preloadPath = preloadPath;
    this.baseUrl = baseUrl;
    this.platform = platform;
    this.env = env;
    this.logger = logger;
    this.mode = widgetWindowMode({ platform, env });
    this.windows = new Map();
  }

  enabled() {
    return this.mode === PREVIEW_MODE;
  }

  stackingOwner() {
    return nativeWaylandRequested(this.env) ? "kwin" : "electron-with-kwin-backstop";
  }

  create(definition) {
    if (!this.enabled()) return null;
    const widget = normalizeDefinition(definition);
    if (this.windows.has(widget.id)) throw new Error(`widget window already exists: ${widget.id}`);

    const win = new this.BrowserWindow({
      ...widget.bounds,
      title: windowTitle(widget.id),
      frame: false,
      transparent: true,
      show: false,
      resizable: true,
      movable: true,
      focusable: true,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      fullscreenable: false,
      type: this.platform === "linux" ? "toolbar" : undefined,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    win.setIgnoreMouseEvents(true, { forward: true });
    win.webContents?.setWindowOpenHandler?.(() => ({ action: "deny" }));
    const url = new URL(widget.page, this.baseUrl);
    url.searchParams.set("widgetWindow", "1");
    url.searchParams.set("widgetId", widget.id);
    win.loadURL(url.toString());
    win.once?.("closed", () => this.windows.delete(widget.id));
    this.windows.set(widget.id, { definition: widget, window: win });
    this.logger.log?.(
      `[widget-window] created ${widget.id}; mode=${this.mode} stacking=${this.stackingOwner()}`,
    );
    return win;
  }

  get(id) {
    return this.windows.get(id)?.window || null;
  }

  show(id) {
    const win = this.get(id);
    if (!win || win.isDestroyed?.()) return false;
    if (typeof win.showInactive === "function") win.showInactive();
    else win.show();
    return true;
  }

  hide(id) {
    const win = this.get(id);
    if (!win || win.isDestroyed?.()) return false;
    win.hide();
    return true;
  }

  setInteractive(id, interactive) {
    const win = this.get(id);
    if (!win || win.isDestroyed?.()) return false;
    const on = interactive === true;
    win.setFocusable?.(on);
    win.setIgnoreMouseEvents(!on, { forward: true });
    return true;
  }

  setBounds(id, bounds) {
    const entry = this.windows.get(id);
    if (!entry || entry.window.isDestroyed?.()) return false;
    entry.definition.bounds = normalizeBounds(bounds);
    entry.window.setBounds(entry.definition.bounds);
    return true;
  }

  closeAll() {
    for (const { window: win } of this.windows.values()) {
      if (!win.isDestroyed?.()) win.destroy();
    }
    this.windows.clear();
  }
}

module.exports = {
  PREVIEW_MODE,
  WINDOW_TITLE_PREFIX,
  WidgetWindowManager,
  kwinRuleHints,
  nativeWaylandRequested,
  normalizeBounds,
  normalizeDefinition,
  widgetWindowMode,
  windowTitle,
};
