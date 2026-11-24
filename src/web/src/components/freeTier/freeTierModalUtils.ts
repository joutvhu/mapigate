import {
  getCapabilitiesForModel,
  type ModelCapabilities,
} from "../../../../core/capabilities/index.js";
import type { FreeTierConfig } from "../../../../providers/core/types.js";
import type { FreeTierProviderData } from "../../utils/freeTierHelper.js";
import type { FreeTierGroup, FreeTierGroupMode } from "../../utils/freeTierGrouping.js";
import { matchesModelQuery } from "../ModelAutocompleteInput.js";

export type FreeTierModalityFilter = "all" | "vision" | "reasoning";

export interface FreeTierCandidateItem {
  comboModelValue: string;
  modelId: string;
  modelName: string;
  contextLength?: number;
  limit?: string;
  caps: ModelCapabilities;
  providerId: string;
  providerName: string;
  providerColor?: string;
  providerIconBg?: string;
  providerImage?: string;
  connectionStatus: "connected" | "not_connected" | "error" | "exhausted";
  statusLabel: string;
  statusDetail?: string;
  latencyMs?: number;
  groupId?: string;
  groupName?: string;
}

export interface FreeTierRailItem {
  id: string;
  name: string;
  subLabel?: string;
  image?: string;
  color?: string;
  iconBg?: string;
  connectionStatus?: "connected" | "not_connected" | "error" | "exhausted";
  totalCount: number;
  selectedCount: number;
  uniqueProvidersCount?: number;
  connectedProvidersCount?: number;
  limitType?: FreeTierConfig["limitType"];
}

export interface FreeTierWorkspaceResult {
  railItems: FreeTierRailItem[];
  visibleCandidates: FreeTierCandidateItem[];
  totalMatchingCount: number;
  activeProvider: FreeTierProviderData | null;
  activeGroup: FreeTierGroup | null;
}

const NAME_COLLATOR = new Intl.Collator(undefined, { sensitivity: "base" });

export function buildFreeTierCapsMap(
  freeProvidersList: FreeTierProviderData[]
): Map<string, ModelCapabilities> {
  const map = new Map<string, ModelCapabilities>();
  for (const item of freeProvidersList) {
    for (const m of item.freeModels) {
      map.set(m.comboModelValue, getCapabilitiesForModel(item.provider.id, m.id));
    }
  }
  return map;
}

function matchesModality(
  caps: ModelCapabilities,
  modalityFilter: FreeTierModalityFilter
): boolean {
  if (modalityFilter === "vision") return Boolean(caps.vision);
  if (modalityFilter === "reasoning") {
    return Boolean(
      caps.reasoning ||
        (caps as unknown as Record<string, unknown>).thinking ||
        caps.thinkingFormat
    );
  }
  return true;
}

function matchesCandidateQuery(
  query: string,
  modelName: string,
  modelId: string,
  comboModelValue: string,
  providerName: string,
  providerId: string,
  groupName?: string
): boolean {
  if (!query.trim()) return true;
  const searchTarget = `${modelName} ${modelId} ${comboModelValue} ${providerName} ${providerId} ${groupName || ""}`;
  return matchesModelQuery(searchTarget, query);
}

export interface FilterFreeTierWorkspaceParams {
  freeProvidersList: FreeTierProviderData[];
  groups: FreeTierGroup[];
  groupMode: FreeTierGroupMode;
  searchQuery: string;
  onlyConnected: boolean;
  onlyMultiProvider: boolean;
  modalityFilter: FreeTierModalityFilter;
  activeScopeId: string;
  selectedSet: Set<string>;
  capsMap: Map<string, ModelCapabilities>;
}

