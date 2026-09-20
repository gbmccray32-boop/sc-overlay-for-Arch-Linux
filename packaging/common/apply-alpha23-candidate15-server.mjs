#!/usr/bin/env node
import fs from "node:fs";

function must(condition, message) {
  if (!condition) throw new Error(`Candidate 15 sidecar patch: ${message}`);
}

function replaceBetween(source, startText, endText, replacement, label) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  must(start >= 0 && end > start, `${label} boundaries missing`);
  return source.slice(0, start) + replacement + source.slice(end);
}

export function applyCandidate15Server(source) {
  must(source.includes("ARCHVERSE_LINUX_MINING_CONTEXT_SAFE_RS_ADMISSION"), "Candidate 14 Mining parser contract missing");
  must(!source.includes("ARCHVERSE_ALPHA23_REFINERY_READER_V2"), "server is already patched");

  const duration = `// ARCHVERSE_ALPHA23_REFINERY_READER_V2
function parseDuration(text) {
  const t = text.replace(/[Il|]/g, "1").replace(/[ODo]/g, "0").replace(/[Zz]/g, "2").replace(/[gq]/g, "9").replace(/B/g, "8");
  const clock = /(?:^|\\D)(\\d{1,3})\\s*[:.]\\s*(\\d{1,2})\\s*[:.]\\s*(\\d{1,2})(?!\\d)/.exec(t);
  if (clock) {
    const hours = Number(clock[1]), minutes = Number(clock[2]), seconds = Number(clock[3]);
    if (minutes < 60 && seconds < 60) return hours * 3600 + minutes * 60 + seconds;
  }
  const d = /(\\d+)\\s*d(?![a-z])/i.exec(t)?.[1];
  const h = /(\\d+)\\s*h/i.exec(t)?.[1];
  const m = /(\\d+)\\s*m(?![a-z])/i.exec(t)?.[1];
  const s = /(\\d+)\\s*s(?![a-z])/i.exec(t)?.[1];
  if (d == null && h == null && m == null && s == null) return null;
  return Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
}
function compactRefineryOcrText(text) {
  return text.toUpperCase().replace(/[|1]/g, "I").replace(/0/g, "O").replace(/[^A-Z]/g, "");
}
function isRefineryTitle(text) {
  const compact = compactRefineryOcrText(text);
  return compact.includes("REFINEMENTCENTER") || /^REFIN[A-Z]{2,7}CENT[A-Z]{1,4}$/.test(compact) || /REFIN.MENTCENT.RE/.test(compact);
}
function isTimeRemaining(text) {
  const compact = compactRefineryOcrText(text);
  return compact.includes("TIMEREMAINING") || /TIM.REMA.N.NG/.test(compact);
}
function refineryReadDiagnostic(ocr) {
  const titleFound = ocr.lines.some((line) => isRefineryTitle(line.text)) || isRefineryTitle(ocr.lines.map((line) => line.text).join(" "));
  const timeLabels = ocr.lines.filter((line) => isTimeRemaining(line.text)).length;
  const durationLines = ocr.lines.filter((line) => parseDuration(line.text) != null).length;
  const reason = !titleFound ? "title-not-found" : timeLabels === 0 ? "time-remaining-not-found" : durationLines === 0 ? "duration-not-found" : "layout-not-matched";
  return { titleFound, timeLabels, durationLines, reason };
}
`;
  let output = replaceBetween(source, "function parseDuration(text) {", "var BACKTICK =", duration, "duration parser");

  const refinery = `if (lines.some((line) => isRefineryTitle(line.text)) || isRefineryTitle(joined)) {
    const anchor = lines.find((line) => isRefineryTitle(line.text));
    const stationText = anchor ? lines.filter((line) => Math.abs(line.y - anchor.y) < 26 && line.x < anchor.x - 80).sort((a, b) => a.x - b.x).pop()?.text.trim() ?? null : null;
    const station = stationText && /^[A-Z][A-Z0-9 '\u2019-]{3,24}$/i.test(stationText) ? stationText : null;
    const matchMaterial = (text) => text.trim().toUpperCase().split(/[^A-Z]+/).find((word) => REFINERY_MATERIALS.has(word)) ?? null;
    const raw = [];
    for (const label of lines.filter((line) => isTimeRemaining(line.text))) {
      const candidates = lines.map((line) => {
        const seconds = parseDuration(line.text);
        if (seconds == null || seconds <= 0) return null;
        const rowTolerance = Math.max(36, label.h * 2.5, line.h * 2.5);
        const sameRow = Math.abs(line.y + line.h / 2 - (label.y + label.h / 2)) <= rowTolerance;
        const right = sameRow && line.x >= label.x - 20 && line.x - label.x < 820;
        const below = line.y >= label.y - 10 && line.y - label.y < 220 && Math.abs(line.x + line.w / 2 - (label.x + label.w / 2)) < 480;
        if (line !== label && !right && !below) return null;
        const score = line === label ? -1e3 : right ? Math.abs(line.y - label.y) + Math.max(0, line.x - label.x) * 0.05 : 500 + Math.max(0, line.y - label.y) + Math.abs(line.x - label.x) * 0.05;
        return { line, seconds, score };
      }).filter(Boolean).sort((a, b) => a.score - b.score);
      const value = candidates[0];
      if (!value) continue;
      const matWord = lines.filter((line) => Math.abs(line.x - label.x) < 380 && line.y < label.y && matchMaterial(line.text)).sort((a, b) => a.y - b.y).map((line) => matchMaterial(line.text))[0];
      const material = matWord ? matWord.charAt(0) + matWord.slice(1).toLowerCase() : null;
      const yieldLine = lines.find((line) => /^\\d{1,4}\\.\\d+$/.test(line.text.trim()) && Math.abs(line.x - label.x) < 420 && line.y < label.y && line.y > label.y - 150);
      raw.push({ order: 0, remainingSec: value.seconds, remainingRaw: value.line.text.trim(), material, yieldScu: yieldLine ? Number(yieldLine.text) : null, _x: label.x });
    }
    raw.sort((a, b) => a._x - b._x).forEach((job, index) => job.order = index + 1);
    const jobs = raw.map(({ _x, ...job }) => job);
    if (jobs.length) return { kind: "refinery", station, jobs };
  }
  `;
  output = replaceBetween(output, "if (/refinement\\s+cent(?:er|re)/i.test(joined)) {", "if (SCAN_HUD.test(joined)) {", refinery, "refinery classifier");

  const rdMarker = "    const rd = result;\n";
  must(output.includes(rdMarker), "screen-read result marker missing");
  output = output.replace(rdMarker, `${rdMarker}    const refineryDiagnostic = body.ocrRegion === "refinery" && Array.isArray(body.lines) ? (() => {
      const diagnostic = refineryReadDiagnostic({ w: Number(body.w) || 0, h: Number(body.h) || 0, lines: body.lines });
      return { ...diagnostic, reason: rd.kind === "refinery" ? "accepted" : diagnostic.reason };
    })() : null;
`);
  const response = "res.end(JSON.stringify({ ...result, scanHud, rep: repRead, miningCommit, vehiclePresence: miningPresence }));";
  must(output.includes(response), "screen-read response marker missing");
  output = output.replace(response, "res.end(JSON.stringify({ ...result, scanHud, rep: repRead, miningCommit, vehiclePresence: miningPresence, refineryDiagnostic }));");
  return output;
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error("usage: apply-alpha23-candidate15-server.mjs <input-server> <output-server>");
  fs.writeFileSync(output, applyCandidate15Server(fs.readFileSync(input, "utf8")));
}
