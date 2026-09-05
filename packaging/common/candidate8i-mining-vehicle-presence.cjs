"use strict";

// ARCHVERSE_LINUX_MINING_VEHICLE_PRESENCE_STREAM
// The sidecar pushes Game.log authority changes over one local SSE connection. A bootstrap GET
// remains available until the first event arrives, and inline Mining responses remain authoritative.

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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createMiningVehiclePresenceClient({
  endpoint,
  streamEndpoint = `${endpoint}/events`,
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
  let streamTask = null;
  let streamController = null;
  let streamSeen = false;
  let streamConnected = false;
  let closing = false;

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
    return observed({ stale: false, ipcAvailable: true, streamConnected });
  };

  function acceptStreamBlock(block) {
    const data = String(block || "").split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) return false;
    let value;
    try { value = JSON.parse(data); }
    catch { return false; }
    streamSeen = true;
    accept(value, "vehicle-presence-stream");
    return true;
  }

  async function consumeStream(response) {
    if (!response.body || typeof response.body.getReader !== "function") {
      throw new Error("vehicle-presence stream response has no readable body");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (!closing) {
        const item = await reader.read();
        if (item.done) break;
        buffer += decoder.decode(item.value, { stream: true });
        let boundary;
        while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
          const block = buffer.slice(0, boundary);
          const separator = /^\r\n\r\n/.test(buffer.slice(boundary)) ? 4 : 2;
          buffer = buffer.slice(boundary + separator);
          acceptStreamBlock(block);
        }
      }
    } finally {
      try { reader.releaseLock(); } catch {}
    }
  }

  async function streamLoop() {
    let reconnectMs = retryBaseMs;
    while (!closing) {
      streamController = new AbortController();
      try {
        const response = await fetchImpl(streamEndpoint, {
          method: "GET",
          headers: { Accept: "text/event-stream" },
          signal: streamController.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        streamConnected = true;
        reconnectMs = retryBaseMs;
        await consumeStream(response);
        if (!closing) throw new Error("vehicle-presence stream ended");
      } catch (error) {
        streamConnected = false;
        if (closing || error?.name === "AbortError") break;
        const at = now();
        if (at - lastFailureLogAt >= logEveryMs || lastFailureLogAt === 0) {
          lastFailureLogAt = at;
          logger.warn?.(`[mining-vehicle-gate] push stream unavailable; retaining last confirmed state active=${cached.active ? 1 : 0}; retry in ${reconnectMs}ms:`, error?.message || error);
        }
        await delay(reconnectMs);
        reconnectMs = Math.min(retryMaxMs, reconnectMs * 2);
      } finally {
        streamController = null;
      }
    }
  }

  function start() {
    if (!streamTask && !closing) {
      streamTask = streamLoop().finally(() => { streamTask = null; });
    }
    return streamTask;
  }

  const get = async () => {
    start();
    if (streamSeen) return observed({ stale: !streamConnected, ipcAvailable: streamConnected, streamConnected });
    const requestAt = now();
    if (inFlight) return inFlight;
    if (requestAt < retryAt) return observed({ stale: true, ipcAvailable: false, streamConnected });
    if (requestAt - fetchedAt < cacheMs) return observed({ stale: false, ipcAvailable: true, streamConnected });

    fetchedAt = requestAt;
    inFlight = (async () => {
      try {
        const response = await fetchImpl(endpoint, { method: "GET", signal: timeoutSignal(timeoutMs) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return accept(await response.json(), "vehicle-presence-bootstrap");
      } catch (error) {
        failureCount = Math.min(8, failureCount + 1);
        const waitMs = Math.min(retryMaxMs, retryBaseMs * (2 ** Math.min(4, failureCount - 1)));
        retryAt = now() + waitMs;
        if (requestAt - lastFailureLogAt >= logEveryMs || lastFailureLogAt === 0) {
          lastFailureLogAt = requestAt;
          logger.warn?.(`[mining-vehicle-gate] bootstrap unavailable; retaining last confirmed state active=${cached.active ? 1 : 0}; retry in ${waitMs}ms:`, error?.message || error);
        }
        return observed({ stale: true, ipcAvailable: false, streamConnected });
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };

  function close() {
    closing = true;
    streamController?.abort();
    streamController = null;
  }

  start();
  return Object.freeze({ get, accept, current: () => observed({ streamConnected }), start, close });
}

module.exports = { createMiningVehiclePresenceClient, normalizePresence, presenceKey };
