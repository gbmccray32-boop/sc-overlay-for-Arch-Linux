"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("archverseNativeWidget", {
  ready: () => ipcRenderer.send("widget-window:ready"),
  // Preview 5 deliberately keeps the Log window focusless. Its read-only controls are testable;
  // filter typing remains a separate migration gate instead of silently stealing game focus.
  editStart: () => ipcRenderer.send("widget-window:typing-requested"),
  editEnd: () => ipcRenderer.send("widget-window:typing-ended"),
  summonCog: () => {},
  drag: (phase, x, y) => ipcRenderer.send("widget-window:drag", {
    phase: String(phase || ""),
    x: Number(x),
    y: Number(y),
  }),
  onState: (callback) => ipcRenderer.on("widget-window-preview:state", (_event, state) => callback(state)),
});
