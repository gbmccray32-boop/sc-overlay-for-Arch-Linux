#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
PAYLOAD="${1:-}"
OUTDIR="${2:-$PWD}"
[[ -f "$PAYLOAD" ]] || { echo "usage: $0 <ArchVerse-Native-0.1.42-r31-alpha.21.tar.gz> [output-dir]" >&2; exit 2; }
command -v dpkg-deb >/dev/null || { echo "dpkg-deb is required" >&2; exit 2; }

DEB_VERSION='0.1.42~r31~alpha21-1'
PKGROOT="${RUNNER_TEMP:-/tmp}/archverse-deb-$$"
trap 'rm -rf "$PKGROOT"' EXIT
rm -rf "$PKGROOT"
mkdir -p "$PKGROOT/extract" "$PKGROOT/pkg/DEBIAN" "$OUTDIR"

tar --no-same-owner -xzf "$PAYLOAD" -C "$PKGROOT/extract"
SRC="$(find "$PKGROOT/extract" -mindepth 1 -maxdepth 1 -type d | head -n1)"
[[ -n "$SRC" && -d "$SRC/app" ]] || { echo "invalid native payload" >&2; exit 3; }

install -d "$PKGROOT/pkg/opt/archverse-overlay"
cp -a "$SRC/." "$PKGROOT/pkg/opt/archverse-overlay/"
install -d "$PKGROOT/pkg/usr/bin"
ln -s /opt/archverse-overlay/bin/sc-blueprint-tracker "$PKGROOT/pkg/usr/bin/archverse-overlay"
ln -s /opt/archverse-overlay/bin/sc-blueprint-tracker "$PKGROOT/pkg/usr/bin/sc-blueprint-tracker"
install -Dm0644 "$ROOT/packaging/native/archverse-overlay.desktop" \
  "$PKGROOT/pkg/usr/share/applications/archverse-overlay.desktop"
install -Dm0644 "$SRC/app/build/icon.png" \
  "$PKGROOT/pkg/usr/share/icons/hicolor/256x256/apps/archverse-overlay.png"
install -Dm0644 "$SRC/LICENSE.md" \
  "$PKGROOT/pkg/usr/share/doc/archverse-overlay/LICENSE.md"
chmod 0755 "$PKGROOT/pkg/opt/archverse-overlay/bin/sc-blueprint-tracker"
if [[ -f "$PKGROOT/pkg/opt/archverse-overlay/runtime/electron/chrome-sandbox" ]]; then
  chmod 4755 "$PKGROOT/pkg/opt/archverse-overlay/runtime/electron/chrome-sandbox"
fi

cat > "$PKGROOT/pkg/DEBIAN/control" <<EOF
Package: archverse-overlay
Version: ${DEB_VERSION}
Section: games
Priority: optional
Architecture: amd64
Maintainer: Gavin Brooks-McCray <gbmccray32@gmail.com>
Homepage: https://github.com/gbmccray32-boop/sc-overlay-for-Arch-Linux
Depends: nodejs, tesseract-ocr, tesseract-ocr-eng, xdotool, x11-utils, x11-xserver-utils, kde-spectacle, imagemagick, ffmpeg, xdg-utils, libgtk-3-0t64 | libgtk-3-0, libnss3, libnspr4, libasound2t64 | libasound2, libcups2t64 | libcups2, libdbus-1-3, libxss1, libxtst6, libxrandr2, libxkbcommon0, libatspi2.0-0t64 | libatspi2.0-0, libatk-bridge2.0-0t64 | libatk-bridge2.0-0, libgbm1, libdrm2, libnotify4, libsecret-1-0, libcairo2, libpango-1.0-0, libx11-6, libx11-xcb1, libxcb1, libxcomposite1, libxdamage1, libxext6, libxfixes3, libxi6, libxrender1
Description: Community Linux companion overlay for Star Citizen
 ArchVerse Overlay provides the Resource Scanner, mission/blueprint companion,
 browser/chat widgets, Linux capture support and held-key widget interaction.
 This native package shares one application payload and pinned Electron runtime
 with the Arch and Fedora package targets.
EOF

cat > "$PKGROOT/pkg/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q /usr/share/applications || true
fi
exit 0
EOF
chmod 0755 "$PKGROOT/pkg/DEBIAN/postinst"

cat > "$PKGROOT/pkg/DEBIAN/postrm" <<'EOF'
#!/bin/sh
set -e
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q /usr/share/applications || true
fi
exit 0
EOF
chmod 0755 "$PKGROOT/pkg/DEBIAN/postrm"

OUT="$OUTDIR/archverse-overlay_${DEB_VERSION}_amd64.deb"
dpkg-deb --build --root-owner-group "$PKGROOT/pkg" "$OUT"
dpkg-deb --info "$OUT"
dpkg-deb --contents "$OUT" | grep -E 'opt/archverse-overlay/bin/sc-blueprint-tracker|usr/bin/archverse-overlay|runtime/electron/chrome-sandbox' || true

echo "[debian] built $OUT"
