import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const CLAUDE_MODELS = [
  { flag: "fable", envKey: "ANTHROPIC_DEFAULT_FABLE_MODEL" },
  { flag: "opus", envKey: "ANTHROPIC_DEFAULT_OPUS_MODEL" },
  { flag: "sonnet", envKey: "ANTHROPIC_DEFAULT_SONNET_MODEL" },
  { flag: "haiku", envKey: "ANTHROPIC_DEFAULT_HAIKU_MODEL" },
];

const CLAUDE_RESET_KEYS = ["ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_MODEL", ...CLAUDE_MODELS.map((m) => m.envKey)];

function home(): string {
  return os.homedir();
}

function v1(baseUrl: string): string {
  return baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
}

function readJsonSafe(file: string): any {
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, "utf8");
    const stripped = raw.replace(/("(?:\\.|[^"\\])*")|,(\s*[}\]])/g, (_m, str, tail) => str ?? tail);
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}

function writeJsonSafe(file: string, data: any): void {
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
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function rewriteFileSafe(file: string, content: string): void {
  fs.writeFileSync(file, content, "utf8");
}

export interface ToolInspectionResult {
  id: string;
  name: string;
  files: string[];
  configured: boolean;
  baseUrl?: string | null;
  apiKey?: string | null;
  models?: Record<string, string>;
  active?: boolean;
  error?: string;
}

export interface ToolApplyContext {
  baseUrl: string;
  apiKey: string;
  model?: string;
  claudeModels?: Record<string, string>;
}

export interface ToolConfigHandler {
  id: string;
  name: string;
  paths: () => string[];
  show: () => Promise<{ baseUrl?: string; apiKey?: string; models?: Record<string, string>; active?: boolean }>;
  apply: (ctx: ToolApplyContext) => Promise<string[]>;
  reset: () => Promise<string[]>;
}

// 1. Claude Code
const claudePath = () => path.join(home(), ".claude", "settings.json");
const claudeHandler: ToolConfigHandler = {
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
      ANTHROPIC_BASE_URL: baseUrl, // Claude handles root URL directly
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

// 2. OpenAI Codex CLI
const codexPath = () => path.join(home(), ".codex", "config.toml");
const codexHandler: ToolConfigHandler = {
  id: "codex",
  name: "OpenAI Codex CLI",
  paths: () => [codexPath()],
  async show() {
    const file = codexPath();
    if (!fs.existsSync(file)) return {};
    const text = fs.readFileSync(file, "utf8");
    const isMapigate = text.includes("mapigate") || text.includes("9router");
    const modelMatch = text.match(/^model\s*=\s*["']([^"']+)["']/m);
    const urlMatch = text.match(/base_url\s*=\s*["']([^"']+)["']/m);
    const authMatch = text.match(/Bearer\s+([^"'\s}]+)/m);
    return {
      baseUrl: urlMatch ? urlMatch[1] : undefined,
      apiKey: authMatch ? authMatch[1] : undefined,
      models: (modelMatch ? { main: modelMatch[1] } : {}) as Record<string, string>,
      active: isMapigate,
    };
  },
  async apply({ baseUrl, apiKey, model = "claude-sonnet-4-6" }) {
    const file = codexPath();
    const content = [
      `model_provider = "mapigate"`,
      `model = "${model}"`,
      ``,
      `[model_providers.mapigate]`,
      `name = "Mapigate"`,
      `base_url = "${v1(baseUrl)}"`,
      `wire_api = "responses"`,
      `http_headers = { Authorization = "Bearer ${apiKey}" }`,
    ].join("\n");
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    rewriteFileSafe(file, content);
    return [file];
  },
  async reset() {
    const file = codexPath();
    if (!fs.existsSync(file)) return [];
    rewriteFileSafe(file, "");
    return [file];
  },
};

// 3. OpenCode
const opencodePath = () => path.join(home(), ".config", "opencode", "opencode.json");
const opencodeHandler: ToolConfigHandler = {
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

// 4. Factory Droid
const droidPath = () => path.join(home(), ".factory", "settings.json");
const droidHandler: ToolConfigHandler = {
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

// 5. Cline
const clineState = () => path.join(home(), ".cline", "data", "globalState.json");
const clineSecrets = () => path.join(home(), ".cline", "data", "secrets.json");
const clineHandler: ToolConfigHandler = {
  id: "cline",
  name: "Cline CLI",
  paths: () => [clineState(), clineSecrets()],
  async show() {
    const state = readJsonSafe(clineState()) || {};
    const secrets = readJsonSafe(clineSecrets()) || {};
    return {
      baseUrl: state.openAiBaseUrl,
      apiKey: secrets.openAiApiKey,
      models: (state.openAiModelId ? { main: state.openAiModelId } : {}) as Record<string, string>,
      active: state.actModeApiProvider === "openai",
    };
  },
  async apply({ baseUrl, apiKey, model = "claude-sonnet-4-6" }) {
    const state = readJsonSafe(clineState()) || {};
    state.actModeApiProvider = "openai";
    state.planModeApiProvider = "openai";
    state.openAiBaseUrl = baseUrl;
    state.openAiModelId = model;
    state.planModeOpenAiModelId = model;
    writeJsonSafe(clineState(), state);

    const secrets = readJsonSafe(clineSecrets()) || {};
    secrets.openAiApiKey = apiKey;
    writeJsonSafe(clineSecrets(), secrets);
    return [clineState(), clineSecrets()];
  },
  async reset() {
    const state = readJsonSafe(clineState());
    if (state && state.actModeApiProvider === "openai") {
      delete state.openAiBaseUrl;
      delete state.openAiModelId;
      delete state.planModeOpenAiModelId;
      state.actModeApiProvider = "cline";
      rewriteFileSafe(clineState(), JSON.stringify(state, null, 2));
    }
    const secrets = readJsonSafe(clineSecrets());
    if (secrets && secrets.openAiApiKey) {
      delete secrets.openAiApiKey;
      rewriteFileSafe(clineSecrets(), JSON.stringify(secrets, null, 2));
    }
    return [clineState(), clineSecrets()];
  },
};

// 6. OpenClaw
const openclawPath = () => path.join(home(), ".openclaw", "config.json");
const openclawHandler: ToolConfigHandler = {
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
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch {
        // ignore
      }
    }
    return [file];
  },
};

export const ALL_TOOL_HANDLERS: ToolConfigHandler[] = [
  claudeHandler,
  codexHandler,
  opencodeHandler,
  droidHandler,
  clineHandler,
  openclawHandler,
];

export const SUPPORTED_TOOL_IDS = ALL_TOOL_HANDLERS.map((h) => h.id);

export function resolveToolHandlers(toolNames: string[]): ToolConfigHandler[] {
  if (!toolNames.length || toolNames.includes("all")) {
    return ALL_TOOL_HANDLERS;
  }

  const result: ToolConfigHandler[] = [];
  for (const name of toolNames) {
    const clean = name.trim().toLowerCase();
    const match = ALL_TOOL_HANDLERS.find(
      (h) => h.id === clean || h.id.replace(/-/g, "") === clean.replace(/-/g, "")
    );
    if (match && !result.includes(match)) {
      result.push(match);
    }
  }
  return result;
}
