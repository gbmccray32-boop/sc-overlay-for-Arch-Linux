#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = process.argv[2];
if (!root) throw new Error("usage: apply-alpha23-candidate4.cjs <staged-candidate3-root>");
const must = (value, message) => { if (!value) throw new Error(`Alpha23 Candidate 4 apply: ${message}`); };
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const write = (relative, value) => fs.writeFileSync(path.join(root, relative), value);

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  must(first >= 0, `${label} anchor missing`);
  must(text.indexOf(before, first + before.length) < 0, `${label} anchor is not unique`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

function replaceRange(text, start, end, replacement, label) {
  const from = text.indexOf(start);
  must(from >= 0, `${label} start anchor missing`);
  const to = text.indexOf(end, from + start.length);
  must(to >= 0, `${label} end anchor missing`);
  return text.slice(0, from) + replacement + text.slice(to);
}

const templates = path.join(__dirname, "alpha23-candidate4");
for (const name of [
  "persistent-star-citizen-window.cjs",
  "star-citizen-window-helper.cjs",
  "star-citizen-window-preload.cjs",
  "mining-signature-confirmation.cjs",
]) {
  fs.copyFileSync(path.join(templates, name), path.join(root, "app/electron", name));
}

let transport = read("app/electron/mining-result-transport.cjs");
must(sha256(transport) === "6bad9ae0f2fd7c184a3cb001f7706f71902ee18ebecfcbe43fdcc5212677a391",
  "mining-result-transport.cjs is not the pinned Alpha23 Candidate 3 source");
transport = replaceOnce(transport,
  `  const grouped = /(?<!\\d)(\\d{1,3})\\s*(?:[.,'’:]\\s*|\\s+)(\\d{3})(?!\\d)/g;`,
  `  // ARCHVERSE_ALPHA23_NO_WHITESPACE_DIGIT_JOIN: a plain gap is often two unrelated HUD
  // values (Candidate 3 saw "30 100" and invented 30100). Only visible grouping punctuation
  // may join digits inside one OCR line.
  const grouped = /(?<!\\d)(\\d{1,3})\\s*[.,'’:]\\s*(\\d{3})(?!\\d)/g;`,
  "punctuated grouping only");
transport = replaceOnce(transport,
  `      const joined = \`${"${left.text} ${right.text}"}\`;
      if (MINING_LINE_NEGATIVE_CONTEXT.test(joined) || MINING_IDENTIFIER.test(joined)) continue;
      const signature = parseSignature(joined);`,
  `      // OCR may split a genuinely grouped number into two adjacent boxes. Admit only the exact
      // 1-3 digit + 3 digit shape; never concatenate arbitrary HUD phrases.
      const leftDigits = String(left.text || "").trim();
      const rightDigits = String(right.text || "").trim();
      if (!/^\\d{1,3}$/.test(leftDigits) || !/^\\d{3}$/.test(rightDigits)) continue;
      const joined = \`${"${leftDigits},${rightDigits}"}\`;
      if (MINING_LINE_NEGATIVE_CONTEXT.test(joined) || MINING_IDENTIFIER.test(joined)) continue;
      const signature = parseSignature(joined);`,
  "bounded split-line grouping");
write("app/electron/mining-result-transport.cjs", transport);

let server = read("app/server/server.mjs");
server = replaceOnce(server,
  `  const grouped = /(?<!\\d)(\\d{1,3})\\s*(?:[.,'’:]\\s*|\\s+)(\\d{3})(?!\\d)/g;`,
  `  // ARCHVERSE_ALPHA23_NO_WHITESPACE_DIGIT_JOIN: plain whitespace does not group HUD numbers.
  const grouped = /(?<!\\d)(\\d{1,3})\\s*[.,'’:]\\s*(\\d{3})(?!\\d)/g;`,
  "bundled sidecar punctuated grouping only");
server = replaceOnce(server,
  `      const joined = String(left.text) + " " + String(right.text);
      if (MINING_LINE_NEGATIVE_CONTEXT.test(joined) || MINING_IDENTIFIER.test(joined)) continue;
      const signature = parseSignature(joined);`,
  `      const leftDigits = String(left.text || "").trim();
      const rightDigits = String(right.text || "").trim();
      if (!/^\\d{1,3}$/.test(leftDigits) || !/^\\d{3}$/.test(rightDigits)) continue;
      const joined = leftDigits + "," + rightDigits;
      if (MINING_LINE_NEGATIVE_CONTEXT.test(joined) || MINING_IDENTIFIER.test(joined)) continue;
      const signature = parseSignature(joined);`,
  "bundled sidecar bounded split-line grouping");
write("app/server/server.mjs", server);

let capture = read("app/electron/capture.cjs");
must(sha256(capture) === "460ae3d56e04a06db9c1cc51a9fd0c165b9df4a4b3cd632b16d61ff53b399ca5",
  "capture.cjs is not the pinned Alpha23 Candidate 3 source");
capture = replaceOnce(capture,
  `const { createPersistentGamescopePipeWireCapture } = require("./persistent-gamescope-pipewire.cjs"); // ARCHVERSE_LINUX_GAMESCOPE_PIPEWIRE_CAPTURE`,
  `const { createPersistentGamescopePipeWireCapture } = require("./persistent-gamescope-pipewire.cjs"); // ARCHVERSE_LINUX_GAMESCOPE_PIPEWIRE_CAPTURE
const { createPersistentStarCitizenWindowCapture } = require("./persistent-star-citizen-window.cjs"); // ARCHVERSE_ALPHA23_ISOLATED_WINDOW_CAPTURE
const { createMiningSignatureConfirmation } = require("./mining-signature-confirmation.cjs"); // ARCHVERSE_ALPHA23_DISTINCT_FRAME_CONFIRMATION`,
  "persistent window imports");
capture = replaceOnce(capture,
  `const gamescopePipeWire = createPersistentGamescopePipeWireCapture({ logger: console }); // ARCHVERSE_LINUX_GAMESCOPE_PIPEWIRE_PERSISTENT_STREAM
process.once("exit", () => { rapidOcrClient.close(); gamescopePipeWire.close?.(); });`,
  `const gamescopePipeWire = createPersistentGamescopePipeWireCapture({ logger: console }); // ARCHVERSE_LINUX_GAMESCOPE_PIPEWIRE_PERSISTENT_STREAM
const starCitizenWindow = createPersistentStarCitizenWindowCapture({ logger: console });
process.once("exit", () => { rapidOcrClient.close(); gamescopePipeWire.close?.(); starCitizenWindow.close?.(); });`,
  "persistent window lifecycle");
capture = replaceOnce(capture,
  `const FAST_MS = 600;`,
  `const FAST_MS = 350;
const MINING_CONFIRM_MS = 250;`,
  "locked and confirmation cadence");
capture = replaceOnce(capture,
  `const MINING_VEHICLE_IDLE_MS = 800;`,
  `const MINING_VEHICLE_IDLE_MS = 500;`,
  "acquisition cadence");
capture = replaceRange(capture,
  `// ARCHVERSE_ALPHA23_WINDOW_CAPTURE_DEADLINE:`,
  `// ARCHVERSE_LINUX_CAPTURE_COORDINATE_CANONICALIZATION:`,
  `// ARCHVERSE_ALPHA23_WINDOW_STREAM_UPGRADE: the isolated helper warms without blocking the
// overlay. A healthy monitor fallback probes it at a bounded rate and promotes it after one frame.
let windowStreamNextProbeAt = 0;
const WINDOW_STREAM_PROBE_MS = 1000;
`,
  "obsolete main-process deadline state");
capture = replaceOnce(capture,
  `const CAPTURE_BACKENDS = Object.freeze({
  pipewire: captureWithGamescopePipeWire,
  gamescope: captureWithBoundedGameWindow,
  spectacle: captureWithSpectacle,
  electron: captureWithElectron,
});`,
  `const CAPTURE_BACKENDS = Object.freeze({
  pipewire: captureWithGamescopePipeWire,
  gamescope: captureWithGamescopeWindow,
  window: captureWithPersistentStarCitizenWindow,
  spectacle: captureWithSpectacle,
  electron: captureWithElectron,
});`,
  "capture backend table");
capture = replaceOnce(capture,
  `    streamStartedAt: got.streamStartedAt ?? null,
  };`,
  `    streamStartedAt: got.streamStartedAt ?? null,
    frameToken: (() => { try { const stat = fs.statSync(got.path); return \`gamescope-pipewire:\${got.path}:\${stat.mtimeMs}\`; } catch { return null; } })(),
  };`,
  "PipeWire distinct frame token");
capture = replaceRange(capture,
  `async function captureWithBoundedGameWindow(disp) {`,
  `async function captureWithElectron(disp) {`,
  `async function captureWithPersistentStarCitizenWindow(disp) {
  const session = scSession.current();
  if (!session || session.gamescopePid) throw new Error("isolated Star Citizen window stream is for non-Gamescope sessions only");
  const got = await starCitizenWindow.capture({ gamePid: session.gamePid, gameStartTicks: session.gameStartTicks });
  let full;
  try { full = nativeImage.createFromPath(got.path); }
  catch (error) { starCitizenWindow.stop?.("invalid PNG"); throw new Error(\`could not decode isolated Star Citizen window frame: \${error.message}\`); }
  if (!full || full.isEmpty()) {
    starCitizenWindow.stop?.("empty PNG");
    throw new Error("isolated Star Citizen window frame decoded empty");
  }
  const sourceSize = full.getSize();
  const image = normalizeFallbackImage(full, disp, "electron-star-citizen-window-stream");
  const size = image.getSize();
  return {
    image,
    width: size.width,
    height: size.height,
    method: "electron-star-citizen-window-stream",
    sourceName: got.sourceName || "Star Citizen",
    sourceSize,
    frameAgeMs: Math.max(0, Date.now() - Number(got.capturedAt || Date.now())),
    frameToken: \`window-stream:\${Number(got.videoTime).toFixed(6)}\`,
  };
}
`,
  "isolated persistent window implementation");
capture = replaceOnce(capture,
  `async function captureGame(winRect) {
  const disp = winRect ? screen.getDisplayMatching(winRect) : screen.getPrimaryDisplay();`,
  `let captureSequence = 0;
function recordCaptureResult(result, startedAt) {
  const captureMs = Math.max(0, Date.now() - startedAt);
  if (!result.frameToken) result.frameToken = \`${"${result.method}"}:\${++captureSequence}:\${Date.now()}\`;
  result.captureMs = captureMs;
  _lastOcrCaptureInfo = {
    ...(_lastOcrCaptureInfo || {}),
    method: result.method,
    sourceName: result.sourceName || "",
    captureMs,
    frameAgeMs: result.frameAgeMs ?? null,
    at: Date.now(),
  };
  return result;
}
async function captureGame(winRect) {
  const captureStartedAt = Date.now();
  const disp = winRect ? screen.getDisplayMatching(winRect) : screen.getPrimaryDisplay();`,
  "capture timing recorder");
capture = replaceOnce(capture,
  `      return result;
    } catch (e) {
      errors.push(\`pipewire-recovery: \${e?.message || e}\`);`,
  `      return recordCaptureResult(result, captureStartedAt);
    } catch (e) {
      errors.push(\`pipewire-recovery: \${e?.message || e}\`);`,
  "recovery timing return");
capture = replaceRange(capture,
  `  // Probe capture backends once, then reuse the winner for the session.`,
  `  for (const name of order) {`,
  `  // Gamescope keeps its field-proven direct PipeWire path and existing window fallback. A
  // normal Wine/XWayland launch uses the isolated persistent stream before monitor fallbacks.
  const hasGamescope = !!scSession.current()?.gamescopePid;
  const normalOrder = process.platform === "linux"
    ? (hasGamescope
      ? ["pipewire", "gamescope", "electron", "spectacle"]
      : (HOST_IS_WAYLAND ? ["window", "spectacle", "electron"] : ["window", "electron", "spectacle"]))
    : ["electron"];
  const probeWindowStream = process.platform === "linux" && !hasGamescope
    && preferredCaptureBackend && preferredCaptureBackend !== "window" && Date.now() >= windowStreamNextProbeAt;
  if (probeWindowStream) windowStreamNextProbeAt = Date.now() + WINDOW_STREAM_PROBE_MS;
  const probeFasterFallback = process.platform === "linux" && HOST_IS_WAYLAND
    && preferredCaptureBackend === "spectacle" && Date.now() >= fallbackUpgradeNextAttemptAt;
  if (probeFasterFallback) fallbackUpgradeNextAttemptAt = Date.now() + FALLBACK_UPGRADE_PROBE_MS;
  const order = probeWindowStream
    ? ["window", preferredCaptureBackend, ...normalOrder.filter((name) => name !== "window" && name !== preferredCaptureBackend)]
    : (probeFasterFallback
      ? [hasGamescope ? "gamescope" : "window", "electron", "spectacle"]
      : (preferredCaptureBackend
        ? [preferredCaptureBackend, ...normalOrder.filter((name) => name !== preferredCaptureBackend && name !== "pipewire")]
        : normalOrder));
`,
  "session-specific backend order");
capture = replaceOnce(capture,
  `      return result;
    } catch (e) {
      errors.push(\`${"${name}"}: \${e?.message || e}\`);`,
  `      return recordCaptureResult(result, captureStartedAt);
    } catch (e) {
      errors.push(\`${"${name}"}: \${e?.message || e}\`);`,
  "backend timing return");
capture = replaceOnce(capture,
  `  let sigBox = null, sigBoxAt = 0;
  const SIG_LOCK_MS = 12000;`,
  `  let sigBox = null, sigBoxAt = 0;
  const miningSignatureConfirmation = createMiningSignatureConfirmation();
  let miningConfirmationPending = false;
  const SIG_LOCK_MS = 12000;`,
  "confirmation state");
capture = replaceOnce(capture,
  `capture=\${_lastOcrCaptureInfo?.method || "unknown"}`,
  `capture=\${_lastOcrCaptureInfo?.method || "unknown"}:\${_lastOcrCaptureInfo?.captureMs ?? "?"}ms`,
  "capture timing heartbeat");
capture = replaceOnce(capture,
  `          const miningPayload = {
            lines, w: region.width, h: region.height, miningCrop: true,
            commitMining: true, pollMs: rate,
            ocrRegion: "resourceSignature", offsetX: region.x, offsetY: region.y,
            frameW: cap.width, frameH: cap.height,
          };
          miningResultTransport.submit(miningPayload, {
            localResult: rr3,
            captureMethod: cap.method,
            queuedAt: Date.now(),
          });
          stage.miningIpc = "queued";
          const rr3Observed`,
  `          const confirmation = rr3.kind === "mineable"
            ? miningSignatureConfirmation.observe(rr3, cap.frameToken)
            : miningSignatureConfirmation.observe(null, cap.frameToken);
          miningConfirmationPending = confirmation.status === "pending" || miningSignatureConfirmation.isPending();
          const miningPayload = {
            lines, w: region.width, h: region.height, miningCrop: true,
            commitMining: confirmation.status === "confirmed", pollMs: rate,
            ocrRegion: "resourceSignature", offsetX: region.x, offsetY: region.y,
            frameW: cap.width, frameH: cap.height,
          };
          miningResultTransport.submit(miningPayload, {
            localResult: rr3,
            confirmationStatus: confirmation.status,
            captureMethod: cap.method,
            queuedAt: Date.now(),
          });
          stage.miningIpc = confirmation.status === "confirmed" ? "commit-queued" : "observation-queued";
          const rr3Observed`,
  "two-frame confirmation transport");
capture = replaceOnce(capture,
  `              const commitState = "queued";
              console.log(\`[mining-ocr] signature \${rr3.signature} via \${cap.method}; rs="\${miningSignatureLabel(rr3SignatureClass)}" crop=\${stage.region} scale=\${MINING_OCR_SCALE} ocr=\${stage.rapidOcr}ms commit=\${commitState} text="\${miningOcrSample}"\`);`,
  `              const commitState = confirmation.status === "confirmed" ? "queued" : "pending-distinct-frame";
              console.log(\`[mining-ocr] signature \${rr3.signature} via \${cap.method}; rs="\${miningSignatureLabel(rr3SignatureClass)}" crop=\${stage.region} scale=\${MINING_OCR_SCALE} ocr=\${stage.rapidOcr}ms commit=\${commitState} text="\${miningOcrSample}"\`);`,
  "confirmation diagnostic");
capture = replaceOnce(capture,
  `          if (rr3.kind === "mineable" && rr3SignatureAllowed) {
            if (rr3.signature !== lastMiningOcrSig || miningOcrNow - lastMiningOcrLogAt >= 5000) {`,
  `          if (rr3.kind === "mineable" && rr3SignatureAllowed) {
            const miningOcrKey = \`${"${rr3.signature}"}:\${confirmation.status}\`;
            if (miningOcrKey !== lastMiningOcrSig || miningOcrNow - lastMiningOcrLogAt >= 5000) {`,
  "confirmation diagnostic key");
capture = replaceOnce(capture,
  `            lastMiningOcrSig = rr3.signature;`,
  `            lastMiningOcrSig = miningOcrKey;`,
  "confirmation diagnostic state");
capture = replaceOnce(capture,
  `          if (rr3.kind === "mineable" && rr3SignatureAllowed && rr3.pin && rr3.text) {
            read = { ...read, kind: "mineable", signature: rr3.signature, raw: rr3.raw,
              pin: rr3.pin, text: rr3.text, miningTransportQueued: true };
            sigBox = rr3.text;
            sigBoxAt = Date.now();`,
  `          if (rr3.kind === "mineable" && rr3SignatureAllowed && rr3.pin && rr3.text) {
            // A first sighting narrows the next OCR crop but cannot change Mining state. Only the
            // same value at the same location on a distinct source frame is committed.
            if (confirmation.status === "confirmed") {
              read = { ...read, kind: "mineable", signature: rr3.signature, raw: rr3.raw,
                pin: rr3.pin, text: rr3.text, miningTransportQueued: true };
            }
            sigBox = rr3.text;
            sigBoxAt = Date.now();`,
  "confirmed read authority");
capture = replaceOnce(capture,
  `      // ARCHVERSE_LINUX_MINING_STABLE_CADENCE: Linux Mining has two deliberate rates. A valid
      // signature uses 900ms; in-vehicle acquisition uses 1200ms. Single-flight OCR prevents
      // overlap, so small timing jitter cannot produce 909/913/941ms scheduler flapping.`,
  `      // ARCHVERSE_LINUX_MINING_STABLE_CADENCE: acquisition uses 500ms, a pending candidate
      // requests a distinct frame after 250ms, and a confirmed lock uses 350ms. Single-flight OCR
      // prevents overlap, so a slow frame cannot create concurrent capture or OCR work.`,
  "cadence documentation");
capture = replaceOnce(capture,
  `      const linuxMiningRate = vehiclePresence.active === true
        ? (Date.now() < fastUntil ? FAST_MS : MINING_VEHICLE_IDLE_MS)
        : POLL_MS;`,
  `      const linuxMiningRate = vehiclePresence.active === true
        ? (miningConfirmationPending ? MINING_CONFIRM_MS : (Date.now() < fastUntil ? FAST_MS : MINING_VEHICLE_IDLE_MS))
        : POLL_MS;`,
  "confirmation-aware cadence");
capture = replaceOnce(capture,
  `        if (Number.isFinite(signature)) {
          console.log(\`[mining-commit] signature \${signature} acknowledged; authority=\${commit?.confirmed === true ? "vehicle" : "on-foot"} result=\${commit?.used === true ? "used" : "refused"} source=\${commit?.source || response?.vehiclePresence?.source || "none"}\`);
        } else if (local?.kind !== "none") {`,
  `        if (Number.isFinite(signature) && commit?.handled === true) {
          console.log(\`[mining-commit] signature \${signature} acknowledged; authority=\${commit.confirmed === true ? "vehicle" : "on-foot"} result=\${commit.used === true ? "used" : "refused"} source=\${commit.source || response?.vehiclePresence?.source || "none"}\`);
        } else if (local?.kind !== "none" && item?.context?.confirmationStatus !== "pending") {`,
  "pending observation commit log");
capture = replaceOnce(capture,
  `fingerprintDistance, linuxOcrRegionPixels, expandMiningAcquisitionRegion } };`,
  `fingerprintDistance, linuxOcrRegionPixels, expandMiningAcquisitionRegion, recordCaptureResult } };`,
  "timing test export");
write("app/electron/capture.cjs", capture);

const packagePath = "app/package.json";
const pkg = JSON.parse(read(packagePath));
must(pkg.version === "0.1.46-r31.alpha23.candidate3", `unexpected package version ${pkg.version}`);
pkg.version = "0.1.46-r31.alpha23.candidate4";
pkg.description = "ArchVerse Alpha23 Candidate 4: isolated persistent Wine capture and distinct-frame Mining confirmation";
write(packagePath, JSON.stringify(pkg, null, 2) + "\n");

write("FIELD-TEST.md", `# ArchVerse Alpha23 Candidate 4

Version: 0.1.46-r31.alpha23.candidate4. Internal field candidate, not a release.

Candidate 4 starts from the exact checksum-verified Candidate 3 artifact. On normal Lug-Helper
Wine/XWayland launches, a separate Electron helper discovers the exact Star Citizen window once
and keeps one MediaStream warm. A KDE source-discovery stall can delay only that helper; it cannot
freeze overlay input or the Mining scheduler. Stale or overdue stream frames restart only the
helper, and monitor/Spectacle fallbacks remain bounded. Direct Gamescope PipeWire is unchanged.

Mining acquisition now runs at 500ms, requests a second distinct frame after 250ms, then tracks a
confirmed signature at 350ms. The same exact-catalog value must appear at approximately the same
location on two source frames before the sidecar can commit or announce it. Plain whitespace no
longer groups separate HUD values, so text such as "30 100" cannot become a false 30100. Visible
punctuation and tightly adjacent OCR boxes still support legitimate grouped signatures.

Close ArchVerse, extract this folder, then run ./bin/sc-blueprint-tracker. Test first with the same
normal non-Gamescope Lug-Helper launch used for Candidate 3. Verify the log promotes capture to
electron-star-citizen-window-stream, Mining remains responsive through Alt-Tab and a long session,
and each new value logs pending-distinct-frame before its first commit. Then test Gamescope and
verify capture remains gamescope-pipewire. Save complete electron.log and sidecar.log.
`);

const provenancePath = "ALPHA23-PROVENANCE.json";
const provenance = JSON.parse(read(provenancePath));
must(provenance.version === "0.1.46-r31.alpha23.candidate3", "Candidate 3 provenance missing");
provenance.version = "0.1.46-r31.alpha23.candidate4";
provenance.candidate3Artifact = 10182826990;
provenance.candidate3Run = 34556433971;
provenance.candidate3ArchiveSha256 = "1df91bcf116816f7fcff43d25dd317b87ffee0bec7c590742659d8cbb870de3f";
for (const relative of [
  "app/electron/capture.cjs",
  "app/electron/mining-result-transport.cjs",
  "app/electron/persistent-star-citizen-window.cjs",
  "app/electron/star-citizen-window-helper.cjs",
  "app/electron/star-citizen-window-preload.cjs",
  "app/electron/mining-signature-confirmation.cjs",
  "app/server/server.mjs",
]) provenance.protectedFiles[relative] = sha256(read(relative));
provenance.fieldVerified = false;
write(provenancePath, JSON.stringify(provenance, null, 2) + "\n");

console.log("Alpha23 Candidate 4 apply OK: isolated persistent window stream, distinct-frame confirmation, and safe grouping");
