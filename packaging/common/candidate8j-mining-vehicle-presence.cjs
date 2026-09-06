"use strict";

// ARCHVERSE_LINUX_MINING_VEHICLE_PRESENCE_BOUNDED_GET
// A loopback timeout is not evidence that the player left a vehicle. Keep the last confirmed
// Game.log state and retry with bounded backoff. The sidecar remains authoritative at commit time.

const { requestJson } = require("./local-json-ipc.cjs");

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
  requestImpl = (url, options) => requestJson(url, options),
  logger = console,
  now = Date.now,
  cacheMs = 500,
  timeoutMs = 350,
  retryBaseMs = 750,
  retryMaxMs = 10000,
  logEveryMs = 5000,
} = {}) {
  if (typeof endpoint !== "string" || !endpoint) throw new TypeError("vehicle-presence endpoint is required");
  if (typeof requestImpl !== "function") throw new TypeError("vehicle-presence request implementation is required");

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
        const value = await requestImpl(endpoint, { method: "GET", timeoutMs });
        return accept(value, "vehicle-presence-get");
      } catch (error) {
        failureCount = Math.min(8, failureCount + 1);
        const waitMs = Math.min(retryMaxMs, retryBaseMs * (2 ** Math.min(4, failureCount - 1)));
        retryAt = now() + waitMs;
        if (requestAt - lastFailureLogAt >= logEveryMs || lastFailureLogAt === 0) {
          lastFailureLogAt = requestAt;
          logger.warn?.(`[mining-vehicle-gate] bounded GET unavailable; retaining last confirmed state active=${cached.active ? 1 : 0}; retry in ${waitMs}ms:`, error?.message || error);
        }
        return observed({ stale: true, ipcAvailable: false });
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };

  return Object.freeze({
    get,
    accept,
    current: () => observed(),
    stats: () => ({ failureCount, inFlight: !!inFlight, retryInMs: Math.max(0, retryAt - now()) }),
    close() {},
  });
}

module.exports = { createMiningVehiclePresenceClient, normalizePresence, presenceKey };
