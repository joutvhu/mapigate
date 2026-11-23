import React from "react";
import type { FreeTierGroupMode } from "../utils/freeTierGrouping.js";

export interface FreeTierComboToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onlyConnected: boolean;
  onToggleOnlyConnected: () => void;
  groupMode: FreeTierGroupMode;
  onGroupModeChange: (mode: FreeTierGroupMode) => void;
  onlyMultiProvider?: boolean;
  onToggleOnlyMultiProvider?: () => void;
  onSelectConnectedOnly: () => void;
  onDeselectAll: () => void;
  onTestAll: () => void;
  isTestingAll: boolean;
}

export const FreeTierComboToolbar: React.FC<FreeTierComboToolbarProps> = ({
  searchQuery,
  onSearchChange,
  onlyConnected,
  onToggleOnlyConnected,
  groupMode,
  onGroupModeChange,
  onlyMultiProvider = false,
  onToggleOnlyMultiProvider,
  onSelectConnectedOnly,
  onDeselectAll,
  onTestAll,
  isTestingAll,
}) => {
  const GROUP_OPTIONS: Array<{ mode: FreeTierGroupMode; label: string; icon: string }> = [
    { mode: "provider", label: "Provider", icon: "dns" },
    { mode: "model", label: "Model", icon: "layers" },
    { mode: "family", label: "Family", icon: "category" },
    { mode: "role", label: "Role", icon: "psychology" },
  ];

  return (
    <div className="space-y-2.5 shrink-0">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Search & Connected filter */}
        <div className="flex items-center gap-2 flex-1 min-w-[220px]">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-[16px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search providers or models..."
              className="w-full pl-8 pr-3 py-1.5 bg-[#0A0D14] border border-[#1E293B] rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <button
            type="button"
            onClick={onToggleOnlyConnected}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
              onlyConnected
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                : "bg-[#0A0D14] border-[#1E293B] text-slate-400 hover:text-slate-200"
            }`}
          >
            <span className="size-1.5 rounded-full bg-current" />
            Connected Only
          </button>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2 shrink-0 text-xs">
          <button
            type="button"
            onClick={onSelectConnectedOnly}
            className="px-2.5 py-1.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 font-medium transition-colors cursor-pointer"
          >
            Select Connected
          </button>
          <button
            type="button"
            onClick={onDeselectAll}
            className="px-2.5 py-1.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 font-medium transition-colors cursor-pointer"
          >
            Deselect All
          </button>
          <button
            type="button"
            onClick={onTestAll}
            disabled={isTestingAll}
            className="px-2.5 py-1.5 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400 hover:bg-blue-600/20 font-medium flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-[14px] ${isTestingAll ? "animate-spin" : ""}`}>
              {isTestingAll ? "refresh" : "network_check"}
            </span>
            Test All
          </button>
        </div>
      </div>

      {/* Group By Segmented Switcher */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#1E293B]/60 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400 text-[11px] font-medium mr-1">Group by:</span>
          <div className="inline-flex p-0.5 rounded-lg bg-[#0F1420] border border-[#1E293B]">
            {GROUP_OPTIONS.map((opt) => (
              <button
                key={opt.mode}
                type="button"
                onClick={() => onGroupModeChange(opt.mode)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                  groupMode === opt.mode
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span className="material-symbols-outlined text-[13px]">{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Multi-provider filter only for Model view */}
        {groupMode === "model" && onToggleOnlyMultiProvider && (
          <button
            type="button"
            onClick={onToggleOnlyMultiProvider}
            className={`px-2 py-1 rounded-lg border text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer ${
              onlyMultiProvider
                ? "bg-purple-500/15 border-purple-500/30 text-purple-400"
                : "bg-[#0A0D14] border-[#1E293B] text-slate-400 hover:text-slate-200"
            }`}
          >
            <span className="material-symbols-outlined text-[13px]">hub</span>
            Multi-Provider Only (≥2)
          </button>
        )}
      </div>
    </div>
  );
};
