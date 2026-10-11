import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Primary and fallback paths for 9router registry
const candidates = [
  path.resolve(__dirname, "../../9router/open-sse/providers/registry"),
  path.resolve("F:/Documents/Library/AI/9router/open-sse/providers/registry"),
  path.resolve("f:/Documents/Library/AI/9router/open-sse/providers/registry"),
];

let registryDir = candidates.find((dir) => fs.existsSync(dir));
if (!registryDir) {
  throw new Error(`Cannot locate 9router registry directory in candidates: ${candidates.join(", ")}`);
}

const outputFile = path.resolve(__dirname, "../src/shared/constants/providerRegistry.ts");
const imgDir = path.resolve(__dirname, "../src/web/public/providers");
const existingImages = new Set(fs.existsSync(imgDir) ? fs.readdirSync(imgDir) : []);

const RISK_NOTICE =
  "⚠️ Risk Notice: This provider uses a subscription/OAuth session not officially licensed for proxy/router use. Account may be restricted or banned. Use at your own risk.";

function getImage(id, alias) {
  if (existingImages.has(`${id}.png`)) return `/providers/${id}.png`;
  if (existingImages.has(`${id}.svg`)) return `/providers/${id}.svg`;
  if (alias && existingImages.has(`${alias}.png`)) return `/providers/${alias}.png`;
  if (id.startsWith("minimax-code")) return "/providers/minimax.png";
  if (id.startsWith("opencode")) return "/providers/opencode.png";
  if (id.startsWith("ollama")) return "/providers/ollama.png";
  if (id.startsWith("bedrock")) return "/providers/bedrock.png";
  return "/providers/openai.png";
}

const files = fs
  .readdirSync(registryDir)
  .filter((f) => f.endsWith(".js") && f !== "index.js")
  .sort();

console.log(`Discovered ${files.length} provider registry definitions in ${registryDir}`);

const registryMap = {};

for (const file of files) {
  const filePath = path.join(registryDir, file);
  const mod = await import(pathToFileURL(filePath).href);
  const raw = mod.default;
  if (!raw || !raw.id) {
    console.warn(`Skipping invalid provider module in ${file}`);
    continue;
  }

  const id = raw.id;
  const name = raw.display?.name || raw.name || id;
  const alias = raw.alias || raw.uiAlias;
  const aliases = raw.aliases;
  const uiAlias = raw.uiAlias;
  const color = raw.display?.color || "#6366F1";
  const image = getImage(id, alias);
  const website = raw.display?.website || raw.website;
  const notice = raw.display?.notice;
  const deprecated = Boolean(raw.display?.deprecated || raw.deprecated);
  let deprecationNotice = raw.display?.deprecationNotice || raw.deprecationNotice;
  if (deprecationNotice === "RISK_NOTICE") {
    deprecationNotice = RISK_NOTICE;
  }

  const category = raw.category || "apikey";
  const authType = raw.authType;
  const authModes = raw.authModes;
  const noAuth = Boolean(raw.noAuth);
  const baseUrl = raw.transport?.baseUrl || (raw.transport?.baseUrls && raw.transport.baseUrls[0]) || "";
  const baseUrls = raw.transport?.baseUrls || (baseUrl ? [baseUrl] : []);
  const validateUrl = raw.transport?.validateUrl || "";
  const format = raw.transport?.format || "openai";
  const defaultHeaders = { ...(raw.transport?.headers || {}) };
  const thinkingMode = raw.transport?.thinkingMode || raw.thinkingConfig?.defaultMode || "auto";
  const thinkingOptions = raw.transport?.thinkingOptions || raw.thinkingConfig?.options;

  // Custom schemas and metadata
  const regions =
    raw.regions ||
    (id === "xiaomi-tokenplan"
      ? [
          { id: "sgp", label: "Singapore (新加坡)" },
          { id: "cn", label: "China (中国大陆)" },
          { id: "ams", label: "Amsterdam (阿姆斯特丹)" },
        ]
      : undefined);

  const defaultRegion = raw.defaultRegion || raw.transport?.defaultRegion || (id === "xiaomi-tokenplan" ? "sgp" : undefined);
  const credentialForm = raw.credentialForm || (id.startsWith("bedrock") ? "aws" : undefined);
  const apiKeyOptionalWith = raw.apiKeyOptionalWith || (id.startsWith("bedrock") ? "profile" : undefined);
  const hasProviderSpecificData = Boolean(
    raw.hasProviderSpecificData ||
      regions ||
      credentialForm ||
      id === "xiaomi-tokenplan" ||
      id === "azure" ||
      id === "cloudflare-ai" ||
      id === "ollama-local" ||
      id.startsWith("bedrock")
  );

  const oauth = raw.oauth
    ? {
        ...raw.oauth,
        scopes: Array.isArray(raw.oauth.scopes)
          ? raw.oauth.scopes
          : typeof raw.oauth.scopes === "string"
          ? [raw.oauth.scopes]
          : typeof raw.oauth.scope === "string"
          ? [raw.oauth.scope]
          : undefined,
      }
    : undefined;
  const passthroughModels = Boolean(raw.passthroughModels);

  const models = (raw.models || []).map((m) => ({
    id: m.id,
    name: m.name || m.id,
    upstreamModelId: m.upstreamModelId,
    isDefault: Boolean(m.isDefault || m.mandatory),
    capabilities: m.capabilities,
    kind: m.kind,
    contextLength: m.contextLength,
  }));

  registryMap[id] = {
    id,
    name,
    alias,
    aliases,
    uiAlias,
    color,
    image,
    website,
    notice,
    deprecated: deprecated || undefined,
    deprecationNotice: deprecationNotice || undefined,
    category,
    authType,
    authModes,
    noAuth: noAuth || undefined,
    baseUrl,
    baseUrls,
    validateUrl,
    format,
    defaultHeaders,
    thinkingMode,
    thinkingOptions,
    regions,
    defaultRegion,
    credentialForm,
    apiKeyOptionalWith,
    hasProviderSpecificData: hasProviderSpecificData || undefined,
    oauth,
    models,
    passthroughModels: passthroughModels || undefined,
  };
}

