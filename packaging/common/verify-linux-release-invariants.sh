#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"

fail() {
  printf 'Linux release invariant failed: %s\n' "$*" >&2
  exit 1
}

require_file() {
  [[ -s "$ROOT/$1" ]] || fail "missing or empty $1"
}

require_text() {
  local path="$1"
  local text="$2"
  grep -Fq -- "$text" "$ROOT/$path" || fail "$path does not preserve: $text"
}

reject_ere() {
  local path="$1"
  local pattern="$2"
  if grep -Eq -- "$pattern" "$ROOT/$path"; then
    fail "$path contains forbidden pattern: $pattern"
  fi
}

policies=(
  packaging/common/enforce-native-linux-interaction-policy.cjs
  packaging/common/enforce-native-linux-runtime-policy.cjs
  packaging/common/enforce-native-linux-ocr-architecture.cjs
  packaging/common/enforce-native-linux-ocr-regions-ui.cjs
  packaging/common/enforce-native-linux-pipewire-capture.cjs
  packaging/common/enforce-native-mining-liveness-policy.cjs
  packaging/common/enforce-native-mining-nonblocking-policy.cjs
  packaging/common/enforce-native-mining-pipeline-policy.cjs
  packaging/common/enforce-native-overlay-realtime-policy.cjs
)

assets=(
  packaging/common/native-linux-gamescope-pipewire.cjs
  packaging/common/native-linux-ocr-runtime.cjs
  packaging/common/native-linux-ocr-selftest.mjs
  packaging/common/native-mining-pipeline-selftest.mjs
  packaging/common/rapidocr-native-selftest.mjs
  packaging/common/linux-ocr-region-manager.js
)

for path in "${policies[@]}" "${assets[@]}"; do
  require_file "$path"
  node --check "$ROOT/$path"
done

require_text packaging/common/enforce-native-linux-interaction-policy.cjs ARCHVERSE_LINUX_HOVER_SCOPED_LATCH
require_text packaging/common/enforce-native-linux-interaction-policy.cjs ARCHVERSE_LINUX_HOVER_SCOPED_LATCH_FUP_REARM
require_text packaging/common/enforce-native-linux-interaction-policy.cjs ARCHVERSE_LINUX_GAME_FOCUS_HANDOFF
require_text packaging/common/enforce-native-linux-interaction-policy.cjs ARCHVERSE_LINUX_DRAG_LOCK_WATCHDOG
require_text packaging/common/enforce-native-linux-runtime-policy.cjs ARCHVERSE_LINUX_EXACT_SC_SESSION_BINDING
require_text packaging/common/enforce-native-linux-runtime-policy.cjs ARCHVERSE_LINUX_MINING_SIGNATURE_AUTHORITY
require_text packaging/common/enforce-native-linux-runtime-policy.cjs ARCHVERSE_LINUX_WATCHER_HANDOFF
require_text packaging/common/enforce-native-linux-runtime-policy.cjs ARCHVERSE_LINUX_MISSION_COMPLETION
require_text packaging/common/enforce-native-linux-ocr-architecture.cjs ARCHVERSE_LINUX_OCR_CONTRACT_V1
require_text packaging/common/enforce-native-linux-ocr-architecture.cjs ARCHVERSE_LINUX_PER_WIDGET_OCR_REGIONS
require_text packaging/common/enforce-native-linux-ocr-architecture.cjs ARCHVERSE_LINUX_NO_WINDOWS_MEDIA_OCR
require_text packaging/common/enforce-native-linux-pipewire-capture.cjs ARCHVERSE_LINUX_GAMESCOPE_PIPEWIRE_CAPTURE
require_text packaging/common/enforce-native-mining-liveness-policy.cjs ARCHVERSE_LINUX_BOUND_MINING_CADENCE
require_text packaging/common/enforce-native-mining-nonblocking-policy.cjs ARCHVERSE_LINUX_ASYNC_MINING_TELEMETRY
require_text packaging/common/enforce-native-mining-pipeline-policy.cjs ARCHVERSE_LINUX_PARSED_SIGNATURE_COMMIT
require_text packaging/common/enforce-native-overlay-realtime-policy.cjs ARCHVERSE_LINUX_REALTIME_OVERLAY_RENDERER

require_file packaging/arch/PKGBUILD
for dep in electron42 nodejs tesseract tesseract-data-eng pipewire gstreamer gst-plugin-pipewire gst-plugins-good xdotool xorg-xprop xorg-xrandr spectacle imagemagick ffmpeg libx11 libxtst; do
  require_text packaging/arch/PKGBUILD "'$dep'"
done

require_file packaging/debian/build-deb.sh
for dep in nodejs tesseract-ocr tesseract-ocr-eng pipewire-bin gstreamer1.0-pipewire gstreamer1.0-tools gstreamer1.0-plugins-base gstreamer1.0-plugins-good xdotool x11-xserver-utils imagemagick ffmpeg spectacle; do
  require_text packaging/debian/build-deb.sh "$dep"
done
bash -n "$ROOT/packaging/debian/build-deb.sh"

require_file packaging/fedora/archverse-overlay.spec
require_text packaging/fedora/archverse-overlay.spec 'Requires:       /usr/bin/ffplay'
reject_ere packaging/fedora/archverse-overlay.spec '^[[:space:]]*Requires:[[:space:]]+ffmpeg([[:space:]]|$)'
for dep in tesseract-langpack-eng pipewire-utils pipewire-gstreamer gstreamer1 gstreamer1-plugins-base gstreamer1-plugins-good xdotool xrandr xprop ImageMagick spectacle; do
  require_text packaging/fedora/archverse-overlay.spec "$dep"
done

require_file packaging/common/archverse-overlay
bash -n "$ROOT/packaging/common/archverse-overlay"
require_text packaging/common/archverse-overlay electron42
require_text packaging/common/archverse-overlay runtime/electron/electron

for path in packaging/arch/PKGBUILD packaging/debian/build-deb.sh packaging/fedora/archverse-overlay.spec packaging/common/archverse-overlay; do
  reject_ere "$path" 'rm[[:space:]]+-rf.*sc-blueprint-tracker'
done

printf 'Linux release invariants present for Arch/CachyOS, Debian/Ubuntu, and Fedora 44/Nobara.\n'
