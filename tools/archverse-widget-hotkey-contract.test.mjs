import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { assertNoWidgetHotkeyEditor, lockedWidgetKeys, lockWidgetHotkeySettings } from "./archverse-widget-hotkey-contract.mjs";

for (const file of ["overlay/canvas.js", "overlay/config.html", "electron/main.cjs", "electron/preload.cjs"]) {
  assertNoWidgetHotkeyEditor(fs.readFileSync(file, "utf8"));
}
for (const token of ["get-widget-hotkeys", "getWidgetHotkeys", "injectHotkeyRow",
  "startHotkeyCapture", "wcfg-hkrow", "hkPendingFocus", "SCHotkeyKeys"]) {
  assert.throws(() => assertNoWidgetHotkeyEditor(token), /contract forbids/);
}
const fixture = `  function applyArchVerseLinuxSettings() {
    setHotkeyDisplay("interact", "F");
  }
  async function clearHotkey(which) { writes++; }
  function startCaptureHotkey(which) { grabs++; }`;
const output = lockWidgetHotkeySettings(fixture);
assert.throws(() => lockWidgetHotkeySettings(""), /anchor changed/);
const context = vm.createContext({ linux: true, writes: 0, grabs: 0 });
vm.runInContext(`const ARCHVERSE_LINUX_DESKTOP = () => linux; ${output}`, context);
for (const key of lockedWidgetKeys) {
  await vm.runInContext(`clearHotkey(${JSON.stringify(key)})`, context);
  vm.runInContext(`startCaptureHotkey(${JSON.stringify(key)})`, context);
}
assert.equal(context.writes, 0);
assert.equal(context.grabs, 0);
context.linux = false;
await vm.runInContext('clearHotkey("mining")', context);
vm.runInContext('startCaptureHotkey("mining")', context);
assert.equal(context.writes, 1, "non-Linux behavior is retained");
assert.equal(context.grabs, 1, "positive control reaches the grab");
const server = fs.readFileSync("src/overlay-server.ts", "utf8");
const guard = server.match(/    if \(process.platform === "linux"\) \{\n      for \(const key of \["widgetHotkeys"[\s\S]*?\n    \}/)?.[0];
assert.ok(guard, "config API lock exists");
for (const platform of ["linux", "win32"]) {
  const body = { widgetHotkeys: { mining: "A" }, miningHotkey: "B", notepadHotkey: "C",
    bindingHotkey: "D", webViewHotkey: "E", miningAssistant: true };
  vm.runInNewContext(guard, { body, process: { platform } });
  assert.equal(body.miningAssistant, true, "unrelated settings remain writable");
  assert.equal("widgetHotkeys" in body, platform !== "linux");
  assert.equal("miningHotkey" in body, platform !== "linux");
}
console.log("PASS Linux widget-hotkey lock: source exclusion, seven negative controls, all widget guards, non-Linux positive controls");
