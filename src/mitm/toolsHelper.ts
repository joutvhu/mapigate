import { MITM_TOOLS } from "./handlers/generated/toolsConfig.js";
import type { MitmHttpRequestLike, MitmToolUiConfig } from "./types.js";

export const TOOL_HOSTS: Record<string, string[]> = Object.fromEntries(
  MITM_TOOLS.map((t) => [t.id, t.hosts])
);

export const ALL_MITM_HOSTS: string[] = Array.from(
  new Set(MITM_TOOLS.flatMap((t) => t.hosts))
);

export const TARGET_HOSTS: string[] = [...ALL_MITM_HOSTS];

export const HOST_REWRITE: Record<string, string> = Object.assign(
  {},
  ...MITM_TOOLS.map((t) => t.hostRewrite || {})
);

export const URL_PATTERNS: Record<string, string[]> = Object.fromEntries(
  MITM_TOOLS.map((t) => [t.id, t.urlPatterns])
);

export const MODEL_SYNONYMS: Record<string, Record<string, string>> = Object.fromEntries(
  MITM_TOOLS.filter((t) => t.modelSynonyms).map((t) => [t.id, t.modelSynonyms!])
);

export const MODEL_PATTERNS: Record<string, Array<{ match: RegExp; alias: string }>> = Object.fromEntries(
  MITM_TOOLS.filter((t) => t.modelPatterns).map((t) => [t.id, t.modelPatterns!])
);

export const MODEL_NO_MAP: Record<string, RegExp[]> = Object.fromEntries(
  MITM_TOOLS.filter((t) => t.modelNoMap).map((t) => [t.id, t.modelNoMap!])
);

export const MITM_TOOLS_METADATA: MitmToolUiConfig[] = MITM_TOOLS.map((t) => ({
  id: t.id,
  name: t.name,
  image: t.image,
  desc: t.desc,
  defaultHost: t.defaultHost,
}));

export type CustomHostsProvider = () => {
  toolHostsMap: Map<string, string>;
  allCustomHosts: Set<string>;
};

let customHostsProvider: CustomHostsProvider | null = null;

export function registerCustomHostsProvider(provider: CustomHostsProvider): void {
  customHostsProvider = provider;
  invalidateCustomMitmHostsCache();
}

let customHostsCache: {
  toolHostsMap: Map<string, string>;
  allCustomHosts: Set<string>;
  ts: number;
} | null = null;

const CACHE_TTL_MS = 5000;

export function invalidateCustomMitmHostsCache(): void {
  customHostsCache = null;
}

export function parseHostnamesFromHostsEntries(entries?: string | null): string[] {
  if (!entries) return [];
  const lines = entries.split(/\r?\n/);
  const hostnames: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      for (let i = 1; i < parts.length; i++) {
        let domain = parts[i].trim().toLowerCase();
        if (domain.startsWith("#")) break;
        domain = domain.split(":")[0];
        if (domain && domain !== "localhost") {
          hostnames.push(domain);
        }
      }
    } else if (parts.length === 1) {
      let domain = parts[0].trim().toLowerCase();
      domain = domain.split(":")[0];
      if (domain && domain !== "127.0.0.1" && domain !== "::1" && domain !== "localhost") {
        hostnames.push(domain);
      }
    }
  }
  return hostnames;
}

export function getCustomMitmHosts(): {
  toolHostsMap: Map<string, string>;
  allCustomHosts: Set<string>;
} {
  const now = Date.now();
  if (customHostsCache && now - customHostsCache.ts < CACHE_TTL_MS) {
    return customHostsCache;
  }

  let result = {
    toolHostsMap: new Map<string, string>(),
    allCustomHosts: new Set<string>(),
  };

  if (customHostsProvider) {
    try {
      result = customHostsProvider();
    } catch {
      // Database uninitialized or in an isolated test environment without SQLite table
    }
  }

  customHostsCache = { ...result, ts: now };
  return customHostsCache;
}

export function getToolForHost(host?: string | null): string | null {
  if (!host) return null;
  const h = host.split(":")[0].trim().toLowerCase();

  // 1. Static built-in tool hosts
  for (const tool of MITM_TOOLS) {
    if (tool.hosts.some((target) => target.toLowerCase() === h)) {
      return tool.id;
    }
  }

  // 2. Custom hosts configured by user in settings/database
  const { toolHostsMap } = getCustomMitmHosts();
  const customTool = toolHostsMap.get(h);
  if (customTool) {
    return customTool;
  }

  // 3. Tool-specific custom matchers / fallback heuristics
  for (const tool of MITM_TOOLS) {
    if (tool.matchesHost?.(h)) {
      return tool.id;
    }
  }

  return null;
}

