import React from "react";
import {
  Terminal,
  Layers,
  Search,
  X,
  ArrowDownToLine,
  Pause,
  Copy,
  Check,
  Trash2,
  Filter,
} from "lucide-react";

export type ConsoleCategoryTab =
  | "all"
  | "proxy"
  | "stream"
  | "errors"
  | "system";

export type ConsoleViewMode = "structured" | "raw";

interface ConsoleToolbarProps {
  connected: boolean;
  totalCount: number;
  filteredCount: number;
  viewMode: ConsoleViewMode;
  onViewModeChange: (mode: ConsoleViewMode) => void;
  categoryTab: ConsoleCategoryTab;
  onCategoryTabChange: (tab: ConsoleCategoryTab) => void;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  clientToolFilter: string;
  onClientToolFilterChange: (tool: string) => void;
  providerFilter: string;
  onProviderFilterChange: (prov: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  autoScroll: boolean;
  onAutoScrollToggle: () => void;
  onCopy: () => void;
  copied: boolean;
  onClear: () => void;
  availableTools: string[];
  availableProviders: string[];
}

export const ConsoleToolbar: React.FC<ConsoleToolbarProps> = ({
  connected,
  totalCount,
  filteredCount,
  viewMode,
  onViewModeChange,
  categoryTab,
  onCategoryTabChange,
  searchQuery,
  onSearchQueryChange,
  clientToolFilter,
  onClientToolFilterChange,
  providerFilter,
  onProviderFilterChange,
  statusFilter,
  onStatusFilterChange,
  autoScroll,
  onAutoScrollToggle,
  onCopy,
  copied,
  onClear,
  availableTools,
  availableProviders,
}) => {
  return (
    <div className="space-y-2.5 shrink-0">
      {/* Top Bar: Connection, Mode Toggle, and Actions */}
      <div className="rt-card px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Status, Count, and View Mode Switch */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#0A0D14] border border-[#1E293B]">
            <span
              className={`size-2 rounded-full ${
                connected ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-red-500 animate-pulse"
              }`}
            />
            <span className="text-xs font-semibold text-slate-300">
              {connected ? "Live Stream" : "Disconnected"}
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0A0D14] border border-[#1E293B] text-xs font-mono text-slate-400">
            <span className="text-slate-200 font-semibold">{filteredCount}</span>
            {filteredCount !== totalCount && (
              <span className="text-slate-500">/ {totalCount}</span>
            )}
            <span>logs</span>
          </div>

          {/* Mode Switch: Structured vs Raw */}
          <div className="flex items-center bg-[#0A0D14] p-0.5 rounded-lg border border-[#1E293B]">
            <button
              type="button"
              onClick={() => onViewModeChange("structured")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === "structured"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Layers className="size-3.5" />
              <span>Structured Stream</span>
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("raw")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === "raw"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Terminal className="size-3.5" />
              <span>Raw Terminal</span>
            </button>
          </div>
        </div>

        {/* Right: Auto-scroll, Copy, Clear */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onAutoScrollToggle}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${
              autoScroll
                ? "bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20"
                : "bg-slate-800/40 text-slate-400 border-slate-700/60 hover:text-slate-200"
            }`}
            title={autoScroll ? "Pause auto-scrolling" : "Enable auto-scrolling"}
          >
            {autoScroll ? <ArrowDownToLine className="size-3.5" /> : <Pause className="size-3.5" />}
            <span className="hidden sm:inline">{autoScroll ? "Auto-scroll ON" : "Paused"}</span>
          </button>

          <button
            type="button"
            onClick={onCopy}
            disabled={filteredCount === 0}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#0A0D14] border border-[#1E293B] text-slate-300 hover:text-white hover:border-slate-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Copy logs"
          >
            {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
            <span>{copied ? "Copied!" : "Copy"}</span>
          </button>

          <button
            type="button"
            onClick={onClear}
            disabled={totalCount === 0}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:border-red-500/40 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Clear all logs"
          >
            <Trash2 className="size-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Category Tabs and Deep Filter Controls */}
      <div className="rt-card px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Category Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {(
            [
              { id: "all", label: "All Logs" },
              { id: "proxy", label: "AI Requests" },
              { id: "stream", label: "Stream & Tools" },
              { id: "errors", label: "Errors & Warns" },
              { id: "system", label: "System & MITM" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onCategoryTabChange(tab.id)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                categoryTab === tab.id
                  ? "bg-[#1E293B] text-blue-400 font-semibold shadow-xs"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filter Dropdowns & Search Input */}
        <div className="flex items-center gap-2 flex-wrap flex-1 justify-end min-w-[280px]">
          {/* Client Tool Dropdown */}
          <select
            value={clientToolFilter}
            onChange={(e) => onClientToolFilterChange(e.target.value)}
            className="bg-[#0A0D14] border border-[#1E293B] rounded-lg px-2 py-1 text-xs text-slate-300 font-mono focus:outline-hidden focus:border-blue-500"
          >
            <option value="all">Tool: All</option>
            {availableTools.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {/* Provider Dropdown */}
          <select
            value={providerFilter}
            onChange={(e) => onProviderFilterChange(e.target.value)}
            className="bg-[#0A0D14] border border-[#1E293B] rounded-lg px-2 py-1 text-xs text-slate-300 font-mono focus:outline-hidden focus:border-blue-500"
          >
            <option value="all">Provider: All</option>
            {availableProviders.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          {/* Status Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className="bg-[#0A0D14] border border-[#1E293B] rounded-lg px-2 py-1 text-xs text-slate-300 font-mono focus:outline-hidden focus:border-blue-500"
          >
            <option value="all">Status: All</option>
            <option value="200">200 OK</option>
            <option value="429">429 Rate Limit</option>
            <option value="error">5xx / Errors</option>
          </select>

          {/* Search Box */}
          <div className="relative w-44 sm:w-52">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search in logs..."
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-lg pl-8 pr-7 py-1 text-xs text-white placeholder-slate-500 font-mono focus:outline-hidden focus:border-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchQueryChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
