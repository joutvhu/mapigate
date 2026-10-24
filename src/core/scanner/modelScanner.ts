import type { ScannedModel, ScanModelsResult, ScanModelsOptions } from "../../shared/types/index.js";
import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import { getRegistryProvider, type ProviderRegistryItem } from "../../shared/constants/providerRegistry.js";
import { getCapabilitiesForModel } from "../capabilities/index.js";
import { ensureFreshCredentials } from "../usage/tokenHelper.js";
import { ProviderRegistry } from "../../providers/core/registry.js";

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
  }

  // 3. Ollama special endpoints
  if (isOllama) {
    add(`${cleanBase}/api/tags`);
    add(`${cleanBase}/v1/models`);
    add(`${cleanBase}/models`);
  }

  // 4. Registry validateUrl fallback if it points to /models or /api/tags
  if (registryItem?.validateUrl) {
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

export { extractModelsFromPayload } from "./payloadExtractor.js";

/**
 * Scans models from an upstream provider API endpoint.
 * Probes candidate URLs with decrypted credentials and parses the response safely.
 */
export async function scanProviderModels(options: ScanModelsOptions): Promise<ScanModelsResult> {
  try {
    let { providerId, accountId, baseUrl, apiKey, customHeaders, format, timeoutMs = 8000, region, providerSpecificData } = options;

    let registryItem: ProviderRegistryItem | undefined;
    if (providerId) {
      registryItem = getRegistryProvider(providerId);
      if (!region && registryItem?.defaultRegion) {
        region = registryItem.defaultRegion;
      }
    }

    let accountsToScan: {
      id: string;
      name: string;
      apiKey: string;
      region?: string;
      providerSpecificData?: Record<string, any>;
    }[] = [];

    // Resolve missing parameters from ProviderRepository if providerId is specified
    let dbProvider: any;
    if (providerId) {
      dbProvider = ProviderRepository.getProviderById(providerId);

      if (!baseUrl) {
        baseUrl = dbProvider?.baseUrl || registryItem?.baseUrl;
      }

      if (!format) {
        format = dbProvider?.format || registryItem?.format;
      }

      if (!customHeaders) {
        customHeaders = {
          ...(registryItem?.defaultHeaders || {}),
          ...(dbProvider?.customHeaders || {}),
        };
      } else {
        customHeaders = {
          ...(registryItem?.defaultHeaders || {}),
          ...(dbProvider?.customHeaders || {}),
          ...customHeaders,
        };
      }

      if (apiKey) {
        accountsToScan = [{
          id: "explicit",
          name: "Custom API Key",
          apiKey,
          region: region || providerSpecificData?.region,
          providerSpecificData,
        }];
      } else {
        let accounts = accountId
          ? ProviderRepository.getAllAccountsByProvider(providerId)
          : ProviderRepository.getAccountsByProvider(providerId);
        if (accounts.length === 0) {
          accounts = ProviderRepository.getAllAccountsByProvider(providerId);
        }
        if (accountId) {
          accounts = accounts.filter((a) => a.id === accountId);
        }
        if (accounts.length > 0) {
          accountsToScan = accounts.map((a) => ({
            id: a.id,
            name: a.name,
            apiKey: a.rawApiKey || "",
            region: a.providerSpecificData?.region || region,
            providerSpecificData: a.providerSpecificData || providerSpecificData,
          }));
        } else {
          const isZeroAuth =
            registryItem?.noAuth ||
            registryItem?.requiresApiKey === false ||
            registryItem?.authType === "none" ||
            Boolean(registryItem?.isLocal) ||
            providerId === "opencode" ||
            providerId === "oc" ||
            providerId === "ollama-local" ||
            providerId === "lm-studio" ||
            providerId === "jan" ||
            providerId === "local-device";
          if (isZeroAuth) {
            accountsToScan = [{
              id: "acc_zero_auth",
              name: `${registryItem?.name || providerId} (Local/Free)`,
              apiKey: "public",
              region,
              providerSpecificData,
            }];
          } else {
            return {
              success: false,
              models: [],
              count: 0,
              noAccountsConfigured: true,
              error: `No configured accounts found for "${dbProvider?.name || registryItem?.name || providerId}". Please add an API key or account in the provider accounts section first.`,
            };
          }
        }
      }
    } else {
      accountsToScan = [{
        id: "ad-hoc",
        name: "Default",
        apiKey: apiKey || "",
        region: region || providerSpecificData?.region,
        providerSpecificData,
      }];
    }

    // Refresh OAuth / token credentials if needed
    for (const acc of accountsToScan) {
      if (acc.id !== "explicit" && acc.id !== "ad-hoc" && acc.id !== "acc_opencode_free") {
        try {
          const fresh = await ensureFreshCredentials(
            acc.id,
            providerId || "",
            acc.apiKey,
            acc.providerSpecificData
          );
          if (fresh.accessToken || fresh.apiKey) {
            acc.apiKey = fresh.accessToken || fresh.apiKey || acc.apiKey;
            acc.providerSpecificData = {
              ...(acc.providerSpecificData || {}),
              ...(fresh.providerSpecificData || {}),
            };
          }
        } catch {
          // If refresh fails, continue with existing key
        }
      }
    }

    if (!baseUrl) {
      return {
        success: false,
        models: [],
        count: 0,
        error: "Base URL is required to scan models.",
      };
    }

    const candidateUrls = resolveCandidateUrls(baseUrl, format, providerId, registryItem, region);
    if (candidateUrls.length === 0) {
      return {
        success: false,
        models: [],
        count: 0,
        error: "No candidate endpoint URLs could be resolved from the provided baseUrl.",
      };
    }

    const modelsById = new Map<string, ScannedModel>();
    const scannedAccounts: { id: string; name: string }[] = [];
    const failedAccounts: { id: string; name: string; error?: string }[] = [];
    let discoveredEndpointUrl: string | undefined;

    const providerInstance = ProviderRegistry.get(providerId || "openai");

    // Scan using all candidate accounts delegated to provider instance
    for (const account of accountsToScan) {
      const accountRegion = account.region || account.providerSpecificData?.region || region;

      const probeRes = await providerInstance.probeModels?.({
        account,
        apiKey: account.apiKey,
        baseUrl,
        customHeaders,
        format,
        timeoutMs,
        region: accountRegion,
        providerSpecificData: account.providerSpecificData,
      });

      if (probeRes?.success) {
        if (!discoveredEndpointUrl && probeRes.endpointUrl) {
          discoveredEndpointUrl = probeRes.endpointUrl;
        }
        for (const m of probeRes.models || []) {
          if (!modelsById.has(m.id)) {
            modelsById.set(m.id, m);
          }
        }
        scannedAccounts.push({ id: account.id, name: account.name });
      } else {
        failedAccounts.push({
          id: account.id,
          name: account.name,
          error: probeRes?.authError || probeRes?.error || "Failed to scan account",
        });
      }
    }

    if (scannedAccounts.length > 0) {
      return {
        success: true,
        endpointUrl: discoveredEndpointUrl,
        models: Array.from(modelsById.values()),
        count: modelsById.size,
        scannedAccounts,
        failedAccounts: failedAccounts.length > 0 ? failedAccounts : undefined,
      };
    }

    // Graceful fallback to static catalog models for Kiro / Amazon Q if available
    if (
      modelsById.size === 0 &&
      (providerId === "kiro" || providerId === "amazon-q" || registryItem?.id === "kiro" || registryItem?.id === "amazon-q") &&
      registryItem?.models?.length
    ) {
      for (const m of registryItem.models) {
        modelsById.set(m.id, {
          id: m.id,
          name: m.name || m.id,
          contextLength: m.contextLength,
          capabilities: {
            vision: Boolean(m.capabilities?.includes("vision")),
            reasoning: Boolean(m.capabilities?.includes("reasoning")),
            audio: Boolean(m.capabilities?.includes("audio")),
          },
          raw: m,
        });
      }
      return {
        success: true,
        endpointUrl: discoveredEndpointUrl || baseUrl,
        models: Array.from(modelsById.values()),
        count: modelsById.size,
        scannedAccounts:
          scannedAccounts.length > 0
            ? scannedAccounts
            : accountsToScan.map((a) => ({ id: a.id, name: a.name })),
        failedAccounts: failedAccounts.length > 0 ? failedAccounts : undefined,
      };
    }

    return {
      success: false,
      models: [],
      count: 0,
      failedAccounts: failedAccounts.length > 0 ? failedAccounts : undefined,
      error: failedAccounts[0]?.error || "Could not discover models from any candidate endpoints.",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      models: [],
      count: 0,
      error: `Model scanner error: ${msg}`,
    };
  }
}
