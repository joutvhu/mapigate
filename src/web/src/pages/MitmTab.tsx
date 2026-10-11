import React, { useState, useEffect } from "react";
import { PortalModal } from "../components/PortalModal";

interface MitmMappingRow {
  sourceModel: string;
  targetModel: string;
}

type MitmToolId = "antigravity" | "kiro" | "copilot" | "cursor";

interface MitmToolConfig {
  id: MitmToolId;
  name: string;
  image: string;
  desc: string;
  defaultHost: string;
}

const MITM_TOOLS: MitmToolConfig[] = [
  {
    id: "antigravity",
    name: "Antigravity IDE",
    image: "/providers/antigravity.png",
    desc: "Intercept Google Antigravity IDE requests via MITM proxy",
    defaultHost: "127.0.0.1 daily-cloudcode-pa.googleapis.com\n127.0.0.1 cloudcode-pa.googleapis.com",
  },
  {
    id: "kiro",
    name: "Kiro IDE",
    image: "/providers/kiro.png",
    desc: "Intercept Amazon Kiro IDE requests via MITM proxy",
    defaultHost: "127.0.0.1 runtime.us-east-1.kiro.dev\n127.0.0.1 q.us-east-1.amazonaws.com\n127.0.0.1 codewhisperer.us-east-1.amazonaws.com",
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    image: "/providers/copilot.png",
    desc: "Intercept GitHub Copilot requests in VS Code via MITM proxy",
    defaultHost: "127.0.0.1 api.individual.githubcopilot.com",
  },
  {
    id: "cursor",
    name: "Cursor",
    image: "/providers/cursor.png",
    desc: "Intercept Cursor IDE requests via MITM proxy (Coming Soon)",
    defaultHost: "127.0.0.1 api2.cursor.sh",
  },
];

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
  routerBaseUrl: string;
}

