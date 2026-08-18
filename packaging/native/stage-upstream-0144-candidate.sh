#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
ALPHA21_PAYLOAD="${1:-${ALPHA21_PAYLOAD:-}}"
ELECTRON_ARCHIVE="${2:-${ELECTRON_ARCHIVE:-}}"
OUT="${3:-${NATIVE_STAGE_DIR:-}}"
VERSION="0.1.44-r31.alpha22.candidate1"

[[ -n "$ALPHA21_PAYLOAD" && -f "$ALPHA21_PAYLOAD" ]] || { echo "missing verified Alpha21 payload: $ALPHA21_PAYLOAD" >&2; exit 2; }
[[ -n "$ELECTRON_ARCHIVE" && -f "$ELECTRON_ARCHIVE" ]] || { echo "missing Electron archive: $ELECTRON_ARCHIVE" >&2; exit 2; }
[[ -n "$OUT" ]] || { echo "usage: $0 <alpha21-payload.tar.gz> <electron-linux-x64.zip> <output-dir>" >&2; exit 2; }
[[ -s "$ROOT/build/server/server.mjs" ]] || { echo "run npm run build:server before staging the upstream candidate" >&2; exit 2; }

TMP="${RUNNER_TEMP:-/tmp}/archverse-upstream-0144-stage-$$"
trap 'rm -rf "$TMP"' EXIT
rm -rf "$TMP" "$OUT"
mkdir -p "$TMP/base" "$OUT"

echo "[upstream-candidate] extracting the already-verified Alpha21 Linux application payload"
tar --no-same-owner -xzf "$ALPHA21_PAYLOAD" -C "$TMP/base"
BASE="$(find "$TMP/base" -mindepth 1 -maxdepth 1 -type d -name 'ArchVerse-Overlay-0.1.42-r31-alpha.21*' -print -quit)"
[[ -n "$BASE" ]] || { echo "verified Alpha21 payload root not found" >&2; exit 3; }
for f in \
  app/electron/main.cjs \
  app/electron/preload.cjs \
  app/electron/capture.cjs \
  app/electron/native-linux-ocr.cjs \
  app/electron/rapidocr-client.cjs \
  app/electron/rapidocr-worker.cjs \
  app/server/server.mjs \
  app/server/overlay/linux-ocr-region-manager.js \
  bin/sc-blueprint-tracker; do
  [[ -s "$BASE/$f" ]] || { echo "verified Alpha21 payload missing $f" >&2; exit 3; }
done

# Prove the trusted payload is the Linux runtime we intend to preserve BEFORE changing anything.
grep -q 'ARCHVERSE_LINUX_HOVER_SCOPED_LATCH' "$BASE/app/electron/main.cjs"
grep -q 'ARCHVERSE_LINUX_GAME_FOCUS_HANDOFF' "$BASE/app/electron/main.cjs"
grep -q 'ARCHVERSE_LINUX_DRAG_LOCK_WATCHDOG' "$BASE/app/electron/main.cjs"
grep -q 'ARCHVERSE_LINUX_REALTIME_OVERLAY_RENDERER' "$BASE/app/electron/main.cjs"
grep -q 'ARCHVERSE_LINUX_MINING_SIGNATURE_AUTHORITY' "$BASE/app/electron/capture.cjs"
grep -q 'ARCHVERSE_LINUX_BOUND_MINING_CADENCE' "$BASE/app/electron/capture.cjs"
grep -q 'ARCHVERSE_LINUX_PER_WIDGET_OCR_REGIONS' "$BASE/app/electron/capture.cjs"
grep -q 'ARCHVERSE_LINUX_EXACT_SC_SESSION_BINDING' "$BASE/app/electron/capture.cjs"
grep -q 'ARCHVERSE_LINUX_OCR_CONTRACT_V1' "$BASE/app/electron/native-linux-ocr.cjs"

cp -a "$BASE/." "$OUT/"

