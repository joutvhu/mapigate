import type { Server } from "node:http";
import { PidFileManager } from "../cli/daemon/pidFile.js";
import { tokenScheduler } from "../core/scheduler/tokenScheduler.js";
import { killTray } from "../cli/tray/tray.js";

import { DEFAULT_PORT, DEFAULT_HOST } from "../shared/constants/index.js";

export class ServerLifecycle {
  private server: Server | null = null;
  private shuttingDown = false;

  public setServer(server: Server | null): void {
    this.server = server;
  }

  public getServer(): Server | null {
    return this.server;
  }

  public getPort(): number {
    if (this.server) {
      const addr = this.server.address();
      if (addr && typeof addr === "object" && typeof addr.port === "number") {
        return addr.port;
      }
    }
    return Number(process.env.PORT) || DEFAULT_PORT;
  }

  public getHost(): string {
    if (this.server) {
      const addr = this.server.address();
      if (addr && typeof addr === "object" && typeof addr.address === "string" && addr.address !== "::") {
        return addr.address;
      }
    }
    return process.env.HOST || DEFAULT_HOST;
  }

  public isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  public reset(): void {
    this.server = null;
    this.shuttingDown = false;
  }

  public async shutdownServer(options: { delayMs?: number; exitProcess?: boolean } = {}): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    const delayMs = options.delayMs ?? 200;
    const exitProcess = options.exitProcess ?? true;

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    try {
      await killTray();
    } catch {
      // Best-effort
    }

    try {
      tokenScheduler.stop();
    } catch {
      // Best-effort
    }

    try {
      const { mitmManager } = await import("../mitm/manager.js");
      await mitmManager.stopServer();
    } catch {
      // Best-effort
    }

    try {
      PidFileManager.removePid();
    } catch {
      // Best-effort
    }

    if (this.server) {
      try {
        (this.server as any).closeAllConnections?.();
      } catch {
        // Best-effort
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => resolve(), 1000);
        try {
          this.server?.close(() => {
            clearTimeout(timer);
            resolve();
          });
        } catch {
          clearTimeout(timer);
          resolve();
        }
      });
      this.server = null;
    }

    if (exitProcess) {
      process.exit(0);
    }
  }

  public async restartServer(options: { delayMs?: number; exitProcess?: boolean } = {}): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    const delayMs = options.delayMs ?? 200;
    const exitProcess = options.exitProcess ?? true;

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    try {
      await killTray();
    } catch {
      // Best-effort
    }

    try {
      tokenScheduler.stop();
    } catch {
      // Best-effort
    }

    try {
      const { mitmManager } = await import("../mitm/manager.js");
      await mitmManager.stopServer();
    } catch {
      // Best-effort
    }

    try {
      PidFileManager.removePid();
    } catch {
      // Best-effort
    }

    if (this.server) {
      try {
        (this.server as any).closeAllConnections?.();
      } catch {
        // Best-effort
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => resolve(), 1000);
        try {
          this.server?.close(() => {
            clearTimeout(timer);
            resolve();
          });
        } catch {
          clearTimeout(timer);
          resolve();
        }
      });
      this.server = null;
    }

    // Brief grace period for socket port release
    await new Promise((resolve) => setTimeout(resolve, 150));

    try {
      const { ProcessManager } = await import("../cli/daemon/processManager.js");
      const { getDefaultDataDir, MAPIGATE_LOG_FILE, DEFAULT_PORT, DEFAULT_HOST } = await import("../shared/constants/index.js");
      const { spawn } = await import("node:child_process");
      const path = await import("node:path");
      const fs = await import("node:fs");

      const port = Number(process.env.PORT) || DEFAULT_PORT;
      const host = process.env.HOST || DEFAULT_HOST;
      const { cmd, args, shell } = ProcessManager.resolveSpawnCommand();

      const dataDir = getDefaultDataDir();
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const logPath = path.join(dataDir, MAPIGATE_LOG_FILE);
      const logFd = fs.openSync(logPath, "a");

      const child = spawn(cmd, args, {
        detached: true,
        stdio: ["ignore", logFd, logFd],
        windowsHide: true,
        shell,
        env: {
          ...process.env,
          PORT: String(port),
          HOST: host,
          MAPIGATE_DAEMON: "1",
          MAPIGATE_TRAY: "1",
        },
      });

      try {
        fs.closeSync(logFd);
      } catch {
        // ignore
      }

      if (child.pid) {
        child.unref();
        PidFileManager.writePid(child.pid);
      }
    } catch (err) {
      console.error("[Lifecycle] Failed to spawn new server instance on restart:", err);
    }

    if (exitProcess) {
      process.exit(0);
    }
  }
}

export const serverLifecycle = new ServerLifecycle();
