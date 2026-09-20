"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRapidOcrClient } = require("../app/electron/rapidocr-client.cjs");

(async () => {
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "archverse-rapidocr-recycle-"));
const state = path.join(temp, "worker-count");
const worker = path.join(temp, "worker.cjs");
fs.writeFileSync(worker, `
const fs = require("node:fs");
const state = ${JSON.stringify(state)};
const generation = fs.existsSync(state) ? Number(fs.readFileSync(state, "utf8")) + 1 : 1;
fs.writeFileSync(state, String(generation));
process.on("message", (message) => {
  if (generation === 1) process.send({ type: "error", id: message.id, error: "RuntimeError: function signature mismatch" });
  else process.send({ type: "result", id: message.id, result: [{ text: "recovered" }] });
});
process.send({ type: "ready" });
`);

const logs = [];
const client = createRapidOcrClient({
  workerPath: worker, timeoutMs: 1000, maxQueue: 1, restartOnFailure: true,
  inheritStdio: false, logger: { warn: (message) => logs.push(String(message)), error: () => {} },
});
try {
  await assert.rejects(client.detect("first.png"), /function signature mismatch/);
  const recovered = await client.detect("second.png");
  assert.deepEqual(recovered, [{ text: "recovered" }]);
  assert.equal(client.restartCount(), 1);
  assert.ok(logs.some((line) => line.includes("recycling worker")));
} finally {
  client.close();
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log("Candidate 15 recycles a live but corrupted RapidOCR worker and recovers on the next frame");
})().catch((error) => { console.error(error); process.exit(1); });
