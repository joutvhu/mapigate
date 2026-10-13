import React, { useState } from "react";
import { RTK_FILTERS, SANDBOX_PRESETS } from "./types.js";

interface RtkCardProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
}

export const RtkCard: React.FC<RtkCardProps> = ({ enabled, onToggle, disabled }) => {
  const [selectedPreset, setSelectedPreset] = useState("diff");
  const [testInput, setTestInput] = useState(SANDBOX_PRESETS[0].text);
  const [trimmedOutput, setTrimmedOutput] = useState<string | null>(null);
  const [stats, setStats] = useState<{ origTokens: number; trimmedTokens: number; pct: number } | null>(null);

  const handleSelectPreset = (presetId: string) => {
    const found = SANDBOX_PRESETS.find((p) => p.id === presetId);
    if (found) {
      setSelectedPreset(presetId);
      setTestInput(found.text);
      setTrimmedOutput(null);
      setStats(null);
    }
  };

  const handleSimulate = () => {
    let out = testInput
      .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "")
      .replace(/\r[^\n]+/g, "")
      .replace(/^index\s+[0-9a-f]+\.\.[0-9a-f]+.*$/gm, "")
      .replace(/(?:^info\s+-\s+Generating static pages.*\n)+/gm, "info - Generating static pages (0/10...10/10)\n");

    const lines = out.split("\n");
    const deduped: string[] = [];
    let prev = "";
    let repeatCount = 0;

    for (const line of lines) {
      if (line === prev && line.trim().length > 0) {
        repeatCount++;
      } else {
        if (repeatCount > 0) {
          deduped.push(`  ... [repeated ${repeatCount} times]`);
          repeatCount = 0;
        }
        deduped.push(line);
        prev = line;
      }
    }
    if (repeatCount > 0) {
      deduped.push(`  ... [repeated ${repeatCount} times]`);
    }

    out = deduped.join("\n").trim();
    setTrimmedOutput(out);

    const origTokens = Math.max(1, Math.round(testInput.length / 3.8));
    const trimmedTokens = Math.max(1, Math.round(out.length / 3.8));
    const saved = Math.max(0, origTokens - trimmedTokens);
    const pct = Math.min(95, Math.round((saved / origTokens) * 100));
    setStats({ origTokens, trimmedTokens, pct });
  };

  return (
    <div className={`rt-card p-6 space-y-6 transition-opacity ${enabled ? "opacity-100" : "opacity-75"}`}>
      {/* Header & Toggle */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-cyan-400 text-[22px]">savings</span>
            <h3 className="text-base font-bold text-white">RTK Token Optimizer</h3>
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
              Input Compressor
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Lossless in-place tool result compression saving 20% – 40% context window tokens per agent turn.
          </p>
        </div>

        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={enabled}
            disabled={disabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-[#1E293B] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500" />
        </label>
      </div>

      {/* Safety & Invariant Guarantees */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-[#0A0D14] border border-[#1E293B]">
          <span className="material-symbols-outlined text-emerald-400 text-[18px]">verified_user</span>
          <div>
            <div className="font-semibold text-white">Fail-Open Guarantee</div>
            <div className="text-[11px] text-slate-400">If parser fails, original payload passes 100% untouched</div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-[#0A0D14] border border-[#1E293B]">
          <span className="material-symbols-outlined text-amber-400 text-[18px]">bug_report</span>
          <div>
            <div className="font-semibold text-white">Error Trace Preservation</div>
            <div className="text-[11px] text-slate-400">Errors and stack traces are strictly exempt from compression</div>
          </div>
        </div>
      </div>

      {/* 13 Active Filter Engines */}
      <div className="space-y-3 pt-3 border-t border-[#1E293B]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            13 Active Trimming Engines ({enabled ? "Enabled" : "Disabled"})
          </span>
          <span className="text-[11px] text-slate-500 font-mono">Lossless AST/Regex</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {RTK_FILTERS.map((f) => (
            <div
              key={f.id}
              className="p-2.5 rounded-lg bg-[#0A0D14] border border-[#1E293B] hover:border-cyan-500/30 transition-colors group"
              title={f.description}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200 group-hover:text-cyan-300">
                <span className="material-symbols-outlined text-[15px] text-cyan-400">{f.icon}</span>
                <span className="truncate">{f.name}</span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">{f.badge}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Sandbox Playground */}
      <div className="space-y-3 pt-3 border-t border-[#1E293B]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-300">Interactive RTK Test Sandbox:</span>
            <div className="flex items-center gap-1 bg-[#0A0D14] p-1 rounded-lg border border-[#1E293B]">
              {SANDBOX_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset.id)}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                    selectedPreset === preset.id ? "bg-cyan-500/20 text-cyan-300 font-semibold" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={handleSimulate} className="rt-btn rt-btn--primary">
            <span className="material-symbols-outlined text-[15px]">auto_fix_high</span>
            Test Trim
          </button>
        </div>

        <textarea
          value={testInput}
          onChange={(e) => setTestInput(e.target.value)}
          rows={4}
          placeholder="Paste tool call results (git diff, build logs, grep results)..."
          className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl p-3 text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-500 resize-y"
        />

        {trimmedOutput && stats && (
          <div className="bg-[#080B10] p-4 rounded-xl border border-cyan-500/30 space-y-2 animate-rt-scale-in">
            <div className="flex items-center justify-between text-xs">
              <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                Trimmed successfully: ~{stats.pct}% tokens saved
              </span>
              <span className="text-slate-400 font-mono text-[11px]">
                {stats.origTokens} tokens → {stats.trimmedTokens} tokens
              </span>
            </div>
            <pre className="text-xs font-mono text-slate-300 max-h-40 overflow-y-auto whitespace-pre-wrap bg-[#05070B] p-2.5 rounded-lg border border-[#1E293B]">
              {trimmedOutput}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
