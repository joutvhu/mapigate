import React, { useState, useEffect } from "react";
import { PortalModal } from "../components/PortalModal";
import { CLI_TOOLS_LIST, type CliToolItem } from "../constants/providersData";
import { CLI_TOOLS, type CliToolDefinition } from "../../../shared/constants/cliTools";

interface ToolStatusData {
  id: string;
  name: string;
  installed: boolean;
  configured: boolean;
  status: "Connected" | "Guide" | "Not configured" | "Not installed";
  configPath?: string;
  hasMapigate?: boolean;
}

export const CliToolsTab: React.FC = () => {
  const [activeModalTool, setActiveModalTool] = useState<CliToolItem | null>(null);
  const [activeTab, setActiveTab] = useState<"powershell" | "bash" | "file" | "guide">("powershell");
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [toolStatuses, setToolStatuses] = useState<Record<string, ToolStatusData>>({});
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Fetch real tool statuses from backend
  const fetchStatuses = () => {
    fetch("/api/cli-tools/status")
      .then((r) => r.json())
      .then((data: Record<string, ToolStatusData>) => {
        if (data && typeof data === "object") {
          setToolStatuses(data);
        }
      })
      .catch(() => {
        // Fallback to static statuses
      });
  };

  useEffect(() => {
    fetchStatuses();
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

  const handleApplyConfig = async (toolId: string) => {
    setApplying(true);
    setApplyMsg(null);
    try {
      const res = await fetch(`/api/cli-tools/${toolId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
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
        headers: { "Content-Type": "application/json" },
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

  return (
    <div className="space-y-6 w-full px-2 sm:px-4 pb-16 animate-rt-fade-in">
      {/* Overview Banner */}
      <div className="p-4 rounded-2xl bg-[#0F1420]/70 border border-[#1E293B] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[22px]">terminal</span>
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">AI Coding CLIs & Assistant Extensions</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Click any tool below for instant copyable commands, file templates, and setup guides.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchStatuses}
            className="rt-btn rt-btn--secondary text-xs flex items-center gap-1.5 py-1.5 px-3"
            title="Refresh installation status"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            Refresh Status
          </button>
          <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20 flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            Port :20127 Ready
          </span>
        </div>
      </div>

      {/* FULL-WIDTH RESPONSIVE GRID FOR ALL 26 CLI TOOLS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {CLI_TOOLS_LIST.map((tool, idx) => {
          const currentStatus = getEffectiveStatus(tool);
          return (
            <div
              key={tool.id}
              onClick={() => {
                setActiveModalTool(tool);
                setApplyMsg(null);
                const def = CLI_TOOLS[tool.id];
                if (def?.guideSteps && def.guideSteps.length > 0 && !def.powershellTemplate) {
                  setActiveTab("guide");
                } else if (def?.configFileTemplate && !def.powershellTemplate) {
                  setActiveTab("file");
                } else {
                  setActiveTab("powershell");
                }
              }}
              className="rt-card stagger-item flex items-center justify-between gap-3 cursor-pointer py-3.5 px-4 hover:border-blue-500/40 hover:bg-[#131B2E] transition-all"
              style={{ animationDelay: `${idx * 20}ms` }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-10 rounded-xl bg-[#0D1322] p-2 flex items-center justify-center shrink-0 border border-[#1E293B]">
                  <img src={tool.image} alt={tool.name} className="size-full object-contain" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-slate-100 truncate">
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

      {/* CONNECTION GUIDE MODAL (MOUNTED DIRECTLY TO BODY VIA REACT PORTAL) */}
      <PortalModal
        isOpen={Boolean(activeModalTool)}
        onClose={() => setActiveModalTool(null)}
        maxWidthClass="max-w-2xl"
      >
        {activeModalTool && (
          <div className="space-y-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3.5 border-b border-[#1E293B]">
              <div className="flex items-center gap-3">
                <div className="size-11 rounded-xl bg-[#0D1322] p-2 flex items-center justify-center border border-[#1E293B] shrink-0">
                  <img src={activeModalTool.image} alt={activeModalTool.name} className="size-full object-contain" />
                </div>
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

              <button
                onClick={() => setActiveModalTool(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-[#1E293B] gap-2">
              <button
                onClick={() => setActiveTab("powershell")}
                className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-1.5 transition-colors border-b-2 ${
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
                className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-1.5 transition-colors border-b-2 ${
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
                  className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-1.5 transition-colors border-b-2 ${
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
                  className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-1.5 transition-colors border-b-2 ${
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
                          selectedDef?.powershellTemplate ||
                            `$env:OPENAI_BASE_URL = "http://127.0.0.1:20127/v1"; $env:OPENAI_API_KEY = "mapigate-local"`
                        )
                      }
                      className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold"
                    >
                      <span className="material-symbols-outlined text-[15px]">content_copy</span>
                      {copiedCmd?.includes("$env:") ? "Copied!" : "Copy PowerShell"}
                    </button>
                  </div>
                  <pre className="bg-[#0A0D14] border border-[#1E293B] p-3.5 rounded-xl text-emerald-400 font-mono text-xs overflow-x-auto whitespace-pre leading-relaxed">
                    {selectedDef?.powershellTemplate ||
                      `$env:OPENAI_BASE_URL = "http://127.0.0.1:20127/v1"\n$env:OPENAI_API_KEY = "mapigate-local"`}
                  </pre>
                  <p className="text-[11px] text-slate-400">
                    💡 Sets environment variables in your current PowerShell session pointing to Mapigate port 20127.
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
                          selectedDef?.bashTemplate ||
                            `export OPENAI_BASE_URL="http://127.0.0.1:20127/v1"\nexport OPENAI_API_KEY="mapigate-local"`
                        )
                      }
                      className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold"
                    >
                      <span className="material-symbols-outlined text-[15px]">content_copy</span>
                      {copiedCmd?.includes("export ") ? "Copied!" : "Copy Bash"}
                    </button>
                  </div>
                  <pre className="bg-[#0A0D14] border border-[#1E293B] p-3.5 rounded-xl text-emerald-400 font-mono text-xs overflow-x-auto whitespace-pre leading-relaxed">
                    {selectedDef?.bashTemplate ||
                      `export OPENAI_BASE_URL="http://127.0.0.1:20127/v1"\nexport OPENAI_API_KEY="mapigate-local"`}
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
                          selectedDef?.configFileTemplate ||
                            selectedDef?.codeBlock?.code ||
                            `http://127.0.0.1:20127/v1`
                        )
                      }
                      className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold"
                    >
                      <span className="material-symbols-outlined text-[15px]">content_copy</span>
                      {copiedCmd?.includes("{") || copiedCmd?.includes("[") ? "Copied!" : "Copy Config"}
                    </button>
                  </div>
                  <pre className="bg-[#0A0D14] border border-[#1E293B] p-3.5 rounded-xl text-emerald-400 font-mono text-xs overflow-x-auto whitespace-pre leading-relaxed">
                    {selectedDef?.configFileTemplate ||
                      selectedDef?.codeBlock?.code ||
                      `{\n  "baseUrl": "http://127.0.0.1:20127/v1",\n  "apiKey": "mapigate-local"\n}`}
                  </pre>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      disabled={applying}
                      onClick={() => handleApplyConfig(activeModalTool.id)}
                      className="rt-btn rt-btn--primary text-xs py-1.5 px-3 flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[16px]">save</span>
                      {applying ? "Applying..." : "Apply to Config File"}
                    </button>
                    <button
                      disabled={applying}
                      onClick={() => handleResetConfig(activeModalTool.id)}
                      className="rt-btn rt-btn--secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[16px]">undo</span>
                      Reset Config
                    </button>
                  </div>
                </div>
              )}

              {/* Guide Steps Tab */}
              {activeTab === "guide" && (
                <div className="space-y-3">
                  {selectedDef?.guideSteps && (
                    <div className="space-y-2.5">
                      {selectedDef.guideSteps.map((step) => (
                        <div
                          key={step.step}
                          className="p-3 rounded-xl bg-[#0A0D14] border border-[#1E293B] flex items-start gap-3"
                        >
                          <div className="size-6 rounded-full bg-blue-500/20 text-blue-400 font-bold text-xs flex items-center justify-center shrink-0 border border-blue-500/30">
                            {step.step}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h5 className="text-xs font-bold text-white">{step.title}</h5>
                            {step.desc && (
                              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{step.desc}</p>
                            )}
                            {step.value && (
                              <div className="mt-2 flex items-center justify-between gap-2 bg-[#0E1320] px-2.5 py-1.5 rounded-lg border border-[#1E293B]">
                                <code className="text-xs text-emerald-400 font-mono truncate">{step.value}</code>
                                {step.copyable && (
                                  <button
                                    onClick={() => copyText(step.value!)}
                                    className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1 font-semibold shrink-0"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">content_copy</span>
                                    {copiedCmd === step.value ? "Copied!" : "Copy"}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
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
                  Base URL: http://127.0.0.1:20127{selectedDef?.baseUrlPath || ""}
                </span>
              </div>
              <button
                onClick={() => setActiveModalTool(null)}
                className="rt-btn rt-btn--secondary text-xs py-1.5 px-4"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </PortalModal>
    </div>
  );
};
