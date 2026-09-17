"use strict";

// ARCHVERSE_LINUX_MINING_RESULT_TRANSPORT_V1
// OCR classification is local and immediate. The sidecar commit is authoritative but asynchronous:
// one request may run and one newest result may wait, so an unavailable sidecar cannot stall OCR.

const { requestJson } = require("./local-json-ipc.cjs");
const { classifyMiningSignature, MAX_VALID_SIGNATURE } = require("./mining-signature-catalog.cjs");
const MINING_GLOBAL_NEGATIVE_CONTEXT = /\b(?:SHIP\s+IN\s+DIST[A-Z]*|WRECKAGE|CURRENT\s+FLOOR|HAB\s+FLOOR|LOBBY|LIFT\s+SYSTEM|ELEVATOR|HANGAR)\b/i;
const MINING_LINE_NEGATIVE_CONTEXT = /\b(?:CARGO|FREIGHT|INVENTORY|STORAGE|CONTAINER)\b/i;
// Candidate 10 field OCR read an item quantity as RS 16,000: "EXODUS | Volume:...uSCU | X 16,000".
// This context belongs to the whole OCR crop even if the number arrives in a separate line.
const MINING_CARGO_QUANTITY_CONTEXT = /\bVOLUME\s*:|[µμu]SCU\b/i;
const MINING_IDENTIFIER = /\b[A-Z0-9]{1,4}-\d{4,6}\b/i;

function isNavigationCoordinateText(text) {
  const value = String(text || "");
  const decimals = value.match(/(?<!\d)\d{1,3}\.\d{2,3}(?!\d)/g) || [];
  return decimals.length >= 3 || (decimals.length >= 2 && /[°º]/.test(value));
}

