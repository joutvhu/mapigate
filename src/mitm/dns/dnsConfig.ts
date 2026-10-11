import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { TOOL_HOSTS, type MitmToolId } from "../../shared/constants/mitmToolHosts.js";
import { runElevatedPowerShell, isAdmin, quotePs } from "./winElevated.js";

const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";

export const HOSTS_FILE = IS_WIN
  ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "drivers", "etc", "hosts")
  : "/etc/hosts";

/**
 * Atomic write for Windows hosts file with rollback on failure.
 * Strategy: write `.new` sibling → rename current to `.bak` → rename `.new` to target.
 * If anything fails mid-way, restore from `.bak`. Same-volume renames are atomic on NTFS.
 */
function atomicWriteHostsWin(target: string, originalContent: string, newContent: string): void {
  const tmpNew = `${target}.mapigate.new`;
  const tmpBak = `${target}.mapigate.bak`;
  try {
    fs.writeFileSync(tmpNew, newContent, "utf8");
    try {
      fs.unlinkSync(tmpBak);
    } catch {
      // none
    }
    fs.renameSync(target, tmpBak);
    try {
      fs.renameSync(tmpNew, target);
    } catch (e) {
      // Rollback: restore original
      try {
        fs.renameSync(tmpBak, target);
      } catch {
        fs.writeFileSync(target, originalContent, "utf8");
      }
      throw e;
    }
    try {
      fs.unlinkSync(tmpBak);
    } catch {
      // best effort
    }
  } finally {
    try {
      fs.unlinkSync(tmpNew);
    } catch {
      // already moved or never created
    }
  }
}

/**
 * Write hosts file on Windows, falling back to elevated PowerShell if unprivileged.
 */
