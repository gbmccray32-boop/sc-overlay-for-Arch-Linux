"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../app/electron/star-citizen-window-preload.cjs"), "utf8");
(async () => {
  const handlers = {}, sent = [], trackEvents = {};
  const timers = new Map();
  let timerId = 0;
  let time = 100, metrics = 0, pendingBlob;
  const video = { videoWidth: 6270, videoHeight: 2160, currentTime: 1, readyState: 2, play: async () => {}, addEventListener() {} };
  const track = { label: "approved Star Citizen", readyState: "live", addEventListener: (name, fn) => { trackEvents[name] = fn; } };
  const canvas = { getContext: () => ({ drawImage() {} }), toBlob: callback => { pendingBlob = callback; } };
  const writes = [];
  const ipc = { on: (name, fn) => { handlers[name] = fn; }, send: (name, value) => sent.push({ name, value }) };
  vm.runInNewContext(source, {
    require: name => name === "electron" ? { ipcRenderer: ipc } : name === "node:fs" ? {
      writeFileSync: (...args) => writes.push(args), renameSync() {},
    } : require(name),
    Buffer, process: { pid: 1 }, window: { isSecureContext: true }, location: { protocol: "file:" },
    navigator: { mediaDevices: { getDisplayMedia: async () => ({ getVideoTracks: () => [track] }) } },
    document: { createElement: type => type === "video" ? video : canvas },
    HTMLMediaElement: { HAVE_CURRENT_DATA: 2 },
    Date: { now: () => time }, performance: { now: () => metrics++ },
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: id => timers.delete(id),
  });
  await handlers["archverse-window-stream:init"]({}, { outputDirectory: "/unused", transport: "portal-pipewire-window" });
  assert(sent.some(message => message.name.endsWith(":ready")));
  const first = handlers["archverse-window-stream:capture"]({}, { id: 1 });
  await handlers["archverse-window-stream:capture"]({}, { id: 2 });
  assert(sent.some(message => message.value.id === 2 && /busy/.test(message.value.error)));
  timers.values().next().value();
  assert(sent.some(message => message.value.inFlight && message.value.stage === "png-encode"), "a blocked PNG callback must identify its stage before completion");
  const blob = { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
  pendingBlob(blob); await first;
  time = 10100;
  const repeated = handlers["archverse-window-stream:capture"]({}, { id: 3 });
  pendingBlob(blob); await repeated;
  const frames = sent.filter(message => message.name.endsWith(":frame"));
  assert.equal(frames.length, 2, "a repeated video frame must not destroy approval");
  assert.equal(frames[0].value.videoTime, frames[1].value.videoTime, "distinct-frame Mining guard retains identical tokens");
  assert.equal(frames[1].value.width, 6270, "Hauling full canvas survives capture");
  for (const stage of ["draw", "pngEncode", "blobRead", "fileWrite", "total"]) assert(stage in frames[1].value.stages);
  assert.equal(writes.length, 2);
  assert.equal(timers.size, 0, "frame diagnostics timers are cleaned up");
  assert(sent.some(message => message.value.stage === "frame-summary"));
  const deniedBlob = handlers["archverse-window-stream:capture"]({}, { id: 4 });
  pendingBlob(null); await deniedBlob;
  assert(sent.some(message => message.value.id === 4 && /png-encode/.test(message.value.error)));
  trackEvents.ended();
  assert(sent.some(message => message.value.terminal === true && /track ended/.test(message.value.error)));
  console.log("Candidate 9 actual preload: repeated-frame retention, busy bound, full canvas, frame-stage metrics, encoding errors and track-ended reporting passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
