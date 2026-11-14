import type { ProviderRegistryItem } from "../../providers/core/types.js";

/**
 * Resolves candidate endpoint URLs for model discovery from a given baseUrl or provider info.
 */
export function resolveCandidateUrls(
  baseUrl: string,
  format?: string,
  providerId?: string,
  registryItem?: ProviderRegistryItem,
  region?: string
): string[] {
  let cleanBase = (baseUrl || "").trim().replace(/\/+$/, "");
  if (!cleanBase) return [];

  const candidates: string[] = [];
  const add = (url: string) => {
    const trimmed = url.trim().replace(/\/+$/, "");
    if (trimmed && !candidates.includes(trimmed)) {
      candidates.push(trimmed);
    }
  };

  let lowerBase = cleanBase.toLowerCase();
  const isOllama =
    format === "ollama" ||
    lowerBase.includes(":11434") ||
    (providerId && providerId.toLowerCase().includes("ollama"));

  // Xiaomi Token Plan endpoint resolution (cluster-specific for tp- keys)
  const isTokenPlan =
    providerId === "xiaomi-tokenplan" ||
    providerId === "xmtp" ||
    (registryItem && (
      registryItem.id === "xiaomi-tokenplan" ||
      registryItem.alias === "xmtp"
    )) ||
    lowerBase.includes("token-plan-");

  if (isTokenPlan && lowerBase.includes("xiaomimimo.com")) {
    const urlRegionMatch = lowerBase.match(/token-plan-([a-z0-9_-]+)\.xiaomimimo\.com/);
    const targetRegion = (region || (urlRegionMatch ? urlRegionMatch[1] : "") || "sgp").toLowerCase().trim();

    add(`https://token-plan-${targetRegion}.xiaomimimo.com/v1/models`);
    const fallbackRegions = ["sgp", "cn", "ams"];
    for (const r of fallbackRegions) {
      if (r !== targetRegion) {
        add(`https://token-plan-${r}.xiaomimimo.com/v1/models`);
      }
    }
    return candidates;
  }

  // Google Antigravity discovery endpoints
  const isAntigravity =
    providerId === "antigravity" ||
    format === "antigravity" ||
    registryItem?.id === "antigravity" ||
    lowerBase.includes("cloudcode-pa.googleapis.com");

  if (isAntigravity) {
    add("https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels");
    add("https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist");
    return candidates;
  }

  // OpenAI Codex discovery endpoints
  const isCodex =
    providerId === "codex" ||
    format === "openai-responses" ||
    registryItem?.id === "codex" ||
    lowerBase.includes("chatgpt.com/backend-api");

  if (isCodex) {
    add("https://chatgpt.com/backend-api/codex/models?client_version=0.159.0");
    add("https://chatgpt.com/backend-api/models");
    add("https://chatgpt.com/backend-api/wham/usage");
    return candidates;
  }

  // 1. If baseUrl already points directly to /models, /v1/models, or /api/tags
  if (lowerBase.endsWith("/models") || lowerBase.endsWith("/api/tags")) {
    add(cleanBase);
    return candidates;
  }

  // IteraCompute endpoint resolution (strictly scoped to /v1/models, root /models is 404)
  const isIteraCompute =
    providerId === "iteracompute" ||
    providerId === "itera" ||
    registryItem?.id === "iteracompute" ||
    registryItem?.alias === "iteracompute" ||
    lowerBase.includes("iteracompute.com");

  if (isIteraCompute) {
    add("https://api.iteracompute.com/v1/models");
    if (cleanBase.endsWith("/v1")) {
      add(`${cleanBase}/models`);
    } else {
      add(`${cleanBase}/v1/models`);
    }
    return candidates;
  }

  // OpenCode Free discovery endpoint - strictly scoped to OpenCode Free, excluding paid opencode-go and opencode-zen
  const isOpenCodeFree =
    (providerId === "opencode" ||
      providerId === "oc" ||
      (registryItem && (registryItem.id === "opencode" || registryItem.alias === "oc"))) &&
    !providerId?.startsWith("opencode-go") &&
    !providerId?.startsWith("opencode-zen");

  if (isOpenCodeFree) {
    add("https://opencode.ai/zen/v1/models");
    add(`${cleanBase}/zen/v1/models`);
    add(`${cleanBase}/v1/models`);
    return candidates;
  }

  // AWS CodeWhisperer / Kiro / Amazon Q discovery endpoints
  const isAwsCodeWhisperer =
    providerId === "kiro" ||
    providerId === "amazon-q" ||
    format === "kiro" ||
    format === "amazon-q" ||
    registryItem?.id === "kiro" ||
    registryItem?.id === "amazon-q" ||
    registryItem?.format === "kiro" ||
    registryItem?.format === "amazon-q" ||
    lowerBase.includes("codewhisperer") ||
    lowerBase.includes("kiro.dev");

  if (isAwsCodeWhisperer) {
    const targetRegion = (region || "us-east-1").toLowerCase().trim();
    add(`https://codewhisperer.${targetRegion}.amazonaws.com`);
    add(`https://q.${targetRegion}.amazonaws.com`);
    if (lowerBase.endsWith("/generateassistantresponse")) {
      cleanBase = cleanBase.slice(0, cleanBase.length - "/generateassistantresponse".length).replace(/\/+$/, "");
    } else if (lowerBase.endsWith("/responses")) {
      cleanBase = cleanBase.slice(0, cleanBase.length - "/responses".length).replace(/\/+$/, "");
    }
    if (cleanBase && !candidates.includes(cleanBase) && !cleanBase.includes("runtime.")) {
      add(cleanBase);
    }
    return candidates;
  }

  // 2. BaseUrl ends with /chat/completions or /messages -> strip path segment
  if (lowerBase.endsWith("/chat/completions")) {
    cleanBase = cleanBase.slice(0, cleanBase.length - "/chat/completions".length).replace(/\/+$/, "");
    lowerBase = cleanBase.toLowerCase();
    add(`${cleanBase}/models`);
  } else if (lowerBase.endsWith("/messages")) {
    cleanBase = cleanBase.slice(0, cleanBase.length - "/messages".length).replace(/\/+$/, "");
    lowerBase = cleanBase.toLowerCase();
    add(`${cleanBase}/models`);
  } else if (lowerBase.endsWith("/generateassistantresponse")) {
    cleanBase = cleanBase.slice(0, cleanBase.length - "/generateassistantresponse".length).replace(/\/+$/, "");
    lowerBase = cleanBase.toLowerCase();
  } else if (lowerBase.endsWith("/responses")) {
    cleanBase = cleanBase.slice(0, cleanBase.length - "/responses".length).replace(/\/+$/, "");
    lowerBase = cleanBase.toLowerCase();
  } else if (lowerBase.endsWith("/usage")) {
    cleanBase = cleanBase.slice(0, cleanBase.length - "/usage".length).replace(/\/+$/, "");
    lowerBase = cleanBase.toLowerCase();
    add(`${cleanBase}/models`);
  }

  // 3. Ollama special endpoints
  if (isOllama) {
    add(`${cleanBase}/api/tags`);
    add(`${cleanBase}/v1/models`);
    add(`${cleanBase}/models`);
  }

  // 4. Registry modelsUrl or validateUrl fallback if it points to /models or /api/tags
  if (registryItem?.modelsUrl) {
    add(registryItem.modelsUrl.trim());
  } else if (registryItem?.validateUrl) {
    const vUrl = registryItem.validateUrl.trim();
    const isExternalXiaomiBypass =
      isTokenPlan && !lowerBase.includes("xiaomimimo.com") && vUrl.toLowerCase().includes("xiaomimimo.com");
    if (!isExternalXiaomiBypass && (vUrl.toLowerCase().includes("/models") || vUrl.toLowerCase().includes("/api/tags"))) {
      add(vUrl);
    }
  }

  // 5. Standard OpenAI / Anthropic compatible probing
  if (lowerBase.endsWith("/v1")) {
    add(`${cleanBase}/models`);
    const parent = cleanBase.slice(0, cleanBase.length - "/v1".length);
    add(`${parent}/models`);
  } else {
    add(`${cleanBase}/v1/models`);
    add(`${cleanBase}/models`);
  }

  return candidates;
}
