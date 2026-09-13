"use strict";

// ARCHVERSE_ALPHA23_DISTINCT_FRAME_CONFIRMATION

function center(box) {
  return {
    x: (Number(box?.x) || 0) + (Number(box?.w) || 0) / 2,
    y: (Number(box?.y) || 0) + (Number(box?.h) || 0) / 2,
  };
}

function sameLocation(left, right) {
  const a = center(left), b = center(right);
  const scale = Math.max(Number(left?.h) || 0, Number(right?.h) || 0, 12);
  return Math.abs(a.x - b.x) <= Math.max(36, scale * 3)
    && Math.abs(a.y - b.y) <= Math.max(24, scale * 2);
}

const MAX_WINDOW_MS = 15000;

function normalizeWindowMs(value, fallback) {
  const candidate = Number(value);
  if (!Number.isFinite(candidate)) return fallback;
  return Math.min(MAX_WINDOW_MS, Math.max(1, Math.round(candidate)));
}

function createMiningSignatureConfirmation({ now = Date.now, windowMs = 1600 } = {}) {
  const defaultWindowMs = normalizeWindowMs(windowMs, 1600);
  let pending = null;
  let active = null;

  function observe(result, frameToken, options = {}) {
    const at = now();
    const observationWindowMs = normalizeWindowMs(options.windowMs, defaultWindowMs);
    if (!result || result.kind !== "mineable" || !Number.isFinite(Number(result.signature)) || !result.text) {
      if (pending && at - pending.at > pending.windowMs) pending = null;
      if (active && at - active.at > active.windowMs) active = null;
      return { status: "none", result: null };
    }
    const signature = Number(result.signature);
    const token = String(frameToken || "");
    if (active && active.signature === signature && at - active.at <= active.windowMs && sameLocation(active.text, result.text)) {
      active = { signature, text: result.text, token, at, windowMs: observationWindowMs };
      return { status: "confirmed", result };
    }
    if (pending && pending.signature === signature && pending.token !== token
        && at - pending.at <= pending.windowMs && sameLocation(pending.text, result.text)) {
      active = { signature, text: result.text, token, at, windowMs: observationWindowMs };
      pending = null;
      return { status: "confirmed", result };
    }
    pending = { signature, text: result.text, token, at, windowMs: observationWindowMs };
    active = null;
    return { status: "pending", result };
  }

  function isPending() {
    return !!pending && now() - pending.at <= pending.windowMs;
  }

  function reset() {
    pending = null;
    active = null;
  }

  return { observe, isPending, reset };
}

module.exports = { createMiningSignatureConfirmation, __test: { sameLocation, normalizeWindowMs, MAX_WINDOW_MS } };
