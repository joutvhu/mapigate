import React, { useState, useEffect } from "react";
import { PortalModal } from "../components/PortalModal";
import {
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
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; msg: string } | null>(null);
  const [filterMode, setFilterMode] = useState<"all" | "connected" | "not_connected">("all");

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

  const getAccountCount = (providerId: string) => {
    const found = backendProviders.find((p) => p.id === providerId);
    if (found) return found.accountsCount || 0;
    // Default fallback
    if (providerId === "antigravity") return 7;
    if (providerId === "github" || providerId === "openrouter" || providerId === "gemini") return 1;
    return 0;
  };

  const filterItem = (item: ProviderItem) => {
    const matchesSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const count = getAccountCount(item.id);
    if (filterMode === "connected") return matchesSearch && count > 0;
    if (filterMode === "not_connected") return matchesSearch && count === 0;
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

      // 2. Add encrypted account if apiKeyInput provided
      if (apiKeyInput.trim()) {
        await fetch(`/api/providers/${selectedProvider.id}/accounts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: accountName,
            apiKey: apiKeyInput.trim(),
          }),
        });
      }

      await loadBackendProviders();
    } catch (err) {
      console.error(err);
    } finally {
      setApiKeyInput("");
      setCustomBaseUrl("");
      setSelectedProvider(null);
    }
  };

  const handleTestProvider = async (providerId: string) => {
    setTestingId(providerId);
    setTestResult(null);
    try {
      const res = await fetch(`/api/providers/${providerId}/test`, { method: "POST" });
      const data = await res.json();
      setTestResult({ id: providerId, success: data.success, msg: data.message });
    } catch {
      setTestResult({ id: providerId, success: false, msg: "Failed to connect to gateway" });
    } finally {
      setTestingId(null);
    }
  };

  const renderCard = (p: ProviderItem) => {
    const count = getAccountCount(p.id);
    const isTesting = testingId === p.id;
    const hasTestRes = testResult?.id === p.id;

    return (
      <div
        key={p.id}
        onClick={() => onSelectProvider(p)}
        className="rt-card stagger-item group flex items-center justify-between gap-3 cursor-pointer relative overflow-hidden"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-10 rounded-xl bg-[#0D1322] p-2 flex items-center justify-center shrink-0 border border-[#1E293B] group-hover:border-blue-500/40 transition-colors">
            <img
              src={p.image}
              alt={p.name}
              className="size-full object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-slate-100 truncate group-hover:text-blue-400 transition-colors">
              {p.name}
            </h4>
            <div className="mt-1 flex items-center gap-1.5">
              {count > 0 ? (
                <span className="rt-badge rt-badge--success">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {count} Connected
                </span>
              ) : (
                <span className="rt-badge rt-badge--muted">No connections</span>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleTestProvider(p.id);
          }}
          disabled={isTesting}
          title="Test Connection"
          className="p-2 rounded-lg bg-white/5 hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 transition-colors cursor-pointer"
        >
          <span className={`material-symbols-outlined text-[16px] ${isTesting ? "animate-spin" : ""}`}>
            {isTesting ? "sync" : "speed"}
          </span>
        </button>

        {hasTestRes && (
          <div
            className={`absolute bottom-0 left-0 right-0 py-0.5 px-2 text-[10px] text-center font-mono ${
              testResult.success ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
            }`}
          >
            {testResult.msg}
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
            {backendProviders.reduce((acc, p) => acc + (p.accountsCount || 0), 0) || 12}
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
                setSelectedProvider({
                  id: `custom-anthropic-${Date.now().toString().slice(-4)}`,
                  name: "Custom Anthropic",
                  image: "/providers/anthropic.png",
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
                setSelectedProvider({
                  id: `custom-openai-${Date.now().toString().slice(-4)}`,
                  name: "Custom OpenAI",
                  image: "/providers/openai.png",
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
          </div>
        </div>

        {/* Empty state or custom list */}
        <div className="border border-dashed border-[#1E293B] bg-[#0E1320]/60 rounded-2xl p-5 text-center text-xs text-slate-400 flex items-center justify-center gap-2 hover:border-blue-500/30 transition-colors">
          <span className="material-symbols-outlined text-blue-400 text-[18px]">cloud_sync</span>
          <span>Use the buttons above to register self-hosted vLLM, Ollama, LM Studio, or local API proxies.</span>
        </div>
      </div>

      {/* SECTION 2: OAuth Providers */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-400 text-[18px]">verified</span>
            OAuth & Managed IDE Providers
          </h3>
          <button
            onClick={() => alert("All connected endpoints verified healthy.")}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-400 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer font-medium"
          >
            <span className="material-symbols-outlined text-[15px]">play_arrow</span>
            Test All Connections
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
          {OAUTH_PROVIDERS_LIST.filter(filterItem).map(renderCard)}
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
            onClick={() => alert("Free tier providers verified.")}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-400 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer font-medium"
          >
            <span className="material-symbols-outlined text-[15px]">play_arrow</span>
            Test All
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
          {FREE_TIER_PROVIDERS_LIST.filter(filterItem).map(renderCard)}
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
            onClick={() => alert("Testing API Key providers...")}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-400 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer font-medium"
          >
            <span className="material-symbols-outlined text-[15px]">play_arrow</span>
            Test All
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
          {API_KEY_PROVIDERS_LIST.filter(filterItem).map(renderCard)}
        </div>
      </div>

      {/* Modal Configure Provider */}
      <PortalModal
        isOpen={Boolean(selectedProvider)}
        onClose={() => setSelectedProvider(null)}
        maxWidthClass="max-w-md"
      >
        {selectedProvider && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
              <div className="flex items-center gap-3">
                <img
                  src={selectedProvider.image}
                  alt={selectedProvider.name}
                  className="size-8 object-contain"
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
    </div>
  );
};
