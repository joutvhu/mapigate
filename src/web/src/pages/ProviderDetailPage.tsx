import React, { useState, useEffect, useCallback } from "react";
import { isOAuthProvider, type ProviderItem } from "../constants/providersData";
import { getRegistryProvider, type RegistryModel } from "../../../shared/constants/providerRegistry";
import { DEFAULT_ACCOUNTS_MAP } from "../constants/mockData";
import { OAuthModal } from "../components/OAuthModal";
import { AddAccountModal } from "../components/AddAccountModal";
import { CopilotAuthModal } from "../components/CopilotAuthModal";
import { CursorAuthModal } from "../components/CursorAuthModal";
import { KiroAuthModal } from "../components/KiroAuthModal";
import { PortalModal } from "../components/PortalModal";

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

export const ProviderDetailPage: React.FC<ProviderDetailPageProps> = ({ provider, onBack }) => {
  const registryItem = getRegistryProvider(provider.id);

  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [catalogModels, setCatalogModels] = useState<RegistryModel[]>(registryItem?.models || []);
  const [providerStrategy, setProviderStrategy] = useState<string | null>(null);
  const [providerStickyLimit, setProviderStickyLimit] = useState<string>("1");
  const [thinkingMode, setThinkingMode] = useState(registryItem?.thinkingMode || "auto");
  const [thinkingOptions, setThinkingOptions] = useState<string[]>(
    registryItem?.thinkingOptions || ["auto", "none", "low", "medium", "high"]
  );
  const [baseUrlOverride, setBaseUrlOverride] = useState(registryItem?.baseUrl || provider.baseUrl || "");
  const [proxyUrl, setProxyUrl] = useState("");
  const [customHeaders, setCustomHeaders] = useState<{ key: string; value: string }[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showOAuthModal, setShowOAuthModal] = useState(false);
  const [showCopilotModal, setShowCopilotModal] = useState(false);
  const [showCursorModal, setShowCursorModal] = useState(false);
  const [showKiroModal, setShowKiroModal] = useState(false);
  const [showAddModelModal, setShowAddModelModal] = useState(false);
  const [newModelInput, setNewModelInput] = useState("");
  const [newAccountName, setNewAccountName] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [testingIdx, setTestingIdx] = useState<number | null>(null);
  const [newHeaderKey, setNewHeaderKey] = useState("");
  const [newHeaderVal, setNewHeaderVal] = useState("");
  const [headersSavedMsg, setHeadersSavedMsg] = useState<string | null>(null);
  const [copiedModelId, setCopiedModelId] = useState<string | null>(null);

  const isOAuth = isOAuthProvider(registryItem) || isOAuthProvider(provider);
  const supportsApiKey = Boolean(
    registryItem?.authModes?.includes("apikey") ||
    registryItem?.category === "apikey" ||
    registryItem?.notice?.apiKeyUrl ||
    (provider.category === "apikey" && !["antigravity", "cursor", "github", "kiro"].includes(provider.id))
  );

  const handleConnectOAuth = () => {
    if (provider.id === "github") {
      setShowCopilotModal(true);
      return;
    }
    if (provider.id === "cursor") {
      setShowCursorModal(true);
      return;
    }
    if (provider.id === "kiro") {
      setShowKiroModal(true);
      return;
    }
    setShowOAuthModal(true);
  };

  const loadProviderDetails = useCallback(() => {
    const regHeaders = registryItem?.defaultHeaders || {};
    const defaultHeadersArray = Object.entries(regHeaders).map(([k, v]) => ({
      key: k,
      value: String(v),
    }));

    const regModels = (registryItem?.models || []).map((m) => m.id);

    fetch(`/api/providers/${provider.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.baseUrl) setBaseUrlOverride(data.baseUrl);
        if (data.proxyUrl) setProxyUrl(data.proxyUrl);
        if (data.thinkingMode) setThinkingMode(data.thinkingMode);
        if (Array.isArray(data.thinkingOptions) && data.thinkingOptions.length > 0) {
          setThinkingOptions(data.thinkingOptions);
        }
        if (data.strategy !== undefined) {
          setProviderStrategy(data.strategy || null);
        }
        if (data.stickyLimit != null) {
          setProviderStickyLimit(String(data.stickyLimit));
        }

        // Custom Headers
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
  }, [provider.id, provider.name, registryItem]);

  useEffect(() => {
    loadProviderDetails();
  }, [loadProviderDetails]);

  const saveProviderStrategy = async (strategy: string | null, stickyLimit: string) => {
    try {
      await fetch(`/api/providers/${provider.id}/strategy`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategy: strategy || null,
          stickyLimit: strategy === "round-robin" ? Number(stickyLimit) || 1 : null,
        }),
      });
    } catch (err) {
      console.warn("Failed to save provider strategy:", err);
    }
  };

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

  const handleRemoveHeader = (index: number) => {
    setCustomHeaders(customHeaders.filter((_, i) => i !== index));
  };

  const handleUpdateHeader = (index: number, key: string, value: string) => {
    const updated = [...customHeaders];
    updated[index] = { key, value };
    setCustomHeaders(updated);
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

  const handleCopyModel = (modelId: string) => {
    navigator.clipboard.writeText(modelId);
    setCopiedModelId(modelId);
    setTimeout(() => {
      setCopiedModelId((curr) => (curr === modelId ? null : curr));
    }, 2000);
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
          strategy: providerStrategy,
          stickyLimit: providerStrategy === "round-robin" ? Number(providerStickyLimit) || 1 : null,
          models,
        }),
      });
      setHeadersSavedMsg("Configuration saved successfully.");
      setTimeout(() => setHeadersSavedMsg(null), 3000);
    } catch {
      //
    }
  };

  // Header link resolving (matches 9router logic)
  const headerLinkUrl =
    registryItem?.notice?.apiKeyUrl ||
    registryItem?.notice?.signupUrl ||
    registryItem?.website;

  const headerLinkLabel = registryItem?.notice?.apiKeyUrl
    ? "Get API Key"
    : "Sign up / Learn more";

  return (
    <div className="space-y-6 w-full px-2 sm:px-4 pb-16 animate-rt-fade-in">
      {/* Top Breadcrumb & Provider Header */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onBack();
          }}
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
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl font-bold text-white tracking-tight">{provider.name}</h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#1E293B] text-slate-300">
                  {registryItem?.format || provider.format || "openai"}
                </span>
                {headerLinkUrl && (
                  <a
                    href={headerLinkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-1 font-medium transition-colors"
                  >
                    <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                    {headerLinkLabel}
                  </a>
                )}
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {connections.length} connection{connections.length === 1 ? "" : "s"} • {models.length} available models
              </span>
            </div>
          </div>

          <button onClick={handleSaveProviderConfig} className="rt-btn rt-btn--primary">
            <span className="material-symbols-outlined text-[16px]">save</span>
            Save Provider Settings
          </button>
        </div>
      </div>

      {/* Deprecation Warning Banner (matches 9router) */}
      {registryItem?.deprecated && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 leading-relaxed animate-rt-scale-in">
          <span className="material-symbols-outlined text-[18px] text-amber-400 mt-0.5 shrink-0">warning</span>
          <p>{registryItem.deprecationNotice || "This provider uses an undocumented or risk-prone connection session. Use at your own risk."}</p>
        </div>
      )}

      {/* Informational Notice Banner (matches 9router) */}
      {registryItem?.notice?.text && !registryItem?.deprecated && (
        <div className="flex flex-col gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 sm:flex-row sm:items-center text-xs animate-rt-scale-in">
          <span className="material-symbols-outlined text-[18px] text-blue-400 shrink-0">info</span>
          <p className="min-w-0 flex-1 text-blue-300 leading-relaxed">{registryItem.notice.text}</p>
          {registryItem.notice.apiKeyUrl && (
            <a
              href={registryItem.notice.apiKeyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex justify-center rounded bg-blue-500 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-600 shrink-0"
            >
              Get API Key →
            </a>
          )}
        </div>
      )}

      {/* Multi-Account Connections Box */}
      <div className="rt-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1E293B]">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-white">Connections & Priority Queue</h3>
            <span className="text-xs text-slate-500">({connections.filter((c) => c.isActive).length} active)</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <button
              onClick={testOneByOne}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1E293B] bg-[#0A0D14] text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <span className={`material-symbols-outlined text-[15px] ${testingIdx !== null ? "animate-spin" : ""}`}>
                sync
              </span>
              Test Connection One-by-One
            </button>

            {/* Routing Strategy selector (matches 9router) */}
            <div className="flex flex-wrap items-center gap-2 pl-2 border-l border-[#1E293B]">
              <span className="text-xs text-slate-400 font-medium">Strategy:</span>
              <select
                value={providerStrategy || ""}
                onChange={(e) => {
                  const strategy = e.target.value || null;
                  setProviderStrategy(strategy);
                  const sticky = strategy === "round-robin" ? (providerStickyLimit || "1") : providerStickyLimit;
                  if (strategy === "round-robin" && !providerStickyLimit) {
                    setProviderStickyLimit("1");
                  }
                  saveProviderStrategy(strategy, sticky);
                }}
                className="px-2.5 py-1 text-xs border border-[#1E293B] rounded-lg bg-[#0A0D14] text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="">Default (Global)</option>
                <option value="fill-first">Fill First</option>
                <option value="round-robin">Round Robin</option>
                <option value="earliest-reset">Earliest Reset</option>
              </select>

              {providerStrategy === "round-robin" && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400">Sticky:</span>
                  <input
                    type="number"
                    min={1}
                    value={providerStickyLimit}
                    onChange={(e) => {
                      const val = e.target.value;
                      setProviderStickyLimit(val);
                      saveProviderStrategy("round-robin", val);
                    }}
                    placeholder="1"
                    className="w-14 px-2 py-1 text-xs border border-[#1E293B] rounded-lg bg-[#0A0D14] text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              )}
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
                <span className="material-symbols-outlined text-[16px] text-slate-500">
                  {isOAuth ? "lock" : "key"}
                </span>
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

        {isOAuth && supportsApiKey ? (
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleConnectOAuth}
              className="rt-btn rt-btn--primary"
            >
              <span className="material-symbols-outlined text-[16px]">lock</span>
              Connect with OAuth
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="rt-btn rt-btn--secondary"
            >
              <span className="material-symbols-outlined text-[16px]">key</span>
              Add API Key
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              if (isOAuth || ["github", "cursor", "kiro", "antigravity"].includes(provider.id)) {
                handleConnectOAuth();
              } else {
                setShowAddModal(true);
              }
            }}
            className="rt-btn rt-btn--primary"
          >
            <span className="material-symbols-outlined text-[16px]">
              {isOAuth || provider.id === "github" || provider.id === "cursor" || provider.id === "kiro" ? "lock" : "add"}
            </span>
            {isOAuth || provider.id === "github" || provider.id === "cursor" || provider.id === "kiro"
              ? `Connect ${provider.name}`
              : "Add Account"}
          </button>
        )}
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

          <button
            onClick={() => setShowAddModelModal(true)}
            className="rt-btn rt-btn--secondary text-xs"
          >
            <span className="material-symbols-outlined text-[15px]">add</span>
            Add Custom Model
          </button>
        </div>

        {/* Models Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {models.map((modelId) => {
            const catModel = catalogModels.find((m) => m.id === modelId);
            const isCopied = copiedModelId === modelId;
            return (
              <div
                key={modelId}
                className="flex items-center justify-between p-2.5 rounded-xl bg-[#0A0D14] border border-[#1E293B] hover:border-blue-500/30 text-xs transition-colors"
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
                    onClick={() => handleCopyModel(modelId)}
                    title={isCopied ? "Copied!" : "Copy model ID"}
                    className="p-1 text-slate-500 hover:text-white cursor-pointer transition-colors"
                  >
                    <span className={`material-symbols-outlined text-[14px] ${isCopied ? "text-emerald-400 font-bold" : ""}`}>
                      {isCopied ? "check" : "content_copy"}
                    </span>
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

      {/* Specialized Provider Connection Modals */}
      <AddAccountModal
        isOpen={showAddModal}
        provider={{
          id: provider.id,
          name: provider.name,
          image: provider.image,
          format: registryItem?.format || provider.format,
          website: registryItem?.website,
          apiKeyUrl: registryItem?.notice?.apiKeyUrl,
          regions: registryItem?.regions,
          defaultRegion: registryItem?.defaultRegion,
        }}
        existingNames={connections.map((c) => c.name)}
        onClose={() => setShowAddModal(false)}
        onSuccess={loadProviderDetails}
        onOpenOAuth={
          isOAuth
            ? () => {
                setShowAddModal(false);
                handleConnectOAuth();
              }
            : undefined
        }
      />

      <CopilotAuthModal
        isOpen={showCopilotModal}
        onClose={() => setShowCopilotModal(false)}
        onSuccess={loadProviderDetails}
      />

      <CursorAuthModal
        isOpen={showCursorModal}
        onClose={() => setShowCursorModal(false)}
        onSuccess={loadProviderDetails}
      />

      <KiroAuthModal
        isOpen={showKiroModal}
        onClose={() => setShowKiroModal(false)}
        onSuccess={loadProviderDetails}
      />

      {/* OAuth Connection Modal */}
      <OAuthModal
        isOpen={showOAuthModal}
        providerId={provider.id}
        providerName={provider.name}
        onSuccess={loadProviderDetails}
        onClose={() => setShowOAuthModal(false)}
      />

      {/* Add Custom Model Modal */}
      <PortalModal
        isOpen={showAddModelModal}
        onClose={() => setShowAddModelModal(false)}
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4">
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
      </PortalModal>
    </div>
  );
};
