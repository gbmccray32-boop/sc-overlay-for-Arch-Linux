#!/usr/bin/env bash
set -euo pipefail

PAYLOAD_TAR="${1:?usage: build-deb.sh PAYLOAD_TAR ELECTRON_DIST OUTPUT_DIR}"
ELECTRON_DIST="${2:?usage: build-deb.sh PAYLOAD_TAR ELECTRON_DIST OUTPUT_DIR}"
OUTPUT_DIR="${3:?usage: build-deb.sh PAYLOAD_TAR ELECTRON_DIST OUTPUT_DIR}"
VERSION="0.1.42-r31-alpha.21"
PKGVER="0.1.42~r31~alpha21-7"
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/unpack" "$WORK/pkg/DEBIAN" "$OUTPUT_DIR"
tar -xzf "$PAYLOAD_TAR" -C "$WORK/unpack"
SRC="$WORK/unpack/ArchVerse-Overlay-$VERSION"
[[ -d "$SRC/app" && -x "$SRC/bin/sc-blueprint-tracker" ]] || {
  echo 'Invalid ArchVerse payload archive' >&2
  exit 2
}
[[ -x "$ELECTRON_DIST/electron" ]] || {
  echo "Electron runtime missing: $ELECTRON_DIST/electron" >&2
  exit 2
}

cat > "$WORK/pkg/DEBIAN/control" <<EOF
Package: archverse-overlay
Version: $PKGVER
Section: games
Priority: optional
Architecture: amd64
Maintainer: ArchVerse Linux Community <gbmccray32@gmail.com>
Depends: nodejs, tesseract-ocr, tesseract-ocr-eng, pipewire-bin, gstreamer1.0-pipewire, gstreamer1.0-tools, gstreamer1.0-plugins-base, gstreamer1.0-plugins-good, xdotool, x11-xserver-utils, imagemagick, ffmpeg, spectacle, libnss3, libxss1, libgbm1, libx11-6, libxtst6, libxrandr2
Recommends: kscreen
Conflicts: sc-blueprint-tracker
Provides: sc-blueprint-tracker
Description: ArchVerse Star Citizen companion overlay
 Community Linux package of the tested ArchVerse Alpha 21 native payload.
 The Debian-family package bundles Electron 42 while using host Node, OCR,
 PipeWire/GStreamer and desktop integration utilities.
EOF

install -d "$WORK/pkg/opt/archverse-overlay"
cp -a "$SRC/." "$WORK/pkg/opt/archverse-overlay/"
install -d "$WORK/pkg/opt/archverse-overlay/runtime/electron"
cp -a "$ELECTRON_DIST/." "$WORK/pkg/opt/archverse-overlay/runtime/electron/"

install -Dm755 "$ROOT/packaging/common/archverse-overlay" "$WORK/pkg/usr/bin/archverse-overlay"
ln -s archverse-overlay "$WORK/pkg/usr/bin/sc-blueprint-tracker"
install -Dm644 "$ROOT/packaging/common/archverse-overlay.desktop" \
  "$WORK/pkg/usr/share/applications/archverse-overlay.desktop"
install -Dm644 "$SRC/app/build/icon.png" \
  "$WORK/pkg/usr/share/icons/hicolor/256x256/apps/archverse-overlay.png"
install -Dm644 "$SRC/LICENSE.md" \
  "$WORK/pkg/usr/share/doc/archverse-overlay/copyright"

cat > "$WORK/pkg/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -f -t /usr/share/icons/hicolor >/dev/null 2>&1 || true
exit 0
EOF
chmod 0755 "$WORK/pkg/DEBIAN/postinst"

cat > "$WORK/pkg/DEBIAN/postrm" <<'EOF'
#!/bin/sh
set -e
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -f -t /usr/share/icons/hicolor >/dev/null 2>&1 || true
exit 0
EOF
chmod 0755 "$WORK/pkg/DEBIAN/postrm"

OUT="$OUTPUT_DIR/archverse-overlay_${PKGVER}_amd64.deb"
dpkg-deb --build --root-owner-group "$WORK/pkg" "$OUT"
dpkg-deb --info "$OUT"
echo "$OUT"
