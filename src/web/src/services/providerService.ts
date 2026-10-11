import type { ScanModelsResult } from "../../../shared/types";
import { invalidateAvailableModelsCache } from "../components/ModelAutocompleteInput.js";

export interface ScanProviderModelsParams {
  providerId?: string;
  baseUrl?: string;
  apiKey?: string;
  customHeaders?: Record<string, string>;
  format?: string;
  timeoutMs?: number;
}

/**
 * Invokes backend model scanning endpoint.
 */
export async function scanProviderModels(params: ScanProviderModelsParams): Promise<ScanModelsResult> {
  const endpoint = params.providerId
    ? `/api/providers/${encodeURIComponent(params.providerId)}/scan-models`
    : "/api/providers/scan-models";

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const data = (await res.json()) as ScanModelsResult;
  return data;
}

/**
 * Persists an updated model list for a given provider.
 */
export async function saveProviderModels(providerId: string, models: string[]): Promise<boolean> {
  try {
    const getRes = await fetch(`/api/providers/${encodeURIComponent(providerId)}`);
    if (!getRes.ok) return false;
    const current = await getRes.json();

    const updateRes = await fetch("/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...current,
        id: providerId,
        models,
      }),
    });
    if (updateRes.ok) {
      invalidateAvailableModelsCache();
    }
    return updateRes.ok;
  } catch {
    return false;
  }
}
