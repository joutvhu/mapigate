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
  registryItem?: ProviderRegistryItem
): string[] {
  const cleanBase = (baseUrl || "").trim().replace(/\/+$/, "");
  if (!cleanBase) return [];

  const candidates: string[] = [];
  const add = (url: string) => {
    const trimmed = url.trim().replace(/\/+$/, "");
    if (trimmed && !candidates.includes(trimmed)) {
      candidates.push(trimmed);
    }
  };

  const lowerBase = cleanBase.toLowerCase();
  const isOllama =
    format === "ollama" ||
    lowerBase.includes(":11434") ||
    (providerId && providerId.toLowerCase().includes("ollama"));

  // 1. If baseUrl already points directly to /models, /v1/models, or /api/tags
  if (lowerBase.endsWith("/models") || lowerBase.endsWith("/api/tags")) {
    add(cleanBase);
    return candidates;
  }

  // 2. BaseUrl ends with /chat/completions or /messages
  if (lowerBase.endsWith("/chat/completions")) {
    const parent = cleanBase.slice(0, cleanBase.length - "/chat/completions".length);
    add(`${parent}/models`);
  } else if (lowerBase.endsWith("/messages")) {
    const parent = cleanBase.slice(0, cleanBase.length - "/messages".length);
    add(`${parent}/models`);
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
    if (vUrl.toLowerCase().includes("/models") || vUrl.toLowerCase().includes("/api/tags")) {
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
    } else if (obj.data && typeof obj.data === "object" && Array.isArray((obj.data as Record<string, unknown>).models)) {
      rawList = (obj.data as Record<string, unknown>).models as unknown[];
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

  return results;
}

/**
 * Scans models from an upstream provider API endpoint.
 * Probes candidate URLs with decrypted credentials and parses the response safely.
 */
export async function scanProviderModels(options: ScanModelsOptions): Promise<ScanModelsResult> {
  try {
    let { providerId, baseUrl, apiKey, customHeaders, format, timeoutMs = 8000 } = options;

    let registryItem: ProviderRegistryItem | undefined;
    if (providerId) {
      registryItem = getRegistryProvider(providerId);
    }

    // Resolve missing parameters from ProviderRepository if providerId is specified
    if (providerId) {
      const dbProvider = ProviderRepository.getProviderById(providerId);

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

      if (!apiKey) {
        const activeAccounts = ProviderRepository.getAccountsByProvider(providerId);
        if (activeAccounts.length > 0 && activeAccounts[0].rawApiKey) {
          apiKey = activeAccounts[0].rawApiKey;
        } else {
          const allAccounts = ProviderRepository.getAllAccountsByProvider(providerId);
          if (allAccounts.length > 0 && allAccounts[0].rawApiKey) {
            apiKey = allAccounts[0].rawApiKey;
          }
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

    const candidateUrls = resolveCandidateUrls(baseUrl, format, providerId, registryItem);
    if (candidateUrls.length === 0) {
      return {
        success: false,
        models: [],
        count: 0,
        error: "No candidate endpoint URLs could be resolved from the provided baseUrl.",
      };
    }

    // Build headers
    const reqHeaders: Record<string, string> = {
      Accept: "application/json",
      ...(customHeaders || {}),
    };

    if (apiKey) {
      const token = apiKey.trim();
      if (!reqHeaders["Authorization"] && !reqHeaders["authorization"]) {
        reqHeaders["Authorization"] = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
      }
      if (!reqHeaders["x-api-key"] && !reqHeaders["X-API-KEY"]) {
        reqHeaders["x-api-key"] = token;
      }
    }

    let authError: string | null = null;
    let lastError: string | null = null;

    // Probe candidate URLs in order
    for (const url of candidateUrls) {
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: reqHeaders,
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (response.ok || response.status === 200) {
          const payload = await response.json();
          const models = extractModelsFromPayload(payload, providerId);
          return {
            success: true,
            endpointUrl: url,
            models,
            count: models.length,
          };
        }

        if (response.status === 401 || response.status === 403) {
          authError = `Authentication failed (HTTP ${response.status}). Please verify your API key or credentials.`;
        } else {
          lastError = `Endpoint ${url} returned HTTP ${response.status}: ${response.statusText}`;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        lastError = `Failed to connect to ${url}: ${msg}`;
      }
    }

    return {
      success: false,
      models: [],
      count: 0,
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
