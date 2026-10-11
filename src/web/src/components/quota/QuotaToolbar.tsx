import React from "react";

export type QuotaSortMode = "expiring-first" | "quota-asc" | "quota-desc";
export type AccountStatusFilter = "all" | "active" | "inactive";

export interface QuotaToolbarProps {
  providers: string[];
  selectedProvider: string;
  onSelectProvider: (provider: string) => void;
  statusFilter: AccountStatusFilter;
  onSelectStatusFilter: (status: AccountStatusFilter) => void;
  sortMode: QuotaSortMode;
  onSelectSortMode: (mode: QuotaSortMode) => void;
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
        <select
          value={selectedProvider}
          onChange={(e) => onSelectProvider(e.target.value)}
          className="bg-[#0A0D14] border border-[#1E293B] text-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:border-blue-500 cursor-pointer"
        >
          <option value="all">All providers</option>
          {providers.map((p) => (
            <option key={p} value={p}>
              {p.toUpperCase()}
            </option>
          ))}
        </select>

        {/* Account Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => onSelectStatusFilter(e.target.value as AccountStatusFilter)}
          className="bg-[#0A0D14] border border-[#1E293B] text-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:border-blue-500 cursor-pointer"
        >
          <option value="all">All accounts</option>
          <option value="active">Active only</option>
          <option value="inactive">Turned off</option>
        </select>

        {/* Sort Dropdown */}
        <select
          value={sortMode}
          onChange={(e) => onSelectSortMode(e.target.value as QuotaSortMode)}
          className="bg-[#0A0D14] border border-[#1E293B] text-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:border-blue-500 cursor-pointer"
        >
          <option value="expiring-first">Expiring first</option>
          <option value="quota-asc">% Quota: low to high</option>
          <option value="quota-desc">% Quota: high to low</option>
        </select>
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
          <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => onToggleAutoRefresh(e.target.checked)}
              className="accent-blue-600 rounded cursor-pointer"
            />
            Autorefresh
          </label>
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
