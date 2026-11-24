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
    <div className="px-4 sm:px-5 py-2.5 border-b border-[#1E293B] bg-[#0A0D14]/60 flex flex-wrap items-center gap-2.5 shrink-0">
      {canMultiMode && (
        <div className="flex items-center p-0.5 rounded-xl bg-[#0F1420] border border-[#1E293B] shrink-0">
          <button
            type="button"
            onClick={() => onToggleMultiMode(false)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
              !isMultiMode ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            Single Combo
          </button>
          <button
            type="button"
            onClick={() => onToggleMultiMode(true)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
              isMultiMode ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            <span>Batch</span>
            {activeGroupsCount > 0 && (
              <span className="px-1 rounded bg-black/25 text-[10px] font-mono">
                {activeGroupsCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Combo Name or Prefix */}
      {isMultiMode ? (
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <span className="text-[11px] font-semibold text-slate-400 shrink-0">Prefix:</span>
          <input
            type="text"
            value={namePrefix}
            onChange={(e) => onNamePrefixChange(e.target.value)}
            placeholder="free-"
            className="flex-1 bg-[#0F1420] border border-[#1E293B] rounded-xl px-3 py-1.5 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-1 min-w-[220px]">
          <span className="text-[11px] font-semibold text-slate-400 shrink-0">Combo Name:</span>
          <input
            type="text"
            value={comboName}
            onChange={(e) => onComboNameChange(e.target.value)}
            placeholder="e.g. free-fallback"
            className="flex-1 bg-[#0F1420] border border-[#1E293B] rounded-xl px-3 py-1.5 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      )}

      {/* Strategy */}
      <div className="flex items-center gap-2 min-w-[210px]">
        <span className="text-[11px] font-semibold text-slate-400 shrink-0">Strategy:</span>
        <Select
          value={strategy}
          onChange={(val) =>
            onStrategyChange(val as "round-robin" | "fallback" | "fusion" | "lkgp" | "p2c")
          }
          options={[
            { value: "fallback", label: "Fallback (priority order)" },
            { value: "round-robin", label: "Round Robin (rotate)" },
            { value: "fusion", label: "Fusion (parallel judge)" },
            { value: "lkgp", label: "LKGP (cache warmth)" },
            { value: "p2c", label: "P2C (adaptive latency)" },
          ]}
          className="flex-1"
        />
      </div>
    </div>
  );
};
