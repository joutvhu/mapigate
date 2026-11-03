import net from "node:net";
import { exec } from "node:child_process";

export interface PortOwnerInfo {
  port: number;
  inUse: boolean;
  pid?: number;
  processName?: string;
  commandLine?: string;
  isSystemProcess?: boolean;
  remediationHint?: string;
}

export class PortConflictError extends Error {
  public code: "PORT_443_BUSY" | "PORT_443_SYSTEM" | "PORT_CONFLICT";
  public portOwner: PortOwnerInfo;

  constructor(
    message: string,
    code: "PORT_443_BUSY" | "PORT_443_SYSTEM" | "PORT_CONFLICT",
    portOwner: PortOwnerInfo
  ) {
    super(message);
    this.name = "PortConflictError";
    this.code = code;
    this.portOwner = portOwner;
  }
}

const SYSTEM_PROCESS_NAMES = new Set([
  "system",
  "system idle process",
  "svchost",
  "svchost.exe",
  "http.sys",
  "w3wp.exe",
  "w3wp",
  "csrss",
  "csrss.exe",
  "lsass",
  "lsass.exe",
  "services",
  "services.exe",
  "smss",
  "smss.exe",
  "wininit",
  "wininit.exe",
]);

const SYSTEM_REMEDIATION_HINT =
  "Run 'iisreset /stop' or 'net stop w3svc' in an Administrator terminal to release port 443.";

export const TIME_WAIT_REMEDIATION_HINT =
  "Port 443 is in a transient TIME_WAIT socket release state from a recent connection. It will release automatically in a moment. Click Retry to connect.";

/**
 * Check if a process by PID or process name is a protected system service.
 */
export function isProtectedSystemProcess(pid?: number, processName?: string): boolean {
  if (pid !== undefined && (!pid || pid <= 4)) return true;
  if (!processName) return false;
  const lower = processName.trim().toLowerCase();
  const baseName = lower.replace(/\.exe$/i, "");
  return SYSTEM_PROCESS_NAMES.has(lower) || SYSTEM_PROCESS_NAMES.has(baseName);
}

/**
 * Look up the process name by PID.
 */
export function getProcessNameByPid(pid: number): Promise<string> {
  const isWin = process.platform === "win32";
  if (isWin) {
    return new Promise<string>((resolve) => {
      exec(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { windowsHide: true, timeout: 3000 }, (_err, stdout) => {
        if (!stdout) return resolve("unknown");
        const match = stdout.match(/"([^"]+)"/);
        resolve(match ? match[1] : "unknown");
      });
    });
  } else {
    return new Promise<string>((resolve) => {
      exec(`ps -p ${pid} -o comm=`, { windowsHide: true, timeout: 3000 }, (_err, stdout) => {
        resolve(stdout?.trim() || "unknown");
      });
    });
  }
}

/**
 * Probe whether a TCP port is free to bind on 0.0.0.0.
 */
export function checkPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => {
      resolve(false);
    });
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    try {
      server.listen(port, "0.0.0.0");
    } catch {
      resolve(false);
    }
  });
}

/**
 * Windows fallback: inspect port owner using netstat and tasklist.
 */
function inspectPortOwnerNetstat(port: number): Promise<{ pid?: number; processName?: string } | null> {
  return new Promise((resolve) => {
    exec("netstat -ano -p tcp", { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const lines = stdout.split(/\r?\n/);
      let foundPid: number | undefined;

      for (const line of lines) {
        if (!line.includes("LISTENING")) continue;
        const tokens = line.trim().split(/\s+/);
        // Typical netstat line: TCP 0.0.0.0:443 0.0.0.0:0 LISTENING 4
        if (tokens.length >= 5) {
          const localAddr = tokens[1];
          if (localAddr.endsWith(`:${port}`) || localAddr.endsWith(`]:${port}`)) {
            const rawPid = parseInt(tokens[tokens.length - 1], 10);
            if (!isNaN(rawPid)) {
              foundPid = rawPid;
              break;
            }
          }
        }
      }

      if (foundPid === undefined) return resolve(null);
      if (foundPid <= 4) {
        return resolve({ pid: foundPid, processName: "System" });
      }

      exec(`tasklist /FI "PID eq ${foundPid}" /FO CSV /NH`, { windowsHide: true }, (taskErr, taskOut) => {
        if (taskErr || !taskOut) return resolve({ pid: foundPid, processName: "unknown" });
        const match = taskOut.match(/"([^"]+)"/);
        resolve({ pid: foundPid, processName: match ? match[1] : "unknown" });
      });
    });
  });
}

/**
 * Inspect the process currently occupying the given TCP port.
 */
