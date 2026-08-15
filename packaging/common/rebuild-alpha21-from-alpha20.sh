#!/usr/bin/env bash
set -euo pipefail

ALPHA20_ARCHIVE="${1:?usage: rebuild-alpha21-from-alpha20.sh ALPHA20_ARCHIVE OUTPUT_TAR}"
OUTPUT_TAR="${2:?usage: rebuild-alpha21-from-alpha20.sh ALPHA20_ARCHIVE OUTPUT_TAR}"
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
A20='0.1.42-r31-alpha.20'
A21='0.1.42-r31-alpha.21'
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/unpack"
tar -xzf "$ALPHA20_ARCHIVE" -C "$WORK/unpack"
SRC="$WORK/unpack/ArchVerse-Overlay-$A20"
OUT="$WORK/ArchVerse-Overlay-$A21"
[[ -s "$SRC/app/electron/capture.cjs" && -s "$SRC/app/server/overlay/archverse-resource-scanner.js" ]] || {
  echo 'Alpha 20 release payload is incomplete' >&2
  exit 2
}

cp -a "$SRC" "$OUT"
python3 "$ROOT/linux-port/alpha21-runtime-log-fixes.py" "$OUT"

# Distro-neutral Linux policies are applied BEFORE the package split. Arch, Fedora/Nobara and
# Debian/Ubuntu therefore receive the same application behavior and future upstream changes fail
# here rather than silently changing one distribution's runtime semantics.
node "$ROOT/packaging/common/enforce-native-linux-interaction-policy.cjs" \
  "$OUT/app/electron/main.cjs"
node "$ROOT/packaging/common/enforce-native-linux-runtime-policy.cjs" "$OUT"
node "$ROOT/packaging/common/enforce-native-mining-pipeline-policy.cjs" "$OUT"
node "$ROOT/packaging/common/enforce-native-mining-liveness-policy.cjs" "$OUT"
node "$ROOT/packaging/common/enforce-native-overlay-realtime-policy.cjs" "$OUT"

# The native package families supported here are all glibc distributions. Keep only native
# binaries that can actually be selected on those hosts. Fedora's automatic ELF dependency scan
# otherwise turns dormant provider/prebuild files into mandatory runtime dependencies even though
# ArchVerse never loads them on these systems.
#
# RapidOCR uses the CPU ONNX execution provider, so CUDA/TensorRT providers are unnecessary.
ORT_LINUX="$OUT/app/node_modules/onnxruntime-node/bin/napi-v6/linux/x64"
rm -f \
  "$ORT_LINUX/libonnxruntime_providers_cuda.so" \
  "$ORT_LINUX/libonnxruntime_providers_tensorrt.so"

# Koffi ships both glibc and musl x86_64 prebuilds. Arch, CachyOS, Fedora, Nobara, Debian and
# Ubuntu use glibc, so the musl binary can never be selected by our native targets. Keeping it in
# the RPM creates a false libc.musl-x86_64.so.1 dependency. Remove only that unused prebuild.
KOFFI_MUSL_DIR="$OUT/app/node_modules/@koromix/koffi-linux-x64/musl_x64"
rm -rf "$KOFFI_MUSL_DIR"

python3 - "$OUT/app/package.json" <<'PY'
from pathlib import Path
import json, sys
p=Path(sys.argv[1]); d=json.loads(p.read_text())
d['version']='0.1.42-r31-alpha.21'
d['description']='Community Linux port of SubliminalsTV SC Overlay 0.1.42 — Alpha 21 Resource Scanner with durable native Linux interaction, mining, OCR, session and watcher policies'
p.write_text(json.dumps(d, indent=2)+'\n')
PY

