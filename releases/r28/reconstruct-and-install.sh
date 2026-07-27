#!/usr/bin/env bash
set -euo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
archive="$here/ArchVerse-Overlay-linux-v0.1.33-r28.tar.gz"
expected="f1143274930eb332b3581def5156852780da4a83af5a1d607bb513ef1eeaff43"
cache_root="${XDG_CACHE_HOME:-$HOME/.cache}/archverse-overlay"
source_root="$cache_root/r28-source"

printf '[archverse-r28] Reassembling verified release archive...\n'
cat \
  "$here/r28-part-00" \
  "$here/r28-part-01" \
  "$here/r28-part-02" \
  "$here/r28-part-03" \
  > "$archive"

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
