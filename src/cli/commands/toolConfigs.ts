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

function ensureBackup(file: string): void {
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

function writeJsonSafe(file: string, data: any): void {
  ensureBackup(file);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function rewriteFileSafe(file: string, content: string): void {
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
    ensureBackup(file);

    let baseText = "";
    if (fs.existsSync(file)) {
      try {
        baseText = fs.readFileSync(file, "utf8");
      } catch {
        baseText = "";
      }
    }

    // Selectively prune old Mapigate / 9router sections and root keys
    let cleaned = pruneTomlSection(baseText, "model_providers.mapigate");
    cleaned = pruneTomlSection(cleaned, "model_providers.9router");
    cleaned = cleaned.replace(/^[ \t]*model_provider\s*=\s*["'][^"']*["'][ \t]*\r?\n?/gm, "");
    cleaned = cleaned.replace(/^[ \t]*model\s*=\s*["'][^"']*["'][ \t]*\r?\n?/gm, "");
    cleaned = cleaned.trim();

    const mapigateSection = [
      `[model_providers.mapigate]`,
      `name = "Mapigate"`,
      `base_url = "${v1(baseUrl)}"`,
      `wire_api = "responses"`,
      `http_headers = { Authorization = "Bearer ${apiKey}" }`,
    ].join("\n");

    const newContent = [
      `model_provider = "mapigate"`,
      `model = "${model}"`,
      cleaned ? `\n${cleaned}\n` : "",
      mapigateSection,
      "",
    ].filter(Boolean).join("\n");

    rewriteFileSafe(file, newContent);
    return [file];
  },
  async reset() {
    const file = codexPath();
    if (!fs.existsSync(file)) return [];
    const backup = `${file}.bak-mapigate`;
    let text = "";
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      return [];
    }

    // Selectively prune Mapigate and 9router sections and settings
    text = pruneTomlSection(text, "model_providers.mapigate");
    text = pruneTomlSection(text, "model_providers.9router");
    text = text.replace(/^[ \t]*model_provider\s*=\s*["'](?:mapigate|9router)["'][ \t]*\r?\n?/gm, "");
    text = text.replace(/^[ \t]*default_subagent_model\s*=\s*["'][^"']*["'][ \t]*\r?\n?/gm, "");
    text = pruneTomlSection(text, "agents.subagent");

    text = text.replace(/(\r?\n){3,}/g, "\n\n").trim();

    if (text.length > 0) {
      rewriteFileSafe(file, text + "\n");
    } else if (fs.existsSync(backup)) {
      try {
        fs.copyFileSync(backup, file);
      } catch {
        rewriteFileSafe(file, "");
      }
    } else {
      rewriteFileSafe(file, "");
    }
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

export const ALL_TOOL_HANDLERS: ToolConfigHandler[] = [
  claudeHandler,
  codexHandler,
  opencodeHandler,
  droidHandler,
  clineHandler,
  openclawHandler,
];

export const SUPPORTED_TOOL_IDS = ALL_TOOL_HANDLERS.map((h) => h.id);

export const TOOL_ALIASES: Record<string, string> = {
  "claude-code": "claude",
  "claudecode": "claude",
  "codex-cli": "codex",
  "open-code": "opencode",
  "factory": "droid",
  "factory-droid": "droid",
  "cline-cli": "cline",
  "open-claw": "openclaw",
};

export interface ResolveToolResult {
  handlers: ToolConfigHandler[];
  unrecognized: string[];
}

export function resolveToolHandlersWithValidation(toolNames: string[]): ResolveToolResult {
  if (!toolNames.length || toolNames.map((t) => t.trim().toLowerCase()).includes("all")) {
    return { handlers: ALL_TOOL_HANDLERS, unrecognized: [] };
  }

  const handlers: ToolConfigHandler[] = [];
  const unrecognized: string[] = [];

  for (const raw of toolNames) {
    const clean = raw.trim().toLowerCase();
    if (!clean) continue;
    const resolved = TOOL_ALIASES[clean] || clean;
    const match = ALL_TOOL_HANDLERS.find(
      (h) => h.id === resolved || h.id.replace(/-/g, "") === resolved.replace(/-/g, "")
    );
    if (match) {
      if (!handlers.includes(match)) {
        handlers.push(match);
      }
    } else {
      unrecognized.push(raw.trim());
    }
  }

  return { handlers, unrecognized };
}

export function resolveToolHandlers(toolNames: string[]): ToolConfigHandler[] {
  return resolveToolHandlersWithValidation(toolNames).handlers;
}
