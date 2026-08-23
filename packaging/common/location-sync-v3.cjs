'use strict';

// ARCHVERSE_LOCATION_SYNC_V3
// Pure helpers shared by Electron capture and the hauling planner. No screen capture, no network.

const LIVE_BODY_CODES = Object.freeze({
  stanton1: 'Hurston', stanton1a: 'Arial', stanton1b: 'Aberdeen', stanton1c: 'Magda', stanton1d: 'Ita',
  stanton2: 'Crusader', stanton2a: 'Cellin', stanton2b: 'Daymar', stanton2c: 'Yela',
  stanton3: 'ArcCorp', stanton3a: 'Lyria', stanton3b: 'Wala',
  stanton4: 'microTech', stanton4a: 'Calliope', stanton4b: 'Clio', stanton4c: 'Euterpe',
});

function cleanText(value) {
  return String(value ?? '').replace(/[\u2012-\u2015]/g, '-').replace(/\s+/g, ' ').trim();
}
function norm(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}
function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function unitScale(unit) {
  return String(unit || '').toLowerCase() === 'km' ? 1000 : 1;
}

const ZONE_RE = /\bzone\s*:\s*(.*?)\s+pos\s*:\s*([+-]?\d+(?:\.\d+)?)\s*(km|m)?\s+([+-]?\d+(?:\.\d+)?)\s*(km|m)?\s+([+-]?\d+(?:\.\d+)?)\s*(km|m)?/i;

function parseZoneLine(text) {
  const line = cleanText(text);
  const m = ZONE_RE.exec(line);
  if (!m) return null;
  const raw = [finiteNumber(m[2]), finiteNumber(m[4]), finiteNumber(m[6])];
  if (raw.some((n) => n == null)) return null;
  const explicit = [m[3], m[5], m[7]].filter(Boolean).map((u) => u.toLowerCase());
  const inferred = explicit.includes('km') ? 'km' : (explicit.includes('m') ? 'm' : 'm');
  const units = [m[3], m[5], m[7]].map((u) => (u || inferred).toLowerCase());
  return {
    label: cleanText(m[1]),
    raw: { x: raw[0], y: raw[1], z: raw[2] },
    units,
    pos: {
      x: raw[0] * unitScale(units[0]),
      y: raw[1] * unitScale(units[1]),
      z: raw[2] * unitScale(units[2]),
    },
  };
}

function inferSystem(texts, zones) {
  const joined = texts.join(' ');
  const direct = /\bcurrent\s+player\s+location\s*:\s*((?:stanton|pyro|nyx)[a-z0-9_-]*)/i.exec(joined);
  if (direct) {
    const p = direct[1].toLowerCase();
    if (p.startsWith('stanton')) return 'Stanton';
    if (p.startsWith('pyro')) return 'Pyro';
    if (p.startsWith('nyx')) return 'Nyx';
  }
  for (const z of zones) {
    const label = z.label.toLowerCase();
    if (label.includes('stanton')) return 'Stanton';
    if (label.includes('pyro')) return 'Pyro';
    if (label.includes('nyx')) return 'Nyx';
  }
  return null;
}

function canonicalBodyFromLabel(value) {
  let text = cleanText(value)
    .replace(/\((?:working|load\s+complete)[^)]*\)/ig, ' ')
    .replace(/^(?:ooc|00c|0oc|o0c)\s+/i, '')
    .trim();
  const n = norm(text);
  for (const body of Object.values(LIVE_BODY_CODES)) {
    if (n.includes(norm(body))) return body;
  }
  text = text.replace(/^(?:stanton|pyro|nyx)\s*/i, '').trim();
  text = text.replace(/^(?:\d+[a-z]?|[ivx]+)\s+/i, '').trim();
  text = text.replace(/^\d{5,}\s+/, '').trim();
  if (!text || /^(?:root|ro0t|solarsystem)$/i.test(text)) return null;
  return text.slice(0, 48);
}

function inferPlanet(texts, zones) {
  const joined = texts.join(' ');
  if (/\bno\s+current\s+planet\b/i.test(joined)) return { body: null, explicitNone: true };
  const direct = /\b(?:current\s+)?planet\s*:\s*(.+?)(?=\s+\((?:working|load\s+complete)\)|\s{2,}|\b(?:entities|component|game|zone|server|render|graphics|current\s+player)\b|$)/i.exec(joined);
  if (direct) {
    const body = canonicalBodyFromLabel(direct[1]);
    if (body) return { body, explicitNone: false };
  }
  const loc = /\bcurrent\s+player\s+location\s*:\s*((?:stanton\d[a-z]?)[a-z0-9_-]*)/i.exec(joined);
  if (loc) {
    const code = /^((?:stanton\d[a-z]?))/i.exec(loc[1])?.[1]?.toLowerCase();
    if (code && LIVE_BODY_CODES[code]) return { body: LIVE_BODY_CODES[code], explicitNone: false };
  }
  const bodyZones = (zones || []).filter((z) => !/^r[o0]{2}t$/i.test(z.label) && !/solarsystem/i.test(z.label) && z.units.includes('km'));
  if (bodyZones.length === 1) {
    const body = canonicalBodyFromLabel(bodyZones[0].label);
    if (body) return { body, explicitNone: false };
  }
  return { body: null, explicitNone: false };
}

