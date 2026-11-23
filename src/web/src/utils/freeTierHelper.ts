import type { ProviderRegistryItem, FreeTierConfig } from "../../../providers/core/types.js";

export interface ResolvedFreeModel {
  id: string;
  comboModelValue: string;
  name: string;
  limit?: string;
  contextLength?: number;
  kind?: string;
  capabilities?: any;
  providerId?: string;
}

export interface FreeTierProviderData {
  provider: ProviderRegistryItem;
  freeTier: FreeTierConfig;
  freeModels: ResolvedFreeModel[];
  accountsCount: number;
  connectionStatus: "connected" | "not_connected" | "error" | "exhausted";
  statusLabel: string;
  statusDetail?: string;
  testResult?: ConnectionTestResult;
}

export interface ConnectionTestResult {
  success: boolean;
  message?: string;
  latencyMs?: number;
  error?: string;
}

/**
 * Checks wildcard string matches (e.g. "*:free", "*-free", "path/free")
 */
export function matchesWildcard(pattern: string, text: string): boolean {
  if (!pattern || !text) return false;
  if (pattern === text) return true;
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  const regex = new RegExp(`^${escaped}$`, "i");
  return regex.test(text);
}

/**
 * Determines whether a provider qualifies as a free tier or community free provider.
 */
export function isFreeTierProvider(p?: Partial<ProviderRegistryItem> | null): boolean {
  if (!p) return false;
  if (p.freeTier != null) return true;
  if (p.category === "freeTier" || p.category === "free") return true;
  if (p.isLocal === true) return true;
  if (p.requiresApiKey === false || p.authType === "none" || p.noAuth === true) return true;
  return false;
}

/**
 * Resolves only free models for a given provider, respecting freeTier scope,
 * static models list, wildcard matches, and database-discovered models.
 */
export function resolveFreeModels(
  provider: ProviderRegistryItem,
  dbProvider?: { models?: Array<string | { id: string; name?: string; contextLength?: number; kind?: string; capabilities?: string[] }> }
): ResolvedFreeModel[] {
  const freeTier = provider.freeTier;
  const rawModels = provider.models || [];
  const dbModels = dbProvider?.models || [];

  // Normalize models into a unified pool (filtering out non-chat models like embedding/stt/tts/image/video)
  const allKnownModels = new Map<
    string,
    { id: string; name: string; contextLength?: number; kind?: string; capabilities?: string[] }
  >();

  for (const m of rawModels) {
    if (!m || !m.id) continue;
    if (m.kind && m.kind !== "chat") continue;
    allKnownModels.set(m.id, {
      id: m.id,
      name: m.name || m.id,
      contextLength: m.contextLength,
      kind: m.kind,
      capabilities: m.capabilities,
    });
  }

  for (const dm of dbModels) {
    const id = typeof dm === "string" ? dm : dm?.id;
    if (!id) continue;
    const kind = typeof dm === "object" ? dm.kind : undefined;
    if (kind && kind !== "chat") continue;
    if (!allKnownModels.has(id)) {
      allKnownModels.set(id, {
        id,
        name: typeof dm === "string" ? dm : dm.name || id,
        contextLength: typeof dm === "object" ? dm.contextLength : undefined,
        kind,
        capabilities: typeof dm === "object" ? dm.capabilities : undefined,
      });
    }
  }

  const freeModels: ResolvedFreeModel[] = [];
  const seenIds = new Set<string>();

  const toComboValue = (modelId: string) => {
    return modelId.startsWith(`${provider.id}/`) ? modelId : `${provider.id}/${modelId}`;
  };

  if (!freeTier) {
    // Fallback: if category is free/local/noAuth, include all models as free
    for (const [id, m] of allKnownModels.entries()) {
      if (!seenIds.has(id)) {
        seenIds.add(id);
        freeModels.push({
          id,
          comboModelValue: toComboValue(id),
          name: m.name,
          limit: provider.isLocal ? "Local inference" : undefined,
          contextLength: m.contextLength,
          kind: m.kind,
          capabilities: m.capabilities,
          providerId: provider.id,
        });
      }
    }
    return freeModels;
  }

  // Handle explicit freeTier.models array first
  if (Array.isArray(freeTier.models)) {
    for (const fm of freeTier.models) {
      if (!fm || !fm.id) continue;
      const id = fm.id;
      const known = allKnownModels.get(id);
      if (known?.kind && known.kind !== "chat") continue;
      if (!seenIds.has(id)) {
        seenIds.add(id);
        freeModels.push({
          id,
          comboModelValue: toComboValue(id),
          name: known?.name || id,
          limit: fm.limit || freeTier.note,
          contextLength: known?.contextLength,
          kind: known?.kind,
          capabilities: known?.capabilities,
          providerId: provider.id,
        });
      }
    }
  }

  // Handle freeTier.match patterns (e.g. "*:free", "*-free")
  if (Array.isArray(freeTier.match) && freeTier.match.length > 0) {
    for (const [id, m] of allKnownModels.entries()) {
      if (seenIds.has(id)) continue;
      if (m.kind && m.kind !== "chat") continue;
      const matched = freeTier.match.some((pat) => matchesWildcard(pat, id));
      if (matched) {
        seenIds.add(id);
        freeModels.push({
          id,
          comboModelValue: toComboValue(id),
          name: m.name,
          limit: freeTier.note || "Free tier",
          contextLength: m.contextLength,
          kind: m.kind,
          capabilities: m.capabilities,
          providerId: provider.id,
        });
      }
    }
  }

  // If scope is 'all', any remaining known models in the provider are free
  if (freeTier.scope === "all") {
    for (const [id, m] of allKnownModels.entries()) {
      if (!seenIds.has(id)) {
        if (m.kind && m.kind !== "chat") continue;
        seenIds.add(id);
        freeModels.push({
          id,
          comboModelValue: toComboValue(id),
          name: m.name,
          limit: freeTier.note,
          contextLength: m.contextLength,
          kind: m.kind,
          capabilities: m.capabilities,
          providerId: provider.id,
        });
      }
    }
  }

  return freeModels;
}

