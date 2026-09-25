import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { lockWidgetHotkeyIpc, lockWidgetHotkeySettings } from "./archverse-widget-hotkey-contract.mjs";

const root = process.argv[2];
if (!root) throw new Error("usage: node tools/archverse-widget-hotkey-package.test.mjs <candidate18-root>");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
assert.equal(JSON.parse(read("app/package.json")).version, "0.1.47-r31.alpha23.candidate18");
const provenance = JSON.parse(read("ALPHA23-PROVENANCE.json"));
for (const [file, wanted] of Object.entries(provenance.protectedFiles)) {
  const actual = createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
  assert.equal(actual, wanted, `Candidate 18 protected baseline: ${file}`);
}
const main = read("app/electron/main.cjs");
const patched = lockWidgetHotkeyIpc(main);
assert.throws(() => lockWidgetHotkeyIpc(patched), /anchor changed/, "repeat application must fail closed");
assert.throws(() => lockWidgetHotkeyIpc(main.replace('set-mining-hotkey', 'changed-channel')), /anchor changed/);
const pattern = /  ipcMain\.handle\("set-(?:binding|webview|mining|widget|notepad)-hotkey",[\s\S]*?\);/g;
const before = main.match(pattern), after = patched.match(pattern);
assert.equal(before.length, 5); assert.equal(after.length, 5);
assert.equal(main.replace(pattern, ""), patched.replace(pattern, ""), "non-editor code changed");
for (const platform of ["linux", "win32"]) {
  const handlers = new Map(), calls = [];
  const context = { process: { platform }, ipcMain: { handle: (key, fn) => handlers.set(key, fn) } };
  for (const name of ["Binding", "WebView", "Mining", "Widget", "Notepad"]) context[`register${name}Hotkey`] = (...args) => { calls.push(args); return { ok: true }; };
  vm.runInNewContext(after.join("\n"), context);
  for (const [channel, handler] of handlers) {
    const result = channel === "set-widget-hotkey" ? handler(null, "mining", "A") : handler(null, "A");
    assert.equal(result.ok, platform !== "linux", channel);
  }
  assert.equal(calls.length, platform === "linux" ? 0 : 5);
}
const settings = lockWidgetHotkeySettings(read("app/server/overlay/config.html"));
assert.ok(settings.includes("ARCHVERSE_LINUX_WIDGET_HOTKEY_LOCK"));
console.log("PASS packaged hotkey patch: protected baseline, five Linux IPC refusals, Windows positive controls, unchanged non-editor code, settings anchors");
