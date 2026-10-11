import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDefaultDataDir, MAPIGATE_PID_FILE } from "../../shared/constants/index.js";

export class PidFileManager {
  private static getPidFilePath(): string {
    const dir = getDefaultDataDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, MAPIGATE_PID_FILE);
  }

  public static writePid(pid: number): void {
    fs.writeFileSync(this.getPidFilePath(), String(pid), "utf8");
  }

  public static readPid(): number | null {
    const file = this.getPidFilePath();
    if (fs.existsSync(file)) {
      try {
        const content = fs.readFileSync(file, "utf8").trim();
        const pid = parseInt(content, 10);
        if (!isNaN(pid)) return pid;
      } catch {
        // Fall through
      }
    }

    // Check legacy routen.pid in data dir or ~/.routen
    const dir = getDefaultDataDir();
    const legacyPaths = [
      path.join(dir, "routen.pid"),
      path.join(os.homedir(), ".routen", "routen.pid"),
    ];
    for (const legacy of legacyPaths) {
      if (fs.existsSync(legacy)) {
        try {
          const content = fs.readFileSync(legacy, "utf8").trim();
          const pid = parseInt(content, 10);
          if (!isNaN(pid)) return pid;
        } catch {
          // Continue
        }
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

    // Also clean up any legacy routen.pid
    const dir = getDefaultDataDir();
    const legacyPaths = [
      path.join(dir, "routen.pid"),
      path.join(os.homedir(), ".routen", "routen.pid"),
    ];
    for (const legacy of legacyPaths) {
      if (fs.existsSync(legacy)) {
        try {
          fs.unlinkSync(legacy);
        } catch {
          // Ignored
        }
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
