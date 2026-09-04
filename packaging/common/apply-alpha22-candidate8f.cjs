#!/usr/bin/env node
"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const zlib = require("node:zlib");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = process.argv[2];
if (!root) throw new Error("usage: apply-alpha22-candidate8f.cjs <staged-candidate8e-root>");
const must = (v, m) => { if (!v) throw new Error(`Candidate 8f apply: ${m}`); };
const here = __dirname;
const packagePath = path.join(root, "app/package.json");
const capturePath = path.join(root, "app/electron/capture.cjs");
const serverPath = path.join(root, "app/server/server.mjs");
for (const p of [packagePath, capturePath, serverPath]) must(fs.existsSync(p), `missing ${path.relative(root, p)}`);

const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
must(String(pkg.version || "") === "0.1.44-r31.alpha22.candidate8e", `expected exact Candidate 8e base, got ${pkg.version}`);
const beforeCapture = fs.readFileSync(capturePath, "utf8");
const beforeServer = fs.readFileSync(serverPath, "utf8");
must(beforeCapture.includes("ARCHVERSE_LINUX_PIPEWIRE_MINING_VISION_CADENCE"), "Candidate 8e Mining vision marker missing");
must(beforeCapture.includes("ARCHVERSE_LINUX_PIPEWIRE_RECOVERY_STATE_V2"), "PipeWire recovery marker missing");
must(beforeCapture.includes('method: "pipewire-radar+rs"'), "Candidate 8e radar+RS authority marker missing");
must(beforeServer.includes("ARCHVERSE_LOCATION_SYNC_DURABLE_CONSUMER"), "Location Sync durable consumer marker missing");

const encoded = fs.readFileSync(path.join(here, "candidate8f.patch.gz.b64"), "utf8").replace(/\s+/g, "");
const patch = zlib.gunzipSync(Buffer.from(encoded, "base64"));
const digest = crypto.createHash("sha256").update(patch).digest("hex");
must(digest === "f9abf537099eb265a6681735784b7b7a7d2c23cf06c779b843438e5b7daf2b1b", `patch digest mismatch: ${digest}`);
const tmpPatch = path.join(os.tmpdir(), `archverse-candidate8f-${process.pid}.patch`);
try {
  fs.writeFileSync(tmpPatch, patch);
  const r = spawnSync("patch", ["-p1", "--fuzz=0", "-i", tmpPatch], { cwd: root, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`zero-fuzz patch failed\n${r.stdout || ""}\n${r.stderr || ""}`);
} finally {
  try { fs.unlinkSync(tmpPatch); } catch {}
}

const check = spawnSync(process.execPath, [path.join(here, "candidate8f-vehicle-gate-selftest.mjs"), root], { encoding: "utf8" });
process.stdout.write(check.stdout || "");
process.stderr.write(check.stderr || "");
if (check.status !== 0) process.exit(check.status || 1);
console.log(`Candidate 8f zero-fuzz patch applied; sha256=${digest}`);