echo "[upstream-candidate] replacing only platform-neutral sidecar/UI/data with current upstream build"
rm -rf "$OUT/app/server"
mkdir -p "$OUT/app/server"
cp -a "$ROOT/build/server/." "$OUT/app/server/"

# Port only the shell behavior current upstream requires. This adapter fails if the trusted Linux
# ownership/focus seams are not present and explicitly rejects Win32 NOACTIVATE on Linux.
node "$ROOT/packaging/common/port-upstream-0144-shell.cjs" "$OUT"

python3 - "$OUT/app/package.json" "$VERSION" <<'PY'
from pathlib import Path
import json, sys
p=Path(sys.argv[1]); version=sys.argv[2]; d=json.loads(p.read_text())
d['version']=version
d['description']='ArchVerse native Linux candidate: upstream 0.1.44+ behavior on the verified Alpha21 Linux interaction/capture runtime'
p.write_text(json.dumps(d, indent=2)+'\n')
PY

python3 - "$OUT/app/server/overlay/changelog.json" "$VERSION" <<'PY'
from pathlib import Path
import json, sys
p=Path(sys.argv[1]); version=sys.argv[2]; d=json.loads(p.read_text())
entry={
  'date':'2026-08-18T02:00:00Z',
  'notes':[
    {'kind':'new','label':'Upstream 0.1.44+ on Linux','text':'Carries contract search, idle mission/blueprint progress, next-rank routes, richer mission metadata, universal widget hotkeys, diagnostics, localization fixes, Hauling Advisor, stow-view improvements and post-restart hauling persistence.'},
    {'kind':'improved','label':'Linux focus parity','text':'Ports the new non-stealing overlay focus intent through ArchVerse’s verified Linux ownership model instead of importing the Windows NOACTIVATE mechanism.'},
    {'kind':'improved','label':'Independent Linux OCR regions preserved','text':'Resource, Fabricator, Mission, Claim/context and Refinery continue to use independent normalized game-frame OCR crops while the current upstream UI/server is in use.'},
    {'kind':'fixed','label':'Rotated log continuity','text':'Replays the newest recent Game.log backup before the live log while retaining the exact byte-offset handoff into the tail watcher.'},
  ]
}
out={version:entry}
for k,v in d.items():
    if k != version: out[k]=v
p.write_text(json.dumps(out, indent=2)+'\n')
PY

# Bundle the same pinned Electron runtime used by the native package work. Do not change the
# inherited Linux launcher flags; only replace its distro-specific electron42 default.
echo "[upstream-candidate] bundling pinned Electron 42.7.1"
rm -rf "$OUT/runtime/electron"
mkdir -p "$OUT/runtime/electron"
unzip -q "$ELECTRON_ARCHIVE" -d "$OUT/runtime/electron"
[[ -x "$OUT/runtime/electron/electron" ]] || chmod +x "$OUT/runtime/electron/electron"
if [[ -f "$OUT/runtime/electron/chrome-sandbox" ]]; then chmod 4755 "$OUT/runtime/electron/chrome-sandbox"; fi

python3 - "$OUT/bin/sc-blueprint-tracker" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); s=p.read_text()
old='''APP_DIR="$(cd -- "$(dirname -- "$SELF")/../app" && pwd)"\n\nELECTRON_BIN="${SC_TRACKER_ELECTRON_BIN:-/usr/bin/electron42}"\nif [[ ! -x "$ELECTRON_BIN" ]]; then\n  printf 'SC Blueprint Tracker requires Electron 42 at %s.\\n' "$ELECTRON_BIN" >&2\n  printf 'Install it with: sudo pacman -S --needed electron42\\n' >&2\n  exit 127\nfi'''
new='''APP_DIR="$(cd -- "$(dirname -- "$SELF")/../app" && pwd)"\nRUNTIME_DIR="$(cd -- "$(dirname -- "$SELF")/../runtime/electron" && pwd)"\n\nELECTRON_BIN="${SC_TRACKER_ELECTRON_BIN:-$RUNTIME_DIR/electron}"\nif [[ ! -x "$ELECTRON_BIN" ]]; then\n  printf 'ArchVerse Overlay bundled Electron runtime is missing at %s.\\n' "$ELECTRON_BIN" >&2\n  printf 'Reinstall the ArchVerse Overlay package for your distribution.\\n' >&2\n  exit 127\nfi'''
if s.count(old) != 1:
    raise SystemExit(f'native launcher Electron anchor count={s.count(old)}; expected 1')
