import path from "node:path";
import os from "node:os";
import fs from "node:fs";

export const APP_NAME = "routen";

export function defaultDir(): string {
  if (process.env.ROUTEN_DATA_DIR) {
    return process.env.ROUTEN_DATA_DIR;
  }
  return path.join(os.homedir(), `.${APP_NAME}`);
}

export function getDataDir(): string {
  const dir = defaultDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
  return dir;
}

export const DATA_DIR = getDataDir();
export const MITM_DIR = path.join(DATA_DIR, "mitm");

export function getMitmDir(): string {
  try {
    fs.mkdirSync(MITM_DIR, { recursive: true });
  } catch {
    // ignore
  }
  return MITM_DIR;
}
