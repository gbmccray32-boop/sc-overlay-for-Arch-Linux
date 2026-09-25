/** Linux widget hotkeys are read-only in official builds. */
export const lockedWidgetKeys = ["binding", "mining", "webView", "notepad",
  "party", "battaglia", "hauling", "logView", "verseFinder", "chat",
  "twitchChat", "scFeed", "unlockAlert", "config"];

export function assertNoWidgetHotkeyEditor(text) {
  for (const token of ["get-widget-hotkeys", "getWidgetHotkeys", "injectHotkeyRow",
    "startHotkeyCapture", "wcfg-hkrow", "hkPendingFocus", "SCHotkeyKeys"]) {
    if (text.includes(token)) throw new Error(`Linux widget-hotkey contract forbids ${token}`);
  }
}

/** Patch only editing IPC handlers; leave startup registration and held F intact. */
export function lockWidgetHotkeyIpc(main) {
  assertNoWidgetHotkeyEditor(main);
  for (const [channel, fn, args] of [
    ["binding", "registerBindingHotkey", 'typeof accel === "string" ? accel : ""'],
    ["webview", "registerWebViewHotkey", 'typeof accel === "string" ? accel : ""'],
    ["mining", "registerMiningHotkey", 'typeof accel === "string" ? accel : ""'],
    ["widget", "registerWidgetHotkey", 'String(key || ""), typeof accel === "string" ? accel : ""'],
    ["notepad", "registerNotepadHotkey", 'typeof accel === "string" ? accel : ""'],
  ]) {
    const params = channel === "widget" ? "_e, key, accel" : "_e, accel";
    const from = `  ipcMain.handle("set-${channel}-hotkey", (${params}) =>\n    ${fn}(${args}));`;
    if (main.split(from).length !== 2) throw new Error(`Widget-hotkey IPC anchor changed: ${channel}`);
    const to = `  ipcMain.handle("set-${channel}-hotkey", (${params}) =>\n    process.platform === "linux"\n      ? { ok: false, error: "Widget hotkey editing is disabled by the Linux stability contract." }\n      : ${fn}(${args}));`;
    main = main.replace(from, to);
  }
  return main;
}

export function lockWidgetHotkeySettings(html) {
  assertNoWidgetHotkeyEditor(html);
  const replace = (from, to) => {
    if (html.split(from).length !== 2) throw new Error(`Widget-hotkey anchor changed: ${from}`);
    html = html.replace(from, to);
  };
  replace('  function applyArchVerseLinuxSettings() {',
    `  // ARCHVERSE_LINUX_WIDGET_HOTKEY_LOCK\n  const lockedWidgetHotkeys = new Set(${JSON.stringify(lockedWidgetKeys)});\n  function applyArchVerseLinuxSettings() {`);
  replace('    setHotkeyDisplay("interact", "F");',
    `    for (const key of lockedWidgetHotkeys) {\n      const h = HOTKEYS[key];\n      if (!h) continue;\n      const button = document.getElementById(h.btn);\n      if (button) { button.disabled = true; button.title = "Widget hotkey editing is disabled by the Linux stability contract."; }\n      const clear = document.getElementById(h.input + "Clear");\n      if (clear) clear.hidden = true;\n    }\n    setHotkeyDisplay("interact", "F");`);
  for (const signature of ['  async function clearHotkey(which) {', '  function startCaptureHotkey(which) {']) {
    replace(signature, signature + '\n    if (ARCHVERSE_LINUX_DESKTOP() && lockedWidgetHotkeys.has(which)) return;');
  }
  return html;
}
