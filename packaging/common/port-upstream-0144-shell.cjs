#!/usr/bin/env node
'use strict';

// Port upstream 0.1.44+ SHELL BEHAVIOR onto the verified ArchVerse Linux Electron runtime.
// Never replace main.cjs wholesale: upstream's NOACTIVATE implementation is Win32-specific.

const fs = require('node:fs');
const path = require('node:path');

const [root] = process.argv.slice(2);
if (!root) {
  console.error('usage: port-upstream-0144-shell.cjs <staged-app-root>');
  process.exit(2);
}

const mainPath = path.join(root, 'app/electron/main.cjs');
const preloadPath = path.join(root, 'app/electron/preload.cjs');
for (const p of [mainPath, preloadPath]) {
  if (!fs.existsSync(p)) throw new Error(`0.1.44 Linux shell port: missing ${path.relative(root, p)}`);
}

let main = fs.readFileSync(mainPath, 'utf8');
let preload = fs.readFileSync(preloadPath, 'utf8');

function must(ok, message) {
  if (!ok) throw new Error(`0.1.44 Linux shell port: ${message}`);
}
function replaceOnce(text, from, to, label) {
  if (text.includes(to)) return text;
  const n = text.split(from).length - 1;
  must(n === 1, `${label}: expected exactly one anchor, found ${n}`);
  return text.replace(from, to);
}

// The verified Alpha21 payload ALREADY has upstream social Chat + in-canvas Settings. Preserve
// those implementations exactly. The only new shell-owned widget missing from this payload is
// Hauling, so add Hauling beside Battaglia at the same state/replay/persistence seams.
if (!main.includes('ARCHVERSE_UPSTREAM_0144_HAULING')) {
  must(main.includes('let chatVisible = false;'), 'verified social Chat state missing');
  must(main.includes('let configWidgetVisible = false;'), 'verified Settings widget state missing');
  must(main.includes('function openSettingsSurface()'), 'verified Settings canvas/fallback router missing');
  must(main.includes('ipcMain.on("app:set-chat"'), 'verified social Chat IPC missing');
  must(main.includes('ipcMain.on("app:set-config"'), 'verified Settings IPC missing');

  main = replaceOnce(
    main,
    'let battagliaVisible = false;',
    'let battagliaVisible = false;\nlet haulingVisible = false; // ARCHVERSE_UPSTREAM_0144_HAULING',
    'Hauling visibility state');

  // There is one canonical aggregate snapshot in the verified payload. Do not rebuild its Chat or
  // Settings entries; splice Hauling between Battaglia and Chat so upstream renderer state matches.
  main = replaceOnce(
    main,
    'battaglia: battagliaVisible, chat: chatVisible,',
    'battaglia: battagliaVisible, hauling: haulingVisible, chat: chatVisible,',
    'Hauling widget-state snapshot');

  const battagliaToggle = 'function toggleBattaglia(){ setBattagliaVisible(!battagliaVisible); }';
  const battagliaToggleSpaced = 'function toggleBattaglia() { setBattagliaVisible(!battagliaVisible); }';
  const haulingFns = `function sendHaulingVisible(state){ try { overlay?.webContents.send("overlay:hauling-visible", state); } catch {} }
function setHaulingVisible(on){ haulingVisible=!!on; sendHaulingVisible({on:haulingVisible}); void postConfig({haulingOpen:haulingVisible}); pushWidgetStates(); refreshTray(); }
function toggleHauling(){ setHaulingVisible(!haulingVisible); }`;
  if (main.includes(battagliaToggle)) {
    main = main.replace(battagliaToggle, `${battagliaToggle}\n${haulingFns}`);
  } else if (main.includes(battagliaToggleSpaced)) {
    main = main.replace(battagliaToggleSpaced, `${battagliaToggleSpaced}\n${haulingFns}`);
  } else {
    throw new Error('0.1.44 Linux shell port: Battaglia toggle anchor missing');
  }

  // Saved open-state restore. Chat restore already exists in this payload and must not be duplicated.
  main = replaceOnce(
    main,
    '      battagliaVisible = c.battagliaOpen === true;\n      chatVisible = c.chatOpen === true;',
    '      battagliaVisible = c.battagliaOpen === true;\n      haulingVisible = c.haulingOpen === true;\n      chatVisible = c.chatOpen === true;',
    'Hauling persisted-state restore');

  // Initial canvas replay keeps upstream's `initial:true` semantics so grouped widgets do not steal
  // the remembered front tab. The later post-config replay has no `initial` flag by design.
  main = replaceOnce(
    main,
    '    sendBattagliaVisible({ on: battagliaVisible, initial: true });\n    sendChatVisible({ on: chatVisible, initial: true });',
    '    sendBattagliaVisible({ on: battagliaVisible, initial: true });\n    sendHaulingVisible({ on: haulingVisible, initial: true });\n    sendChatVisible({ on: chatVisible, initial: true });',
    'Hauling initial visibility replay');
  main = replaceOnce(
    main,
    '    sendBattagliaVisible({ on: battagliaVisible });\n    sendWebViewVisible({ on: webViewVisible });',
    '    sendBattagliaVisible({ on: battagliaVisible });\n    sendHaulingVisible({ on: haulingVisible });\n    sendWebViewVisible({ on: webViewVisible });',
    'Hauling restored visibility replay');

  const trayNeedle = '{ label: "Event Tracker", type: "checkbox", checked: battagliaVisible, click: toggleBattaglia },';
  main = replaceOnce(
    main,
    trayNeedle,
    `${trayNeedle}\n      { label: "Hauling", type: "checkbox", checked: haulingVisible, click: toggleHauling },`,
    'Hauling tray entry');

  const battagliaIpc = '  ipcMain.on("app:set-battaglia", (_e, on) => setBattagliaVisible(!!on));';
  main = replaceOnce(
    main,
    battagliaIpc,
    `${battagliaIpc}\n  ipcMain.on("app:set-hauling", (_e, on) => setHaulingVisible(!!on));`,
    'Hauling IPC');
}

