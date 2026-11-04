import React, { useState, useEffect, useMemo } from "react";
import { PortalModal } from "../components/PortalModal";
import { ModelAutocompleteInput } from "../components/ModelAutocompleteInput.js";
import { SourceModelAutocompleteInput } from "../components/SourceModelAutocompleteInput.js";
import { resolveModelDisplayName } from "../../../core/capabilities/index.js";
import { DEFAULT_PORT, DEFAULT_HOST } from "../../../shared/constants/network.js";

interface MitmMappingRow {
  sourceModel: string;
  targetModel: string;
}

function sortMitmMappings(
  mappings: MitmMappingRow[],
  sortBy: "source" | "target" = "source",
  sortOrder: "asc" | "desc" = "asc"
): MitmMappingRow[] {
  return [...mappings].sort((a, b) => {
    if (sortBy === "target") {
      const valA = a.targetModel || "";
      const valB = b.targetModel || "";
      if (!valA && valB) return 1;
      if (valA && !valB) return -1;
      const cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: "base" });
      if (cmp !== 0) return sortOrder === "asc" ? cmp : -cmp;
    }

    const isAutoA = a.sourceModel.toLowerCase() === "auto";
    const isAutoB = b.sourceModel.toLowerCase() === "auto";
    if (isAutoA && !isAutoB) return sortOrder === "asc" ? -1 : 1;
    if (!isAutoA && isAutoB) return sortOrder === "asc" ? 1 : -1;

    const cmp = a.sourceModel.localeCompare(b.sourceModel, undefined, {
      numeric: true,
      sensitivity: "base",
    });
    return sortOrder === "asc" ? cmp : -cmp;
  });
}

import { MITM_TOOLS } from "../../../mitm/handlers/generated/toolsConfig.js";
import type { MitmToolConfig, MitmToolId } from "../../../mitm/types.js";
import { ToolIcon } from "../components/ui/ToolIcon";
import { useSystemInfo } from "../hooks/useSystemInfo.js";
import { useMitmStatus } from "../hooks/useMitmStatus.js";

interface MitmStatusData {
  running: boolean;
  port: number;
  certExists: boolean;
  certTrusted: boolean;
  certPath: string;
  fingerprint: string;
  installCommands?: {
    windows: string;
    mac: string;
    linux: string;
  };
  dnsStatus?: Record<string, boolean>;
  augmentModels?: Record<string, boolean>;
  routerBaseUrl: string;
}

interface PortOwnerInfo {
  port: number;
  inUse: boolean;
  pid?: number;
  processName?: string;
  commandLine?: string;
  isSystemProcess?: boolean;
  remediationHint?: string;
}

