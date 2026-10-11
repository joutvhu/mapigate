import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { PidFileManager } from "./pidFile.js";
import { PortHelper } from "./portHelper.js";
import { DEFAULT_PORT, DEFAULT_HOST, APP_NAME, getDefaultDataDir, MAPIGATE_LOG_FILE } from "../../shared/constants/index.js";

import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ProcessManager {
  public static async isServerListening(port: number, host: string = DEFAULT_HOST): Promise<boolean> {
    return PortHelper.isPortListening(port, host);
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

  public static resolveSpawnCommand(): { cmd: string; args: string[]; shell: boolean } {
    // Resolve server entry script relative to built cli location
    const distServer = fs.existsSync(path.resolve(__dirname, "../../server/index.js"))
      ? path.resolve(__dirname, "../../server/index.js")
      : path.resolve(process.cwd(), "dist/server/index.js");

    let cmd = process.execPath;
    let args = [distServer];
    let shell = false;

    if (!fs.existsSync(distServer)) {
      // In dev mode, use tsx directly
      const devServer = path.resolve(process.cwd(), "src/server/index.ts");
      const localTsx = path.resolve(process.cwd(), "node_modules/tsx/dist/cli.mjs");
      if (fs.existsSync(localTsx)) {
        cmd = process.execPath;
        args = [localTsx, devServer];
      } else {
        cmd = process.platform === "win32" ? "npx.cmd" : "npx";
        args = ["tsx", devServer];
        if (process.platform === "win32") {
          shell = true;
        }
      }
    }

    return { cmd, args, shell };
  }

  public static async startDaemon(port: number = DEFAULT_PORT): Promise<{ success: boolean; pid?: number; message: string }> {
    const existingPid = PidFileManager.readPid();
    const isRunning = existingPid ? PidFileManager.isProcessRunning(existingPid) : false;
    const isListening = await this.isServerListening(port);

    if (existingPid && isRunning && isListening) {
      return {
        success: true,
        pid: existingPid,
        message: `${APP_NAME} daemon is already running (PID: ${existingPid}) on port ${port}.`,
      };
    }

    // If port is already in use by an orphan process (PID missing or stale PID or different process)
    if (isListening) {
      const orphanPids = PortHelper.getAllPidsOnPort(port);
      if (orphanPids.length > 0) {
        PortHelper.cleanPort(port);
        await PortHelper.waitForPortRelease(port, 3000);
      }
      if (existingPid) {
        PidFileManager.removePid();
      }

      // Check if port is still occupied
      if (await this.isServerListening(port)) {
        return {
          success: false,
          message: `Port ${port} is in use by an orphan process (${orphanPids.join(", ") || "unknown"}) and could not be released.`,
        };
      }
    } else if (existingPid && !isRunning) {
      // Clean up stale PID file when port is not listening
      PidFileManager.removePid();
    }

    const { cmd, args, shell } = this.resolveSpawnCommand();

    const dataDir = getDefaultDataDir();
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const logPath = path.join(dataDir, MAPIGATE_LOG_FILE);

    const child = spawn(cmd, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      shell,
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

  public static stopDaemon(port: number = DEFAULT_PORT): { success: boolean; message: string } {
    const pid = PidFileManager.readPid();
    const isRunning = pid ? PidFileManager.isProcessRunning(pid) : false;

    // Check if recorded PID is alive
    if (pid && isRunning) {
      try {
        PortHelper.killProcess(pid);
        PidFileManager.removePid();

        // Also ensure any leftover process on the port is cleaned up
        const remainingPids = PortHelper.getAllPidsOnPort(port).filter((p) => p !== pid);
        if (remainingPids.length > 0) {
          PortHelper.cleanPort(port);
        }

        return { success: true, message: `Successfully stopped ${APP_NAME} daemon (PID: ${pid}).` };
      } catch (e: any) {
        return { success: false, message: `Failed to stop PID ${pid}: ${e.message}` };
      }
    }

    // If PID file was pointing to a non-existent / stale process
    if (pid && !isRunning) {
      PidFileManager.removePid();
      const orphanPids = PortHelper.cleanPort(port);
      if (orphanPids.length > 0) {
        return {
          success: true,
          message: `Cleaned up stale PID ${pid} and stopped orphan process (PID: ${orphanPids.join(", ")}) on port ${port}.`,
        };
      }
      return { success: true, message: `Cleaned up stale PID ${pid}. ${APP_NAME} was already stopped.` };
    }

    // PID file is missing (pid === null)
    const orphanPids = PortHelper.cleanPort(port);
    if (orphanPids.length > 0) {
      return {
        success: true,
        message: `Stopped orphan process (PID: ${orphanPids.join(", ")}) listening on port ${port}.`,
      };
    }

    return { success: false, message: `No active PID file found. ${APP_NAME} is not running.` };
  }
}
