/**
 * Linux-only semantic patches applied to the CURRENT upstream overlay-server source before esbuild.
 *
 * Keep this file small and fail-loud. It owns only platform contracts that upstream Windows code
 * cannot know about; mission/hauling/mining business logic remains upstream.
 */

function must(cond, msg) {
  if (!cond) throw new Error(`ArchVerse server patch: ${msg}`);
}
function countOf(text, needle) { return text.split(needle).length - 1; }
function replaceOnce(text, from, to, label) {
  if (text.includes(to)) return text;
  const count = countOf(text, from);
  must(count === 1, `${label}: expected exactly one anchor, found ${count}`);
  return text.replace(from, to);
}

export function applyArchVerseServerSourcePatches(source) {
  let s = source;

  // One physical config root for Electron, capture and sidecar. HOME/APPDATA is a fallback only.
  s = replaceOnce(
    s,
    'const userDir = join(process.env.APPDATA ?? process.env.HOME ?? ".", "sc-blueprint-tracker");',
    'const userDir = process.env.SC_TRACKER_CONFIG_DIR || join(process.env.APPDATA ?? process.env.HOME ?? ".", "sc-blueprint-tracker"); // ARCHVERSE_LINUX_CONFIG_ROOT',
    'canonical Linux config root',
  );

  // Descriptive reader profile. It is derived from actual reader booleans, never used as a hidden
  // master switch. This keeps Settings, GET/POST /api/config and config.json telling the same truth.
  s = replaceOnce(
    s,
    '  /** Opt-in: require holding the interact key to click the overlay. Off by default (the overlay\n   *  is clickable whenever the cursor is over a widget). */\n  holdToInteract: boolean;',
    '  /** Opt-in: require holding the interact key to click the overlay. Off by default (the overlay\n   *  is clickable whenever the cursor is over a widget). */\n  holdToInteract: boolean;\n  /** ARCHVERSE_LINUX_CONFIG_CONTRACT: descriptive state derived from the three reader toggles. */\n  screenReaderProfile: "lightweight" | "balanced" | "mining" | "custom";',
    'screen-reader profile Config type',
  );
  s = replaceOnce(
    s,
    '  scanRegion: ScanRegion | null;',
    '  scanRegion: ScanRegion | null;\n  /** ARCHVERSE_LINUX_OCR_REGION_CONFIG: independent normalized crops on the bound Star Citizen frame. */\n  linuxOcrRegions: Partial<Record<"resourceSignature" | "fabricator" | "mission" | "claimContext" | "refinery", ScanRegion | null>>;',
    'Linux OCR region Config type',
  );
  s = replaceOnce(
    s,
    '  interactHotkey: "F",\n  holdToInteract: false,\n  moveHotkey: "Ctrl+Alt+M",',
    '  interactHotkey: "F",\n  holdToInteract: false,\n  screenReaderProfile: "lightweight",\n  moveHotkey: "Ctrl+Alt+M",',
    'screen-reader profile default',
  );
  s = replaceOnce(
    s,
    '  scanRegion: null,\n  payoutScan: false,',
    '  scanRegion: null,\n  linuxOcrRegions: { resourceSignature: null, fabricator: null, mission: null, claimContext: null, refinery: null },\n  payoutScan: false,',
    'Linux OCR region defaults',
  );

  const loadAnchor = 'const freshInstall = !existsSync(configPath);\nlet config: Config = loadConfig();';
  const repairBlock = `// ARCHVERSE_LINUX_CONFIG_CONTRACT\nfunction deriveScreenReaderProfile(c: Pick<Config, "fabCapture" | "missionOcr" | "miningAssistant">): Config["screenReaderProfile"] {\n  if (!c.fabCapture && !c.missionOcr && !c.miningAssistant) return "lightweight";\n  if (!c.fabCapture && c.missionOcr && !c.miningAssistant) return "balanced";\n  if (!c.fabCapture && !c.missionOcr && c.miningAssistant) return "mining";\n  return "custom";\n}\nfunction repairArchVerseLinuxConfig(c: Config): void {\n  c.screenReaderProfile = deriveScreenReaderProfile(c);\n  if (!c.linuxOcrRegions || typeof c.linuxOcrRegions !== "object") c.linuxOcrRegions = {};\n  // Alpha20/21 used scanRegion for Resource Scanner. Mirror it into the independent-region map\n  // unless a newer config already has an explicit resourceSignature entry.\n  if (!("resourceSignature" in c.linuxOcrRegions) && c.scanRegion) c.linuxOcrRegions.resourceSignature = c.scanRegion;\n  if (process.platform !== "linux") return;\n  // These are reachability/interaction invariants on Linux, not ordinary preferences.\n  c.interactHotkey = "F";\n  c.holdToInteract = true;\n  c.moveHotkey = "Shift+F6";\n}\n\nconst freshInstall = !existsSync(configPath);\nlet config: Config = loadConfig();\nrepairArchVerseLinuxConfig(config);`;
  s = replaceOnce(s, loadAnchor, repairBlock, 'Linux config repair helper');

  s = replaceOnce(
    s,
    'const saveConfig = async (): Promise<void> => {\n  try {',
    'const saveConfig = async (): Promise<void> => {\n  repairArchVerseLinuxConfig(config);\n  try {',
    'repair-before-save',
  );

  // GET tells the Linux Settings renderer which controls are platform-owned. Repair first so a
  // value changed by another in-memory code path cannot leak a stale profile or hotkey to the UI.
  s = replaceOnce(
    s,
    '    const { syncToken, twitchUserToken, twitchRefreshToken: _refresh, ...rest } = config;',
    '    repairArchVerseLinuxConfig(config);\n    const { syncToken, twitchUserToken, twitchRefreshToken: _refresh, ...rest } = config;',
    'config GET repair',
  );
  s = replaceOnce(
    s,
    '    res.end(JSON.stringify({ ...rest, premium: entitled(), hasSyncToken: !!syncToken, syncTokenPreview, hasTwitchLogin: !!twitchUserToken, lanHost, port: PORT }));',
    '    res.end(JSON.stringify({ ...rest, platform: process.platform, premium: entitled(), hasSyncToken: !!syncToken, syncTokenPreview, hasTwitchLogin: !!twitchUserToken, lanHost, port: PORT }));',
    'config GET platform marker',
  );

  // Keep Resource Scanner's legacy scanRegion and the Linux multi-region map synchronized. The
  // four other regions remain independent and may be reset individually to their native defaults.
  const oldScanBlock = `    if (body.scanRegion === null) config.scanRegion = null;\n    else if (body.scanRegion && typeof body.scanRegion === "object") {\n      const r = body.scanRegion as ScanRegion;\n      const ok = [r.x, r.y, r.w, r.h].every((n) => typeof n === "number" && Number.isFinite(n))\n        && r.w > 0.02 && r.h > 0.01 && r.x >= 0 && r.y >= 0 && r.x + r.w <= 1.001 && r.y + r.h <= 1.001;\n      if (ok) config.scanRegion = { x: r.x, y: r.y, w: r.w, h: r.h };\n    }\n    if (typeof body.miningAutoShow === "boolean") config.miningAutoShow = body.miningAutoShow;`;
  const newScanBlock = `    if (body.scanRegion === null) {\n      config.scanRegion = null;\n      config.linuxOcrRegions = { ...(config.linuxOcrRegions || {}), resourceSignature: null };\n    } else if (body.scanRegion && typeof body.scanRegion === "object") {\n      const r = body.scanRegion as ScanRegion;\n      const ok = [r.x, r.y, r.w, r.h].every((n) => typeof n === "number" && Number.isFinite(n))\n        && r.w > 0.02 && r.h > 0.01 && r.x >= 0 && r.y >= 0 && r.x + r.w <= 1.001 && r.y + r.h <= 1.001;\n      if (ok) {\n        config.scanRegion = { x: r.x, y: r.y, w: r.w, h: r.h };\n        config.linuxOcrRegions = { ...(config.linuxOcrRegions || {}), resourceSignature: config.scanRegion };\n      }\n    }\n    if (body.linuxOcrRegions && typeof body.linuxOcrRegions === "object") {\n      const allowed = new Set(["resourceSignature", "fabricator", "mission", "claimContext", "refinery"]);\n      const next = { ...(config.linuxOcrRegions || {}) };\n      for (const [key, value] of Object.entries(body.linuxOcrRegions as Record<string, unknown>)) {\n        if (!allowed.has(key)) continue;\n        if (value === null) { next[key as keyof typeof next] = null; continue; }\n        if (!value || typeof value !== "object") continue;\n        const r = value as ScanRegion;\n        const ok = [r.x, r.y, r.w, r.h].every((n) => typeof n === "number" && Number.isFinite(n))\n          && r.w > 0.02 && r.h > 0.01 && r.x >= 0 && r.y >= 0 && r.x + r.w <= 1.001 && r.y + r.h <= 1.001;\n        if (ok) next[key as keyof typeof next] = { x: r.x, y: r.y, w: r.w, h: r.h };\n      }\n      config.linuxOcrRegions = next;\n      if (Object.prototype.hasOwnProperty.call(body.linuxOcrRegions, "resourceSignature"))\n        config.scanRegion = next.resourceSignature ?? null;\n    }\n    if (typeof body.miningAutoShow === "boolean") config.miningAutoShow = body.miningAutoShow;`;
  s = replaceOnce(s, oldScanBlock, newScanBlock, 'independent Linux OCR region persistence');

  // Linux never enters the Windows.Media.Ocr / PowerShell image-path branch. Electron has already
  // cropped and RapidOCR'd the exact Star Citizen region before POSTing lines here.
  s = replaceOnce(
    s,
    '    } else if (typeof body.path === "string" && body.path) {\n      const ocr = await ocrImage(body.path);',
    '    } else if (process.platform === "win32" && typeof body.path === "string" && body.path) {\n      // ARCHVERSE_LINUX_NO_WINDOWS_MEDIA_OCR\n      const ocr = await ocrImage(body.path);',
    'Windows OCR platform gate',
  );

  // Scope the POST response replacement to the config route so another {ok:true} endpoint cannot
  // accidentally become the target after upstream adds a route.
  const routeStart = '  if (url === "/api/config" && req.method === "POST") {';
  const routeEnd = '\n  // A mission giver\'s grind track';
  const a = s.indexOf(routeStart);
  const b = a >= 0 ? s.indexOf(routeEnd, a + routeStart.length) : -1;
  must(a >= 0 && b > a, '/api/config POST route boundaries missing');
  let route = s.slice(a, b);
  const okResponse = '    res.end(JSON.stringify({ ok: true }));';
  const appliedResponse = `    res.end(JSON.stringify({\n      ok: true,\n      platform: process.platform,\n      screenReading: {\n        fabCapture: config.fabCapture === true,\n        missionOcr: config.missionOcr === true,\n        miningAssistant: config.miningAssistant === true,\n        profile: config.screenReaderProfile,\n      },\n    }));`;
  route = replaceOnce(route, okResponse, appliedResponse, 'config POST applied-state response');
  s = s.slice(0, a) + route + s.slice(b);

  // Upstream's health self-test is WinRT/PowerShell. Linux OCR is the isolated RapidOCR worker in
  // capture.cjs. Preserve a REAL RapidOCR failure, then skip only the irrelevant Windows probe.
  s = replaceOnce(
    s,
    '  if (ocrHealth && Date.now() - ocrHealthAt < maxAgeMs) return ocrHealth;',
    '  if (process.platform !== "win32") {\n    return { ok: true, matched: true, skipped: true, lines: 0, text: "", ranAt: new Date().toISOString(), ms: 0,\n      reason: null, engine: "ArchVerse Linux RapidOCR (Electron capture)",\n      signal: { spawnError: null, exitedBeforeReady: false, lastExitCode: null, everReady: true } }; // ARCHVERSE_LINUX_OCR_HEALTH\n  }\n  if (ocrHealth && Date.now() - ocrHealthAt < maxAgeMs) return ocrHealth;',
    'Linux OCR health semantics',
  );

  // Fail loudly if the upstream log handoff/replay we depend on disappears. We intentionally do
  // not rewrite it: current upstream already does the right byte-based handoff and backup replay.
  must(s.includes('seedFromRotatedLog();'), 'rotated Game.log replay missing upstream');
  must(s.includes('seedEndsAt = buf.length;'), 'byte-exact live-log seed handoff missing upstream');
  must(s.includes('...(seedEndsAt != null ? { startPosition: seedEndsAt } : {})'), 'watcher does not start at seed byte offset');

  must(s.includes('ARCHVERSE_LINUX_CONFIG_ROOT'), 'canonical config marker missing');
  must(s.includes('ARCHVERSE_LINUX_CONFIG_CONTRACT'), 'Linux config contract marker missing');
  must(s.includes('ARCHVERSE_LINUX_OCR_REGION_CONFIG'), 'Linux OCR region config marker missing');
  must(s.includes('ARCHVERSE_LINUX_NO_WINDOWS_MEDIA_OCR'), 'Windows OCR is not hard-gated off Linux');
  must(s.includes('ARCHVERSE_LINUX_OCR_HEALTH'), 'Linux OCR health marker missing');
  return s;
}