function chooseBodyZone(zones, body) {
  if (!body) return null;
  const nb = norm(body);
  const named = zones.filter((z) => {
    const nl = norm(z.label);
    return nl && nb && (nl.includes(nb) || nb.includes(nl));
  });
  if (named.length) {
    named.sort((a, b) => {
      const ak = a.units.includes('km') ? 1 : 0;
      const bk = b.units.includes('km') ? 1 : 0;
      if (ak !== bk) return bk - ak;
      const am = Math.hypot(a.pos.x, a.pos.y, a.pos.z);
      const bm = Math.hypot(b.pos.x, b.pos.y, b.pos.z);
      return bm - am;
    });
    return named[0];
  }
  const kmCandidates = zones.filter((z) => !/^root$/i.test(z.label) && !/solarsystem/i.test(z.label) && z.units.includes('km'));
  if (kmCandidates.length === 1) return kmCandidates[0];
  if (kmCandidates.length > 1) {
    kmCandidates.sort((a, b) => Math.hypot(b.pos.x, b.pos.y, b.pos.z) - Math.hypot(a.pos.x, a.pos.y, a.pos.z));
    return kmCandidates[0];
  }
  return null;
}

function parseDisplayInfoLines(lines) {
  const texts = (Array.isArray(lines) ? lines : [])
    .map((row) => cleanText(row && typeof row === 'object' ? row.text : row))
    .filter(Boolean);
  const zones = texts.map(parseZoneLine).filter(Boolean);
  const planet = inferPlanet(texts, zones);
  const system = inferSystem(texts, zones);
  const currentLocationMatch = /\bcurrent\s+player\s+location\s*:\s*([^\n]+?)(?=\s{2,}|\b(?:entities|component|game|no\s+current\s+planet|planet|zone|server|render|graphics)\b|$)/i.exec(texts.join(' '));
  const currentLocation = currentLocationMatch ? cleanText(currentLocationMatch[1]) : null;

  const bodyZone = chooseBodyZone(zones, planet.body);
  if (planet.body) {
    if (!bodyZone) {
      return {
        ok: false,
        error: `Current planet ${planet.body} was visible, but its body-local Zone Pos was not read.`,
        body: planet.body,
        system,
        currentLocation,
        zones,
      };
    }
    return {
      ok: true,
      frame: 'body',
      body: planet.body,
      system,
      currentLocation,
      source: 'body-zone',
      zoneLabel: bodyZone.label,
      pos: bodyZone.pos,
      zones,
    };
  }

  const root = zones.find((z) => /^r[o0]{2}t$/i.test(z.label));
  const solar = zones.find((z) => /solarsystem/i.test(z.label));
  const systemZone = root || solar;
  if (systemZone && (planet.explicitNone || !planet.body)) {
    return {
      ok: true,
      frame: 'system',
      body: null,
      system,
      currentLocation,
      source: root ? 'root-zone' : 'solar-system-zone',
      zoneLabel: systemZone.label,
      pos: systemZone.pos,
      zones,
    };
  }

  return {
    ok: false,
    error: 'No usable body-local or Root/SolarSystem Zone Pos was found. Is r_DisplayInfo 1 on?',
    body: null,
    system,
    currentLocation,
    zones,
  };
}

function metaMatchesBody(meta, body) {
  if (!meta || !body) return false;
  const b = norm(body);
  return [meta.name, meta.parentName].some((v) => norm(v) === b);
}
function metaMatchesSystem(meta, system) {
  if (!meta || !system) return null;
  const s = norm(system);
  const vals = [meta.system, meta.star].map(norm).filter(Boolean);
  if (!vals.length) return null;
  return vals.some((v) => v === s || v.startsWith(s) || s.startsWith(v));
}

function nearestActiveStop(candidates, reading, snapMetres = 12000) {
  if (!reading?.ok || !reading.pos) return null;
  const snap = Number.isFinite(snapMetres) && snapMetres > 0 ? snapMetres : 12000;
  let best = null;
  for (const row of Array.isArray(candidates) ? candidates : []) {
    if (!row?.id || !row.pos) continue;
    const p = row.pos;
    if (![p.x, p.y, p.z].every(Number.isFinite)) continue;
    if (reading.frame === 'body') {
      const regionMatch = reading.body && norm(row.region) === norm(reading.body);
      if (!metaMatchesBody(row.meta, reading.body) && !regionMatch) continue;
    } else if (reading.frame === 'system' && reading.system) {
      const sm = metaMatchesSystem(row.meta, reading.system);
      if (sm === false) continue;
    }
    const d = Math.hypot(p.x - reading.pos.x, p.y - reading.pos.y, p.z - reading.pos.z);
    if (d <= snap && (!best || d < best.metres)) best = { id: row.id, metres: d };
  }
  return best;
}

function locationCropGeometry(width, height) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const cropW = Math.min(w, Math.max(Math.min(w, 1200), Math.min(Math.round(w * 0.40), 2400)));
  const cropH = Math.min(h, Math.max(Math.min(h, 520), Math.min(Math.round(h * 0.42), 900)));
  const scale = Math.max(1, Math.min(1.75, 3600 / Math.max(1, cropW)));
  return {
    crop: { x: Math.max(0, w - cropW), y: 0, width: cropW, height: cropH },
    target: { width: Math.round(cropW * scale), height: Math.round(cropH * scale), scale },
  };
}

module.exports = {
  parseZoneLine,
  parseDisplayInfoLines,
  nearestActiveStop,
  locationCropGeometry,
  norm,
};
