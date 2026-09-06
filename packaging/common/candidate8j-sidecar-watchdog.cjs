"use strict";

// ARCHVERSE_LINUX_SIDECAR_HEALTH_WATCHDOG
// A Mining route failure triggers a separate /api/instance probe. Only repeated failures from that
// independent probe may restart the owned child; a healthy sidecar is never killed for one route.

const { requestJson } = require("./local-json-ipc.cjs");

function createSidecarHealthWatchdog({
  endpoint,
  instanceId,
  getChild,
  restartChild,
  requestImpl = (url, options) => requestJson(url, options),
  logger = console,
  now = Date.now,
  timeoutMs = 500,
  failureLimit = 3,
  restartCooldownMs = 60000,
} = {}) {
  if (typeof endpoint !== "string" || !endpoint) throw new TypeError("sidecar health endpoint is required");
  if (typeof instanceId !== "string" || !instanceId) throw new TypeError("sidecar instance id is required");
  if (typeof getChild !== "function" || typeof restartChild !== "function") {
    throw new TypeError("sidecar child ownership callbacks are required");
  }

  let probeInFlight = false;
  let consecutiveFailures = 0;
  let lastRestartAt = -restartCooldownMs;
  let lastFailure = null;
  let closed = false;

  const stats = () => ({ probeInFlight, consecutiveFailures, lastRestartAt, lastFailure });

  const noteTransportFailure = (details = {}) => {
    if (closed || probeInFlight) return;
    const child = getChild();
    if (!child || child.exitCode != null || child.killed === true) return;
    probeInFlight = true;
    void (async () => {
      try {
        const identity = await requestImpl(endpoint, { method: "GET", timeoutMs });
        if (identity?.instance !== instanceId) {
          throw new Error(`unexpected sidecar instance ${identity?.instance || "(missing)"}`);
        }
        if (consecutiveFailures > 0) {
          logger.log?.(`[sidecar-watchdog] health probe recovered after ${consecutiveFailures} failure(s)`);
        }
        consecutiveFailures = 0;
        lastFailure = null;
      } catch (error) {
        consecutiveFailures += 1;
        lastFailure = String(error?.message || error).slice(0, 240);
        logger.warn?.(`[sidecar-watchdog] independent health probe failed ${consecutiveFailures}/${failureLimit}: ${lastFailure}`);
        const current = getChild();
        const canRestart = consecutiveFailures >= failureLimit
          && current === child
          && current?.exitCode == null
          && current?.killed !== true
          && now() - lastRestartAt >= restartCooldownMs;
        if (canRestart) {
          lastRestartAt = now();
          consecutiveFailures = 0;
          restartChild(current, { ...details, healthError: lastFailure });
        }
      } finally {
        probeInFlight = false;
      }
    })();
  };

  const close = () => { closed = true; };
  return Object.freeze({ noteTransportFailure, stats, close });
}

module.exports = { createSidecarHealthWatchdog };
