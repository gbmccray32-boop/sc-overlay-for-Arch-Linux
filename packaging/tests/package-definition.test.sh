#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
ARCH_FILE="$ROOT/packaging/arch/PKGBUILD"
RPM_FILE="$ROOT/packaging/fedora/archverse-overlay.spec"
DEB_FILE="$ROOT/packaging/debian/build-deb.sh"
INSTALLER="$ROOT/packaging/release/install-archverse.sh"
DOCTOR="$ROOT/packaging/release/archverse-doctor"
WRAPPER="$ROOT/packaging/common/archverse-overlay"
PAYLOAD_SHA='1c5bb72be177704ff1dc18788d9d65457e6d9965ddf68b7c8bdee6201c66495f'

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

[[ "$(grep -c '^pkgname=' "$ARCH_FILE")" -eq 1 ]] || fail 'Arch package has duplicate pkgname blocks'
[[ "$(grep -c '^Name:' "$RPM_FILE")" -eq 1 ]] || fail 'RPM spec has duplicate Name blocks'
[[ "$(grep -c '^#!/usr/bin/env bash$' "$DEB_FILE")" -eq 1 ]] || fail 'Debian builder has duplicate scripts'

grep -q "pkgver=0.1.47.r31.alpha23.candidate18" "$ARCH_FILE" || fail 'Arch version drift'
grep -q '^Version:[[:space:]]*0.1.47$' "$RPM_FILE" || fail 'RPM version drift'
grep -q "VERSION='0.1.47~r31~alpha23~candidate18-1'" "$DEB_FILE" || fail 'Debian version drift'
grep -q "$PAYLOAD_SHA" "$ARCH_FILE" || fail 'Arch payload checksum missing'
grep -q "$PAYLOAD_SHA" "$DEB_FILE" || fail 'Debian payload checksum missing'
grep -q '^%global __brp_mangle_shebangs %{nil}$' "$RPM_FILE" || \
  fail 'RPM shebang rewriting is not disabled for the verified payload'

for file in "$ARCH_FILE" "$RPM_FILE" "$DEB_FILE"; do
  grep -q 'xdg-desktop-portal-kde' "$file" || fail "KDE portal dependency missing from $file"
  grep -q 'wireplumber' "$file" || fail "WirePlumber dependency missing from $file"
done

for file in "$ARCH_FILE" "$RPM_FILE" "$DEB_FILE"; do
  grep -q '70-archverse-input.rules' "$file" || fail "keyboard uaccess rule missing from $file"
done
grep -q 'TAG+="uaccess"' "$ROOT/packaging/common/70-archverse-input.rules" || \
  fail 'keyboard rule does not use active-session uaccess'

# shellcheck disable=SC1090
source "$ARCH_FILE"
[[ "${sha256sums[1]}" == "$(sha256sum "$WRAPPER" | awk '{print $1}')" ]] || \
  fail 'Arch launcher checksum drift'
[[ "${sha256sums[2]}" == "$(sha256sum "$DOCTOR" | awk '{print $1}')" ]] || \
  fail 'Arch doctor checksum drift'

grep -q "Hyprland is intentionally reserved for the separate Omarchy port" "$INSTALLER" || \
  fail 'Installer no longer blocks the deferred Hyprland port'
grep -q "Candidate 18 supports KDE X11 and KDE Wayland with XWayland" "$DOCTOR" || \
  fail 'Doctor support boundary drift'

if grep -Eq 'alpha[.-]?21|0\.1\.42' "$ARCH_FILE" "$RPM_FILE" "$DEB_FILE"; then
  fail 'obsolete Alpha21 package metadata remains'
fi

printf 'PASS: Candidate 18 package definitions are coherent and checksum-pinned\n'
