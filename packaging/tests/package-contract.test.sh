#!/usr/bin/env bash
set -euo pipefail

if (($# != 4)); then
  printf 'Usage: %s PAYLOAD_TAR ARCH_PACKAGE RPM_PACKAGE DEB_PACKAGE\n' "$0" >&2
  exit 2
fi

payload="$1"
arch_package="$2"
rpm_package="$3"
deb_package="$4"
expected_payload_sha='244c4da008883a3bff8143078bda85c2a4f23450e11a459f2e5cc3c303483091'
payload_name='ArchVerse-Native-0.1.47-r31.alpha23.candidate16'

for file in "$payload" "$arch_package" "$rpm_package" "$deb_package"; do
  [[ -s "$file" ]] || { printf 'Missing package test input: %s\n' "$file" >&2; exit 2; }
done

# The RPM extractor runs from its destination directory. Resolve every input first so later
# directory changes cannot reinterpret a caller-provided relative path.
payload="$(realpath -- "$payload")"
arch_package="$(realpath -- "$arch_package")"
rpm_package="$(realpath -- "$rpm_package")"
deb_package="$(realpath -- "$deb_package")"

for command_name in bsdtar dpkg-deb rpm2cpio cpio; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'Package contract test requires %s.\n' "$command_name" >&2
    exit 2
  }
done

actual_payload_sha="$(sha256sum "$payload" | awk '{print $1}')"
[[ "$actual_payload_sha" == "$expected_payload_sha" ]] || {
  printf 'Payload checksum mismatch: %s\n' "$actual_payload_sha" >&2
  exit 3
}

work="$(mktemp -d)"
cleanup() { rm -rf -- "$work"; }
trap cleanup EXIT HUP INT TERM
mkdir -p "$work/payload" "$work/arch" "$work/rpm" "$work/deb"
tar --no-same-owner -xzf "$payload" -C "$work/payload"
bsdtar -xf "$arch_package" -C "$work/arch"
(cd "$work/rpm" && rpm2cpio "$rpm_package" | cpio -idm --quiet)
dpkg-deb -x "$deb_package" "$work/deb"

payload_root="$work/payload/$payload_name"
[[ -d "$payload_root" ]] || { printf 'Payload root missing after extraction.\n' >&2; exit 3; }

make_file_manifest() {
  local root="$1" output="$2"
  (
    cd "$root"
    find . -type f -print0 | sort -z | xargs -0 sha256sum
  ) > "$output"
}

make_link_manifest() {
  local root="$1" output="$2"
  (
    cd "$root"
    find . -type l -printf '%p -> %l\n' | sort
  ) > "$output"
}

make_file_manifest "$payload_root" "$work/payload.files"
make_link_manifest "$payload_root" "$work/payload.links"

for family in arch rpm deb; do
  root="$work/$family"
  app_root="$root/opt/archverse-overlay"
  [[ -x "$root/usr/bin/archverse-overlay" ]] || { printf '%s launcher missing\n' "$family" >&2; exit 4; }
  [[ -x "$root/usr/bin/archverse-doctor" ]] || { printf '%s doctor missing\n' "$family" >&2; exit 4; }
  [[ "$(readlink "$root/usr/bin/sc-blueprint-tracker")" == 'archverse-overlay' ]] || {
    printf '%s compatibility link is wrong\n' "$family" >&2
    exit 4
  }
  [[ -x "$app_root/bin/sc-blueprint-tracker" ]] || { printf '%s payload launcher missing\n' "$family" >&2; exit 4; }
  [[ -x "$app_root/runtime/electron/electron" ]] || { printf '%s Electron runtime missing\n' "$family" >&2; exit 4; }

  make_file_manifest "$app_root" "$work/$family.files"
  make_link_manifest "$app_root" "$work/$family.links"
  cmp "$work/payload.files" "$work/$family.files" >/dev/null || {
    printf '%s package changed Candidate 16 payload file bytes\n' "$family" >&2
    diff -u "$work/payload.files" "$work/$family.files" | head -n 80 >&2 || true
    exit 5
  }
  cmp "$work/payload.links" "$work/$family.links" >/dev/null || {
    printf '%s package changed Candidate 16 payload symlinks\n' "$family" >&2
    exit 5
  }
  (
    cd "$app_root"
    sha256sum -c SHA256SUMS >/dev/null
  )
  printf 'PASS: %s package preserves all Candidate 16 payload files and links\n' "$family"
done

grep -q '^pkgname = archverse-overlay$' "$work/arch/.PKGINFO"
grep -q '^pkgver = 0.1.47.r31.alpha23.candidate16-1$' "$work/arch/.PKGINFO"
dpkg-deb -f "$deb_package" Package Version Architecture | \
  grep -q '^archverse-overlay 0.1.47~r31~alpha23~candidate16-1 amd64$'

printf 'PASS: package metadata and cross-distribution payload identity\n'
