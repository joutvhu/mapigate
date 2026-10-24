import { PROVIDER_REGISTRY } from "../../../shared/constants/providerRegistry";

export interface ProviderItem {
  id: string;
  name: string;
  image: string;
  color?: string;
  iconBg?: string;
  category: "oauth" | "freeTier" | "apikey" | "custom" | string;
  defaultConnected?: number;
  baseUrl?: string;
  defaultBaseUrl?: string;
  format?: "openai" | "anthropic" | string;
  defaultHeaders?: Record<string, string>;
  models?: string[];
  thinkingMode?: string;
  authType?: string;
  requiresApiKey?: boolean;
  isLocal?: boolean;
  noAuth?: boolean;
}

const MEDIA_ONLY_PROVIDERS = new Set([
  "assemblyai", "aws-polly", "black-forest-labs", "brave-search", "cartesia",
  "comfyui", "coqui", "deepgram", "edge-tts", "elevenlabs", "exa", "fal-ai",
  "firecrawl", "fish-audio", "google-pse", "google-tts", "inworld", "jina-ai",
  "jina-reader", "linkup", "local-device", "nanobanana", "playht", "recraft",
  "runwayml", "sdwebui", "searchapi", "searxng", "selfhosted-embedding",
  "selfhosted-stt", "selfhosted-tts", "serper", "stability-ai", "tavily", "topaz",
  "tortoise"
]);

const registryList = Object.values(PROVIDER_REGISTRY).filter(
  (p) => !MEDIA_ONLY_PROVIDERS.has(p.id)
);

export function isOAuthProvider(p?: {
  id?: string;
  category?: string;
  authType?: string;
  authModes?: string[];
  oauth?: any;
}): boolean {
  if (!p) return false;
  const pId = p.id?.toLowerCase() || "";
  if (
    pId === "antigravity" ||
    pId === "github" ||
    pId === "cursor" ||
    pId === "kiro" ||
    pId === "amazon-q" ||
    pId === "codex" ||
    pId === "grok-cli" ||
    pId === "supergrok" ||
    pId === "minimax-code" ||
    pId === "codebuddy"
  ) {
    return true;
  }
  if (p.oauth != null) return true;
  if (p.category === "oauth" || p.category === "webCookie") return true;
  if (p.authType === "oauth") return true;
  if (Array.isArray(p.authModes) && p.authModes.includes("oauth")) return true;
  return false;
}

export function isNoApiKeyProvider(p?: {
  id?: string;
  requiresApiKey?: boolean;
  authType?: string;
  noAuth?: boolean;
  isLocal?: boolean;
}): boolean {
  if (!p) return false;
  const pId = p.id?.toLowerCase() || "";
  if (
    pId === "opencode" ||
    pId === "oc" ||
    pId === "ollama-local" ||
    pId === "lm-studio" ||
    pId === "jan" ||
    pId === "local-device"
  ) {
    return true;
  }
  if (p.requiresApiKey === false) return true;
  if (p.authType === "none") return true;
  if (p.noAuth === true) return true;
  return false;
}

export function isFreeTierProvider(p?: {
  id?: string;
  category?: string;
  requiresApiKey?: boolean;
  authType?: string;
  noAuth?: boolean;
  isLocal?: boolean;
}): boolean {
  if (!p) return false;
  return (
    p.category === "freeTier" ||
    p.category === "free" ||
    isNoApiKeyProvider(p)
  );
}

export const CODING_PROVIDERS_LIST = registryList;

// Priority 1: Free Tier & Community Gateways
export const FREE_TIER_PROVIDERS_LIST: ProviderItem[] = registryList
  .filter((p) => isFreeTierProvider(p))
  .map((p) => ({
    id: p.id,
    name: p.name,
    image: p.image || `/assets/providers/${p.id}/icon.png`,
    color: p.color || "#10B981",
    iconBg: p.iconBg,
    category: "freeTier" as const,
    defaultConnected: 0,
    baseUrl: p.baseUrl,
    defaultBaseUrl: p.defaultBaseUrl || p.baseUrl,
    format: p.format,
    defaultHeaders: p.defaultHeaders,
    models: p.models.map((m) => m.id),
    thinkingMode: p.thinkingMode,
    authType: p.authType,
    requiresApiKey: p.requiresApiKey,
    isLocal: p.isLocal,
    noAuth: p.noAuth,
  }));

// Priority 2: OAuth & Managed IDE Providers (excluding those already in Free Tier)
export const OAUTH_PROVIDERS_LIST: ProviderItem[] = registryList
  .filter((p) => !isFreeTierProvider(p) && isOAuthProvider(p))
  .map((p) => ({
    id: p.id,
    name: p.name,
    image: p.image || `/assets/providers/${p.id}/icon.png`,
    color: p.color || "#4285F4",
    iconBg: p.iconBg,
    category: "oauth" as const,
    defaultConnected: 0,
    baseUrl: p.baseUrl,
    defaultBaseUrl: p.defaultBaseUrl || p.baseUrl,
    format: p.format,
    defaultHeaders: p.defaultHeaders,
    models: p.models.map((m) => m.id),
    thinkingMode: p.thinkingMode,
    authType: p.authType,
    requiresApiKey: p.requiresApiKey,
    isLocal: p.isLocal,
    noAuth: p.noAuth,
  }));

