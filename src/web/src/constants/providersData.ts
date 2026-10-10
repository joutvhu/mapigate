import { PROVIDER_REGISTRY } from "../../../shared/constants/providerRegistry";

export interface ProviderItem {
  id: string;
  name: string;
  image: string;
  color?: string;
  category: "oauth" | "freeTier" | "apikey" | "custom";
  defaultConnected?: number;
  baseUrl?: string;
  format?: "openai" | "anthropic" | string;
  defaultHeaders?: Record<string, string>;
  models?: string[];
  thinkingMode?: string;
}

const DEFAULT_CONNECTED_MAP: Record<string, number> = {
  antigravity: 1,
  github: 1,
  openrouter: 1,
  nvidia: 1,
  gemini: 2,
  opencode: 1,
  "cloudflare-ai": 1,
  poolside: 1,
  byteplus: 1,
  kimchi: 1,
  agnes: 1,
  "api-airforce": 1,
};

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

export const CODING_PROVIDERS_LIST = registryList;

export const OAUTH_PROVIDERS_LIST: ProviderItem[] = registryList
  .filter((p) => p.category === "oauth" || p.category === "webCookie")
  .map((p) => ({
    id: p.id,
    name: p.name,
    image: p.image || `/providers/${p.id}.png`,
    color: p.color || "#4285F4",
    category: "oauth" as const,
    defaultConnected: DEFAULT_CONNECTED_MAP[p.id] || 0,
    baseUrl: p.baseUrl,
    format: p.format,
    defaultHeaders: p.defaultHeaders,
    models: p.models.map((m) => m.id),
    thinkingMode: p.thinkingMode,
  }));

export const FREE_TIER_PROVIDERS_LIST: ProviderItem[] = registryList
  .filter((p) => p.category === "freeTier" || p.category === "free")
  .map((p) => ({
    id: p.id,
    name: p.name,
    image: p.image || `/providers/${p.id}.png`,
    color: p.color || "#10B981",
    category: "freeTier" as const,
    defaultConnected: DEFAULT_CONNECTED_MAP[p.id] || 0,
    baseUrl: p.baseUrl,
    format: p.format,
    defaultHeaders: p.defaultHeaders,
    models: p.models.map((m) => m.id),
    thinkingMode: p.thinkingMode,
  }));

export const API_KEY_PROVIDERS_LIST: ProviderItem[] = registryList
  .filter((p) => p.category === "apikey" || p.category === "custom")
  .map((p) => ({
    id: p.id,
    name: p.name,
    image: p.image || `/providers/${p.id}.png`,
    color: p.color || "#6366F1",
    category: "apikey" as const,
    defaultConnected: DEFAULT_CONNECTED_MAP[p.id] || 0,
    baseUrl: p.baseUrl,
    format: p.format,
    defaultHeaders: p.defaultHeaders,
    models: p.models.map((m) => m.id),
    thinkingMode: p.thinkingMode,
  }));

export interface CliToolItem {
  id: string;
  name: string;
  image: string;
  status: "Connected" | "Guide" | "Not configured" | "Not installed";
  badgeColor?: string;
  isMitm?: boolean;
  desc?: string;
}

export const CLI_TOOLS_LIST: CliToolItem[] = [
  { id: "claude", name: "Claude Code", image: "/providers/claude.png", status: "Connected", badgeColor: "#10B981" },
  { id: "openclaw", name: "Open Claw", image: "/providers/openclaw.png", status: "Not installed" },
  { id: "codex", name: "OpenAI Codex CLI / App", image: "/providers/codex.png", status: "Not configured" },
  { id: "github", name: "GitHub Copilot", image: "/providers/github.png", status: "Guide" },
  { id: "opencode", name: "OpenCode", image: "/providers/opencode.png", status: "Not configured" },
  { id: "claude-cowork", name: "Claude Cowork", image: "/providers/claude.png", status: "Not configured" },
  { id: "hermes", name: "Hermes Agent", image: "/providers/hermes.png", status: "Not installed" },
  { id: "droid", name: "Factory Droid", image: "/providers/droid.png", status: "Not installed" },
  { id: "cursor", name: "Cursor", image: "/providers/cursor.png", status: "Guide" },
  { id: "cline", name: "Cline", image: "/providers/cline.png", status: "Not configured" },
  { id: "kilocode", name: "Kiro Code", image: "/providers/kilocode.png", status: "Guide" },
  { id: "roo", name: "Roo", image: "/providers/roo.png", status: "Guide" },
  { id: "continue", name: "Continue", image: "/providers/continue.png", status: "Guide" },
  { id: "amp", name: "Amp CLI", image: "/providers/amp.png", status: "Guide" },
  { id: "qwen", name: "Qwen Code", image: "/providers/qwen.png", status: "Guide" },
  { id: "deepseek-tui", name: "DeepSeek TUI", image: "/providers/deepseek-tui.png", status: "Not installed" },
  { id: "jcode", name: "Jcode", image: "/providers/jcode.png", status: "Not installed" },
  { id: "grok-build", name: "Grok Build", image: "/providers/grok-cli.png", status: "Not installed" },
  { id: "devin-cli", name: "Devin CLI", image: "/providers/devin-cli.png", status: "Guide" },
  { id: "opendesign", name: "OpenDesign", image: "/providers/opendesign.png", status: "Guide" },
  { id: "pi", name: "Pi (pi-coding-agent)", image: "/providers/pi.svg", status: "Not installed" },
  { id: "omp", name: "Oh My Pi", image: "/providers/omp.png", status: "Not installed" },
  { id: "crush", name: "Crush", image: "/providers/crush.png", status: "Not installed" },
  { id: "forge", name: "ForgeCode", image: "/providers/forge.png", status: "Not installed" },
  { id: "smelt", name: "Smelt", image: "/providers/smelt.svg", status: "Not installed" },
  { id: "codewhale", name: "CodeWhale", image: "/providers/codewhale.svg", status: "Not installed" },
];

export const MITM_TOOLS_LIST: CliToolItem[] = [
  { id: "antigravity", name: "Antigravity", image: "/providers/antigravity.png", status: "Connected", desc: "Google Antigravity IDE with MITM", isMitm: true },
  { id: "kiro", name: "Kiro", image: "/providers/kiro.png", status: "Connected", desc: "Kiro IDE with MITM", isMitm: true },
  { id: "copilot", name: "GitHub Copilot", image: "/providers/copilot.png", status: "Connected", desc: "GitHub Copilot in VS Code via MITM", isMitm: true },
];
