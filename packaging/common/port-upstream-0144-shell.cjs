#!/usr/bin/env node
'use strict';

// Semantic transplant for upstream 0.1.44+ shell behavior onto the verified ArchVerse Linux
// Electron runtime. This deliberately does NOT copy upstream main.cjs: its NOACTIVATE implementation
// is Win32-specific and replacing the Linux shell would regress held-F, X11/Gamescope focus handoff,
// native pointer forwarding, and click-through ownership.

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
function replaceRegexOnce(text, re, replacement, label) {
  if (typeof replacement === 'string' && text.includes(replacement)) return text;
  const matches = [...text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))];
  must(matches.length === 1, `${label}: expected exactly one regex anchor, found ${matches.length}`);
  return text.replace(re, replacement);
}

// ---------------------------------------------------------------------------
// 1. Shell-owned widgets added since the verified Linux base: Hauling, social Chat and Settings.
// ---------------------------------------------------------------------------
if (!main.includes('ARCHVERSE_UPSTREAM_0144_HAULING')) {
  main = replaceOnce(main,
    'let battagliaVisible = false;',
    'let battagliaVisible = false;\nlet haulingVisible = false; // ARCHVERSE_UPSTREAM_0144_HAULING\nlet chatVisible = false; // upstream social Chat widget, distinct from Linux Twitch chat\nlet configWidgetVisible = false; // upstream in-canvas Settings widget; never persisted open',
    'new widget visibility state');

  // Every widget-state snapshot that already carries Battaglia must also carry the new widgets.
  main = main.replace(/battaglia: battagliaVisible,(?! hauling:)/g,
    'battaglia: battagliaVisible, hauling: haulingVisible, chat: chatVisible, config: configWidgetVisible,');

  const toggleRe = /function toggleBattaglia\(\)\s*\{\s*setBattagliaVisible\(!battagliaVisible\);\s*\}/;
  const toggleMatch = main.match(toggleRe);
  must(toggleMatch, 'Battaglia toggle anchor missing');
  main = main.replace(toggleRe, `${toggleMatch[0]}
function sendHaulingVisible(state){ try { overlay?.webContents.send("overlay:hauling-visible", state); } catch {} }
function setHaulingVisible(on){ haulingVisible=!!on; sendHaulingVisible({on:haulingVisible}); postConfig({haulingOpen:haulingVisible}); pushWidgetStates(); refreshTray(); }
function toggleHauling(){ setHaulingVisible(!haulingVisible); }
function sendChatVisible(state){ try { overlay?.webContents.send("overlay:chat-visible", state); } catch {} }
function setChatVisible(on){ chatVisible=!!on; sendChatVisible({on:chatVisible}); postConfig({chatOpen:chatVisible}); pushWidgetStates(); refreshTray(); }
function toggleChat(){ setChatVisible(!chatVisible); }
function sendConfigWidgetVisible(state){ try { overlay?.webContents.send("overlay:config-visible", state); } catch {} }
function setConfigWidgetVisible(on){ configWidgetVisible=!!on; sendConfigWidgetVisible({on:configWidgetVisible}); pushWidgetStates(); refreshTray(); }
// Upstream's Settings surface is the canvas widget when the overlay exists, with the standalone
// BrowserWindow retained only as the recovery path when the canvas is disabled or unavailable.
function openSettingsSurface(){
  if (overlayEnabled && overlay && !overlay.isDestroyed()) setConfigWidgetVisible(true);
  else openConfig();
}`);

  // Hauling and social Chat persist open/closed. Settings deliberately starts closed each launch.
  main = main.replace(/(^\s*)battagliaVisible = c\.battagliaOpen === true;/gm,
    '$&\n$1haulingVisible = c.haulingOpen === true;\n$1chatVisible = c.chatOpen === true;');

  // The verified Linux base pushes dedicated visibility events after its canvas finishes loading.
  // Add all three new widgets at that exact seam, then the existing aggregate snapshot follows.
  const initialRe = /(^\s*)sendBattagliaVisible\?\.\(\{ on: battagliaVisible \}\);/m;
  const initialMatch = main.match(initialRe);
  must(initialMatch, 'initial Battaglia visibility replay anchor missing');
  main = main.replace(initialRe,
    '$&\n$1sendHaulingVisible({ on: haulingVisible });\n$1sendChatVisible({ on: chatVisible });\n$1sendConfigWidgetVisible({ on: configWidgetVisible });');

  const trayNeedle = '{ label: "Event Tracker", type: "checkbox", checked: battagliaVisible, click: toggleBattaglia },';
  must(main.includes(trayNeedle), 'tray Event Tracker anchor missing');
  main = main.replace(trayNeedle,
    `${trayNeedle}\n      { label: "Hauling", type: "checkbox", checked: haulingVisible, click: toggleHauling },`);

  const ipcNeedle = 'ipcMain.on("app:set-battaglia", (_e,on)=>setBattagliaVisible(!!on));';
  const ipcNeedleSpaced = 'ipcMain.on("app:set-battaglia", (_e, on) => setBattagliaVisible(!!on));';
  const ipcTail = '\n  ipcMain.on("app:set-hauling", (_e, on) => setHaulingVisible(!!on));\n  ipcMain.on("app:set-chat", (_e, on) => setChatVisible(!!on));\n  ipcMain.on("app:set-config", (_e, on) => setConfigWidgetVisible(!!on));';
  if (main.includes(ipcNeedle)) {
    main = main.replace(ipcNeedle, `${ipcNeedle}${ipcTail}`);
  } else if (main.includes(ipcNeedleSpaced)) {
    main = main.replace(ipcNeedleSpaced, `${ipcNeedleSpaced}${ipcTail}`);
  } else {
    throw new Error('0.1.44 Linux shell port: app:set-battaglia IPC anchor missing');
  }
}

