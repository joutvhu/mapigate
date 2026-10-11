import path from "node:path";
import { home, readJsonSafe, writeJsonSafe, rewriteFileSafe } from "../helpers.js";
import type { ToolConfigHandler } from "../types.js";

export const CLAUDE_MODELS = [
  { flag: "fable", envKey: "ANTHROPIC_DEFAULT_FABLE_MODEL" },
  { flag: "opus", envKey: "ANTHROPIC_DEFAULT_OPUS_MODEL" },
  { flag: "sonnet", envKey: "ANTHROPIC_DEFAULT_SONNET_MODEL" },
  { flag: "haiku", envKey: "ANTHROPIC_DEFAULT_HAIKU_MODEL" },
];

export const CLAUDE_RESET_KEYS = [
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_MODEL",
  ...CLAUDE_MODELS.map((m) => m.envKey),
];

export const claudePath = () => path.join(home(), ".claude", "settings.json");

export const claudeHandler: ToolConfigHandler = {
  id: "claude",
  name: "Claude Code",
  paths: () => [claudePath()],
  async show() {
    const env = readJsonSafe(claudePath())?.env || {};
    const models: Record<string, string> = {};
    if (env.ANTHROPIC_MODEL) models.main = env.ANTHROPIC_MODEL;
    for (const m of CLAUDE_MODELS) {
      if (env[m.envKey]) models[m.flag] = env[m.envKey];
    }
    return {
      baseUrl: env.ANTHROPIC_BASE_URL,
      apiKey: env.ANTHROPIC_AUTH_TOKEN,
      models,
      active: Boolean(env.ANTHROPIC_BASE_URL),
    };
  },
  async apply({ baseUrl, apiKey, model, claudeModels = {} }) {
    const file = claudePath();
    const cur = readJsonSafe(file) || {};
    cur.hasCompletedOnboarding = true;
    cur.env = {
      ...(cur.env || {}),
      ANTHROPIC_BASE_URL: baseUrl,
      ANTHROPIC_AUTH_TOKEN: apiKey,
    };
    if (model) {
      cur.env.ANTHROPIC_MODEL = model;
    }
    for (const m of CLAUDE_MODELS) {
      if (claudeModels[m.envKey]) cur.env[m.envKey] = claudeModels[m.envKey];
      else if (claudeModels[m.flag]) cur.env[m.envKey] = claudeModels[m.flag];
    }
    writeJsonSafe(file, cur);
    return [file];
  },
  async reset() {
    const file = claudePath();
    const cur = readJsonSafe(file);
    if (!cur) return [];
    if (cur.env) {
      CLAUDE_RESET_KEYS.forEach((k) => delete cur.env[k]);
      if (Object.keys(cur.env).length === 0) delete cur.env;
    }
    rewriteFileSafe(file, JSON.stringify(cur, null, 2));
    return [file];
  },
};
