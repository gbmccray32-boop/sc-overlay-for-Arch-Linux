/** Linux-only source patch for the current upstream screen reader.
 *
 * RapidOCR can split a signature into same-row tokens ("18" + "000") or replace the thousands
 * separator with whitespace. Keep upstream as the source of truth and change only that recovery
 * behavior at bundle time.
 */
function must(cond, msg) {
  if (!cond) throw new Error(`ArchVerse screen-read patch: ${msg}`);
}

export function applyArchVerseScreenReadSourcePatches(source) {
  let s = source;
  if (s.includes('ARCHVERSE_LINUX_SIGNATURE_PARSE_ROBUSTNESS')) return s;

  const parseStart = s.indexOf('export function parseSignature(text: string): number | null {');
  const parseEnd = s.indexOf('/** Pick the best signature-shaped candidate', parseStart);
  must(parseStart >= 0 && parseEnd > parseStart, 'parseSignature boundaries missing');
  const parseFn = `export function parseSignature(text: string): number | null {
  if (!/\\d/.test(text)) return null;
  const t = String(text).replace(/[oO]/g, "0").replace(/[lI|]/g, "1");
  // ARCHVERSE_LINUX_SIGNATURE_PARSE_ROBUSTNESS: RapidOCR may preserve, space, or split the separator.
  const grouped = /(?:^|\\D)(\\d{1,2})\\s*(?:[.,'’:]\\s*|\\s+)(\\d{3})(?!\\d)/.exec(t);
  if (grouped) {
    const v = Number(grouped[1] + grouped[2]);
    return v >= 1000 && v <= 30000 ? v : null;
  }
  const runs = t.match(/(?<!\\d)\\d{4,5}(?!\\d)/g);
  if (runs && runs.length) {
    const v = Number(runs[runs.length - 1]);
    return v >= 1000 && v <= 30000 ? v : null;
  }
  return null;
}

`;
  s = s.slice(0, parseStart) + parseFn + s.slice(parseEnd);

  const bestStart = s.indexOf('export function bestSignatureLine(lines: OcrLine[], centerX: number):');
  const bestEnd = s.indexOf('/** Parse an SC duration string', bestStart);
  must(bestStart >= 0 && bestEnd > bestStart, 'bestSignatureLine boundaries missing');
  const bestFn = `export function bestSignatureLine(lines: OcrLine[], centerX: number): { l: OcrLine; sig: number } | null {
  const normalized = lines.filter((l): l is OcrLine => !!l && typeof l === "object" && typeof l.text === "string");
  const cands: { l: OcrLine; sig: number }[] = normalized
    .map((l) => ({ l, sig: parseSignature(l.text) }))
    .filter((c): c is { l: OcrLine; sig: number } => c.sig != null);

  // RapidOCR occasionally emits "18" and "000" as adjacent boxes. Join only boxes that are on
  // the same row and physically adjacent; the legal-signature vocabulary remains the final gate.
  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      const a = normalized[i], b = normalized[j];
      const ah = Math.max(1, Number(a.h) || 1), bh = Math.max(1, Number(b.h) || 1);
      if (Math.abs((a.y + ah / 2) - (b.y + bh / 2)) > Math.max(ah, bh) * 0.65) continue;
      const left = a.x <= b.x ? a : b;
      const right = left === a ? b : a;
      const gap = right.x - (left.x + left.w);
      if (gap < -Math.max(ah, bh) * 0.25 || gap > Math.max(ah, bh) * 2.5) continue;
      const joined = String(left.text) + " " + String(right.text);
      const sig = parseSignature(joined);
      if (sig == null) continue;
      const x0 = Math.min(left.x, right.x), y0 = Math.min(left.y, right.y);
      const x1 = Math.max(left.x + left.w, right.x + right.w), y1 = Math.max(left.y + left.h, right.y + right.h);
      cands.push({ l: { text: joined, x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, sig });
    }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => Math.abs((a.l.x + a.l.w / 2) - centerX) - Math.abs((b.l.x + b.l.w / 2) - centerX));
  return cands[0];
}

`;
  s = s.slice(0, bestStart) + bestFn + s.slice(bestEnd);
  must(s.includes('ARCHVERSE_LINUX_SIGNATURE_PARSE_ROBUSTNESS'), 'signature recovery marker missing');
  return s;
}
