#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
PAYLOAD="${1:-}"
OUTDIR="${2:-$PWD}"
VERSION='0.1.47~r31~alpha23~candidate16-1'
PAYLOAD_DIR='ArchVerse-Native-0.1.47-r31.alpha23.candidate16'

[[ -f "$PAYLOAD" ]] || {
  printf 'Usage: %s ArchVerse-Native-0.1.47-r31.alpha23.candidate16.tar.gz [output-directory]\n' "$0" >&2
  exit 2
}
command -v dpkg-deb >/dev/null 2>&1 || {
  printf 'dpkg-deb is required to build the Debian package.\n' >&2
  exit 2
}

expected='244c4da008883a3bff8143078bda85c2a4f23450e11a459f2e5cc3c303483091'
actual="$(sha256sum "$PAYLOAD" | awk '{print $1}')"
[[ "$actual" == "$expected" ]] || {
  printf 'Candidate 16 archive checksum mismatch: expected %s, got %s\n' "$expected" "$actual" >&2
  exit 3
}

work="$(mktemp -d)"
cleanup() { rm -rf -- "$work"; }
trap cleanup EXIT HUP INT TERM
mkdir -p "$work/extract" "$work/pkg/DEBIAN" "$OUTDIR"
tar --no-same-owner -xzf "$PAYLOAD" -C "$work/extract"
src="$work/extract/$PAYLOAD_DIR"
[[ -d "$src/app" && -x "$src/bin/sc-blueprint-tracker" ]] || {
  printf 'Candidate 16 payload is missing its application or launcher.\n' >&2
  exit 3
}

install -d "$work/pkg/opt/archverse-overlay"
cp -a "$src/." "$work/pkg/opt/archverse-overlay/"
install -Dm0755 "$ROOT/packaging/common/archverse-overlay" "$work/pkg/usr/bin/archverse-overlay"
install -Dm0755 "$ROOT/packaging/release/archverse-doctor" "$work/pkg/usr/bin/archverse-doctor"
ln -s archverse-overlay "$work/pkg/usr/bin/sc-blueprint-tracker"
install -Dm0644 "$ROOT/packaging/native/archverse-overlay.desktop" \
  "$work/pkg/usr/share/applications/archverse-overlay.desktop"
install -Dm0644 "$src/app/build/icon.png" \
  "$work/pkg/usr/share/icons/hicolor/256x256/apps/archverse-overlay.png"
install -Dm0644 "$src/LICENSE.md" "$work/pkg/usr/share/doc/archverse-overlay/LICENSE.md"

chmod 0755 "$work/pkg/opt/archverse-overlay/bin/sc-blueprint-tracker"
if [[ -f "$work/pkg/opt/archverse-overlay/runtime/electron/chrome-sandbox" ]]; then
  chmod 4755 "$work/pkg/opt/archverse-overlay/runtime/electron/chrome-sandbox"
fi

cat > "$work/pkg/DEBIAN/control" <<EOF
Package: archverse-overlay
Version: $VERSION
Section: games
Priority: optional
Architecture: amd64
Maintainer: Gavin Brooks-McCray <gbmccray32@gmail.com>
Homepage: https://github.com/gbmccray32-boop/sc-overlay-for-Arch-Linux
Depends: nodejs, tesseract-ocr, tesseract-ocr-eng, pipewire-bin, wireplumber, gstreamer1.0-pipewire, gstreamer1.0-tools, gstreamer1.0-plugins-base, gstreamer1.0-plugins-good, xdg-desktop-portal, xdg-desktop-portal-kde, xdotool, x11-utils, x11-xserver-utils, kde-spectacle, imagemagick, ffmpeg, xdg-utils, libgtk-3-0t64 | libgtk-3-0, libnss3, libnspr4, libasound2t64 | libasound2, libcups2t64 | libcups2, libdbus-1-3, libxss1, libxtst6, libxrandr2, libxkbcommon0, libatspi2.0-0t64 | libatspi2.0-0, libatk-bridge2.0-0t64 | libatk-bridge2.0-0, libgbm1, libdrm2, libnotify4, libsecret-1-0, libcairo2, libpango-1.0-0, libx11-6, libx11-xcb1, libxcb1, libxcomposite1, libxdamage1, libxext6, libxfixes3, libxi6, libxrender1
Recommends: kscreen
Conflicts: sc-blueprint-tracker
Provides: sc-blueprint-tracker
Description: ArchVerse Star Citizen companion overlay for KDE Linux
 Candidate 16 provides the field-verified KDE X11, KDE Wayland/XWayland,
 and optional direct Gamescope PipeWire capture paths.
EOF

cat > "$work/pkg/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e
command -v update-desktop-database >/dev/null 2>&1 && \
  update-desktop-database -q /usr/share/applications || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && \
  gtk-update-icon-cache -q -f -t /usr/share/icons/hicolor || true
exit 0
EOF
chmod 0755 "$work/pkg/DEBIAN/postinst"

cat > "$work/pkg/DEBIAN/postrm" <<'EOF'
#!/bin/sh
set -e
command -v update-desktop-database >/dev/null 2>&1 && \
  update-desktop-database -q /usr/share/applications || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && \
  gtk-update-icon-cache -q -f -t /usr/share/icons/hicolor || true
exit 0
EOF
chmod 0755 "$work/pkg/DEBIAN/postrm"

out="$OUTDIR/archverse-overlay_${VERSION}_amd64.deb"
dpkg-deb --build --root-owner-group "$work/pkg" "$out"
printf '%s\n' "$out"