// ---------------------------------------------------------------------------
// 2. Universal per-widget hotkeys, without changing Linux's platform-owned F/Shift+F6 contract.
//    Existing legacy per-widget registrations remain the compatibility path; widgetHotkeys only
//    override a key when the user explicitly assigns one.
// ---------------------------------------------------------------------------
if (!main.includes('ARCHVERSE_UPSTREAM_0144_WIDGET_HOTKEYS')) {
  const insertAt = main.indexOf('let interactAccel = null;');
  must(insertAt >= 0, 'interaction hotkey state anchor missing');
  const hotkeysBlock = `// ARCHVERSE_UPSTREAM_0144_WIDGET_HOTKEYS
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
  notepad: (a) => typeof registerNotepadHotkey === "function" ? registerNotepadHotkey(a) : registerGenericWidgetHotkey("notepad", a),
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
  try { applyWidgetHotkeys(JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, "config.json"), "utf8"))); } catch { /* defaults: no new hotkeys */ }
}
`;
  main = main.slice(0, insertAt) + hotkeysBlock + '\n' + main.slice(insertAt);

  const startupAnchor = 'registerFabClaimHotkey(fabClaimKey);';
  must(main.includes(startupAnchor), 'startup hotkey registration anchor missing');
  main = main.replace(startupAnchor, `${startupAnchor}\n    applyWidgetHotkeysFromDisk();`);

  const ipcAnchor = 'ipcMain.handle("set-mining-hotkey", (_e, accel) =>\n    registerMiningHotkey(typeof accel === "string" ? accel : ""));';
  must(main.includes(ipcAnchor), 'set-mining-hotkey IPC anchor missing');
  main = main.replace(ipcAnchor, `${ipcAnchor}\n  ipcMain.handle("set-widget-hotkey", (_e, key, accel) =>\n    registerWidgetHotkey(String(key || ""), typeof accel === "string" ? accel : ""));\n  ipcMain.handle("list-widget-hotkeys", () => Object.keys(WIDGET_TOGGLES));`);
}

// If a future verified base already has upstream's generic map, make sure Hauling participates.
if (main.includes('const WIDGET_TOGGLES = {') && !/hauling:\s*\(\)\s*=>\s*toggleHauling\(\)/.test(main)) {
  main = replaceRegexOnce(main,
    /(\s*battaglia:\s*\(\)\s*=>\s*toggleBattaglia\(\),)/,
    '$1\n  hauling: () => toggleHauling(),',
    'existing widget toggle map hauling entry');
}

// ---------------------------------------------------------------------------
// 3. Linux focus behavior: port the INTENT, not WS_EX_NOACTIVATE.
// ---------------------------------------------------------------------------
if (!main.includes('ARCHVERSE_UPSTREAM_0144_FOCUS_BEHAVIOR')) {
  const focusAnchor = 'function applyMouse() {';
  must(main.includes(focusAnchor), 'applyMouse focus seam missing');
  main = main.replace(focusAnchor, `// ARCHVERSE_UPSTREAM_0144_FOCUS_BEHAVIOR
// Upstream Win32 uses WS_EX_NOACTIVATE while Star Citizen is foreground. Linux intentionally
// does not call overlay.setFocusable(false): KDE/X11/Gamescope need the verified explicit
// ownership model. Non-keyboard clicks use the existing hover-scoped latch and restore the exact
// pre-overlay game window when ownership ends; typing, dragging, and arrange mode retain focus
// only for their explicit lifetime.
${focusAnchor}`);
}

