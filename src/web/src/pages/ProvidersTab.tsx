import React, { useState, useEffect } from "react";
import { PortalModal } from "../components/PortalModal";
import { ConfirmModal } from "../components/ConfirmModal.js";
import { CommunityCatalogModal } from "../components/CommunityCatalogModal";
import { invalidateAvailableModelsCache } from "../components/ModelAutocompleteInput.js";
import { getRegistryProvider } from "../../../shared/constants/providerRegistry";
import { ToolIcon } from "../components/ui/ToolIcon";
import {
  CODING_PROVIDERS_LIST,
  OAUTH_PROVIDERS_LIST,
  FREE_TIER_PROVIDERS_LIST,
  API_KEY_PROVIDERS_LIST,
  type ProviderItem,
} from "../constants/providersData";

interface ProvidersTabProps {
  searchQuery: string;
  onSelectProvider: (p: ProviderItem) => void;
}

export const ProvidersTab: React.FC<ProvidersTabProps> = ({ searchQuery, onSelectProvider }) => {
  const [selectedProvider, setSelectedProvider] = useState<ProviderItem | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [accountName, setAccountName] = useState("Default Account");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [backendProviders, setBackendProviders] = useState<any[]>([]);
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set());
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; msg: string; latencyMs?: number }>>({});
  const [bulkTestingCategory, setBulkTestingCategory] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<"all" | "connected" | "not_connected">("all");
  const [isCommunityCatalogOpen, setIsCommunityCatalogOpen] = useState(false);
  const [providerToDelete, setProviderToDelete] = useState<ProviderItem | null>(null);
  const [isDeletingProvider, setIsDeletingProvider] = useState(false);

  const loadBackendProviders = async () => {
    try {
      const res = await fetch("/api/providers");
      if (res.ok) {
        const data = await res.json();
        setBackendProviders(data);
      }
    } catch {
      // Offline fallback
    }
  };

  useEffect(() => {
    loadBackendProviders();
  }, []);

  const isStdioBridge = (p: ProviderItem) => {
    const base = p.baseUrl || p.defaultBaseUrl || "";
    return (
      base.startsWith("devin://") ||
      base.startsWith("auggie://") ||
      base.startsWith("zcode://") ||
      (base.includes("://") && base.endsWith("/stdio"))
    );
  };

  const isFreeNoAuth = (p: ProviderItem) => {
    if (isStdioBridge(p)) return false;
    return (
      Boolean(p.noAuth) ||
      p.requiresApiKey === false ||
      p.authType === "none" ||
      p.id === "opencode" ||
      p.id === "oc" ||
      p.id === "ollama-local" ||
      p.id === "lm-studio" ||
      p.id === "jan" ||
      p.id === "local-device"
    );
  };

  const getAccountCount = (providerId: string) => {
    const found = backendProviders.find((p) => p.id === providerId);
    const reg = getRegistryProvider(providerId);
    if (reg && isStdioBridge(reg as any)) {
      return found?.accountsCount ?? 0;
    }
    if (
      providerId === "opencode" ||
      providerId === "oc" ||
      Boolean((found as any)?.noAuth) ||
      Boolean(reg?.noAuth) ||
      reg?.requiresApiKey === false ||
      reg?.authType === "none"
    ) {
      return Math.max(1, found?.accountsCount ?? 0);
    }
    return found?.accountsCount ?? 0;
  };

  const filterItem = (item: ProviderItem) => {
    const matchesSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const count = getAccountCount(item.id);
    if (filterMode === "connected") return matchesSearch && (count > 0 || isFreeNoAuth(item));
    if (filterMode === "not_connected") return matchesSearch && count === 0 && !isFreeNoAuth(item);
    return matchesSearch;
  };

  const handleSaveConnection = async () => {
    if (!selectedProvider) return;

    try {
      // 1. Ensure provider exists in backend
      let existing = backendProviders.find((p) => p.id === selectedProvider.id);
      if (!existing) {
        const createRes = await fetch("/api/providers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: selectedProvider.id,
            name: selectedProvider.name,
            baseUrl: customBaseUrl || selectedProvider.baseUrl || "https://api.openai.com",
            format: selectedProvider.format || "openai",
          }),
        });
        existing = await createRes.json();
      }

      // 2. Add encrypted account if apiKeyInput provided or if noAuth
      if (apiKeyInput.trim() || isFreeNoAuth(selectedProvider)) {
        await fetch(`/api/providers/${selectedProvider.id}/accounts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: accountName || `${selectedProvider.name} Connection`,
            apiKey: apiKeyInput.trim() || (selectedProvider.id === "opencode" || selectedProvider.id === "oc" ? "public" : ""),
          }),
        });
      }

      await loadBackendProviders();
      invalidateAvailableModelsCache();
    } catch (err) {
      console.error(err);
    } finally {
      setApiKeyInput("");
      setAccountName("Default Account");
      setCustomBaseUrl("");
      setSelectedProvider(null);
    }
  };

  const handleTestProvider = async (providerId: string) => {
    setTestingIds((prev) => new Set(prev).add(providerId));
    try {
      const res = await fetch(`/api/providers/${providerId}/test`, { method: "POST" });
      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [providerId]: {
          success: Boolean(data.success),
          msg: data.message || (data.success ? "Connected successfully" : "Connection failed"),
          latencyMs: data.latencyMs,
        },
      }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [providerId]: {
          success: false,
          msg: err.message || "Failed to reach gateway",
        },
      }));
    } finally {
      setTestingIds((prev) => {
        const next = new Set(prev);
        next.delete(providerId);
        return next;
      });
    }
  };

  const handleTestCategory = async (providers: ProviderItem[], categoryName: string) => {
    const toTest = providers.filter((p) => getAccountCount(p.id) > 0 || isFreeNoAuth(p));
    if (toTest.length === 0) {
      alert(`No configured or ready accounts found in ${categoryName}.`);
      return;
    }

    setBulkTestingCategory(categoryName);
    const idsToTest = toTest.map((p) => p.id);
    setTestingIds((prev) => {
      const next = new Set(prev);
      idsToTest.forEach((id) => next.add(id));
      return next;
    });

    try {
      const res = await fetch("/api/providers/test-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerIds: idsToTest }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.results) {
          setTestResults((prev) => {
            const next = { ...prev };
            for (const [id, r] of Object.entries(data.results as Record<string, any>)) {
              next[id] = {
                success: Boolean(r.success),
                msg: r.message || (r.success ? "Connected successfully" : "Connection failed"),
                latencyMs: r.latencyMs,
              };
            }
            return next;
          });
        }
      } else {
        for (const p of toTest) {
          await handleTestProvider(p.id);
        }
      }
    } catch {
      for (const p of toTest) {
        await handleTestProvider(p.id);
      }
    } finally {
      setTestingIds((prev) => {
        const next = new Set(prev);
        idsToTest.forEach((id) => next.delete(id));
        return next;
      });
      setBulkTestingCategory(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!providerToDelete) return;
    setIsDeletingProvider(true);
    try {
      const res = await fetch(`/api/providers/${providerToDelete.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await loadBackendProviders();
        invalidateAvailableModelsCache();
      }
    } catch {
      // Fail-open
    } finally {
      setIsDeletingProvider(false);
      setProviderToDelete(null);
    }
  };

  const builtInIds = new Set(CODING_PROVIDERS_LIST.map((p) => p.id));
  const customOrImportedList: ProviderItem[] = backendProviders
    .filter((bp) => !builtInIds.has(bp.id))
    .map((bp) => {
      const reg = getRegistryProvider(bp.id);
      return {
        id: bp.id,
        name: bp.name,
        image: reg?.image || (bp.format === "anthropic" ? "/assets/providers/anthropic/icon.png" : "/assets/providers/openai/icon.png"),
        color: reg?.color || (bp.format === "anthropic" ? "#D97706" : "#10A37F"),
        iconBg: reg?.iconBg || "#ffffff",
        category: "custom" as const,
        format: bp.format || "openai",
        baseUrl: bp.baseUrl,
        models: bp.models,
        thinkingMode: bp.thinkingMode,
      };
    });

  const renderCard = (p: ProviderItem, canDelete = false) => {
    const isCustom = p.category === "custom" || !builtInIds.has(p.id);
    const allowDelete = Boolean(canDelete) === true && isCustom;
    const count = getAccountCount(p.id);
    const isTesting = testingIds.has(p.id);
    const testRes = testResults[p.id];

    return (
      <div
        key={p.id}
        onClick={() => onSelectProvider(p)}
        className="rt-card stagger-item group flex flex-col justify-between cursor-pointer relative overflow-hidden min-w-[300px] hover:border-blue-500/30 transition-all"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <ToolIcon
              src={p.image}
              name={p.name}
              color={p.color}
              iconBg={p.iconBg}
              size="md"
              className="group-hover:border-blue-500/40 transition-colors shrink-0"
            />
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-slate-100 truncate group-hover:text-blue-400 transition-colors">
                {p.name}
              </h4>
              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                {p.isLocal && (
                  <span className="rt-badge rt-badge--primary text-[10px]">
                    Local
                  </span>
                )}
                {isStdioBridge(p) ? (
                  <span className="rt-badge rt-badge--muted text-[10px]">
                    CLI Bridge
                  </span>
                ) : isFreeNoAuth(p) ? (
                  <span className="rt-badge rt-badge--success">
                    <span className="size-1.5 rounded-full bg-emerald-400" />
                    {p.isLocal ? "Ready (Local)" : "Ready (Free)"}
                  </span>
                ) : count > 0 ? (
                  <span className="rt-badge rt-badge--success">
                    <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {count} Connected
                  </span>
                ) : (
                  <span className="rt-badge rt-badge--muted">No connections</span>
                )}
                {testRes && (
                  <span
                    className={`rt-badge text-[10px] ${
                      testRes.success
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-red-500/10 text-red-400 border border-red-500/20"
                    }`}
                    title={testRes.msg}
                  >
                    {testRes.success
                      ? `● ${testRes.latencyMs ? `${testRes.latencyMs}ms` : "Active"}`
                      : "● Error"}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleTestProvider(p.id);
              }}
              disabled={isTesting}
              title="Test Connection"
              className="p-2 rounded-lg bg-white/5 hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 transition-colors cursor-pointer"
            >
              <span className={`material-symbols-outlined text-[16px] ${isTesting ? "animate-spin text-blue-400" : ""}`}>
                {isTesting ? "sync" : "speed"}
              </span>
            </button>
            {allowDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setProviderToDelete(p);
                }}
                title="Delete Provider"
                className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
              </button>
            )}
          </div>
        </div>

        {testRes && (
          <div
            className={`w-full py-1 px-3 text-[10px] font-mono border-t truncate ${
              testRes.success
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-red-500/10 text-red-400 border-red-500/20"
            }`}
            title={testRes.msg}
          >
            {testRes.success ? `✓ ${testRes.msg}` : `✗ ${testRes.msg}`}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8 w-full px-2 sm:px-4 pb-16 animate-rt-fade-in">
      {/* Top Filter & Metrics Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-[#0F1420]/70 border border-[#1E293B]">
        <div className="flex items-center gap-3 text-xs">
          <span className="font-semibold text-slate-300">Filter Status:</span>
          <div className="flex items-center bg-[#0A0D14] p-1 rounded-xl border border-[#1E293B]">
            <button
              onClick={() => setFilterMode("all")}
              className={`px-3 py-1 rounded-lg transition-colors font-medium ${
                filterMode === "all" ? "bg-blue-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
              }`}
            >
              All Providers
            </button>
            <button
              onClick={() => setFilterMode("connected")}
              className={`px-3 py-1 rounded-lg transition-colors font-medium ${
                filterMode === "connected" ? "bg-blue-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
              }`}
            >
              Connected Only
            </button>
            <button
              onClick={() => setFilterMode("not_connected")}
              className={`px-3 py-1 rounded-lg transition-colors font-medium ${
                filterMode === "not_connected" ? "bg-blue-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
              }`}
            >
              Unconfigured
            </button>
          </div>
        </div>

        <div className="text-xs text-slate-400 font-mono flex items-center gap-2">
          <span>Active Accounts:</span>
          <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold">
            {backendProviders.reduce((acc, p) => acc + (p.accountsCount || 0), 0)}
          </span>
        </div>
      </div>

      {/* SECTION 1: Custom Providers */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-400 text-[18px]">add_circle</span>
            Custom Providers (OpenAI & Anthropic Compatible)
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setApiKeyInput("");
                setAccountName("Default Account");
                setCustomBaseUrl("https://api.anthropic.com");
                setSelectedProvider({
                  id: `custom-anthropic-${Date.now().toString().slice(-4)}`,
                  name: "Custom Anthropic",
                  image: "/assets/providers/anthropic/icon.png",
                  category: "custom",
                  format: "anthropic",
                  baseUrl: "https://api.anthropic.com",
                });
              }}
              className="rt-btn rt-btn--primary"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              Add Anthropic Compatible
            </button>
            <button
              onClick={() => {
                setApiKeyInput("");
                setAccountName("Default Account");
                setCustomBaseUrl("https://api.openai.com");
                setSelectedProvider({
                  id: `custom-openai-${Date.now().toString().slice(-4)}`,
                  name: "Custom OpenAI",
                  image: "/assets/providers/openai/icon.png",
                  category: "custom",
                  format: "openai",
                  baseUrl: "https://api.openai.com",
                });
              }}
              className="rt-btn rt-btn--secondary"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              Add OpenAI Compatible
            </button>
            <button
              onClick={() => setIsCommunityCatalogOpen(true)}
              className="rt-btn rt-btn--secondary hover:border-blue-500/50"
              title="Browse 124 community-curated routers & gateways"
            >
              <span className="material-symbols-outlined text-blue-400 text-[16px]">explore</span>
              Community Catalog
            </button>
          </div>
        </div>

        {/* Custom providers grid or placeholder */}
        {customOrImportedList.filter(filterItem).length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-3">
            {customOrImportedList.filter(filterItem).map((p) => renderCard(p, true))}
          </div>
        ) : (
          <div className="border border-dashed border-[#1E293B] bg-[#0E1320]/60 rounded-2xl p-5 text-center text-xs text-slate-400 flex items-center justify-center gap-2 hover:border-blue-500/30 transition-colors">
            <span className="material-symbols-outlined text-blue-400 text-[18px]">cloud_sync</span>
            <span>
              {customOrImportedList.length > 0
                ? "No custom providers match the current filter."
                : "Use the buttons above to register self-hosted vLLM, Ollama, LM Studio, or local API proxies."}
            </span>
          </div>
        )}
      </div>

      {/* SECTION 2: OAuth Providers */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-400 text-[18px]">verified</span>
            OAuth & Managed IDE Providers
          </h3>
          <button
            onClick={() => handleTestCategory(OAUTH_PROVIDERS_LIST, "OAuth Providers")}
            disabled={bulkTestingCategory === "OAuth Providers"}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-400 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer font-medium disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-[15px] ${bulkTestingCategory === "OAuth Providers" ? "animate-spin text-blue-400" : ""}`}>
              {bulkTestingCategory === "OAuth Providers" ? "sync" : "play_arrow"}
            </span>
            {bulkTestingCategory === "OAuth Providers" ? "Testing..." : "Test All"}
          </button>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-3">
          {OAUTH_PROVIDERS_LIST.filter(filterItem).map((p) => renderCard(p, false))}
        </div>
      </div>

      {/* SECTION 3: Free Tier Providers */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-400 text-[18px]">redeem</span>
            Free Tier & Community Gateways
          </h3>
          <button
            onClick={() => handleTestCategory(FREE_TIER_PROVIDERS_LIST, "Free Tier Providers")}
            disabled={bulkTestingCategory === "Free Tier Providers"}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-400 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer font-medium disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-[15px] ${bulkTestingCategory === "Free Tier Providers" ? "animate-spin text-emerald-400" : ""}`}>
              {bulkTestingCategory === "Free Tier Providers" ? "sync" : "play_arrow"}
            </span>
            {bulkTestingCategory === "Free Tier Providers" ? "Testing..." : "Test All"}
          </button>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-3">
          {FREE_TIER_PROVIDERS_LIST.filter(filterItem).map((p) => renderCard(p, false))}
        </div>
      </div>

      {/* SECTION 4: API Key Providers */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-400 text-[18px]">key</span>
            Direct API Key Providers
          </h3>
          <button
            onClick={() => handleTestCategory(API_KEY_PROVIDERS_LIST, "API Key Providers")}
            disabled={bulkTestingCategory === "API Key Providers"}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-400 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer font-medium disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-[15px] ${bulkTestingCategory === "API Key Providers" ? "animate-spin text-blue-400" : ""}`}>
              {bulkTestingCategory === "API Key Providers" ? "sync" : "play_arrow"}
            </span>
            {bulkTestingCategory === "API Key Providers" ? "Testing..." : "Test All"}
          </button>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-3">
          {API_KEY_PROVIDERS_LIST.filter(filterItem).map((p) => renderCard(p, false))}
        </div>
      </div>

      {/* Modal Configure Provider */}
      <PortalModal
        isOpen={Boolean(selectedProvider)}
        onClose={() => {
          setSelectedProvider(null);
          setApiKeyInput("");
          setAccountName("Default Account");
          setCustomBaseUrl("");
        }}
        maxWidthClass="max-w-md"
      >
        {selectedProvider && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
              <div className="flex items-center gap-3">
                <ToolIcon
                  src={selectedProvider.image}
                  name={selectedProvider.name}
                  color={selectedProvider.color}
                  iconBg={selectedProvider.iconBg}
                  size="sm"
                />
                <div>
                  <h4 className="text-sm font-bold text-white">{selectedProvider.name}</h4>
                  <span className="text-[11px] text-blue-400 font-mono">
                    {selectedProvider.format || "openai"} protocol
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedProvider(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Account Label / Nickname
                </label>
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="e.g. Work Pro Key 1"
                  className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Base URL Override
                </label>
                <input
                  type="text"
                  value={customBaseUrl}
                  onChange={(e) => setCustomBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com"
                  className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  API Key / Secret Token (AES-256-GCM Hardware Encrypted)
                </label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="sk-..."
                  className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                />
              </div>

              <div className="bg-[#0A0D14] p-3 rounded-xl border border-[#1E293B] text-[11px] text-slate-400 flex items-start gap-2.5">
                <span className="material-symbols-outlined text-[16px] text-emerald-400 shrink-0 mt-0.5">
                  enhanced_encryption
                </span>
                <span className="leading-relaxed">
                  Keys are securely locked with your PC's machine ID salt. No cloud upload, no telemetry.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#1E293B]">
              <button
                onClick={() => setSelectedProvider(null)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConnection}
                className="rt-btn rt-btn--primary"
              >
                Save & Connect
              </button>
            </div>
          </div>
        )}
      </PortalModal>

      {/* Modal Community Catalog */}
      <CommunityCatalogModal
        isOpen={isCommunityCatalogOpen}
        existingProviderIds={backendProviders.map((bp) => bp.id)}
        onClose={() => setIsCommunityCatalogOpen(false)}
        onImportSuccess={async () => {
          await loadBackendProviders();
          invalidateAvailableModelsCache();
        }}
      />

      {/* Confirm Delete Provider Modal */}
      <ConfirmModal
        isOpen={Boolean(providerToDelete)}
        title="Delete Provider"
        message={`Are you sure you want to delete "${providerToDelete?.name}"? This will permanently remove the provider configuration and all associated accounts/credentials.`}
        confirmText={isDeletingProvider ? "Deleting..." : "Delete"}
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setProviderToDelete(null)}
      />
    </div>
  );
};
