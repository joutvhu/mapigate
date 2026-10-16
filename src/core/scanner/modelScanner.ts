import type { ScannedModel, ScanModelsResult, ScanModelsOptions } from "../../shared/types/index.js";
import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import { getRegistryProvider, type ProviderRegistryItem } from "../../shared/constants/providerRegistry.js";
import { getCapabilitiesForModel } from "../capabilities/index.js";

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

  // 2. BaseUrl ends with /chat/completions or /messages -> strip path segment
  if (lowerBase.endsWith("/chat/completions")) {
    cleanBase = cleanBase.slice(0, cleanBase.length - "/chat/completions".length).replace(/\/+$/, "");
    lowerBase = cleanBase.toLowerCase();
    add(`${cleanBase}/models`);
  } else if (lowerBase.endsWith("/messages")) {
    cleanBase = cleanBase.slice(0, cleanBase.length - "/messages".length).replace(/\/+$/, "");
    lowerBase = cleanBase.toLowerCase();
    add(`${cleanBase}/models`);
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

/**
 * Normalizes different API response shapes into a uniform array of ScannedModel.
 */
export function extractModelsFromPayload(data: unknown, providerId?: string): ScannedModel[] {
  if (!data || typeof data !== "object") return [];

  let rawList: unknown[] = [];

  if (Array.isArray(data)) {
    rawList = data;
  } else {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.data)) {
      rawList = obj.data;
    } else if (Array.isArray(obj.models)) {
      rawList = obj.models;
    } else if (Array.isArray(obj.result)) {
      rawList = obj.result;
    } else if (Array.isArray(obj.results)) {
      rawList = obj.results;
    } else if (Array.isArray(obj.items)) {
      rawList = obj.items;
    } else if (Array.isArray(obj.list)) {
      rawList = obj.list;
    } else if (obj.data && typeof obj.data === "object") {
      const nested = obj.data as Record<string, unknown>;
      if (Array.isArray(nested.models)) {
        rawList = nested.models;
      } else if (Array.isArray(nested.list)) {
        rawList = nested.list;
      } else if (Array.isArray(nested.items)) {
        rawList = nested.items;
      } else if (Array.isArray(nested.data)) {
        rawList = nested.data;
      }
    } else if (obj.result && typeof obj.result === "object") {
      const nested = obj.result as Record<string, unknown>;
      if (Array.isArray(nested.models)) {
        rawList = nested.models;
      } else if (Array.isArray(nested.list)) {
        rawList = nested.list;
      } else if (Array.isArray(nested.items)) {
        rawList = nested.items;
      }
    }
  }

  const results: ScannedModel[] = [];
  const seenIds = new Set<string>();

  for (const item of rawList) {
    if (!item) continue;

    if (typeof item === "string") {
      const id = item.trim();
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        const caps = getCapabilitiesForModel(providerId || "openai", id);
        results.push({
          id,
          name: id,
          capabilities: {
            vision: Boolean(caps.vision),
            reasoning: Boolean(caps.reasoning),
            audio: Boolean(caps.audioInput || caps.audioOutput),
          },
          contextLength: caps.contextWindow || undefined,
          raw: item,
        });
      }
      continue;
    }

    if (typeof item === "object") {
      const rec = item as Record<string, unknown>;
      let rawId = rec.id || rec.name || rec.model || rec.model_name || rec.code;
      if (typeof rawId !== "string" && typeof rawId !== "number") continue;
      let id = String(rawId).trim();
      if (!id) continue;

      // Handle Gemini models/ prefix if present
      if (id.startsWith("models/")) {
        id = id.slice(7);
      }

      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const name = typeof rec.display_name === "string"
        ? rec.display_name
        : typeof rec.displayName === "string"
          ? rec.displayName
          : typeof rec.name === "string" && !rec.name.startsWith("models/")
            ? rec.name
            : id;

      const description = typeof rec.description === "string" ? rec.description : undefined;

      let contextLength: number | undefined;
      const rawCtx = rec.context_length ?? rec.context_window ?? rec.max_tokens ?? rec.contextLength;
      if (typeof rawCtx === "number" && rawCtx > 0) {
        contextLength = rawCtx;
      }

      const caps = getCapabilitiesForModel(providerId || "openai", id);
      results.push({
        id,
        name,
        description,
        contextLength: contextLength || caps.contextWindow || undefined,
        capabilities: {
          vision: Boolean(rec.vision ?? caps.vision),
          reasoning: Boolean(rec.reasoning ?? caps.reasoning),
          audio: Boolean(rec.audio ?? caps.audioInput ?? caps.audioOutput),
        },
        raw: item,
      });
    }
  }

  const isOpenCodeFree = providerId === "opencode" || providerId === "oc";
  if (isOpenCodeFree) {
    const DEAD = new Set(["deepseek-v4-flash-free"]);
    const KNOWN = new Set(["big-pickle", "union-alpha"]);
    return results.filter((m) => (m.id.endsWith("-free") || KNOWN.has(m.id)) && !DEAD.has(m.id));
  }

  return results;
}

/**
 * Scans models from an upstream provider API endpoint.
 * Probes candidate URLs with decrypted credentials and parses the response safely.
 */
