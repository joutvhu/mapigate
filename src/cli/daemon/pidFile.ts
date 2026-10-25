import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getDefaultDataDir, MAPIGATE_PID_FILE, isTestEnvironment } from "../../shared/constants/index.js";

export class PidFileManager {
  private static getPidFilePath(): string {
    // Automatic isolation guard: ensure tests use ./.mapigate-test in workspace, never ~/.mapigate or dev ./.mapigate
    if (!process.env.MAPIGATE_DATA_DIR && isTestEnvironment()) {
      const testDataDir = path.resolve(process.cwd(), ".mapigate-test");
      if (!fs.existsSync(testDataDir)) {
        fs.mkdirSync(testDataDir, { recursive: true });
      }
      process.env.MAPIGATE_DATA_DIR = testDataDir;
    }
    const dir = getDefaultDataDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, MAPIGATE_PID_FILE);
  }

  public static writePid(pid: number, port?: number): void {
    const data = port ? JSON.stringify({ pid, port }) : String(pid);
    fs.writeFileSync(this.getPidFilePath(), data, "utf8");
  }

  public static readPid(): number | null {
    const file = this.getPidFilePath();
    if (fs.existsSync(file)) {
      try {
        const content = fs.readFileSync(file, "utf8").trim();
        if (content.startsWith("{")) {
          const obj = JSON.parse(content);
          if (typeof obj.pid === "number") return obj.pid;
        }
        const pid = parseInt(content, 10);
        if (!isNaN(pid)) return pid;
      } catch {
        // Fall through
      }
    }

    return null;
  }

  public static readPort(): number | null {
    const file = this.getPidFilePath();
    if (fs.existsSync(file)) {
      try {
        const content = fs.readFileSync(file, "utf8").trim();
        if (content.startsWith("{")) {
          const obj = JSON.parse(content);
          if (typeof obj.port === "number") return obj.port;
        }
      } catch {
        // Fall through
      }
    }

    return null;
  }

  public static removePid(): void {
    const file = this.getPidFilePath();
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch {
        // Ignored
      }
    }
  }

  public static isProcessRunning(pid: number): boolean {
    try {
      // Sending signal 0 checks if process exists without killing it
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}
