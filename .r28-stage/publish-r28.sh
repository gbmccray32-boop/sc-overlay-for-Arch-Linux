#!/usr/bin/env bash
set -euo pipefail

repo='gbmccray32-boop/sc-overlay-for-Arch-Linux'
stage='origin/linux/r28-developer-cleanup-scan-gate'
tag='linux-v0.1.33-r28'
archive='ArchVerse-Overlay-linux-v0.1.33-r28.tar.gz'
expected='f1143274930eb332b3581def5156852780da4a83af5a1d607bb513ef1eeaff43'

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git fetch origin main linux/r28-developer-cleanup-scan-gate
git checkout -B main origin/main

for part in 00 01 02 03; do
  git show "$stage:.r28-stage/r28-part-$part"
done > /tmp/r28.tar.gz
printf '%s  %s\n' "$expected" /tmp/r28.tar.gz | sha256sum -c -
git show "$stage:.r28-stage/archverse-overlay-icon.png" > /tmp/archverse-overlay-icon.png

rm -rf /tmp/r28
mkdir -p /tmp/r28
tar -xzf /tmp/r28.tar.gz -C /tmp/r28
root="$(find /tmp/r28 -mindepth 1 -maxdepth 1 -type d | head -n 1)"
test -n "$root"

cp LICENSE.md /tmp/LICENSE.md
if [[ -f CONTRIBUTING.md ]]; then cp CONTRIBUTING.md /tmp/CONTRIBUTING.md; fi

git rm -r --ignore-unmatch .
cp -a "$root"/. .
cp /tmp/LICENSE.md LICENSE.md
if [[ -f /tmp/CONTRIBUTING.md ]]; then cp /tmp/CONTRIBUTING.md CONTRIBUTING.md; fi

install -m 0644 /tmp/archverse-overlay-icon.png app/build/icon.png
install -m 0644 /tmp/archverse-overlay-icon.png app/server/overlay/tray-icon.png

python3 - <<'PY'
import json
from pathlib import Path

readme = Path('README.md')
text = readme.read_text()
text = text.replace(
    '# SC Overlay Custom Linux 0.1.33-r28',
    """# ArchVerse Overlay for Arch Linux — r28

> **Unofficial community Linux port.** ArchVerse Overlay is maintained by
> `gbmccray32-boop` and is based on SubliminalsTV's SC Overlay source.
> It is not an official SubliminalsTV release. Historical command names such as
> `sc-blueprint-tracker` remain for installation and configuration migration
> compatibility.
""",
    1,
)
readme.write_text(text)

package = Path('app/package.json')
data = json.loads(package.read_text())
data['name'] = 'archverse-overlay-linux'
data['description'] = (
    'Unofficial Arch/CachyOS Linux Star Citizen companion overlay with exact '
    'Mining OCR, Scan Mode-gated alerts, evdev shortcuts, mission tracking, '
    'and dynamic Star Citizen/Gamescope session binding.'
)
data['author'] = (
    'ArchVerse Linux community port maintained by gbmccray32-boop; '
    'based on SubliminalsTV SC Overlay'
)
data['license'] = 'SEE LICENSE IN LICENSE.md'
package.write_text(json.dumps(data, indent=2) + '\n')

for filename in ('install-cachyos.sh', 'PKGBUILD'):
    path = Path(filename)
    content = path.read_text()
    content = content.replace('SC Overlay Custom Linux', 'ArchVerse Overlay')
    content = content.replace(
        'CachyOS/Linux SC Overlay with',
        'Arch/CachyOS ArchVerse Overlay with',
    )
    if filename == 'PKGBUILD':
        content = content.replace(
            "url='https://github.com/SubliminalsTV-Projects/sc-overlay'",
            "url='https://github.com/gbmccray32-boop/sc-overlay-for-Arch-Linux'",
        )
    path.write_text(content)
PY

cat > FORK-NOTICE.md <<'EOF'
# Unofficial Arch Linux community port

**ArchVerse Overlay** is the Linux-focused fork maintained by
[`gbmccray32-boop`](https://github.com/gbmccray32-boop).

It is based on the SC Overlay source by SubliminalsTV, but it is not an official
SubliminalsTV release and is not supported by the upstream Windows project.

The original copyright notices and FSL-1.1-MIT terms are preserved in
[`LICENSE.md`](LICENSE.md). Upstream names and artwork are not used as this
fork's branding. Historical process names, executable names, application IDs,
and configuration paths remain where changing them would break existing Linux
installations; those identifiers are retained only for compatibility and to
identify the software's origin.

Star Citizen®, Roberts Space Industries®, and Cloud Imperium® are trademarks
of Cloud Imperium Rights LLC. This is an unofficial fan project.
EOF

mkdir -p .github/workflows
cat > .github/workflows/release-linux.yml <<'EOF'
name: Verify and release Linux port

on:
  push:
    branches: [main]
    tags: ['linux-v*']
  pull_request:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: write

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Verify developer-ready release
        run: ./verify-release.sh

  release:
    if: startsWith(github.ref, 'refs/tags/linux-v')
    needs: verify
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build source/install archive
        shell: bash
        run: |
          set -euo pipefail
          root="/tmp/ArchVerse-Overlay-${GITHUB_REF_NAME}"
          archive="ArchVerse-Overlay-${GITHUB_REF_NAME}.tar.gz"
          rm -rf "$root"
          mkdir -p "$root"
          rsync -a --exclude='.git' --exclude='*.tar.gz' ./ "$root/"
          tar -C /tmp -czf "$archive" "$(basename "$root")"
          sha256sum "$archive" > "$archive.sha256"
          echo "ARCHIVE=$archive" >> "$GITHUB_ENV"
      - name: Publish GitHub release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh release create "$GITHUB_REF_NAME" \
            --title "ArchVerse Overlay ${GITHUB_REF_NAME}" \
            --notes-file CHANGELOG-R28.md \
            "$ARCHIVE" "$ARCHIVE.sha256"
EOF

find . -type f ! -path './.git/*' ! -name 'MANIFEST.sha256' -print0 \
  | sort -z | xargs -0 sha256sum > MANIFEST.sha256
./verify-release.sh

git add -A
git commit -m 'Linux: publish r28 Mining OCR and Scan Mode gate'
git push origin main

release_root="/tmp/ArchVerse-Overlay-$tag"
rm -rf "$release_root"
mkdir -p "$release_root"
rsync -a --exclude='.git' --exclude='*.tar.gz' ./ "$release_root/"
tar -C /tmp -czf "$archive" "$(basename "$release_root")"
sha256sum "$archive" > "$archive.sha256"

gh release view "$tag" --repo "$repo" >/dev/null 2>&1 \
  && gh release delete "$tag" --repo "$repo" --yes --cleanup-tag \
  || true
{
  cat CHANGELOG-R28.md
  printf '\n\n---\n\n'
  cat FORK-NOTICE.md
} > /tmp/release-notes.md

gh release create "$tag" \
  --repo "$repo" \
  --target main \
  --title 'ArchVerse Overlay for Arch Linux — r28' \
  --notes-file /tmp/release-notes.md \
  "$archive" "$archive.sha256"
