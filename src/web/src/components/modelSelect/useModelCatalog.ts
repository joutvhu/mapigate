import { useState, useEffect, useMemo } from "react";
import { aggregateComboCapabilities } from "../../../../core/capabilities/index.js";
import {
  getAvailableModelsCached,
  onAvailableModelsCacheInvalidated,
  type AvailableModelItem,
} from "../ModelAutocompleteInput.js";
import { buildModelCatalog } from "./catalogUtils.js";
import type { ComboSummary } from "./types.js";

export interface UseModelCatalogResult {
  combos: ComboSummary[];
  availableModels: AvailableModelItem[];
  connectedProviderIds: Set<string>;
  hasConnectedAccounts: boolean;
  connectedOnly: boolean;
  setConnectedOnly: React.Dispatch<React.SetStateAction<boolean>>;
  catalog: ReturnType<typeof buildModelCatalog>;
}

export function useModelCatalog(
  isOpen: boolean,
  allowCombos: boolean,
  modelAliases: Record<string, string>
): UseModelCatalogResult {
  const [rawCombos, setRawCombos] = useState<ComboSummary[]>([]);
  const [availableModels, setAvailableModels] = useState<AvailableModelItem[]>([]);
  const [connectedOnly, setConnectedOnly] = useState<boolean>(allowCombos !== false);

  // Fetch combos when modal opens
  useEffect(() => {
    if (!isOpen || allowCombos === false) return;
    let isCancelled = false;

    fetch("/api/combos")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!isCancelled) {
          const list = Array.isArray(data) ? data : data.combos || [];
          setRawCombos(list);
        }
      })
      .catch(() => {
        if (!isCancelled) setRawCombos([]);
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, allowCombos]);

  // Pre-compute combo capabilities once when rawCombos changes
  const combos = useMemo<ComboSummary[]>(() => {
    return rawCombos.map((c) => ({
      ...c,
      caps: aggregateComboCapabilities(c.models),
    }));
  }, [rawCombos]);

  // Fetch available models & subscribe to cache invalidations
  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;

    const fetchAvailable = (isInitial = false) => {
      getAvailableModelsCached()
        .then((data) => {
          if (!isCancelled) {
            setAvailableModels(data);
            if (isInitial) {
              const hasConnected = data.some((m) => m.hasConnectedAccount);
              // When picking models for combo creation (allowCombos === false), default to all models
              const defaultConnected = allowCombos === false ? false : hasConnected;
              setConnectedOnly(defaultConnected);
            }
          }
        })
        .catch(() => {});
    };

    fetchAvailable(true);

    const unsubscribe = onAvailableModelsCacheInvalidated(() => {
      if (!isCancelled) {
        fetchAvailable(false);
      }
    });

    return () => {
      isCancelled = true;
      unsubscribe();
    };
  }, [isOpen, allowCombos]);

  const connectedProviderIds = useMemo(() => {
    const set = new Set<string>();
    for (const m of availableModels) {
      if (m.hasConnectedAccount) {
        set.add(m.providerId);
      }
    }
    return set;
  }, [availableModels]);

  const hasConnectedAccounts = connectedProviderIds.size > 0;

  const catalog = useMemo(
    () => buildModelCatalog(availableModels, modelAliases),
    [availableModels, modelAliases]
  );

  return {
    combos,
    availableModels,
    connectedProviderIds,
    hasConnectedAccounts,
    connectedOnly,
    setConnectedOnly,
    catalog,
  };
}
