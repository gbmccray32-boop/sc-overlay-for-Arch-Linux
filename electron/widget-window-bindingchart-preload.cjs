"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("archverseNativeWidget", {
  ready: () => ipcRenderer.send("widget-window:ready"),
  summonCog: () => ipcRenderer.send("widget-window:summon-cog"),
  pickPng: () => ipcRenderer.invoke("widget-window:binding-pick-png"),
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
  onReload: (callback) => ipcRenderer.on("widget-window:binding-reload", () => callback()),
});