// Universal configurable widget hotkeys. Linux keeps F/hold-to-interact/Shift+F6 platform-owned;
// this map controls widget visibility only. Existing dedicated hotkey helpers remain authoritative
// for widgets that already had special behavior.
if (!main.includes('ARCHVERSE_UPSTREAM_0144_WIDGET_HOTKEYS')) {
  const insertAt = main.indexOf('let interactAccel = null;');
  must(insertAt >= 0, 'interaction hotkey state anchor missing');
  const block = `// ARCHVERSE_UPSTREAM_0144_WIDGET_HOTKEYS
const WIDGET_TOGGLES = {
  mining: () => toggleMining(),
  notepad: () => toggleNotepad(),
  twitchChat: () => toggleTwitchChat(),
  scFeed: () => toggleScFeed(),
  unlockAlert: () => toggleUnlockAlert(),
  party: () => toggleParty(),
  battaglia: () => toggleBattaglia(),
  hauling: () => toggleHauling(),
  chat: () => toggleChat(),
  webView: () => toggleWebView(),
  bindingChart: () => toggleBindingChart(),
  config: () => setConfigWidgetVisible(!configWidgetVisible),
};
const widgetAccels = new Map();
const LEGACY_WIDGET_REGISTRARS = {
  mining: (a) => registerMiningHotkey(a),
  notepad: (a) => registerNotepadHotkey(a),
  webView: (a) => registerWebViewHotkey(a),
  bindingChart: (a) => registerBindingHotkey(a),
};
function registerGenericWidgetHotkey(key, accel) {
  const prior = widgetAccels.get(key);
  if (prior) hotkeys.unregister(prior);
  widgetAccels.delete(key);
  if (!accel || typeof accel !== "string") return { ok: true };
  const toggle = WIDGET_TOGGLES[key];
  if (typeof toggle !== "function") return { ok: false, error: "Unknown widget" };
  const r = hotkeys.register(accel, toggle);
  if (r.ok) widgetAccels.set(key, accel);
  return r;
}
function registerWidgetHotkey(key, accel) {
  if (!Object.prototype.hasOwnProperty.call(WIDGET_TOGGLES, key)) return { ok: false, error: "Unknown widget" };
  const legacy = LEGACY_WIDGET_REGISTRARS[key];
  if (legacy) return legacy(typeof accel === "string" ? accel : "");
  return registerGenericWidgetHotkey(key, typeof accel === "string" ? accel : "");
}
function applyWidgetHotkeys(cfg) {
  const saved = cfg && typeof cfg.widgetHotkeys === "object" && cfg.widgetHotkeys ? cfg.widgetHotkeys : {};
  for (const [key, accel] of Object.entries(saved)) registerWidgetHotkey(key, typeof accel === "string" ? accel : "");
}
function applyWidgetHotkeysFromDisk() {
  try { applyWidgetHotkeys(JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, "config.json"), "utf8"))); }
  catch { /* no new per-widget assignments */ }
}
`;
  main = main.slice(0, insertAt) + block + '\n' + main.slice(insertAt);

  main = replaceOnce(
    main,
    '    registerFabClaimHotkey(fabClaimKey);',
    '    registerFabClaimHotkey(fabClaimKey);\n    applyWidgetHotkeysFromDisk();',
    'universal widget-hotkey startup');

  const miningIpc = '  ipcMain.handle("set-mining-hotkey", (_e, accel) =>\n    registerMiningHotkey(typeof accel === "string" ? accel : ""));';
  main = replaceOnce(
    main,
    miningIpc,
    `${miningIpc}\n  ipcMain.handle("set-widget-hotkey", (_e, key, accel) =>\n    registerWidgetHotkey(String(key || ""), typeof accel === "string" ? accel : ""));\n  ipcMain.handle("list-widget-hotkeys", () => Object.keys(WIDGET_TOGGLES));`,
    'universal widget-hotkey IPC');
}

