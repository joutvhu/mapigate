import os from "node:os";
import path from "node:path";

export const APP_NAME = "Mapigate";
export const APP_VERSION = "0.1.0";

export const DEFAULT_PORT = 20127;
export const DEFAULT_HOST = "127.0.0.1";

export function getDefaultDataDir(): string {
  if (process.env.MAPIGATE_DATA_DIR) {
    return process.env.MAPIGATE_DATA_DIR;
  }
  return path.join(os.homedir(), ".mapigate");
}

export const MAPIGATE_PID_FILE = "mapigate.pid";
export const MAPIGATE_DB_FILE = "mapigate.sqlite";
export const MAPIGATE_LOG_FILE = "server.log";

export const CONSOLE_LOG_CONFIG = {
  maxLines: 300,
  flushIntervalMs: 100,
  maxBatchLines: 50,
  keepaliveIntervalMs: 25000,
} as const;

export * from "./providerRegistry.js";
export * from "./cliTools.js";
