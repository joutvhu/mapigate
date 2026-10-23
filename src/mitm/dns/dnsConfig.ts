import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { TOOL_HOSTS, type MitmToolId } from "../../shared/constants/mitmToolHosts.js";
import { MitmRepository } from "../../storage/repositories/mitmRepo.js";
import { runElevatedPowerShell, isAdmin, quotePs } from "./winElevated.js";

const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";

export const HOSTS_FILE = IS_WIN
  ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "drivers", "etc", "hosts")
  : "/etc/hosts";

/**
 * Build the set of hosts lines for a given hostname.
 * Defaults to IPv4 loopback only; does NOT automatically inject IPv6 (::1).
 */
export function dnsLines(hostname: string, ip = "127.0.0.1"): string[] {
  return [`${ip} ${hostname}`];
}

/**
 * Check whether an entry for `hostname` is present and active (uncommented) in hosts file content.
 * Matches IPv4 (127.0.0.1 or loopback) or legacy IPv6 (::1). Does not require ::1 to be present.
 */
export function hasHostEntry(hostsContent: string, hostname: string): boolean {
  const lines = hostsContent.split(/\r?\n/);
  return lines.some((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) return false;
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length < 2) return false;
    const ip = parts[0];
    const isLocalIp = ip === "127.0.0.1" || ip === "::1" || ip.startsWith("127.");
    return isLocalIp && parts.slice(1).includes(hostname);
  });
}

/**
 * Retrieve configured host lines for a tool as displayed on the UI.
 * Does NOT inject IPv6 (::1).
 */
export function getToolConfiguredLines(tool: string): string[] {
  let hostsText = "";
  try {
    hostsText = MitmRepository.getToolHosts(tool);
  } catch {
    // fallback if repo/db uninitialized
  }
  if (!hostsText) {
    const defaultHosts = TOOL_HOSTS[tool as MitmToolId] || [];
    return defaultHosts.flatMap((h) => dnsLines(h));
  }
  return hostsText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
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
    try {
      execSync("ipconfig /flushdns", { windowsHide: true, stdio: "ignore" });
    } catch {
      // ignore
    }
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
    for (const tool of Object.keys(TOOL_HOSTS)) {
      const configuredLines = getToolConfiguredLines(tool);
      const targetHosts = configuredLines.length > 0
        ? Array.from(new Set(configuredLines.flatMap((l) => l.split(/\s+/).slice(1))))
        : TOOL_HOSTS[tool as MitmToolId] || [];

      result[tool] = targetHosts.length > 0 && targetHosts.every((h) => hasHostEntry(hostsContent, h));
    }
    return result as Record<MitmToolId, boolean>;
  } catch {
    return { antigravity: false, kiro: false, copilot: false, cursor: false };
  }
}

/**
 * Add DNS entries for multiple tools in a single batch operation.
 * Uses exact configured lines without automatic ::1 injection.
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
    const configuredLines = getToolConfiguredLines(tool);
    for (const entry of configuredLines) {
      const parts = entry.split(/\s+/).filter(Boolean);
      if (parts.length < 2) continue;
      const ip = parts[0];
      const host = parts[1];

      const exists = currentLines.some((l) => {
        const trimmed = l.trim();
        if (trimmed.startsWith("#")) return false;
        const lineParts = trimmed.split(/\s+/).filter(Boolean);
        return lineParts.length >= 2 && lineParts[0] === ip && lineParts.includes(host);
      });

      if (!exists && !linesToAdd.includes(entry)) {
        linesToAdd.push(entry);
        if (!addedHosts.includes(host)) {
          addedHosts.push(host);
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
    console.log(`[MITM DNS] Tools (${validTools.join(", ")}): added entries for ${addedHosts.join(", ")}`);
  } catch (error: any) {
    const msg = error.message?.includes("incorrect password")
      ? "Wrong sudo password"
      : `Failed to add DNS entries: ${error.message}`;
    throw new Error(msg);
  }
}

/**
 * Add DNS entries for a specific tool.
 */
export async function addDNSEntry(tool: string, sudoPassword?: string): Promise<void> {
  const toolKey = tool.toLowerCase() as MitmToolId;
  const hosts = TOOL_HOSTS[toolKey];
  if (!hosts) throw new Error(`Unknown tool: ${tool}`);

  await addMultipleDNSEntries([toolKey], sudoPassword);
}

/**
 * Remove DNS entries for a specific tool.
 */
export async function removeDNSEntry(tool: string, sudoPassword?: string): Promise<void> {
  const toolKey = tool.toLowerCase() as MitmToolId;
  const configuredHosts = getToolConfiguredLines(toolKey)
    .map((l) => l.split(/\s+/).slice(1))
    .flat();
  const hosts = Array.from(new Set([...(TOOL_HOSTS[toolKey] || []), ...configuredHosts]));
  if (hosts.length === 0) throw new Error(`Unknown tool: ${tool}`);

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
  const allToolKeys = Object.keys(TOOL_HOSTS);
  const allConfiguredHosts = allToolKeys.flatMap((t) =>
    getToolConfiguredLines(t).flatMap((l) => l.split(/\s+/).slice(1))
  );
  const allHosts = Array.from(new Set([...Object.values(TOOL_HOSTS).flat(), ...allConfiguredHosts]));
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
    const allToolKeys = Object.keys(TOOL_HOSTS);
    const allConfiguredHosts = allToolKeys.flatMap((t) =>
      getToolConfiguredLines(t).flatMap((l) => l.split(/\s+/).slice(1))
    );
    const allHosts = Array.from(new Set([...Object.values(TOOL_HOSTS).flat(), ...allConfiguredHosts]));
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