// Focus behavior: port upstream INTENT, not the Win32 mechanism. The verified Linux shell already
// implements the equivalent through hover-scoped ownership, exact game-focus return, text-entry
// ownership, dragging and arrange-mode lifetimes.
if (!main.includes('ARCHVERSE_UPSTREAM_0144_FOCUS_BEHAVIOR')) {
  const focusAnchor = 'function applyMouse() {';
  must(main.includes(focusAnchor), 'applyMouse focus seam missing');
  main = main.replace(focusAnchor, `// ARCHVERSE_UPSTREAM_0144_FOCUS_BEHAVIOR
// Windows upstream uses WS_EX_NOACTIVATE/setFocusable(false). Linux intentionally keeps its
// verified explicit ownership contract instead: ordinary widget clicks do not retain focus;
// typing, dragging and arrange mode own focus only for their explicit lifetime, then the exact
// pre-overlay Star Citizen window is restored.
${focusAnchor}`);
}

// Preload: Chat and Settings already exist in the verified payload; add only Hauling plus the new
// generic widget-hotkey API. Fail if the supposedly verified existing bridge is absent.
must(preload.includes('setChat:'), 'verified preload social Chat bridge missing');
must(preload.includes('setConfig:'), 'verified preload Settings bridge missing');
if (!preload.includes('setHauling:')) {
  const b = '  onBattagliaVisible: (cb) => ipcRenderer.on("overlay:battaglia-visible", (_e, s) => cb(s)),';
  preload = replaceOnce(
    preload,
    b,
    `${b}\n  setHauling: (on) => ipcRenderer.send("app:set-hauling", !!on),\n  onHaulingVisible: (cb) => ipcRenderer.on("overlay:hauling-visible", (_e, s) => cb(s)),`,
    'preload Hauling bridge');
}
if (!preload.includes('setWidgetHotkey:')) {
  const cfg = '    setOverlayHotkey: (a) => ipcRenderer.invoke("set-overlay-hotkey", a),';
  preload = replaceOnce(
    preload,
    cfg,
    `${cfg}\n    setWidgetHotkey: (key, a) => ipcRenderer.invoke("set-widget-hotkey", key, a),\n    listWidgetHotkeys: () => ipcRenderer.invoke("list-widget-hotkeys"),`,
    'preload universal widget-hotkey bridge');
}

// Fail-loud final proof. These are the contracts that make a mechanically successful port unsafe
// to ship when absent.
for (const marker of [
  'ARCHVERSE_UPSTREAM_0144_HAULING',
  'hauling: haulingVisible',
  'app:set-hauling',
  'overlay:hauling-visible',
  'haulingOpen',
  'label: "Hauling"',
  'ARCHVERSE_UPSTREAM_0144_WIDGET_HOTKEYS',
  'set-widget-hotkey',
  'list-widget-hotkeys',
  'ARCHVERSE_UPSTREAM_0144_FOCUS_BEHAVIOR',
  'ARCHVERSE_LINUX_HOVER_SCOPED_LATCH',
  'ARCHVERSE_LINUX_GAME_FOCUS_HANDOFF',
  'ARCHVERSE_LINUX_DRAG_LOCK_WATCHDOG',
  'chat: chatVisible',
  'config: configWidgetVisible',
  'function openSettingsSurface()',
]) must(main.includes(marker), `required shell contract missing: ${marker}`);
must(!main.includes('overlay.setFocusable(false)'), 'Win32 NOACTIVATE mechanism leaked into Linux shell');
for (const marker of ['setHauling:', 'setChat:', 'setConfig:', 'setWidgetHotkey:', 'claimInteraction:', 'releaseInteraction:']) {
  must(preload.includes(marker), `required preload contract missing: ${marker}`);
}

fs.writeFileSync(mainPath, main);
fs.writeFileSync(preloadPath, preload);
console.log('Upstream 0.1.44+ behavior ported onto verified Linux shell:', root);