function signatureValues(text) {
  if (!/\d/.test(text) || isNavigationCoordinateText(text)) return [];
  const normalized = String(text).replace(/[oO]/g, "0").replace(/[lI|]/g, "1");
  // ARCHVERSE_ALPHA23_DISTANCE_TOKEN_REJECTION: acquisition padding may include the nearby scan
  // target distance. Remove complete metre/kilometre tokens before looking for RS values so a
  // distance such as 2,000 m cannot be admitted as a resource signature.
  const signatureText = normalized.replace(/(?<!\d)\d{1,6}(?:[.,]\d{1,3})?\s*k?m\b/gi, " ");
  const values = [];
  // ARCHVERSE_ALPHA23_NO_WHITESPACE_DIGIT_JOIN: a plain gap is often two unrelated HUD
  // values (Candidate 3 saw "30 100" and invented 30100). Only visible grouping punctuation
  // may join digits inside one OCR line.
  const grouped = /(?<!\d)(\d{1,3})\s*[.,'’:]\s*(\d{3})(?!\d)/g;
  let match;
  while ((match = grouped.exec(signatureText))) {
    const value = Number(match[1] + match[2]);
    if (value >= 2000 && value <= MAX_VALID_SIGNATURE) values.push(value);
  }
  const withoutGrouped = signatureText.replace(grouped, " ");
  for (const run of withoutGrouped.match(/(?<!\d)\d{4,6}(?!\d)/g) || []) {
    const value = Number(run);
    if (value >= 2000 && value <= MAX_VALID_SIGNATURE) values.push(value);
  }
  return [...new Set(values)];
}

function structuralMiningContext(text) {
  const value = String(text || "");
  const unknown = /\bUNKNOWN\b/i.test(value);
  const distance = /\b\d+(?:[.,]\d+)?\s*k?m\b/i.test(value);
  const signal = /\b(?:STRONG|MODERATE|WEAK)\b/i.test(value);
  const angle = /\b\d{1,3}\s*[°º]/.test(value);
  return unknown && (distance || signal || angle);
}

function parseSignature(text) {
  const values = signatureValues(text);
  return values.length === 1 ? values[0] : null;
}

function bestSignatureLine(lines, centerX) {
  const normalized = Array.isArray(lines)
    ? lines.filter((line) => line && typeof line === "object" && typeof line.text === "string")
    : [];
  const allText = normalized.map((line) => line.text).join(" | ");
  if (isNavigationCoordinateText(allText) || MINING_GLOBAL_NEGATIVE_CONTEXT.test(allText)
      || MINING_CARGO_QUANTITY_CONTEXT.test(allText)) return null;
  const acceptsLine = (line) => !MINING_LINE_NEGATIVE_CONTEXT.test(line.text) && !MINING_IDENTIFIER.test(line.text);
  const candidates = normalized.filter(acceptsLine)
    .map((line) => ({ l: line, sig: parseSignature(line.text) }))
    .filter((candidate) => candidate.sig != null);
  for (let i = 0; i < normalized.length; i += 1) {
    for (let j = i + 1; j < normalized.length; j += 1) {
      const a = normalized[i], b = normalized[j];
      const ah = Math.max(1, Number(a.h) || 1), bh = Math.max(1, Number(b.h) || 1);
      if (Math.abs(a.y + ah / 2 - (b.y + bh / 2)) > Math.max(ah, bh) * 0.65) continue;
      const left = a.x <= b.x ? a : b;
      const right = left === a ? b : a;
      const gap = right.x - (left.x + left.w);
      if (gap < -Math.max(ah, bh) * 0.25 || gap > Math.max(ah, bh) * 2.5) continue;
      // OCR may split a genuinely grouped number into two adjacent boxes. Admit only the exact
      // 1-3 digit + 3 digit shape; never concatenate arbitrary HUD phrases.
      const leftDigits = String(left.text || "").trim();
      const rightDigits = String(right.text || "").trim();
      if (!/^\d{1,3}$/.test(leftDigits) || !/^\d{3}$/.test(rightDigits)) continue;
      const joined = `${leftDigits},${rightDigits}`;
      if (MINING_LINE_NEGATIVE_CONTEXT.test(joined) || MINING_IDENTIFIER.test(joined)) continue;
      const signature = parseSignature(joined);
      if (signature == null) continue;
      const x0 = Math.min(left.x, right.x), y0 = Math.min(left.y, right.y);
      const x1 = Math.max(left.x + left.w, right.x + right.w), y1 = Math.max(left.y + left.h, right.y + right.h);
      candidates.push({ l: { text: joined, x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, sig: signature });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((left, right) => Math.abs(left.l.x + left.l.w / 2 - centerX)
    - Math.abs(right.l.x + right.l.w / 2 - centerX));
  return { ...candidates[0], context: structuralMiningContext(allText) ? "scan-structure" : "catalog-only" };
}

function classifyMiningOcrLines(lines, {
  width,
  offsetX = 0,
  offsetY = 0,
} = {}) {
  const best = bestSignatureLine(lines, Number(width) / 2);
  if (!best) return { kind: "none" };
  const text = {
    x: (Number(best.l.x) || 0) + offsetX,
    y: (Number(best.l.y) || 0) + offsetY,
    w: Number(best.l.w) || 0,
    h: Number(best.l.h) || 0,
  };
  const currentRs = classifyMiningSignature(best.sig);
  if (!currentRs.valid) {
    return best.context === "scan-structure" ? {
      kind: "mining-observation",
      observedSignature: best.sig,
      classification: "unclassified",
      context: best.context,
      raw: best.l.text.trim(),
      text,
    } : { kind: "none" };
  }
  return {
    kind: "mineable",
    signature: best.sig,
    raw: best.l.text.trim(),
    context: best.context,
    text,
    pin: { localAdmission: true },
  };
}

function createMiningResultTransport({
  endpoint,
  requestImpl = (url, options) => requestJson(url, options),
  logger = console,
  timeoutMs = 650,
  retryBaseMs = 250,
  retryMaxMs = 5000,
  logEveryMs = 5000,
  onResponse = () => {},
  onFailure = () => {},
  now = Date.now,
} = {}) {
  if (typeof endpoint !== "string" || !endpoint) throw new TypeError("Mining result endpoint is required");
  if (typeof requestImpl !== "function") throw new TypeError("Mining result request implementation is required");

  let pending = null;
  let inFlight = false;
  let retryTimer = null;
  let closed = false;
  let submitted = 0;
  let acknowledged = 0;
  let dropped = 0;
  let consecutiveFailures = 0;
  let lastSuccessAt = 0;
  let lastFailureAt = 0;
  let lastFailureLogAt = 0;

  const stats = () => ({
    submitted,
    acknowledged,
    dropped,
    inFlight,
    pending: !!pending,
    consecutiveFailures,
    lastSuccessAt,
    lastFailureAt,
  });

  const schedule = (delayMs = 0) => {
    if (closed || inFlight || retryTimer || !pending) return;
    if (delayMs <= 0) {
      queueMicrotask(() => { void drain(); });
      return;
    }
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void drain();
    }, delayMs);
    retryTimer.unref?.();
  };

  const drain = async () => {
    if (closed || inFlight || !pending) return;
    const item = pending;
    pending = null;
    inFlight = true;
    try {
      const response = await requestImpl(endpoint, { method: "POST", json: item.payload, timeoutMs });
      consecutiveFailures = 0;
      acknowledged += 1;
      lastSuccessAt = now();
      try { onResponse(response, item, stats()); }
      catch (error) { logger.warn?.("[mining-ipc] response observer failed:", error?.message || error); }
    } catch (error) {
      consecutiveFailures = Math.min(12, consecutiveFailures + 1);
      lastFailureAt = now();
      if (!pending) pending = item;
      else dropped += 1;
      const retryMs = Math.min(retryMaxMs, retryBaseMs * (2 ** Math.min(4, consecutiveFailures - 1)));
      if (lastFailureAt - lastFailureLogAt >= logEveryMs || lastFailureLogAt === 0) {
        lastFailureLogAt = lastFailureAt;
        logger.warn?.(`[mining-ipc] commit route unavailable; OCR remains live; newest result retained; retry in ${retryMs}ms:`, error?.message || error);
      }
      try { onFailure(error, { ...stats(), retryMs }); }
      catch (observerError) { logger.warn?.("[mining-ipc] failure observer failed:", observerError?.message || observerError); }
      inFlight = false;
      schedule(retryMs);
      return;
    }
    inFlight = false;
    schedule(0);
  };

  const submit = (payload, context = {}) => {
    if (closed) return false;
    submitted += 1;
    if (pending) dropped += 1;
    pending = { payload, context, submittedAt: now() };
    schedule(0);
    return true;
  };

  const awaitIdle = async (timeout = 5000) => {
    const deadline = now() + timeout;
    while (!closed && (inFlight || pending || retryTimer)) {
      if (now() >= deadline) return false;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return true;
  };

  const close = () => {
    closed = true;
    pending = null;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  };

  return Object.freeze({ submit, stats, awaitIdle, close });
}

module.exports = {
  createMiningResultTransport,
  classifyMiningOcrLines,
  bestSignatureLine,
  signatureValues,
  isNavigationCoordinateText,
};
