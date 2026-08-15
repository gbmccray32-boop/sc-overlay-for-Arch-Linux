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

# Distro-neutral Linux interaction policy. This is deliberately applied before any Arch/DEB/RPM
# packaging so all native packages receive byte-identical interaction semantics.
node "$ROOT/packaging/common/enforce-native-linux-interaction-policy.cjs" \
  "$OUT/app/electron/main.cjs"

python3 - "$OUT/app/package.json" <<'PY'
from pathlib import Path
import json, sys
p=Path(sys.argv[1]); d=json.loads(p.read_text())
d['version']='0.1.42-r31-alpha.21'
d['description']='Community Linux port of SubliminalsTV SC Overlay 0.1.42 — Alpha 20 Resource Scanner plus runtime log fixes and native Linux interaction policy'
p.write_text(json.dumps(d, indent=2)+'\n')
PY

python3 - "$OUT/app/server/overlay/changelog.json" <<'PY'
from pathlib import Path
import json, sys
p=Path(sys.argv[1]); d=json.loads(p.read_text())
entry={
  'date':'2026-08-11T01:45:00Z',
  'notes':[
    {'kind':'fixed','label':'OCR watchdog overlap','text':'A slow Fabricator/Mining OCR tick is no longer force-unlocked while its async native/OCR work is still alive. Alpha 21 skips overlapping polls and lets only the original tick release the busy guard.'},
    {'kind':'fixed','label':'KDE Spectacle screenshot race','text':'Wayland screenshot capture now waits longer for a stable file and verifies that Electron can decode the PNG before accepting it, reducing false fallbacks caused by the portal returning before the file writer finishes.'},
    {'kind':'improved','label':'Linux hover-scoped interaction latch','text':'After a widget is clicked and the interaction key is released, the widget remains interactive only while the pointer stays within classified widgets. Leaving all widgets restores click-through and the exact pre-overlay window focus.'},
    {'kind':'improved','label':'Alpha 20 behavior preserved','text':'Resource Scanner classification, salvage confirmation rules, per-widget text brightness/window transparency, held-key interaction, Gamescope/KDE handling, Scan Mode gating and upstream 0.1.42 security behavior are otherwise unchanged.'},
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

# The native package workflow checks the same Alpha 21 runtime invariants as the original field build
# plus the permanent Linux interaction contract.
node --check "$OUT/app/electron/capture.cjs"
node --check "$OUT/app/electron/main.cjs"
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
grep -q 'ARCHVERSE_LINUX_HOVER_SCOPED_LATCH' "$OUT/app/electron/main.cjs"
grep -q 'LINUX_HOVER_LATCH_MISS_MS = 90' "$OUT/app/electron/main.cjs"
grep -q '\[linux-interaction\] pointer left all widgets; overlay released and previous focus restored' "$OUT/app/electron/main.cjs"
bash -n "$OUT/bin/sc-blueprint-tracker" "$OUT/doctor.sh"

mkdir -p "$(dirname -- "$OUTPUT_TAR")"
tar -C "$WORK" -czf "$OUTPUT_TAR" "ArchVerse-Overlay-$A21"
sha256sum "$OUTPUT_TAR"
