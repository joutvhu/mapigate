import React, { useState, useEffect, useCallback } from "react";
import { isOAuthProvider, type ProviderItem } from "../constants/providersData";
import { getRegistryProvider, type RegistryModel } from "../../../shared/constants/providerRegistry";
import { OAuthModal } from "../components/OAuthModal";
import { AddAccountModal } from "../components/AddAccountModal";
import { CopilotAuthModal } from "../components/CopilotAuthModal";
import { CursorAuthModal } from "../components/CursorAuthModal";
import { KiroAuthModal } from "../components/KiroAuthModal";
import { PortalModal } from "../components/PortalModal";
import { Select } from "../components/Select";
import { ScanModelsModal } from "../components/ScanModelsModal";
import { ToolIcon } from "../components/ui/ToolIcon";
import { invalidateAvailableModelsCache } from "../components/ModelAutocompleteInput.js";
import { ConfirmModal } from "../components/ConfirmModal.js";
import { EditAccountModal, type EditAccountData } from "../components/EditAccountModal.js";

interface ProviderDetailPageProps {
  provider: ProviderItem;
  onBack: () => void;
}

interface ConnectionItem {
  id: string;
  name: string;
  isActive: boolean;
  order: number;
  providerSpecificData?: Record<string, any>;
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
  const [showScanModal, setShowScanModal] = useState(false);
  const [newModelInput, setNewModelInput] = useState("");
  const [testingIdx, setTestingIdx] = useState<number | null>(null);
  const [testingAccountId, setTestingAccountId] = useState<string | null>(null);
  const [accountTestResults, setAccountTestResults] = useState<Record<string, { success: boolean; message: string; latencyMs?: number }>>({});
  const [isTestingProvider, setIsTestingProvider] = useState<boolean>(false);
  const [isTestingOneByOne, setIsTestingOneByOne] = useState<boolean>(false);
  const [providerTestResult, setProviderTestResult] = useState<{ success: boolean; message: string; latencyMs?: number } | null>(null);
  const [newHeaderKey, setNewHeaderKey] = useState("");
  const [newHeaderVal, setNewHeaderVal] = useState("");
  const [headersSavedMsg, setHeadersSavedMsg] = useState<string | null>(null);
  const [copiedModelId, setCopiedModelId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingAccount, setEditingAccount] = useState<EditAccountData | null>(null);

