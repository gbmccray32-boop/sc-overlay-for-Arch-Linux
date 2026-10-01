"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("archverseNativeWidget", {
  ready: () => ipcRenderer.send("widget-window:ready"),
  active: (on) => ipcRenderer.send("widget-window:active", on === true),
  openUrl: (url) => ipcRenderer.send("widget-window:open-url", String(url || "")),
  pickTone: () => ipcRenderer.invoke("scfeed:pick-tone"),
  clearTone: () => ipcRenderer.invoke("scfeed:clear-tone"),
  summonCog: () => {},
  drag: (phase, x, y) => ipcRenderer.send("widget-window:drag", {
    phase: String(phase || ""),
    x: Number(x),
    y: Number(y),
  }),
  onState: (callback) => ipcRenderer.on("widget-window-preview:state", (_event, state) => callback(state)),
});
