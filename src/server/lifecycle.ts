import type { Server } from "node:http";
import { PidFileManager } from "../cli/daemon/pidFile.js";
import { tokenScheduler } from "../core/scheduler/tokenScheduler.js";
import { killTray } from "../cli/tray/tray.js";

export class ServerLifecycle {
  private server: Server | null = null;
  private shuttingDown = false;

  public setServer(server: Server | null): void {
    this.server = server;
  }

  public getServer(): Server | null {
    return this.server;
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
      PidFileManager.removePid();
    } catch {
      // Best-effort
    }

    if (this.server) {
      await new Promise<void>((resolve) => {
        try {
          this.server?.close(() => resolve());
        } catch {
          resolve();
        }
      });
      this.server = null;
    }

    if (exitProcess) {
      process.exit(0);
    }
  }
}

export const serverLifecycle = new ServerLifecycle();
