#!/usr/bin/env node

/**
 * SC Overlay Auto-Installer
 * Detects system, compositor, and installs accordingly
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const pkgDir = process.cwd();
const appDir = path.join(pkgDir, "release");
const installDir = "/home/gavinb/.local/share/sc-overlay";
const configDir = "/home/gavinb/.config/sc-blueprint-tracker";

console.log("🔍 SC Overlay Auto-Installer\n");

try {
  // Detect system distribution
  const osRelease = execSync('cat /etc/os-release', { encoding: 'utf8' });
  
  let distro = "unknown";
  if (osRelease.includes("ID=omarchy")) distro = "omarchy";
  else if (osRelease.includes("ID=fedora")) distro = "fedora";
  else if (osRelease.includes("ID=arch")) distro = "arch";
  else if (osRelease.includes("ID=debian")) distro = "debian";
  else if (osRelease.includes("ID=ubuntu")) distro = "ubuntu";
  
  console.log(`📦 Distribution: ${distro}`);
  
  // Detect compositor
  const sessionType = osRelease.match(/XDG_SESSION_TYPE="([^"]+)"/)?.[1] || "unknown";
  
  let compositor = sessionType;
  
  // Try to detect specific compositor
  try {
    execSync("hyprctl -j", { stdio: 'pipe' });
    compositor = "hyprland";
  } catch (e) {}
  
  console.log(`🖥️  Compositor: ${compositor}`);
  
  // Create installation directory
  console.log("\n📦 Creating installation directories...");
  
  fs.mkdirSync(installDir, { recursive: true });
  fs.mkdirSync(configDir, { recursive: true });
  console.log(`   ✓ ${installDir}`);
  console.log(`   ✓ ${configDir}`);
  
  // Copy application files
  console.log("\n📦 Installing application...");
  
  if (fs.existsSync(path.join(appDir, "squashfs-root"))) {
    // Old style: copy squashfs-root as-is
    const squashfsRoot = path.join(appDir, "squashfs-root");
    fs.cpSync(squashfsRoot, installDir, { recursive: true });
    console.log("   ✓ Copied from squashfs-root");
  } else if (fs.existsSync(path.join(appDir, "linux-unpacked"))) {
    // New style: copy linux-unpacked
    const linuxUnpacked = path.join(appDir, "linux-unpacked");
    fs.cpSync(linuxUnpacked, installDir, { recursive: true });
    console.log("   ✓ Copied from linux-unpacked");
  } else {
    throw new Error("No application found in release directory");
  }
  
  // Copy sc-log-watcher binary (if not already copied)
  const binaryPath = path.join(installDir, "sc-log-watcher");
  if (!fs.existsSync(binaryPath)) {
    // Try to find it
    fs.readdirSync(installDir).forEach(file => {
      if (file === "sc-log-watcher") {
        console.log("   ✓ Main binary found");
      }
    });
  }
  
  // Create wrapper script using bash heredoc literal
  const wrapperScript = path.join(installDir, "run.sh");
  const configJson = path.join(configDir, "config.json");
  
  // Generate config based on compositor and distro
  let captureBackend = "pipewire";
  if (compositor === "x11" || compositor === "hyprland-xwayland") {
    captureBackend = "x11";
  } else if (!["omarchy", "hyprland"].includes(compositor)) {
    captureBackend = "pipewire"; // Default to pipewire for Wayland
  }
  
  const config = {
    fabCapture: true,
    captureBackend,
    miningDebug: false,
    compositor,
    sessionBinder: "xdotool",
    ocrClient: "/usr/lib/node_modules/@gutenye/ocr-node"
  };
  
  fs.writeFileSync(configJson, JSON.stringify(config, null, 2));
  console.log("   ✓ Configuration created");
  
  // Create wrapper script - use literal string to avoid BASH_SOURCE issues
  const runScript = "#!/bin/bash\n# SC Overlay - Auto-configured for " + compositor + " on " + distro + "\n\nSCRIPT_DIR=\"$(cd \"$(dirname $0)\" && pwd)\"\nAPP=\"$SCRIPT_DIR/sc-log-watcher\"\n\nexec \"$APP\" \"$@\"\n";
  
  fs.writeFileSync(wrapperScript, runScript);
  execSync(`chmod +x "${wrapperScript}"`);
  console.log("   ✓ Wrapper script created");
  
  // Create desktop entry
  const desktopFile = path.join(os.homedir(), ".local/share/applications/sc-overlay.desktop");
  const desktopContent = `[Desktop Entry]
Type=Application
Name=SC Overlay
Exec=${installDir}/run.sh %F
Icon=/home/gavinb/.local/share/sc-overlay/build/icon.png
Categories=Utility;Development;
Keywords=mining;star citizen;overlay;blueprint;subliminals;
Terminal=false
`;
  
  fs.writeFileSync(desktopFile, desktopContent);
  console.log("   ✓ Desktop entry created");
  
  // Create systemd service (optional)
  const systemdFile = path.join(os.homedir(), ".config/systemd/user/sc-overlay.service");
  const serviceContent = `[Unit]
Description=SC Overlay - Mining Assistant

[Service]
Type=simple
ExecStart=${installDir}/run.sh
Restart=on-failure

[Install]
WantedBy=default.target
`;
  
  fs.writeFileSync(systemdFile, serviceContent);
  console.log("   ✓ Systemd service created (optional)");
  
  // Create documentation file
  const readmeFile = path.join(installDir, "README.md");
  const readmeContent = `# SC Overlay - ${distro} Installation\n\n## System Information\n- **Distribution**: ${distro}\n- **Compositor**: ${compositor}\n- **Capture Backend**: ${captureBackend}\n\n## Usage\n\n### Start the application\n\`\`\`bash\n${installDir}/run.sh\n\`\`\`\n\n## Configuration\n\nMain config: ${configJson}\n\nEdit to change settings like:\n- \`fabCapture\`: Enable/disable FAB capture\n- \`captureBackend\`: pipewire | x11 | spectacle\n- \`miningDebug\`: Enable debug logging\n`;
  
  fs.writeFileSync(readmeFile, readmeContent);
  console.log("   ✓ Documentation created");
  
  console.log("\n✅ Installation Complete!");
  console.log(`\n📍 Application: ${installDir}/run.sh`);
  console.log(`📄 Config: ${configJson}`);
  console.log(`🖼️  Desktop: ${desktopFile}`);
  
} catch (error) {
  console.error("\n❌ Installation failed:", error.message);
  process.exit(1);
}
