# ArchVerse Overlay r28 release payload

This directory contains the exact verified archive previously packaged as:

```text
SC-Overlay-Custom-Linux-0.1.33-r28-developer-cleanup-scan-gate.tar.gz
```

For the Linux fork it is reconstructed as:

```text
ArchVerse-Overlay-linux-v0.1.33-r28.tar.gz
```

## Install

```bash
./reconstruct-and-install.sh
```

The script verifies the original archive SHA-256, extracts it into your cache,
runs the bundled release verifier, and performs a clean install while preserving
saved widget positions, Mining selections, notes, and configuration backups.

## Manual reconstruction

```bash
cat r28-part-00 r28-part-01 r28-part-02 r28-part-03 \
  > ArchVerse-Overlay-linux-v0.1.33-r28.tar.gz

sha256sum -c SHA256SUMS
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
