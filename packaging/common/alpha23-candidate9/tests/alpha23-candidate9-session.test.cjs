"use strict";
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createPersistentStarCitizenWindowCapture } = require("../app/electron/persistent-star-citizen-window.cjs");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const input = { gamePid: 42, gameStartTicks: "123", gameWindowId: "800" };
function fixture(create = createPersistentStarCitizenWindowCapture) {
  const children = [];
  let time = 100;
  const logs = [];
  const capture = create({
    requestTimeoutMs: 10, now: () => time,
    logger: { log: value => logs.push(value), warn: value => logs.push(value) },
    spawner() {
      const child = new EventEmitter();
      child.stdout = new EventEmitter(); child.stdout.setEncoding = () => {};
      child.stderr = new EventEmitter(); child.stderr.setEncoding = () => {};
      child.requests = []; child.kills = [];
      child.stdin = { write: line => child.requests.push(JSON.parse(line)) };
      child.kill = signal => child.kills.push(signal);
      child.send = message => child.stdout.emit("data", JSON.stringify(message) + "\n");
      children.push(child);
      return child;
    },
  });
  return { capture, children, logs, tick: value => { time = value; } };
}
(async () => {
  if (process.argv[2]) {
    const path = require("node:path");
    const { createPersistentStarCitizenWindowCapture: baselineCreate } = require(path.resolve(process.argv[2], "app/electron/persistent-star-citizen-window.cjs"));
    const old = fixture(baselineCreate);
    await assert.rejects(old.capture.capture(input), /warming/);
    old.children[0].send({ type: "ready", transport: "portal-pipewire-window" });
    for (let request = 0; request < 2; request++) {
      const rejected = assert.rejects(old.capture.capture(input), /exceeded/);
      await pause(15); await rejected;
    }
    assert.equal(old.children[0].kills.length, 1, "negative control must reproduce Candidate 8's destruction after two deadlines");
    old.capture.close();
    const xid = fixture(baselineCreate);
    await assert.rejects(xid.capture.capture(input), /warming/);
    xid.children[0].send({ type: "ready", transport: "portal-pipewire-window" });
    await assert.rejects(xid.capture.capture({ ...input, gameWindowId: "999" }), /warming/);
    assert.equal(xid.children.length, 2, "negative control must reproduce XID-based helper recreation");
    xid.capture.close();
  }
  const f = fixture();
  await assert.rejects(f.capture.capture(input), /warming/);
  const child = f.children[0];
  child.send({ type: "ready", transport: "portal-pipewire-window", width: 6270, height: 2160 });
  for (let sequence = 1; sequence <= 14; sequence++) {
    const promise = f.capture.capture({ ...input, gameWindowId: sequence % 2 ? "" : "999" });
    const rejection = assert.rejects(promise, /approved session retained/);
    await pause(15); await rejection;
    await assert.rejects(f.capture.capture(input), /one frame request/);
    assert.equal(child.requests.length, sequence, "one wire request remains outstanding after deadline");
    child.send({ type: "frame", id: child.requests.at(-1).id, sequence, capturedAt: 100, videoTime: sequence });
    assert.equal((await f.capture.capture(input)).sequence, sequence, "late frame remains usable");
  }
  assert.equal(f.children.length, 1, "14 timeouts and changing XIDs must never reopen the chooser");
  assert.deepEqual(child.kills, []);
  const stale = f.capture.capture(input);
  const staleRejection = assert.rejects(stale, /stale/);
  child.send({ type: "error", id: child.requests.at(-1).id, error: "frame stale" });
  await staleRejection;
  assert.deepEqual(child.kills, [], "temporary frame errors retain approval");
  const success = f.capture.capture(input);
  child.send({ type: "frame", id: child.requests.at(-1).id, sequence: 15, capturedAt: 100 });
  assert.equal((await success).sequence, 15);
  child.send({ type: "diagnostic", stage: "frame-summary", maxMs: { pngEncode: 900 } });
  assert(f.logs.some(value => value.includes("pngEncode")));
  child.send({ type: "error", id: 0, terminal: true, error: "approved track ended" });
  await assert.rejects(f.capture.capture({ ...input, gameWindowId: "1010" }), /disabled/);
  assert.equal(f.children.length, 1, "ended stream cannot prompt again for same process");
  await assert.rejects(f.capture.capture({ ...input, gameStartTicks: "124" }), /warming/);
  assert.equal(f.children.length, 2, "PID reuse with a new start time permits one new approval");
  f.capture.close();

  for (const failure of ["initialization", "exit", "spawn"]) {
    const g = fixture();
    await assert.rejects(g.capture.capture(input), /warming/);
    if (failure === "initialization") g.children[0].send({ type: "error", id: 0, error: "denied" });
    else if (failure === "exit") g.children[0].emit("exit", 3, null);
    else g.children[0].emit("error", new Error("spawn failed"));
    g.tick(100000);
    await assert.rejects(g.capture.capture({ ...input, gameWindowId: "" }), /disabled/);
    assert.equal(g.children.length, 1);
    await assert.rejects(g.capture.capture({ ...input, gamePid: 43 }), /warming/);
    assert.equal(g.children.length, 2);
    g.capture.close();
  }
  const h = fixture();
  await assert.rejects(h.capture.capture(input), /warming/);
  h.children[0].send({ type: "ready", transport: "portal-pipewire-window" });
  await assert.rejects(h.capture.capture({ ...input, gamePid: 43 }), /warming/);
  assert.equal(h.children.length, 2, "live session rebind must not inherit prior retry state");
  h.children[0].send({ type: "error", id: 0, error: "old session" });
  h.children[1].send({ type: "ready", transport: "portal-pipewire-window" });
  const p = h.capture.capture({ ...input, gamePid: 43 });
  h.children[1].send({ type: "frame", id: h.children[1].requests.at(-1).id, sequence: 1 });
  await p;
  h.capture.close();
  await assert.rejects(h.capture.capture(input), /closed/);
  const invalid = fixture();
  await assert.rejects(invalid.capture.capture({ gamePid: 0 }), /exact PID/);
  assert.equal(invalid.children.length, 0);
  invalid.capture.close();
  console.log("Candidate 9: timeout retention, late frames, single-flight, XID churn, terminal/denied/crashed session quarantine, PID reuse and rebind passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
