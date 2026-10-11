import React, { useState, useEffect, useCallback } from "react";
import { Select } from "../components/Select.js";
import { ConfirmModal } from "../components/ConfirmModal.js";
import { PortalModal } from "../components/PortalModal.js";

interface EndpointSettings {
  host: string;
  port: number;
  requireApiKey: boolean;
  proxyUrl?: string;
  customHeaders?: Record<string, string>;
}

interface GatewayApiKey {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
  createdAt: number;
  lastUsedAt?: number;
}

interface HeaderRow {
  id: string;
  key: string;
  value: string;
}

const DEFAULT_SETTINGS: EndpointSettings = {
  host: "127.0.0.1",
  port: 20127,
  requireApiKey: false,
  proxyUrl: "",
  customHeaders: {},
};

export const EndpointTab: React.FC = () => {
  // --- Endpoint Configuration State ---
  const [settings, setSettings] = useState<EndpointSettings>(DEFAULT_SETTINGS);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>([]);

  // --- API Keys State ---
  const [keys, setKeys] = useState<GatewayApiKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [visibleKeyIds, setVisibleKeyIds] = useState<Set<string>>(new Set());
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // --- Modals State ---
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<GatewayApiKey | null>(null);
  const [keyToDelete, setKeyToDelete] = useState<GatewayApiKey | null>(null);

  // --- Connectivity Test State ---
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  // 1. Fetch Endpoint Settings
  const loadSettings = useCallback(async () => {
    try {
      setLoadingSettings(true);
      const res = await fetch("/api/settings/endpoint");
      if (res.ok) {
        const data = await res.json();
        setSettings({
          host: data.host || "127.0.0.1",
          port: data.port || 20127,
          requireApiKey: Boolean(data.requireApiKey),
          proxyUrl: data.proxyUrl || "",
          customHeaders: data.customHeaders || {},
        });
        const rows: HeaderRow[] = Object.entries(data.customHeaders || {}).map(
          ([key, value], idx) => ({
            id: `header-${idx}-${Date.now()}`,
            key,
            value: String(value),
          })
        );
        setHeaderRows(rows);
      }
    } catch (err) {
      console.error("Failed to load endpoint settings:", err);
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  // 2. Fetch Gateway API Keys
  const loadKeys = useCallback(async () => {
    try {
      setLoadingKeys(true);
      const res = await fetch("/api/settings/endpoint/keys");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setKeys(data);
        }
      }
    } catch (err) {
      console.error("Failed to load gateway API keys:", err);
    } finally {
      setLoadingKeys(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadKeys();
  }, [loadSettings, loadKeys]);

  // 3. Save Endpoint Settings
  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingSettings(true);
    setSaveFeedback(null);
    setSaveError(null);

    // Build custom headers object
    const customHeaders: Record<string, string> = {};
    for (const row of headerRows) {
      const k = row.key.trim();
      if (k) {
        customHeaders[k] = row.value.trim();
      }
    }

    try {
      const payload = {
        host: settings.host,
        port: Number(settings.port) || 20127,
        requireApiKey: settings.requireApiKey,
        proxyUrl: settings.proxyUrl?.trim() || "",
        customHeaders,
      };

      const res = await fetch("/api/settings/endpoint", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update endpoint settings");
      }

      const updated = await res.json();
      const socketChanged = updated.host !== settings.host || Number(updated.port) !== Number(settings.port);
      setSettings(updated);
      if (socketChanged) {
        setSaveFeedback("Settings saved! Note: Changes to Host/Port require restarting the Mapigate daemon (mpg stop && mpg start) to rebind the listening socket.");
      } else {
        setSaveFeedback("Settings saved successfully!");
      }
      setTimeout(() => setSaveFeedback(null), 5000);
    } catch (err: any) {
      setSaveError(err?.message || "Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  };

  // 4. API Key Actions
  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreatingKey(true);
      const res = await fetch("/api/settings/endpoint/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() || undefined }),
      });
      if (res.ok) {
        const created = await res.json();
        setKeys((prev) => [created, ...prev]);
        setNewlyCreatedKey(created);
        setNewKeyName("");
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create API key");
      }
    } catch (err) {
      console.error("Error creating key:", err);
    } finally {
      setCreatingKey(false);
    }
  };

  const handleToggleKeyActive = async (keyItem: GatewayApiKey) => {
    try {
      const res = await fetch(`/api/settings/endpoint/keys/${keyItem.id}/toggle`, {
        method: "PATCH",
      });
      if (res.ok) {
        const updated = await res.json();
        setKeys((prev) => prev.map((k) => (k.id === keyItem.id ? updated : k)));
      }
    } catch (err) {
      console.error("Error toggling API key:", err);
    }
  };

  const handleDeleteKey = async () => {
    if (!keyToDelete) return;
    try {
      const res = await fetch(`/api/settings/endpoint/keys/${keyToDelete.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setKeys((prev) => prev.filter((k) => k.id !== keyToDelete.id));
      }
    } catch (err) {
      console.error("Error deleting API key:", err);
    } finally {
      setKeyToDelete(null);
    }
  };

  const toggleKeyVisibility = (id: string) => {
    setVisibleKeyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copy = (val: string, field: string) => {
    navigator.clipboard.writeText(val);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const copyKeyToken = (token: string, id: string) => {
    navigator.clipboard.writeText(token);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  // Header rows helpers
  const addHeaderRow = () => {
    setHeaderRows([
      ...headerRows,
      { id: `header-${Date.now()}`, key: "", value: "" },
    ]);
  };

  const updateHeaderRow = (id: string, field: "key" | "value", val: string) => {
    setHeaderRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: val } : r))
    );
  };

  const removeHeaderRow = (id: string) => {
    setHeaderRows((prev) => prev.filter((r) => r.id !== id));
  };

  // Connectivity Test
  const effectiveHost =
    settings.host === "0.0.0.0" ? "127.0.0.1" : settings.host || "127.0.0.1";
  const effectivePort = settings.port || 20127;
  const openAiBaseUrl = `http://${effectiveHost}:${effectivePort}/v1`;
  const anthropicBaseUrl = `http://${effectiveHost}:${effectivePort}`;

  const runTestCurl = async () => {
    setTesting(true);
    setTestResponse(null);
    try {
      const res = await fetch("/health");
      const data = await res.json();
      setTestResponse(JSON.stringify(data, null, 2));
    } catch {
      setTestResponse(JSON.stringify({ error: "Failed to connect to gateway" }, null, 2));
    } finally {
      setTesting(false);
    }
  };

  const maskKey = (keyStr: string) => {
    if (keyStr.length <= 10) return "••••••••";
    const prefix = keyStr.slice(0, 6);
    const suffix = keyStr.slice(-4);
    return `${prefix}••••••••${suffix}`;
  };

  return (
    <div className="space-y-8 w-full px-2 sm:px-4 pb-16 animate-rt-fade-in">
      {/* CARD 1: Gateway Base URLs & Quick Connectivity Ping */}
      <div className="w-full p-6 rounded-2xl bg-[#0F1420]/80 border border-[#1E293B] space-y-6">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-blue-400">api</span>
            Local Gateway Endpoints
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Universal endpoints accepting OpenAI Chat Completions and Anthropic Messages protocols
          </p>
        </div>

        <div className="space-y-3.5 text-xs font-mono">
          <div className="bg-[#0A0D14] p-4 rounded-xl border border-[#1E293B] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-sans font-semibold">
                OpenAI-Compatible Base URL (Cursor, Cline, OpenCode, Codex)
              </span>
              <span className="text-blue-400 font-bold text-sm">{openAiBaseUrl}</span>
            </div>
            <button
              type="button"
              onClick={() => copy(openAiBaseUrl, "openai")}
              className="px-3.5 py-1.5 rounded-xl bg-[#141B2D] border border-[#1E293B] hover:border-slate-600 text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer self-start sm:self-center font-sans"
            >
              <span className="material-symbols-outlined text-[14px]">
                {copiedField === "openai" ? "check" : "content_copy"}
              </span>
              {copiedField === "openai" ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="bg-[#0A0D14] p-4 rounded-xl border border-[#1E293B] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-sans font-semibold">
                Anthropic Base URL (Claude Code CLI: ANTHROPIC_BASE_URL)
              </span>
              <span className="text-cyan-400 font-bold text-sm">{anthropicBaseUrl}</span>
            </div>
            <button
              type="button"
              onClick={() => copy(anthropicBaseUrl, "anthropic")}
              className="px-3.5 py-1.5 rounded-xl bg-[#141B2D] border border-[#1E293B] hover:border-slate-600 text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer self-start sm:self-center font-sans"
            >
              <span className="material-symbols-outlined text-[14px]">
                {copiedField === "anthropic" ? "check" : "content_copy"}
              </span>
              {copiedField === "anthropic" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        {/* Interactive Ping Test */}
        <div className="pt-2 border-t border-[#1E293B] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 block font-sans">
              Test Gateway Connectivity:
            </span>
            <button
              type="button"
              onClick={runTestCurl}
              disabled={testing}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-600/20 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer font-sans"
            >
              <span className={`material-symbols-outlined text-[15px] ${testing ? "animate-spin" : ""}`}>
                {testing ? "sync" : "play_arrow"}
              </span>
              Execute Test Ping
            </button>
          </div>

          <div className="bg-[#0A0D14] p-3 rounded-xl border border-[#1E293B] text-xs font-mono text-slate-300 overflow-x-auto">
            curl {anthropicBaseUrl}/health
          </div>

          {testResponse && (
            <pre className="bg-[#080B10] p-4 rounded-xl border border-blue-500/30 text-emerald-400 text-xs font-mono overflow-x-auto animate-rt-scale-in">
              {testResponse}
            </pre>
          )}
        </div>
      </div>

      {/* CARD 2: Gateway & Connection Configuration */}
      <div className="w-full p-6 rounded-2xl bg-[#0F1420]/80 border border-[#1E293B] space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-cyan-400">
                tune
              </span>
              Gateway &amp; Connection Configuration
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Configure server listening network interface, listening port, security enforcement, and global upstream proxy.
            </p>
          </div>

          {saveFeedback && (
            <span className="px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium flex items-center gap-1.5 animate-rt-fade-in self-start sm:self-center">
              <span className="material-symbols-outlined text-[15px]">check_circle</span>
              {saveFeedback}
            </span>
          )}

          {saveError && (
            <span className="px-3 py-1 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium flex items-center gap-1.5 self-start sm:self-center">
              <span className="material-symbols-outlined text-[15px]">error</span>
              {saveError}
            </span>
          )}
        </div>

        {loadingSettings ? (
          <div className="py-12 text-center text-slate-400 flex flex-col items-center gap-2">
            <span className="material-symbols-outlined text-2xl text-blue-400 animate-spin">
              progress_activity
            </span>
            <span className="text-xs">Loading configuration...</span>
          </div>
        ) : (
          <form onSubmit={handleSaveSettings} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Host Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  Listening Host Interface
                </label>
                <Select
                  value={settings.host}
                  onChange={(val) => setSettings({ ...settings, host: val })}
                  options={[
                    {
                      value: "127.0.0.1",
                      label: "127.0.0.1 — Localhost only (Recommended, Private)",
                    },
                    {
                      value: "0.0.0.0",
                      label: "0.0.0.0 — All Interfaces (LAN / Network Access)",
                    },
                    {
                      value: "localhost",
                      label: "localhost — Standard local loopback",
                    },
                  ]}
                  className="w-full"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Bind to 127.0.0.1 to isolate Mapigate to this machine, or 0.0.0.0 to expose on your local network.
                </p>
              </div>

              {/* Port Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  Gateway Port
                </label>
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={settings.port}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      port: parseInt(e.target.value, 10) || 20127,
                    })
                  }
                  className="w-full bg-[#0A0D14] border border-[#1E293B] focus:border-blue-500 rounded-xl px-3.5 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none transition-colors"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Default port is 20127. Change requires restarting Mapigate server.
                </p>
              </div>
            </div>

            {/* Require API Key Toggle */}
            <div className="p-4 rounded-xl bg-[#0A0D14] border border-[#1E293B] flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-amber-400">
                    key
                  </span>
                  Require API Key Authentication
                </span>
                <p className="text-[11px] text-slate-400">
                  When enabled, all incoming proxy requests to <code className="font-mono text-slate-300">/v1/*</code> must supply an Authorization header matching an active Gateway Key below.
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={settings.requireApiKey}
                  onChange={(e) =>
                    setSettings({ ...settings, requireApiKey: e.target.checked })
                  }
                  className="sr-only peer"
                />
                <div className="w-10 h-5.5 bg-[#1E293B] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-blue-600" />
              </label>
            </div>

            {/* Upstream Proxy URL Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1.5 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-purple-400">
                  router
                </span>
                Global Upstream Proxy URL (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. http://127.0.0.1:7890 or socks5://127.0.0.1:1080"
                value={settings.proxyUrl || ""}
                onChange={(e) =>
                  setSettings({ ...settings, proxyUrl: e.target.value })
                }
                className="w-full bg-[#0A0D14] border border-[#1E293B] focus:border-blue-500 rounded-xl px-3.5 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none transition-colors"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Egress proxy used for routing outgoing requests to upstream AI model providers. Leave blank for direct connection.
              </p>
            </div>

            {/* Custom Headers Editor */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-semibold text-slate-200">
                    Custom Outbound Headers
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Appended to all outgoing requests to upstream providers
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addHeaderRow}
                  className="px-3 py-1 rounded-lg bg-blue-600/10 border border-blue-500/30 text-blue-400 hover:bg-blue-600/20 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px]">add</span>
                  Add Header
                </button>
              </div>

              {headerRows.length === 0 ? (
                <div className="p-3 text-center rounded-xl bg-[#0A0D14] border border-[#1E293B] text-slate-500 text-xs">
                  No custom headers configured. Click &ldquo;Add Header&rdquo; to add custom headers.
                </div>
              ) : (
                <div className="space-y-2">
                  {headerRows.map((row) => (
                    <div
                      key={row.id}
                      className="flex items-center gap-2 p-2 rounded-xl bg-[#0A0D14] border border-[#1E293B]"
                    >
                      <input
                        type="text"
                        placeholder="Header Name (e.g. X-Org-ID)"
                        value={row.key}
                        onChange={(e) =>
                          updateHeaderRow(row.id, "key", e.target.value)
                        }
                        className="flex-1 bg-transparent border-0 px-2 py-1 text-xs font-mono text-white placeholder-slate-600 focus:outline-none"
                      />
                      <span className="text-slate-600 font-mono text-xs">:</span>
                      <input
                        type="text"
                        placeholder="Header Value"
                        value={row.value}
                        onChange={(e) =>
                          updateHeaderRow(row.id, "value", e.target.value)
                        }
                        className="flex-1 bg-transparent border-0 px-2 py-1 text-xs font-mono text-white placeholder-slate-600 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => removeHeaderRow(row.id)}
                        className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer transition-colors"
                        title="Remove header"
                      >
                        <span className="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Save Button */}
            <div className="flex items-center justify-end pt-3 border-t border-[#1E293B]">
              <button
                type="submit"
                disabled={savingSettings}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-600/20 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {savingSettings ? (
                  <>
                    <span className="material-symbols-outlined text-[15px] animate-spin">
                      progress_activity
                    </span>
                    Saving Configuration...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">save</span>
                    Save Configuration
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* CARD 3: Client Gateway API Keys Management */}
      <div className="w-full p-6 rounded-2xl bg-[#0F1420]/80 border border-[#1E293B] space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-amber-400">
                vpn_key
              </span>
              Client Gateway API Keys ({keys.length})
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Authentication tokens used by Claude Code CLI, Cursor, and Cline to access Mapigate gateway securely.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setNewlyCreatedKey(null);
              setShowCreateKeyModal(true);
            }}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-600/20 text-xs font-semibold text-white flex items-center gap-1.5 transition-all cursor-pointer self-start sm:self-center shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            Generate New Key
          </button>
        </div>

        {loadingKeys ? (
          <div className="py-12 text-center text-slate-400 flex flex-col items-center gap-2">
            <span className="material-symbols-outlined text-2xl text-blue-400 animate-spin">
              progress_activity
            </span>
            <span className="text-xs">Loading API keys...</span>
          </div>
        ) : keys.length === 0 ? (
          <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2.5 bg-[#0A0D14] rounded-xl border border-[#1E293B]">
            <span className="material-symbols-outlined text-3xl text-slate-600">
              key_off
            </span>
            <p className="text-xs font-semibold text-slate-300">
              No Gateway API Keys Generated
            </p>
            <p className="text-[11px] text-slate-500 max-w-sm">
              Generate a client API key to authenticate requests from external developer tools when &ldquo;Require API Key&rdquo; is enabled.
            </p>
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead>
                <tr className="border-b border-[#1E293B] text-[11px] text-slate-400 uppercase font-semibold">
                  <th className="py-3 px-3">Name / Label</th>
                  <th className="py-3 px-3">API Token</th>
                  <th className="py-3 px-3">Created</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B]/60">
                {keys.map((k) => {
                  const isVisible = visibleKeyIds.has(k.id);
                  const isCopied = copiedKeyId === k.id;

                  return (
                    <tr
                      key={k.id}
                      className="hover:bg-[#141B2D]/40 transition-colors"
                    >
                      {/* Name */}
                      <td className="py-3.5 px-3 font-semibold text-white">
                        {k.name}
                      </td>

                      {/* Token */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2 font-mono text-xs">
                          <span
                            className={`px-2 py-0.5 rounded-lg border ${
                              isVisible
                                ? "bg-[#0A0D14] border-blue-500/30 text-blue-300 select-all"
                                : "bg-[#0A0D14] border-[#1E293B] text-slate-400 select-none"
                            }`}
                          >
                            {isVisible ? k.key : maskKey(k.key)}
                          </span>

                          <button
                            type="button"
                            onClick={() => toggleKeyVisibility(k.id)}
                            className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                            title={isVisible ? "Hide token" : "Reveal token"}
                          >
                            <span className="material-symbols-outlined text-[15px]">
                              {isVisible ? "visibility_off" : "visibility"}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => copyKeyToken(k.key, k.id)}
                            className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                            title="Copy API key"
                          >
                            <span
                              className={`material-symbols-outlined text-[15px] ${
                                isCopied ? "text-emerald-400" : ""
                              }`}
                            >
                              {isCopied ? "check" : "content_copy"}
                            </span>
                          </button>
                        </div>
                      </td>

                      {/* Created Date */}
                      <td className="py-3.5 px-3 text-slate-400 text-[11px]">
                        {new Date(k.createdAt).toLocaleDateString()}
                      </td>

                      {/* Status Toggle */}
                      <td className="py-3.5 px-3 text-center">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={k.isActive}
                            onChange={() => handleToggleKeyActive(k)}
                            className="sr-only peer"
                          />
                          <div className="w-8 h-4.5 bg-[#1E293B] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-emerald-500" />
                        </label>
                      </td>

                      {/* Delete Action */}
                      <td className="py-3.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => setKeyToDelete(k)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Delete API key"
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            delete
                          </span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Generate API Key Modal */}
      {showCreateKeyModal && (
        <PortalModal
          isOpen={showCreateKeyModal}
          onClose={() => {
            setShowCreateKeyModal(false);
            setNewlyCreatedKey(null);
          }}
          maxWidthClass="max-w-md"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-amber-400">
                  vpn_key
                </span>
                Generate Gateway API Key
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowCreateKeyModal(false);
                  setNewlyCreatedKey(null);
                }}
                className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {newlyCreatedKey ? (
              <div className="space-y-4 py-2 animate-rt-scale-in">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                  <span>API Key &ldquo;{newlyCreatedKey.name}&rdquo; generated successfully!</span>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-slate-400 block">
                    Your Gateway Secret Token:
                  </span>
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#0A0D14] border border-[#1E293B]">
                    <span className="font-mono text-xs text-white break-all flex-1 select-all">
                      {newlyCreatedKey.key}
                    </span>
                    <button
                      type="button"
                      onClick={() => copy(newlyCreatedKey.key, "newlyCreated")}
                      className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer shrink-0"
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {copiedField === "newlyCreated" ? "check" : "content_copy"}
                      </span>
                      {copiedField === "newlyCreated" ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateKeyModal(false);
                      setNewlyCreatedKey(null);
                    }}
                    className="px-4 py-1.5 rounded-xl bg-[#141B2D] border border-[#1E293B] text-xs font-semibold text-white hover:border-slate-600 cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateKey} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Key Label / Client Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Claude Code CLI, Cursor MacBook, Cline"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="w-full bg-[#0A0D14] border border-[#1E293B] focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
                    autoFocus
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    A friendly label to identify which coding tool is using this key.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#1E293B]">
                  <button
                    type="button"
                    onClick={() => setShowCreateKeyModal(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white bg-[#141B2D] border border-[#1E293B] rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingKey}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-600/20 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    {creatingKey ? (
                      <>
                        <span className="material-symbols-outlined text-[14px] animate-spin">
                          progress_activity
                        </span>
                        Generating...
                      </>
                    ) : (
                      "Generate Key"
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </PortalModal>
      )}

      {/* Delete Confirmation Modal */}
      {keyToDelete && (
        <ConfirmModal
          isOpen={keyToDelete !== null}
          title="Delete Gateway API Key"
          message={`Are you sure you want to permanently delete API key "${keyToDelete.name}" (${maskKey(
            keyToDelete.key
          )})? Any client tool configured with this key will no longer be authorized.`}
          confirmText="Delete Key"
          variant="danger"
          onConfirm={handleDeleteKey}
          onCancel={() => setKeyToDelete(null)}
        />
      )}
    </div>
  );
};
