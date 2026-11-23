import React from "react";
import { Select } from "./Select.js";

export interface FreeTierComboConfigBarProps {
  isMultiMode: boolean;
  onToggleMultiMode: (multi: boolean) => void;
  canMultiMode: boolean;
  comboName: string;
  onComboNameChange: (val: string) => void;
  namePrefix: string;
  onNamePrefixChange: (val: string) => void;
  strategy: "round-robin" | "fallback" | "fusion" | "lkgp" | "p2c";
  onStrategyChange: (val: "round-robin" | "fallback" | "fusion" | "lkgp" | "p2c") => void;
  activeGroupsCount: number;
}

export const FreeTierComboConfigBar: React.FC<FreeTierComboConfigBarProps> = ({
  isMultiMode,
  onToggleMultiMode,
  canMultiMode,
  comboName,
  onComboNameChange,
  namePrefix,
  onNamePrefixChange,
  strategy,
  onStrategyChange,
  activeGroupsCount,
}) => {
  return (
    <div className="p-3.5 rounded-xl bg-[#0A0D14] border border-[#1E293B] space-y-3 shrink-0">
      {/* Mode Switcher */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-300">Creation Mode:</span>
          <div className="inline-flex p-0.5 rounded-lg bg-[#0F1420] border border-[#1E293B]">
            <button
              type="button"
              onClick={() => onToggleMultiMode(false)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                !isMultiMode
                  ? "bg-slate-700 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Single Combo
            </button>
            <button
              type="button"
              disabled={!canMultiMode}
              onClick={() => onToggleMultiMode(true)}
              title={
                canMultiMode
                  ? "Generate a separate combo for each selected group"
                  : "Switch to Model, Family or Role view to enable Multi-Combos"
              }
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                isMultiMode
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">dynamic_feed</span>
              Multi-Combos (1 per group)
              {isMultiMode && activeGroupsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px] font-bold">
                  {activeGroupsCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {isMultiMode && (
          <span className="text-[11px] text-emerald-400/90 font-medium flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
            {activeGroupsCount} combo{activeGroupsCount !== 1 ? "s" : ""} will be generated
          </span>
        )}
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-[#1E293B]/60">
        {!isMultiMode ? (
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Combo Identifier <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={comboName}
              onChange={(e) => onComboNameChange(e.target.value)}
              placeholder="e.g. free-fallback"
              className="w-full px-3 py-1.5 bg-[#0F1420] border border-[#1E293B] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>
        ) : (
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Combo Name Prefix
            </label>
            <input
              type="text"
              value={namePrefix}
              onChange={(e) => onNamePrefixChange(e.target.value)}
              placeholder="e.g. free-"
              className="w-full px-3 py-1.5 bg-[#0F1420] border border-[#1E293B] rounded-xl text-xs text-emerald-400 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>
        )}

        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-1">
            Routing Strategy {isMultiMode ? "(for all generated combos)" : ""}
          </label>
          <Select
            value={strategy}
            onChange={(val) => onStrategyChange(val as any)}
            options={[
              { value: "fallback", label: "Fallback (try free models in order)" },
              { value: "round-robin", label: "Round Robin (distribute across free tiers)" },
              { value: "lkgp", label: "LKGP (Last Known Good Provider)" },
              { value: "fusion", label: "Fusion (parallel multi-model panel)" },
              { value: "p2c", label: "P2C (Power of Two Choices)" },
            ]}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
};
