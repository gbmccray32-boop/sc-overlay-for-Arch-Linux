"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const { createExactX11Capture } = require("../app/electron/exact-x11-capture.cjs");
(async () => {
  let time = 0, fail = true;
  const calls = [];
  const image = { isEmpty: () => false };
  const capture = createExactX11Capture({
    run: async (_cmd, args, options) => {
      calls.push({ args, options });
      assert.equal(options.timeout, 750);
      assert.equal(options.killSignal, "SIGKILL");
      if (fail) throw new Error("MIT-SHM X_ShmGetImage BadMatch");
    }, decode: () => image, remove() {}, now: () => time, logger: { warn() {} },
  });
  const input = { key: "1:99:1234::0", xid: "1234", display: ":0", output: "/unused", env: {} };
  await assert.rejects(capture(input), /BadMatch/);
  assert.equal(calls.length, 2);
  assert(calls[0].args.includes("remote=false"));
  assert(calls[1].args.includes("remote=true"));
  await assert.rejects(capture(input), /cooling down/);
  assert.equal(calls.length, 2);
  time = 60000; fail = false;
  assert.equal(await capture(input), image);
  assert(calls[2].args.includes("remote=true"));
  assert.equal(await capture({ ...input, key: "new-session" }), image);
  assert(calls[3].args.includes("remote=false"));
  await assert.rejects(capture({ ...input, xid: "0" }), /XID/);
  const root = path.resolve(__dirname, "..");
  const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  assert.equal(sha(path.join(root, "app/electron/native-linux-gamescope-pipewire.cjs")), "78d53614e05e7909ece4c46eb94ace524251918f5e5f9d1e3e78c5b5e4d81cd4");
  const source = fs.readFileSync(path.join(root, "app/electron/capture.cjs"), "utf8");
  assert.match(source, /\["pipewire", "gamescope", "electron", "spectacle"\]/);
  assert.match(source, /\["window", "x11", "spectacle", "electron"\]/);
  console.log("Candidate 8 exact-XID recovery, cooldown, session reset, and Gamescope contracts passed");
})().catch(error => { console.error(error); process.exitCode = 1; });

