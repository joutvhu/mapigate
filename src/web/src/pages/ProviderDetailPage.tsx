import React, { useState, useEffect } from "react";
import type { ProviderItem } from "../constants/providersData";
import { getRegistryProvider, type RegistryModel } from "../../../shared/constants/providerRegistry";

interface ProviderDetailPageProps {
  provider: ProviderItem;
  onBack: () => void;
}

interface ConnectionItem {
  id: string;
  name: string;
  isActive: boolean;
  order: number;
}

const DEFAULT_ACCOUNTS_MAP: Record<string, string[]> = {
  antigravity: [
    "loveme05ye@gmail.com",
    "joutvhu@gmail.com",
    "hovangiao16@gmail.com",
    "cssdbcy561@gmail.com",
    "hothixa53@gmail.com",
    "anhoang0907@gmail.com",
    "izxenet.kytog@gmail.com",
  ],
  github: ["Joutvhu", "joutvhu-work"],
  claude: ["Personal Pro Account"],
  openai: ["Main Team Key"],
};

export const ProviderDetailPage: React.FC<ProviderDetailPageProps> = ({ provider, onBack }) => {
  const registryItem = getRegistryProvider(provider.id);

  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [catalogModels, setCatalogModels] = useState<RegistryModel[]>(registryItem?.models || []);
  const [roundRobin, setRoundRobin] = useState(true);
  const [thinkingMode, setThinkingMode] = useState(registryItem?.thinkingMode || "auto");
  const [thinkingOptions, setThinkingOptions] = useState<string[]>(
    registryItem?.thinkingOptions || ["auto", "none", "low", "medium", "high"]
  );
  const [baseUrlOverride, setBaseUrlOverride] = useState(registryItem?.baseUrl || provider.baseUrl || "");
  const [proxyUrl, setProxyUrl] = useState("");
  const [customHeaders, setCustomHeaders] = useState<{ key: string; value: string }[]>([]);
  const [showHeadersSection, setShowHeadersSection] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddModelModal, setShowAddModelModal] = useState(false);
  const [newModelInput, setNewModelInput] = useState("");
  const [newAccountName, setNewAccountName] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [testingIdx, setTestingIdx] = useState<number | null>(null);
  const [newHeaderKey, setNewHeaderKey] = useState("");
  const [newHeaderVal, setNewHeaderVal] = useState("");
  const [headersSavedMsg, setHeadersSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    const regHeaders = registryItem?.defaultHeaders || {};
    const defaultHeadersArray = Object.entries(regHeaders).map(([k, v]) => ({
      key: k,
      value: String(v),
    }));

    const regModels = (registryItem?.models || []).map((m) => m.id);

    // Fetch real details from backend if exists
    fetch(`/api/providers/${provider.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.baseUrl) setBaseUrlOverride(data.baseUrl);
        if (data.proxyUrl) setProxyUrl(data.proxyUrl);
        if (data.thinkingMode) setThinkingMode(data.thinkingMode);
        if (Array.isArray(data.thinkingOptions) && data.thinkingOptions.length > 0) {
          setThinkingOptions(data.thinkingOptions);
        }

        // Custom Headers: initialize with backend saved headers if non-empty, otherwise registry defaults
        if (data.customHeaders && Object.keys(data.customHeaders).length > 0) {
          setCustomHeaders(
            Object.entries(data.customHeaders).map(([k, v]) => ({ key: k, value: String(v) }))
          );
        } else {
          setCustomHeaders(defaultHeadersArray);
        }

        // Catalog Models & Available Models
        if (Array.isArray(data.catalogModels) && data.catalogModels.length > 0) {
          setCatalogModels(data.catalogModels);
        }

        if (Array.isArray(data.models) && data.models.length > 0) {
          setModels(data.models);
        } else {
          setModels(regModels);
        }

        if (data.accounts && data.accounts.length > 0) {
          setConnections(
            data.accounts.map((a: any, i: number) => ({
              id: a.id,
              name: a.name,
              isActive: a.isActive,
              order: i,
            }))
          );
        } else {
          const seed = DEFAULT_ACCOUNTS_MAP[provider.id] || [`Primary Account (${provider.name})`];
          setConnections(
            seed.map((name, i) => ({
              id: `conn-${i}`,
              name,
              isActive: i < 5,
              order: i,
            }))
          );
        }
      })
      .catch(() => {
        // Fallback to exact registry defaults
        setCustomHeaders(defaultHeadersArray);
        setModels(regModels);
        const seed = DEFAULT_ACCOUNTS_MAP[provider.id] || [`Primary Account (${provider.name})`];
        setConnections(
          seed.map((name, i) => ({
            id: `conn-${i}`,
            name,
            isActive: i < 5,
            order: i,
          }))
        );
      });
  }, [provider.id, provider.name]);

  const toggleConnection = async (id: string) => {
    const updated = connections.map((c) => (c.id === id ? { ...c, isActive: !c.isActive } : c));
    setConnections(updated);
    try {
      await fetch(`/api/providers/${provider.id}/accounts/${id}/toggle`, { method: "PUT" });
    } catch {
      //
    }
  };

  const moveConnection = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === connections.length - 1) return;
    const target = direction === "up" ? index - 1 : index + 1;
    const copy = [...connections];
    const temp = copy[index];
    copy[index] = copy[target];
    copy[target] = temp;
    setConnections(copy);

    fetch(`/api/providers/${provider.id}/accounts/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountIds: copy.map((c) => c.id) }),
    }).catch(() => {});
  };

  const handleAddAccount = async () => {
    if (!newAccountName) return;
    try {
      const res = await fetch(`/api/providers/${provider.id}/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newAccountName,
          apiKey: newApiKey || "sk-dummy-key",
        }),
      });
      const data = await res.json();
      setConnections([
        ...connections,
        {
          id: data.id || `conn-${Date.now()}`,
          name: newAccountName,
          isActive: true,
          order: connections.length,
        },
      ]);
    } catch {
      setConnections([
        ...connections,
        {
          id: `conn-${Date.now()}`,
          name: newAccountName,
          isActive: true,
          order: connections.length,
        },
      ]);
    } finally {
      setNewAccountName("");
      setNewApiKey("");
      setShowAddModal(false);
    }
  };

  const handleDeleteAccount = (id: string) => {
    setConnections(connections.filter((c) => c.id !== id));
    fetch(`/api/providers/${provider.id}/accounts/${id}`, { method: "DELETE" }).catch(() => {});
  };

  const testOneByOne = async () => {
    for (let i = 0; i < connections.length; i++) {
      setTestingIdx(i);
      await new Promise((r) => setTimeout(r, 600));
    }
    setTestingIdx(null);
  };

  const handleAddHeader = () => {
    if (!newHeaderKey.trim()) return;
    setCustomHeaders([
      ...customHeaders,
      { key: newHeaderKey.trim(), value: newHeaderVal.trim() },
    ]);
    setNewHeaderKey("");
    setNewHeaderVal("");
  };

  const handleUpdateHeader = (index: number, key: string, value: string) => {
    const updated = [...customHeaders];
    updated[index] = { key, value };
    setCustomHeaders(updated);
  };

  const handleRemoveHeader = (index: number) => {
    setCustomHeaders(customHeaders.filter((_, i) => i !== index));
  };

  const handleResetHeaders = () => {
    const regHeaders = registryItem?.defaultHeaders || {};
    const defaultHeadersArray = Object.entries(regHeaders).map(([k, v]) => ({
      key: k,
      value: String(v),
    }));
    setCustomHeaders(defaultHeadersArray);
    setHeadersSavedMsg("Reset to provider default headers.");
    setTimeout(() => setHeadersSavedMsg(null), 3000);
  };

  const handleAddCustomModel = () => {
    if (!newModelInput.trim()) return;
    const m = newModelInput.trim();
    if (!models.includes(m)) {
      setModels([...models, m]);
    }
    setNewModelInput("");
    setShowAddModelModal(false);
  };

  const handleRemoveModel = (modelId: string) => {
    setModels(models.filter((m) => m !== modelId));
  };

  const handleSaveProviderConfig = async () => {
    const headersObj: Record<string, string> = {};
    customHeaders.forEach((h) => {
      if (h.key.trim()) {
        headersObj[h.key.trim()] = h.value.trim();
      }
    });

    try {
      await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: provider.id,
          name: provider.name,
          baseUrl: baseUrlOverride || provider.baseUrl || registryItem?.baseUrl || "https://api.openai.com",
          format: provider.format || registryItem?.format || "openai",
          customHeaders: headersObj,
          proxyUrl: proxyUrl.trim() || undefined,
          thinkingMode,
          models,
        }),
      });
      setHeadersSavedMsg("Configuration saved successfully.");
      setTimeout(() => setHeadersSavedMsg(null), 3000);
    } catch {
      //
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16 animate-rt-fade-in">
      {/* Top Breadcrumb & Provider Header */}
      <div className="space-y-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-blue-400 transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Back to Providers
        </button>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="size-12 rounded-2xl bg-[#0D1322] border border-[#1E293B] p-2.5 flex items-center justify-center">
              <img src={provider.image} alt={provider.name} className="size-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white tracking-tight">{provider.name}</h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#1E293B] text-slate-300">
                  {registryItem?.format || provider.format || "openai"}
                </span>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {connections.length} connections • {models.length} available models
              </span>
            </div>
          </div>

          <button onClick={handleSaveProviderConfig} className="rt-btn rt-btn--primary">
            <span className="material-symbols-outlined text-[16px]">save</span>
            Save Provider Settings
          </button>
        </div>
      </div>

      {/* Risk Notice Banner */}
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 leading-relaxed">
        <span className="material-symbols-outlined text-[18px] text-amber-400 shrink-0">warning</span>
        <p>
          ⚠️ <strong>Active Proxy Routing:</strong> Requests matching this provider are dynamically load-balanced across active keys. Keys are decrypted in memory only when sending requests upstream.
        </p>
      </div>

      {/* Multi-Account Connections Box */}
      <div className="rt-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1E293B]">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-white">Connections & Priority Queue</h3>
            <span className="text-xs text-slate-500">({connections.filter((c) => c.isActive).length} active)</span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <button
              onClick={testOneByOne}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1E293B] bg-[#0A0D14] text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <span className={`material-symbols-outlined text-[15px] ${testingIdx !== null ? "animate-spin" : ""}`}>
                sync
              </span>
              Test Connection One-by-One
            </button>

            <div className="flex items-center gap-2 pl-2 border-l border-[#1E293B]">
              <span className="text-slate-400">Round Robin</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={roundRobin}
                  onChange={(e) => setRoundRobin(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-8 h-4.5 bg-[#1E293B] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-600" />
              </label>
            </div>
          </div>
        </div>

        {/* List of Accounts */}
        <div className="space-y-2">
          {connections.map((conn, idx) => (
            <div
              key={conn.id}
              className="flex items-center justify-between p-3 rounded-xl bg-[#0A0D14] border border-[#1E293B] hover:border-blue-500/30 transition-all text-xs"
            >
              <div className="flex items-center gap-3 min-w-0">
                <input type="checkbox" className="accent-blue-600 rounded" />
                <div className="flex flex-col text-slate-500">
                  <button
                    onClick={() => moveConnection(idx, "up")}
                    disabled={idx === 0}
                    className="hover:text-white disabled:opacity-30 leading-none cursor-pointer"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveConnection(idx, "down")}
                    disabled={idx === connections.length - 1}
                    className="hover:text-white disabled:opacity-30 leading-none cursor-pointer"
                  >
                    ▼
                  </button>
                </div>
                <span className="material-symbols-outlined text-[16px] text-slate-500">lock</span>
                <span className="font-mono text-slate-200 truncate font-medium">{conn.name}</span>
                <span className={`rt-badge ${conn.isActive ? "rt-badge--success" : "rt-badge--muted"}`}>
                  {conn.isActive ? "● active" : "disabled"} • #{idx + 1}
                </span>
                {testingIdx === idx && (
                  <span className="text-[10px] text-blue-400 animate-pulse font-mono">Testing upstream...</span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  title="Delete account"
                  onClick={() => handleDeleteAccount(conn.id)}
                  className="p-1 text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
                <label className="relative inline-flex items-center cursor-pointer ml-1">
                  <input
                    type="checkbox"
                    checked={conn.isActive}
                    onChange={() => toggleConnection(conn.id)}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4.5 bg-[#1E293B] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-600" />
                </label>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="rt-btn rt-btn--primary"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          Add Account
        </button>
      </div>

      {/* Custom Headers UI Section */}
      <div className="rt-card p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-400 text-[20px]">tune</span>
            <div>
              <h3 className="text-sm font-bold text-white">Custom Upstream Request Headers</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Headers forwarded to {provider.name}. Initialized with exact 9router defaults.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleResetHeaders}
              className="rt-btn rt-btn--secondary text-xs"
              title="Reset headers to provider default registry settings"
            >
              <span className="material-symbols-outlined text-[15px]">restart_alt</span>
              Reset
            </button>
            <button
              onClick={handleSaveProviderConfig}
              className="rt-btn rt-btn--primary text-xs"
              title="Save headers"
            >
              <span className="material-symbols-outlined text-[15px]">save</span>
              Save
            </button>
          </div>
        </div>

        {headersSavedMsg && (
          <div className="text-[11px] text-emerald-400 font-mono flex items-center gap-1.5 animate-rt-scale-in">
            <span className="material-symbols-outlined text-[15px]">check_circle</span>
            {headersSavedMsg}
          </div>
        )}

        {/* Existing Custom Headers Table/List */}
        <div className="space-y-2">
          {customHeaders.length === 0 ? (
            <div className="text-xs text-slate-500 italic p-3 rounded-xl bg-[#0A0D14] border border-[#1E293B]">
              No custom headers configured for this provider. Add one below or click Reset to restore defaults.
            </div>
          ) : (
            <div className="space-y-2">
              {customHeaders.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={h.key}
                    onChange={(e) => handleUpdateHeader(i, e.target.value, h.value)}
                    className="w-1/3 bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-blue-400 font-mono focus:outline-none focus:border-blue-500"
                    placeholder="Header Key"
                  />
                  <input
                    type="text"
                    value={h.value}
                    onChange={(e) => handleUpdateHeader(i, h.key, e.target.value)}
                    className="flex-1 bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                    placeholder="Header Value"
                  />
                  <button
                    onClick={() => handleRemoveHeader(i)}
                    className="p-2 text-slate-500 hover:text-red-400 transition-colors cursor-pointer rounded-lg hover:bg-red-500/10"
                    title="Delete header"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add New Header Row */}
          <div className="flex items-center gap-2 pt-2">
            <input
              type="text"
              placeholder="Key (e.g. User-Agent or Anthropic-Beta)"
              value={newHeaderKey}
              onChange={(e) => setNewHeaderKey(e.target.value)}
              className="w-1/3 bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
            />
            <input
              type="text"
              placeholder="Value"
              value={newHeaderVal}
              onChange={(e) => setNewHeaderVal(e.target.value)}
              className="flex-1 bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleAddHeader}
              className="rt-btn rt-btn--secondary text-xs shrink-0"
            >
              <span className="material-symbols-outlined text-[15px]">add</span>
              + add header
            </button>
          </div>
        </div>

        {/* Outbound Proxy */}
        <div className="pt-3 border-t border-[#1E293B]">
          <label className="block text-slate-400 font-semibold mb-1 text-xs">
            Outbound HTTP / SOCKS5 Proxy (Optional)
          </label>
          <input
            type="text"
            placeholder="http://127.0.0.1:7890 or socks5://127.0.0.1:1080"
            value={proxyUrl}
            onChange={(e) => setProxyUrl(e.target.value)}
            className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Available Models Section */}
      <div className="rt-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1E293B]">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-white">Available Models</h3>
            <span className="text-xs text-slate-500 font-mono">({models.length} active)</span>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 ml-2">
              <span>Thinking / Reasoning:</span>
              <select
                value={thinkingMode}
                onChange={(e) => setThinkingMode(e.target.value)}
                className="bg-[#0A0D14] border border-[#1E293B] rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none font-mono"
              >
                {thinkingOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddModelModal(true)}
              className="rt-btn rt-btn--secondary text-xs"
            >
              <span className="material-symbols-outlined text-[15px]">add</span>
              Add Custom Model
            </button>
            <button
              onClick={() => setModels([])}
              className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg bg-[#0A0D14] border border-[#1E293B] cursor-pointer"
            >
              Disable All
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {models.map((modelId, idx) => {
            const catModel = catalogModels.find((m) => m.id === modelId);
            return (
              <div
                key={idx}
                className="p-3 rounded-xl bg-[#0A0D14] border border-[#1E293B] flex items-center justify-between gap-2 text-xs hover:border-blue-500/30 transition-all"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="material-symbols-outlined text-[16px] text-blue-400 shrink-0">smart_toy</span>
                  <div className="truncate">
                    <span className="font-mono text-slate-200 truncate block">{modelId}</span>
                    {catModel && catModel.name && catModel.name !== modelId && (
                      <span className="text-[10px] text-slate-500 truncate block">{catModel.name}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => navigator.clipboard.writeText(modelId)}
                    title="Copy model ID"
                    className="p-1 text-slate-500 hover:text-white cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">content_copy</span>
                  </button>
                  <button
                    onClick={() => handleRemoveModel(modelId)}
                    title="Remove model"
                    className="p-1 text-slate-500 hover:text-red-400 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Account Modal */}
      {showAddModal && (
        <div className="rt-modal-backdrop">
          <div className="rt-modal-content space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
              <h4 className="text-sm font-bold text-white">Add Account for {provider.name}</h4>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Account Label</label>
                <input
                  type="text"
                  placeholder="e.g. Work Key #3"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">API Key / Token</label>
                <input
                  type="password"
                  placeholder="sk-..."
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#1E293B]">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-xs text-slate-400 cursor-pointer">
                Cancel
              </button>
              <button onClick={handleAddAccount} className="rt-btn rt-btn--primary">
                Save Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Model Modal */}
      {showAddModelModal && (
        <div className="rt-modal-backdrop">
          <div className="rt-modal-content space-y-4">
            <h4 className="text-sm font-bold text-white">Add Custom Model</h4>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Model Identifier</label>
              <input
                type="text"
                placeholder="e.g. custom-gpt-oss or claude-3-7-sonnet"
                value={newModelInput}
                onChange={(e) => setNewModelInput(e.target.value)}
                className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#1E293B]">
              <button onClick={() => setShowAddModelModal(false)} className="px-4 py-2 text-xs text-slate-400 cursor-pointer">
                Cancel
              </button>
              <button onClick={handleAddCustomModel} className="rt-btn rt-btn--primary">
                Add Model
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
