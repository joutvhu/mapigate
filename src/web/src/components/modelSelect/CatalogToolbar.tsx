import React from "react";

export interface CatalogToolbarProps {
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  connectedOnly: boolean;
  onToggleConnectedOnly: () => void;
  hasConnectedAccounts: boolean;
  connectedProvidersCount: number;
  activeModalityFilter: string;
  onModalityChange: (modality: string) => void;
  mobileTab: "catalog" | "selected";
  onMobileTabChange: (tab: "catalog" | "selected") => void;
  totalMatchingCount: number;
  selectedCount: number;
}

export const CatalogToolbar: React.FC<CatalogToolbarProps> = React.memo(
  ({
    searchInputRef,
    searchQuery,
    onSearchChange,
    connectedOnly,
    onToggleConnectedOnly,
    hasConnectedAccounts,
    connectedProvidersCount,
    activeModalityFilter,
    onModalityChange,
    mobileTab,
    onMobileTabChange,
    totalMatchingCount,
    selectedCount,
  }) => {
    return (
      <>
        <div className="px-4 sm:px-5 py-2.5 border-b border-[#1E293B] bg-[#0A0D14]/50 flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[220px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[17px] text-slate-500">
              search
            </span>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search models by name, provider, or ID..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl pl-9 pr-8 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white cursor-pointer"
                title="Clear search"
              >
                <span className="material-symbols-outlined text-[15px]">close</span>
              </button>
            )}
          </div>

          {/* Connected Only Filter */}
          <button
            type="button"
            onClick={onToggleConnectedOnly}
            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-medium border transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ${
              connectedOnly
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                : "bg-[#0A0D14] text-slate-400 border-[#1E293B] hover:text-white"
            }`}
            title={
              connectedOnly
                ? "Showing only models from connected accounts. Click to show all models."
                : "Showing all catalog models. Click to filter by connected accounts."
            }
          >
            <span className="material-symbols-outlined text-[14px]">
              {connectedOnly ? "check_circle" : "tune"}
            </span>
            <span>Connected Only</span>
            {hasConnectedAccounts && (
              <span className="text-[9.5px] px-1 rounded bg-emerald-500/25 text-emerald-300 font-mono">
                {connectedProvidersCount}
              </span>
            )}
          </button>

          {/* Modality Filter Chips */}
          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
            <button
              type="button"
              onClick={() => onModalityChange("all")}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-medium border transition-colors cursor-pointer ${
                activeModalityFilter === "all"
                  ? "bg-blue-600 text-white border-blue-500"
                  : "bg-[#0A0D14] text-slate-400 border-[#1E293B] hover:text-white"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => onModalityChange("vision")}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-medium border transition-colors cursor-pointer flex items-center gap-1 ${
                activeModalityFilter === "vision"
                  ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                  : "bg-[#0A0D14] text-slate-400 border-[#1E293B] hover:text-cyan-300"
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">visibility</span>
              Vision
            </button>
            <button
              type="button"
              onClick={() => onModalityChange("audio")}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-medium border transition-colors cursor-pointer flex items-center gap-1 ${
                activeModalityFilter === "audio"
                  ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                  : "bg-[#0A0D14] text-slate-400 border-[#1E293B] hover:text-purple-300"
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">graphic_eq</span>
              Audio
            </button>
            <button
              type="button"
              onClick={() => onModalityChange("thinking")}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-medium border transition-colors cursor-pointer flex items-center gap-1 ${
                activeModalityFilter === "thinking"
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  : "bg-[#0A0D14] text-slate-400 border-[#1E293B] hover:text-emerald-300"
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">psychology</span>
              Reasoning
            </button>
          </div>
        </div>

        {/* Mobile View Switcher (< lg) */}
        <div className="lg:hidden grid grid-cols-2 border-b border-[#1E293B] bg-[#080B12] shrink-0">
          <button
            type="button"
            onClick={() => onMobileTabChange("catalog")}
            className={`py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              mobileTab === "catalog"
                ? "border-blue-500 text-blue-400 bg-blue-500/5"
                : "border-transparent text-slate-400"
            }`}
          >
            Browse Catalog ({totalMatchingCount})
          </button>
          <button
            type="button"
            onClick={() => onMobileTabChange("selected")}
            className={`py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              mobileTab === "selected"
                ? "border-blue-500 text-blue-400 bg-blue-500/5"
                : "border-transparent text-slate-400"
            }`}
          >
            Selected ({selectedCount})
          </button>
        </div>
      </>
    );
  }
);
CatalogToolbar.displayName = "CatalogToolbar";
