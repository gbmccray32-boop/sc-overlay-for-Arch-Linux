#!/usr/bin/env bash
set -euo pipefail

VERSION='0.1.47-r31.alpha23.candidate18'
TAG='v0.1.47-r31.alpha23.candidate18-kde-test1'
REPOSITORY='gbmccray32-boop/sc-overlay-for-Arch-Linux'
DEFAULT_BASE_URL="https://github.com/$REPOSITORY/releases/download/$TAG"
OS_RELEASE_FILE="${ARCHVERSE_OS_RELEASE_FILE:-/etc/os-release}"
package_dir=""
base_url="${ARCHVERSE_RELEASE_BASE_URL:-$DEFAULT_BASE_URL}"
dry_run=0
detect_only=0

usage() {
  cat <<EOF
Usage: $0 [--package-dir DIRECTORY] [--base-url URL] [--dry-run] [--detect-only]

Install the Candidate 18 KDE package for an Arch-, Fedora-, or Debian-family system.
The tested GitHub Actions downloads include the package, this installer, and SHA256SUMS.

  --package-dir DIRECTORY  Install a package from an extracted test download.
  --base-url URL           Download release assets from a different base URL.
  --dry-run                Print the selected package and command without changing the system.
  --detect-only            Print platform detection and exit.
EOF
}

while (($#)); do
  case "$1" in
    --package-dir) package_dir="${2:?--package-dir requires a directory}"; shift 2 ;;
    --base-url) base_url="${2:?--base-url requires a URL}"; shift 2 ;;
    --dry-run) dry_run=1; shift ;;
    --detect-only) detect_only=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

ID=""
ID_LIKE=""
PRETTY_NAME="Unknown Linux"
if [[ -r "$OS_RELEASE_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$OS_RELEASE_FILE"
else
  printf 'Cannot read Linux distribution metadata: %s\n' "$OS_RELEASE_FILE" >&2
  exit 2
fi

tokens=" $(lower "${ID:-} ${ID_LIKE:-}") "
if [[ "$tokens" =~ [[:space:]](arch|cachyos|endeavouros|manjaro)[[:space:]] ]]; then
  family='arch'
  asset='archverse-overlay-0.1.47.r31.alpha23.candidate18-1-x86_64.pkg.tar.zst'
elif [[ "$tokens" =~ [[:space:]](fedora|rhel|centos|nobara)[[:space:]] ]]; then
  family='fedora'
  asset='archverse-overlay-0.1.47-1.r31.alpha23.candidate18.x86_64.rpm'
elif [[ "$tokens" =~ [[:space:]](debian|ubuntu|linuxmint|neon|pop)[[:space:]] ]]; then
  family='debian'
  asset='archverse-overlay_0.1.47~r31~alpha23~candidate18-1_amd64.deb'
else
  printf 'Unsupported Linux distribution: ID=%s ID_LIKE=%s\n' "${ID:-}" "${ID_LIKE:-}" >&2
  exit 3
fi

session="$(lower "${XDG_SESSION_TYPE:-}")"
if [[ "$session" != 'x11' && "$session" != 'wayland' ]]; then
  if [[ -n "${WAYLAND_DISPLAY:-}" ]]; then session='wayland'
  elif [[ -n "${DISPLAY:-}" ]]; then session='x11'
  else session='unknown'
  fi
fi

desktop_blob="$(lower "${XDG_CURRENT_DESKTOP:-}:${DESKTOP_SESSION:-}")"
if [[ -n "${HYPRLAND_INSTANCE_SIGNATURE:-}" || "$desktop_blob" == *hypr* ]]; then
  desktop='hyprland'
elif [[ -n "${KDE_FULL_SESSION:-}" || "$desktop_blob" == *kde* || "$desktop_blob" == *plasma* ]]; then
  desktop='kde'
else
  desktop='unsupported'
fi

supported='no'
if [[ "$desktop" == 'kde' && ( "$session" == 'x11' || "$session" == 'wayland' ) ]]; then
  if [[ "$session" != 'wayland' || -n "${DISPLAY:-}" ]]; then supported='yes'; fi
fi

printf 'Distribution: %s\n' "${PRETTY_NAME:-Unknown Linux}"
printf 'Package family: %s\nDesktop: %s\nSession: %s\nPackage: %s\n' \
  "$family" "$desktop" "$session" "$asset"

if (( detect_only )); then
  printf 'Supported: %s\n' "$supported"
  [[ "$supported" == 'yes' ]] && exit 0 || exit 4
fi

if [[ "$(uname -m)" != 'x86_64' ]]; then
  printf 'Candidate 18 supports x86_64 only; detected %s.\n' "$(uname -m)" >&2
  exit 4
fi
if ! getconf GNU_LIBC_VERSION >/dev/null 2>&1; then
  printf 'Candidate 18 requires a glibc-based Linux distribution.\n' >&2
  exit 4
fi
if [[ "$supported" != 'yes' ]]; then
  printf 'Candidate 18 supports KDE X11 and KDE Wayland with XWayland only.\n' >&2
  if [[ "$desktop" == 'hyprland' ]]; then
    printf 'Hyprland is intentionally reserved for the separate Omarchy port.\n' >&2
  elif [[ "$session" == 'wayland' && -z "${DISPLAY:-}" ]]; then
    printf 'KDE Wayland is active, but XWayland is unavailable.\n' >&2
  fi
  exit 4
fi

temporary_dir=""
cleanup() {
  if [[ -n "$temporary_dir" && -d "$temporary_dir" ]]; then
    rm -rf -- "$temporary_dir"
  fi
}
trap cleanup EXIT HUP INT TERM

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "$package_dir" ]]; then
  package_dir="$(cd -- "$package_dir" && pwd)"