const fileContent = `// Auto-generated by scripts/sync-provider-registry.mjs
// Do not edit manually. Re-run: node scripts/sync-provider-registry.mjs

export interface RegistryModel {
  id: string;
  name: string;
  upstreamModelId?: string;
  isDefault?: boolean;
  capabilities?: string[];
  kind?: "llm" | "image" | "embedding" | "systemone" | "video" | string;
  contextLength?: number;
}

export interface ProviderRegion {
  id: string;
  label: string;
}

export interface ProviderNotice {
  apiKeyUrl?: string;
  signupUrl?: string;
  text?: string;
}

export interface ProviderOAuthConfig {
  clientId?: string;
  clientSecret?: string;
  authorizeUrl?: string;
  tokenUrl?: string;
  deviceCodeUrl?: string;
  scopes?: string[] | string;
  scope?: string;
  codeChallengeMethod?: "S256" | "plain" | string;
  platform?: string;
  pollInterval?: number;
  loginGuidanceUrl?: string;
  userInfoUrl?: string;
  firebaseApiKey?: string;
  firebaseSignInUrl?: string;
  registerUrl?: string;
  apiServerUrl?: string;
  auth1ApiServerUrl?: string;
  quotaUrl?: string;
  refresh?: Record<string, any>;
  refreshLeadMs?: number;
  [key: string]: any;
}

export interface ProviderRegistryItem {
  id: string;
  name: string;
  alias?: string;
  aliases?: string[];
  uiAlias?: string;
  color?: string;
  image?: string;
  website?: string;
  notice?: ProviderNotice;
  deprecated?: boolean;
  deprecationNotice?: string;
  category: "oauth" | "freeTier" | "apikey" | "free" | "webCookie" | "custom" | string;
  authType?: string;
  authModes?: string[];
  noAuth?: boolean;
  baseUrl: string;
  baseUrls?: string[];
  validateUrl?: string;
  format: "openai" | "claude" | "antigravity" | "kiro" | "vertex" | "grok-web" | "ollama" | string;
  defaultHeaders: Record<string, string>;
  thinkingMode?: string;
  thinkingOptions?: string[];
  regions?: ProviderRegion[];
  defaultRegion?: string;
  credentialForm?: "aws" | string;
  apiKeyOptionalWith?: string;
  hasProviderSpecificData?: boolean;
  oauth?: ProviderOAuthConfig;
  models: RegistryModel[];
  passthroughModels?: boolean;
}

export const PROVIDER_REGISTRY: Record<string, ProviderRegistryItem> = ${JSON.stringify(registryMap, null, 2)};

export function getRegistryProvider(id: string): ProviderRegistryItem | undefined {
  if (PROVIDER_REGISTRY[id]) return PROVIDER_REGISTRY[id];
  const lower = id.toLowerCase();
  for (const item of Object.values(PROVIDER_REGISTRY)) {
    if (item.id.toLowerCase() === lower) return item;
    if (item.alias?.toLowerCase() === lower) return item;
    if (item.uiAlias?.toLowerCase() === lower) return item;
    if (item.aliases?.some((a) => a.toLowerCase() === lower)) return item;
  }
  return undefined;
}

export function getAllRegistryProviders(): ProviderRegistryItem[] {
  return Object.values(PROVIDER_REGISTRY);
}
`;

fs.writeFileSync(outputFile, fileContent, "utf8");
console.log(`Successfully synced ${Object.keys(registryMap).length} providers to ${outputFile}`);
