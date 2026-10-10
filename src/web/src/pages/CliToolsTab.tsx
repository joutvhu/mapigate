import React, { useState } from "react";
import { PortalModal } from "../components/PortalModal";
import { CLI_TOOLS_LIST, MITM_TOOLS_LIST, type CliToolItem } from "../constants/providersData";

export const CliToolsTab: React.FC = () => {
  const [activeModalTool, setActiveModalTool] = useState<CliToolItem | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const copyText = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const getStatusBadge = (status: string) => {
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
    return <span className="rt-badge rt-badge--muted">{status}</span>;
  };

  return (
    <div className="space-y-8 w-full px-2 sm:px-4 pb-16 animate-rt-fade-in">
      {/* Overview Banner */}
      <div className="p-4.5 rounded-2xl bg-[#0F1420]/70 border border-[#1E293B] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[20px]">terminal</span>
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">AI Coding Assistants & Environments</h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Click any tool below for instant 1-click configuration instructions.
            </p>
          </div>
        </div>

        <span className="text-xs font-mono text-blue-400 bg-blue-500/10 px-3 py-1 rounded-lg border border-blue-500/20">
          Port :20127 Ready
        </span>
      </div>

      {/* SECTION 1: Regular CLI Tools */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {CLI_TOOLS_LIST.map((tool, idx) => (
          <div
            key={tool.id}
            onClick={() => setActiveModalTool(tool)}
            className="rt-card stagger-item flex items-center justify-between gap-3 cursor-pointer py-3.5 px-4"
            style={{ animationDelay: `${idx * 25}ms` }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-10 rounded-xl bg-[#0D1322] p-2 flex items-center justify-center shrink-0 border border-[#1E293B]">
                <img src={tool.image} alt={tool.name} className="size-full object-contain" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-slate-100 truncate">
                  {tool.name}
                </h4>
                <div className="mt-1">{getStatusBadge(tool.status)}</div>
              </div>
            </div>

            <span className="material-symbols-outlined text-[18px] text-slate-500 group-hover:text-blue-400 transition-colors">
              chevron_right
            </span>
          </div>
        ))}
      </div>

      {/* SECTION 2: MITM Tools */}
      <div className="space-y-3 pt-2 border-t border-[#1E293B]">
        <div className="flex items-center gap-2 px-1">
          <span className="material-symbols-outlined text-[18px] text-cyan-400">security</span>
          <h3 className="text-sm font-bold text-white">IDE Interceptor (MITM Tools)</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {MITM_TOOLS_LIST.map((tool, idx) => (
            <div
              key={tool.id}
              onClick={() => setActiveModalTool(tool)}
              className="rt-card stagger-item flex items-center justify-between gap-3 cursor-pointer py-3.5 px-4"
              style={{ animationDelay: `${idx * 40}ms` }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-10 rounded-xl bg-[#0D1322] p-2 flex items-center justify-center shrink-0 border border-[#1E293B]">
                  <img src={tool.image} alt={tool.name} className="size-full object-contain" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-xs font-bold text-slate-100 truncate">
                      {tool.name}
                    </h4>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">
                      MITM
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">{tool.desc}</p>
                </div>
              </div>

              <span className="material-symbols-outlined text-[18px] text-slate-500 group-hover:text-cyan-400 transition-colors">
                chevron_right
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Modal */}
      <PortalModal
        isOpen={Boolean(activeModalTool)}
        onClose={() => setActiveModalTool(null)}
        maxWidthClass="max-w-md"
      >
        {activeModalTool && (
          <div className="space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
              <div className="flex items-center gap-3">
                <img src={activeModalTool.image} alt={activeModalTool.name} className="size-8 object-contain" />
                <div>
                  <h4 className="text-sm font-bold text-white">{activeModalTool.name}</h4>
                  <span className="text-[11px] text-blue-400 font-mono">Gateway Integration</span>
                </div>
              </div>
              <button
                onClick={() => setActiveModalTool(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="bg-[#0A0D14] border border-[#1E293B] rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">Windows PowerShell:</span>
                  <button
                    onClick={() =>
                      copyText(
                        `$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:20127"; $env:OPENAI_BASE_URL = "http://127.0.0.1:20127/v1"`
                      )
                    }
                    className="text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer font-semibold"
                  >
                    <span className="material-symbols-outlined text-[14px]">content_copy</span>
                    {copiedCmd?.includes("ANTHROPIC") ? "Copied!" : "Copy"}
                  </button>
                </div>
                <code className="text-emerald-400 font-mono text-[11px] block break-all leading-relaxed bg-[#0E1320] p-2 rounded-lg border border-[#1E293B]">
                  $env:ANTHROPIC_BASE_URL = "http://127.0.0.1:20127"<br />
                  $env:OPENAI_BASE_URL = "http://127.0.0.1:20127/v1"
                </code>
              </div>

              <div className="bg-[#0A0D14] border border-[#1E293B] rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">Cursor / Cline / OpenCode Base URL:</span>
                  <button
                    onClick={() => copyText("http://127.0.0.1:20127/v1")}
                    className="text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer font-semibold"
                  >
                    <span className="material-symbols-outlined text-[14px]">content_copy</span>
                    {copiedCmd === "http://127.0.0.1:20127/v1" ? "Copied!" : "Copy"}
                  </button>
                </div>
                <code className="text-emerald-400 font-mono text-[11px] block bg-[#0E1320] p-2 rounded-lg border border-[#1E293B]">
                  http://127.0.0.1:20127/v1
                </code>
              </div>

              {activeModalTool.isMitm && (
                <div className="bg-cyan-500/10 border border-cyan-500/20 p-3.5 rounded-xl text-[11px] text-slate-200 space-y-1.5">
                  <p className="font-bold text-cyan-400 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">security</span>
                    HTTPS MITM Interception
                  </p>
                  <p className="text-slate-300 leading-relaxed">
                    To intercept this IDE without changing URLs in its settings, run Routen in administrator terminal:
                  </p>
                  <code className="block text-white font-mono bg-[#0A0D14] p-2 rounded-lg border border-[#1E293B] mt-1">
                    routen start --mitm
                  </code>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-[#1E293B]">
              <button
                onClick={() => setActiveModalTool(null)}
                className="rt-btn rt-btn--secondary"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </PortalModal>
    </div>
  );
};
