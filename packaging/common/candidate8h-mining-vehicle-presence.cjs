"use strict";

// ARCHVERSE_LINUX_MINING_VEHICLE_PRESENCE_LIVENESS
// A transport timeout is not evidence that the player left their vehicle. Preserve the last
// confirmed Game.log state until the sidecar supplies a newer state. The sidecar still rechecks
// that state during every inline Mining commit, so an on-foot read remains fail-closed.

function normalizePresence(value) {
  return {
    active: value?.active === true,
    source: String(value?.source || "none"),
    ship: value?.ship || null,
    controlled: Array.isArray(value?.controlled) ? value.controlled : [],
    changedAt: Number(value?.changedAt) || 0,
  };
}

function presenceKey(value) {
  return `${value.active ? 1 : 0}:${value.source}:${value.ship || ""}:` +
    value.controlled.map((row) => row?.model || row?.entityId || "").join(",");
}

function createMiningVehiclePresenceClient({
  endpoint,
  fetchImpl = globalThis.fetch,
  logger = console,
  now = Date.now,
  timeoutSignal = (ms) => AbortSignal.timeout(ms),
  cacheMs = 500,
  timeoutMs = 500,
  retryBaseMs = 1000,
  retryMaxMs = 10000,
  logEveryMs = 5000,
} = {}) {
  if (typeof endpoint !== "string" || !endpoint) throw new TypeError("vehicle-presence endpoint is required");
  if (typeof fetchImpl !== "function") throw new TypeError("vehicle-presence fetch implementation is required");

  let cached = normalizePresence(null);
  let fetchedAt = 0;
  let retryAt = 0;
  let failureCount = 0;
  let inFlight = null;
  let lastStateKey = "";
  let lastFailureLogAt = 0;

  const observed = (extra = {}) => ({ ...cached, ...extra });

  const accept = (value, origin = "vehicle-presence") => {
    cached = normalizePresence(value);
    fetchedAt = now();
    retryAt = 0;
    const recovered = failureCount > 0;
    failureCount = 0;
    const key = presenceKey(cached);
    if (key !== lastStateKey || recovered) {
      lastStateKey = key;
      logger.log?.(`[mining-vehicle-gate] ${cached.active ? "active" : "inactive"} source=${cached.source}` +
        `${cached.ship ? ` ship="${cached.ship}"` : ""}` +
        `${cached.controlled.length ? ` controlled=${cached.controlled.map((row) => row?.model || row?.entityId).join(",")}` : ""}` +
        ` origin=${origin}${recovered ? " (IPC recovered)" : ""}`);
    }
    return observed({ stale: false, ipcAvailable: true });
  };

  const get = async () => {
    const requestAt = now();
    if (inFlight) return inFlight;
    if (requestAt < retryAt) return observed({ stale: true, ipcAvailable: false });
    if (requestAt - fetchedAt < cacheMs) return observed({ stale: false, ipcAvailable: true });

    fetchedAt = requestAt;
    inFlight = (async () => {
      try {
        const response = await fetchImpl(endpoint, {
          method: "GET",
          signal: timeoutSignal(timeoutMs),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return accept(await response.json(), "vehicle-presence");
      } catch (error) {
        failureCount = Math.min(8, failureCount + 1);
        const delay = Math.min(retryMaxMs, retryBaseMs * (2 ** Math.min(4, failureCount - 1)));
        retryAt = now() + delay;
        if (requestAt - lastFailureLogAt >= logEveryMs || lastFailureLogAt === 0) {
          lastFailureLogAt = requestAt;
          logger.warn?.(`[mining-vehicle-gate] presence IPC unavailable; retaining last confirmed state active=${cached.active ? 1 : 0}; retry in ${delay}ms:`, error?.message || error);
        }
        return observed({ stale: true, ipcAvailable: false });
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };

  return Object.freeze({ get, accept, current: () => observed() });
}

module.exports = { createMiningVehiclePresenceClient, normalizePresence };