s=s.replace(old,new,1)
s=s.replace("  printf 'Install it with: sudo pacman -S --needed nodejs\\n' >&2\n", "  printf 'Install the nodejs package with your distribution package manager.\\n' >&2\n", 1)
p.write_text(s)
PY

rm -f "$OUT/install-cachyos.sh" "$OUT/uninstall-cachyos.sh" "$OUT/install-input-access.sh"
chmod +x "$OUT/bin/sc-blueprint-tracker" "$OUT/doctor.sh" "$OUT/verify-alpha.sh" 2>/dev/null || true

# Native binary hygiene remains inherited from Alpha21. Recheck rather than mutating the trusted
# app dependencies during an upstream behavior port.
ONNX_LINUX_DIR="$OUT/app/node_modules/onnxruntime-node/bin/napi-v6/linux/x64"
KOFFI_MUSL_DIR="$OUT/app/node_modules/@koromix/koffi-linux-x64/musl_x64"
[[ -s "$ONNX_LINUX_DIR/libonnxruntime.so.1" ]] || { echo "CPU ONNX runtime missing" >&2; exit 4; }
[[ -s "$ONNX_LINUX_DIR/libonnxruntime_providers_shared.so" ]] || { echo "ONNX shared provider missing" >&2; exit 4; }
[[ -s "$ONNX_LINUX_DIR/onnxruntime_binding.node" ]] || { echo "ONNX native binding missing" >&2; exit 4; }
[[ ! -e "$ONNX_LINUX_DIR/libonnxruntime_providers_cuda.so" ]] || { echo "unused CUDA provider returned" >&2; exit 4; }
[[ ! -e "$ONNX_LINUX_DIR/libonnxruntime_providers_tensorrt.so" ]] || { echo "unused TensorRT provider returned" >&2; exit 4; }
[[ ! -e "$KOFFI_MUSL_DIR" ]] || { echo "unused musl Koffi prebuild returned" >&2; exit 4; }

# Syntax + permanent Linux Electron/capture invariants.
find "$OUT/app/electron" -type f \( -name '*.cjs' -o -name '*.js' -o -name '*.mjs' \) -print0 | xargs -0 -n1 node --check
node --check "$OUT/app/server/server.mjs"
node --check "$OUT/app/server/overlay/linux-ocr-region-manager.js"
bash -n "$OUT/bin/sc-blueprint-tracker" "$OUT/doctor.sh"

grep -q 'ARCHVERSE_LINUX_HOVER_SCOPED_LATCH' "$OUT/app/electron/main.cjs"
grep -q 'ARCHVERSE_LINUX_GAME_FOCUS_HANDOFF' "$OUT/app/electron/main.cjs"
grep -q 'ARCHVERSE_LINUX_DRAG_LOCK_WATCHDOG' "$OUT/app/electron/main.cjs"
grep -q 'ARCHVERSE_LINUX_REALTIME_OVERLAY_RENDERER' "$OUT/app/electron/main.cjs"
grep -q 'backgroundThrottling: false' "$OUT/app/electron/main.cjs"
grep -q 'ARCHVERSE_UPSTREAM_0144_HAULING' "$OUT/app/electron/main.cjs"
grep -q 'ARCHVERSE_UPSTREAM_0144_WIDGET_HOTKEYS' "$OUT/app/electron/main.cjs"
grep -q 'ARCHVERSE_UPSTREAM_0144_FOCUS_BEHAVIOR' "$OUT/app/electron/main.cjs"
! grep -q 'overlay\.setFocusable(false)' "$OUT/app/electron/main.cjs"