async function writeHostsFileWin(target: string, currentContent: string, newContent: string): Promise<void> {
  if (isAdmin()) {
    atomicWriteHostsWin(target, currentContent, newContent);
    await runElevatedPowerShell("ipconfig /flushdns | Out-Null");
    return;
  }

  // Fallback: write to temp file and elevate copy via PowerShell
  const tmpFile = path.join(os.tmpdir(), `mapigate-hosts-${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, newContent, "utf8");
  try {
    const psScript = `
      Copy-Item -Path ${quotePs(tmpFile)} -Destination ${quotePs(target)} -Force;
      ipconfig /flushdns | Out-Null;
    `;
    await runElevatedPowerShell(psScript);
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // best effort
    }
  }
}

/** True when `sudo` exists (missing on minimal Docker images like Alpine). */
export function isSudoAvailable(): boolean {
  if (IS_WIN) return false;
  try {
    execSync("command -v sudo", { stdio: "ignore", windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

export function canRunSudoWithoutPassword(): boolean {
  if (IS_WIN || !isSudoAvailable()) return true;
  try {
    execSync("sudo -n true", { stdio: "ignore", windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

export function isSudoPasswordRequired(): boolean {
  return !IS_WIN && isSudoAvailable() && !canRunSudoWithoutPassword();
}

/**
 * Execute command with sudo password via stdin (macOS/Linux only).
 */
export function execWithPassword(command: string, password?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const useSudo = isSudoAvailable();
    const child = useSudo
      ? spawn("sudo", ["-S", "sh", "-c", command], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true })
      : spawn("sh", ["-c", command], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `Exit code ${code}`));
    });

    if (useSudo && password && child.stdin) {
      child.stdin.write(`${password}\n`);
      child.stdin.end();
    }
  });
}

/**
 * Flush DNS cache (macOS/Linux)
 */
export async function flushDNS(sudoPassword?: string): Promise<void> {
  if (IS_WIN) return; // Windows flushes inline via ipconfig
  if (IS_MAC) {
    await execWithPassword("dscacheutil -flushcache && killall -HUP mDNSResponder", sudoPassword);
  } else {
    await execWithPassword("resolvectl flush-caches 2>/dev/null || true", sudoPassword);
  }
}

/**
 * Check if DNS entry exists in system hosts file for a specific host.
 */
export function checkDNSEntry(host: string | null = null): boolean {
  try {
    if (!fs.existsSync(HOSTS_FILE)) return false;
    const hostsContent = fs.readFileSync(HOSTS_FILE, "utf8");
    if (host) return hostsContent.includes(host);
    // Legacy check: all antigravity hosts present
    return TOOL_HOSTS.antigravity.every((h) => hostsContent.includes(h));
  } catch {
    return false;
  }
}

/**
 * Check DNS status per tool — returns { [tool]: boolean }
 */
export function checkAllDNSStatus(): Record<MitmToolId, boolean> {
  try {
    if (!fs.existsSync(HOSTS_FILE)) {
      return { antigravity: false, kiro: false, copilot: false, cursor: false };
    }
    const hostsContent = fs.readFileSync(HOSTS_FILE, "utf8");
    const result: Record<string, boolean> = {};
    for (const [tool, hosts] of Object.entries(TOOL_HOSTS)) {
      result[tool] = hosts.every((h) => hostsContent.includes(h));
    }
    return result as Record<MitmToolId, boolean>;
  } catch {
    return { antigravity: false, kiro: false, copilot: false, cursor: false };
  }
}

/**
 * Add DNS entries for a specific tool.
 */
export async function addDNSEntry(tool: string, sudoPassword?: string): Promise<void> {
  const toolKey = tool.toLowerCase() as MitmToolId;
  const hosts = TOOL_HOSTS[toolKey];
  if (!hosts) throw new Error(`Unknown tool: ${tool}`);

  const entriesToAdd = hosts.filter((h) => !checkDNSEntry(h));
  if (entriesToAdd.length === 0) {
    console.log(`[MITM DNS] ${tool}: already active in hosts file`);
    return;
  }

  try {
    if (IS_WIN) {
      const current = fs.existsSync(HOSTS_FILE) ? fs.readFileSync(HOSTS_FILE, "utf8") : "";
      const trimmed = current.replace(/[\r\n\s]+$/g, "");
      const toAppend = entriesToAdd.map((h) => `127.0.0.1 ${h}`).join("\r\n");
      const next = `${trimmed}\r\n${toAppend}\r\n`;
      await writeHostsFileWin(HOSTS_FILE, current, next);
    } else {
      const current = fs.existsSync(HOSTS_FILE) ? fs.readFileSync(HOSTS_FILE, "utf8") : "";
      const trimmed = current.replace(/[\r\n\s]+$/g, "");
      const toAppend = entriesToAdd.map((h) => `127.0.0.1 ${h}`).join("\n");
      const next = `${trimmed}\n${toAppend}\n`;
      const escaped = next.replace(/'/g, "'\\''");
      await execWithPassword(`printf '%s' '${escaped}' | tee ${HOSTS_FILE} > /dev/null`, sudoPassword);
      await flushDNS(sudoPassword);
    }
    console.log(`[MITM DNS] ${tool}: added ${entriesToAdd.join(", ")}`);
  } catch (error: any) {
    const msg = error.message?.includes("incorrect password")
      ? "Wrong sudo password"
      : `Failed to add DNS entry: ${error.message}`;
    throw new Error(msg);
  }
}

/**
 * Remove DNS entries for a specific tool.
 */
export async function removeDNSEntry(tool: string, sudoPassword?: string): Promise<void> {
  const toolKey = tool.toLowerCase() as MitmToolId;
  const hosts = TOOL_HOSTS[toolKey];
  if (!hosts) throw new Error(`Unknown tool: ${tool}`);

  const entriesToRemove = hosts.filter((h) => checkDNSEntry(h));
  if (entriesToRemove.length === 0) {
    console.log(`[MITM DNS] ${tool}: already inactive in hosts file`);
    return;
  }

  try {
    if (IS_WIN) {
      const current = fs.existsSync(HOSTS_FILE) ? fs.readFileSync(HOSTS_FILE, "utf8") : "";
      const filtered = current
        .split(/\r?\n/)
        .filter((l) => !entriesToRemove.some((h) => l.includes(h)))
        .join("\r\n");
      const next = filtered.replace(/[\r\n\s]+$/g, "") + "\r\n";
      await writeHostsFileWin(HOSTS_FILE, current, next);
    } else {
      const current = fs.existsSync(HOSTS_FILE) ? fs.readFileSync(HOSTS_FILE, "utf8") : "";
      const filtered = current
        .split(/\r?\n/)
        .filter((l) => !entriesToRemove.some((h) => l.includes(h)))
        .join("\n");
      const next = filtered.replace(/[\r\n\s]+$/g, "") + "\n";
      const escaped = next.replace(/'/g, "'\\''");
      await execWithPassword(`printf '%s' '${escaped}' | tee ${HOSTS_FILE} > /dev/null`, sudoPassword);
      await flushDNS(sudoPassword);
    }
    console.log(`[MITM DNS] ${tool}: removed ${entriesToRemove.join(", ")}`);
  } catch (error: any) {
    const msg = error.message?.includes("incorrect password")
      ? "Wrong sudo password"
      : `Failed to remove DNS entry: ${error.message}`;
    throw new Error(msg);
  }
}

/**
 * Remove ALL tool DNS entries (used when stopping server).
 */
export async function removeAllDNSEntries(sudoPassword?: string): Promise<void> {
  for (const tool of Object.keys(TOOL_HOSTS)) {
    try {
      await removeDNSEntry(tool, sudoPassword);
    } catch (e: any) {
      console.error(`[MITM DNS] ${tool}: failed to remove — ${e.message}`);
    }
  }
}

/**
 * Sync removal of ALL tool DNS entries — for use during process shutdown
 * when async operations aren't safe. Assumes caller has write access.
 */
export function removeAllDNSEntriesSync(): void {
  try {
    if (!fs.existsSync(HOSTS_FILE)) return;
    const allHosts = Object.values(TOOL_HOSTS).flat();
    const content = fs.readFileSync(HOSTS_FILE, "utf8");
    const eol = IS_WIN ? "\r\n" : "\n";
    const filtered = content
      .split(/\r?\n/)
      .filter((l) => !allHosts.some((h) => l.includes(h)))
      .join(eol);
    const next = filtered.replace(/[\r\n\s]+$/g, "") + eol;
    if (next === content) return;

    fs.writeFileSync(HOSTS_FILE, next, "utf8");
    if (IS_WIN) {
      try {
        execSync("ipconfig /flushdns", { windowsHide: true, stdio: "ignore" });
      } catch {
        // ignore
      }
    } else if (IS_MAC) {
      try {
        execSync("dscacheutil -flushcache && killall -HUP mDNSResponder", { stdio: "ignore" });
      } catch {
        // ignore
      }
    } else {
      try {
        execSync("resolvectl flush-caches 2>/dev/null || true", { stdio: "ignore" });
      } catch {
        // ignore
      }
    }
  } catch {
    // Best effort during shutdown
  }
}