export function filterFreeTierWorkspace(
  params: FilterFreeTierWorkspaceParams
): FreeTierWorkspaceResult {
  const {
    freeProvidersList,
    groups,
    groupMode,
    searchQuery,
    onlyConnected,
    onlyMultiProvider,
    modalityFilter,
    activeScopeId,
    selectedSet,
    capsMap,
  } = params;

  const q = searchQuery.trim().toLowerCase();

  if (groupMode === "provider") {
    const railItems: FreeTierRailItem[] = [];
    const visibleCandidates: FreeTierCandidateItem[] = [];
    let totalMatchingCount = 0;
    let activeProvider: FreeTierProviderData | null = null;

    // Providers are already sorted in useFreeTierProviders (connected first, then alphabetical);
    // never re-sort by selectedCount so left rail remains stable on click.
    for (const item of freeProvidersList) {
      if (onlyConnected && item.connectionStatus !== "connected") continue;

      const matchingModels: FreeTierCandidateItem[] = [];
      let selectedCount = 0;

      for (const m of item.freeModels) {
        const caps = capsMap.get(m.comboModelValue) || getCapabilitiesForModel(item.provider.id, m.id);
        if (!matchesModality(caps, modalityFilter)) continue;
        if (
          !matchesCandidateQuery(
            q,
            m.name,
            m.id,
            m.comboModelValue,
            item.provider.name,
            item.provider.id
          )
        ) {
          continue;
        }

        if (selectedSet.has(m.comboModelValue)) selectedCount++;
        matchingModels.push({
          comboModelValue: m.comboModelValue,
          modelId: m.id,
          modelName: m.name,
          contextLength: m.contextLength,
          limit: m.limit,
          caps,
          providerId: item.provider.id,
          providerName: item.provider.name,
          providerColor: item.provider.color,
          providerIconBg: item.provider.iconBg,
          providerImage: item.provider.image,
          connectionStatus: item.connectionStatus,
          statusLabel: item.statusLabel,
          statusDetail: item.statusDetail,
          latencyMs: item.testResult?.latencyMs,
        });
      }

      if (matchingModels.length === 0) continue;

      totalMatchingCount += matchingModels.length;
      if (activeScopeId === item.provider.id) {
        activeProvider = item;
      }

      railItems.push({
        id: item.provider.id,
        name: item.provider.name,
        subLabel: item.statusLabel,
        image: item.provider.image,
        color: item.provider.color,
        iconBg: item.provider.iconBg,
        connectionStatus: item.connectionStatus,
        totalCount: matchingModels.length,
        selectedCount,
        limitType: item.freeTier.limitType,
      });

      if (activeScopeId === "all" || activeScopeId === item.provider.id) {
        visibleCandidates.push(...matchingModels);
      }
    }

    if (activeScopeId === "all") {
      visibleCandidates.sort((a, b) => NAME_COLLATOR.compare(a.modelName, b.modelName));
    }

    return {
      railItems,
      visibleCandidates,
      totalMatchingCount,
      activeProvider,
      activeGroup: null,
    };
  }

  // Group Mode ("model" or "series")
  const railItems: FreeTierRailItem[] = [];
  const visibleCandidates: FreeTierCandidateItem[] = [];
  let totalMatchingCount = 0;
  let activeGroup: FreeTierGroup | null = null;

  for (const grp of groups) {
    if (groupMode === "model" && onlyMultiProvider) {
      const uniqueProviders = new Set(grp.candidates.map((c) => c.provider.id));
      if (uniqueProviders.size < 2) continue;
    }

    const matchingCandidates: FreeTierCandidateItem[] = [];
    let selectedCount = 0;
    const uniqueMatchedProviders = new Set<string>();
    const connectedMatchedProviders = new Set<string>();

    for (const c of grp.candidates) {
      if (onlyConnected && c.connectionStatus !== "connected") continue;

      const caps =
        capsMap.get(c.model.comboModelValue) ||
        getCapabilitiesForModel(c.provider.id, c.model.id);
      if (!matchesModality(caps, modalityFilter)) continue;

      if (
        !matchesCandidateQuery(
          q,
          c.model.name,
          c.model.id,
          c.model.comboModelValue,
          c.provider.name,
          c.provider.id,
          grp.name
        )
      ) {
        continue;
      }

      uniqueMatchedProviders.add(c.provider.id);
      if (c.connectionStatus === "connected") {
        connectedMatchedProviders.add(c.provider.id);
      }
      if (selectedSet.has(c.model.comboModelValue)) selectedCount++;

      matchingCandidates.push({
        comboModelValue: c.model.comboModelValue,
        modelId: c.model.id,
        modelName: c.model.name,
        contextLength: c.model.contextLength,
        limit: c.model.limit,
        caps,
        providerId: c.provider.id,
        providerName: c.provider.name,
        providerColor: c.provider.color,
        providerIconBg: c.provider.iconBg,
        providerImage: c.provider.image,
        connectionStatus: c.connectionStatus,
        statusLabel: c.statusLabel,
        statusDetail: c.statusDetail,
        latencyMs: c.latencyMs,
        groupId: grp.id,
        groupName: grp.name,
      });
    }

    if (matchingCandidates.length === 0) continue;

    totalMatchingCount += matchingCandidates.length;
    if (activeScopeId === grp.id) {
      activeGroup = grp;
    }

    railItems.push({
      id: grp.id,
      name: grp.name,
      totalCount: matchingCandidates.length,
      selectedCount,
      uniqueProvidersCount: uniqueMatchedProviders.size,
      connectedProvidersCount: connectedMatchedProviders.size,
    });

    if (activeScopeId === "all" || activeScopeId === grp.id) {
      visibleCandidates.push(...matchingCandidates);
    }
  }

  return {
    railItems,
    visibleCandidates,
    totalMatchingCount,
    activeProvider: null,
    activeGroup,
  };
}
