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

export function getToolForHost(host?: string | null): string | null {
  if (!host) return null;
  const h = host.split(":")[0].trim().toLowerCase();

  for (const tool of MITM_TOOLS) {
    if (tool.hosts.some((target) => target.toLowerCase() === h)) {
      return tool.id;
    }
  }

  // Tool-specific custom matchers / fallback heuristics
  for (const tool of MITM_TOOLS) {
    if (tool.matchesHost?.(h)) {
      return tool.id;
    }
  }

  return null;
}

export function isMitmHost(host?: string | null): boolean {
  return getToolForHost(host) !== null;
}

export function formatToolDefaultHosts(tool: string, ip = "127.0.0.1"): string {
  const target = MITM_TOOLS.find((t) => t.id === tool);
  if (target?.defaultHost) return target.defaultHost;
  const hosts = TOOL_HOSTS[tool] || [];
  return hosts.map((h) => `${ip} ${h}`).join("\n");
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
