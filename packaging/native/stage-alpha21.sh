#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
ALPHA20_ARCHIVE="${1:-${ALPHA20_ARCHIVE:-}}"
ELECTRON_ARCHIVE="${2:-${ELECTRON_ARCHIVE:-}}"
OUT="${3:-${NATIVE_STAGE_DIR:-}}"

[[ -n "$ALPHA20_ARCHIVE" && -f "$ALPHA20_ARCHIVE" ]] || { echo "missing Alpha20 archive: $ALPHA20_ARCHIVE" >&2; exit 2; }
[[ -n "$ELECTRON_ARCHIVE" && -f "$ELECTRON_ARCHIVE" ]] || { echo "missing Electron archive: $ELECTRON_ARCHIVE" >&2; exit 2; }
[[ -n "$OUT" ]] || { echo "usage: $0 <alpha20.tar.gz> <electron-linux-x64.zip> <output-dir>" >&2; exit 2; }

VERSION="0.1.42-r31-alpha.21"
TMP="${RUNNER_TEMP:-/tmp}/archverse-native-stage-$$"
trap 'rm -rf "$TMP"' EXIT
rm -rf "$TMP" "$OUT"
mkdir -p "$TMP/base" "$OUT"

echo "[native-stage] extracting verified Alpha20 native baseline"
tar --no-same-owner -xzf "$ALPHA20_ARCHIVE" -C "$TMP/base"
BASE="$(find "$TMP/base" -mindepth 1 -maxdepth 1 -type d | head -n1)"
[[ -n "$BASE" && -s "$BASE/app/electron/main.cjs" ]] || { echo "invalid Alpha20 native payload" >&2; exit 3; }
cp -a "$BASE/." "$OUT/"

echo "[native-stage] applying the two tested Alpha21 runtime log fixes"
python3 "$ROOT/linux-port/alpha21-runtime-log-fixes.py" "$OUT"

echo "[native-stage] enforcing permanent Linux hover-scoped interaction behavior"
node "$ROOT/packaging/native/enforce-linux-interaction-policy.cjs" "$OUT/app/electron/main.cjs"

python3 - "$OUT/app/package.json" <<'PY'
from pathlib import Path
import json, sys
p=Path(sys.argv[1]); d=json.loads(p.read_text())
d['version']='0.1.42-r31-alpha.21'
d['description']='Community native Linux port of SubliminalsTV SC Overlay 0.1.42 — Alpha 21 Resource Scanner with durable Linux interaction policy'
p.write_text(json.dumps(d, indent=2)+'\n')
PY

python3 - "$OUT/app/server/overlay/changelog.json" <<'PY'
from pathlib import Path
import json, sys
p=Path(sys.argv[1]); d=json.loads(p.read_text())
entry={
  'date':'2026-08-15T04:50:00Z',
  'notes':[
    {'kind':'fixed','label':'OCR watchdog overlap','text':'A slow Fabricator/Mining OCR tick is no longer force-unlocked while its async native/OCR work is still alive. Alpha 21 skips overlapping polls and lets only the original tick release the busy guard.'},
    {'kind':'fixed','label':'KDE Spectacle screenshot race','text':'Wayland screenshot capture waits longer for a stable, decodable PNG before declaring the Spectacle backend unavailable.'},
    {'kind':'improved','label':'Linux widget focus handoff','text':'After a widget click and interaction-key release, the widget stays interactive only while the pointer remains inside a classified widget. Leaving all widgets restores click-through and the pre-overlay native window.'},
    {'kind':'improved','label':'Native package portability','text':'The Arch, Fedora and Debian package targets share one application payload and one pinned Electron runtime rather than carrying distro-specific application forks.'},
  ]
}
out={'0.1.42-r31-alpha.21':entry}
for k,v in d.items():
    if k != '0.1.42-r31-alpha.21': out[k]=v
p.write_text(json.dumps(out, indent=2)+'\n')
PY

python3 - "$OUT" <<'PY'
from pathlib import Path
import sys
root=Path(sys.argv[1])
for rel in ['doctor.sh','bin/sc-blueprint-tracker','README.md']:
    p=root/rel
    if not p.exists(): continue
    s=p.read_text(errors='replace')
    s=s.replace('0.1.42-r31-alpha.20','0.1.42-r31-alpha.21')
    s=s.replace('r31 alpha 20','r31 alpha 21').replace('r31 Alpha 20','r31 Alpha 21')
    s=s.replace('r31-alpha20','r31-alpha21')
    p.write_text(s)
PY

echo "[native-stage] bundling pinned Electron 42.7.1"
mkdir -p "$OUT/runtime/electron"
unzip -q "$ELECTRON_ARCHIVE" -d "$OUT/runtime/electron"
[[ -x "$OUT/runtime/electron/electron" ]] || chmod +x "$OUT/runtime/electron/electron"
if [[ -f "$OUT/runtime/electron/chrome-sandbox" ]]; then
  chmod 4755 "$OUT/runtime/electron/chrome-sandbox"
fi

