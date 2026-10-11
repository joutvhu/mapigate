import { execSync } from "node:child_process";

/**
 * Copy text to clipboard across Windows, macOS, and Linux
 */
export function copyToClipboard(text: string): boolean {
  if (!text) return false;
  try {
    const platform = process.platform;

    if (platform === "darwin") {
      execSync("pbcopy", { input: text, timeout: 2000 });
      return true;
    }

    if (platform === "win32") {
      try {
        // Try clip.exe
        execSync("clip", { input: text, windowsHide: true, timeout: 2000 });
        return true;
      } catch {
        // Fallback to powershell Set-Clipboard
        const escaped = text.replace(/'/g, "''");
        execSync(`powershell.exe -NoProfile -Command "Set-Clipboard -Value '${escaped}'"`, {
          windowsHide: true,
          timeout: 3000,
        });
        return true;
      }
    }

    // Linux: try xclip then xsel
    try {
      execSync("xclip -selection clipboard", { input: text, timeout: 2000 });
      return true;
    } catch {
      execSync("xsel --clipboard --input", { input: text, timeout: 2000 });
      return true;
    }
  } catch {
    return false;
  }
}
