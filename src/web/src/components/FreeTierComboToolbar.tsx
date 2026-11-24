import React from "react";
import type { FreeTierGroupMode } from "../utils/freeTierGrouping.js";
import type { FreeTierModalityFilter } from "./freeTier/freeTierModalUtils.js";

export interface FreeTierComboToolbarProps {
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onlyConnected: boolean;
  onToggleOnlyConnected: () => void;
  groupMode: FreeTierGroupMode;
  onGroupModeChange: (mode: FreeTierGroupMode) => void;
  onlyMultiProvider: boolean;
  onToggleOnlyMultiProvider: () => void;
  modalityFilter: FreeTierModalityFilter;
  onModalityFilterChange: (filter: FreeTierModalityFilter) => void;
  onSelectConnectedOnly: () => void;
  onDeselectAll: () => void;
  onTestAll: () => void;
  isTestingAll: boolean;
  mobileTab: "catalog" | "selected";
  onMobileTabChange: (tab: "catalog" | "selected") => void;
  totalMatchingCount: number;
  selectedCount: number;
  isMultiMode: boolean;
  activeGroupsCount: number;
}

export const FreeTierComboToolbar: React.FC<FreeTierComboToolbarProps> = ({
  searchInputRef,
  searchQuery,
  onSearchChange,
  onlyConnected,
  onToggleOnlyConnected,
  groupMode,
  onGroupModeChange,
  onlyMultiProvider,
  onToggleOnlyMultiProvider,
  modalityFilter,
  onModalityFilterChange,
  onSelectConnectedOnly,
  onDeselectAll,
  onTestAll,
  isTestingAll,
  mobileTab,
  onMobileTabChange,
  totalMatchingCount,
  selectedCount,
  isMultiMode,
  activeGroupsCount,
}) => {
  return (
    <>
      <div className="px-4 sm:px-5 py-2.5 border-b border-[#1E293B] bg-[#0A0D14]/40 flex flex-wrap items-center gap-2 shrink-0">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-slate-500">
            search
          </span>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search free providers or models..."
            className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl pl-9 pr-7 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white cursor-pointer"
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          )}
        </div>

        {/* Group Mode */}
        <div className="flex items-center p-0.5 rounded-xl bg-[#0A0D14] border border-[#1E293B] shrink-0">
          {(
            [
              { id: "provider", label: "Provider" },
              { id: "model", label: "Model" },
              { id: "family", label: "Family" },
              { id: "role", label: "Role" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onGroupModeChange(tab.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                groupMode === tab.id
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Connected Only */}
        <button
          type="button"
          onClick={onToggleOnlyConnected}
          className={`px-2.5 py-1.5 rounded-xl text-[11px] font-medium border flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
            onlyConnected
              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/35"
              : "bg-[#0A0D14] text-slate-400 border-[#1E293B] hover:text-white"
          }`}
        >
          <span className="material-symbols-outlined text-[13px]">
            {onlyConnected ? "check_circle" : "filter_alt"}
          </span>
          <span>Connected Only</span>
        </button>

        {/* 2+ Providers in By Model mode */}
        {groupMode === "model" && (
          <button
            type="button"
            onClick={onToggleOnlyMultiProvider}
            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-medium border flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
              onlyMultiProvider
                ? "bg-purple-500/15 text-purple-300 border-purple-500/35"
                : "bg-[#0A0D14] text-slate-400 border-[#1E293B] hover:text-white"
            }`}
          >
            <span className="material-symbols-outlined text-[13px]">hub</span>
            <span>2+ Providers</span>
          </button>
        )}

        {/* Modality Chips */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onModalityFilterChange("all")}
            className={`px-2 py-1.5 rounded-xl text-[11px] font-medium border transition-colors cursor-pointer ${
              modalityFilter === "all"
                ? "bg-blue-600 text-white border-blue-500"
                : "bg-[#0A0D14] text-slate-400 border-[#1E293B] hover:text-white"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() =>
              onModalityFilterChange(modalityFilter === "vision" ? "all" : "vision")
            }
            className={`px-2 py-1.5 rounded-xl text-[11px] font-medium border transition-colors cursor-pointer flex items-center gap-1 ${
              modalityFilter === "vision"
                ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                : "bg-[#0A0D14] text-slate-400 border-[#1E293B] hover:text-cyan-300"
            }`}
          >
            <span className="material-symbols-outlined text-[13px]">visibility</span>
            Vision
          </button>
          <button
            type="button"
            onClick={() =>
              onModalityFilterChange(modalityFilter === "reasoning" ? "all" : "reasoning")
            }
            className={`px-2 py-1.5 rounded-xl text-[11px] font-medium border transition-colors cursor-pointer flex items-center gap-1 ${
              modalityFilter === "reasoning"
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                : "bg-[#0A0D14] text-slate-400 border-[#1E293B] hover:text-emerald-300"
            }`}
          >
            <span className="material-symbols-outlined text-[13px]">psychology</span>
            Reasoning
          </button>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <button
            type="button"
            onClick={onSelectConnectedOnly}
            className="px-2 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-medium border border-emerald-500/25 cursor-pointer"
            title="Select all models from connected providers"
          >
            + Connected
          </button>
          <button
            type="button"
            onClick={onDeselectAll}
            className="px-2 py-1.5 rounded-xl bg-[#0A0D14] hover:bg-slate-800 text-slate-400 hover:text-white text-[11px] font-medium border border-[#1E293B] cursor-pointer"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onTestAll}
            disabled={isTestingAll}
            className="px-2.5 py-1.5 rounded-xl bg-blue-600/15 hover:bg-blue-600/25 text-blue-400 text-[11px] font-semibold border border-blue-500/30 flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <span
              className={`material-symbols-outlined text-[13px] ${
                isTestingAll ? "animate-spin" : ""
              }`}
            >
              {isTestingAll ? "refresh" : "network_check"}
            </span>
            <span>{isTestingAll ? "Testing..." : "Test All"}</span>
          </button>
        </div>
      </div>

      {/* Mobile Tab Switcher (< lg) */}
      <div className="lg:hidden grid grid-cols-2 border-b border-[#1E293B] bg-[#080B12] shrink-0">
        <button
          type="button"
          onClick={() => onMobileTabChange("catalog")}
          className={`py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
            mobileTab === "catalog"
              ? "border-emerald-500 text-emerald-400 bg-emerald-500/5"
              : "border-transparent text-slate-400"
          }`}
        >
          Browse ({totalMatchingCount})
        </button>
        <button
          type="button"
          onClick={() => onMobileTabChange("selected")}
          className={`py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
            mobileTab === "selected"
              ? "border-emerald-500 text-emerald-400 bg-emerald-500/5"
              : "border-transparent text-slate-400"
          }`}
        >
          {isMultiMode ? `Combos (${activeGroupsCount})` : `Selected (${selectedCount})`}
        </button>
      </div>
    </>
  );
};
