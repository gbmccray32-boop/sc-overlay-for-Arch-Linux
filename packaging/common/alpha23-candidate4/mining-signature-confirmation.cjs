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

function createMiningSignatureConfirmation({ now = Date.now, windowMs = 1600 } = {}) {
  let pending = null;
  let active = null;

  function observe(result, frameToken) {
    const at = now();
    if (!result || result.kind !== "mineable" || !Number.isFinite(Number(result.signature)) || !result.text) {
      if (pending && at - pending.at > windowMs) pending = null;
      if (active && at - active.at > windowMs) active = null;
      return { status: "none", result: null };
    }
    const signature = Number(result.signature);
    const token = String(frameToken || "");
    if (active && active.signature === signature && at - active.at <= windowMs && sameLocation(active.text, result.text)) {
      active = { signature, text: result.text, token, at };
      return { status: "confirmed", result };
    }
    if (pending && pending.signature === signature && pending.token !== token
        && at - pending.at <= windowMs && sameLocation(pending.text, result.text)) {
      active = { signature, text: result.text, token, at };
      pending = null;
      return { status: "confirmed", result };
    }
    pending = { signature, text: result.text, token, at };
    active = null;
    return { status: "pending", result };
  }

  function isPending() {
    return !!pending && now() - pending.at <= windowMs;
  }

  function reset() {
    pending = null;
    active = null;
  }

  return { observe, isPending, reset };
}

module.exports = { createMiningSignatureConfirmation, __test: { sameLocation } };