// ---------------------------------------------------------------------------
// 4. Preload bridge additions required by current upstream renderer/config pages.
// ---------------------------------------------------------------------------
if (!preload.includes('setHauling:')) {
  const b = '  onBattagliaVisible: (cb) => ipcRenderer.on("overlay:battaglia-visible", (_e, s) => cb(s)),';
  must(preload.includes(b), 'preload Battaglia visibility anchor missing');
  preload = preload.replace(b, `${b}\n  setHauling: (on) => ipcRenderer.send("app:set-hauling", !!on),\n  onHaulingVisible: (cb) => ipcRenderer.on("overlay:hauling-visible", (_e, s) => cb(s)),`);
}
if (!preload.includes('setChat:')) {
  const h = '  onHaulingVisible: (cb) => ipcRenderer.on("overlay:hauling-visible", (_e, s) => cb(s)),';
  must(preload.includes(h), 'preload Hauling visibility anchor missing');
  preload = preload.replace(h, `${h}\n  setChat: (on) => ipcRenderer.send("app:set-chat", !!on),\n  onChatVisible: (cb) => ipcRenderer.on("overlay:chat-visible", (_e, s) => cb(s)),`);
}
if (!preload.includes('setConfig:')) {
  const c = '  onChatVisible: (cb) => ipcRenderer.on("overlay:chat-visible", (_e, s) => cb(s)),';
  must(preload.includes(c), 'preload Chat visibility anchor missing');
  preload = preload.replace(c, `${c}\n  setConfig: (on) => ipcRenderer.send("app:set-config", !!on),\n  onConfigVisible: (cb) => ipcRenderer.on("overlay:config-visible", (_e, s) => cb(s)),`);
}
if (!preload.includes('setWidgetHotkey:')) {
  const cfg = '    setOverlayHotkey: (a) => ipcRenderer.invoke("set-overlay-hotkey", a),';
  must(preload.includes(cfg), 'preload config hotkey anchor missing');
  preload = preload.replace(cfg, `${cfg}\n    setWidgetHotkey: (key, a) => ipcRenderer.invoke("set-widget-hotkey", key, a),\n    listWidgetHotkeys: () => ipcRenderer.invoke("list-widget-hotkeys"),`);
}

// ---------------------------------------------------------------------------
// Fail-loud verification. A candidate that cannot prove these seams never reaches packaging.
// ---------------------------------------------------------------------------
must(main.includes('ARCHVERSE_UPSTREAM_0144_HAULING'), 'Hauling shell marker missing');
must(main.includes('hauling: haulingVisible'), 'Hauling missing from widget state snapshots');
must(main.includes('chat: chatVisible'), 'social Chat missing from widget state snapshots');
must(main.includes('config: configWidgetVisible'), 'Settings widget missing from widget state snapshots');
must(main.includes('app:set-hauling'), 'Hauling toggle IPC missing');
must(main.includes('app:set-chat'), 'social Chat toggle IPC missing');
must(main.includes('app:set-config'), 'Settings widget toggle IPC missing');
must(main.includes('overlay:hauling-visible'), 'Hauling visibility event missing');
must(main.includes('overlay:chat-visible'), 'social Chat visibility event missing');
must(main.includes('overlay:config-visible'), 'Settings visibility event missing');
must(main.includes('haulingOpen'), 'Hauling persistence missing');
must(main.includes('chatOpen'), 'social Chat persistence missing');
must(main.includes('function openSettingsSurface()'), 'Settings canvas/fallback router missing');
must(main.includes('label: "Hauling"'), 'Hauling tray entry missing');
must(main.includes('ARCHVERSE_UPSTREAM_0144_WIDGET_HOTKEYS'), 'universal widget hotkey marker missing');
must(main.includes('set-widget-hotkey'), 'generic widget hotkey IPC missing');
must(main.includes('list-widget-hotkeys'), 'widget hotkey list IPC missing');
must(main.includes('ARCHVERSE_UPSTREAM_0144_FOCUS_BEHAVIOR'), 'Linux focus behavior marker missing');
must(!main.includes('overlay.setFocusable(false)'), 'Win32 NOACTIVATE mechanism leaked into Linux shell');
must(main.includes('ARCHVERSE_LINUX_HOVER_SCOPED_LATCH'), 'verified Linux hover-scoped interaction contract missing');
must(main.includes('ARCHVERSE_LINUX_GAME_FOCUS_HANDOFF'), 'verified Linux game focus handoff missing');
must(main.includes('ARCHVERSE_LINUX_DRAG_LOCK_WATCHDOG'), 'verified Linux drag watchdog missing');
must(preload.includes('setHauling:'), 'preload Hauling bridge missing');
must(preload.includes('setChat:'), 'preload social Chat bridge missing');
must(preload.includes('setConfig:'), 'preload Settings bridge missing');
must(preload.includes('setWidgetHotkey:'), 'preload widget hotkey bridge missing');
must(preload.includes('claimInteraction:'), 'Linux interaction claim bridge missing');
must(preload.includes('releaseInteraction:'), 'Linux interaction release bridge missing');

fs.writeFileSync(mainPath, main);
fs.writeFileSync(preloadPath, preload);
console.log('Upstream 0.1.44+ behavior ported onto verified Linux shell:', root);
