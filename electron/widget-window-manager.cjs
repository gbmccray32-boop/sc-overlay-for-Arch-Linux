"use strict";

const path = require("node:path");
const fs = require("node:fs");

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

function pointInsideBounds(point, bounds) {
  if (!point || !bounds) return false;
  const x = Number(point.x);
  const y = Number(point.y);
  return Number.isFinite(x) && Number.isFinite(y)
    && x >= bounds.x && y >= bounds.y
    && x < bounds.x + bounds.width && y < bounds.y + bounds.height;
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
    layoutPath = "",
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
    this.layoutPath = layoutPath;
    this.mode = widgetWindowMode({ platform, env });
    this.windows = new Map();
    this.arrangeMode = false;
    this.heldPointer = null;
    this.saveTimer = null;
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
    widget.defaultBounds = { ...widget.bounds };
    const saved = this.readLayout()[widget.id];
    if (saved) widget.bounds = normalizeBounds(saved);
    if (this.windows.has(widget.id)) throw new Error(`widget window already exists: ${widget.id}`);

    const win = new this.BrowserWindow({
      ...widget.bounds,
      title: windowTitle(widget.id),
      frame: false,
      transparent: true,
      show: false,
      resizable: true,
      movable: true,
      focusable: false,
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
    win.setMinimumSize?.(260, 160);
    win.webContents?.setWindowOpenHandler?.(() => ({ action: "deny" }));
    const url = new URL(widget.page, this.baseUrl);
    url.searchParams.set("widgetWindow", "1");
    url.searchParams.set("widgetId", widget.id);
    win.loadURL(url.toString());
    const save = () => {
      if (win.isDestroyed?.()) return;
      const bounds = win.getBounds?.();
      if (bounds) {
        widget.bounds = normalizeBounds(bounds);
        this.scheduleLayoutSave();
        this.sendState(widget.id);
      }
    };
    win.on?.("move", save);
    win.on?.("resize", save);
    win.once?.("closed", () => this.windows.delete(widget.id));
    this.windows.set(widget.id, { definition: widget, window: win, interactive: false });
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
    const entry = this.windows.get(id);
    const win = entry?.window;
    if (!entry || !win || win.isDestroyed?.()) return false;
    const on = interactive === true;
    if (entry.interactive === on) return true;
    entry.interactive = on;
    win.setFocusable?.(on);
    win.setIgnoreMouseEvents(!on, { forward: true });
    this.sendState(id);
    return true;
  }

  setBounds(id, bounds) {
    const entry = this.windows.get(id);
    if (!entry || entry.window.isDestroyed?.()) return false;
    entry.definition.bounds = normalizeBounds(bounds);
    entry.window.setBounds(entry.definition.bounds);
    this.scheduleLayoutSave();
    this.sendState(id);
    return true;
  }

  bounds(id) {
    const entry = this.windows.get(id);
    if (!entry || entry.window.isDestroyed?.()) return null;
    return normalizeBounds(entry.window.getBounds?.() || entry.definition.bounds);
  }

  containsPoint(id, point) {
    return pointInsideBounds(point, this.bounds(id));
  }

  updateHeldPointer(point, held) {
    this.heldPointer = held === true ? point : null;
    let hit = null;
    for (const [id] of this.windows) {
      const inside = held === true && this.containsPoint(id, point);
      if (inside) hit = id;
      this.setInteractive(id, this.arrangeMode || inside);
      if (inside) {
        const win = this.get(id);
        win?.show?.();
        win?.moveTop?.();
        win?.focus?.();
      }
    }
    return hit;
  }

  setArrangeMode(on) {
    this.arrangeMode = on === true;
    for (const [id] of this.windows) {
      const win = this.get(id);
      if (!win || win.isDestroyed?.()) continue;
      win.setMovable?.(this.arrangeMode);
      win.setResizable?.(this.arrangeMode);
      this.setInteractive(id, this.arrangeMode);
      win.moveTop?.();
      if (this.arrangeMode) win.show?.();
    }
  }

  resizeBy(id, deltaWidth, deltaHeight) {
    const bounds = this.bounds(id);
    if (!bounds || !this.arrangeMode) return false;
    return this.setBounds(id, {
      ...bounds,
      width: Math.max(260, bounds.width + Number(deltaWidth || 0)),
      height: Math.max(160, bounds.height + Number(deltaHeight || 0)),
    });
  }

  resetBounds(id) {
    const entry = this.windows.get(id);
    if (!entry) return false;
    return this.setBounds(id, entry.definition.defaultBounds);
  }

  state(id) {
    const entry = this.windows.get(id);
    return {
      id,
      mode: this.mode,
      stackingOwner: this.stackingOwner(),
      arrangeMode: this.arrangeMode,
      heldInteractive: !this.arrangeMode && this.containsPoint(id, this.heldPointer),
      interactive: entry?.interactive === true,
      bounds: this.bounds(id),
    };
  }

  sendState(id) {
    const win = this.get(id);
    if (!win || win.isDestroyed?.()) return false;
    win.webContents?.send?.("widget-window-preview:state", this.state(id));
    return true;
  }

  readLayout() {
    if (!this.layoutPath) return {};
    try {
      const value = JSON.parse(fs.readFileSync(this.layoutPath, "utf8"));
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  }

  scheduleLayoutSave() {
    if (!this.layoutPath) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.writeLayout(), 120);
    this.saveTimer.unref?.();
  }

  writeLayout() {
    if (!this.layoutPath) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const value = {};
    for (const [id] of this.windows) {
      const bounds = this.bounds(id);
      if (bounds) value[id] = bounds;
    }
    try {
      fs.mkdirSync(path.dirname(this.layoutPath), { recursive: true });
      const temporary = `${this.layoutPath}.tmp`;
      fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
      fs.renameSync(temporary, this.layoutPath);
    } catch (error) {
      this.logger.error?.(`[widget-window] layout save failed: ${String(error)}`);
    }
  }

  closeAll() {
    this.writeLayout();
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
  pointInsideBounds,
  widgetWindowMode,
  windowTitle,
};
