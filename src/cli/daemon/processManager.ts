import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { PidFileManager } from "./pidFile.js";
import { PortHelper } from "./portHelper.js";
import { DEFAULT_PORT, DEFAULT_HOST, APP_NAME, getDefaultDataDir, MAPIGATE_LOG_FILE, isTestEnvironment } from "../../shared/constants/index.js";
import { removeAllDNSEntriesSync } from "../../mitm/dns/dnsConfig.js";
import { closeDatabase } from "../../storage/database.js";

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
    const logFd = fs.openSync(logPath, "a");

    const child = spawn(cmd, args, {
      detached: true,
      stdio: ["ignore", logFd, logFd],
      windowsHide: true,
      shell,
      env: {
        ...process.env,
        PORT: String(port),
        MAPIGATE_DAEMON: "1",
        MAPIGATE_TRAY: "1",
      },
    });

    try {
      fs.closeSync(logFd);
    } catch {
      // ignore
    }

    if (!child.pid) {
      return { success: false, message: "Failed to spawn child process." };
    }

    child.unref();
    PidFileManager.writePid(child.pid, port);

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

  public static async stopDaemon(port: number = DEFAULT_PORT): Promise<{ success: boolean; message: string }> {
    const isTest =
      isTestEnvironment() ||
      process.env.NODE_ENV === "test" ||
      Boolean(process.env.NODE_TEST_CONTEXT) ||
      Boolean(process.env.MAPIGATE_DATA_DIR?.includes("mpg-daemon-test-")) ||
      Boolean(process.env.MAPIGATE_DATA_DIR?.includes("mapigate-test"));

    const ensureDnsCleanup = () => {
      // In test mode, never modify the live system hosts file or trigger elevation
      if (isTest) return;
      try {
        removeAllDNSEntriesSync();
      } catch {
        // Best-effort
      }
      try {
        closeDatabase();
      } catch {
        // Best-effort
      }
    };

    const pid = PidFileManager.readPid();
    const pidPort = PidFileManager.readPort();
    const isRunning = pid ? PidFileManager.isProcessRunning(pid) : false;
    const isListening = await this.isServerListening(port);

    // Verify whether pid actually belongs to the requested port
    const isPidOnTargetPort = pid
      ? (pidPort !== null
          ? (pidPort === port || PortHelper.getAllPidsOnPort(port).includes(pid))
          : (port === DEFAULT_PORT || !isListening))
      : false;

    // 1. Attempt graceful HTTP shutdown if server is listening on port
    if (!isTest && isListening) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1200);
        const host = DEFAULT_HOST === "0.0.0.0" ? "127.0.0.1" : DEFAULT_HOST;
        await fetch(`http://${host}:${port}/api/server/shutdown`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
        }).catch(() => {
          return fetch(`http://${host}:${port}/api/shutdown`, {
            method: "POST",
            signal: controller.signal,
          });
        });
        clearTimeout(timeout);

        const released = await PortHelper.waitForPortRelease(port, 2000);
        if (released) {
          if (isPidOnTargetPort) {
            PidFileManager.removePid();
          }
          ensureDnsCleanup();
          return {
            success: true,
            message: `Successfully stopped ${APP_NAME} daemon (PID: ${pid || "graceful"}).`,
          };
        }
      } catch {
        // Graceful shutdown failed; fallback to direct process termination
      }
    }

    // 2. Direct process termination fallback - ONLY if pid belongs to the targeted port
    if (pid && isRunning && isPidOnTargetPort) {
      try {
        PortHelper.killProcess(pid);
        PidFileManager.removePid();

        // Also ensure any leftover process on the port is cleaned up
        const remainingPids = PortHelper.getAllPidsOnPort(port).filter((p) => p !== pid);
        if (remainingPids.length > 0) {
          PortHelper.cleanPort(port);
        }

        ensureDnsCleanup();
        return { success: true, message: `Successfully stopped ${APP_NAME} daemon (PID: ${pid}).` };
      } catch (e: any) {
        ensureDnsCleanup();
        return { success: false, message: `Failed to stop PID ${pid}: ${e.message}` };
      }
    }

    // If PID file was pointing to a non-existent / stale process on this port
    if (pid && !isRunning && isPidOnTargetPort) {
      PidFileManager.removePid();
      const orphanPids = PortHelper.cleanPort(port);
      ensureDnsCleanup();
      if (orphanPids.length > 0) {
        return {
          success: true,
          message: `Cleaned up stale PID ${pid} and stopped orphan process (PID: ${orphanPids.join(", ")}) on port ${port}.`,
        };
      }
      return { success: true, message: `Cleaned up stale PID ${pid}. ${APP_NAME} was already stopped.` };
    }

    // If pid belongs to a different port, do NOT kill it or remove its PID file!
    // Clean any orphan processes specifically listening on the requested port
    const orphanPids = PortHelper.cleanPort(port);
    if (orphanPids.length > 0) {
      ensureDnsCleanup();
      return {
        success: true,
        message: `Stopped orphan process (PID: ${orphanPids.join(", ")}) listening on port ${port}.`,
      };
    }

    ensureDnsCleanup();
    return { success: false, message: `No active PID file found. ${APP_NAME} is not running.` };
  }
}
