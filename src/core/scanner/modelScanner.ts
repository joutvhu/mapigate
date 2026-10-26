import type { ScannedModel, ScanModelsResult, ScanModelsOptions } from "../../shared/types/index.js";
import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import { getRegistryProvider, type ProviderRegistryItem } from "../../shared/constants/providerRegistry.js";
import { getCapabilitiesForModel } from "../capabilities/index.js";
import { ensureFreshCredentials } from "../usage/tokenHelper.js";
import { ProviderRegistry } from "../../providers/core/registry.js";
import { resolveCandidateUrls } from "./urlResolver.js";

export { resolveCandidateUrls } from "./urlResolver.js";

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

    if (scannedAccounts.length > 0 && modelsById.size > 0) {
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
