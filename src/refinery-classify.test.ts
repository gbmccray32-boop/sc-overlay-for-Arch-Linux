import { classifyScreen, parseDuration, type CatalogEntry, type OcrLine, type OcrResult } from "./screen-read.js";

const catalog: CatalogEntry[] = [];
let failures = 0;

function equal(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
}

function classify(lines: OcrLine[]): ReturnType<typeof classifyScreen> {
  const ocr: OcrResult = { w: 3226, h: 1685, lines };
  return classifyScreen(ocr, catalog);
}

equal("days", parseDuration("1d 2h 3m 4s"), 93784);
equal("clock", parseDuration("14:53:20"), 53600);
equal("clock rejects impossible fields", parseDuration("14:73:20"), null);

equal("timer on same OCR line", classify([
  { text: "REFINEMENT CENTER", x: 1200, y: 80, w: 420, h: 34 },
  { text: "TIME REMAINING 14:53:20", x: 280, y: 980, w: 520, h: 34 },
]), {
  kind: "refinery", station: null,
  jobs: [{ order: 1, remainingSec: 53600, remainingRaw: "TIME REMAINING 14:53:20", material: null, yieldScu: null }],
});

equal("field RapidOCR merged timer and truncated station", classify([
  { text: "KI", x: 0, y: 13, w: 38, h: 30 },
  { text: "REFINEMENT CENTER CURRENTBALANCE: 10.O53,914 AUEC", x: 582, y: 20, w: 1138, h: 32 },
  { text: "LINDINIUM 305 480 317 163", x: 346, y: 217, w: 381, h: 21 },
  { text: "TIME REMAINING 56m 43s", x: 307, y: 707, w: 432, h: 35 },
]), {
  kind: "refinery", station: null,
  jobs: [{ order: 1, remainingSec: 3403, remainingRaw: "TIME REMAINING 56m 43s", material: "Lindinium", yieldScu: null }],
});

equal("timer below a fuzzy label and title", classify([
  { text: "REFINEMFNT CENTRE", x: 1200, y: 80, w: 420, h: 34 },
  { text: "T1ME REMA1NING", x: 280, y: 920, w: 300, h: 30 },
  { text: "1d 2h 3m", x: 320, y: 1000, w: 220, h: 32 },
]), {
  kind: "refinery", station: null,
  jobs: [{ order: 1, remainingSec: 93780, remainingRaw: "1d 2h 3m", material: null, yieldScu: null }],
});

equal("setup processing time is not a live job", classify([
  { text: "REFINEMENT CENTER", x: 1200, y: 80, w: 420, h: 34 },
  { text: "PROCESSING TIME", x: 280, y: 920, w: 300, h: 30 },
  { text: "14:53:20", x: 600, y: 920, w: 220, h: 32 },
]), { kind: "none" });

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
