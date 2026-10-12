import path from "node:path";
import { home, v1, readJsonSafe, writeJsonSafe, rewriteFileSafe } from "../../helpers.js";
import type { ToolConfigHandler } from "../../types.js";

export const droidPath = () => path.join(home(), ".factory", "settings.json");

export const droidHandler: ToolConfigHandler = {
  id: "droid",
  name: "Factory Droid",
  paths: () => [droidPath()],
  async show() {
    const cfg = readJsonSafe(droidPath()) || {};
    const ours = (cfg.customModels || []).filter((m: any) => m.id?.includes("Mapigate") || m.id?.includes("9Router"));
    return {
      baseUrl: ours[0]?.baseUrl,
      apiKey: ours[0]?.apiKey,
      models: (ours.length && ours[0].model ? { main: ours[0].model } : {}) as Record<string, string>,
      active: ours.length > 0,
    };
  },
  async apply({ baseUrl, apiKey, model = "claude-sonnet-4-6" }) {
    const file = droidPath();
    const cfg = readJsonSafe(file) || {};
    const others = (cfg.customModels || []).filter(
      (m: any) => !m.id?.includes("Mapigate") && !m.id?.includes("9Router")
    );
    cfg.customModels = [
      {
        model,
        id: "custom:Mapigate-0",
        index: 0,
        baseUrl: v1(baseUrl),
        apiKey,
        displayName: model,
        maxOutputTokens: 131072,
        noImageSupport: false,
        provider: "openai",
      },
      ...others,
    ];
    cfg.customModels.forEach((m: any, i: number) => {
      m.index = i;
    });
    writeJsonSafe(file, cfg);
    return [file];
  },
  async reset() {
    const file = droidPath();
    const cfg = readJsonSafe(file);
    if (!cfg) return [];
    if (cfg.customModels) {
      cfg.customModels = cfg.customModels.filter(
        (m: any) => !m.id?.includes("Mapigate") && !m.id?.includes("9Router")
      );
    }
    rewriteFileSafe(file, JSON.stringify(cfg, null, 2));
    return [file];
  },
};

export default droidHandler;
