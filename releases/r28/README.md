# ArchVerse Overlay r28

The verified Linux release is published under tag:

```text
linux-v0.1.33-r28
```

Release archive:

```text
ArchVerse-Overlay-linux-v0.1.33-r28.tar.gz
```

## Install

From a clone of this repository:

```bash
cd releases/r28
./reconstruct-and-install.sh
```

The script downloads the GitHub Release archive and its checksum, verifies both
against the pinned r28 SHA-256, extracts the developer-ready source into your
user cache, runs the bundled release verifier, and performs a clean install.
Saved widget positions, Mining selections, notes, and configuration backups are
preserved by the packaged installer.

## Direct download and manual verification

```bash
curl -fL -O \
  https://github.com/gbmccray32-boop/sc-overlay-for-Arch-Linux/releases/download/linux-v0.1.33-r28/ArchVerse-Overlay-linux-v0.1.33-r28.tar.gz

curl -fL -O \
  https://github.com/gbmccray32-boop/sc-overlay-for-Arch-Linux/releases/download/linux-v0.1.33-r28/ArchVerse-Overlay-linux-v0.1.33-r28.tar.gz.sha256

sha256sum -c ArchVerse-Overlay-linux-v0.1.33-r28.tar.gz.sha256
```

Expected SHA-256:

```text
f1143274930eb332b3581def5156852780da4a83af5a1d607bb513ef1eeaff43
```

## Verification

The packaged release passed all 11 automated tests, JavaScript and shell syntax
checks, exact signature-table consistency, all six Scan Mode reference checks,
and executable-permission validation. See `verification-summary.txt`.

## Important behavior in r28

- Ship-mining OCR accepts only exact canonical signatures.
- A candidate requires focused OCR agreement or repeat-frame confirmation.
- Audio alerts require same-frame Scan Mode confirmation.
- Shift+F5 toggles all visible overlay interaction.
- Shift+F6 enables Mining-only interaction for 30 seconds.
- Escape immediately restores click-through.
- Historical `sc-blueprint-tracker` command/config names remain for migration
  compatibility.
