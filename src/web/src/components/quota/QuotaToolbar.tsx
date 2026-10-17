import React from "react";
import { Select } from "../Select";
import { Checkbox } from "../ui/Checkbox";

export type QuotaSortMode = "fixed" | "expiring-first" | "quota-asc" | "quota-desc";
export type AccountStatusFilter = "all" | "active" | "inactive";

export interface QuotaToolbarProps {
  providers: string[];
  selectedProvider: string;
  onSelectProvider: (provider: string) => void;
  statusFilter: AccountStatusFilter;
  onSelectStatusFilter: (status: AccountStatusFilter) => void;
  sortMode: QuotaSortMode;
  onSelectSortMode: (mode: QuotaSortMode) => void;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  autoRefresh: boolean;
  onToggleAutoRefresh: (enabled: boolean) => void;
  countdownSeconds: number;
  isRefreshingAll: boolean;
  onRefreshAll: () => Promise<void>;
  onTurnOffEmpty: () => void;
  onTurnOnAvailable: () => void;
}

export const QuotaToolbar: React.FC<QuotaToolbarProps> = ({
  providers,
  selectedProvider,
  onSelectProvider,
  statusFilter,
  onSelectStatusFilter,
  sortMode,
  onSelectSortMode,
  searchQuery = "",
  onSearchQueryChange,
  autoRefresh,
  onToggleAutoRefresh,
  countdownSeconds,
  isRefreshingAll,
  onRefreshAll,
  onTurnOffEmpty,
  onTurnOnAvailable,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs p-4 rounded-2xl bg-[#0F1420]/80 border border-[#1E293B] shadow-lg w-full">
      {/* Left Filter & Sort Dropdowns */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Provider Filter */}
        <Select
          value={selectedProvider}
          onChange={onSelectProvider}
          options={[
            { value: "all", label: "All providers" },
            ...providers.map((p) => ({ value: p, label: p.toUpperCase() })),
          ]}
          className="min-w-[140px]"
        />

        {/* Account Status Filter */}
        <Select
          value={statusFilter}
          onChange={(val) => onSelectStatusFilter(val as AccountStatusFilter)}
          options={[
            { value: "all", label: "All accounts" },
            { value: "active", label: "Active only" },
            { value: "inactive", label: "Turned off" },
          ]}
          className="min-w-[130px]"
        />

        {/* Sort Dropdown */}
        <Select
          value={sortMode}
          onChange={(val) => onSelectSortMode(val as QuotaSortMode)}
          options={[
            { value: "fixed", label: "Fixed order" },
            { value: "expiring-first", label: "Expiring first" },
            { value: "quota-asc", label: "% Quota: low to high" },
            { value: "quota-desc", label: "% Quota: high to low" },
          ]}
          className="min-w-[165px]"
        />

        {/* Search accounts */}
        {onSearchQueryChange && (
          <div className="relative w-40 sm:w-48">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-slate-500">
              search
            </span>
            <input
              type="text"
              placeholder="Search accounts..."
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono transition-all"
            />
            {Boolean(searchQuery) && (
              <button
                type="button"
                onClick={() => onSearchQueryChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
                title="Clear search"
              >
                <span className="material-symbols-outlined text-[15px]">close</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Right Action Buttons */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Turn off Empty */}
        <button
          onClick={onTurnOffEmpty}
          title="Turn off all accounts with depleted (0%) quota"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer font-medium active:scale-95"
        >
          <span className="material-symbols-outlined text-[15px]">block</span>
          Turn off Empty
        </button>

        {/* Turn on Available */}
        <button
          onClick={onTurnOnAvailable}
          title="Turn on accounts with available (>0%) quota"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors cursor-pointer font-medium active:scale-95"
        >
          <span className="material-symbols-outlined text-[15px]">check_circle</span>
          Turn on Available
        </button>

        {/* Auto Refresh Toggle & Timer */}
        <div className="flex items-center gap-2 bg-[#0A0D14] border border-[#1E293B] px-3 py-1.5 rounded-xl select-none">
          <Checkbox
            size="sm"
            checked={autoRefresh}
            onChange={(checked) => onToggleAutoRefresh(checked)}
            label="Autorefresh"
          />
          {autoRefresh && (
            <span className="font-mono text-[10px] text-blue-400 font-semibold bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
              {countdownSeconds}s
            </span>
          )}
        </div>

        {/* Manual Refresh Button */}
        <button
          onClick={onRefreshAll}
          disabled={isRefreshingAll}
          title="Refresh all quotas"
          className="p-1.5 rounded-xl border border-[#1E293B] bg-[#0A0D14] text-slate-400 hover:text-white hover:border-slate-600 transition-colors cursor-pointer disabled:opacity-50"
        >
          <span
            className={`material-symbols-outlined text-[17px] ${
              isRefreshingAll ? "animate-spin text-blue-400" : ""
            }`}
          >
            refresh
          </span>
        </button>
      </div>
    </div>
  );
};
