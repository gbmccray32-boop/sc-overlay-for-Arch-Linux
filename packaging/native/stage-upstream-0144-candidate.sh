#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
ALPHA20_ARCHIVE="${1:-${ALPHA20_ARCHIVE:-}}"
ELECTRON_ARCHIVE="${2:-${ELECTRON_ARCHIVE:-}}"
OUT="${3:-${NATIVE_STAGE_DIR:-}}"
VERSION="0.1.44-r31.alpha22.candidate1"

[[ -n "$ALPHA20_ARCHIVE" && -f "$ALPHA20_ARCHIVE" ]] || { echo "missing Alpha20 archive: $ALPHA20_ARCHIVE" >&2; exit 2; }
[[ -n "$ELECTRON_ARCHIVE" && -f "$ELECTRON_ARCHIVE" ]] || { echo "missing Electron archive: $ELECTRON_ARCHIVE" >&2; exit 2; }
[[ -n "$OUT" ]] || { echo "usage: $0 <alpha20.tar.gz> <electron-linux-x64.zip> <output-dir>" >&2; exit 2; }
[[ -s "$ROOT/build/server/server.mjs" ]] || { echo "run npm run build:server before staging the upstream candidate" >&2; exit 2; }

# Start from the field-verified Linux runtime. This intentionally reconstructs Alpha21 first so
# upstream Windows Electron code never gets a chance to replace Gamescope/PipeWire/RapidOCR/focus.
"$ROOT/packaging/native/stage-alpha21.sh" "$ALPHA20_ARCHIVE" "$ELECTRON_ARCHIVE" "$OUT"

echo "[upstream-candidate] replacing platform-neutral sidecar/UI/data with current upstream build"
rm -rf "$OUT/app/server"
mkdir -p "$OUT/app/server"
cp -a "$ROOT/build/server/." "$OUT/app/server/"

# Port only the shell behavior current upstream requires (Hauling + generic widget hotkeys + focus
# intent), while retaining the already-verified Linux ownership/focus implementation.
node "$ROOT/packaging/common/port-upstream-0144-shell.cjs" "$OUT"

python3 - "$OUT/app/package.json" "$VERSION" <<'PY'
from pathlib import Path
import json, sys
p=Path(sys.argv[1]); version=sys.argv[2]; d=json.loads(p.read_text())
d['version']=version
d['description']='ArchVerse native Linux candidate: upstream 0.1.44+ features on the verified Alpha21 Linux interaction/capture runtime'
p.write_text(json.dumps(d, indent=2)+'\n')
PY

# Put the Linux-port delta above the upstream changelog without rewriting upstream's 0.1.44 notes.
python3 - "$OUT/app/server/overlay/changelog.json" "$VERSION" <<'PY'
from pathlib import Path
import json, sys
p=Path(sys.argv[1]); version=sys.argv[2]; d=json.loads(p.read_text())
entry={
  'date':'2026-08-18T02:00:00Z',
  'notes':[
    {'kind':'new','label':'Upstream 0.1.44+ on Linux','text':'Carries contract search, idle mission/blueprint progress, next-rank routes, richer mission metadata, universal widget hotkeys, diagnostics, localization fixes, Hauling Advisor, stow-view improvements and post-restart hauling persistence.'},
    {'kind':'improved','label':'Linux focus parity','text':'Ports the new non-stealing overlay focus intent through ArchVerse’s existing Linux ownership model instead of importing the Windows NOACTIVATE mechanism.'},
    {'kind':'fixed','label':'Rotated log continuity','text':'Replays the newest recent Game.log backup before the live log while retaining the exact byte-offset handoff into the tail watcher.'},
  ]
}
out={version:entry}
for k,v in d.items():
    if k != version: out[k]=v
p.write_text(json.dumps(out, indent=2)+'\n')
PY

# Syntax and contract gates. Fail here rather than handing a user a package that weakened Linux.
node --check "$OUT/app/electron/main.cjs"
node --check "$OUT/app/electron/preload.cjs"
node --check "$OUT/app/electron/capture.cjs"
node --check "$OUT/app/server/server.mjs"

grep -q 'ARCHVERSE_LINUX_HOVER_SCOPED_LATCH' "$OUT/app/electron/main.cjs"
grep -q 'ARCHVERSE_LINUX_GAME_FOCUS_HANDOFF' "$OUT/app/electron/main.cjs"
grep -q 'ARCHVERSE_LINUX_DRAG_LOCK_WATCHDOG' "$OUT/app/electron/main.cjs"
grep -q 'ARCHVERSE_UPSTREAM_0144_FOCUS_BEHAVIOR' "$OUT/app/electron/main.cjs"
grep -q 'ARCHVERSE_UPSTREAM_0144_HAULING' "$OUT/app/electron/main.cjs"
grep -q 'ARCHVERSE_UPSTREAM_0144_WIDGET_HOTKEYS' "$OUT/app/electron/main.cjs"
! grep -q 'overlay\.setFocusable(false)' "$OUT/app/electron/main.cjs"

grep -qi 'gamescope' "$OUT/app/electron/capture.cjs"
grep -qi 'pipewire' "$OUT/app/electron/capture.cjs"
grep -qi 'rapidocr' "$OUT/app/electron/capture.cjs"
grep -q 'SC_TRACKER_CONFIG_DIR' "$OUT/app/server/server.mjs"
grep -q 'Shift+F6' "$OUT/app/server/server.mjs"
grep -q 'ArchVerse Linux RapidOCR (Electron capture)' "$OUT/app/server/server.mjs"
grep -q 'logbackups' "$OUT/app/server/server.mjs"
grep -q 'startPosition' "$OUT/app/server/server.mjs"

grep -q 'ARCHVERSE_LINUX_SETTINGS_CONTRACT' "$OUT/app/server/overlay/config.html"
grep -q 'ARCHVERSE_LINUX_DYNAMIC_WIDGET_REGIONS' "$OUT/app/server/overlay/missions.html"
grep -q 'ARCHVERSE_RESOURCE_SCANNER_V1' "$OUT/app/server/overlay/mining.html"
grep -q 'WIDGET_HOTKEYS' "$OUT/app/server/overlay/config.html"
grep -q '"hauling"' "$OUT/app/server/overlay/config.html"
[[ -s "$OUT/app/server/overlay/hauling.html" ]]
[[ -s "$OUT/app/server/overlay/hauling-stow.js" ]]

echo "[upstream-candidate] $VERSION staged without replacing verified Linux interaction/capture backends: $OUT"
