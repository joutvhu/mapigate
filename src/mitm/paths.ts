import path from "node:path";
import fs from "node:fs";
import { getDefaultDataDir } from "../shared/constants/index.js";

export const APP_NAME = "mapigate";

export function defaultDir(): string {
  return getDefaultDataDir();
}

export function getDataDir(): string {
  const dir = getDefaultDataDir();
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
