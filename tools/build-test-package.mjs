#!/usr/bin/env node

/**
 * Build script for testing Wayland/Hyprland support
 * Creates a test package with the new capture backend
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const pkgDir = process.cwd();
const outputDir = path.join(pkgDir, "release-test");

console.log("🔧 SC Overlay Test Build for Wayland/Hyprland Support\n");

// Clean previous test build
if (fs.existsSync(outputDir)) {
  fs.rmSync(outputDir, { recursive: true, force: true });
}

try {
  // Install dependencies if needed
  console.log("📦 Installing dependencies...");
  execSync("npm ci", { cwd: pkgDir, stdio: "inherit" });

  // Build TypeScript sidecar
  console.log("\n📝 Building TypeScript sidecar...");
  execSync("npm run build", { cwd: pkgDir, stdio: "inherit" });

  // Build Electron app
  console.log("\n⚡ Building Electron app...");
  execSync("npm run dist", { cwd: pkgDir, stdio: "inherit" });

  // Copy test capture files
  console.log("\n📁 Preparing Wayland test package...");
  const releaseDir = path.join(pkgDir, "release");
  
  if (fs.existsSync(releaseDir)) {
    fs.cpSync(releaseDir, outputDir, { recursive: true });
    
    // Add metadata file
    const metadata = {
      buildTime: new Date().toISOString(),
      version: pkgDir.match(/\/(\d+\.\d+\.\d+)/)?.[1] || "0.0.0",
      features: ["wayland-pipewire", "hyprland-support", "spectacle-fallback"],
      testInstructions: [
        "Run on Hyprland/Omarchy Wayland session",
        "Verify Star Citizen detection works",
        "Check mining signature recognition speed",
        "Compare performance vs X11 desktopCapturer"
      ]
    };
    
    fs.writeFileSync(
      path.join(outputDir, "METADATA.json"),
      JSON.stringify(metadata, null, 2)
    );
  }

  console.log("\n✅ Test package ready at:", outputDir);
  console.log("\nTo test:");
  console.log("  cd", outputDir);
  console.log("  ./SC Overlay --help");
  
} catch (error) {
  console.error("\n❌ Build failed:", error.message);
  process.exit(1);
}
