
## Linux Contract: Intelligent Installer Requirement

### Version: 0.1.48 (Sept 27, 2026)

#### Requirement
Every new candidate release or test program push must include an intelligent installer that:

1. **Auto-detects system type** (Omarchy, Fedora, Arch, Debian, Ubuntu)
2. **Auto-detects compositor** (Wayland vs X11/Hyprland/Gnome/KDE/Omarchy)
3. **Installs to user-writable location** (~/.local/share/sc-overlay)
4. **Creates desktop entry** for easy launching from applications menu
5. **Configures capture backend** based on detected compositor
6. **Includes bundled dependencies** (xdotool, libraries, etc.)

#### Implementation Requirements

The installer must be written as either:
- **Node.js script** (.mjs) using `node tools/install-sc-overlay.mjs`
- **Bash script** with auto-detection logic
- **Self-contained package** that can run on target systems

#### Testing Checklist

Before each push to main branch, verify installer:
- [ ] Detects current system correctly
- [ ] Detects compositor (Wayland/X11)
- [ ] Installs without requiring sudo (user-writable location)
- [ ] Creates desktop entry in ~/.local/share/applications/
- [ ] App runs after installation
- [ ] Works on target system (Omarchy, Fedora, Arch, etc.)

#### Files Required for Each Release

For every candidate push to GitHub:
1. **Installer script** (`tools/install-sc-overlay.mjs` or equivalent)
2. **Installation guide** (`tools/INSTALLER-GUIDE.md`)
3. **Documentation** explaining how to use the installer
4. **Test results** showing installer works on target system

#### Acceptance Criteria

An installer is acceptable only if:
- Works without manual configuration
- Detects system automatically
- Installs to user-writable location (no sudo required for app files)
- Creates desktop integration
- Includes all necessary dependencies
- Documentation explains usage clearly

#### Exception Process

If an installer cannot be created:
1. Document why it's not possible
2. Provide alternative installation method
3. Get approval from release manager
4. Include clear instructions in README

#### Enforcement

Starting with Alpha23, releases without working installers will be:
- Flagged for review
- Delayed until installer is created
- Included in changelog as "installer pending"

---

*This contract ensures consistent, user-friendly installation across all supported Linux distributions and compositor configurations.*
