import fs from "node:fs";
import path from "node:path";
import { home, v1, readJsonSafe, writeJsonSafe, rewriteFileSafe } from "../helpers.js";
import type { ToolConfigHandler } from "../types.js";

export const openclawPath = () => path.join(home(), ".openclaw", "config.json");

export const openclawHandler: ToolConfigHandler = {
  id: "openclaw",
  name: "Open Claw",
  paths: () => [openclawPath()],
  async show() {
    const cfg = readJsonSafe(openclawPath()) || {};
    return {
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      active: Boolean(cfg.baseUrl?.includes("20127") || cfg.baseUrl?.includes("mapigate")),
    };
  },
  async apply({ baseUrl, apiKey }) {
    const file = openclawPath();
    const cfg = readJsonSafe(file) || {};
    cfg.baseUrl = v1(baseUrl);
    cfg.apiKey = apiKey;
    writeJsonSafe(file, cfg);
    return [file];
  },
  async reset() {
    const file = openclawPath();
    if (!fs.existsSync(file)) return [];
    const backup = `${file}.bak-mapigate`;
    const cfg = readJsonSafe(file);
    if (!cfg) {
      if (fs.existsSync(backup)) {
        try {
          fs.copyFileSync(backup, file);
        } catch {
          // ignore
        }
      }
      return [file];
    }
    delete cfg.baseUrl;
    delete cfg.apiKey;
    if (Object.keys(cfg).length > 0) {
      rewriteFileSafe(file, JSON.stringify(cfg, null, 2) + "\n");
    } else if (fs.existsSync(backup)) {
      try {
        fs.copyFileSync(backup, file);
      } catch {
        rewriteFileSafe(file, "{}\n");
      }
    } else {
      rewriteFileSafe(file, "{}\n");
    }
    return [file];
  },
};
