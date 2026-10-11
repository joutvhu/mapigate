import path from "node:path";
import os from "node:os";

export const APP_NAME = "Routen";
export const APP_VERSION = "0.1.0";

export const DEFAULT_PORT = 20127;
export const DEFAULT_HOST = "127.0.0.1";

export function getDefaultDataDir(): string {
  if (process.env.ROUTEN_DATA_DIR) {
    return process.env.ROUTEN_DATA_DIR;
  }
  return path.join(os.homedir(), ".routen");
}

export const ROUTEN_PID_FILE = "routen.pid";
export const ROUTEN_DB_FILE = "routen.sqlite";
export const ROUTEN_LOG_FILE = "server.log";

export const CONSOLE_LOG_CONFIG = {
  maxLines: 300,
  flushIntervalMs: 100,
  maxBatchLines: 50,
  keepaliveIntervalMs: 25000,
} as const;

export * from "./providerRegistry.js";
export * from "./cliTools.js";
