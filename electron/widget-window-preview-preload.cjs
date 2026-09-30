"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("archverseWidgetPreview", {
  ready: () => ipcRenderer.send("widget-window-preview:ready"),
  action: (action) => ipcRenderer.send("widget-window-preview:action", String(action || "")),
  onState: (callback) => ipcRenderer.on("widget-window-preview:state", (_event, state) => callback(state)),
});
