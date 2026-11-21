import { useState, useEffect, useMemo, useCallback } from "react";
import { PROVIDER_REGISTRY } from "../../../shared/constants/providerRegistry.js";
import {
  isFreeTierProvider,
  resolveFreeModels,
  getProviderConnectionStatus,
  type ConnectionTestResult,
} from "../utils/freeTierHelper.js";

export function useFreeTierProviders(isOpen: boolean) {
  const [backendProviders, setBackendProviders] = useState<any[]>([]);
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set());
  const [testResults, setTestResults] = useState<Record<string, ConnectionTestResult>>({});
  const [isTestingAll, setIsTestingAll] = useState(false);

  const loadBackendProviders = useCallback(async () => {
    try {
      const res = await fetch("/api/providers");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setBackendProviders(data);
      }
    } catch (err) {
      console.error("Failed to load providers:", err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadBackendProviders();
    }
  }, [isOpen, loadBackendProviders]);

  const freeProvidersList = useMemo(() => {
    const list = Object.values(PROVIDER_REGISTRY).filter((p) => {
      if (p.id === "combo" || p.category === "composite") return false;
      return isFreeTierProvider(p);
    });

    const dbMap = new Map(backendProviders.map((bp) => [bp.id, bp]));

    return list.map((provider) => {
      const dbProv = dbMap.get(provider.id);
      const freeTier = provider.freeTier || {
        scope: "all" as const,
        limitType: provider.isLocal ? ("local" as const) : ("requests" as const),
        note: provider.notice?.text,
      };
      const freeModels = resolveFreeModels(provider, dbProv);
      const testRes = testResults[provider.id];
      const conn = getProviderConnectionStatus(provider, dbProv, testRes);

      return {
        provider,
        freeTier,
        freeModels,
        connectionStatus: conn.status,
        statusLabel: conn.label,
        statusDetail: conn.detail,
      };
    });
  }, [backendProviders, testResults]);

  const testConnection = async (providerId: string) => {
    setTestingIds((prev) => new Set(prev).add(providerId));
    try {
      const res = await fetch(`/api/providers/${encodeURIComponent(providerId)}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeoutMs: 7000 }),
      });
      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [providerId]: {
          success: Boolean(data.success),
          message: data.message,
          latencyMs: data.latencyMs,
          error: data.error,
        },
      }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [providerId]: { success: false, error: err.message || "Test failed" },
      }));
    } finally {
      setTestingIds((prev) => {
        const next = new Set(prev);
        next.delete(providerId);
        return next;
      });
    }
  };

  const testAll = async (providerIds: string[]) => {
    setIsTestingAll(true);
    await Promise.allSettled(providerIds.map((id) => testConnection(id)));
    setIsTestingAll(false);
  };

  return {
    freeProvidersList,
    testingIds,
    isTestingAll,
    testConnection,
    testAll,
  };
}
