"use strict";

// ARCHVERSE_LINUX_LOCAL_JSON_IPC_ISOLATION
// Mining uses short, independent loopback HTTP transactions. It does not share the global fetch
// dispatcher with long-lived event streams or unrelated application traffic.

const http = require("node:http");

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const MAX_RESPONSE_BYTES = 1024 * 1024;

function requestJson(endpoint, {
  method = "GET",
  json = undefined,
  timeoutMs = 650,
  maxResponseBytes = MAX_RESPONSE_BYTES,
} = {}) {
  const target = new URL(endpoint);
  if (target.protocol !== "http:" || !LOOPBACK_HOSTS.has(target.hostname)) {
    return Promise.reject(new Error(`local JSON IPC rejected non-loopback endpoint ${target.origin}`));
  }

  const body = json === undefined ? null : Buffer.from(JSON.stringify(json));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(value);
    };
    const req = http.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method,
      agent: false,
      headers: body ? {
        "Content-Type": "application/json",
        "Content-Length": String(body.length),
      } : undefined,
    }, (res) => {
      const chunks = [];
      let size = 0;
      res.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxResponseBytes) {
          req.destroy(new Error(`local JSON IPC response exceeded ${maxResponseBytes} bytes`));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
          finish(new Error(`local JSON IPC HTTP ${res.statusCode || 0}`));
          return;
        }
        try { finish(null, raw ? JSON.parse(raw) : {}); }
        catch (error) { finish(new Error(`local JSON IPC returned invalid JSON: ${error.message}`)); }
      });
      res.on("error", (error) => finish(error));
    });
    req.on("error", (error) => finish(error));
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`local JSON IPC timed out after ${timeoutMs}ms`));
    });
    if (body) req.write(body);
    req.end();
  });
}

module.exports = { requestJson, LOOPBACK_HOSTS, MAX_RESPONSE_BYTES };
