import React from "react";
import { PONYTAIL_LEVELS_CONFIG, PONYTAIL_YAGNI_STEPS, type PonytailLevelOption } from "./types.js";

interface PonytailCardProps {
  enabled: boolean;
  level: string;
  onToggle: (enabled: boolean) => void;
  onSelectLevel: (level: "lite" | "full" | "ultra") => void;
  disabled?: boolean;
}

export const PonytailCard: React.FC<PonytailCardProps> = ({
  enabled,
  level,
  onToggle,
  onSelectLevel,
  disabled,
}) => {
  const currentLevelConfig: PonytailLevelOption =
    PONYTAIL_LEVELS_CONFIG.find((l) => l.id === level) || PONYTAIL_LEVELS_CONFIG[0];

  return (
    <div className={`rt-card p-6 space-y-6 transition-opacity ${enabled ? "opacity-100" : "opacity-75"}`}>
      {/* Header & Toggle */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-purple-400 text-[22px]">psychology</span>
            <h3 className="text-base font-bold text-white">Ponytail Minimal Senior Dev</h3>
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/20">
              Output Saver
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Adopts the &apos;lazy senior developer&apos; mindset. Biases models toward stdlib, shortest diffs, and zero unrequested abstractions.
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
          <div className="w-11 h-6 bg-[#1E293B] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500" />
        </label>
      </div>

      {/* Senior Developer Rules & Safety */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="p-3 rounded-xl bg-[#0A0D14] border border-[#1E293B] space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-white">
            <span className="material-symbols-outlined text-purple-400 text-[16px]">delete_sweep</span>
            Deletion Over Addition
          </div>
          <p className="text-[11px] text-slate-400">The best code is the code never written. Solves root issues with fewer files</p>
        </div>
        <div className="p-3 rounded-xl bg-[#0A0D14] border border-[#1E293B] space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-white">
            <span className="material-symbols-outlined text-emerald-400 text-[16px]">verified</span>
            Security Never Simplified
          </div>
          <p className="text-[11px] text-slate-400">Input validation, boundary security, and data-loss checks are strictly kept</p>
        </div>
        <div className="p-3 rounded-xl bg-[#0A0D14] border border-[#1E293B] space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-white">
            <span className="material-symbols-outlined text-blue-400 text-[16px]">terminal</span>
            Code First, Max 3 Lines Notes
          </div>
          <p className="text-[11px] text-slate-400">Output delivers executable diff first, followed by at most 3 lines of summary</p>
        </div>
      </div>

      {/* Level Selection Tabs */}
      <div className="space-y-3 pt-3 border-t border-[#1E293B]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Simplicity Bias Level
          </span>
          <span className="text-[11px] text-purple-400 font-medium">
            Active: {currentLevelConfig.name} Level
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PONYTAIL_LEVELS_CONFIG.map((lvl) => {
            const isSelected = level === lvl.id;
            return (
              <button
                key={lvl.id}
                type="button"
                disabled={disabled}
                onClick={() => onSelectLevel(lvl.id)}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  isSelected
                    ? "bg-[#131B2E] border-purple-500/60 shadow-lg shadow-purple-500/5 ring-1 ring-purple-500/30"
                    : "bg-[#0A0D14] border-[#1E293B] hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-bold ${isSelected ? "text-purple-300" : "text-white"}`}>
                    {lvl.name}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    isSelected ? "bg-purple-500/20 text-purple-300" : "bg-slate-800 text-slate-400"
                  }`}>
                    {lvl.id}
                  </span>
                </div>
                <div className="text-[11px] font-medium text-slate-300 mb-1">{lvl.tagline}</div>
                <p className="text-[11px] text-slate-400 leading-relaxed mb-2">{lvl.description}</p>
                <div className="text-[10px] text-purple-400/90 font-mono bg-purple-500/10 p-1.5 rounded border border-purple-500/20">
                  {lvl.yagniRule}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 6-Step YAGNI Ladder */}
      <div className="space-y-2 pt-3 border-t border-[#1E293B]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300">
            The 6-Step YAGNI Ladder (Evaluated Top-to-Bottom):
          </span>
          <span className="text-[10px] text-slate-500 font-mono">Stops at first rung that holds</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {PONYTAIL_YAGNI_STEPS.map((step) => (
            <div
              key={step.step}
              className="p-2.5 rounded-lg bg-[#0A0D14] border border-[#1E293B] flex flex-col justify-between"
            >
              <div>
                <span className="text-[10px] font-bold text-purple-400 font-mono block">Rung #{step.step}</span>
                <div className="text-xs font-semibold text-white mt-0.5 leading-snug">{step.title}</div>
              </div>
              <div className="text-[10px] text-slate-400 mt-1 leading-tight">{step.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
