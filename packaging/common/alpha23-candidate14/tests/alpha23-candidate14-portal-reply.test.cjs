"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root,
  "app/electron/native-portal-pipewire.c"), "utf8");

assert.match(source, /g_variant_lookup_value\(results,\s*\n?\s*"session_handle", NULL\)/,
  "session_handle must be inspected before enforcing a reply type");
assert.match(source, /G_VARIANT_TYPE_STRING/,
  "CreateSession must accept the specification-required D-Bus string");
assert.match(source, /G_VARIANT_TYPE_OBJECT_PATH/,
  "CreateSession should defensively accept an object-path-typed reply");
assert.match(source, /g_variant_is_object_path\(handle\)/,
  "session_handle contents must be validated as an object path");
assert.match(source, /g_variant_get_type_string\(value\)/,
  "invalid portal replies must report their actual D-Bus type");
assert.doesNotMatch(source,
  /g_variant_lookup_value\(create_results,\s*\n?\s*"session_handle",\s*G_VARIANT_TYPE_OBJECT_PATH\)/,
  "the Candidate 13 object-path-only lookup must not return");
for (const marker of ["spec string", "object path", "wrong type", "invalid path",
  "missing value"]) {
  assert.match(source, new RegExp(marker), `compiled reply self-test missing: ${marker}`);
}

function sha(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
const gamescopeFiles = new Map([
  ["persistent-gamescope-pipewire.cjs",
    "831fdf3584cfa0cd0df15076ab0d6a5c5e010c842b12f08bf3c87ec82333b07b"],
  ["native-linux-gamescope-pipewire.cjs",
    "78d53614e05e7909ece4c46eb94ace524251918f5e5f9d1e3e78c5b5e4d81cd4"],
]);
for (const [name, expected] of gamescopeFiles) {
  const file = path.join(root, "app/electron", name);
  if (fs.existsSync(file))
    assert.equal(sha(file), expected, `Gamescope file changed: ${name}`);
}

console.log("Candidate 14 KDE string session handle, validation, diagnostics, and Gamescope isolation passed");
