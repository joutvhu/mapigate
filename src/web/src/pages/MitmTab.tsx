import React, { useState, useEffect } from "react";

interface MitmMappingRow {
  sourceModel: string;
  targetModel: string;
}

interface MitmToolConfig {
  id: "antigravity" | "kiro" | "copilot";
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
    defaultHost: "127.0.0.1 daily-cloudcode-pa.googleapis.com",
  },
  {
    id: "kiro",
    name: "Kiro IDE",
    image: "/providers/kiro.png",
    desc: "Intercept Kiro IDE requests via MITM proxy",
    defaultHost: "127.0.0.1 runtime.us-east-1.kiro.dev\n127.0.0.1 api.kiro.dev",
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    image: "/providers/copilot.png",
    desc: "Intercept GitHub Copilot requests in VS Code via MITM proxy",
    defaultHost: "127.0.0.1 api.githubcopilot.com",
  },
];

export const MitmTab: React.FC = () => {
  const [serverRunning, setServerRunning] = useState(true);
  const [dnsStatus, setDnsStatus] = useState<Record<string, boolean>>({
    antigravity: false,
    kiro: true,
    copilot: false,
  });
  const [expandedTool, setExpandedTool] = useState<"antigravity" | "kiro" | "copilot" | null>("kiro");

  // Per-tool Hosts State
  const [hostsByTool, setHostsByTool] = useState<Record<string, string>>({
    antigravity: "127.0.0.1 daily-cloudcode-pa.googleapis.com",
    kiro: "127.0.0.1 runtime.us-east-1.kiro.dev\n127.0.0.1 api.kiro.dev",
    copilot: "127.0.0.1 api.githubcopilot.com",
  });
  const [hostsSavedMsgByTool, setHostsSavedMsgByTool] = useState<Record<string, string | null>>({});

  // Per-tool Mappings State
  const [mappingsByTool, setMappingsByTool] = useState<Record<string, MitmMappingRow[]>>({
    antigravity: [],
    kiro: [],
    copilot: [],
  });

  // Editing mapping
  const [editingTool, setEditingTool] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<string | null>(null);
  const [targetInput, setTargetInput] = useState("");

  // Add Mapping Modal
  const [modalTool, setModalTool] = useState<"antigravity" | "kiro" | "copilot" | null>(null);
  const [newSourceModel, setNewSourceModel] = useState("");
  const [newTargetModel, setNewTargetModel] = useState("");

  // Initial load
  useEffect(() => {
    // 1. Status
    fetch("/api/mitm/status")
      .then((r) => r.json())
      .then((d) => {
        setServerRunning(d.running);
        if (d.dnsStatus) {
          setDnsStatus({
            antigravity: Boolean(d.dnsStatus.antigravity),
            kiro: Boolean(d.dnsStatus.kiro),
            copilot: Boolean(d.dnsStatus.copilot),
          });
        }
      })
      .catch(() => {});

    // 2. Load hosts and mappings for each tool
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
  }, []);

  const toggleServer = async () => {
    const next = !serverRunning;
    setServerRunning(next);
    try {
      await fetch("/api/mitm/toggle-server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ running: next }),
      });
    } catch {
      //
    }
  };

  const toggleToolDns = async (toolId: "antigravity" | "kiro" | "copilot") => {
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
        setDnsStatus({
          antigravity: Boolean(data.dnsStatus.antigravity),
          kiro: Boolean(data.dnsStatus.kiro),
          copilot: Boolean(data.dnsStatus.copilot),
        });
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
          ⚠️ <strong>MITM Interceptor:</strong> Intercepts HTTPS traffic of closed IDE tools (Antigravity, Kiro, GitHub Copilot) via local Root CA to redirect requests to your chosen providers and models. DNS is calculated and managed independently per tool.
        </p>
      </div>

      {/* MITM Server Control Card */}
      <div className="rt-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1E293B]">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[22px] text-cyan-400">security</span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">MITM Server</h3>
                <span className={`rt-badge ${serverRunning ? "rt-badge--success" : "rt-badge--muted"}`}>
                  {serverRunning ? "● Running" : "Stopped"}
                </span>
              </div>
            </div>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-2 text-xs">
            <span className="rt-badge rt-badge--success">
              <span className="material-symbols-outlined text-[14px]">check</span> Cert
            </span>
            <span className="rt-badge rt-badge--success">
              <span className="material-symbols-outlined text-[14px]">check</span> Trusted
            </span>
            <span className="rt-badge rt-badge--success">
              <span className="material-symbols-outlined text-[14px]">check</span> Server
            </span>
          </div>
        </div>

        <div className="space-y-2 text-xs text-slate-400 leading-relaxed">
          <p>
            <strong className="text-slate-200">Purpose:</strong> Intercept closed IDE tools and route their chat turns through your custom providers.
          </p>
          <p>
            <strong className="text-slate-200">How it works:</strong> IDE HTTPS request → DNS redirect to localhost:443/8443 → MITM proxy decodes → Routen Router → Upstream.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <div className="flex items-center gap-3 text-xs">
            <span className="font-semibold text-slate-300">Routen Base URL:</span>
            <code className="text-blue-400 font-mono bg-[#0A0D14] px-3 py-1.5 rounded-lg border border-[#1E293B]">
              http://localhost:20127
            </code>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-500 italic">
              Enable DNS per tool below to activate interception
            </span>
            <button
              onClick={toggleServer}
              className={`rt-btn ${serverRunning ? "rt-btn--danger" : "rt-btn--primary"}`}
            >
              <span className="material-symbols-outlined text-[16px]">
                {serverRunning ? "stop" : "play_arrow"}
              </span>
              {serverRunning ? "Stop Server" : "Start Server"}
            </button>
          </div>
        </div>
      </div>

      {/* Per-Tool Accordions (Antigravity, Kiro, Copilot) */}
      <div className="space-y-4">
        {MITM_TOOLS.map((tool) => {
          const isExpanded = expandedTool === tool.id;
          const isDnsOn = Boolean(dnsStatus[tool.id]);
          const toolHosts = hostsByTool[tool.id] || "";
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
                  <div className="size-8 rounded-xl bg-[#0D1322] border border-[#1E293B] p-1.5 flex items-center justify-center">
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
                    className={`rt-btn text-xs ${isDnsOn ? "rt-btn--danger" : "rt-btn--primary"}`}
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
                <div className="pt-4 border-t border-[#1E293B] space-y-5 text-xs">
                  {/* Tool-specific Hosts Configuration */}
                  <div className="space-y-3 p-4 rounded-xl bg-[#0A0D14] border border-[#1E293B]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h5 className="font-bold text-white flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-blue-400 text-[16px]">dns</span>
                          {tool.name} Hosts Redirection Entries
                        </h5>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Domain redirection entries for this specific tool.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleResetToolHosts(tool.id)}
                          className="rt-btn rt-btn--secondary text-xs"
                          title="Reset hosts entries to tool default"
                        >
                          <span className="material-symbols-outlined text-[14px]">restart_alt</span>
                          Reset
                        </button>
                        <button
                          onClick={() => handleSaveToolHosts(tool.id)}
                          className="rt-btn rt-btn--primary text-xs"
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

                  {/* Tool's Model Redirection Mappings */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200 block text-xs">
                        Model Redirection Mappings ({tool.name} Model → Target Upstream Model):
                      </span>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleResetToolMappings(tool.id)}
                          className="rt-btn rt-btn--secondary text-xs"
                          title="Reset mappings to default"
                        >
                          <span className="material-symbols-outlined text-[14px]">restart_alt</span>
                          Reset Mappings
                        </button>
                        <button
                          onClick={() => {
                            setModalTool(tool.id);
                            setNewSourceModel("");
                            setNewTargetModel("");
                          }}
                          className="rt-btn rt-btn--primary text-xs"
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
                          <span className="font-mono text-slate-300 font-medium">{editingSource}</span>
                          <span className="text-blue-400">→</span>
                          <input
                            type="text"
                            value={targetInput}
                            onChange={(e) => setTargetInput(e.target.value)}
                            placeholder="Target model (e.g. ag/gemini-3.8-flash)"
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
                            className="rt-btn rt-btn--primary text-xs"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="rounded-xl border border-[#1E293B] overflow-hidden">
                      {toolMappings.length === 0 ? (
                        <div className="p-4 text-xs text-slate-500 italic text-center">
                          No model mappings configured for {tool.name}. Click 'Add Mapping' or 'Reset Mappings' to populate.
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
                                  → <span className="text-slate-300 ml-1">{m.targetModel}</span>
                                </td>
                                <td className="p-3 text-right space-x-2">
                                  <button
                                    onClick={() => {
                                      setEditingTool(tool.id);
                                      setEditingSource(m.sourceModel);
                                      setTargetInput(m.targetModel);
                                    }}
                                    className="px-2.5 py-1 rounded bg-[#0A0D14] hover:bg-blue-600 hover:text-white border border-[#1E293B] text-slate-300 transition-colors cursor-pointer font-sans text-[11px]"
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

      {/* Add New Mapping Modal */}
      {modalTool && (
        <div className="rt-modal-backdrop">
          <div className="rt-modal-content space-y-4">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-400 text-[18px]">add_circle</span>
              Add Model Mapping ({modalTool.toUpperCase()})
            </h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Source Model ID (Sent by IDE)
                </label>
                <input
                  type="text"
                  placeholder="e.g. claude-sonnet-5 or gpt-4o"
                  value={newSourceModel}
                  onChange={(e) => setNewSourceModel(e.target.value)}
                  className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Target Model ID (Routen Upstream Model)
                </label>
                <input
                  type="text"
                  placeholder="e.g. ag/gemini-3.8-flash or cx/gpt-5.5"
                  value={newTargetModel}
                  onChange={(e) => setNewTargetModel(e.target.value)}
                  className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#1E293B]">
              <button
                onClick={() => setModalTool(null)}
                className="px-4 py-2 text-xs text-slate-400 cursor-pointer"
              >
                Cancel
              </button>
              <button onClick={handleAddMapping} className="rt-btn rt-btn--primary">
                Add Mapping
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