// Priority 3: Direct API Key Providers (excluding Free Tier and OAuth)
export const API_KEY_PROVIDERS_LIST: ProviderItem[] = registryList
  .filter((p) => !isFreeTierProvider(p) && !isOAuthProvider(p))
  .map((p) => ({
    id: p.id,
    name: p.name,
    image: p.image || `/assets/providers/${p.id}/icon.png`,
    color: p.color || "#6366F1",
    iconBg: p.iconBg,
    category: "apikey" as const,
    defaultConnected: 0,
    baseUrl: p.baseUrl,
    defaultBaseUrl: p.defaultBaseUrl || p.baseUrl,
    format: p.format,
    defaultHeaders: p.defaultHeaders,
    models: p.models.map((m) => m.id),
    thinkingMode: p.thinkingMode,
    authType: p.authType,
    requiresApiKey: p.requiresApiKey,
    isLocal: p.isLocal,
    noAuth: p.noAuth,
  }));

export interface CliToolItem {
  id: string;
  name: string;
  image: string;
  iconBg?: string;
  status: "Connected" | "Guide" | "Not configured" | "Not installed";
  badgeColor?: string;
  desc?: string;
}

export const CLI_TOOLS_LIST: CliToolItem[] = [
  { id: "claude", name: "Claude Code", image: "/assets/providers/claude/icon.png", status: "Not configured" },
  { id: "openclaw", name: "Open Claw", image: "/assets/tools/openclaw/icon.png", status: "Not installed" },
  { id: "codex", name: "OpenAI Codex CLI / App", image: "/assets/providers/codex/icon.png", status: "Not configured" },
  { id: "copilot", name: "GitHub Copilot", image: "/assets/providers/github/icon.png", iconBg: "#FFFFFF", status: "Guide" },
  { id: "opencode", name: "OpenCode", image: "/assets/providers/opencode/icon.png", status: "Not configured" },
  { id: "cowork", name: "Claude Cowork", image: "/assets/providers/claude/icon.png", status: "Not configured" },
  { id: "hermes", name: "Hermes Agent", image: "/assets/tools/hermes/icon.png", status: "Not installed" },
  { id: "droid", name: "Factory Droid", image: "/assets/tools/droid/icon.png", status: "Not installed" },
  { id: "cursor", name: "Cursor", image: "/assets/providers/cursor/icon.png", iconBg: "#FFFFFF", status: "Guide" },
  { id: "cline", name: "Cline", image: "/assets/providers/cline/icon.png", status: "Not configured" },
  { id: "kilo", name: "Kiro Code", image: "/assets/providers/kilocode/icon.png", status: "Guide" },
  { id: "roo", name: "Roo", image: "/assets/tools/roo/icon.png", status: "Guide" },
  { id: "continue", name: "Continue", image: "/assets/tools/continue/icon.png", status: "Guide" },
  { id: "amp", name: "Amp CLI", image: "/assets/tools/amp/icon.png", status: "Guide" },
  { id: "qwen", name: "Qwen Code", image: "/assets/providers/qwen/icon.png", status: "Guide" },
  { id: "deepseek-tui", name: "DeepSeek TUI", image: "/assets/tools/deepseek-tui/icon.png", status: "Not installed" },
  { id: "jcode", name: "Jcode", image: "/assets/tools/jcode/icon.png", status: "Not installed" },
  { id: "grok-build", name: "Grok Build", image: "/assets/tools/grok-build/icon.png", status: "Not installed" },
  { id: "devin", name: "Devin CLI", image: "/assets/providers/devin-cli/icon.png", status: "Guide" },
  { id: "opendesign", name: "OpenDesign", image: "/assets/tools/opendesign/icon.png", status: "Guide" },
  { id: "pi", name: "Pi (pi-coding-agent)", image: "/assets/tools/pi/icon.svg", status: "Not installed" },
  { id: "omp", name: "Oh My Pi", image: "/assets/tools/omp/icon.png", status: "Not installed" },
  { id: "crush", name: "Crush", image: "/assets/tools/crush/icon.png", status: "Not installed" },
  { id: "forge", name: "ForgeCode", image: "/assets/tools/forge/icon.png", status: "Not installed" },
  { id: "smelt", name: "Smelt", image: "/assets/tools/smelt/icon.svg", status: "Not installed" },
  { id: "codewhale", name: "CodeWhale", image: "/assets/tools/codewhale/icon.svg", status: "Not installed" },
];
