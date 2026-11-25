import { PROVIDER_REGISTRY } from "../../../../shared/constants/providerRegistry.js";
import {
  getCapabilitiesForModel,
  type ModelCapabilities,
} from "../../../../core/capabilities/index.js";
import type { AvailableModelItem } from "../ModelAutocompleteInput.js";
import { createModelOption, type ModelOption, type ProviderSidebarItem } from "./types.js";

const NAME_COLLATOR = new Intl.Collator(undefined, { sensitivity: "base" });

export interface BuiltModelCatalog {
  allModels: ModelOption[];
  capsMap: Map<string, ModelCapabilities>;
  modelProviderMap: Map<string, string>;
  modelOptionMap: Map<string, ModelOption>;
}

export function buildModelCatalog(
  availableModels: AvailableModelItem[],
  modelAliases: Record<string, string>
): BuiltModelCatalog {
  const list: ModelOption[] = [];
  const seen = new Set<string>();
  const providersWithConfiguredModels = new Set<string>();

  // 1. Prioritize configured & scanned models from DB
  for (const m of availableModels) {
    if (m.isCombo) continue;
    if (seen.has(m.value)) continue;
    seen.add(m.value);
    providersWithConfiguredModels.add(m.providerId);

    const caps = getCapabilitiesForModel(m.providerId, m.id);
    list.push(
      createModelOption(
        m.id,
        m.value,
        m.name || m.id,
        m.providerId,
        m.providerName || m.providerId,
        {
          ...caps,
          vision: Boolean(m.caps?.vision || caps.vision),
          reasoning: Boolean(m.caps?.reasoning || caps.reasoning),
          audioInput: Boolean(m.caps?.audio || caps.audioInput),
          audioOutput: Boolean(m.caps?.audio || caps.audioOutput),
          ...(Array.isArray(m.supportedEfforts) && m.supportedEfforts.length > 0
            ? { supportedEfforts: m.supportedEfforts }
            : {}),
        },
        m.contextLength || caps.contextWindow,
        "llm",
        false
      )
    );
  }

  // 2. Fall back to static PROVIDER_REGISTRY presets for unconfigured providers
  for (const [providerId, provider] of Object.entries(PROVIDER_REGISTRY)) {
    if (!provider || !provider.models) continue;
    const alias = provider.alias || provider.id || providerId;

    const isConfigured =
      providersWithConfiguredModels.has(providerId) ||
      providersWithConfiguredModels.has(alias) ||
      Boolean(provider.aliases && provider.aliases.some((a) => providersWithConfiguredModels.has(a)));

    if (isConfigured) continue;

    for (const m of provider.models) {
      const val =
        m.id.startsWith(`${alias}/`) ||
        m.id.startsWith(`${providerId}/`) ||
        Boolean(provider.uiAlias && m.id.startsWith(`${provider.uiAlias}/`))
          ? m.id
          : `${alias}/${m.id}`;
      if (seen.has(val)) continue;
      seen.add(val);

      const caps = getCapabilitiesForModel(providerId, m.id);
      list.push(
        createModelOption(
          m.id,
          val,
          m.name || m.id,
          providerId,
          provider.name || providerId,
          caps,
          m.contextLength,
          m.kind || "llm",
          false
        )
      );
    }
  }

  // 3. Add alias-mapped models
  for (const [aliasKey, fullVal] of Object.entries(modelAliases)) {
    if (!seen.has(fullVal)) {
      seen.add(fullVal);
      const slash = fullVal.indexOf("/");
      const providerId = slash === -1 ? "custom" : fullVal.slice(0, slash);
      const modelId = slash === -1 ? fullVal : fullVal.slice(slash + 1);
      const reg = PROVIDER_REGISTRY[providerId];
      const caps = getCapabilitiesForModel(providerId, modelId);
      list.push(
        createModelOption(
          modelId,
          fullVal,
          aliasKey,
          providerId,
          reg?.name || providerId,
          caps,
          undefined,
          "llm",
          true
        )
      );
    }
  }

  // Pre-sort once so filtering & selection changes never re-run Intl.Collator
  list.sort((a, b) => NAME_COLLATOR.compare(a.name || a.id, b.name || b.id));

  const capsMap = new Map<string, ModelCapabilities>();
  const modelProviderMap = new Map<string, string>();
  const modelOptionMap = new Map<string, ModelOption>();

  for (const item of list) {
    capsMap.set(item.value, item.caps);
    modelProviderMap.set(item.value, item.providerId);
    modelOptionMap.set(item.value, item);
  }

  return { allModels: list, capsMap, modelProviderMap, modelOptionMap };
}

