import path from "node:path";
import { home, v1, readJsonSafe, writeJsonSafe, rewriteFileSafe } from "../helpers.js";
import type { ToolConfigHandler } from "../types.js";

export const opencodePath = () => path.join(home(), ".config", "opencode", "opencode.json");

export const opencodeHandler: ToolConfigHandler = {
  id: "opencode",
  name: "OpenCode",
  paths: () => [opencodePath()],
  async show() {
    const cfg = readJsonSafe(opencodePath()) || {};
    const p = cfg.provider?.["mapigate"] || cfg.provider?.["9router"];
    const models: Record<string, string> = {};
    if (cfg.model) models.main = cfg.model;
    return {
      baseUrl: p?.options?.baseURL,
      apiKey: p?.options?.apiKey,
      models,
      active: Boolean(cfg.model?.includes("mapigate") || cfg.model?.includes("9router")),
    };
  },
  async apply({ baseUrl, apiKey, model = "claude-sonnet-4-6" }) {
    const file = opencodePath();
    const cfg = readJsonSafe(file) || {};
    cfg.provider = cfg.provider || {};
    cfg.provider["mapigate"] = {
      npm: "@ai-sdk/openai-compatible",
      options: { baseURL: v1(baseUrl), apiKey },
      models: {
        [model]: { name: model, modalities: { input: ["text", "image"], output: ["text"] } },
      },
    };
    cfg.model = `mapigate/${model}`;
    writeJsonSafe(file, cfg);
    return [file];
  },
  async reset() {
    const file = opencodePath();
    const cfg = readJsonSafe(file);
    if (!cfg) return [];
    if (cfg.provider) {
      delete cfg.provider["mapigate"];
      delete cfg.provider["9router"];
    }
    if (cfg.model?.includes("mapigate") || cfg.model?.includes("9router")) {
      delete cfg.model;
    }
    rewriteFileSafe(file, JSON.stringify(cfg, null, 2));
    return [file];
  },
};
