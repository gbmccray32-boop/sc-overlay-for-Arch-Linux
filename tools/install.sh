#!/bin/bash
# SC Overlay Installer - Auto-detects system and installs accordingly

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🔍 SC Overlay Auto-Installer for Omarchy/Hyprland/Fedora/Arch/KDE/Gnome"
echo "=========================================================================="
echo ""

# Run the Node.js installer
node "$SCRIPT_DIR/tools/install-sc-overlay.mjs"

echo ""
echo "=========================================================================="
echo "✅ Installation Complete!"
echo "=========================================================================="