# The proven launcher is self-relative. Only replace its distro-specific /usr/bin/electron42
# default with the bundled runtime; all X11/XWayland, Gamescope, renderer, OCR and focus flags
# remain inherited from the native Alpha20/21 launcher.
python3 - "$OUT/bin/sc-blueprint-tracker" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); s=p.read_text()
old='''APP_DIR="$(cd -- "$(dirname -- "$SELF")/../app" && pwd)"\n\nELECTRON_BIN="${SC_TRACKER_ELECTRON_BIN:-/usr/bin/electron42}"\nif [[ ! -x "$ELECTRON_BIN" ]]; then\n  printf 'SC Blueprint Tracker requires Electron 42 at %s.\\n' "$ELECTRON_BIN" >&2\n  printf 'Install it with: sudo pacman -S --needed electron42\\n' >&2\n  exit 127\nfi'''
new='''APP_DIR="$(cd -- "$(dirname -- "$SELF")/../app" && pwd)"\nRUNTIME_DIR="$(cd -- "$(dirname -- "$SELF")/../runtime/electron" && pwd)"\n\nELECTRON_BIN="${SC_TRACKER_ELECTRON_BIN:-$RUNTIME_DIR/electron}"\nif [[ ! -x "$ELECTRON_BIN" ]]; then\n  printf 'ArchVerse Overlay bundled Electron runtime is missing at %s.\\n' "$ELECTRON_BIN" >&2\n  printf 'Reinstall the ArchVerse Overlay package for your distribution.\\n' >&2\n  exit 127\nfi'''
if old not in s:
    raise SystemExit('native launcher Electron anchor not found exactly once')
s=s.replace(old,new,1)
s=s.replace("  printf 'Install it with: sudo pacman -S --needed nodejs\\n' >&2\n", "  printf 'Install the nodejs package with your distribution package manager.\\n' >&2\n", 1)
p.write_text(s)
PY

# Package-manager installs supersede the old archive installers. Keep diagnostics/tests/docs, but
# do not leave scripts in /opt that would overwrite a package-manager-owned installation.
rm -f "$OUT/install-cachyos.sh" "$OUT/uninstall-cachyos.sh" "$OUT/install-input-access.sh"
chmod +x "$OUT/bin/sc-blueprint-tracker" "$OUT/doctor.sh" "$OUT/verify-alpha.sh" 2>/dev/null || true

for f in \
  app/electron/main.cjs \
  app/electron/capture.cjs \
  app/electron/hotkeys.cjs \
  app/electron/linux/star-citizen-session.cjs \
  app/electron/linux/evdev-hold-key.cjs \
  app/electron/rapidocr-client.cjs \
  app/electron/rapidocr-worker.cjs \
  app/node_modules/uiohook-napi/prebuilds/linux-x64/uiohook-napi.node \
  app/node_modules/onnxruntime-node/bin/napi-v6/linux/x64/onnxruntime_binding.node \
  runtime/electron/electron \
  runtime/electron/resources.pak \
  bin/sc-blueprint-tracker; do
  [[ -s "$OUT/$f" ]] || { echo "missing staged native file: $f" >&2; exit 4; }
done

# Preserve the released sidecar layout exactly; only require that it still contains an executable
# JavaScript module entry rather than assuming one historical filename.
SERVER_ENTRY="$(find "$OUT/app/server" -maxdepth 2 -type f -name '*.mjs' -print -quit)"
[[ -n "$SERVER_ENTRY" && -s "$SERVER_ENTRY" ]] || { echo "no native sidecar .mjs entry found under app/server" >&2; exit 4; }
echo "[native-stage] sidecar entry present: ${SERVER_ENTRY#$OUT/}"

find "$OUT/app/electron" -type f \( -name '*.cjs' -o -name '*.js' -o -name '*.mjs' \) -print0 | xargs -0 -n1 node --check
bash -n "$OUT/bin/sc-blueprint-tracker" "$OUT/doctor.sh"
grep -q 'ARCHVERSE_LINUX_HOVER_SCOPED_LATCH' "$OUT/app/electron/main.cjs"
grep -q 'pointer left all widgets; overlay released and previous focus restored' "$OUT/app/electron/main.cjs"
grep -q 'timeoutMs = 6000' "$OUT/app/electron/capture.cjs"
grep -q 'prior OCR tick still running after' "$OUT/app/electron/capture.cjs"
grep -q 'RUNTIME_DIR=.*runtime/electron' "$OUT/bin/sc-blueprint-tracker"
! grep -q '/usr/bin/electron42' "$OUT/bin/sc-blueprint-tracker"
! grep -q 'pacman -S --needed electron42' "$OUT/bin/sc-blueprint-tracker"

if [[ -f "$OUT/runtime/electron/chrome-sandbox" ]]; then
  mode="$(stat -c '%a' "$OUT/runtime/electron/chrome-sandbox")"
  [[ "$mode" == "4755" ]] || { echo "chrome-sandbox mode is $mode, expected 4755" >&2; exit 5; }
fi

(
  cd "$OUT/app"
  node -e "import('@gutenye/ocr-node').then(()=>console.log('[native-stage] RapidOCR module import OK')).catch(e=>{console.error(e);process.exit(1)})"
)

echo "[native-stage] shared Alpha21 native payload verified: $OUT"
