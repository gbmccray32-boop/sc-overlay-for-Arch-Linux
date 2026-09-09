#!/usr/bin/env node
'use strict';

// Add upstream widget lifecycle seams to the verified Candidate 8k Linux shell.
// Capture, focus ownership, held-F input, and sidecar supervision remain baseline code.
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2];
if (!root) throw new Error('usage: port-alpha23-widgets.cjs <staged-native-root>');
const mainPath = path.join(root, 'app/electron/main.cjs');
const preloadPath = path.join(root, 'app/electron/preload.cjs');
let main = fs.readFileSync(mainPath, 'utf8');
let preload = fs.readFileSync(preloadPath, 'utf8');
function insert(source, anchor, addition) {
  const count = source.split(anchor).length - 1;
  if (count !== 1) throw new Error(`Alpha23 widget seam: expected one ${anchor}, found ${count}`);
  return source.replace(anchor, anchor + addition);
}
if (main.includes('ARCHVERSE_ALPHA23_WIDGETS')) throw new Error('Alpha23 widget port already applied');
for (const [key, title, channel] of [['logView', 'Log', 'logview'], ['verseFinder', 'Verse Finder', 'versefinder']]) {
  const cap = key[0].toUpperCase() + key.slice(1);
  main = insert(main, 'let haulingVisible = false;', `\nlet ${key}Visible = false; // ARCHVERSE_ALPHA23_WIDGETS`);
  main = insert(main, 'hauling: haulingVisible,', ` ${key}: ${key}Visible,`);
  main = insert(main, 'function toggleHauling(){ setHaulingVisible(!haulingVisible); }', `
function send${cap}Visible(state) { try { overlay?.webContents.send("overlay:${key}-visible", state); } catch {} }
function set${cap}Visible(on) {
  ${key}Visible = !!on;
  send${cap}Visible({ on: ${key}Visible });
  void postConfig({ ${key}Open: ${key}Visible });
  pushWidgetStates();
  refreshTray();
}
function toggle${cap}() { set${cap}Visible(!${key}Visible); }`);
  main = insert(main, 'sendHaulingVisible({ on: haulingVisible, initial: true });', `\n    send${cap}Visible({ on: ${key}Visible, initial: true });`);
  main = insert(main, 'sendHaulingVisible({ on: haulingVisible });', `\n    send${cap}Visible({ on: ${key}Visible });`);
  main = insert(main, 'haulingVisible = c.haulingOpen === true;', `\n      ${key}Visible = c.${key}Open === true;`);
  main = insert(main, 'hauling: () => toggleHauling(),', `\n  ${key}: () => toggle${cap}(),`);
  main = insert(main, '{ label: "Hauling", type: "checkbox", checked: haulingVisible, click: toggleHauling },', `\n      { label: "${title}", type: "checkbox", checked: ${key}Visible, click: toggle${cap} },`);
  main = insert(main, 'ipcMain.on("app:set-hauling", (_e, on) => setHaulingVisible(!!on));', `\n  ipcMain.on("app:set-${channel}", (_e, on) => set${cap}Visible(!!on));`);
  preload = insert(preload, 'setHauling: (on) => ipcRenderer.send("app:set-hauling", !!on),', `\n  set${cap}: (on) => ipcRenderer.send("app:set-${channel}", !!on),\n  on${cap}Visible: (cb) => ipcRenderer.on("overlay:${key}-visible", (_e, state) => cb(state)),`);
}
// Validate every seam before writing either file.
new (require('node:vm').Script)(main, { filename: mainPath });
new (require('node:vm').Script)(preload, { filename: preloadPath });
fs.writeFileSync(mainPath, main);
fs.writeFileSync(preloadPath, preload);
console.log('Alpha23 Log and Verse Finder widget lifecycle ported');