export async function scanProviderModels(options: ScanModelsOptions): Promise<ScanModelsResult> {
  try {
    let { providerId, baseUrl, apiKey, customHeaders, format, timeoutMs = 8000, region, providerSpecificData } = options;

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
        let accounts = ProviderRepository.getAccountsByProvider(providerId);
        if (accounts.length === 0) {
          accounts = ProviderRepository.getAllAccountsByProvider(providerId);
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
            providerId === "opencode" ||
            providerId === "oc";
          if (isZeroAuth) {
            accountsToScan = [{
              id: "acc_opencode_free",
              name: "OpenCode Free (Public)",
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

    const isGemini =
      format === "gemini" ||
      (providerId && (providerId.toLowerCase().includes("gemini") || providerId.toLowerCase().includes("google"))) ||
      baseUrl.toLowerCase().includes("googleapis.com") ||
      baseUrl.toLowerCase().includes("generativelanguage");

    const isOpenCodeFree =
      (providerId === "opencode" ||
        providerId === "oc" ||
        (registryItem && (registryItem.id === "opencode" || registryItem.alias === "oc"))) &&
      !providerId?.startsWith("opencode-go") &&
      !providerId?.startsWith("opencode-zen");

    const modelsById = new Map<string, ScannedModel>();
    const scannedAccounts: { id: string; name: string }[] = [];
    const failedAccounts: { id: string; name: string; error?: string }[] = [];
    let discoveredEndpointUrl: string | undefined;
    let authError: string | null = null;
    let lastError: string | null = null;

    // Scan using all candidate accounts
    for (const account of accountsToScan) {
      authError = null;
      lastError = null;
      let token = account.apiKey.trim();
      const reqHeaders: Record<string, string> = {
        Accept: "application/json",
        ...(customHeaders || {}),
      };

      if (isOpenCodeFree) {
        if (!token) {
          token = "public";
        }
        reqHeaders["User-Agent"] = "opencode/1.18.31";
        reqHeaders["x-opencode-client"] = "desktop";
        reqHeaders["Authorization"] = "Bearer public";
      } else if (token) {
        const isAnthropic =
          format === "anthropic" ||
          registryItem?.format === "anthropic" ||
          (providerId && (providerId.toLowerCase().includes("anthropic") || providerId.toLowerCase().includes("claude")));

        if (isAnthropic) {
          if (!reqHeaders["x-api-key"] && !reqHeaders["X-API-KEY"]) {
            reqHeaders["x-api-key"] = token;
          }
          if (!reqHeaders["anthropic-version"] && !reqHeaders["Anthropic-Version"]) {
            reqHeaders["anthropic-version"] = "2023-06-01";
          }
        } else {
          if (!reqHeaders["Authorization"] && !reqHeaders["authorization"]) {
            reqHeaders["Authorization"] = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
          }
        }

        if (isGemini && !reqHeaders["x-goog-api-key"] && !reqHeaders["X-GOOG-API-KEY"]) {
          reqHeaders["x-goog-api-key"] = token;
        }
      }

      let accountSucceeded = false;
      const accountRegion = account.region || account.providerSpecificData?.region || region;
      const accountCandidateUrls = resolveCandidateUrls(baseUrl, format, providerId, registryItem, accountRegion);

      let orderedUrls = accountCandidateUrls;
      if (discoveredEndpointUrl && accountCandidateUrls.includes(discoveredEndpointUrl)) {
        if (discoveredEndpointUrl === accountCandidateUrls[0]) {
          orderedUrls = accountCandidateUrls;
        } else {
          const primary = accountCandidateUrls[0];
          const remaining = accountCandidateUrls.slice(1).filter((u) => u !== discoveredEndpointUrl);
          orderedUrls = [primary, discoveredEndpointUrl, ...remaining];
        }
      }

      for (let candidateIdx = 0; candidateIdx < orderedUrls.length; candidateIdx++) {
        const url = orderedUrls[candidateIdx];
        try {
          const headersForUrl = { ...reqHeaders };
          if (
            token &&
            (url.toLowerCase().includes("googleapis.com") || url.toLowerCase().includes("generativelanguage")) &&
            !headersForUrl["x-goog-api-key"] &&
            !headersForUrl["X-GOOG-API-KEY"]
          ) {
            headersForUrl["x-goog-api-key"] = token;
          }

          // Capped timeout for secondary regional fallbacks to prevent cumulative latency on unreachable networks
          const candidateTimeout = candidateIdx === 0 ? timeoutMs : Math.min(timeoutMs, 3500);

          const response = await fetch(url, {
            method: "GET",
            headers: headersForUrl,
            signal: AbortSignal.timeout(candidateTimeout),
          });

          if (response.ok || response.status === 200) {
            const payload = await response.json();
            const models = extractModelsFromPayload(payload, providerId);
            if (models.length > 0) {
              accountSucceeded = true;
              if (!discoveredEndpointUrl) {
                discoveredEndpointUrl = url;
              }
              for (const m of models) {
                if (!modelsById.has(m.id)) {
                  modelsById.set(m.id, m);
                }
              }
              break;
            } else {
              const errPayloadMsg = (payload && typeof payload === "object")
                ? ((payload as any).message || (payload as any).msg || (payload as any).error?.message || (payload as any).error)
                : undefined;
              lastError = errPayloadMsg
                ? `Endpoint ${url} returned error: ${typeof errPayloadMsg === "string" ? errPayloadMsg : JSON.stringify(errPayloadMsg)}`
                : `Endpoint ${url} returned 0 models`;
              continue;
            }
          }

          if (response.status === 401 || response.status === 403) {
            authError = `Authentication failed (HTTP ${response.status}) for account "${account.name}". Please verify credentials.`;
          } else {
            lastError = `Endpoint ${url} returned HTTP ${response.status}: ${response.statusText}`;
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          lastError = `Failed to connect to ${url}: ${msg}`;
        }
      }

      if (accountSucceeded) {
        scannedAccounts.push({ id: account.id, name: account.name });
      } else {
        failedAccounts.push({
          id: account.id,
          name: account.name,
          error: authError || lastError || "Failed to scan account",
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

    return {
      success: false,
      models: [],
      count: 0,
      failedAccounts: failedAccounts.length > 0 ? failedAccounts : undefined,
      error: authError || lastError || "Could not discover models from any candidate endpoints.",
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
