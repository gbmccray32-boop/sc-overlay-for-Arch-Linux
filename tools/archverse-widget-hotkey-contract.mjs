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
