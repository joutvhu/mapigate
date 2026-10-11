import { execSync } from "node:child_process";
import net from "node:net";
import { DEFAULT_HOST } from "../../shared/constants/index.js";

export class PortHelper {
  /**
   * Parse Windows netstat -ano output to find PIDs listening on targetPort.
   */
  public static parseNetstatOutput(output: string, targetPort: number): number[] {
    const pids = new Set<number>();
    const lines = output.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 4 && parts[0].toUpperCase() === "TCP") {
        const isListening = parts.some((p) => p.toUpperCase() === "LISTENING");
        if (isListening) {
          const localAddr = parts[1];
          const portMatch = localAddr.match(/:(\d+)$/);
          if (portMatch && parseInt(portMatch[1], 10) === targetPort) {
            const pid = parseInt(parts[parts.length - 1], 10);
            if (!isNaN(pid) && pid > 0) {
              pids.add(pid);
            }
          }
        }
      }
    }

    return Array.from(pids);
  }

  /**
   * Parse lsof / fuser output on Unix-like systems.
   */
  public static parseLsofOutput(output: string): number[] {
    const pids = new Set<number>();
    const lines = output.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const pid = parseInt(trimmed, 10);
      if (!isNaN(pid) && pid > 0) {
        pids.add(pid);
      }
    }

    return Array.from(pids);
  }

  /**
   * Find all PIDs listening on the specified port.
   */
  public static getAllPidsOnPort(port: number): number[] {
    if (process.platform === "win32") {
      try {
        const output = execSync("netstat -ano -p tcp", {
          encoding: "utf8",
          windowsHide: true,
          timeout: 5000,
        });
        return this.parseNetstatOutput(output, port);
      } catch {
        try {
          const fallbackOutput = execSync("netstat -ano", {
            encoding: "utf8",
            windowsHide: true,
            timeout: 5000,
          });
          return this.parseNetstatOutput(fallbackOutput, port);
        } catch {
          return [];
        }
      }
    } else {
      try {
        const output = execSync(`lsof -ti:${port} -sTCP:LISTEN`, {
          encoding: "utf8",
          stdio: ["pipe", "pipe", "ignore"],
          timeout: 3000,
        }).trim();
        return this.parseLsofOutput(output);
      } catch {
        try {
          const fuserOutput = execSync(`fuser ${port}/tcp 2>/dev/null`, {
            encoding: "utf8",
            timeout: 3000,
          }).trim();
          const match = fuserOutput.match(/\b(\d+)\b/);
          if (match) {
            const pid = parseInt(match[1], 10);
            if (!isNaN(pid) && pid > 0) return [pid];
          }
        } catch {
          // ignore
        }
        return [];
      }
    }
  }

  /**
   * Get first PID listening on port, or null.
   */
  public static getPidOnPort(port: number): number | null {
    const pids = this.getAllPidsOnPort(port);
    return pids.length > 0 ? pids[0] : null;
  }

  /**
   * Terminate a process by PID across Windows and Unix platforms.
   */
  public static killProcess(pid: number): boolean {
    if (!pid || pid <= 0) return false;
    try {
      if (process.platform === "win32") {
        try {
          execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore", windowsHide: true, timeout: 3000 });
        } catch {
          try {
            execSync(`powershell -NonInteractive -NoProfile -Command "Stop-Process -Id ${pid} -Force"`, {
              stdio: "ignore",
              windowsHide: true,
              timeout: 3000,
            });
          } catch {
            process.kill(pid, "SIGKILL");
          }
        }
      } else {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          process.kill(pid, "SIGKILL");
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Kill any process(es) listening on the specified port. Returns killed PIDs.
   */
  public static cleanPort(port: number): number[] {
    const pids = this.getAllPidsOnPort(port);
    const killed: number[] = [];
    for (const pid of pids) {
      if (this.killProcess(pid)) {
        killed.push(pid);
      }
    }
    return killed;
  }

  /**
   * Check if a port is currently listening.
   */
  public static async isPortListening(port: number, host: string = DEFAULT_HOST): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.connect({ host, port }, () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("error", () => {
        socket.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Poll until a port is released or timeout expires.
   */
  public static async waitForPortRelease(
    port: number,
    timeoutMs: number = 3000,
    host: string = DEFAULT_HOST
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const listening = await this.isPortListening(port, host);
      if (!listening) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return !(await this.isPortListening(port, host));
  }
}
