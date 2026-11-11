import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { getDefaultDataDir, MAPIGATE_LOG_FILE, DEFAULT_PORT } from "../../shared/constants/index.js";
import { PidFileManager } from "../daemon/pidFile.js";
import { ApiClient } from "../client/apiClient.js";
import { parseLogLevel, LogLevel } from "../../shared/logger.js";

export interface LogsOptions {
  lines?: string | number;
  follow?: boolean;
  port?: string | number;
  level?: string;
}

function lineMatchesLevel(line: string, minLevel: LogLevel): boolean {
  if (minLevel === LogLevel.TRACE) return true;
  const upper = line.toUpperCase();
  const isErr = upper.includes("[ERROR]") || upper.includes("ERROR:") || line.includes("💥") || line.includes("❌");
  if (minLevel === LogLevel.ERROR) return isErr;
  const isWarn = upper.includes("[WARN]") || upper.includes("WARN:") || line.includes("⚠️");
  if (minLevel === LogLevel.WARN) return isErr || isWarn;
  const isInfo = upper.includes("[INFO]") || line.includes("ℹ️") || line.includes("DONE") || line.includes("📥") || line.includes("▶") || line.includes("⚙") || line.includes("📊");
  if (minLevel === LogLevel.INFO) return isErr || isWarn || isInfo || (!upper.includes("[DEBUG]") && !line.includes("🔬"));
  if (minLevel === LogLevel.DEBUG) return !line.includes("🔬") && !upper.includes("[TRACE]");
  return true;
}

export async function runLogs(options: LogsOptions = {}): Promise<void> {
  const lineCount = Number(options.lines) || 50;
  const minLevel = options.level ? parseLogLevel(options.level) : LogLevel.TRACE;
  const recordedPort = PidFileManager.readPort();
  const port = Number(options.port) || recordedPort || (process.env.PORT ? Number(process.env.PORT) : DEFAULT_PORT);
  const dataDir = getDefaultDataDir();
  const logFile = path.join(dataDir, MAPIGATE_LOG_FILE);

  ApiClient.configure({ port });

  if (fs.existsSync(logFile)) {
    try {
      const content = fs.readFileSync(logFile, "utf8");
      const lines = content
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0)
        .filter((l) => lineMatchesLevel(l, minLevel));
      const tail = lines.slice(-lineCount);
      tail.forEach((line) => console.log(line));

      if (options.follow) {
        console.log(chalk.gray("\n--- Following logs (Ctrl+C to stop) ---"));
        let currentSize = fs.statSync(logFile).size;
        setInterval(() => {
          try {
            const stats = fs.statSync(logFile);
            if (stats.size > currentSize) {
              const stream = fs.createReadStream(logFile, { start: currentSize, end: stats.size });
              stream.on("data", (chunk) => {
                const chunkStr = chunk.toString();
                const chunkLines = chunkStr.split(/\r?\n/).filter((l) => l.trim().length > 0 && lineMatchesLevel(l, minLevel));
                if (chunkLines.length > 0) {
                  process.stdout.write(chunkLines.join("\n") + "\n");
                }
              });
              currentSize = stats.size;
            }
          } catch {
            // ignore
          }
        }, 1000);
      }
      return;
    } catch {
      // Fall through to API
    }
  }

  // Fallback to API /api/console-logs
  const res = await ApiClient.getConsoleLogs();
  if (res.success && Array.isArray(res.data?.logs)) {
    const lines = res.data.logs
      .map((item: any) => (typeof item === "string" ? item : item.message || JSON.stringify(item)))
      .filter((l: string) => lineMatchesLevel(l, minLevel));
    const tail = lines.slice(-lineCount);
    tail.forEach((msg: string) => console.log(msg));
  } else {
    console.log(chalk.yellow(`No log records available at ${logFile}.`));
  }
}
