import React, { useState } from "react";

export const EndpointTab: React.FC = () => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const copy = (val: string, field: string) => {
    navigator.clipboard.writeText(val);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const runTestCurl = async () => {
    setTesting(true);
    setTestResponse(null);
    try {
      const res = await fetch("http://127.0.0.1:20127/health");
      const data = await res.json();
      setTestResponse(JSON.stringify(data, null, 2));
    } catch {
      setTestResponse(JSON.stringify({ error: "Failed to connect" }, null, 2));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 w-full px-2 sm:px-4 pb-16 animate-rt-fade-in">
      <div className="rt-card p-6 space-y-6">
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
          <div className="bg-[#0A0D14] p-4 rounded-xl border border-[#1E293B] flex items-center justify-between">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-sans font-semibold">
                OpenAI-Compatible Base URL (Cursor, Cline, OpenCode, Codex)
              </span>
              <span className="text-blue-400 font-bold text-sm">http://127.0.0.1:20127/v1</span>
            </div>
            <button
              onClick={() => copy("http://127.0.0.1:20127/v1", "openai")}
              className="rt-btn rt-btn--secondary font-sans text-xs"
            >
              <span className="material-symbols-outlined text-[14px]">content_copy</span>
              {copiedField === "openai" ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="bg-[#0A0D14] p-4 rounded-xl border border-[#1E293B] flex items-center justify-between">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-sans font-semibold">
                Anthropic Base URL (Claude Code CLI)
              </span>
              <span className="text-cyan-400 font-bold text-sm">http://127.0.0.1:20127</span>
            </div>
            <button
              onClick={() => copy("http://127.0.0.1:20127", "anthropic")}
              className="rt-btn rt-btn--secondary font-sans text-xs"
            >
              <span className="material-symbols-outlined text-[14px]">content_copy</span>
              {copiedField === "anthropic" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        {/* Interactive cURL Test */}
        <div className="pt-2 border-t border-[#1E293B] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 block font-sans">
              Test Gateway Connectivity:
            </span>
            <button
              onClick={runTestCurl}
              disabled={testing}
              className="rt-btn rt-btn--primary"
            >
              <span className={`material-symbols-outlined text-[15px] ${testing ? "animate-spin" : ""}`}>
                {testing ? "sync" : "play_arrow"}
              </span>
              Execute Test Ping
            </button>
          </div>

          <div className="bg-[#0A0D14] p-4 rounded-xl border border-[#1E293B] text-xs font-mono text-slate-300 leading-relaxed overflow-x-auto">
            curl http://127.0.0.1:20127/health
          </div>

          {testResponse && (
            <pre className="bg-[#080B10] p-4 rounded-xl border border-blue-500/30 text-emerald-400 text-xs font-mono overflow-x-auto animate-rt-scale-in">
              {testResponse}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};
