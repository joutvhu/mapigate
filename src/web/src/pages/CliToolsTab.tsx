import React, { useState, useEffect, useMemo } from "react";
import { LayoutGrid, GitFork } from "lucide-react";
import { PortalModal } from "../components/PortalModal";
import { CLI_TOOLS_LIST, type CliToolItem } from "../constants/providersData";
import { CLI_TOOLS, type CliToolDefinition } from "../../../shared/constants/cliTools";
import { ToolIcon } from "../components/ui/ToolIcon";
import { useSystemInfo } from "../hooks/useSystemInfo";
import { ModelAutocompleteInput } from "../components/ModelAutocompleteInput";
import { DEFAULT_PORT, DEFAULT_HOST } from "../../../shared/constants/network.js";

interface ToolMappingItem {
  toolId: string;
  sourceModel: string;
  targetModel: string;
}

interface ToolStatusData {
  id: string;
  name: string;
  installed: boolean;
  configured: boolean;
  status: "Connected" | "Guide" | "Not configured" | "Not installed";
  configPath?: string;
  hasMapigate?: boolean;
}

interface GatewayApiKeyItem {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
  isSystem?: boolean;
}

export const CliToolsTab: React.FC = () => {
  const systemInfo = useSystemInfo((s) => s.info);
  const effectivePort = systemInfo?.port || DEFAULT_PORT;
  const effectiveHost = systemInfo?.host || DEFAULT_HOST;

  // Gateway API Key & Endpoint Auth state
  const [requireApiKey, setRequireApiKey] = useState(false);
  const [gatewayKeys, setGatewayKeys] = useState<GatewayApiKeyItem[]>([]);
  const [selectedApiKey, setSelectedApiKey] = useState<string>("mapigate-local");
  const [creatingKey, setCreatingKey] = useState(false);

  const activeUserKeys = useMemo(
    () => gatewayKeys.filter((k) => k.isActive && !k.isSystem),
    [gatewayKeys]
  );

  const effectiveApiKey = useMemo(() => {
    if (selectedApiKey && selectedApiKey !== "mapigate-local") {
      return selectedApiKey;
    }
    if (requireApiKey && activeUserKeys.length > 0) {
      return activeUserKeys[0].key;
    }
    return "mapigate-local";
  }, [selectedApiKey, requireApiKey, activeUserKeys]);

  const formatWithActivePort = (text?: string): string => {
    if (!text) return "";
    return text
      .replace(/127\.0\.0\.1:2012[78]/g, `${effectiveHost}:${effectivePort}`)
      .replace(/localhost:2012[78]/g, `localhost:${effectivePort}`)
      .replace(/:2012[78]\b/g, `:${effectivePort}`)
      .replace(/mapigate-local/g, effectiveApiKey);
  };

  // View Mode: Tool Catalog vs Global Model Mappings
  const [viewMode, setViewMode] = useState<"catalog" | "mappings">("catalog");

  // Tool Catalog state
  const [activeModalTool, setActiveModalTool] = useState<CliToolItem | null>(null);
  const [activeTab, setActiveTab] = useState<"powershell" | "bash" | "file" | "guide">("powershell");
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [toolStatuses, setToolStatuses] = useState<Record<string, ToolStatusData>>({});
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [importToast, setImportToast] = useState<string | null>(null);

  // Global Model Mappings state
  const [globalMappings, setGlobalMappings] = useState<ToolMappingItem[]>([]);
  const [loadingGlobal, setLoadingGlobal] = useState(false);
  const [mappingSearch, setMappingSearch] = useState("");
  const [editingSourceModel, setEditingSourceModel] = useState<string | null>(null);
  const [editingTargetInput, setEditingTargetInput] = useState("");
  const [newSourceModel, setNewSourceModel] = useState("");
  const [newTargetModel, setNewTargetModel] = useState("");
  const [isAddingMapping, setIsAddingMapping] = useState(false);
  const [comboNames, setComboNames] = useState<Set<string>>(new Set());

  // Exposure mode & Simulator state
  const [exposureMode, setExposureMode] = useState<"all" | "connected" | "mapped_only">("all");
  const [isSimulateOpen, setIsSimulateOpen] = useState(false);
  const [simModel, setSimModel] = useState("");
  const [simTool, setSimTool] = useState("");
  const [simResult, setSimResult] = useState<any>(null);
  const [simLoading, setSimLoading] = useState(false);

  // Fetch real tool statuses from backend
  const fetchStatuses = () => {
    fetch("/api/cli-tools/status")
      .then((r) => r.json())
      .then((data: Record<string, ToolStatusData>) => {
        if (data && typeof data === "object") {
          setToolStatuses(data);
        }
      })
      .catch(() => {});
  };

  // Load combos list to flag [COMBO] badge
  const loadCombos = () => {
    fetch("/api/combos")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? data : data.combos || [];
        setComboNames(new Set(list.map((c: any) => (c.name || "").toLowerCase())));
      })
      .catch(() => {});
  };

  // Load global model mappings
  const loadGlobalMappings = async () => {
    setLoadingGlobal(true);
    try {
      const res = await fetch("/api/model-mappings/global-mappings");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setGlobalMappings(data);
        }
      }
    } catch {
    } finally {
      setLoadingGlobal(false);
    }
  };

  // Load endpoint auth settings & gateway API keys
  const loadEndpointAuth = async () => {
    try {
      const [epRes, keysRes] = await Promise.all([
        fetch("/api/settings/endpoint"),
        fetch("/api/settings/endpoint/keys"),
      ]);
      let reqKey = false;
      if (epRes.ok) {
        const epData = await epRes.json();
        reqKey = Boolean(epData?.requireApiKey);
        setRequireApiKey(reqKey);
      }
      if (keysRes.ok) {
        const keysData = await keysRes.json();
        if (Array.isArray(keysData)) {
          setGatewayKeys(keysData);
          const firstActive = keysData.find((k: GatewayApiKeyItem) => k.isActive && !k.isSystem);
          if (reqKey && firstActive) {
            setSelectedApiKey((prev) => (prev === "mapigate-local" ? firstActive.key : prev));
          }
        }
      }
    } catch {
      // ignore
    }
  };

  const handleQuickCreateKey = async (toolName?: string) => {
    setCreatingKey(true);
    try {
      const res = await fetch("/api/settings/endpoint/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: toolName ? `${toolName} Key` : "CLI Tool Key" }),
      });
      if (res.ok) {
        const created: GatewayApiKeyItem = await res.json();
        setGatewayKeys((prev) => [created, ...prev]);
        setSelectedApiKey(created.key);
        setApplyMsg({ type: "success", text: `Created Gateway API Key "${created.name}" and selected it.` });
      }
    } catch {
      // ignore
    } finally {
      setCreatingKey(false);
    }
  };

  // Load exposure mode
  const loadExposureMode = async () => {
    try {
      const res = await fetch("/api/model-mappings/exposure-mode");
      if (res.ok) {
        const data = await res.json();
        if (data.mode) setExposureMode(data.mode);
      }
    } catch {}
  };

  const handleUpdateExposureMode = async (mode: "all" | "connected" | "mapped_only") => {
    setExposureMode(mode);
    try {
      await fetch("/api/model-mappings/exposure-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const labels = {
        all: "Exposing all provider models via /v1/models",
        connected: "Exposing only connected provider models & combos via /v1/models",
        mapped_only: "Strict mode: Exposing only mapped models & combos via /v1/models",
      };
      setImportToast(labels[mode]);
      setTimeout(() => setImportToast(null), 3500);
    } catch {}
  };

  // Sync all active combos into global mappings
  const handleImportCombos = async () => {
    try {
      const res = await fetch("/api/model-mappings/global-mappings/import-combos", {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.mappings)) {
          setGlobalMappings(data.mappings);
        }
        setImportToast("Synchronized all active combos into Model Mappings!");
        setTimeout(() => setImportToast(null), 4000);
      }
    } catch (err: any) {
      console.error("Failed to import combos:", err);
    }
  };

  // Run Route Simulator
  const handleRunSimulate = async () => {
    if (!simModel.trim()) return;
    setSimLoading(true);
    setSimResult(null);
    try {
      const res = await fetch("/api/model-mappings/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: simModel.trim(), toolId: simTool || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setSimResult(data);
      }
    } catch {
      // ignore
    } finally {
      setSimLoading(false);
    }
  };

  useEffect(() => {
    fetchStatuses();
    loadCombos();
    loadGlobalMappings();
    loadEndpointAuth();
    loadExposureMode();
  }, []);

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(text);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const getEffectiveStatus = (tool: CliToolItem): "Connected" | "Guide" | "Not configured" | "Not installed" => {
    const live = toolStatuses[tool.id];
    if (live) return live.status;
    return tool.status;
  };

  const getStatusBadge = (status: "Connected" | "Guide" | "Not configured" | "Not installed") => {
    if (status === "Connected") {
      return (
        <span className="rt-badge rt-badge--success">
          <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Connected
        </span>
      );
    }
    if (status === "Guide") {
      return (
        <span className="rt-badge rt-badge--info">
          Setup Guide
        </span>
      );
    }
    if (status === "Not configured") {
      return <span className="rt-badge rt-badge--warning">Not configured</span>;
    }
    return <span className="rt-badge rt-badge--muted">Not installed</span>;
  };

  const selectedDef: CliToolDefinition | undefined = activeModalTool
    ? CLI_TOOLS[activeModalTool.id]
    : undefined;

  // 1-Click Sync Aliases from a tool into Global Model Mappings
  const handleImportToolToGlobal = async (toolId: string, toolName?: string) => {
    try {
      const res = await fetch(`/api/model-mappings/global-mappings/import/${toolId}`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.mappings)) {
          setGlobalMappings(data.mappings);
        }
        const label = toolName || CLI_TOOLS[toolId]?.name || toolId;
        setImportToast(`Imported model aliases from ${label} into Model Mappings!`);
        setTimeout(() => setImportToast(null), 4000);
      }
    } catch (err: any) {
      console.error("Failed to import tool aliases:", err);
    }
  };

  // Save / Update Global Mapping
  const handleSaveGlobalMapping = async (sourceModel: string, targetModel: string) => {
    if (!sourceModel.trim() || !targetModel.trim()) return;
    const s = sourceModel.trim();
    const t = targetModel.trim();

    setGlobalMappings((prev) => {
      const filtered = prev.filter((m) => m.sourceModel.toLowerCase() !== s.toLowerCase());
      return [...filtered, { toolId: "global", sourceModel: s, targetModel: t }];
    });

    try {
      await fetch("/api/model-mappings/global-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceModel: s, targetModel: t }),
      });
    } catch {
      //
    } finally {
      setEditingSourceModel(null);
      setEditingTargetInput("");
      setNewSourceModel("");
      setNewTargetModel("");
      setIsAddingMapping(false);
    }
  };

  // Delete Global Mapping
  const handleDeleteGlobalMapping = async (sourceModel: string) => {
    setGlobalMappings((prev) => prev.filter((m) => m.sourceModel !== sourceModel));
    try {
      await fetch(`/api/model-mappings/global-mappings?sourceModel=${encodeURIComponent(sourceModel)}`, {
        method: "DELETE",
      });
    } catch {
      //
    }
  };

  // Reset Global Mappings to defaults
  const handleResetGlobalMappings = async () => {
    setLoadingGlobal(true);
    try {
      const res = await fetch("/api/model-mappings/global-mappings/reset", {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.mappings)) {
          setGlobalMappings(data.mappings);
        }
        setImportToast("Restored default canonical model mappings!");
        setTimeout(() => setImportToast(null), 3000);
      }
    } catch {
      //
    } finally {
      setLoadingGlobal(false);
    }
  };

  const handleApplyConfig = async (toolId: string) => {
    setApplying(true);
    setApplyMsg(null);
    try {
      const res = await fetch(`/api/cli-tools/${toolId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: effectiveApiKey }),
      });
      const data = await res.json();
      if (res.ok) {
        setApplyMsg({ type: "success", text: "Configuration applied successfully!" });
        fetchStatuses();
      } else {
        setApplyMsg({ type: "error", text: data.error || "Failed to apply config" });
      }
    } catch (e: any) {
      setApplyMsg({ type: "error", text: e.message || "Network error" });
    } finally {
      setApplying(false);
    }
  };

  const handleResetConfig = async (toolId: string) => {
    setApplying(true);
    setApplyMsg(null);
    try {
      const res = await fetch(`/api/cli-tools/${toolId}/reset`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setApplyMsg({ type: "success", text: "Configuration reset successfully." });
        fetchStatuses();
      } else {
        setApplyMsg({ type: "error", text: data.error || "Failed to reset config" });
      }
    } catch (e: any) {
      setApplyMsg({ type: "error", text: e.message || "Network error" });
    } finally {
      setApplying(false);
    }
  };

  // Filtered Global Mappings
  const filteredMappings = useMemo(() => {
    const q = mappingSearch.trim().toLowerCase();
    if (!q) return globalMappings;
    return globalMappings.filter(
      (m) =>
        m.sourceModel.toLowerCase().includes(q) ||
        m.targetModel.toLowerCase().includes(q)
    );
  }, [globalMappings, mappingSearch]);

  return (
    <div className="space-y-6 w-full px-2 sm:px-4 pb-16 animate-rt-fade-in">
      {/* Toast Notification */}
      {importToast && (
        <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs flex items-center justify-between gap-3 shadow-lg animate-rt-scale-in">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-blue-400">check_circle</span>
            <span>{importToast}</span>
          </div>
          <button
            onClick={() => setImportToast(null)}
            className="text-slate-400 hover:text-white p-1"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {/* TOP FILTER AND NAVIGATION HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0B0F19] border border-[#1E293B] rounded-2xl p-2 sm:p-2.5 shadow-sm">
        {/* Main Segmented Control: Tool Catalog / Model Mappings */}
        <div className="bg-[#151C2C] p-1 rounded-xl border border-[#243048] flex items-center shrink-0">
          <button
            onClick={() => setViewMode("catalog")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              viewMode === "catalog"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Tool Catalog
          </button>

          <button
            onClick={() => {
              setViewMode("mappings");
              loadGlobalMappings();
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              viewMode === "mappings"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <GitFork className="w-3.5 h-3.5" />
            Model Mappings
          </button>
        </div>

        {/* Right: Refresh Action */}
        <div className="flex items-center gap-2 shrink-0">
          {viewMode === "catalog" ? (
            <button
              onClick={fetchStatuses}
              className="rt-btn rt-btn--secondary text-xs flex items-center gap-1.5 py-1.5 px-3 cursor-pointer"
              title="Refresh installation status"
            >
              <span className="material-symbols-outlined text-[16px]">refresh</span>
              Refresh Status
            </button>
          ) : (
            <button
              onClick={loadGlobalMappings}
              className="rt-btn rt-btn--secondary text-xs flex items-center gap-1.5 py-1.5 px-3 cursor-pointer"
              title="Refresh mappings"
            >
              <span className="material-symbols-outlined text-[16px]">refresh</span>
              Refresh Mappings
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VIEW 1: TOOL CATALOG                                                      */}
      {/* ========================================================================= */}
      {viewMode === "catalog" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <p>
              Click any tool card below to inspect connection instructions and sync its model aliases into Model Mappings.
            </p>
          </div>

          {/* GRID OF 26 TOOLS & ASSISTANTS */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
            {CLI_TOOLS_LIST.map((tool, idx) => {
              const currentStatus = getEffectiveStatus(tool);
              const def = CLI_TOOLS[tool.id];

              return (
                <div
                  key={tool.id}
                  onClick={() => {
                    setActiveModalTool(tool);
                    setApplyMsg(null);
                    if (def?.guideSteps && def.guideSteps.length > 0 && !def.powershellTemplate) {
                      setActiveTab("guide");
                    } else if (def?.configFileTemplate && !def.powershellTemplate) {
                      setActiveTab("file");
                    } else {
                      setActiveTab("powershell");
                    }
                  }}
                  className="rt-card stagger-item flex items-center justify-between gap-3 cursor-pointer py-3.5 px-4 hover:border-blue-500/40 hover:bg-[#131B2E] transition-all min-w-[250px] group"
                  style={{ animationDelay: `${idx * 15}ms` }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ToolIcon
                      src={tool.image}
                      name={tool.name}
                      color={def?.color}
                      iconBg={def?.iconBg || tool.iconBg}
                      size="md"
                    />
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-100 truncate group-hover:text-blue-400 transition-colors">
                        {tool.name}
                      </h4>
                      <div className="mt-1">{getStatusBadge(currentStatus)}</div>
                    </div>
                  </div>

                  <span className="material-symbols-outlined text-[18px] text-slate-500 group-hover:text-blue-400 transition-colors shrink-0">
                    chevron_right
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: GLOBAL MODEL MAPPINGS                                             */}
      {/* ========================================================================= */}
      {viewMode === "mappings" && (
        <div className="space-y-4">
          {/* Header Bar */}
          <div className="p-4 rounded-2xl bg-[#0F1420]/80 border border-[#1E293B] flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400 text-[20px]">alt_route</span>
                Universal Model Mappings
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Client model names (e.g. <code>sonnet</code>, <code>claude-3-7-sonnet</code>) are automatically translated to target models or fallback combos for all tools.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Exposure Mode Control */}
              <div className="flex items-center gap-1 bg-[#080B11] border border-[#1E293B] p-1 rounded-xl text-xs">
                <span className="text-[11px] text-slate-400 px-2 flex items-center gap-1 font-medium">
                  <span className="material-symbols-outlined text-[14px] text-slate-500">visibility</span>
                  /v1/models:
                </span>
                <button
                  type="button"
                  onClick={() => handleUpdateExposureMode("all")}
                  className={`px-2 py-1 rounded-lg text-[11px] transition-all cursor-pointer ${
                    exposureMode === "all"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                  title="Expose all registered and scanned models in /v1/models"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateExposureMode("connected")}
                  className={`px-2 py-1 rounded-lg text-[11px] transition-all cursor-pointer ${
                    exposureMode === "connected"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                  title="Expose only connected providers with active accounts + combos"
                >
                  Connected
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateExposureMode("mapped_only")}
                  className={`px-2 py-1 rounded-lg text-[11px] transition-all cursor-pointer ${
                    exposureMode === "mapped_only"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                  title="Strict: Expose ONLY models defined in Mappings + Combos"
                >
                  Mappings Only
                </button>
              </div>

              {/* Sync Combos Button */}
              <button
                type="button"
                onClick={handleImportCombos}
                className="px-3 py-1.5 text-xs font-medium rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-[#1E293B] hover:border-slate-600 text-slate-200 flex items-center gap-1.5 transition-all cursor-pointer"
                title="Automatically import all active combos into Model Mappings"
              >
                <span className="material-symbols-outlined text-[16px] text-cyan-400">sync_alt</span>
                Sync Combos
              </button>

              {/* Test Route Simulator Button */}
              <button
                type="button"
                onClick={() => {
                  setIsSimulateOpen(true);
                  setSimResult(null);
                }}
                className="px-3 py-1.5 text-xs font-medium rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-[#1E293B] hover:border-slate-600 text-slate-200 flex items-center gap-1.5 transition-all cursor-pointer"
                title="Test and simulate which provider and model a client request routes to"
              >
                <span className="material-symbols-outlined text-[16px] text-emerald-400">play_circle</span>
                Test Route
              </button>

              {/* Add Mapping Button */}
              <button
                type="button"
                onClick={() => setIsAddingMapping(!isAddingMapping)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-600/30 text-white flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {isAddingMapping ? "close" : "add_circle"}
                </span>
                {isAddingMapping ? "Cancel" : "Add Mapping"}
              </button>
            </div>
          </div>

          {/* Add Mapping Card Form */}
          {isAddingMapping && (
            <div className="p-4 rounded-2xl bg-[#0E1424] border border-blue-500/40 space-y-3.5 animate-rt-scale-in">
              <div className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[17px]">add_circle</span>
                Add New Model Mapping
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    Client Model (Source Alias):
                  </label>
                  <input
                    type="text"
                    value={newSourceModel}
                    onChange={(e) => setNewSourceModel(e.target.value)}
                    placeholder="e.g. sonnet, claude-3-7-sonnet, my-coding-alias"
                    className="bg-[#080B11] border border-[#1E293B] focus:border-blue-400 rounded-xl px-3 py-2 text-xs text-white font-mono w-full focus:outline-none"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    Gateway Target (Model or Combo):
                  </label>
                  <ModelAutocompleteInput
                    value={newTargetModel}
                    onChange={setNewTargetModel}
                    placeholder="e.g. claude/claude-sonnet-4-6 or combo/..."
                    className="bg-[#080B11] border border-[#1E293B] focus:border-blue-400 rounded-xl px-3 py-2 text-xs text-white font-mono w-full focus:outline-none"
                    onEnter={() => handleSaveGlobalMapping(newSourceModel, newTargetModel)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => {
                    setIsAddingMapping(false);
                    setNewSourceModel("");
                    setNewTargetModel("");
                  }}
                  className="px-3.5 py-1.5 text-xs rounded-xl bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSaveGlobalMapping(newSourceModel, newTargetModel)}
                  disabled={!newSourceModel.trim() || !newTargetModel.trim()}
                  className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 cursor-pointer shadow-md shadow-blue-600/30"
                >
                  Save Mapping
                </button>
              </div>
            </div>
          )}

          {/* Search & Filter Bar */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[18px]">
                search
              </span>
              <input
                type="text"
                value={mappingSearch}
                onChange={(e) => setMappingSearch(e.target.value)}
                placeholder="Search model alias or destination..."
                className="w-full bg-[#0F1420]/80 border border-[#1E293B] focus:border-blue-500 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 focus:outline-none"
              />
            </div>
            {mappingSearch && (
              <button
                onClick={() => setMappingSearch("")}
                className="text-xs text-slate-400 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          {/* Mappings Table */}
          <div className="rounded-2xl border border-[#1E293B] overflow-hidden bg-[#0F1420]/80">
            {loadingGlobal ? (
              <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[18px] animate-spin text-blue-400">
                  progress_activity
                </span>
                Loading model mappings...
              </div>
            ) : filteredMappings.length === 0 ? (
              <div className="py-14 text-center text-xs text-slate-400 space-y-2">
                <span className="material-symbols-outlined text-3xl text-slate-600 block">
                  alt_route
                </span>
                <p className="font-semibold text-slate-300">
                  {mappingSearch ? `No mappings match "${mappingSearch}"` : "No model mappings configured yet"}
                </p>
                <p className="text-slate-500 max-w-md mx-auto text-[11.5px] leading-relaxed">
                  Click <strong className="text-slate-300">&ldquo;Sync Aliases&rdquo;</strong> on any tool card in the Tool Catalog to add its models (with target left empty for you to select), or click <strong className="text-blue-400">&ldquo;+ Add Mapping&rdquo;</strong> above.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#1E293B] bg-[#0A0D14] text-slate-400 font-semibold">
                      <th className="p-3 pl-4">Source Model (Client Sends)</th>
                      <th className="p-3">Target Destination (Model or Combo)</th>
                      <th className="p-3 pr-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B]">
                    {filteredMappings.map((m) => {
                      const isEditing = editingSourceModel === m.sourceModel;
                      const isCombo = Boolean(
                        m.targetModel &&
                        (m.targetModel.startsWith("combo/") || comboNames.has(m.targetModel.toLowerCase()))
                      );

                      return (
                        <tr
                          key={m.sourceModel}
                          className={`transition-colors ${
                            isEditing ? "bg-blue-500/10" : "hover:bg-white/5"
                          }`}
                        >
                          {/* Source Model */}
                          <td className="p-3 pl-4 font-mono text-slate-200">
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-100 font-medium">
                                {m.sourceModel}
                              </span>
                              <button
                                onClick={() => copyText(m.sourceModel)}
                                className="text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
                                title="Copy source model"
                              >
                                <span className="material-symbols-outlined text-[13px]">
                                  {copiedCmd === m.sourceModel ? "done" : "content_copy"}
                                </span>
                              </button>
                            </div>
                          </td>

                          {/* Target Destination */}
                          <td className="p-3">
                            {isEditing ? (
                              <div className="flex items-center gap-2 w-full max-w-md">
                                <span className="text-blue-400 font-mono">→</span>
                                <ModelAutocompleteInput
                                  value={editingTargetInput}
                                  onChange={setEditingTargetInput}
                                  onEnter={() => handleSaveGlobalMapping(m.sourceModel, editingTargetInput)}
                                  placeholder="Search model or combo..."
                                  className="bg-[#080B11] border border-blue-500/60 focus:border-blue-400 rounded-xl px-3 py-1.5 text-xs text-white font-mono w-full focus:outline-none"
                                  autoFocus
                                />
                              </div>
                            ) : m.targetModel ? (
                              <div className="inline-flex items-center gap-2 flex-wrap">
                                <span className="text-slate-500 font-mono">→</span>
                                {isCombo && (
                                  <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 border border-cyan-500/40 text-[9.5px] font-mono text-cyan-300 font-semibold tracking-wide">
                                    COMBO
                                  </span>
                                )}
                                <span className="text-emerald-300 font-mono font-medium text-xs">
                                  {m.targetModel}
                                </span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingSourceModel(m.sourceModel);
                                  setEditingTargetInput("");
                                }}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/10 text-amber-300 hover:border-amber-400 hover:text-amber-200 text-xs font-medium transition-colors cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-[14px]">add</span>
                                Click to select target model or combo
                              </button>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="p-3 pr-4 text-right space-x-2 whitespace-nowrap">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => handleSaveGlobalMapping(m.sourceModel, editingTargetInput)}
                                  className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-sans text-xs font-semibold transition-colors cursor-pointer"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingSourceModel(null);
                                    setEditingTargetInput("");
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-sans text-xs transition-colors cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingSourceModel(m.sourceModel);
                                    setEditingTargetInput(m.targetModel || "");
                                  }}
                                  className="p-1 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors cursor-pointer"
                                  title="Edit target model"
                                >
                                  <span className="material-symbols-outlined text-[16px]">edit</span>
                                </button>
                                <button
                                  onClick={() => handleDeleteGlobalMapping(m.sourceModel)}
                                  className="p-1 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                                  title="Delete mapping"
                                >
                                  <span className="material-symbols-outlined text-[16px]">delete</span>
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CONNECTION GUIDE MODAL (MOUNTED DIRECTLY TO BODY VIA REACT PORTAL)         */}
      {/* ========================================================================= */}
      <PortalModal
        isOpen={Boolean(activeModalTool)}
        onClose={() => setActiveModalTool(null)}
        maxWidthClass="w-full max-w-4xl"
      >
        {activeModalTool && (
          <div className="space-y-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3.5 border-b border-[#1E293B]">
              <div className="flex items-center gap-3">
                <ToolIcon
                  src={activeModalTool.image}
                  name={activeModalTool.name}
                  color={selectedDef?.color}
                  iconBg={selectedDef?.iconBg || activeModalTool.iconBg}
                  size="lg"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">{activeModalTool.name}</h3>
                    {getStatusBadge(getEffectiveStatus(activeModalTool))}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {selectedDef?.description || "Connect this tool directly to Mapigate Local Gateway."}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {Boolean(
                  (selectedDef?.defaultModels && selectedDef.defaultModels.length > 0) ||
                  (selectedDef?.modelAliases && selectedDef.modelAliases.length > 0)
                ) && (
                  <button
                    onClick={() => {
                      handleImportToolToGlobal(activeModalTool.id, activeModalTool.name);
                      setActiveModalTool(null);
                      setViewMode("mappings");
                    }}
                    className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30 flex items-center gap-1.5 transition-all cursor-pointer"
                    title="Import this tool's model aliases into Model Mappings"
                  >
                    <span className="material-symbols-outlined text-[16px]">alt_route</span>
                    Sync Models to Mappings
                  </button>
                )}

                <button
                  onClick={() => setActiveModalTool(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
            </div>

            {/* Gateway API Key Selector & Auth Guidance */}
            <div
              className={`p-3.5 rounded-xl border space-y-2.5 ${
                requireApiKey && effectiveApiKey === "mapigate-local"
                  ? "bg-amber-500/10 border-amber-500/30"
                  : "bg-[#0A0D14] border-[#1E293B]"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-amber-400">vpn_key</span>
                  <span className="text-xs font-semibold text-white">Gateway API Key</span>
                  {requireApiKey ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Required
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                      Optional
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end min-w-[240px]">
                  <select
                    value={effectiveApiKey}
                    onChange={(e) => setSelectedApiKey(e.target.value)}
                    className="bg-[#0F1420] border border-[#243048] rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500 max-w-[280px] w-full"
                  >
                    {!requireApiKey && (
                      <option value="mapigate-local">mapigate-local (Placeholder)</option>
                    )}
                    {requireApiKey && activeUserKeys.length === 0 && (
                      <option value="mapigate-local">No active key — create one →</option>
                    )}
                    {activeUserKeys.map((k) => (
                      <option key={k.id} value={k.key}>
                        {k.name} ({k.key.slice(0, 10)}…{k.key.slice(-4)})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={creatingKey}
                    onClick={() => handleQuickCreateKey(activeModalTool.name)}
                    className="px-2.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-semibold flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                    title="Create a new Gateway API Key and insert it into the commands below"
                  >
                    <span className="material-symbols-outlined text-[14px]">add</span>
                    {creatingKey ? "Creating..." : "New Key"}
                  </button>
                </div>
              </div>

              <p className="text-[11px] leading-relaxed text-slate-400">
                {requireApiKey ? (
                  effectiveApiKey === "mapigate-local" ? (
                    <span className="text-amber-300">
                      <strong>Require API Key</strong> is enabled in Endpoint settings.{" "}
                      <code className="font-mono">mapigate-local</code> will be rejected with{" "}
                      <code className="font-mono">401 Unauthorized</code> — click <strong>New Key</strong> to generate a valid key.
                    </span>
                  ) : (
                    <span>
                      <strong>Require API Key</strong> is enabled. All commands and config templates below are populated with your selected Gateway API Key.
                    </span>
                  )
                ) : effectiveApiKey === "mapigate-local" ? (
                  <span>
                    <strong>Require API Key</strong> is currently OFF, so <code className="font-mono text-slate-300">mapigate-local</code> works as a placeholder. Select or create a real key if you want per-key usage tracking or plan to enable auth later.
                  </span>
                ) : (
                  <span>
                    Using your real Gateway API Key — requests from this tool will be authenticated and tracked under this key.
                  </span>
                )}
              </p>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-[#1E293B] gap-2 overflow-x-auto">
              <button
                onClick={() => setActiveTab("powershell")}
                className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
                  activeTab === "powershell"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">terminal</span>
                PowerShell (Windows)
              </button>
              <button
                onClick={() => setActiveTab("bash")}
                className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
                  activeTab === "bash"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">code</span>
                Bash / macOS / Linux
              </button>
              {(selectedDef?.configFileTemplate || selectedDef?.configPath || selectedDef?.settingsFile) && (
                <button
                  onClick={() => setActiveTab("file")}
                  className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
                    activeTab === "file"
                      ? "border-blue-500 text-blue-400"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">description</span>
                  Config File
                </button>
              )}
              {selectedDef?.guideSteps && selectedDef.guideSteps.length > 0 && (
                <button
                  onClick={() => setActiveTab("guide")}
                  className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
                    activeTab === "guide"
                      ? "border-blue-500 text-blue-400"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">menu_book</span>
                  Setup Guide
                </button>
              )}
            </div>

            {/* Tab Contents */}
            <div className="space-y-4">
              {/* PowerShell Tab */}
              {activeTab === "powershell" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium">Run in Windows PowerShell:</span>
                    <button
                      onClick={() =>
                        copyText(
                          formatWithActivePort(selectedDef?.powershellTemplate) ||
                            `$env:OPENAI_BASE_URL = "http://${effectiveHost}:${effectivePort}/v1"; $env:OPENAI_API_KEY = "${effectiveApiKey}"`
                        )
                      }
                      className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[15px]">content_copy</span>
                      {copiedCmd?.includes("$env:") ? "Copied!" : "Copy PowerShell"}
                    </button>
                  </div>
                  <pre className="bg-[#0A0D14] border border-[#1E293B] p-4 rounded-xl text-emerald-400 font-mono text-xs overflow-x-auto whitespace-pre leading-relaxed">
                    {formatWithActivePort(selectedDef?.powershellTemplate) ||
                      `$env:OPENAI_BASE_URL = "http://${effectiveHost}:${effectivePort}/v1"\n$env:OPENAI_API_KEY = "${effectiveApiKey}"`}
                  </pre>
                  <p className="text-[11px] text-slate-400">
                    💡 Sets environment variables in your current PowerShell session pointing to Mapigate port {effectivePort}.
                  </p>
                </div>
              )}

              {/* Bash Tab */}
              {activeTab === "bash" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium">Run in Bash / Zsh / Git Bash:</span>
                    <button
                      onClick={() =>
                        copyText(
                          formatWithActivePort(selectedDef?.bashTemplate) ||
                            `export OPENAI_BASE_URL="http://${effectiveHost}:${effectivePort}/v1"\nexport OPENAI_API_KEY="${effectiveApiKey}"`
                        )
                      }
                      className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[15px]">content_copy</span>
                      {copiedCmd?.includes("export ") ? "Copied!" : "Copy Bash"}
                    </button>
                  </div>
                  <pre className="bg-[#0A0D14] border border-[#1E293B] p-4 rounded-xl text-emerald-400 font-mono text-xs overflow-x-auto whitespace-pre leading-relaxed">
                    {formatWithActivePort(selectedDef?.bashTemplate) ||
                      `export OPENAI_BASE_URL="http://${effectiveHost}:${effectivePort}/v1"\nexport OPENAI_API_KEY="${effectiveApiKey}"`}
                  </pre>
                  <p className="text-[11px] text-slate-400">
                    💡 Exports the environment variables for your current terminal session.
                  </p>
                </div>
              )}

              {/* Config File Tab */}
              {activeTab === "file" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium">
                      Config Path:{" "}
                      <code className="text-blue-400 font-mono bg-blue-500/10 px-1.5 py-0.5 rounded">
                        {selectedDef?.configPath || selectedDef?.settingsFile || "~/.config"}
                      </code>
                    </span>
                    <button
                      onClick={() =>
                        copyText(
                          formatWithActivePort(
                            selectedDef?.configFileTemplate || selectedDef?.codeBlock?.code
                          ) || `http://${effectiveHost}:${effectivePort}/v1`
                        )
                      }
                      className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[15px]">content_copy</span>
                      {copiedCmd?.includes("{") || copiedCmd?.includes("[") ? "Copied!" : "Copy Config"}
                    </button>
                  </div>
                  <pre className="bg-[#0A0D14] border border-[#1E293B] p-4 rounded-xl text-emerald-400 font-mono text-xs overflow-x-auto whitespace-pre leading-relaxed">
                    {formatWithActivePort(
                      selectedDef?.configFileTemplate || selectedDef?.codeBlock?.code
                    ) || `{\n  "baseUrl": "http://${effectiveHost}:${effectivePort}/v1",\n  "apiKey": "${effectiveApiKey}"\n}`}
                  </pre>
                  {Boolean(selectedDef?.configPath || selectedDef?.settingsFile) && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        disabled={applying}
                        onClick={() => handleApplyConfig(activeModalTool.id)}
                        className="rt-btn rt-btn--primary text-xs py-1.5 px-3 flex items-center gap-1.5 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">save</span>
                        {applying ? "Applying..." : "Apply to Config File"}
                      </button>
                      <button
                        disabled={applying}
                        onClick={() => handleResetConfig(activeModalTool.id)}
                        className="rt-btn rt-btn--secondary text-xs py-1.5 px-3 flex items-center gap-1.5 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">undo</span>
                        Reset Config
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Guide Steps Tab */}
              {activeTab === "guide" && (
                <div className="space-y-3">
                  {selectedDef?.guideSteps && (
                    <div className="space-y-2.5">
                      {selectedDef.guideSteps.map((step) => {
                        const formattedValue = formatWithActivePort(step.value);
                        return (
                          <div
                            key={step.step}
                            className="p-3.5 rounded-xl bg-[#0A0D14] border border-[#1E293B] flex items-start gap-3"
                          >
                            <div className="size-6 rounded-full bg-blue-500/20 text-blue-400 font-bold text-xs flex items-center justify-center shrink-0 border border-blue-500/30">
                              {step.step}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h5 className="text-xs font-bold text-white">{step.title}</h5>
                              {step.desc && (
                                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{step.desc}</p>
                              )}
                              {formattedValue && (
                                <div className="mt-2 flex items-center justify-between gap-2 bg-[#0E1320] px-2.5 py-1.5 rounded-lg border border-[#1E293B]">
                                  <code className="text-xs text-emerald-400 font-mono truncate">{formattedValue}</code>
                                  {step.copyable && (
                                    <button
                                      onClick={() => copyText(formattedValue)}
                                      className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1 font-semibold shrink-0 cursor-pointer"
                                    >
                                      <span className="material-symbols-outlined text-[14px]">content_copy</span>
                                      {copiedCmd === formattedValue ? "Copied!" : "Copy"}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {selectedDef?.docsUrl && (
                    <div className="pt-1">
                      <a
                        href={selectedDef.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-400 hover:underline flex items-center gap-1 font-medium"
                      >
                        <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                        Official Documentation & Plugin Details
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Status Message */}
              {applyMsg && (
                <div
                  className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                    applyMsg.type === "success"
                      ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                      : "bg-red-500/10 border border-red-500/20 text-red-400"
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {applyMsg.type === "success" ? "check_circle" : "error"}
                  </span>
                  {applyMsg.text}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-[#1E293B]">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 font-mono">
                  Base URL: http://{effectiveHost}:{effectivePort}{selectedDef?.baseUrlPath || ""}
                </span>
              </div>
              <button
                onClick={() => setActiveModalTool(null)}
                className="rt-btn rt-btn--secondary text-xs py-1.5 px-4 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </PortalModal>

      {/* ========================================================================= */}
      {/* TEST ROUTE SIMULATOR MODAL                                                */}
      {/* ========================================================================= */}
      <PortalModal
        isOpen={isSimulateOpen}
        onClose={() => setIsSimulateOpen(false)}
        maxWidthClass="w-full max-w-xl"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-400 text-[20px]">play_circle</span>
              Route Simulator (Conflict & Target Resolution)
            </h3>
            <button
              onClick={() => setIsSimulateOpen(false)}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Enter the exact model string a coding assistant (OpenCode, Cursor, Claude Code) sends to see which mapping rule, provider, or combo Mapigate will route to.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-300 block mb-1 font-medium">
                Client Sent Model:
              </label>
              <input
                type="text"
                value={simModel}
                onChange={(e) => setSimModel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRunSimulate()}
                placeholder="e.g. claude-3-7-sonnet, anthropic/claude-3-7-sonnet, gpt-4o"
                className="bg-[#080B11] border border-[#1E293B] focus:border-blue-400 rounded-xl px-3 py-2 text-xs text-white font-mono w-full focus:outline-none"
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs text-slate-300 block mb-1 font-medium">
                Calling Assistant / Tool (Optional):
              </label>
              <select
                value={simTool}
                onChange={(e) => setSimTool(e.target.value)}
                className="bg-[#080B11] border border-[#1E293B] focus:border-blue-400 rounded-xl px-3 py-2 text-xs text-slate-200 w-full focus:outline-none"
              >
                <option value="">Auto Detect / Generic Client</option>
                <option value="opencode">OpenCode</option>
                <option value="claude">Claude Code</option>
                <option value="cursor">Cursor</option>
                <option value="cline">Cline</option>
                <option value="copilot">GitHub Copilot</option>
                <option value="kiro">Kiro IDE</option>
              </select>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleRunSimulate}
                disabled={!simModel.trim() || simLoading}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer shadow-md shadow-emerald-600/30"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {simLoading ? "progress_activity" : "route"}
                </span>
                {simLoading ? "Simulating..." : "Simulate Route"}
              </button>
            </div>

            {simResult && (
              <div className="mt-4 p-4 rounded-xl bg-[#080B11] border border-[#1E293B] space-y-2.5 animate-rt-scale-in text-xs font-mono">
                <div className="flex items-center justify-between pb-2 border-b border-[#1E293B]">
                  <span className="text-slate-400 font-sans">Mapping Rule:</span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                    {simResult.matchedRule === "global"
                      ? "Global Universal Mapping"
                      : simResult.matchedRule.startsWith("tool")
                      ? `Tool Specific: ${simResult.matchedRule}`
                      : "Direct (No Mapping)"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-sans">Resolved Destination:</span>
                  <span className="text-emerald-300 font-bold">{simResult.effectiveModel}</span>
                </div>

                {simResult.isCombo ? (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-sans">Target Combo:</span>
                      <span className="text-cyan-300 font-semibold">{simResult.comboName}</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Combo Candidates:{" "}
                      <span className="text-slate-300">{(simResult.comboModels || []).join(", ")}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-sans">Target Provider:</span>
                    <span className={simResult.isFallback ? "text-amber-300 font-semibold" : "text-purple-300 font-semibold"}>
                      {simResult.targetProviderId} / {simResult.targetModel}
                      {simResult.isFallback && " (Fallback)"}
                    </span>
                  </div>
                )}

                <div className="flex items-start justify-between pt-2 border-t border-[#1E293B] gap-2">
                  <span className="text-slate-400 font-sans shrink-0">Model Status:</span>
                  {simResult.isFallback ? (
                    <span className="text-amber-400 flex items-center gap-1 font-sans text-[11px] text-right">
                      <span className="material-symbols-outlined text-[15px] shrink-0 text-amber-400">warning</span>
                      Unknown model: not recognized in catalog. Will fallback directly to '{simResult.targetProviderId}' (may fail upstream with 404).
                    </span>
                  ) : simResult.hasActiveAccount ? (
                    <span className="text-emerald-400 flex items-center gap-1 font-semibold font-sans">
                      <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                      Ready ({simResult.activeAccountsCount} active account{simResult.activeAccountsCount > 1 ? "s" : ""})
                    </span>
                  ) : (
                    <span className="text-rose-400 flex items-center gap-1 font-semibold font-sans">
                      <span className="material-symbols-outlined text-[15px]">error</span>
                      No active account for '{simResult.targetProviderId}'
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </PortalModal>
    </div>
  );
};
