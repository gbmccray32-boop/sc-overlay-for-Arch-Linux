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

# RapidOCR uses the CPU execution provider in ArchVerse. The npm package also ships optional
# CUDA/TensorRT provider libraries; leaving those in an RPM makes Fedora's automatic ELF scanner
# turn an unused NVIDIA stack into mandatory dependencies. Remove only the optional providers and
# prove the real OCR engine still initializes immediately afterward.
ORT_LINUX="$OUT/app/node_modules/onnxruntime-node/bin/napi-v6/linux/x64"
rm -f \
  "$ORT_LINUX/libonnxruntime_providers_cuda.so" \
  "$ORT_LINUX/libonnxruntime_providers_tensorrt.so"

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
    {'kind':'improved','label':'Adaptive mining polling','text':'Scan HUD text or a valid signature opens the fast polling window, while the loop still backs off from measured OCR cost using the self-tuning 1.5x cadence.'},
    {'kind':'fixed','label':'RapidOCR health reporting','text':'RapidOCR worker failures are surfaced immediately and persisted to rapidocr-health.json before any optional fallback behavior can make the capture loop look healthy.'},
    {'kind':'fixed','label':'Exact Star Citizen session binding','text':'Linux screen reading remains bound to the detected StarCitizen process tree/Gamescope session rather than accepting unrelated foreground windows.'},
    {'kind':'fixed','label':'Contiguous game.log handoff','text':'The startup seed read hands its exact byte offset to the live watcher, so mission accepts written during startup are neither skipped nor replayed; a rotated shorter log safely starts from byte zero.'},
    {'kind':'fixed','label':'Mission completion isolation','text':'Completion cards apply to the mission that actually ended, and overlapping mission receipt windows are fenced so one contract cannot borrow another contract’s blueprint receipt.'},
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
grep -q 'Math.round(lastTickMs \* 1.5)' "$OUT/app/electron/capture.cjs"
! grep -q 'mining && archScanModeRead.active && cfg.rapidOcr' "$OUT/app/electron/capture.cjs"
grep -q 'ARCHVERSE_LINUX_RAPIDOCR_FAILURE_REPORT' "$OUT/app/electron/capture.cjs"
grep -q 'rapidocr-health.json' "$OUT/app/electron/capture.cjs"
grep -q 'ARCHVERSE_LINUX_EXACT_SC_SESSION_BINDING' "$OUT/app/electron/capture.cjs"
grep -q 'pid-bound-active-window' "$OUT/app/electron/capture.cjs"
grep -q 'ARCHVERSE_LINUX_WATCHER_HANDOFF' "$OUT/app/server/server.mjs"
grep -q 'startPosition: seedEndsAt' "$OUT/app/server/server.mjs"
grep -q 'ARCHVERSE_LINUX_MISSION_COMPLETION' "$OUT/app/server/server.mjs"
grep -q 'completedAtByMission.clear' "$OUT/app/server/server.mjs"

# Packaged engine check: model files + native ONNX binding + CPU provider must initialize here,
# before a distro package is allowed to be built from this payload.
(
  cd "$OUT/app"
  node "$ROOT/packaging/common/rapidocr-native-selftest.mjs"
)
test -s "$ORT_LINUX/onnxruntime_binding.node"
test -s "$ORT_LINUX/libonnxruntime.so.1"
test -s "$ORT_LINUX/libonnxruntime_providers_shared.so"
test ! -e "$ORT_LINUX/libonnxruntime_providers_cuda.so"
test ! -e "$ORT_LINUX/libonnxruntime_providers_tensorrt.so"

bash -n "$OUT/bin/sc-blueprint-tracker" "$OUT/doctor.sh"

mkdir -p "$(dirname -- "$OUTPUT_TAR")"
tar -C "$WORK" -czf "$OUTPUT_TAR" "ArchVerse-Overlay-$A21"
sha256sum "$OUTPUT_TAR"