export const MitmTab: React.FC = () => {
  const [serverRunning, setServerRunning] = useState(true);
  const [mitmPort, setMitmPort] = useState(443);
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
  const [certInstallMsg, setCertInstallMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [dnsStatus, setDnsStatus] = useState<Record<string, boolean>>({
    antigravity: false,
    kiro: true,
    copilot: false,
    cursor: false,
  });
  const [expandedTool, setExpandedTool] = useState<MitmToolId | null>("kiro");

  // Per-tool Hosts State
  const [hostsByTool, setHostsByTool] = useState<Record<string, string>>({
    antigravity: "127.0.0.1 daily-cloudcode-pa.googleapis.com\n127.0.0.1 cloudcode-pa.googleapis.com",
    kiro: "127.0.0.1 runtime.us-east-1.kiro.dev\n127.0.0.1 q.us-east-1.amazonaws.com\n127.0.0.1 codewhisperer.us-east-1.amazonaws.com",
    copilot: "127.0.0.1 api.individual.githubcopilot.com",
    cursor: "127.0.0.1 api2.cursor.sh",
  });
  const [hostsSavedMsgByTool, setHostsSavedMsgByTool] = useState<Record<string, string | null>>({});

  // Per-tool Mappings State
  const [mappingsByTool, setMappingsByTool] = useState<Record<string, MitmMappingRow[]>>({
    antigravity: [],
    kiro: [],
    copilot: [],
    cursor: [],
  });

  // Editing mapping
  const [editingTool, setEditingTool] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<string | null>(null);
  const [targetInput, setTargetInput] = useState("");

  // Add Mapping Modal
  const [modalTool, setModalTool] = useState<MitmToolId | null>(null);
  const [newSourceModel, setNewSourceModel] = useState("");
  const [newTargetModel, setNewTargetModel] = useState("");

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
        if (d.installCommands) setInstallCommands(d.installCommands);
        if (d.dnsStatus) {
          setDnsStatus((prev) => ({
            ...prev,
            antigravity: Boolean(d.dnsStatus?.antigravity),
            kiro: Boolean(d.dnsStatus?.kiro),
            copilot: Boolean(d.dnsStatus?.copilot),
            cursor: Boolean(d.dnsStatus?.cursor),
          }));
        }
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

  const toggleServer = async () => {
    const next = !serverRunning;
    setServerRunning(next);
    try {
      const res = await fetch("/api/mitm/toggle-server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ running: next }),
      });
      const data = await res.json();
      setServerRunning(Boolean(data.running));
      if (data.port) setMitmPort(data.port);
    } catch {
      //
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
          cursor: Boolean(data.dnsStatus.cursor),
        }));
      }
    } catch {
      //
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
    const target = targetInput.trim();

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
          ⚠️ <strong>MITM Interceptor:</strong> Intercepts HTTPS traffic of closed IDE tools (Antigravity, Kiro, GitHub Copilot, Cursor) via a local Root CA to redirect requests to your chosen providers and models. DNS is controlled independently per tool.
        </p>
      </div>

      {/* MITM Server Control Card */}
      <div className="rt-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1E293B]">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">security</span>
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
              onClick={toggleServer}
              className={`rt-btn text-xs py-1.5 px-3.5 ${serverRunning ? "rt-btn--danger" : "rt-btn--primary"}`}
            >
              <span className="material-symbols-outlined text-[16px]">
                {serverRunning ? "stop" : "play_arrow"}
              </span>
              {serverRunning ? "Stop Server" : "Start Server"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-1 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-slate-300">Mapigate Local Endpoint:</span>
            <code className="text-blue-400 font-mono bg-[#0A0D14] px-3 py-1.5 rounded-lg border border-[#1E293B]">
              http://127.0.0.1:20127
            </code>
          </div>

          <span className="text-[11px] text-slate-400 italic">
            Enable DNS per tool below to activate redirection
          </span>
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
            <button
              disabled={installingCert}
              onClick={handleInstallCert}
              className="rt-btn rt-btn--primary text-xs py-1.5 px-3.5 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">add_task</span>
              {installingCert ? "Installing..." : "Install to System Store"}
            </button>
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

      {/* INDEPENDENT TOOL ACCORDIONS (Antigravity, Kiro, GitHub Copilot, Cursor) */}
      <div className="space-y-4">
        {MITM_TOOLS.map((tool) => {
          const isExpanded = expandedTool === tool.id;
          const isDnsOn = Boolean(dnsStatus[tool.id]);
          const toolHosts = hostsByTool[tool.id] || tool.defaultHost;
          const toolMappings = mappingsByTool[tool.id] || [];
          const savedMsg = hostsSavedMsgByTool[tool.id];

          return (
            <div key={tool.id} className="rt-card p-5 space-y-4">
              {/* Accordion Header */}
              <div
                onClick={() => setExpandedTool(isExpanded ? null : tool.id)}
                className="flex items-center justify-between cursor-pointer select-none"
              >
                <div className="flex items-center gap-3.5">
                  <div className="size-9 rounded-xl bg-[#0D1322] border border-[#1E293B] p-1.5 flex items-center justify-center shrink-0">
                    <img src={tool.image} alt={tool.name} className="size-full object-contain" />
                  </div>
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
                        <button
                          onClick={() => handleResetToolHosts(tool.id)}
                          className="rt-btn rt-btn--secondary text-xs py-1.5 px-3"
                          title="Reset hosts entries to tool default"
                        >
                          <span className="material-symbols-outlined text-[14px]">restart_alt</span>
                          Reset
                        </button>
                        <button
                          onClick={() => handleSaveToolHosts(tool.id)}
                          className="rt-btn rt-btn--primary text-xs py-1.5 px-3"
                        >
                          <span className="material-symbols-outlined text-[14px]">save</span>
                          Save Hosts
                        </button>
                      </div>
                    </div>

                    <textarea
                      rows={Math.max(2, toolHosts.split("\n").length + 1)}
                      value={toolHosts}
                      onChange={(e) =>
                        setHostsByTool((prev) => ({ ...prev, [tool.id]: e.target.value }))
                      }
                      className="w-full bg-[#05070B] border border-[#1E293B] rounded-xl p-3 text-xs font-mono text-emerald-400 focus:outline-none focus:border-blue-500 leading-relaxed"
                      placeholder="127.0.0.1 domain"
                    />

                    {savedMsg && (
                      <div className="text-[11px] text-emerald-400 font-mono flex items-center gap-1.5 animate-rt-scale-in">
                        <span className="material-symbols-outlined text-[15px]">check_circle</span>
                        {savedMsg}
                      </div>
                    )}
                  </div>

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

                    {/* Inline edit box if editing */}
                    {editingTool === tool.id && editingSource && (
                      <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-between gap-3 text-xs animate-rt-scale-in">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="font-mono text-slate-200 font-medium">{editingSource}</span>
                          <span className="text-blue-400">→</span>
                          <input
                            type="text"
                            value={targetInput}
                            onChange={(e) => setTargetInput(e.target.value)}
                            placeholder="Target model (e.g. ag/gemini-3.8-flash or cc/claude-sonnet-4-6)"
                            className="flex-1 bg-[#0A0D14] border border-blue-500/50 rounded-lg px-2.5 py-1 text-xs text-white font-mono focus:outline-none"
                            autoFocus
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setEditingSource(null);
                              setEditingTool(null);
                            }}
                            className="px-2.5 py-1 rounded bg-[#0A0D14] border border-[#1E293B] text-slate-400 hover:text-white"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleUpdateMapping(tool.id)}
                            className="rt-btn rt-btn--primary text-xs py-1 px-3"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="rounded-xl border border-[#1E293B] overflow-hidden bg-[#0A0D14]">
                      {toolMappings.length === 0 ? (
                        <div className="p-4 text-xs text-slate-500 italic text-center">
                          No model mappings configured for {tool.name}. Click 'Add Mapping' or 'Reset to Default'.
                        </div>
                      ) : (
                        <table className="w-full text-left text-xs font-mono">
                          <tbody className="divide-y divide-[#1E293B]">
                            {toolMappings.map((m, idx) => (
                              <tr key={idx} className="hover:bg-white/5 transition-colors">
                                <td className="p-3 text-slate-200 font-sans font-medium">
                                  {m.sourceModel}
                                </td>
                                <td className="p-3 text-blue-400">
                                  → <span className="text-emerald-300 ml-1 font-mono">{m.targetModel}</span>
                                </td>
                                <td className="p-3 text-right space-x-2">
                                  <button
                                    onClick={() => {
                                      setEditingTool(tool.id);
                                      setEditingSource(m.sourceModel);
                                      setTargetInput(m.targetModel);
                                    }}
                                    className="px-2.5 py-1 rounded bg-[#0E1320] hover:bg-blue-600 hover:text-white border border-[#1E293B] text-slate-300 transition-colors cursor-pointer font-sans text-[11px]"
                                  >
                                    Select
                                  </button>
                                  <button
                                    onClick={() => deleteMapping(tool.id, m.sourceModel)}
                                    className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                                    title="Delete mapping"
                                  >
                                    <span className="material-symbols-outlined text-[15px]">close</span>
                                  </button>
                                </td>
                              </tr>
                            ))}
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
                <input
                  type="text"
                  placeholder="e.g. auto, claude-sonnet-5, gpt-4o"
                  value={newSourceModel}
                  onChange={(e) => setNewSourceModel(e.target.value)}
                  className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Target Upstream Model ID (Mapigate Provider Model)
                </label>
                <input
                  type="text"
                  placeholder="e.g. ag/gemini-3.8-flash or cc/claude-sonnet-4-6"
                  value={newTargetModel}
                  onChange={(e) => setNewTargetModel(e.target.value)}
                  className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
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
    </div>
  );
};
