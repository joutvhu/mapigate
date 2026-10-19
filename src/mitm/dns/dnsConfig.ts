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
 * Build the set of dual-stack hosts lines (IPv4 and IPv6) for a given hostname.
 */
export function dnsLines(hostname: string): string[] {
  return [`127.0.0.1 ${hostname}`, `::1 ${hostname}`];
}

/**
 * Check whether all IPv4+IPv6 lines for `hostname` are present in hosts file content.
 */
export function hasHostEntry(hostsContent: string, hostname: string): boolean {
  const lines = hostsContent.split(/\r?\n/);
  return dnsLines(hostname).every((entry) => {
    const [ip, host] = entry.split(/\s+/);
    return lines.some((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) return false;
      const parts = trimmed.split(/\s+/).filter(Boolean);
      return parts.length >= 2 && parts[0] === ip && parts.includes(host);
    });
  });
}

function isLineMatchingHosts(line: string, targetHosts: string[]): boolean {
  const trimmed = line.trim();
  if (trimmed.startsWith("#")) return false;
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return false;
  return targetHosts.some((h) => parts.slice(1).includes(h));
}

/**
 * Atomic write for Windows hosts file with rollback on failure.
 * Strategy: write `.new` sibling → rename current to `.bak` → rename `.new` to target.
 * If anything fails mid-way, restore from `.bak`. Same-volume renames are atomic on NTFS.
 */
export function atomicWriteHostsWin(target: string, originalContent: string, newContent: string): void {
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
 * Check if dual-stack DNS entry exists in system hosts file for a specific host.
 */
export function checkDNSEntry(host: string | null = null): boolean {
  try {
    if (!fs.existsSync(HOSTS_FILE)) return false;
    const hostsContent = fs.readFileSync(HOSTS_FILE, "utf8");
    if (host) return hasHostEntry(hostsContent, host);
    // Legacy check: all antigravity hosts present
    return TOOL_HOSTS.antigravity.every((h) => hasHostEntry(hostsContent, h));
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
      result[tool] = hosts.every((h) => hasHostEntry(hostsContent, h));
    }
    return result as Record<MitmToolId, boolean>;
  } catch {
    return { antigravity: false, kiro: false, copilot: false, cursor: false };
  }
}

/**
 * Add dual-stack DNS entries (127.0.0.1 and ::1) for multiple tools in a single batch operation.
 */