export const MitmTab: React.FC = () => {
  const systemInfo = useSystemInfo((s) => s.info);
  const effectivePort = systemInfo?.port || DEFAULT_PORT;
  const effectiveHost = systemInfo?.host || DEFAULT_HOST;
  const [routerBaseUrl, setRouterBaseUrl] = useState<string>("");
  const localEndpoint = routerBaseUrl || `http://${effectiveHost}:${effectivePort}`;

  const [serverRunning, setServerRunning] = useState(true);
  const [mitmPort, setMitmPort] = useState(443);
  const [portConflict, setPortConflict] = useState<PortOwnerInfo | null>(null);
  const [customPortInput, setCustomPortInput] = useState<string>("");
  const [showAdvancedPort, setShowAdvancedPort] = useState<boolean>(false);
  const [isKilling, setIsKilling] = useState<boolean>(false);
  const [serverToggleError, setServerToggleError] = useState<string | null>(null);
  const [certExists, setCertExists] = useState(true);
  const [certTrusted, setCertTrusted] = useState(false);
  const [certPath, setCertPath] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [installCommands, setInstallCommands] = useState<{ windows: string; mac: string; linux: string }>({
    windows: 'certutil -addstore -user "Root" "%USERPROFILE%\\.mapigate\\mitm\\rootCA.crt"',
    mac: 'sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ~/.mapigate/mitm/rootCA.crt',
    linux: 'sudo cp ~/.mapigate/mitm/rootCA.crt /usr/local/share/ca-certificates/mapigate-rootCA.crt && sudo update-ca-certificates',
  });
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [installingCert, setInstallingCert] = useState(false);
  const [uninstallingCert, setUninstallingCert] = useState(false);
  const [certInstallMsg, setCertInstallMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [dnsStatus, setDnsStatus] = useState<Record<string, boolean>>({
    antigravity: false,
    kiro: false,
    copilot: false,
  });
  const [augmentModelsByTool, setAugmentModelsByTool] = useState<Record<string, boolean>>({
    antigravity: false,
    kiro: false,
    copilot: false,
  });
  const [expandedTool, setExpandedTool] = useState<MitmToolId | null>(null);

  const sortedMitmTools = useMemo(
    () => [...MITM_TOOLS].sort((a, b) => a.name.localeCompare(b.name)),
    []
  );

  // Per-tool Hosts State
  const [hostsByTool, setHostsByTool] = useState<Record<string, string>>({
    antigravity: "127.0.0.1 daily-cloudcode-pa.googleapis.com\n127.0.0.1 cloudcode-pa.googleapis.com",
    kiro: "127.0.0.1 management.us-east-1.kiro.dev\n127.0.0.1 runtime.us-east-1.kiro.dev\n127.0.0.1 q.us-east-1.amazonaws.com\n127.0.0.1 codewhisperer.us-east-1.amazonaws.com",
    copilot: "127.0.0.1 api.individual.githubcopilot.com",
  });
  const [editingHostsByTool, setEditingHostsByTool] = useState<Record<string, boolean>>({});
  const [originalHostsByTool, setOriginalHostsByTool] = useState<Record<string, string>>({});
  const [hostsSavedMsgByTool, setHostsSavedMsgByTool] = useState<Record<string, string | null>>({});

  // Per-tool Mappings State
  const [mappingsByTool, setMappingsByTool] = useState<Record<string, MitmMappingRow[]>>({
    antigravity: [],
    kiro: [],
    copilot: [],
  });
  const [sortColumnByTool, setSortColumnByTool] = useState<Record<string, "source" | "target">>({});
  const [sortOrderByTool, setSortOrderByTool] = useState<Record<string, "asc" | "desc">>({});

  // Editing mapping
  const [editingTool, setEditingTool] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<string | null>(null);
  const [targetInput, setTargetInput] = useState("");

  // Add Mapping Modal
  const [modalTool, setModalTool] = useState<MitmToolId | null>(null);
  const [newSourceModel, setNewSourceModel] = useState("");
  const [newTargetModel, setNewTargetModel] = useState("");

  const [comboNames, setComboNames] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/combos")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? data : data.combos || [];
        setComboNames(new Set(list.map((c: any) => (c.name || "").toLowerCase())));
      })
      .catch(() => {});
  }, []);

  const copyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const loadStatus = () => {
    fetch("/api/mitm/status")
      .then((r) => r.json())
      .then((d: MitmStatusData) => {
        setServerRunning(Boolean(d.running));
        if (d.port) setMitmPort(d.port);
        setCertExists(Boolean(d.certExists));
        setCertTrusted(Boolean(d.certTrusted));
        if (d.certPath) setCertPath(d.certPath);
        if (d.fingerprint) setFingerprint(d.fingerprint);
        if (d.routerBaseUrl) setRouterBaseUrl(d.routerBaseUrl);
        if (d.installCommands) setInstallCommands(d.installCommands);
        if (d.dnsStatus) {
          setDnsStatus((prev) => ({
            ...prev,
            antigravity: Boolean(d.dnsStatus?.antigravity),
            kiro: Boolean(d.dnsStatus?.kiro),
            copilot: Boolean(d.dnsStatus?.copilot),
          }));
        }
        if (d.augmentModels) {
          setAugmentModelsByTool((prev) => ({
            ...prev,
            ...d.augmentModels,
          }));
        }
        useMitmStatus.getState().fetchStatus();
      })
      .catch(() => {});
  };

  const loadToolData = () => {
    MITM_TOOLS.forEach((tool) => {
      fetch(`/api/mitm/hosts/${tool.id}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.entries) {
            setHostsByTool((prev) => ({ ...prev, [tool.id]: d.entries }));
          }
        })
        .catch(() => {});

      fetch(`/api/mitm/mappings/${tool.id}`)
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d)) {
            setMappingsByTool((prev) => ({ ...prev, [tool.id]: d }));
          }
        })
        .catch(() => {});
    });
  };

  useEffect(() => {
    loadStatus();
    loadToolData();
  }, []);

  const toggleServer = async (forceKill = false, portOverride?: number) => {
    setServerToggleError(null);
    let targetPort: number | undefined = undefined;
    if (portOverride !== undefined) {
      targetPort = portOverride;
    } else if (customPortInput.trim()) {
      const parsed = Number(customPortInput.trim());
      if (isNaN(parsed) || !Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        setServerToggleError("Port must be an integer between 1 and 65535.");
        return;
      }
      targetPort = parsed;
    }

    if (serverRunning && !forceKill) {
      setServerRunning(false);
      try {
        const res = await fetch("/api/mitm/toggle-server", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ running: false }),
        });
        const data = await res.json();
        setServerRunning(Boolean(data.running));
        if (data.port) setMitmPort(data.port);
        if (data.dnsStatus) {
          setDnsStatus({
            antigravity: Boolean(data.dnsStatus.antigravity),
            kiro: Boolean(data.dnsStatus.kiro),
            copilot: Boolean(data.dnsStatus.copilot),
          });
        }
        loadStatus();
      } catch (err: any) {
        setServerToggleError(err?.message || "Failed to stop server");
      }
      return;
    }

    if (forceKill) {
      setIsKilling(true);
    }
    try {
      const res = await fetch("/api/mitm/toggle-server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          running: true,
          port: targetPort,
          forceKill,
        }),
      });

      if (res.status === 409) {
        const data = await res.json();
        setPortConflict(data.portOwner || { port: targetPort || 443, inUse: true });
        setServerRunning(false);
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to start server (${res.status})`);
      }

      const data = await res.json();
      setServerRunning(Boolean(data.running));
      if (data.port) setMitmPort(data.port);
      if (data.dnsStatus) {
        setDnsStatus({
          antigravity: Boolean(data.dnsStatus.antigravity),
          kiro: Boolean(data.dnsStatus.kiro),
          copilot: Boolean(data.dnsStatus.copilot),
        });
      }
      if (data.warning) {
        setServerToggleError(data.warning);
      }
      setPortConflict(null);
      loadStatus();
    } catch (err: any) {
      setServerToggleError(err?.message || "Failed to start server");
    } finally {
      setIsKilling(false);
    }
  };

  const handleInstallCert = async () => {
    setInstallingCert(true);
    setCertInstallMsg(null);
    try {
      const res = await fetch("/api/mitm/install-cert", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setCertInstallMsg({ type: "success", text: data.message || "Root CA installed successfully!" });
        loadStatus();
      } else {
        setCertInstallMsg({ type: "error", text: data.message || "Installation failed" });
      }
    } catch (e: any) {
      setCertInstallMsg({ type: "error", text: e?.message || "Failed to install certificate" });
    } finally {
      setInstallingCert(false);
    }
  };

  const handleUninstallCert = async () => {
    setUninstallingCert(true);
    setCertInstallMsg(null);
    try {
      const res = await fetch("/api/mitm/uninstall-cert", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setCertInstallMsg({ type: "success", text: data.message || "Root CA uninstalled successfully!" });
        loadStatus();
      } else {
        setCertInstallMsg({ type: "error", text: data.message || "Uninstallation failed" });
      }
    } catch (e: any) {
      setCertInstallMsg({ type: "error", text: e?.message || "Failed to uninstall certificate" });
    } finally {
      setUninstallingCert(false);
    }
  };

  const toggleToolDns = async (toolId: MitmToolId) => {
    const next = !dnsStatus[toolId];
    setDnsStatus((prev) => ({ ...prev, [toolId]: next }));
    try {
      const res = await fetch("/api/mitm/toggle-dns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: toolId, active: next }),
      });
      const data = await res.json();
      if (data.dnsStatus) {
        setDnsStatus((prev) => ({
          ...prev,
          antigravity: Boolean(data.dnsStatus.antigravity),
          kiro: Boolean(data.dnsStatus.kiro),
          copilot: Boolean(data.dnsStatus.copilot),
        }));
      }
      if (data.warning) {
        setServerToggleError(data.warning);
      }
      loadStatus();
    } catch {
      //
    }
  };

  const toggleAugmentModels = async (toolId: string) => {
    const next = !augmentModelsByTool[toolId];
    setAugmentModelsByTool((prev) => ({ ...prev, [toolId]: next }));
    try {
      const res = await fetch("/api/mitm/augment-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: toolId, enabled: next }),
      });
      const data = await res.json();
      if (data.augmentModels) {
        setAugmentModelsByTool((prev) => ({ ...prev, ...data.augmentModels }));
      }
    } catch {
      setAugmentModelsByTool((prev) => ({ ...prev, [toolId]: !next }));
    }
  };

  const handleSaveToolHosts = async (toolId: string) => {
    const entries = hostsByTool[toolId] || "";
    try {
      const res = await fetch(`/api/mitm/hosts/${toolId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      if (res.ok) {
        setHostsSavedMsgByTool((prev) => ({ ...prev, [toolId]: "Saved hosts successfully." }));
        setEditingHostsByTool((prev) => ({ ...prev, [toolId]: false }));
        setTimeout(() => {
          setHostsSavedMsgByTool((prev) => ({ ...prev, [toolId]: null }));
        }, 3000);
      }
    } catch {
      //
    }
  };

  const handleResetToolHosts = async (toolId: string) => {
    try {
      const res = await fetch(`/api/mitm/hosts/${toolId}/reset`, { method: "POST" });
      const data = await res.json();
      if (data.entries) {
        setHostsByTool((prev) => ({ ...prev, [toolId]: data.entries }));
        setHostsSavedMsgByTool((prev) => ({ ...prev, [toolId]: "Hosts reset to default." }));
        setTimeout(() => {
          setHostsSavedMsgByTool((prev) => ({ ...prev, [toolId]: null }));
        }, 3000);
      }
    } catch {
      //
    }
  };

  const handleResetToolMappings = async (toolId: string) => {
    try {
      const res = await fetch("/api/mitm/mappings/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ide: toolId }),
      });
      const data = await res.json();
      if (Array.isArray(data.mappings)) {
        setMappingsByTool((prev) => ({ ...prev, [toolId]: data.mappings }));
      }
    } catch {
      //
    }
  };

  const handleAddMapping = async () => {
    if (!modalTool || !newSourceModel.trim() || !newTargetModel.trim()) return;
    const toolId = modalTool;
    const item: MitmMappingRow = {
      sourceModel: newSourceModel.trim(),
      targetModel: newTargetModel.trim(),
    };

    setMappingsByTool((prev) => ({
      ...prev,
      [toolId]: [...(prev[toolId] || []), item],
    }));

    try {
      await fetch("/api/mitm/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ide: toolId,
          sourceModel: item.sourceModel,
          targetModel: item.targetModel,
        }),
      });
    } catch {
      //
    } finally {
      setNewSourceModel("");
      setNewTargetModel("");
      setModalTool(null);
    }
  };

  const handleUpdateMapping = async (toolId: string) => {
    if (!editingSource || !targetInput.trim()) return;
    let target = targetInput.trim();
    if (comboNames.has(target.toLowerCase()) && !target.startsWith("combo/")) {
      target = `combo/${target}`;
    }

    setMappingsByTool((prev) => ({
      ...prev,
      [toolId]: (prev[toolId] || []).map((m) =>
        m.sourceModel === editingSource ? { ...m, targetModel: target } : m
      ),
    }));

    try {
      await fetch("/api/mitm/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ide: toolId,
          sourceModel: editingSource,
          targetModel: target,
        }),
      });
    } catch {
      //
    } finally {
      setEditingSource(null);
      setEditingTool(null);
      setTargetInput("");
    }
  };

  const deleteMapping = (toolId: string, sourceModel: string) => {
    setMappingsByTool((prev) => ({
      ...prev,
      [toolId]: (prev[toolId] || []).filter((m) => m.sourceModel !== sourceModel),
    }));

    fetch(`/api/mitm/mappings/${toolId}?sourceModel=${encodeURIComponent(sourceModel)}`, {
      method: "DELETE",
    }).catch(() => {});
  };

  return (
    <div className="space-y-6 w-full px-2 sm:px-4 pb-16 animate-rt-fade-in">
      {/* Warning Notice Banner */}
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 leading-relaxed">
        <span className="material-symbols-outlined text-[18px] text-amber-400 shrink-0">warning</span>
        <p>
          <strong>MITM Interceptor:</strong> Intercepts HTTPS traffic of closed IDE tools (Antigravity, Kiro, GitHub Copilot) via a local Root CA to redirect requests to your chosen providers and models. DNS is controlled independently per tool.
        </p>
      </div>

      {/* Architecture Flow Banner */}
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 leading-relaxed">
        <span className="material-symbols-outlined text-[18px] text-blue-400 shrink-0">info</span>
        <p className="font-mono text-[11px] sm:text-xs text-blue-200">
          How it works: Antigravity/Kiro IDE request → DNS redirect to localhost:443 → MITM proxy intercepts → Mapigate → response to Antigravity/Kiro
        </p>
      </div>

      {/* MITM Server Control Card */}
      <div className="rt-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1E293B]">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">alt_route</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">MITM HTTPS Proxy Server</h3>
                <span className={`rt-badge ${serverRunning ? "rt-badge--success" : "rt-badge--muted"}`}>
                  {serverRunning ? `● Running (Port :${mitmPort})` : "Stopped"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Intercepts inbound IDE requests via SNI certificate emulation on port {mitmPort}.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => toggleServer()}
              className={`rt-btn text-xs py-1.5 px-3.5 ${serverRunning ? "rt-btn--danger" : "rt-btn--primary"}`}
            >
              <span className="material-symbols-outlined text-[16px]">
                {serverRunning ? "stop" : "play_arrow"}
              </span>
              {serverRunning ? "Stop Server" : "Start Server"}
            </button>
          </div>
        </div>

        {serverToggleError && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-rose-400">error</span>
              <span>{serverToggleError}</span>
            </div>
            <button
              type="button"
              onClick={() => setServerToggleError(null)}
              className="text-rose-400 hover:text-white"
            >
              <span className="material-symbols-outlined text-[15px]">close</span>
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 pt-1 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-slate-300">Mapigate Local Endpoint:</span>
            <code className="text-blue-400 font-mono bg-[#0A0D14] px-3 py-1.5 rounded-lg border border-[#1E293B]">
              {localEndpoint}
            </code>
          </div>

          <span className="text-[11px] text-slate-400 italic">
            Enable DNS per tool below to activate redirection
          </span>
        </div>

        {/* Advanced / Custom Port Configuration */}
        <div className="pt-2 border-t border-[#1E293B]/60">
          <button
            type="button"
            onClick={() => setShowAdvancedPort((prev) => !prev)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">
              {showAdvancedPort ? "expand_less" : "tune"}
            </span>
            <span>Advanced / Custom Port Configuration</span>
          </button>

          {showAdvancedPort && (
            <div className="mt-3 p-3.5 bg-[#0A0D14] rounded-xl border border-[#1E293B] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block">
                    Custom MITM Listen Port
                  </label>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Default is port 443. Custom ports are for manual developer testing only.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="65535"
                    placeholder="443"
                    value={customPortInput}
                    onChange={(e) => setCustomPortInput(e.target.value)}
                    disabled={serverRunning}
                    className="w-24 bg-[#141B2D] border border-[#1E293B] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white text-center focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  />
                  {!serverRunning && customPortInput && (
                    <button
                      type="button"
                      onClick={() => setCustomPortInput("")}
                      className="text-xs text-slate-400 hover:text-white px-1.5 py-1 rounded"
                      title="Reset to default 443"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {/* Explicit warning banner about DNS limitation */}
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11.5px] text-amber-300 leading-relaxed">
                <span className="material-symbols-outlined text-[16px] text-amber-400 shrink-0 mt-0.5">warning</span>
                <span>
                  <strong>Notice:</strong> OS <code>hosts</code> file redirection maps domain names to IP addresses without port numbers. AI coding tools (Antigravity, Kiro, Copilot) connect to port 443 by default. Running on custom ports will <strong>not</strong> intercept standard IDE traffic.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ROOT CA CERTIFICATE MANAGEMENT CARD */}
      <div className="rt-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1E293B]">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">verified_user</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-white">SSL Root CA Certificate</h4>
                {certTrusted ? (
                  <span className="rt-badge rt-badge--success">
                    <span className="material-symbols-outlined text-[13px]">check</span> Trusted in System
                  </span>
                ) : (
                  <span className="rt-badge rt-badge--warning">
                    <span className="material-symbols-outlined text-[13px]">info</span> Not Yet Trusted
                  </span>
                )}
                {certExists && (
                  <span className="rt-badge rt-badge--info">Generated</span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Required for IDEs to accept MITM proxy SSL handshakes without security warnings.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/api/mitm/cert"
              download="mapigate-rootCA.crt"
              className="rt-btn rt-btn--secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              Download CA
            </a>
            {certTrusted ? (
              <button
                disabled={uninstallingCert}
                onClick={handleUninstallCert}
                className="rt-btn rt-btn--secondary text-xs py-1.5 px-3.5 flex items-center gap-1.5 text-rose-400 hover:text-rose-300 border-rose-500/20"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                {uninstallingCert ? "Uninstalling..." : "Uninstall from System"}
              </button>
            ) : (
              <button
                disabled={installingCert}
                onClick={handleInstallCert}
                className="rt-btn rt-btn--primary text-xs py-1.5 px-3.5 flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">add_task</span>
                {installingCert ? "Installing..." : "Install to System Store"}
              </button>
            )}
          </div>
        </div>

        {/* Certificate Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-[#0A0D14] rounded-xl border border-[#1E293B] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-medium">SHA1 Fingerprint:</span>
              {fingerprint && (
                <button
                  onClick={() => copyText("fp", fingerprint)}
                  className="text-blue-400 hover:text-blue-300 font-mono text-[11px] flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[13px]">content_copy</span>
                  {copiedKey === "fp" ? "Copied" : "Copy"}
                </button>
              )}
            </div>
            <code className="text-purple-300 font-mono text-[11px] block break-all">
              {fingerprint || "Generating upon first start..."}
            </code>
          </div>

          <div className="p-3 bg-[#0A0D14] rounded-xl border border-[#1E293B] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-medium">CA File Path:</span>
              {certPath && (
                <button
                  onClick={() => copyText("cp", certPath)}
                  className="text-blue-400 hover:text-blue-300 font-mono text-[11px] flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[13px]">content_copy</span>
                  {copiedKey === "cp" ? "Copied" : "Copy"}
                </button>
              )}
            </div>
            <code className="text-slate-300 font-mono text-[11px] block truncate">
              {certPath || "~/.mapigate/mitm/rootCA.crt"}
            </code>
          </div>
        </div>

        {/* Manual Terminal Install Commands */}
        <div className="space-y-2 text-xs">
          <span className="font-semibold text-slate-300 block">Manual Installation Commands:</span>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            {/* Windows Command */}
            <div className="p-3 rounded-xl bg-[#0A0D14] border border-[#1E293B] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">Windows (PowerShell / cmd):</span>
                <button
                  onClick={() => copyText("winCmd", installCommands.windows)}
                  className="text-blue-400 hover:text-blue-300 font-mono text-[11px] flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[13px]">content_copy</span>
                  {copiedKey === "winCmd" ? "Copied!" : "Copy"}
                </button>
              </div>
              <code className="text-emerald-400 font-mono text-[11px] block break-all bg-[#05070B] p-2 rounded-lg border border-[#1E293B]">
                {installCommands.windows}
              </code>
            </div>

            {/* macOS Command */}
            <div className="p-3 rounded-xl bg-[#0A0D14] border border-[#1E293B] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">macOS (Terminal):</span>
                <button
                  onClick={() => copyText("macCmd", installCommands.mac)}
                  className="text-blue-400 hover:text-blue-300 font-mono text-[11px] flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[13px]">content_copy</span>
                  {copiedKey === "macCmd" ? "Copied!" : "Copy"}
                </button>
              </div>
              <code className="text-emerald-400 font-mono text-[11px] block break-all bg-[#05070B] p-2 rounded-lg border border-[#1E293B]">
                {installCommands.mac}
              </code>
            </div>
          </div>
        </div>

        {/* Cert Installation Message */}
        {certInstallMsg && (
          <div
            className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
              certInstallMsg.type === "success"
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                : "bg-red-500/10 border border-red-500/20 text-red-400"
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              {certInstallMsg.type === "success" ? "check_circle" : "error"}
            </span>
            {certInstallMsg.text}
          </div>
        )}
      </div>

      {/* INDEPENDENT TOOL ACCORDIONS (Antigravity, Cursor, GitHub Copilot, Kiro - sorted alphabetically) */}
      <div className="space-y-4">
        {sortedMitmTools.map((tool) => {
          const isExpanded = expandedTool === tool.id;
          const isDnsOn = Boolean(dnsStatus[tool.id]);
          const isEditingHosts = Boolean(editingHostsByTool[tool.id]);
          const toolHosts = hostsByTool[tool.id] || tool.defaultHost;
          const sortBy = sortColumnByTool[tool.id] || "source";
          const sortOrder = sortOrderByTool[tool.id] || "asc";
          const toolMappings = sortMitmMappings(mappingsByTool[tool.id] || [], sortBy, sortOrder);
          const savedMsg = hostsSavedMsgByTool[tool.id];

          const toggleSort = (col: "source" | "target") => {
            if (sortBy === col) {
              setSortOrderByTool((prev) => ({
                ...prev,
                [tool.id]: sortOrder === "asc" ? "desc" : "asc",
              }));
            } else {
              setSortColumnByTool((prev) => ({ ...prev, [tool.id]: col }));
              setSortOrderByTool((prev) => ({ ...prev, [tool.id]: "asc" }));
            }
          };

          return (
            <div key={tool.id} className="rt-card p-5 space-y-4">
              {/* Accordion Header */}
              <div
                onClick={() => setExpandedTool(isExpanded ? null : tool.id)}
                className="flex items-center justify-between cursor-pointer select-none"
              >
                <div className="flex items-center gap-3.5">
                  <ToolIcon
                    src={tool.image}
                    name={tool.name}
                    iconBg={tool.iconBg}
                    size="md"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white">{tool.name}</h4>
                      <span className={`rt-badge ${isDnsOn ? "rt-badge--success" : "rt-badge--muted"}`}>
                        {isDnsOn ? "DNS on" : "DNS off"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{tool.desc}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleToolDns(tool.id);
                    }}
                    className={`rt-btn text-xs py-1.5 px-3 ${isDnsOn ? "rt-btn--danger" : "rt-btn--primary"}`}
                  >
                    <span className="material-symbols-outlined text-[15px]">
                      {isDnsOn ? "stop" : "play_arrow"}
                    </span>
                    {isDnsOn ? "Stop DNS" : "Start DNS"}
                  </button>

                  <span className="material-symbols-outlined text-[20px] text-slate-500">
                    {isExpanded ? "expand_less" : "expand_more"}
                  </span>
                </div>
              </div>

              {/* Accordion Content */}
              {isExpanded && (
                <div className="pt-4 border-t border-[#1E293B] space-y-5 text-xs animate-rt-fade-in">
                  {/* Block 1: Tool-specific Hosts Configuration */}
                  <div className="space-y-3 p-4 rounded-xl bg-[#0A0D14] border border-[#1E293B]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h5 className="font-bold text-white flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-blue-400 text-[16px]">dns</span>
                          Hosts File Entries ({tool.name})
                        </h5>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Domain mappings added to your system hosts file when DNS redirection is enabled.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {isEditingHosts ? (
                          <>
                            <button
                              onClick={() => {
                                if (originalHostsByTool[tool.id] !== undefined) {
                                  setHostsByTool((prev) => ({
                                    ...prev,
                                    [tool.id]: originalHostsByTool[tool.id],
                                  }));
                                }
                                setEditingHostsByTool((prev) => ({ ...prev, [tool.id]: false }));
                              }}
                              className="rt-btn rt-btn--secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
                            >
                              <span className="material-symbols-outlined text-[14px]">close</span>
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSaveToolHosts(tool.id)}
                              className="rt-btn rt-btn--primary text-xs py-1.5 px-3 flex items-center gap-1.5"
                            >
                              <span className="material-symbols-outlined text-[14px]">save</span>
                              Save Hosts
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleResetToolHosts(tool.id)}
                              className="rt-btn rt-btn--secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
                              title="Reset hosts entries to tool default"
                            >
                              <span className="material-symbols-outlined text-[14px]">restart_alt</span>
                              Reset
                            </button>
                            <button
                              onClick={() => {
                                setOriginalHostsByTool((prev) => ({
                                  ...prev,
                                  [tool.id]: toolHosts,
                                }));
                                setEditingHostsByTool((prev) => ({ ...prev, [tool.id]: true }));
                              }}
                              className="rt-btn rt-btn--secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
                            >
                              <span className="material-symbols-outlined text-[14px]">edit</span>
                              Edit
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <textarea
                      readOnly={!isEditingHosts}
                      rows={Math.max(2, toolHosts.split("\n").length + 1)}
                      value={toolHosts}
                      onChange={(e) =>
                        setHostsByTool((prev) => ({ ...prev, [tool.id]: e.target.value }))
                      }
                      className={`w-full border rounded-xl p-3 text-xs font-mono leading-relaxed transition-colors ${
                        isEditingHosts
                          ? "bg-[#05070B] border-blue-500/60 text-emerald-400 cursor-text focus:outline-none focus:border-blue-500"
                          : "bg-[#07090E] border-[#1E293B] text-emerald-400/80 cursor-default focus:outline-none"
                      }`}
                      placeholder="127.0.0.1 domain"
                    />

                    {savedMsg && (
                      <div className="text-[11px] text-emerald-400 font-mono flex items-center gap-1.5 animate-rt-scale-in">
                        <span className="material-symbols-outlined text-[15px]">check_circle</span>
                        {savedMsg}
                      </div>
                    )}
                  </div>

                  {/* Block 1.5: Expand / Augment Models in IDE */}
                  {(tool.id === "kiro" || Boolean(tool.isModelListRequest)) && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-[#0A0D14] border border-[#1E293B]">
                      <div className="flex items-start sm:items-center gap-3">
                        <div className="size-8 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                          <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-xs">Augment Models in IDE</span>
                            <span className={`rt-badge ${augmentModelsByTool[tool.id] ? "rt-badge--success" : "rt-badge--muted"}`}>
                              {augmentModelsByTool[tool.id] ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Injects Mapigate's rich model catalog into {tool.name} so you can select from all models in the IDE regardless of your account's tier.
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleAugmentModels(tool.id)}
                        className={`rt-btn text-xs py-1.5 px-3.5 shrink-0 flex items-center gap-1.5 cursor-pointer ${
                          augmentModelsByTool[tool.id] ? "rt-btn--primary" : "rt-btn--secondary"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[15px]">
                          {augmentModelsByTool[tool.id] ? "toggle_on" : "toggle_off"}
                        </span>
                        {augmentModelsByTool[tool.id] ? "Enabled" : "Enable"}
                      </button>
                    </div>
                  )}

                  {/* Block 2: Model Redirection Mappings */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-slate-200 block text-xs">
                          Model Redirection Mappings ({tool.name})
                        </span>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Map requested models to your chosen Mapigate providers and upstream model IDs (slashes / supported).
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleResetToolMappings(tool.id)}
                          className="rt-btn rt-btn--secondary text-xs py-1.5 px-3"
                          title="Reset to default mappings"
                        >
                          <span className="material-symbols-outlined text-[14px]">restart_alt</span>
                          Reset to Default
                        </button>
                        <button
                          onClick={() => {
                            setModalTool(tool.id);
                            setNewSourceModel("");
                            setNewTargetModel("");
                          }}
                          className="rt-btn rt-btn--primary text-xs py-1.5 px-3"
                        >
                          <span className="material-symbols-outlined text-[14px]">add</span>
                          Add Mapping
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#1E293B] overflow-visible bg-[#0A0D14]">
                      {toolMappings.length === 0 ? (
                        <div className="p-4 text-xs text-slate-500 italic text-center">
                          No model mappings configured for {tool.name}. Click 'Add Mapping' or 'Reset to Default'.
                        </div>
                      ) : (
                        <table className="w-full text-left text-xs font-mono">
                          <thead className="bg-[#0D121F] text-slate-400 font-sans text-[11px] uppercase tracking-wider border-b border-[#1E293B]">
                            <tr>
                              <th
                                onClick={() => toggleSort("source")}
                                className="p-3 font-semibold cursor-pointer hover:text-white select-none transition-colors"
                                title="Click to sort by Source Model"
                              >
                                <div className="flex items-center gap-1.5">
                                  <span>Source Model (IDE)</span>
                                  <span className="material-symbols-outlined text-[14px] text-blue-400">
                                    {sortBy === "source" ? (sortOrder === "asc" ? "arrow_upward" : "arrow_downward") : "unfold_more"}
                                  </span>
                                </div>
                              </th>
                              <th
                                onClick={() => toggleSort("target")}
                                className="p-3 font-semibold cursor-pointer hover:text-white select-none transition-colors"
                                title="Click to sort by Target Model"
                              >
                                <div className="flex items-center gap-1.5">
                                  <span>Target Model (Mapigate)</span>
                                  <span className="material-symbols-outlined text-[14px] text-blue-400">
                                    {sortBy === "target" ? (sortOrder === "asc" ? "arrow_upward" : "arrow_downward") : "unfold_more"}
                                  </span>
                                </div>
                              </th>
                              <th className="p-3 font-semibold text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#1E293B]">
                            {toolMappings.map((m, idx) => {
                              const isEditing = editingTool === tool.id && editingSource === m.sourceModel;
                              const sourceDisplayName = resolveModelDisplayName(m.sourceModel);
                              const isSourceDifferent = Boolean(
                                sourceDisplayName &&
                                sourceDisplayName !== m.sourceModel
                              );
                              const targetDisplayName = m.targetModel
                                ? resolveModelDisplayName(m.targetModel)
                                : "";
                              const isCombo = Boolean(
                                m.targetModel &&
                                (m.targetModel.startsWith("combo/") || comboNames.has(m.targetModel.toLowerCase()))
                              );
                              const effectiveTargetModel = isCombo && !m.targetModel.startsWith("combo/")
                                ? `combo/${m.targetModel}`
                                : m.targetModel;
                              const isTargetDifferent = Boolean(
                                effectiveTargetModel &&
                                targetDisplayName &&
                                targetDisplayName !== effectiveTargetModel
                              );

                              return (
                                <tr
                                  key={idx}
                                  className={`transition-colors ${isEditing ? "bg-blue-500/10" : "hover:bg-white/5"}`}
                                >
                                  <td className="p-3">
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-slate-100 font-sans font-semibold text-xs leading-snug">
                                        {sourceDisplayName || m.sourceModel}
                                      </span>
                                      {isSourceDifferent && (
                                        <span className="text-[10.5px] font-mono text-slate-400">
                                          {m.sourceModel}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="p-3 text-blue-400">
                                    {isEditing ? (
                                      <div className="flex items-center gap-1.5 w-full max-w-sm">
                                        <span className="text-blue-400 font-mono">→</span>
                                        <ModelAutocompleteInput
                                          value={targetInput}
                                          onChange={setTargetInput}
                                          onEnter={() => handleUpdateMapping(tool.id)}
                                          placeholder="Search connected model..."
                                          className="bg-[#080B11] border border-blue-500/60 focus:border-blue-400 rounded-lg px-2.5 py-1 text-xs text-white font-mono w-full focus:outline-none"
                                          autoFocus
                                        />
                                      </div>
                                    ) : m.targetModel ? (
                                      <div className="flex flex-col gap-0.5">
                                        <div className="inline-flex items-center gap-1.5 flex-wrap">
                                          <span className="text-slate-500 font-mono">→</span>
                                          {isCombo && (
                                            <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 border border-cyan-500/40 text-[9.5px] font-mono text-cyan-300 font-semibold tracking-wide">
                                              COMBO
                                            </span>
                                          )}
                                          <span className="text-emerald-300 font-sans font-semibold text-xs leading-snug">
                                            {targetDisplayName || effectiveTargetModel}
                                          </span>
                                        </div>
                                        {isTargetDifferent && (
                                          <span className="text-[10.5px] font-mono text-slate-400 pl-4">
                                            {effectiveTargetModel}
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-slate-500 italic text-xs px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/40">
                                        (unmapped)
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-3 text-right space-x-2 whitespace-nowrap">
                                    {isEditing ? (
                                      <>
                                        <button
                                          onClick={() => handleUpdateMapping(tool.id)}
                                          className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-sans text-[11px] font-medium transition-colors cursor-pointer"
                                        >
                                          Save
                                        </button>
                                        <button
                                          onClick={() => {
                                            setEditingSource(null);
                                            setEditingTool(null);
                                            setTargetInput("");
                                          }}
                                          className="px-2.5 py-1 rounded bg-[#0E1320] hover:bg-slate-700 border border-[#1E293B] text-slate-400 hover:text-white font-sans text-[11px] transition-colors cursor-pointer"
                                        >
                                          Cancel
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <button
                                          onClick={() => {
                                            setEditingTool(tool.id);
                                            setEditingSource(m.sourceModel);
                                            setTargetInput(m.targetModel);
                                          }}
                                          className="px-2.5 py-1 rounded bg-[#0E1320] hover:bg-blue-600 hover:text-white border border-[#1E293B] text-slate-300 transition-colors cursor-pointer font-sans text-[11px]"
                                        >
                                          Edit
                                        </button>
                                        <button
                                          onClick={() => deleteMapping(tool.id, m.sourceModel)}
                                          className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                                          title="Delete mapping"
                                        >
                                          <span className="material-symbols-outlined text-[15px]">close</span>
                                        </button>
                                      </>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add New Mapping Modal (Mounted via React Portal) */}
      <PortalModal
        isOpen={Boolean(modalTool)}
        onClose={() => setModalTool(null)}
        maxWidthClass="max-w-md"
      >
        {modalTool && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400 text-[18px]">add_circle</span>
                Add Model Mapping ({modalTool.toUpperCase()})
              </h4>
              <button
                onClick={() => setModalTool(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Source Model ID (Sent by IDE)
                </label>
                <SourceModelAutocompleteInput
                  toolId={modalTool}
                  value={newSourceModel}
                  onChange={setNewSourceModel}
                  placeholder="Select or type model ID (e.g. auto, claude-sonnet-4.5)..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Target Upstream Model ID (Mapigate Provider Model)
                </label>
                <ModelAutocompleteInput
                  value={newTargetModel}
                  onChange={setNewTargetModel}
                  placeholder="Search connected model..."
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Supports slash / formats, e.g. provider/model-name.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#1E293B]">
              <button
                onClick={() => setModalTool(null)}
                className="rt-btn rt-btn--secondary text-xs py-1.5 px-3"
              >
                Cancel
              </button>
              <button
                onClick={handleAddMapping}
                className="rt-btn rt-btn--primary text-xs py-1.5 px-4"
              >
                Add Mapping
              </button>
            </div>
          </div>
        )}
      </PortalModal>

      {/* Port Conflict Modal Dialog (Mounted via React Portal) */}
      <PortalModal
        isOpen={Boolean(portConflict)}
        onClose={() => setPortConflict(null)}
        maxWidthClass="max-w-md"
      >
        {portConflict && (() => {
          const isTimeWait = portConflict.pid === 0 || Boolean(portConflict.processName?.toLowerCase().includes("idle"));

          return (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
              <div className="flex items-center gap-2">
                <span
                  className={`material-symbols-outlined text-[20px] ${
                    isTimeWait ? "text-blue-400" : portConflict.isSystemProcess ? "text-rose-400" : "text-amber-400"
                  }`}
                >
                  {isTimeWait ? "hourglass_top" : portConflict.isSystemProcess ? "gpp_bad" : "warning"}
                </span>
                <h4 className="text-sm font-bold text-white">
                  Port {portConflict.port} {isTimeWait ? "Socket Releasing" : portConflict.isSystemProcess ? "System Conflict" : "Already In Use"}
                </h4>
              </div>
              <button
                onClick={() => setPortConflict(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {isTimeWait ? (
              /* Transient TIME_WAIT Socket from Restart */
              <div className="space-y-3 text-xs">
                <div className="p-3.5 bg-blue-500/10 border border-blue-500/30 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-blue-300 font-semibold">
                    <span className="material-symbols-outlined text-[16px]">hourglass_top</span>
                    <span>Socket Releasing (TIME_WAIT)</span>
                  </div>
                  <p className="text-slate-300 text-[11.5px] leading-relaxed">
                    Port {portConflict.port} is currently releasing from a recent restart (<strong className="text-white">TCP TIME_WAIT</strong>). The operating system will free this socket in a few seconds. Click <strong>Retry</strong> to start the MITM server.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1E293B]">
                  <button
                    type="button"
                    onClick={() => setPortConflict(null)}
                    className="rt-btn rt-btn--secondary text-xs py-1.5 px-3"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleServer(false, portConflict.port)}
                    className="rt-btn rt-btn--primary text-xs py-1.5 px-3.5 flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[14px]">refresh</span>
                    Retry
                  </button>
                </div>
              </div>
            ) : portConflict.isSystemProcess ? (
              /* Windows System Process Conflict (PID <= 4 / HTTP.sys / IIS) */
              <div className="space-y-3 text-xs">
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-rose-300 font-semibold">
                    <span className="material-symbols-outlined text-[16px]">admin_panel_settings</span>
                    <span>Windows Kernel / System Service Conflict</span>
                  </div>
                  <p className="text-slate-300 text-[11.5px] leading-relaxed">
                    Port {portConflict.port} is occupied by{" "}
                    <strong>{portConflict.processName || "System"}</strong> (PID {portConflict.pid ?? 4}).
                    This is a Windows system kernel service (e.g. <code>HTTP.sys</code>, IIS, or Web Publishing Service) and cannot be killed directly.
                  </p>
                </div>

                <div className="p-3 bg-[#0A0D14] border border-[#1E293B] rounded-xl space-y-2">
                  <span className="text-slate-400 text-[11px] font-semibold block">
                    Run these commands as Administrator to release the port:
                  </span>
                  <div className="space-y-1.5 font-mono text-[11px]">
                    <div className="flex items-center justify-between bg-[#141B2D] px-2.5 py-1.5 rounded-lg border border-[#1E293B]">
                      <code className="text-cyan-300">iisreset /stop</code>
                      <button
                        type="button"
                        onClick={() => copyText("iisreset", "iisreset /stop")}
                        className="text-slate-400 hover:text-white ml-2 shrink-0"
                        title="Copy command"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {copiedKey === "iisreset" ? "check" : "content_copy"}
                        </span>
                      </button>
                    </div>
                    <div className="flex items-center justify-between bg-[#141B2D] px-2.5 py-1.5 rounded-lg border border-[#1E293B]">
                      <code className="text-cyan-300">net stop w3svc</code>
                      <button
                        type="button"
                        onClick={() => copyText("w3svc", "net stop w3svc")}
                        className="text-slate-400 hover:text-white ml-2 shrink-0"
                        title="Copy command"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {copiedKey === "w3svc" ? "check" : "content_copy"}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1E293B]">
                  <button
                    type="button"
                    onClick={() => setPortConflict(null)}
                    className="rt-btn rt-btn--secondary text-xs py-1.5 px-3"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleServer(false, portConflict.port)}
                    className="rt-btn rt-btn--primary text-xs py-1.5 px-3.5 flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[14px]">refresh</span>
                    Retry
                  </button>
                </div>
              </div>
            ) : (
              /* Regular Process Conflict */
              <div className="space-y-3 text-xs">
                <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
                  <p className="text-slate-300 text-[11.5px] leading-relaxed">
                    Port {portConflict.port} is currently used by another process:
                  </p>
                  <div className="p-2.5 bg-[#0A0D14] rounded-lg border border-[#1E293B] font-mono text-xs text-amber-200">
                    <div>
                      Process: <strong className="text-white">{portConflict.processName || "Unknown"}</strong>
                    </div>
                    <div>
                      PID: <strong className="text-white">{portConflict.pid ?? "Unknown"}</strong>
                    </div>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Kill this process to start MITM Proxy on port {portConflict.port}?
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1E293B]">
                  <button
                    type="button"
                    onClick={() => setPortConflict(null)}
                    className="rt-btn rt-btn--secondary text-xs py-1.5 px-3"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isKilling}
                    onClick={() => toggleServer(true, portConflict.port)}
                    className="rt-btn rt-btn--danger text-xs py-1.5 px-3.5 flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {isKilling ? "hourglass_empty" : "power_settings_new"}
                    </span>
                    {isKilling ? "Terminating..." : "Kill & Start"}
                  </button>
                </div>
              </div>
            )}
          </div>
          );
        })()}
      </PortalModal>
    </div>
  );
};