export function computeSelectedCountsByProvider(
  selectedModels: string[],
  modelProviderMap: Map<string, string>
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const val of selectedModels) {
    let pId = modelProviderMap.get(val);
    if (!pId && val.includes("/")) {
      pId = val.slice(0, val.indexOf("/"));
    }
    if (pId) {
      counts.set(pId, (counts.get(pId) || 0) + 1);
    }
  }
  return counts;
}

export interface FilterCatalogParams {
  allModels: ModelOption[];
  connectedProviderIds: Set<string>;
  hasConnectedAccounts: boolean;
  connectedOnly: boolean;
  kindFilter: string | null;
  activeModalityFilter: string;
  searchTokens: string[];
  excludeSet: Set<string>;
  selectedProvider: string;
}

export interface FilteredCatalogResult {
  allMatchingModels: ModelOption[];
  visibleModels: ModelOption[];
  providerCounts: Map<string, number>;
  providerMetadata: Map<string, { providerName: string }>;
  totalMatchingCount: number;
}

export function filterCatalogModels(params: FilterCatalogParams): FilteredCatalogResult {
  const {
    allModels,
    connectedProviderIds,
    hasConnectedAccounts,
    connectedOnly,
    kindFilter,
    activeModalityFilter,
    searchTokens,
    excludeSet,
    selectedProvider,
  } = params;

  const allMatchingModels: ModelOption[] = [];
  const visibleModels: ModelOption[] = [];
  const providerCounts = new Map<string, number>();
  const providerMetadata = new Map<string, { providerName: string }>();

  for (const item of allModels) {
    // Only exclude item.id when item is a combo (never hide upstream models matching combo name)
    if (
      (item.providerId === "combo" && excludeSet.has(item.id.toLowerCase())) ||
      excludeSet.has(item.value.toLowerCase())
    ) {
      continue;
    }

    if (connectedOnly && hasConnectedAccounts && !connectedProviderIds.has(item.providerId)) {
      continue;
    }

    if (kindFilter && item.kind && item.kind !== kindFilter) continue;

    if (activeModalityFilter === "vision" && !item.caps.vision) continue;
    if (activeModalityFilter === "pdf" && !item.caps.pdf) continue;
    if (
      activeModalityFilter === "audio" &&
      !item.caps.audioInput &&
      !(item.caps as Record<string, unknown>).audio
    ) {
      continue;
    }
    if (
      activeModalityFilter === "thinking" &&
      !item.caps.reasoning &&
      !(item.caps as Record<string, unknown>).thinking &&
      !item.caps.thinkingFormat
    ) {
      continue;
    }

    if (searchTokens.length > 0) {
      const matchesAll = searchTokens.every(
        (tok) => item.searchTarget.includes(tok) || item.normalizedSearchTarget.includes(tok)
      );
      if (!matchesAll) continue;
    }

    allMatchingModels.push(item);
    providerCounts.set(item.providerId, (providerCounts.get(item.providerId) || 0) + 1);
    if (!providerMetadata.has(item.providerId)) {
      providerMetadata.set(item.providerId, { providerName: item.providerName });
    }

    if (selectedProvider === "all" || item.providerId === selectedProvider) {
      visibleModels.push(item);
    }
  }

  return {
    allMatchingModels,
    visibleModels,
    providerCounts,
    providerMetadata,
    totalMatchingCount: allMatchingModels.length,
  };
}

/**
 * Builds a stably sorted provider sidebar list (connected first, then alphabetical).
 * Intentionally does NOT sort by selectedCount so providers never jump when clicking models.
 */
export function buildStableProviderSidebarItems(
  providerCounts: Map<string, number>,
  providerMetadata: Map<string, { providerName: string }>,
  connectedProviderIds: Set<string>,
  selectedCountsByProvider: Map<string, number>
): ProviderSidebarItem[] {
  const items: ProviderSidebarItem[] = [];

  for (const [providerId, modelCount] of providerCounts.entries()) {
    const reg = PROVIDER_REGISTRY[providerId];
    const meta = providerMetadata.get(providerId);
    items.push({
      providerId,
      providerName: meta?.providerName || reg?.name || providerId,
      color: reg?.color,
      iconBg: reg?.iconBg,
      image: reg?.image,
      modelCount,
      selectedCount: selectedCountsByProvider.get(providerId) || 0,
      isConnected: connectedProviderIds.has(providerId),
    });
  }

  items.sort((a, b) => {
    if (a.isConnected !== b.isConnected) return a.isConnected ? -1 : 1;
    return NAME_COLLATOR.compare(a.providerName, b.providerName);
  });

  return items;
}
