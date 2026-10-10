import { spawn, execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import net from "node:net";
import { PidFileManager } from "./pidFile.js";
import { DEFAULT_PORT, DEFAULT_HOST, APP_NAME, getDefaultDataDir, ROUTEN_LOG_FILE } from "../../shared/constants/index.js";

import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ProcessManager {
  public static async isServerListening(port: number, host: string = DEFAULT_HOST): Promise<boolean> {
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

  public static async waitForReady(port: number, timeoutMs: number = 8000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.isServerListening(port)) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  }

  public static async startDaemon(port: number = DEFAULT_PORT): Promise<{ success: boolean; pid?: number; message: string }> {
    const existingPid = PidFileManager.readPid();
    if (existingPid && PidFileManager.isProcessRunning(existingPid)) {
      if (await this.isServerListening(port)) {
        return {
          success: true,
          pid: existingPid,
          message: `${APP_NAME} daemon is already running (PID: ${existingPid}) on port ${port}.`,
        };
      }
    }

    // Resolve server entry script relative to built cli location
    const distServer = fs.existsSync(path.resolve(__dirname, "../../server/index.js"))
      ? path.resolve(__dirname, "../../server/index.js")
      : path.resolve(process.cwd(), "dist/server/index.js");
    let cmd = process.execPath;
    let args = [distServer];

    if (!fs.existsSync(distServer)) {
      // In dev mode, use tsx directly
      const devServer = path.resolve(process.cwd(), "src/server/index.ts");
      cmd = process.platform === "win32" ? "npx.cmd" : "npx";
      args = ["tsx", devServer];
    }

    const logPath = path.join(getDefaultDataDir(), ROUTEN_LOG_FILE);
    const child = spawn(process.execPath, [distServer], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: { ...process.env, PORT: String(port) },
    });

    if (!child.pid) {
      return { success: false, message: "Failed to spawn child process." };
    }

    child.unref();
    PidFileManager.writePid(child.pid);

    const isReady = await this.waitForReady(port);
    if (isReady) {
      return {
        success: true,
        pid: child.pid,
        message: `${APP_NAME} started successfully in background (PID: ${child.pid}) on http://${DEFAULT_HOST}:${port}`,
      };
    } else {
      return {
        success: false,
        message: `Daemon spawned (PID: ${child.pid}) but did not respond on port ${port} within timeout. Check ${logPath}.`,
      };
    }
  }

  public static stopDaemon(): { success: boolean; message: string } {
    const pid = PidFileManager.readPid();
    if (!pid) {
      return { success: false, message: "No active PID file found. Routen is not running." };
    }

    if (!PidFileManager.isProcessRunning(pid)) {
      PidFileManager.removePid();
      return { success: true, message: `Cleaned up stale PID ${pid}. Routen was already stopped.` };
    }

    try {
      if (process.platform === "win32") {
        execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
      } else {
        process.kill(pid, "SIGTERM");
      }
      PidFileManager.removePid();
      return { success: true, message: `Successfully stopped ${APP_NAME} daemon (PID: ${pid}).` };
    } catch (e: any) {
      return { success: false, message: `Failed to stop PID ${pid}: ${e.message}` };
    }
  }
}
