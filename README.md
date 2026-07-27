# ArchVerse Overlay for Arch Linux

> **Unofficial community Linux port.** ArchVerse Overlay is maintained by
> [`gbmccray32-boop`](https://github.com/gbmccray32-boop) and is based on
> SubliminalsTV's SC Overlay source. It is not an official SubliminalsTV release.

ArchVerse Overlay is the Arch Linux/CachyOS-focused edition of the Star Citizen
companion overlay. The current verified Linux build is **r28**.

## Current Linux release

The complete developer-ready r28 source/install archive is stored under
[`releases/r28`](releases/r28/). GitHub's connector cannot attach a binary asset
to a Release object directly, so the verified archive is stored as four Git
blobs with a reconstruction and clean-install script.

```bash
git clone https://github.com/gbmccray32-boop/sc-overlay-for-Arch-Linux.git
cd sc-overlay-for-Arch-Linux/releases/r28
./reconstruct-and-install.sh
```

The script:

1. Reassembles the exact verified r28 archive.
2. Checks SHA-256 `f1143274930eb332b3581def5156852780da4a83af5a1d607bb513ef1eeaff43`.
3. Extracts the developer-ready source tree.
4. Runs `verify-release.sh`.
5. Installs with `./install-cachyos.sh --clean-install`.

## r28 highlights

- Exact whitelist containing 26 ship-mineable ores and 155 unique signatures.
- Invalid cockpit numbers are discarded rather than reported as unknown debris.
- Focused signature-badge OCR with safe formatting correction and confirmation.
- Scan Mode detection from the 2°, 5°, 11°, 22°, 45°, and 90° radar icons.
- Tracked-ore sound and HAL notifications only while Scan Mode is confirmed.
- Restored Shift+F5, Shift+F6, Escape, and held-F input through evdev fallback.
- Dynamic StarCitizen.exe/Gamescope PID-session binding on Wayland.
- Clean install, backup/migration, uninstall, diagnostics, and release verification.

## Repository layout

- `releases/r28/` — verified Linux release payload and install tooling.
- The remaining upstream source and history are retained for comparison,
  attribution, and future Linux-port rebases.
- `linux/r28-developer-cleanup-scan-gate` — transport/developer staging branch.

## License and attribution

The upstream copyright notices and the **FSL-1.1-MIT** terms remain in
[`LICENSE.md`](LICENSE.md). This fork uses separate community branding and does
not claim to be an official SubliminalsTV build.

Star Citizen®, Roberts Space Industries®, and Cloud Imperium® are trademarks of
Cloud Imperium Rights LLC. This is an unofficial fan project.
