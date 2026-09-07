"use strict";

// ARCHVERSE_LINUX_SIDECAR_HEALTH_WATCHDOG_V2
// Transport timeouts are observations, not crashes. A restart requires one continuous failure
// episode, and any successful transport or health response ends that episode immediately.

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
  failureWindowMs = 10000,
  minimumFailureDurationMs = 10000,
  startupGraceMs = 15000,
  restartCooldownMs = 60000,
} = {}) {
  if (typeof endpoint !== "string" || !endpoint) throw new TypeError("sidecar health endpoint is required");
  if (typeof instanceId !== "string" || !instanceId) throw new TypeError("sidecar instance id is required");
  if (typeof getChild !== "function" || typeof restartChild !== "function") {
    throw new TypeError("sidecar child ownership callbacks are required");
  }

  let probeInFlight = false;
  let consecutiveFailures = 0;
  let episodeStartedAt = 0;
  let lastFailureAt = 0;
  let lastSuccessAt = 0;
  let lastRestartAt = -restartCooldownMs;
  let graceUntil = 0;
  let observedChild = null;
  let lastFailure = null;
  let closed = false;

  const resetEpisode = (reason, { log = true } = {}) => {
    if (log && consecutiveFailures > 0) {
      logger.log?.(`[sidecar-watchdog] failure episode cleared after ${consecutiveFailures} probe failure(s); reason=${reason}`);
    }
    consecutiveFailures = 0;
    episodeStartedAt = 0;
    lastFailureAt = 0;
    lastFailure = null;
  };

  const noteChildStarted = (child = getChild()) => {
    observedChild = child || null;
    graceUntil = now() + startupGraceMs;
    resetEpisode("child-started", { log: false });
  };

  const noteTransportSuccess = (details = {}) => {
    if (closed) return;
    lastSuccessAt = now();
    resetEpisode(details.route || details.source || "transport-success");
  };

  const stats = () => ({
    probeInFlight,
    consecutiveFailures,
    episodeStartedAt,
    lastFailureAt,
    lastSuccessAt,
    lastRestartAt,
    graceUntil,
    lastFailure,
  });

  const noteTransportFailure = (details = {}) => {
    if (closed || probeInFlight) return;
    const child = getChild();
    const at = now();
    if (!child || child.exitCode != null || child.killed === true) return;
    if (child !== observedChild) noteChildStarted(child);
    if (at < graceUntil) return;
    if (lastFailureAt > 0 && at - lastFailureAt > failureWindowMs) {
      resetEpisode("failure-window-expired");
    }

    probeInFlight = true;
    void (async () => {
      try {
        const identity = await requestImpl(endpoint, { method: "GET", timeoutMs });
        if (identity?.instance !== instanceId) {
          throw new Error(`unexpected sidecar instance ${identity?.instance || "(missing)"}`);
        }
        noteTransportSuccess({ route: "/api/instance" });
      } catch (error) {
        const failedAt = now();
        if (lastFailureAt > 0 && failedAt - lastFailureAt > failureWindowMs) {
          resetEpisode("failure-window-expired");
        }
        if (consecutiveFailures === 0) episodeStartedAt = failedAt;
        consecutiveFailures += 1;
        lastFailureAt = failedAt;
        lastFailure = String(error?.message || error).slice(0, 240);
        const durationMs = Math.max(0, failedAt - episodeStartedAt);
        logger.warn?.(`[sidecar-watchdog] independent health probe failed ${consecutiveFailures}/${failureLimit}` +
          ` episode=${durationMs}ms/${minimumFailureDurationMs}ms: ${lastFailure}`);
        const current = getChild();
        const canRestart = consecutiveFailures >= failureLimit
          && durationMs >= minimumFailureDurationMs
          && current === child
          && current === observedChild
          && current?.exitCode == null
          && current?.killed !== true
          && failedAt >= graceUntil
          && failedAt - lastRestartAt >= restartCooldownMs;
        if (canRestart) {
          const healthError = lastFailure;
          lastRestartAt = failedAt;
          resetEpisode("controlled-restart", { log: false });
          restartChild(current, { ...details, healthError });
        }
      } finally {
        probeInFlight = false;
      }
    })();
  };

  const close = () => { closed = true; };
  return Object.freeze({ noteTransportFailure, noteTransportSuccess, noteChildStarted, stats, close });
}

module.exports = { createSidecarHealthWatchdog };