/**
 * Calculates connection status for a free tier provider.
 */
export function getProviderConnectionStatus(
  provider: ProviderRegistryItem,
  backendProvider?: {
    accounts?: Array<{ isActive: boolean; rateLimitHits?: number }>;
    accountsCount?: number;
  },
  testResult?: ConnectionTestResult
): {
  status: "connected" | "not_connected" | "error" | "exhausted";
  label: string;
  detail?: string;
} {
  if (testResult) {
    if (testResult.success) {
      return {
        status: "connected",
        label: "Connected",
        detail: testResult.latencyMs != null ? `${testResult.latencyMs}ms` : undefined,
      };
    }
    const errMsg = testResult.error || testResult.message || "Connection failed";
    const isExhausted = /quota|rate limit|exhausted|429/i.test(errMsg);
    return {
      status: isExhausted ? "exhausted" : "error",
      label: isExhausted ? "Quota Exhausted" : "Connection Error",
      detail: errMsg,
    };
  }

  if (provider.isLocal) {
    return {
      status: "connected",
      label: "Local Engine",
      detail: "Runs on localhost",
    };
  }

  if (provider.noAuth || provider.requiresApiKey === false || provider.authType === "none") {
    return {
      status: "connected",
      label: "Ready (Zero Config)",
    };
  }

  const accounts = backendProvider?.accounts || [];
  const activeAccounts = accounts.filter((a) => a.isActive !== false);
  const count = backendProvider?.accountsCount ?? activeAccounts.length;

  if (count > 0 || activeAccounts.length > 0) {
    const allExhausted =
      activeAccounts.length > 0 &&
      activeAccounts.every((a) => (a.rateLimitHits ?? 0) >= 3);

    if (allExhausted) {
      return {
        status: "exhausted",
        label: "Rate Limited",
        detail: "Cooldown active",
      };
    }

    return {
      status: "connected",
      label: "Connected",
      detail: `${count} account${count > 1 ? "s" : ""}`,
    };
  }

  return {
    status: "not_connected",
    label: "Not Connected",
    detail: "API key required",
  };
}