python3 - "$OUT/app/server/overlay/changelog.json" <<'PY'
from pathlib import Path
import json, sys
p=Path(sys.argv[1]); d=json.loads(p.read_text())
entry={
  'date':'2026-08-15T05:30:00Z',
  'notes':[
    {'kind':'fixed','label':'OCR watchdog overlap','text':'A slow Fabricator/Mining OCR tick is no longer force-unlocked while its async native/OCR work is still alive. Alpha 21 skips overlapping polls and lets only the original tick release the busy guard.'},
    {'kind':'fixed','label':'KDE Spectacle screenshot race','text':'Wayland screenshot capture waits longer for a stable, decodable PNG before declaring the capture backend unavailable.'},
    {'kind':'improved','label':'Linux hover-scoped interaction latch','text':'After a widget is clicked and the interaction key is released, it stays interactive only while the pointer remains inside a classified widget. Leaving all widgets restores click-through and the exact pre-overlay window focus.'},
    {'kind':'fixed','label':'30-second drag-lock watchdog','text':'A renderer that loses pointer-up can no longer leave the transparent canvas permanently interactive; stale overlay and mining drag locks are released after 30 seconds.'},
    {'kind':'improved','label':'Mining signature authority','text':'When Mining is armed, RapidOCR always reads the configured signature crop. A valid parsed signature is authoritative; radar/scan-mode recognition is diagnostic-only and cannot gate, clear, or discard a signature.'},
    {'kind':'fixed','label':'Authoritative Resource Scanner handoff','text':'A legal signature parsed by /api/screen-read now updates the Resource Scanner immediately instead of depending on a second Electron-to-sidecar POST before resource lookup and notifications can occur.'},
    {'kind':'fixed','label':'Signature OCR token recovery','text':'Resource signatures remain readable when OCR returns a space instead of the thousands separator or splits values such as 18 and 000 into adjacent same-row tokens.'},
    {'kind':'fixed','label':'RS 3,000 resource class','text':'The server now accepts RS 3,000 as the hand-mineable gemstone resource class, matching the Resource Scanner UI instead of rejecting it as an unknown signature.'},
    {'kind':'fixed','label':'Mining liveness','text':'Mining polling is bounded to 900-3000 ms and continues against the already-bound Star Citizen source while ArchVerse briefly owns focus.'},
    {'kind':'fixed','label':'Focus-independent Resource Scanner','text':'The main overlay renderer is not background-throttled, so Resource Scanner SSE updates, scan-read diagnostics, flashes, chimes and voice announcements do not depend on hovering the widget, pressing F, or Alt-Tabbing.'},
    {'kind':'fixed','label':'RapidOCR health reporting','text':'RapidOCR worker failures are surfaced immediately and persisted to rapidocr-health.json before any optional fallback behavior can make the capture loop look healthy.'},
    {'kind':'fixed','label':'Exact Star Citizen session binding','text':'Linux screen reading remains bound to the detected StarCitizen process tree/Gamescope session rather than accepting unrelated foreground windows.'},
    {'kind':'fixed','label':'Contiguous game.log handoff','text':'The startup seed read hands its exact byte offset to the live watcher, so mission accepts written during startup are neither skipped nor replayed; a rotated shorter log safely starts from byte zero.'},
    {'kind':'fixed','label':'Mission completion isolation','text':'Completion cards apply to the mission that actually ended, and overlapping mission receipt windows are fenced so one contract cannot borrow another contract’s blueprint receipt.'},
    {'kind':'improved','label':'Native dependency hygiene','text':'The three glibc package targets omit unused CUDA/TensorRT ONNX providers and Koffi’s musl-only prebuild, preventing Fedora from inventing NVIDIA or musl runtime dependencies.'},
  ]
}
out={'0.1.42-r31-alpha.21':entry}; out.update(d)
p.write_text(json.dumps(out, indent=2)+'\n')
PY

python3 - "$OUT" <<'PY'
from pathlib import Path
import sys
root=Path(sys.argv[1])
for rel in ['install-cachyos.sh','doctor.sh','bin/sc-blueprint-tracker','README.md']:
    p=root/rel
    if not p.exists(): continue
    s=p.read_text(errors='replace')
    s=s.replace('0.1.42-r31-alpha.20','0.1.42-r31-alpha.21')
    s=s.replace('r31 alpha 20','r31 alpha 21').replace('r31 Alpha 20','r31 Alpha 21')
    s=s.replace('r31-alpha20','r31-alpha21')
    p.write_text(s)
PY

# Syntax + original Alpha21 invariants.
node --check "$OUT/app/electron/capture.cjs"
node --check "$OUT/app/electron/main.cjs"
node --check "$OUT/app/server/server.mjs"
find "$OUT/app/electron" -type f \( -name '*.cjs' -o -name '*.js' -o -name '*.mjs' \) -print0 | xargs -0 -n1 node --check
grep -q '0.1.42-r31-alpha.21' "$OUT/app/package.json"
grep -q 'Resource Scanner' "$OUT/app/server/overlay/mining.html"
grep -q 'salvageConfirmed === true' "$OUT/app/server/overlay/archverse-resource-scanner.js"
grep -q 'timeoutMs = 6000' "$OUT/app/electron/capture.cjs"
grep -q 'complete decodable screenshot' "$OUT/app/electron/capture.cjs"
grep -q 'prior OCR tick still running after' "$OUT/app/electron/capture.cjs"
grep -q 'skipping overlap' "$OUT/app/electron/capture.cjs"
! grep -q 'tick watchdog: a prior tick hung — re-arming the loop' "$OUT/app/electron/capture.cjs"
grep -q 'queueDepth' "$OUT/app/electron/rapidocr-client.cjs"
grep -q 'Cross-origin requests are not accepted.' "$OUT/app/server/server.mjs"
grep -q 'scan-mode-gate.cjs' "$OUT/app/electron/capture.cjs"

