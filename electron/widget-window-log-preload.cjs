"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("archverseNativeWidget", {
  ready: () => ipcRenderer.send("widget-window:ready"),
  // Preview 7 deliberately keeps the Log window focusless. Its read-only controls are testable;
  // filter typing remains a separate migration gate instead of silently stealing game focus.
  editStart: () => ipcRenderer.send("widget-window:typing-requested"),
  editEnd: () => ipcRenderer.send("widget-window:typing-ended"),
  // The Canvas implementation used this bridge on every widget interaction. Keeping it live in a
  // native window restores the shared Overlay App cog without granting the renderer general IPC.
  summonCog: () => ipcRenderer.send("widget-window:summon-cog"),
  menuState: () => ipcRenderer.invoke("widget-window:menu-state"),
  updateAppearance: (patch) => ipcRenderer.invoke("widget-window:update-appearance", patch),
  menuAction: (action) => ipcRenderer.invoke("widget-window:menu-action", String(action || "")),
  drag: (phase, x, y) => ipcRenderer.send("widget-window:drag", {
    phase: String(phase || ""),
    x: Number(x),
    y: Number(y),
  }),
  resize: (phase, x, y) => ipcRenderer.send("widget-window:resize", {
    phase: String(phase || ""),
    x: Number(x),
    y: Number(y),
  }),
  onState: (callback) => ipcRenderer.on("widget-window-preview:state", (_event, state) => callback(state)),
  onMenuState: (callback) => ipcRenderer.on("widget-window:menu-state", (_event, state) => callback(state)),
});
