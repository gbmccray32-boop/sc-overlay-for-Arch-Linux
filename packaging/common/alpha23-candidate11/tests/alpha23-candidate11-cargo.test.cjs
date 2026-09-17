"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { classifyMiningOcrLines } = require("../app/electron/mining-result-transport.cjs");

const bundle = fs.readFileSync(path.join(__dirname, "../app/server/server.mjs"), "utf8");
const marker = bundle.indexOf("// ARCHVERSE_LINUX_MINING_CONTEXT_SAFE_RS_ADMISSION");
const start = bundle.lastIndexOf("function isNavigationCoordinateText(text)", marker);
const end = bundle.indexOf("function parseDuration(text)", marker);
assert(start >= 0 && marker > start && end > marker, "extract the actual packaged sidecar classifier");
const sidecar = vm.createContext({ MAX_VALID_SIGNATURE: 120000 });
vm.runInContext(bundle.slice(start, end), sidecar);

const line = (text, x = 300, y = 60) => ({ text, x, y, w: 140, h: 26 });
const cases = [
  { lines: [line("EXODUS | Volume:6066000uScU | X 16,000")], accepted: false },
  { lines: [line("EXODUS | Volume:6066000μSCU"), line("l 16,000", 320, 110)], accepted: false },
  { lines: [line("ABRADE SCRAPER MODULE | Volume:510 µSCU"), line("21,250", 320, 110)], accepted: false },
  { lines: [line("21,350 | UNKNOWN | 90° 13.3km STRONG")], accepted: true, signature: 21350 },
  { lines: [line("2,000 | 90° STRONG")], accepted: true, signature: 2000 },
];
for (const { lines, accepted, signature } of cases) {
  const local = classifyMiningOcrLines(lines, { width: 700 });
  const authoritative = sidecar.bestSignatureLine(lines, 350);
  assert.equal(local.kind === "mineable", accepted, `local admission for ${lines.map(item => item.text)}`);
  assert.equal(!!authoritative, accepted, `sidecar admission for ${lines.map(item => item.text)}`);
  if (accepted) {
    assert.equal(local.signature, signature);
    assert.equal(authoritative.sig, signature);
  }
}
console.log("Candidate 11 local and packaged sidecar reject the field cargo quantities and keep genuine RS reads");
