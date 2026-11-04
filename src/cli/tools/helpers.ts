import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DEFAULT_PORT, DEFAULT_BASE_URL, DEFAULT_V1_URL } from "../../shared/constants/network.js";

export { DEFAULT_PORT, DEFAULT_BASE_URL, DEFAULT_V1_URL };

export function home(): string {
  return os.homedir();
}

export function v1(baseUrl: string): string {
  return baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
}

export function readJsonSafe(file: string): any {
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, "utf8");
    const stripped = raw.replace(/("(?:\\.|[^"\\])*")|,(\s*[}\]])/g, (_m, str, tail) => str ?? tail);
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}

export function ensureBackup(file: string): void {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const backup = `${file}.bak-mapigate`;
  if (fs.existsSync(file) && !fs.existsSync(backup)) {
    try {
      fs.copyFileSync(file, backup);
    } catch {
      // ignore
    }
  }
}

export function writeJsonSafe(file: string, data: any): void {
  ensureBackup(file);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

export function rewriteFileSafe(file: string, content: string): void {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(file, content, "utf8");
}

export function pruneTomlSection(tomlText: string, sectionHeader: string): string {
  const lines = tomlText.split(/\r?\n/);
  const result: string[] = [];
  let inSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      const header = trimmed.slice(1, -1).trim();
      if (header === sectionHeader) {
        inSection = true;
        continue;
      } else {
        inSection = false;
      }
    }
    if (!inSection) {
      result.push(line);
    }
  }

  return result.join("\n");
}