export async function addMultipleDNSEntries(tools: string[], sudoPassword?: string): Promise<void> {
  const validTools = tools
    .map((t) => t.toLowerCase() as MitmToolId)
    .filter((t) => Boolean(TOOL_HOSTS[t]));

  if (validTools.length === 0) return;

  const current = fs.existsSync(HOSTS_FILE) ? fs.readFileSync(HOSTS_FILE, "utf8") : "";
  const currentLines = current.split(/\r?\n/);
  const linesToAdd: string[] = [];
  const addedHosts: string[] = [];

  for (const tool of validTools) {
    const hosts = TOOL_HOSTS[tool];
    for (const h of hosts) {
      for (const entry of dnsLines(h)) {
        const [ip, host] = entry.split(/\s+/);
        const exists = currentLines.some((l) => {
          const trimmed = l.trim();
          if (trimmed.startsWith("#")) return false;
          const parts = trimmed.split(/\s+/).filter(Boolean);
          return parts.length >= 2 && parts[0] === ip && parts.includes(host);
        });
        if (!exists && !linesToAdd.includes(entry)) {
          linesToAdd.push(entry);
          if (!addedHosts.includes(h)) {
            addedHosts.push(h);
          }
        }
      }
    }
  }

  if (linesToAdd.length === 0) {
    console.log(`[MITM DNS] Tools (${validTools.join(", ")}): already active in hosts file`);
    return;
  }

  try {
    const eol = IS_WIN ? "\r\n" : "\n";
    const trimmed = current.replace(/[\r\n\s]+$/g, "");
    const toAppend = linesToAdd.join(eol);
    const next = trimmed ? `${trimmed}${eol}${toAppend}${eol}` : `${toAppend}${eol}`;

    if (IS_WIN) {
      await writeHostsFileWin(HOSTS_FILE, current, next);
    } else {
      const escaped = next.replace(/'/g, "'\\''");
      await execWithPassword(`printf '%s' '${escaped}' | tee ${HOSTS_FILE} > /dev/null`, sudoPassword);
      await flushDNS(sudoPassword);
    }
    console.log(`[MITM DNS] Tools (${validTools.join(", ")}): added dual-stack entries for ${addedHosts.join(", ")}`);
  } catch (error: any) {
    const msg = error.message?.includes("incorrect password")
      ? "Wrong sudo password"
      : `Failed to add DNS entries: ${error.message}`;
    throw new Error(msg);
  }
}

/**
 * Add dual-stack DNS entries (127.0.0.1 and ::1) for a specific tool.
 */
export async function addDNSEntry(tool: string, sudoPassword?: string): Promise<void> {
  const toolKey = tool.toLowerCase() as MitmToolId;
  const hosts = TOOL_HOSTS[toolKey];
  if (!hosts) throw new Error(`Unknown tool: ${tool}`);

  await addMultipleDNSEntries([toolKey], sudoPassword);
}

/**
 * Remove dual-stack DNS entries for a specific tool.
 */
export async function removeDNSEntry(tool: string, sudoPassword?: string): Promise<void> {
  const toolKey = tool.toLowerCase() as MitmToolId;
  const hosts = TOOL_HOSTS[toolKey];
  if (!hosts) throw new Error(`Unknown tool: ${tool}`);

  const current = fs.existsSync(HOSTS_FILE) ? fs.readFileSync(HOSTS_FILE, "utf8") : "";
  const hasMatchingLines = current.split(/\r?\n/).some((l) => isLineMatchingHosts(l, hosts));

  if (!hasMatchingLines) {
    console.log(`[MITM DNS] ${tool}: already inactive in hosts file`);
    return;
  }

  try {
    const eol = IS_WIN ? "\r\n" : "\n";
    const filtered = current
      .split(/\r?\n/)
      .filter((l) => !isLineMatchingHosts(l, hosts))
      .join(eol);
    const trimmed = filtered.replace(/[\r\n\s]+$/g, "");
    const next = trimmed ? `${trimmed}${eol}` : "";

    if (IS_WIN) {
      await writeHostsFileWin(HOSTS_FILE, current, next);
    } else {
      const escaped = next.replace(/'/g, "'\\''");
      await execWithPassword(`printf '%s' '${escaped}' | tee ${HOSTS_FILE} > /dev/null`, sudoPassword);
      await flushDNS(sudoPassword);
    }
    console.log(`[MITM DNS] ${tool}: removed entries for ${hosts.join(", ")}`);
  } catch (error: any) {
    const msg = error.message?.includes("incorrect password")
      ? "Wrong sudo password"
      : `Failed to remove DNS entry: ${error.message}`;
    throw new Error(msg);
  }
}

/**
 * Remove ALL tool DNS entries (used when stopping server) in a single batched pass.
 */
export async function removeAllDNSEntries(sudoPassword?: string): Promise<void> {
  const current = fs.existsSync(HOSTS_FILE) ? fs.readFileSync(HOSTS_FILE, "utf8") : "";
  const allHosts = Object.values(TOOL_HOSTS).flat();
  const hasMatchingLines = current.split(/\r?\n/).some((l) => isLineMatchingHosts(l, allHosts));

  if (!hasMatchingLines) {
    console.log("[MITM DNS] All tools: already inactive in hosts file");
    return;
  }

  try {
    const eol = IS_WIN ? "\r\n" : "\n";
    const filtered = current
      .split(/\r?\n/)
      .filter((l) => !isLineMatchingHosts(l, allHosts))
      .join(eol);
    const trimmed = filtered.replace(/[\r\n\s]+$/g, "");
    const next = trimmed ? `${trimmed}${eol}` : "";

    if (IS_WIN) {
      await writeHostsFileWin(HOSTS_FILE, current, next);
    } else {
      const escaped = next.replace(/'/g, "'\\''");
      await execWithPassword(`printf '%s' '${escaped}' | tee ${HOSTS_FILE} > /dev/null`, sudoPassword);
      await flushDNS(sudoPassword);
    }
    console.log("[MITM DNS] All tools: removed hosts entries in single operation");
  } catch (error: any) {
    const msg = error.message?.includes("incorrect password")
      ? "Wrong sudo password"
      : `Failed to remove DNS entries: ${error.message}`;
    console.error(`[MITM DNS] ${msg}`);
    throw new Error(msg);
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
      .filter((l) => !isLineMatchingHosts(l, allHosts))
      .join(eol);
    const trimmed = filtered.replace(/[\r\n\s]+$/g, "");
    const next = trimmed ? `${trimmed}${eol}` : "";
    if (next === content) return;

    if (IS_WIN && isAdmin()) {
      try {
        atomicWriteHostsWin(HOSTS_FILE, content, next);
      } catch {
        fs.writeFileSync(HOSTS_FILE, next, "utf8");
      }
    } else {
      fs.writeFileSync(HOSTS_FILE, next, "utf8");
    }

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