elif [[ -f "$script_dir/$asset" && -f "$script_dir/SHA256SUMS" ]]; then
  package_dir="$script_dir"
else
  command -v curl >/dev/null 2>&1 || { printf 'curl is required to download release assets.\n' >&2; exit 5; }
  temporary_dir="$(mktemp -d)"
  package_dir="$temporary_dir"
  curl --fail --location --retry 3 --output "$package_dir/$asset" "$base_url/$asset"
  curl --fail --location --retry 3 --output "$package_dir/SHA256SUMS" "$base_url/SHA256SUMS"
fi

package="$package_dir/$asset"
manifest="$package_dir/SHA256SUMS"
[[ -f "$package" ]] || { printf 'Package is missing: %s\n' "$package" >&2; exit 5; }
[[ -f "$manifest" ]] || { printf 'Checksum manifest is missing: %s\n' "$manifest" >&2; exit 5; }

expected="$(awk -v name="$asset" '
  {
    file = $2
    sub(/^\.\//, "", file)
    if (file == name) {
      print $1
      exit
    }
  }
' "$manifest")"
[[ "$expected" =~ ^[0-9a-f]{64}$ ]] || {
  printf 'No valid SHA-256 entry exists for %s.\n' "$asset" >&2
  exit 6
}
actual="$(sha256sum "$package" | awk '{print $1}')"
[[ "$actual" == "$expected" ]] || {
  printf 'Package checksum mismatch for %s.\nExpected: %s\nActual:   %s\n' \
    "$asset" "$expected" "$actual" >&2
  exit 6
}
printf 'Checksum verified: %s\n' "$actual"

case "$family" in
  arch) install_command=(pacman -U --needed --noconfirm "$package") ;;
  fedora) install_command=(dnf install -y "$package") ;;
  debian) install_command=(apt-get install -y "$package") ;;
esac

printf 'Install command:'
printf ' %q' "${install_command[@]}"
printf '\n'
if (( dry_run )); then exit 0; fi

if (( EUID == 0 )); then
  "${install_command[@]}"
else
  command -v sudo >/dev/null 2>&1 || { printf 'sudo is required for package installation.\n' >&2; exit 7; }
  sudo "${install_command[@]}"
fi

if command -v archverse-doctor >/dev/null 2>&1; then
  archverse-doctor
else
  printf 'The package installed, but archverse-doctor is not on PATH.\n' >&2
  exit 8
fi

printf '\nArchVerse Candidate 18 is installed. Launch it from the application menu or run archverse-overlay.\n'