  const isCustomProvider = provider.category === "custom" || !registryItem;

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
        const customObj = data.userCustomHeaders !== undefined ? data.userCustomHeaders : (data.customHeaders || {});
        if (customObj && Object.keys(customObj).length > 0) {
          setCustomHeaders(
            Object.entries(customObj).map(([k, v]) => ({ key: k, value: String(v) }))
          );
        } else {
          setCustomHeaders([]);
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
              order: a.sortOrder ?? i,
              providerSpecificData: a.providerSpecificData,
            }))
          );
        } else {
          setConnections([]);
        }
        invalidateAvailableModelsCache();
      })
      .catch(() => {
        setCustomHeaders(defaultHeadersArray);
        setModels(regModels);
        setConnections([]);
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
      invalidateAvailableModelsCache();
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
    const reordered = copy.map((c, i) => ({ ...c, order: i }));
    setConnections(reordered);

    fetch(`/api/providers/${provider.id}/accounts/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountIds: reordered.map((c) => c.id) }),
    })
      .then((res) => {
        if (!res.ok) {
          console.error("Failed to reorder accounts:", res.status);
        }
        invalidateAvailableModelsCache();
      })
      .catch((err) => {
        console.error("Failed to reorder accounts:", err);
      });
  };

  const handleDeleteAccount = (id: string) => {
    setConnections(connections.filter((c) => c.id !== id));
    fetch(`/api/providers/${provider.id}/accounts/${id}`, { method: "DELETE" })
      .then(() => invalidateAvailableModelsCache())
      .catch(() => {});
  };

  const handleEditAccount = (conn: ConnectionItem) => {
    setEditingAccount({
      id: conn.id,
      providerId: provider.id,
      name: conn.name,
      isActive: conn.isActive,
      providerSpecificData: conn.providerSpecificData,
    });
  };

  const handleSaveAccount = async (updates: {
    name: string;
    apiKey?: string;
    isActive: boolean;
    providerSpecificData?: Record<string, any>;
  }) => {
    if (!editingAccount) return;
    const res = await fetch(`/api/providers/${provider.id}/accounts/${editingAccount.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to update account.");
    }
    loadProviderDetails();
    invalidateAvailableModelsCache();
  };

  const testAccount = async (conn: ConnectionItem, idx?: number) => {
    if (idx !== undefined) setTestingIdx(idx);
    setTestingAccountId(conn.id);
    try {
      const res = await fetch(`/api/providers/${provider.id}/accounts/${conn.id}/test`, { method: "POST" });
      const data = await res.json();
      setAccountTestResults((prev) => ({
        ...prev,
        [conn.id]: {
          success: Boolean(data.success),
          message: data.message || (data.success ? "Connection verified" : "Connection failed"),
          latencyMs: data.latencyMs,
        },
      }));
    } catch (err: any) {
      setAccountTestResults((prev) => ({
        ...prev,
        [conn.id]: {
          success: false,
          message: err.message || "Failed to reach gateway",
        },
      }));
    } finally {
      if (idx !== undefined) setTestingIdx(null);
      setTestingAccountId(null);
    }
  };

  const testOneByOne = async () => {
    if (isTestingOneByOne || connections.length === 0) return;
    setIsTestingOneByOne(true);
    try {
      for (let i = 0; i < connections.length; i++) {
        const conn = connections[i];
        await testAccount(conn, i);
      }
    } finally {
      setTestingIdx(null);
      setIsTestingOneByOne(false);
    }
  };

  const handleTestProvider = async () => {
    setIsTestingProvider(true);
    setProviderTestResult(null);
    try {
      const res = await fetch(`/api/providers/${provider.id}/test`, { method: "POST" });
      const data = await res.json();
      setProviderTestResult({
        success: Boolean(data.success),
        message: data.message || (data.success ? "Connection successful!" : "Connection failed."),
        latencyMs: data.latencyMs,
      });
    } catch (err: any) {
      setProviderTestResult({
        success: false,
        message: `Error testing connection: ${err.message}`,
      });
    } finally {
      setIsTestingProvider(false);
    }
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
    setCustomHeaders([]);
    setHeadersSavedMsg("Reset custom headers. Using system defaults.");
    setTimeout(() => setHeadersSavedMsg(null), 3000);
  };

  const handleCustomizeDefaultHeader = (key: string, defaultValue: string) => {
    const existingIndex = customHeaders.findIndex(
      (h) => h.key.trim().toLowerCase() === key.toLowerCase()
    );
    if (existingIndex >= 0) {
      return;
    }
    setCustomHeaders([...customHeaders, { key, value: defaultValue }]);
  };

  const handleRevertDefaultHeader = (key: string) => {
    setCustomHeaders(
      customHeaders.filter((h) => h.key.trim().toLowerCase() !== key.toLowerCase())
    );
  };

  const handleDisableDefaultHeader = (key: string) => {
    // Setting value to "" marks it as explicitly disabled/omitted from requests
    const filtered = customHeaders.filter(
      (h) => h.key.trim().toLowerCase() !== key.toLowerCase()
    );
    setCustomHeaders([...filtered, { key, value: "" }]);
  };

  const handleEnableDefaultHeader = (key: string) => {
    // Removing the "" override restores the default header value
    setCustomHeaders(
      customHeaders.filter((h) => h.key.trim().toLowerCase() !== key.toLowerCase())
    );
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

  const handleApplyScannedModels = async (selectedModelIds: string[], mode: "merge" | "replace") => {
    let nextModels: string[];
    if (mode === "replace") {
      nextModels = selectedModelIds;
    } else {
      const existingSet = new Set(models);
      const toAdd = selectedModelIds.filter((m) => !existingSet.has(m));
      nextModels = [...models, ...toAdd];
    }
    setModels(nextModels);

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
          models: nextModels,
        }),
      });
      setHeadersSavedMsg(`Saved ${nextModels.length} models for ${provider.name}.`);
      invalidateAvailableModelsCache();
      setTimeout(() => setHeadersSavedMsg(null), 3000);
    } catch {
      // Fail-open
    }
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
      invalidateAvailableModelsCache();
      setTimeout(() => setHeadersSavedMsg(null), 3000);
    } catch {
      //
    }
  };

  const handleDeleteProvider = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/providers/${provider.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        invalidateAvailableModelsCache();
        onBack();
      }
    } catch {
      // Fail-open
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
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
            <ToolIcon
              src={provider.image}
              name={provider.name}
              color={registryItem?.color || provider.color}
              iconBg={registryItem?.iconBg || provider.iconBg}
              size="lg"
            />
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

          <div className="flex items-center gap-2">
            <button
              onClick={handleTestProvider}
              disabled={isTestingProvider}
              className="rt-btn rt-btn--secondary hover:border-blue-500/50"
              title="Test connection with upstream provider"
            >
              <span className={`material-symbols-outlined text-[16px] ${isTestingProvider ? "animate-spin text-blue-400" : ""}`}>
                {isTestingProvider ? "sync" : "speed"}
              </span>
              {isTestingProvider ? "Testing..." : "Test Connection"}
            </button>
            <button onClick={handleSaveProviderConfig} className="rt-btn rt-btn--primary">
              <span className="material-symbols-outlined text-[16px]">save</span>
              Save Provider Settings
            </button>
          </div>
        </div>
      </div>

      {/* Provider Test Result Banner */}
      {providerTestResult && (
        <div
          className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border text-xs font-mono animate-rt-scale-in ${
            providerTestResult.success
              ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
              : "bg-red-500/10 text-red-300 border-red-500/30"
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[16px] shrink-0">
              {providerTestResult.success ? "check_circle" : "error"}
            </span>
            <span className="truncate">{providerTestResult.message}</span>
          </div>
          {providerTestResult.latencyMs && (
            <span className="shrink-0 font-bold opacity-80">{providerTestResult.latencyMs}ms</span>
          )}
        </div>
      )}

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

      {/* Zero-Auth Free / Local Provider Banner */}
      {(provider.id === "opencode" || (registryItem as any)?.noAuth || (registryItem as any)?.requiresApiKey === false || (registryItem as any)?.authType === "none" || (registryItem as any)?.isLocal) && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 animate-rt-scale-in">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[20px] text-emerald-400 shrink-0">check_circle</span>
            <div>
              <p className="font-semibold text-white">
                {(registryItem as any)?.isLocal ? "Local Provider (No Paid Key Required)" : "No Authentication Required (100% Free)"}
              </p>
              <p className="text-slate-400 mt-0.5">
                {(registryItem as any)?.isLocal
                  ? `${provider.name} runs directly on your local device without external API tokens.`
                  : `${provider.name} is ready to use immediately without an account or API key.`}
              </p>
            </div>
          </div>
          <button
            onClick={handleTestProvider}
            disabled={isTestingProvider}
            className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-[15px] ${isTestingProvider ? "animate-spin" : ""}`}>
              {isTestingProvider ? "sync" : "speed"}
            </span>
            {isTestingProvider ? "Testing..." : "Test Connection"}
          </button>
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
              disabled={isTestingOneByOne || testingIdx !== null || connections.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1E293B] bg-[#0A0D14] text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
            >
              <span className={`material-symbols-outlined text-[15px] ${isTestingOneByOne || testingIdx !== null ? "animate-spin text-blue-400" : ""}`}>
                sync
              </span>
              {isTestingOneByOne ? "Testing..." : "Test Connection One-by-One"}
            </button>

            {/* Routing Strategy selector (matches 9router) */}
            <div className="flex flex-wrap items-center gap-2 pl-2 border-l border-[#1E293B]">
              <span className="text-xs text-slate-400 font-medium">Strategy:</span>
              <Select
                value={providerStrategy || ""}
                onChange={(val) => {
                  const strategy = val || null;
                  setProviderStrategy(strategy);
                  const sticky = strategy === "round-robin" ? (providerStickyLimit || "1") : providerStickyLimit;
                  if (strategy === "round-robin" && !providerStickyLimit) {
                    setProviderStickyLimit("1");
                  }
                  saveProviderStrategy(strategy, sticky);
                }}
                options={[
                  { value: "", label: "Default (Global)" },
                  { value: "fill-first", label: "Fill First" },
                  { value: "sequential", label: "Sequential (Drain)" },
                  { value: "round-robin", label: "Round Robin" },
                  { value: "earliest-reset", label: "Earliest Reset" },
                ]}
                className="w-40"
              />

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
        {connections.length === 0 ? (
          <div className="w-full py-10 px-4 text-center text-slate-400 flex flex-col items-center justify-center gap-2.5 bg-[#0A0D14] rounded-xl border border-dashed border-[#1E293B]">
            <span className="material-symbols-outlined text-3xl text-slate-600">
              {isOAuth ? "vpn_key_off" : "key_off"}
            </span>
            <p className="text-sm font-semibold text-slate-300">
              No accounts connected for {provider.name}
            </p>
            <p className="text-xs text-slate-500 max-w-sm">
              {isOAuth
                ? `Connect your ${provider.name} account via OAuth or add credentials to start routing.`
                : `Add an API key or credentials to start routing requests through ${provider.name}.`}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {connections.map((conn, idx) => {
              const testRes = accountTestResults[conn.id];
              const isAccountTesting = testingIdx === idx || testingAccountId === conn.id;

              return (
                <div
                  key={conn.id}
                  className="flex flex-col gap-2 p-3 rounded-xl bg-[#0A0D14] border border-[#1E293B] hover:border-blue-500/30 transition-all text-xs"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
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
                      {isAccountTesting && (
                        <span className="text-[10px] text-blue-400 animate-pulse font-mono">Testing upstream...</span>
                      )}
                      {testRes && !isAccountTesting && (
                        <span
                          className={`rt-badge text-[10px] ${
                            testRes.success
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-red-500/10 text-red-400 border border-red-500/20"
                          }`}
                          title={testRes.message}
                        >
                          {testRes.success
                            ? `● ${testRes.latencyMs ? `${testRes.latencyMs}ms` : "Active"}`
                            : "● Failed"}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        title="Test this connection"
                        onClick={() => testAccount(conn, idx)}
                        disabled={testingIdx !== null || isAccountTesting}
                        className="p-1 text-slate-500 hover:text-blue-400 transition-colors cursor-pointer disabled:opacity-40"
                      >
                        <span className={`material-symbols-outlined text-[16px] ${isAccountTesting ? "animate-spin text-blue-400" : ""}`}>
                          {isAccountTesting ? "sync" : "speed"}
                        </span>
                      </button>
                      <button
                        title="Edit account"
                        onClick={() => handleEditAccount(conn)}
                        className="p-1 text-slate-500 hover:text-blue-400 transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                      </button>
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

                  {testRes && (
                    <div
                      className={`w-full py-1 px-2.5 text-[10px] font-mono rounded-lg border truncate ${
                        testRes.success
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-red-500/10 text-red-400 border-red-500/20"
                      }`}
                      title={testRes.message}
                    >
                      {testRes.success ? `✓ ${testRes.message}` : `✗ ${testRes.message}`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

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
              <h3 className="text-sm font-bold text-white">Upstream Request Headers</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Headers forwarded to {provider.name}. System defaults are managed automatically and combined with your custom overrides.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleResetHeaders}
              className="rt-btn rt-btn--secondary text-xs"
              title="Reset custom headers and use system defaults"
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

        {/* System Default Headers Display */}
        {registryItem?.defaultHeaders && Object.keys(registryItem.defaultHeaders).length > 0 && (
          <div className="p-3.5 rounded-xl bg-[#0A0D14] border border-[#1E293B] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <span className="material-symbols-outlined text-[16px] text-emerald-400">verified</span>
                <span>System Default Headers</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Auto-updated on release
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-mono">Managed by Mapigate</span>
            </div>
            <p className="text-[11px] text-slate-400">
              These headers automatically update with new Mapigate releases. If upstream changes before an official update, click Customize to edit and override it immediately.
            </p>
            <div className="space-y-1.5 pt-1">
              {Object.entries(registryItem.defaultHeaders).map(([k, v]) => {
                const customEntry = customHeaders.find((h) => h.key.trim().toLowerCase() === k.toLowerCase());
                const isDisabled = customEntry !== undefined && customEntry.value === "";
                const isOverridden = customEntry !== undefined && customEntry.value !== "";

                return (
                  <div key={k} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#0F141C] border border-[#1E293B]/60 text-xs font-mono">
                    <div className="flex items-center gap-2 truncate pr-2">
                      <span className={isDisabled ? "text-slate-600 line-through" : "text-blue-400 font-semibold"}>
                        {k}
                      </span>
                      <span className="text-slate-600">:</span>
                      <span className={isDisabled || isOverridden ? "text-slate-500 line-through truncate" : "text-slate-300 truncate"}>
                        {v}
                      </span>
                      {isOverridden && (
                        <span className="text-amber-300 font-semibold truncate">
                          → {customEntry?.value}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isDisabled ? (
                        <>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-sans font-semibold">
                            Disabled / Omitted
                          </span>
                          <button
                            type="button"
                            onClick={() => handleEnableDefaultHeader(k)}
                            className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors cursor-pointer"
                            title="Re-enable this default header"
                          >
                            <span className="material-symbols-outlined text-[13px]">check_circle</span>
                            Enable
                          </button>
                        </>
                      ) : isOverridden ? (
                        <>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-sans font-semibold">
                            Overridden
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRevertDefaultHeader(k)}
                            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white px-2 py-1 rounded bg-[#1E293B] hover:bg-[#2A374A] transition-colors cursor-pointer"
                            title="Revert to system default value"
                          >
                            <span className="material-symbols-outlined text-[13px]">undo</span>
                            Revert
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleCustomizeDefaultHeader(k, v)}
                            className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 px-2 py-1 rounded bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 transition-colors cursor-pointer"
                            title="Override or adjust this default header value"
                          >
                            <span className="material-symbols-outlined text-[13px]">edit</span>
                            Customize
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDisableDefaultHeader(k)}
                            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-rose-400 px-2 py-1 rounded hover:bg-rose-500/10 transition-colors cursor-pointer"
                            title="Disable/remove this default header from outgoing requests"
                          >
                            <span className="material-symbols-outlined text-[13px]">block</span>
                            Disable
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Custom Header Overrides Title */}
        <div className="pt-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-1">
            <span className="material-symbols-outlined text-[16px] text-blue-400">tune</span>
            <span>Custom Header Overrides & Additions</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Add custom headers or override/disable default headers. These values take precedence over system defaults.
          </p>
        </div>

        {/* Existing Custom Headers Table/List */}
        <div className="space-y-2">
          {customHeaders.length === 0 ? (
            <div className="text-xs text-slate-500 italic p-3 rounded-xl bg-[#0A0D14] border border-[#1E293B]">
              No custom header overrides configured. Outgoing requests will use the system default headers above. Click &quot;Customize&quot; on any default header or add a new header below.
            </div>
          ) : (
            <div className="space-y-2">
              {customHeaders.map((h, i) => {
                const isDefaultKey = Boolean(
                  registryItem?.defaultHeaders &&
                  Object.keys(registryItem.defaultHeaders).some((k) => k.toLowerCase() === h.key.trim().toLowerCase())
                );
                const isDisabledOverride = h.value === "";
                return (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-1/3 relative">
                      <input
                        type="text"
                        value={h.key}
                        onChange={(e) => handleUpdateHeader(i, e.target.value, h.value)}
                        className={`w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-blue-500 ${
                          isDisabledOverride ? "text-slate-500 line-through" : "text-blue-400"
                        }`}
                        placeholder="Header Key"
                      />
                      {isDefaultKey && (
                        <span className={`absolute right-2 top-2 text-[10px] font-sans pointer-events-none font-semibold ${
                          isDisabledOverride ? "text-rose-400" : "text-amber-400"
                        }`}>
                          {isDisabledOverride ? "Disabled" : "Override"}
                        </span>
                      )}
                    </div>
                    {isDisabledOverride ? (
                      <div className="flex-1 bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-rose-400/80 italic font-mono flex items-center justify-between">
                        <span>(Disabled — this header will be omitted from outgoing requests)</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveHeader(i)}
                          className="text-[11px] text-emerald-400 hover:text-emerald-300 font-sans not-italic hover:underline cursor-pointer"
                        >
                          Re-enable
                        </button>
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={h.value}
                        onChange={(e) => handleUpdateHeader(i, h.key, e.target.value)}
                        className="flex-1 bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                        placeholder="Header Value"
                      />
                    )}
                    <button
                      onClick={() => handleRemoveHeader(i)}
                      className="p-2 text-slate-500 hover:text-red-400 transition-colors cursor-pointer rounded-lg hover:bg-red-500/10"
                      title={isDisabledOverride ? "Re-enable header" : isDefaultKey ? "Remove override (reverts to default)" : "Delete header"}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {isDisabledOverride ? "undo" : isDefaultKey ? "undo" : "delete"}
                      </span>
                    </button>
                  </div>
                );
              })}
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

        {/* Provider Base URL Override */}
        <div className="pt-3 border-t border-[#1E293B]">
          <div className="flex items-center justify-between mb-1">
            <label className="block text-slate-400 font-semibold text-xs">
              Provider Base URL
            </label>
            {registryItem?.baseUrl && registryItem.baseUrl !== baseUrlOverride && (
              <button
                type="button"
                onClick={() => setBaseUrlOverride(registryItem.baseUrl || "")}
                className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                title="Reset to default Base URL"
              >
                Reset to default ({registryItem.baseUrl})
              </button>
            )}
          </div>
          <input
            type="text"
            placeholder={registryItem?.baseUrl || provider.baseUrl || "https://api.openai.com"}
            value={baseUrlOverride}
            onChange={(e) => setBaseUrlOverride(e.target.value)}
            className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
          />
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
              <Select
                value={thinkingMode}
                onChange={setThinkingMode}
                options={thinkingOptions.map((opt) => ({
                  value: opt,
                  label: opt.toUpperCase(),
                }))}
                className="w-32"
                triggerClassName="font-mono text-xs"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowScanModal(true)}
              className="rt-btn rt-btn--secondary text-xs flex items-center gap-1.5"
              title="Scan models directly from provider API endpoint"
            >
              <span className="material-symbols-outlined text-[15px] text-blue-400">radar</span>
              Scan Models from API
            </button>
            <button
              onClick={() => setShowAddModelModal(true)}
              className="rt-btn rt-btn--secondary text-xs"
            >
              <span className="material-symbols-outlined text-[15px]">add</span>
              Add Custom Model
            </button>
          </div>
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

      {/* Danger Zone / Delete Provider Section (Custom Providers Only) */}
      {isCustomProvider && (
        <div className="rt-card p-5 space-y-3 border border-rose-500/20 bg-rose-500/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-rose-400 flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">warning</span>
                Danger Zone
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Permanently remove this custom provider configuration and all associated accounts/credentials.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              disabled={isDeleting}
              className="rt-btn rt-btn--danger text-xs py-2 px-4 flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">delete</span>
              {isDeleting ? "Deleting..." : "Delete Provider"}
            </button>
          </div>
        </div>
      )}

      {/* Specialized Provider Connection Modals */}
      {showAddModal && (
        <AddAccountModal
          isOpen={showAddModal}
          provider={{
            id: provider.id,
            name: provider.name,
            image: provider.image,
            color: registryItem?.color || provider.color,
            iconBg: registryItem?.iconBg || provider.iconBg,
            format: registryItem?.format || provider.format,
            website: registryItem?.website,
            apiKeyUrl: registryItem?.notice?.apiKeyUrl,
            regions: registryItem?.regions,
            defaultRegion: registryItem?.defaultRegion,
            requiresApiKey: (registryItem as any)?.requiresApiKey,
            authType: (registryItem as any)?.authType,
            isLocal: (registryItem as any)?.isLocal,
            defaultBaseUrl: (registryItem as any)?.defaultBaseUrl || registryItem?.baseUrl,
            noAuth: (registryItem as any)?.noAuth,
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
      )}

      {showCopilotModal && (
        <CopilotAuthModal
          isOpen={showCopilotModal}
          onClose={() => setShowCopilotModal(false)}
          onSuccess={loadProviderDetails}
        />
      )}

      {showCursorModal && (
        <CursorAuthModal
          isOpen={showCursorModal}
          onClose={() => setShowCursorModal(false)}
          onSuccess={loadProviderDetails}
        />
      )}

      {showKiroModal && (
        <KiroAuthModal
          isOpen={showKiroModal}
          onClose={() => setShowKiroModal(false)}
          onSuccess={loadProviderDetails}
        />
      )}

      {/* OAuth Connection Modal */}
      {showOAuthModal && (
        <OAuthModal
          isOpen={showOAuthModal}
          providerId={provider.id}
          providerName={provider.name}
          onSuccess={loadProviderDetails}
          onClose={() => setShowOAuthModal(false)}
        />
      )}

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

      {/* Scan Models from Provider API Modal */}
      <ScanModelsModal
        isOpen={showScanModal}
        provider={{
          id: provider.id,
          name: provider.name,
          baseUrl: baseUrlOverride || provider.baseUrl || registryItem?.baseUrl,
          validateUrl: provider.validateUrl || registryItem?.validateUrl,
          image: provider.image,
          color: registryItem?.color || provider.color,
          iconBg: registryItem?.iconBg || provider.iconBg,
          format: provider.format || registryItem?.format,
        }}
        existingModels={models}
        accountsCount={connections.length}
        onAddAccount={() => {
          setShowScanModal(false);
          if (isOAuth || ["github", "cursor", "kiro", "antigravity"].includes(provider.id)) {
            handleConnectOAuth();
          } else {
            setShowAddModal(true);
          }
        }}
        onClose={() => setShowScanModal(false)}
        onApplyModels={handleApplyScannedModels}
      />

      {/* Edit Account Modal */}
      <EditAccountModal
        isOpen={Boolean(editingAccount)}
        account={editingAccount}
        onClose={() => setEditingAccount(null)}
        onSave={handleSaveAccount}
      />

      {/* Confirm Delete Provider Modal */}
      {isCustomProvider && (
        <ConfirmModal
          isOpen={showDeleteModal}
          title="Delete Provider"
          message={`Are you sure you want to delete custom provider "${provider.name}"? This will permanently remove the provider configuration and all associated accounts/credentials.`}
          confirmText="Delete"
          variant="danger"
          onConfirm={handleDeleteProvider}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  );
};
