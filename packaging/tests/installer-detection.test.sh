#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
INSTALLER="$ROOT/packaging/release/install-archverse.sh"
DOCTOR="$ROOT/packaging/release/archverse-doctor"
work="$(mktemp -d)"
cleanup() { rm -rf -- "$work"; }
trap cleanup EXIT HUP INT TERM

pass=0
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

run_case() {
  local name="$1" os_release="$2" expected_family="$3" expected_supported="$4"
  local session="$5" desktop="$6" display="$7" hypr_signature="${8:-}"
  local file="$work/$name.os-release" installer_out doctor_out installer_status doctor_status
  printf '%s\n' "$os_release" > "$file"

  set +e
  installer_out="$(env -i PATH="$PATH" HOME="$HOME" ARCHVERSE_OS_RELEASE_FILE="$file" \
    XDG_SESSION_TYPE="$session" XDG_CURRENT_DESKTOP="$desktop" DISPLAY="$display" \
    HYPRLAND_INSTANCE_SIGNATURE="$hypr_signature" "$INSTALLER" --detect-only 2>&1)"
  installer_status=$?
  doctor_out="$(env -i PATH="$PATH" HOME="$HOME" ARCHVERSE_OS_RELEASE_FILE="$file" \
    XDG_SESSION_TYPE="$session" XDG_CURRENT_DESKTOP="$desktop" DISPLAY="$display" \
    HYPRLAND_INSTANCE_SIGNATURE="$hypr_signature" "$DOCTOR" --detect-only 2>&1)"
  doctor_status=$?
  set -e

  grep -q "Package family: $expected_family" <<<"$installer_out" || fail "$name installer family"
  grep -q "family=$expected_family" <<<"$doctor_out" || fail "$name doctor family"
  if [[ "$expected_supported" == yes ]]; then
    [[ $installer_status -eq 0 && $doctor_status -eq 0 ]] || fail "$name should be supported"
    grep -q 'Supported: yes' <<<"$installer_out" || fail "$name installer support"
    grep -q 'supported=yes' <<<"$doctor_out" || fail "$name doctor support"
  else
    [[ $installer_status -eq 4 && $doctor_status -eq 4 ]] || fail "$name should be rejected"
    grep -q 'Supported: no' <<<"$installer_out" || fail "$name installer rejection"
    grep -q 'supported=no' <<<"$doctor_out" || fail "$name doctor rejection"
  fi
  pass=$((pass + 1))
}

run_case cachyos 'ID=cachyos
ID_LIKE=arch
PRETTY_NAME="CachyOS"' arch yes wayland KDE ':1'
run_case arch_x11 'ID=arch
PRETTY_NAME="Arch Linux"' arch yes x11 plasma ':0'
run_case nobara 'ID=nobara
ID_LIKE="fedora rhel"
PRETTY_NAME="Nobara Linux"' fedora yes wayland KDE ':1'
run_case ubuntu 'ID=ubuntu
ID_LIKE=debian
PRETTY_NAME="Ubuntu"' debian yes wayland KDE ':1'
run_case hyprland 'ID=cachyos
ID_LIKE=arch
PRETTY_NAME="CachyOS"' arch no wayland Hyprland ':1' 'test-instance'
run_case no_xwayland 'ID=nobara
ID_LIKE=fedora
PRETTY_NAME="Nobara Linux"' fedora no wayland KDE ''

asset='archverse-overlay-0.1.47.r31.alpha23.candidate18-1-x86_64.pkg.tar.zst'
package_dir="$work/checksum-package"
mkdir -p "$package_dir"
touch "$package_dir/$asset"
(cd "$package_dir" && sha256sum "./$asset" > SHA256SUMS)
checksum_out="$(env -i PATH="$PATH" HOME="$HOME" \
  ARCHVERSE_OS_RELEASE_FILE="$work/cachyos.os-release" \
  XDG_SESSION_TYPE=wayland XDG_CURRENT_DESKTOP=KDE DISPLAY=:1 \
  "$INSTALLER" --package-dir "$package_dir" --dry-run)"
grep -q '^Checksum verified:' <<<"$checksum_out" || fail 'checksum manifest with ./ prefix'
grep -q 'pacman -U' <<<"$checksum_out" || fail 'Arch dry-run install command'
pass=$((pass + 1))

printf 'PASS: %s installer/doctor platform cases\n' "$pass"