# Permanent Linux interaction invariants.
grep -q 'ARCHVERSE_LINUX_HOVER_SCOPED_LATCH' "$OUT/app/electron/main.cjs"
grep -q 'ARCHVERSE_LINUX_HOVER_SCOPED_LATCH_FUP_REARM' "$OUT/app/electron/main.cjs"
grep -q 'ARCHVERSE_LINUX_GAME_FOCUS_HANDOFF' "$OUT/app/electron/main.cjs"
grep -q 'ARCHVERSE_LINUX_DRAG_LOCK_WATCHDOG' "$OUT/app/electron/main.cjs"
grep -q 'LINUX_DRAG_LOCK_WATCHDOG_MS = 30000' "$OUT/app/electron/main.cjs"
grep -q '\[linux-interaction\] pointer left all widgets; overlay released and previous focus restored' "$OUT/app/electron/main.cjs"

# Permanent Linux mining/OCR/session/watcher/mission invariants.
grep -q 'ARCHVERSE_LINUX_MINING_SIGNATURE_AUTHORITY' "$OUT/app/electron/capture.cjs"
grep -q 'if (mining && cfg.rapidOcr !== false)' "$OUT/app/electron/capture.cjs"
grep -q 'ARCHVERSE_LINUX_BOUND_MINING_CADENCE' "$OUT/app/electron/capture.cjs"
grep -q 'Math.min(POLL_MS, floor)' "$OUT/app/electron/capture.cjs"
! grep -q 'mining && archScanModeRead.active && cfg.rapidOcr' "$OUT/app/electron/capture.cjs"
grep -q 'ARCHVERSE_LINUX_RAPIDOCR_FAILURE_REPORT' "$OUT/app/electron/capture.cjs"
grep -q 'rapidocr-health.json' "$OUT/app/electron/capture.cjs"
grep -q 'ARCHVERSE_LINUX_EXACT_SC_SESSION_BINDING' "$OUT/app/electron/capture.cjs"
grep -q 'pid-bound-active-window' "$OUT/app/electron/capture.cjs"
grep -q 'ARCHVERSE_LINUX_MINING_OCR_DIAGNOSTICS' "$OUT/app/electron/capture.cjs"
grep -q 'ARCHVERSE_LINUX_REALTIME_OVERLAY_RENDERER' "$OUT/app/electron/main.cjs"
grep -q 'backgroundThrottling: false' "$OUT/app/electron/main.cjs"
grep -q 'ARCHVERSE_LINUX_WATCHER_HANDOFF' "$OUT/app/server/server.mjs"
grep -q 'startPosition: seedEndsAt' "$OUT/app/server/server.mjs"
grep -q 'ARCHVERSE_LINUX_MISSION_COMPLETION' "$OUT/app/server/server.mjs"
grep -q 'completedAtByMission.clear' "$OUT/app/server/server.mjs"

# Resource Scanner signature pipeline invariants. A parsed legal signature is itself authoritative;
# no second HTTP hop or radar/pin state may be required for lookup/UI notification state.
grep -q 'ARCHVERSE_LINUX_RESOURCE_SIGNATURE_VOCABULARY' "$OUT/app/server/server.mjs"
grep -q 'ARCHVERSE_LINUX_SIGNATURE_PARSE_ROBUSTNESS' "$OUT/app/server/server.mjs"
grep -q 'ARCHVERSE_LINUX_PARSED_SIGNATURE_COMMIT' "$OUT/app/server/server.mjs"
grep -q 'result.outcome = mining.applyMineableRead(result.signature, false)' "$OUT/app/server/server.mjs"

# Exercise the actual sidecar parser -> MiningTracker -> SSE state path before any distro package
# is allowed to be produced. This also reapplies the liveness/realtime policies idempotently and
# syntax-checks their outputs, preventing focus/hover/F-dependent scanner behavior from regressing.
node "$ROOT/packaging/common/native-mining-pipeline-selftest.mjs" "$OUT"

# Packaged engine check: model files + native ONNX binding + CPU provider must initialize here,
# before a distro package is allowed to be built from this payload. This also proves deleting the
# unused provider/prebuild variants did not remove anything needed by RapidOCR.
(
  cd "$OUT/app"
  node "$ROOT/packaging/common/rapidocr-native-selftest.mjs"
)
test -s "$ORT_LINUX/onnxruntime_binding.node"
test -s "$ORT_LINUX/libonnxruntime.so.1"
test -s "$ORT_LINUX/libonnxruntime_providers_shared.so"
test ! -e "$ORT_LINUX/libonnxruntime_providers_cuda.so"
test ! -e "$ORT_LINUX/libonnxruntime_providers_tensorrt.so"
test ! -e "$KOFFI_MUSL_DIR"
if find "$OUT/app/node_modules/@koromix/koffi-linux-x64" -type f -print0 | \
    xargs -0 -r strings 2>/dev/null | grep -q 'libc\.musl-x86_64\.so\.1'; then
  echo 'unused musl Koffi dependency remains in native glibc payload' >&2
  exit 1
fi

bash -n "$OUT/bin/sc-blueprint-tracker" "$OUT/doctor.sh"

mkdir -p "$(dirname -- "$OUTPUT_TAR")"
tar -C "$WORK" -czf "$OUTPUT_TAR" "ArchVerse-Overlay-$A21"
sha256sum "$OUTPUT_TAR"
