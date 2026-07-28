#!/usr/bin/env bash
set -euo pipefail

repo="gbmccray32-boop/sc-overlay-for-Arch-Linux"
tag="linux-v0.1.33-r28"
asset="ArchVerse-Overlay-linux-v0.1.33-r28.tar.gz"
checksum_asset="${asset}.sha256"
expected="f1143274930eb332b3581def5156852780da4a83af5a1d607bb513ef1eeaff43"
base_url="https://github.com/${repo}/releases/download/${tag}"
cache_root="${XDG_CACHE_HOME:-$HOME/.cache}/archverse-overlay"
release_cache="$cache_root/releases/$tag"
source_root="$cache_root/r28-source"
archive="$release_cache/$asset"
checksum_file="$release_cache/$checksum_asset"

mkdir -p "$release_cache"

download() {
  local url="$1"
  local destination="$2"
  local temporary="${destination}.part"

  rm -f "$temporary"

  if command -v curl >/dev/null 2>&1; then
    curl --fail --location --retry 3 --retry-delay 2 \
      --output "$temporary" "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget --tries=3 --output-document="$temporary" "$url"
  else
    printf 'Error: curl or wget is required to download the release.\n' >&2
    exit 1
  fi

  mv -f "$temporary" "$destination"
}

printf '[archverse-r28] Checking the verified GitHub Release asset...\n'
if [[ ! -f "$archive" ]] || ! printf '%s  %s\n' "$expected" "$archive" | sha256sum -c - >/dev/null 2>&1; then
  printf '[archverse-r28] Downloading %s...\n' "$asset"
  download "$base_url/$asset" "$archive"
fi

printf '[archverse-r28] Downloading the published checksum...\n'
download "$base_url/$checksum_asset" "$checksum_file"

published="$(awk 'NF >= 1 { print $1; exit }' "$checksum_file")"
if [[ "$published" != "$expected" ]]; then
  printf 'Error: published checksum does not match the pinned r28 checksum.\n' >&2
  printf 'Expected:  %s\n' "$expected" >&2
  printf 'Published: %s\n' "${published:-missing}" >&2
  exit 1
fi

printf '%s  %s\n' "$expected" "$archive" | sha256sum -c -

printf '[archverse-r28] Extracting developer-ready source...\n'
rm -rf "$source_root"
mkdir -p "$source_root"
tar -xzf "$archive" -C "$source_root" --strip-components=1

cd "$source_root"
printf '[archverse-r28] Running release verifier...\n'
./verify-release.sh

printf '[archverse-r28] Starting clean installation...\n'
exec ./install-cachyos.sh --clean-install "$@"
