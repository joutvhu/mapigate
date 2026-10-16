import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { APP_NAME } from "../../shared/constants/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const AUTOSTART_APP_LABEL = "com.mapigate.autostart";

export interface AutoStartInfo {
  enabled: boolean;
  platform: NodeJS.Platform;
  targetPath: string | null;
  entryScript: string | null;
}

/**
 * Resolve the target server entry script to execute on boot.
 */
export function resolveServerScriptPath(customPath?: string): string | null {
  if (customPath && fs.existsSync(customPath)) {
    return path.resolve(customPath);
  }

  const candidates = [
    path.resolve(__dirname, "../../server/index.js"),
    path.resolve(__dirname, "../server/index.js"),
    path.resolve(process.cwd(), "dist/server/index.js"),
    path.resolve(process.cwd(), "bin/mapigate.js"),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  if (process.argv[1] && fs.existsSync(process.argv[1])) {
    return path.resolve(process.argv[1]);
  }

  return null;
}

/**
 * Get OS-specific startup target path.
 */
export function getStartupEntryPath(): string | null {
  const platform = process.platform;
  if (platform === "win32") {
    const startupDir = path.join(
      process.env.APPDATA || "",
      "Microsoft",
      "Windows",
      "Start Menu",
      "Programs",
      "Startup"
    );
    return path.join(startupDir, `${APP_NAME}.vbs`);
  }
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "LaunchAgents", `${AUTOSTART_APP_LABEL}.plist`);
  }
  if (platform === "linux") {
    return path.join(os.homedir(), ".config", "autostart", `${APP_NAME.toLowerCase()}.desktop`);
  }
  return null;
}

/**
 * Check if autostart is enabled on the current system.
 */
export function isAutoStartEnabled(): boolean {
  const platform = process.platform;
  try {
    const targetPath = getStartupEntryPath();
    if (!targetPath) return false;

    if (platform === "darwin") {
      if (!fs.existsSync(targetPath)) return false;
      try {
        execSync(`launchctl list ${AUTOSTART_APP_LABEL}`, {
          stdio: ["ignore", "ignore", "ignore"],
          timeout: 3000,
        });
        return true;
      } catch {
        return false;
      }
    }

    return fs.existsSync(targetPath);
  } catch {
    return false;
  }
}

/**
 * Get comprehensive autostart status info.
 */
export function getAutoStartInfo(): AutoStartInfo {
  return {
    enabled: isAutoStartEnabled(),
    platform: process.platform,
    targetPath: getStartupEntryPath(),
    entryScript: resolveServerScriptPath(),
  };
}

/**
 * Enable autostart on system boot.
 */
export function enableAutoStart(customScriptPath?: string): boolean {
  const platform = process.platform;
  if (!["darwin", "win32", "linux"].includes(platform)) return false;

  try {
    if (platform === "win32") return enableWindows(customScriptPath);
    if (platform === "darwin") return enableMacOS(customScriptPath);
    if (platform === "linux") return enableLinux(customScriptPath);
  } catch (err) {
    console.error("[Autostart] Failed to enable autostart:", err);
  }
  return false;
}

/**
 * Disable autostart on system boot.
 */
export function disableAutoStart(): boolean {
  const platform = process.platform;
  try {
    if (platform === "win32") return disableWindows();
    if (platform === "darwin") return disableMacOS();
    if (platform === "linux") return disableLinux();
  } catch (err) {
    console.error("[Autostart] Failed to disable autostart:", err);
  }
  return false;
}

// ============ Windows Implementation ============

function enableWindows(customScriptPath?: string): boolean {
  const targetPath = getStartupEntryPath();
  if (!targetPath) return false;

  const startupDir = path.dirname(targetPath);
  if (!fs.existsSync(startupDir)) {
    fs.mkdirSync(startupDir, { recursive: true });
  }

  const nodePath = process.execPath;
  const scriptPath = resolveServerScriptPath(customScriptPath);
  if (!scriptPath) return false;

  // Windows VBScript runs the node process hidden (0, False) without popup terminal window
  const vbsContent = `' Mapigate Windows Autostart Entry
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """${nodePath}"" ""${scriptPath}"" --tray --daemon", 0, False
`;

  fs.writeFileSync(targetPath, vbsContent, "utf8");
  return true;
}

function disableWindows(): boolean {
  const targetPath = getStartupEntryPath();
  if (targetPath && fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }
  return true;
}

// ============ macOS Implementation ============

function isAgentSelfMacOS(): boolean {
  try {
    const output = execSync(`launchctl list ${AUTOSTART_APP_LABEL}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
    });
    const match = output.match(/"PID"\s*=\s*(\d+)/);
    return Boolean(match && parseInt(match[1], 10) === process.pid);
  } catch {
    return false;
  }
}

function enableMacOS(customScriptPath?: string): boolean {
  const targetPath = getStartupEntryPath();
  if (!targetPath) return false;

  const launchAgentsDir = path.dirname(targetPath);
  if (!fs.existsSync(launchAgentsDir)) {
    fs.mkdirSync(launchAgentsDir, { recursive: true });
  }

  const nodePath = process.execPath;
  const scriptPath = resolveServerScriptPath(customScriptPath);
  if (!scriptPath) return false;

  const launchPath = `${path.dirname(nodePath)}:/usr/local/bin:/usr/bin:/bin`;

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${AUTOSTART_APP_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${scriptPath}</string>
        <string>--tray</string>
        <string>--daemon</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${launchPath}</string>
        <key>MAPIGATE_DAEMON</key>
        <string>1</string>
        <key>MAPIGATE_TRAY</key>
        <string>1</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
</dict>
</plist>`;

  fs.writeFileSync(targetPath, plistContent, "utf8");

  if (isAgentSelfMacOS()) {
    return true;
  }

  try {
    execSync(`launchctl unload "${targetPath}"`, { stdio: "ignore" });
  } catch {
    // ignore
  }
  try {
    execSync(`launchctl load -w "${targetPath}"`, { stdio: "ignore" });
  } catch {
    // ignore
  }
  return true;
}

function disableMacOS(): boolean {
  const targetPath = getStartupEntryPath();
  if (!targetPath) return false;

  if (!isAgentSelfMacOS()) {
    try {
      execSync(`launchctl unload "${targetPath}"`, { stdio: "ignore" });
    } catch {
      // ignore
    }
  }

  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }
  return true;
}

// ============ Linux Implementation ============

function enableLinux(customScriptPath?: string): boolean {
  const targetPath = getStartupEntryPath();
  if (!targetPath) return false;

  const autostartDir = path.dirname(targetPath);
  if (!fs.existsSync(autostartDir)) {
    fs.mkdirSync(autostartDir, { recursive: true });
  }

  const nodePath = process.execPath;
  const scriptPath = resolveServerScriptPath(customScriptPath);
  if (!scriptPath) return false;

  const desktopContent = `[Desktop Entry]
Type=Application
Name=${APP_NAME}
Comment=Mapigate AI Gateway & Token Optimizer
Exec=${nodePath} "${scriptPath}" --tray --daemon
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
`;

  fs.writeFileSync(targetPath, desktopContent, "utf8");
  return true;
}

function disableLinux(): boolean {
  const targetPath = getStartupEntryPath();
  if (targetPath && fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }
  return true;
}