grep -q 'ARCHVERSE_LINUX_MINING_SIGNATURE_AUTHORITY' "$OUT/app/electron/capture.cjs"
grep -q 'ARCHVERSE_LINUX_BOUND_MINING_CADENCE' "$OUT/app/electron/capture.cjs"
grep -q 'ARCHVERSE_LINUX_PER_WIDGET_OCR_REGIONS' "$OUT/app/electron/capture.cjs"
grep -q 'ARCHVERSE_LINUX_EXACT_SC_SESSION_BINDING' "$OUT/app/electron/capture.cjs"
grep -qi 'gamescope' "$OUT/app/electron/capture.cjs"
grep -qi 'pipewire' "$OUT/app/electron/capture.cjs"
grep -qi 'rapidocr' "$OUT/app/electron/capture.cjs"

# Current sidecar + Linux semantic contracts.
grep -q 'SC_TRACKER_CONFIG_DIR' "$OUT/app/server/server.mjs"
grep -q 'Shift+F6' "$OUT/app/server/server.mjs"
grep -q 'ArchVerse Linux RapidOCR (Electron capture)' "$OUT/app/server/server.mjs"
grep -q 'linuxOcrRegions' "$OUT/app/server/server.mjs"
grep -q 'process.platform === "win32"' "$OUT/app/server/server.mjs"
grep -q 'logbackups' "$OUT/app/server/server.mjs"
grep -q 'startPosition' "$OUT/app/server/server.mjs"
grep -q 'ARCHVERSE_LINUX_PER_WIDGET_OCR_REGION_UI' "$OUT/app/server/overlay/linux-ocr-region-manager.js"
grep -q 'ARCHVERSE_LINUX_PER_WIDGET_OCR_REGION_UI_LOADER' "$OUT/app/server/overlay/missions.html"
grep -q 'ARCHVERSE_LINUX_DYNAMIC_WIDGET_REGIONS' "$OUT/app/server/overlay/missions.html"
grep -q '.ocr-capture-box.shown, body.scanbox #scanBox' "$OUT/app/server/overlay/missions.html"
grep -q 'linuxOcrRegions: { resourceSignature: f }' "$OUT/app/server/overlay/missions.html"
grep -q 'ARCHVERSE_RESOURCE_SCANNER_V1' "$OUT/app/server/overlay/mining.html"
grep -q 'WIDGET_HOTKEYS' "$OUT/app/server/overlay/config.html"
[[ -s "$OUT/app/server/overlay/hauling.html" ]]
[[ -s "$OUT/app/server/overlay/hauling-stow.js" ]]

# Exercise the native OCR contract against the NEW sidecar. This checks runtime ROI independence,
# config persistence and that a Linux path-only read cannot fall through to Windows.Media.Ocr.
node "$ROOT/packaging/common/native-linux-ocr-selftest.mjs" "$OUT"
(
  cd "$OUT/app"
  node "$ROOT/packaging/common/rapidocr-native-selftest.mjs"
)

grep -q 'RUNTIME_DIR=.*runtime/electron' "$OUT/bin/sc-blueprint-tracker"
! grep -q '/usr/bin/electron42' "$OUT/bin/sc-blueprint-tracker"
if [[ -f "$OUT/runtime/electron/chrome-sandbox" ]]; then
  [[ "$(stat -c '%a' "$OUT/runtime/electron/chrome-sandbox")" == "4755" ]] || { echo "chrome-sandbox mode is not 4755" >&2; exit 5; }
fi

echo "[upstream-candidate] $VERSION staged from verified Alpha21 Linux runtime + current upstream behavior: $OUT"
