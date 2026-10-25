import React from "react";
import { CAVEMAN_LEVELS_CONFIG, type CavemanLevelOption } from "./types.js";

interface CavemanCardProps {
  enabled: boolean;
  level: string;
  onToggle: (enabled: boolean) => void;
  onSelectLevel: (level: "lite" | "full" | "ultra") => void;
  disabled?: boolean;
}

export const CavemanCard: React.FC<CavemanCardProps> = ({
  enabled,
  level,
  onToggle,
  onSelectLevel,
  disabled,
}) => {
  const currentLevelConfig: CavemanLevelOption =
    CAVEMAN_LEVELS_CONFIG.find((l) => l.id === level) || CAVEMAN_LEVELS_CONFIG[0];

  return (
    <div className={`rt-card p-6 space-y-6 transition-opacity ${enabled ? "opacity-100" : "opacity-75"}`}>
      {/* Header & Toggle */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-400 text-[22px]">format_quote</span>
            <h3 className="text-base font-bold text-white">Caveman Output Optimizer</h3>
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20">
              Output Saver
            </span>
          </div>
          <p className="text-xs text-slate-400">
            System-prompt injection instructing models to strip conversational pleasantries, filler, and hedging.
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
          <div className="w-11 h-6 bg-[#1E293B] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500" />
        </label>
      </div>

      {/* Safety Guarantees */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="p-3 rounded-xl bg-[#0A0D14] border border-[#1E293B] space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-white">
            <span className="material-symbols-outlined text-emerald-400 text-[16px]">code</span>
            Exact Code & Diffs
          </div>
          <p className="text-[11px] text-slate-400">Code, shell commands, and syntax blocks remain 100% untouched</p>
        </div>
        <div className="p-3 rounded-xl bg-[#0A0D14] border border-[#1E293B] space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-white">
            <span className="material-symbols-outlined text-cyan-400 text-[16px]">translate</span>
            Language Preserving
          </div>
          <p className="text-[11px] text-slate-400">Responds in the user&apos;s dominant language without translation distortion</p>
        </div>
        <div className="p-3 rounded-xl bg-[#0A0D14] border border-[#1E293B] space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-white">
            <span className="material-symbols-outlined text-amber-400 text-[16px]">shield</span>
            Auto-Clarity Guard
          </div>
          <p className="text-[11px] text-slate-400">Drops shorthand and expands full steps for ambiguous problems</p>
        </div>
      </div>

      {/* Level Selection Tabs */}
      <div className="space-y-3 pt-3 border-t border-[#1E293B]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Compression Intensity Level
          </span>
          <span className="text-[11px] text-amber-400 font-medium">
            Est. Savings: {currentLevelConfig.savingsEstimate}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {CAVEMAN_LEVELS_CONFIG.map((lvl) => {
            const isSelected = level === lvl.id;
            return (
              <button
                key={lvl.id}
                type="button"
                disabled={disabled}
                onClick={() => onSelectLevel(lvl.id)}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  isSelected
                    ? "bg-[#131B2E] border-amber-500/60 shadow-lg shadow-amber-500/5 ring-1 ring-amber-500/30"
                    : "bg-[#0A0D14] border-[#1E293B] hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-bold ${isSelected ? "text-amber-300" : "text-white"}`}>
                    {lvl.name}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    isSelected ? "bg-amber-500/20 text-amber-300" : "bg-slate-800 text-slate-400"
                  }`}>
                    {lvl.savingsEstimate}
                  </span>
                </div>
                <div className="text-[11px] font-medium text-slate-300 mb-1">{lvl.tagline}</div>
                <p className="text-[11px] text-slate-400 leading-relaxed">{lvl.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Interactive Level Preview */}
      <div className="space-y-2 pt-3 border-t border-[#1E293B]">
        <span className="text-xs font-bold text-slate-300 block">
          Output Comparison Preview ({currentLevelConfig.name} Level):
        </span>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-[#0A0D14] border border-[#1E293B] space-y-1.5">
            <div className="flex items-center gap-1.5 text-slate-400 font-semibold text-[11px]">
              <span className="material-symbols-outlined text-rose-400 text-[14px]">close</span>
              Standard LLM Verbosity (High Tokens)
            </div>
            <p className="text-slate-400 font-mono text-[11px] leading-relaxed italic">
              &quot;{currentLevelConfig.preview.normal}&quot;
            </p>
          </div>

          <div className="p-3 rounded-xl bg-[#06101E] border border-amber-500/30 space-y-1.5">
            <div className="flex items-center gap-1.5 text-amber-300 font-semibold text-[11px]">
              <span className="material-symbols-outlined text-emerald-400 text-[14px]">check</span>
              Caveman Compressed ({currentLevelConfig.savingsEstimate.split(" ")[0]} Tokens)
            </div>
            <p className="text-slate-200 font-mono text-[11px] leading-relaxed">
              &quot;{currentLevelConfig.preview.compressed}&quot;
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