export function isMitmHost(host?: string | null): boolean {
  if (!host) return false;
  if (getToolForHost(host) !== null) {
    return true;
  }
  const h = host.split(":")[0].trim().toLowerCase();
  const { allCustomHosts } = getCustomMitmHosts();
  return allCustomHosts.has(h);
}

export function getAllActiveMitmHosts(): string[] {
  const { allCustomHosts } = getCustomMitmHosts();
  return Array.from(new Set([...ALL_MITM_HOSTS, ...allCustomHosts]));
}

export function formatToolDefaultHosts(tool: string, ip = "127.0.0.1"): string {
  const target = MITM_TOOLS.find((t) => t.id === tool);
  if (target?.defaultHost) return target.defaultHost;
  const hosts = TOOL_HOSTS[tool] || [];
  return hosts.map((h) => `${ip} ${h}`).join("\n");
}

export const TOOL_DEFAULT_HOSTS: Record<string, string> = Object.fromEntries(
  MITM_TOOLS.map((t) => [t.id, t.defaultHost || formatToolDefaultHosts(t.id)])
);

export interface MitmDefaultMappingItem {
  ide: string;
  sourceModel: string;
  targetModel: string;
}

export function getDefaultMappings(toolId?: string | null): MitmDefaultMappingItem[] {
  const tId = (toolId || "").toLowerCase();
  const target = MITM_TOOLS.find((t) => t.id.toLowerCase() === tId);
  if (!target) return [];

  if (target.defaultMappings) {
    return target.defaultMappings.map((m) => ({
      ide: target.id,
      sourceModel: m.sourceModel,
      targetModel: m.targetModel || "",
    }));
  }

  if (target.defaultModels) {
    return target.defaultModels.map((m) => ({
      ide: target.id,
      sourceModel: m,
      targetModel: "",
    }));
  }

  return [];
}

export function isChatRequest(
  tool: string,
  req: MitmHttpRequestLike
): boolean {
  const targetTool = MITM_TOOLS.find((t) => t.id === tool);
  if (!targetTool) return false;

  const url = req.url || "";
  const patterns = targetTool.urlPatterns || [];

  if (patterns.some((p) => url.includes(p))) {
    return true;
  }

  if (targetTool.isChatRequest?.(req)) {
    return true;
  }

  return false;
}

export function isBinaryData(buffer: Buffer): boolean {
  if (!buffer || buffer.length === 0) return false;
  const sample = buffer.subarray(0, Math.min(100, buffer.length));
  let nonPrintable = 0;
  for (let i = 0; i < sample.length; i++) {
    const byte = sample[i];
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) {
      nonPrintable++;
    }
    if (byte > 0x7e) nonPrintable++;
  }
  return nonPrintable / sample.length > 0.3;
}

export function normalizeModelSlug(model?: string | null): string {
  if (!model) return "";
  let clean = String(model).trim().toLowerCase();
  clean = clean.replace(/^models\//, "");
  return clean.replace(/[\s_]+/g, "-").replace(/-+/g, "-");
}

export function extractModel(url: string = "", body: Buffer | string | any = ""): string | null {
  const urlMatch = url.match(/\/models\/([^/:]+)/);
  const urlModel = urlMatch?.[1] || null;

  if (Buffer.isBuffer(body) && isBinaryData(body)) {
    return urlModel;
  }

  try {
    let parsed: any;
    if (typeof body === "string") {
      parsed = JSON.parse(body);
    } else if (Buffer.isBuffer(body)) {
      parsed = JSON.parse(body.toString("utf8"));
    } else if (typeof body === "object" && body !== null) {
      parsed = body;
    }

    if (parsed) {
      if (parsed.conversationState) {
        return (
          parsed.conversationState.currentMessage?.userInputMessage?.modelId ||
          parsed.conversationState.currentMessage?.userInputMessage?.model ||
          null
        );
      }
      const model = urlModel || parsed.model || null;
      if (!model) return urlModel;

      const cleanModelName = String(model).replace(/^models\//, "");
      if (
        cleanModelName === "gemini-3.6-flash-tiered" ||
        cleanModelName === "gemini-3.7-flash-tiered" ||
        cleanModelName === "gemini-3.8-flash-tiered"
      ) {
        const ver = cleanModelName.includes("3.8") ? "3.8" : cleanModelName.includes("3.7") ? "3.7" : "3.6";
        const rawLevel =
          parsed.request?.generationConfig?.thinkingConfig?.thinkingLevel ||
          parsed.generationConfig?.thinkingConfig?.thinkingLevel;
        const level = ["high", "medium", "low"].includes(String(rawLevel).toLowerCase())
          ? String(rawLevel).toLowerCase()
          : "medium";
        return `gemini-${ver}-flash-${level}`;
      }
      return model;
    }
  } catch {
    // Ignore JSON parse errors
  }

  return urlModel;
}