export async function inspectPortOwner(port: number): Promise<PortOwnerInfo> {
  const isWin = process.platform === "win32";

  if (isWin) {
    try {
      const psScript = `
$c = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $c) {
  $c = Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1
}
if ($c) {
  $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
  @{
    InUse = $true
    Pid = [int]$c.OwningProcess
    ProcessName = if ($p) { [string]$p.ProcessName } else { "" }
  } | ConvertTo-Json -Compress
} else {
  @{ InUse = $false } | ConvertTo-Json -Compress
}
`;
      const encoded = Buffer.from(psScript, "utf16le").toString("base64");
      const psOutput = await new Promise<string>((resolve, reject) => {
        exec(
          `powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
          { windowsHide: true, timeout: 5000 },
          (err, stdout) => {
            if (err) reject(err);
            else resolve(stdout ? stdout.trim() : "");
          }
        );
      });

      if (psOutput) {
        try {
          const parsed = JSON.parse(psOutput);
          if (parsed.InUse) {
            const pid: number = parsed.Pid;
            const isTimeWait = pid === 0;
            let processName: string = isTimeWait
              ? "Idle (TIME_WAIT)"
              : parsed.ProcessName || (pid <= 4 ? "System" : "unknown");
            const isSystemProcess = !isTimeWait && isProtectedSystemProcess(pid, processName);
            const hint = isTimeWait
              ? TIME_WAIT_REMEDIATION_HINT
              : isSystemProcess
              ? SYSTEM_REMEDIATION_HINT
              : undefined;

            return {
              port,
              inUse: true,
              pid,
              processName,
              isSystemProcess,
              remediationHint: hint,
            };
          }
        } catch {
          // JSON parsing failed, fallback below
        }
      }
    } catch {
      // PowerShell failed, fallback to netstat below
    }

    // Secondary fallback on Windows: netstat -ano
    const netstatOwner = await inspectPortOwnerNetstat(port);
    if (netstatOwner && netstatOwner.pid !== undefined) {
      const pid = netstatOwner.pid;
      const isTimeWait = pid === 0;
      const processName = isTimeWait
        ? "Idle (TIME_WAIT)"
        : netstatOwner.processName || (pid <= 4 ? "System" : "unknown");
      const isSystemProcess = !isTimeWait && isProtectedSystemProcess(pid, processName);
      const hint = isTimeWait
        ? TIME_WAIT_REMEDIATION_HINT
        : isSystemProcess
        ? SYSTEM_REMEDIATION_HINT
        : undefined;

      return {
        port,
        inUse: true,
        pid,
        processName,
        isSystemProcess,
        remediationHint: hint,
      };
    }

    // Verify if socket is actually free
    const isFree = await checkPortFree(port);
    if (!isFree) {
      // Port in use but PID couldn't be resolved (likely elevated system driver HTTP.sys)
      return {
        port,
        inUse: true,
        pid: 4,
        processName: "System",
        isSystemProcess: true,
        remediationHint: SYSTEM_REMEDIATION_HINT,
      };
    }

    return { port, inUse: false };
  }

  // POSIX (Linux/macOS)
  try {
    const lsofPid = await new Promise<number | null>((resolve) => {
      exec(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, { windowsHide: true, timeout: 5000 }, (err, stdout) => {
        if (err || !stdout?.trim()) return resolve(null);
        const firstLine = stdout.trim().split("\n")[0];
        const parsedPid = parseInt(firstLine, 10);
        resolve(isNaN(parsedPid) ? null : parsedPid);
      });
    });

    if (lsofPid !== null) {
      const procName = await new Promise<string>((resolve) => {
        exec(`ps -p ${lsofPid} -o comm=`, { windowsHide: true, timeout: 3000 }, (err, stdout) => {
          resolve(err || !stdout?.trim() ? "unknown" : stdout.trim());
        });
      });

      const isSystemProcess = isProtectedSystemProcess(lsofPid, procName);
      return {
        port,
        inUse: true,
        pid: lsofPid,
        processName: procName,
        isSystemProcess,
      };
    }
  } catch {
    // POSIX inspection failed
  }

  const isFreePosix = await checkPortFree(port);
  if (!isFreePosix) {
    return {
      port,
      inUse: true,
      processName: "unknown",
      isSystemProcess: false,
    };
  }

  return { port, inUse: false };
}

/**
 * Terminate a process by PID with safety checks preventing termination of system processes.
 */
export async function killProcessByPid(
  pid: number,
  _force: boolean = true,
  knownProcessName?: string
): Promise<boolean> {
  if (!pid || pid <= 4) {
    throw new Error(
      `Cannot terminate system process with PID ${pid}. Termination aborted for system safety.`
    );
  }

  // Defense-in-depth: Inspect process name to prevent terminating protected system services (e.g. svchost, w3wp)
  if (knownProcessName && isProtectedSystemProcess(pid, knownProcessName)) {
    throw new Error(
      `Cannot terminate protected system process "${knownProcessName}" (PID ${pid}). Termination aborted for system safety.`
    );
  }

  const liveProcessName = await getProcessNameByPid(pid);
  if (isProtectedSystemProcess(pid, liveProcessName)) {
    throw new Error(
      `Cannot terminate protected system process "${liveProcessName}" (PID ${pid}). Termination aborted for system safety.`
    );
  }

  const isWin = process.platform === "win32";

  if (isWin) {
    await new Promise<void>((resolve, reject) => {
      exec(`taskkill /F /PID ${pid}`, { windowsHide: true }, (err) => {
        if (!err) return resolve();
        // Fallback to PowerShell Stop-Process
        exec(
          `powershell -NoProfile -NonInteractive -Command "Stop-Process -Id ${pid} -Force"`,
          { windowsHide: true },
          (psErr) => {
            if (!psErr) return resolve();
            reject(new Error(`Failed to terminate PID ${pid}: ${err.message}`));
          }
        );
      });
    });
  } else {
    await new Promise<void>((resolve, reject) => {
      exec(`kill -9 ${pid}`, { windowsHide: true }, (err) => {
        if (err) reject(new Error(`Failed to terminate PID ${pid}: ${err.message}`));
        else resolve();
      });
    });
  }

  // Grace period for socket cleanup by OS network stack
  await new Promise((resolve) => setTimeout(resolve, 500));
  return true;
}
