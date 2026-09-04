#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: tools/update-archverse-handoff.sh [--install-hooks] [--output PATH] [--stdout]

Create a self-contained ArchVerse handoff from the canonical continuity documents
and the repository's current Git state.

Options:
  --install-hooks  Configure this clone to refresh the handoff after commit,
                   checkout, and merge operations.
  --output PATH    Write to PATH instead of ARCHVERSE-HANDOFF.generated.md.
  --stdout         Print the generated handoff after writing it.
  -h, --help       Show this help text.
EOF
}

script_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(git -C "$script_dir" rev-parse --show-toplevel)"
output_path="$repo_root/ARCHVERSE-HANDOFF.generated.md"
install_hooks=false
print_handoff=false

while (($# > 0)); do
  case "$1" in
    --install-hooks)
      install_hooks=true
      shift
      ;;
    --output)
      if (($# < 2)); then
        printf '%s\n' 'error: --output requires a path' >&2
        exit 2
      fi
      output_path="$(realpath -m -- "$2")"
      shift 2
      ;;
    --stdout)
      print_handoff=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'error: unknown option: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

continuity_file="$repo_root/docs/ARCHVERSE-CONTINUITY.md"
contract_file="$repo_root/linux-port/PORTING_CONTRACT.md"
agents_file="$repo_root/AGENTS.md"

for required_file in "$continuity_file" "$contract_file" "$agents_file"; do
  if [[ ! -f "$required_file" ]]; then
    printf 'error: required continuity source is missing: %s\n' "$required_file" >&2
    exit 1
  fi
done

if "$install_hooks"; then
  current_hooks_path="$(git -C "$repo_root" config --get core.hooksPath 2>/dev/null || true)"
  if [[ -n "$current_hooks_path" && "$current_hooks_path" != '.githooks' ]]; then
    printf 'error: refusing to replace existing core.hooksPath: %s\n' "$current_hooks_path" >&2
    exit 1
  fi
  for hook in post-commit post-checkout post-merge; do
    if [[ ! -x "$repo_root/.githooks/$hook" ]]; then
      printf 'error: required Git hook is missing or not executable: .githooks/%s\n' "$hook" >&2
      exit 1
    fi
  done
  git -C "$repo_root" config core.hooksPath .githooks
fi

branch="$(git -C "$repo_root" symbolic-ref --quiet --short HEAD 2>/dev/null || printf 'DETACHED')"
head_sha="$(git -C "$repo_root" rev-parse --verify HEAD)"
head_short="$(git -C "$repo_root" rev-parse --short=12 HEAD)"
head_date="$(git -C "$repo_root" show -s --format=%cI HEAD)"
head_subject="$(git -C "$repo_root" show -s --format=%s HEAD)"
generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

origin_url="$(git -C "$repo_root" remote get-url origin 2>/dev/null || printf 'not configured')"
origin_url="$(printf '%s' "$origin_url" | sed -E 's#(https?://)[^/@]+@#\1[redacted]@#')"
upstream_url="$(git -C "$repo_root" remote get-url upstream 2>/dev/null || printf 'not configured')"
upstream_url="$(printf '%s' "$upstream_url" | sed -E 's#(https?://)[^/@]+@#\1[redacted]@#')"

tracking_ref="$(git -C "$repo_root" rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
if [[ -n "$tracking_ref" ]]; then
  read -r behind_count ahead_count < <(
    git -C "$repo_root" rev-list --left-right --count "$tracking_ref...HEAD"
  )
  tracking_status="ahead $ahead_count, behind $behind_count"
else
  tracking_ref="not configured"
  tracking_status="not available"
fi

working_status="$(git -C "$repo_root" status --porcelain=v1 --untracked-files=all)"
if [[ -z "$working_status" ]]; then
  working_status='clean'
fi

latest_workflow="$(
  find "$repo_root/.github/workflows" -maxdepth 1 -type f -name 'alpha22-candidate*.yml' -print \
    | sort -V \
    | tail -n 1
)"

read_workflow_env() {
  local key="$1"
  local file="$2"
  awk -v key="$key" '
    $1 == key ":" {
      value = $0
      sub(/^[[:space:]]*[A-Za-z0-9_]+:[[:space:]]*/, "", value)
      gsub(/^\047|\047$/, "", value)
      gsub(/^"|"$/, "", value)
      print value
      exit
    }
  ' "$file"
}

if [[ -n "$latest_workflow" ]]; then
  workflow_relative="${latest_workflow#"$repo_root/"}"
  app_version="$(read_workflow_env APP_VERSION "$latest_workflow")"
  base_version="$(read_workflow_env BASE_VERSION "$latest_workflow")"
else
  workflow_relative='not found'
  app_version='not found'
  base_version='not found'
fi

output_dir="$(dirname -- "$output_path")"
mkdir -p -- "$output_dir"
temporary_path="$(mktemp "$output_path.tmp.XXXXXX")"
cleanup() {
  if [[ -n "${temporary_path:-}" && -e "$temporary_path" ]]; then
    rm -f -- "$temporary_path"
  fi
}
trap cleanup EXIT HUP INT TERM

{
  printf '# ArchVerse continuation handoff\n\n'
  printf '> Generated from the repository at `%s`. Regenerate this file instead of editing it.\n\n' "$generated_at"
  printf 'Give this complete file to a new chat when the repository cannot be imported directly. '
  printf 'The new session must treat the evidence labels and Linux contracts below as binding.\n\n'

  printf '## Live repository snapshot\n\n'
  printf '| Item | Value |\n'
  printf '| --- | --- |\n'
  printf '| Working branch | `%s` |\n' "$branch"
  printf '| HEAD | `%s` |\n' "$head_sha"
  printf '| HEAD short | `%s` |\n' "$head_short"
  printf '| HEAD date | `%s` |\n' "$head_date"
  printf '| HEAD subject | `%s` |\n' "$head_subject"
  printf '| Origin | `%s` |\n' "$origin_url"
  printf '| Upstream | `%s` |\n' "$upstream_url"
  printf '| Tracking ref | `%s` |\n' "$tracking_ref"
  printf '| Tracking state | `%s` |\n' "$tracking_status"
  printf '| Latest candidate workflow | `%s` |\n' "$workflow_relative"
  printf '| Workflow APP_VERSION | `%s` |\n' "${app_version:-not found}"
  printf '| Workflow BASE_VERSION | `%s` |\n' "${base_version:-not found}"

  printf '\n### Working tree\n\n```text\n%s\n```\n' "$working_status"
  printf '\n### Recent commits\n\n```text\n'
  git -C "$repo_root" log -20 --date=iso-strict --pretty=format:'%H  %ad  %s'
  printf '\n```\n\n'

  printf '## Canonical project continuity\n\n'
  cat "$continuity_file"
  printf '\n\n## Complete Linux porting contract\n\n'
  cat "$contract_file"
  printf '\n\n## Repository agent instructions\n\n'
  cat "$agents_file"
  printf '\n'
} >"$temporary_path"

chmod 0644 "$temporary_path"
mv -f -- "$temporary_path" "$output_path"
temporary_path=''

printf 'Updated %s\n' "$output_path"
if "$install_hooks"; then
  printf '%s\n' 'Installed versioned ArchVerse continuity hooks for this clone.'
fi
if "$print_handoff"; then
  cat "$output_path"
fi
