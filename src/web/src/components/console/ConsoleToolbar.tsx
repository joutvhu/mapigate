import React, { useMemo } from "react";
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
  RotateCcw,
} from "lucide-react";
import { Select, type SelectOption } from "../Select";

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
  levelFilter: string;
  onLevelFilterChange: (level: string) => void;
  gatewayLogLevel: string;
  onGatewayLogLevelChange: (level: string) => void;
  autoScroll: boolean;
  onAutoScrollToggle: () => void;
  onCopy: () => void;
  copied: boolean;
  onClear: () => void;
  availableTools: string[];
  availableProviders: string[];
}

const GATEWAY_LEVEL_OPTIONS: SelectOption[] = [
  {
    value: "trace",
    label: "TRACE (Max)",
    icon: <span className="size-2 rounded-full bg-purple-400 shadow-[0_0_6px_#c084fc]" />,
  },
  {
    value: "debug",
    label: "DEBUG",
    icon: <span className="size-2 rounded-full bg-sky-400 shadow-[0_0_6px_#38bdf8]" />,
  },
  {
    value: "info",
    label: "INFO (Default)",
    icon: <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />,
  },
  {
    value: "warn",
    label: "WARN",
    icon: <span className="size-2 rounded-full bg-amber-400 shadow-[0_0_6px_#facc15]" />,
  },
  {
    value: "error",
    label: "ERROR",
    icon: <span className="size-2 rounded-full bg-red-400 shadow-[0_0_6px_#f87171]" />,
  },
];

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
  levelFilter,
  onLevelFilterChange,
  gatewayLogLevel,
  onGatewayLogLevelChange,
  autoScroll,
  onAutoScrollToggle,
  onCopy,
  copied,
  onClear,
  availableTools,
  availableProviders,
}) => {
  const toolOptions: SelectOption[] = useMemo(
    () => [
      { value: "all", label: "Tool: All" },
      ...availableTools.map((t) => ({ value: t, label: `Tool: ${t}` })),
    ],
    [availableTools]
  );

  const providerOptions: SelectOption[] = useMemo(
    () => [
      { value: "all", label: "Provider: All" },
      ...availableProviders.map((p) => ({ value: p, label: `Provider: ${p}` })),
    ],
    [availableProviders]
  );

  const statusOptions: SelectOption[] = useMemo(
    () => [
      { value: "all", label: "Status: All" },
      {
        value: "200",
        label: "200 OK",
        icon: <span className="size-1.5 rounded-full bg-emerald-400" />,
      },
      {
        value: "429",
        label: "429 Rate Limit",
        icon: <span className="size-1.5 rounded-full bg-amber-400" />,
      },
      {
        value: "error",
        label: "5xx / Errors",
        icon: <span className="size-1.5 rounded-full bg-red-400" />,
      },
    ],
    []
  );

  const levelOptions: SelectOption[] = useMemo(
    () => [
      { value: "all", label: "Level: All" },
      {
        value: "trace",
        label: "Trace only",
        icon: <span className="size-1.5 rounded-full bg-purple-400" />,
      },
      {
        value: "debug",
        label: "Debug only",
        icon: <span className="size-1.5 rounded-full bg-sky-400" />,
      },
      {
        value: "info",
        label: "Info only",
        icon: <span className="size-1.5 rounded-full bg-emerald-400" />,
      },
      {
        value: "warn",
        label: "Warn only",
        icon: <span className="size-1.5 rounded-full bg-amber-400" />,
      },
      {
        value: "error",
        label: "Error only",
        icon: <span className="size-1.5 rounded-full bg-red-400" />,
      },
    ],
    []
  );

  const hasActiveFilters =
    clientToolFilter !== "all" ||
    providerFilter !== "all" ||
    statusFilter !== "all" ||
    levelFilter !== "all" ||
    searchQuery.trim() !== "";

  const handleResetFilters = () => {
    onClientToolFilterChange("all");
    onProviderFilterChange("all");
    onStatusFilterChange("all");
    onLevelFilterChange("all");
    onSearchQueryChange("");
  };

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

          {/* Gateway Runtime Log Level Controller */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 shrink-0">Log Level:</span>
            <Select
              value={gatewayLogLevel}
              onChange={onGatewayLogLevelChange}
              options={GATEWAY_LEVEL_OPTIONS}
              size="sm"
              className="min-w-[145px]"
              triggerClassName="h-8 !py-1 !px-2.5 text-xs font-semibold rounded-lg bg-[#0A0D14] border-[#1E293B] hover:border-slate-700"
              menuClassName="min-w-[145px] shadow-2xl border border-[#1E293B] bg-[#0A0D14]/95 backdrop-blur-xl"
            />
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
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                categoryTab === tab.id
                  ? "bg-blue-600/15 text-blue-400 font-semibold border border-blue-500/30 shadow-xs"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filter Dropdowns & Search Input */}
        <div className="flex items-center gap-2 flex-wrap flex-1 justify-end min-w-[280px]">
          {/* Client Tool Dropdown */}
          <Select
            value={clientToolFilter}
            onChange={onClientToolFilterChange}
            options={toolOptions}
            size="sm"
            className="min-w-[115px]"
            triggerClassName={`h-8 !py-1 !px-2.5 text-xs font-medium rounded-lg transition-colors ${
              clientToolFilter !== "all"
                ? "border-blue-500/50 bg-blue-500/10 text-blue-300 font-semibold"
                : "border-[#1E293B] bg-[#0A0D14] text-slate-300 hover:border-slate-700"
            }`}
            menuClassName="min-w-[130px] shadow-2xl border border-[#1E293B] bg-[#0A0D14]/95 backdrop-blur-xl"
          />

          {/* Provider Dropdown */}
          <Select
            value={providerFilter}
            onChange={onProviderFilterChange}
            options={providerOptions}
            size="sm"
            className="min-w-[125px]"
            triggerClassName={`h-8 !py-1 !px-2.5 text-xs font-medium rounded-lg transition-colors ${
              providerFilter !== "all"
                ? "border-blue-500/50 bg-blue-500/10 text-blue-300 font-semibold"
                : "border-[#1E293B] bg-[#0A0D14] text-slate-300 hover:border-slate-700"
            }`}
            menuClassName="min-w-[140px] shadow-2xl border border-[#1E293B] bg-[#0A0D14]/95 backdrop-blur-xl"
          />

          {/* Status Dropdown */}
          <Select
            value={statusFilter}
            onChange={onStatusFilterChange}
            options={statusOptions}
            size="sm"
            className="min-w-[115px]"
            triggerClassName={`h-8 !py-1 !px-2.5 text-xs font-medium rounded-lg transition-colors ${
              statusFilter !== "all"
                ? "border-blue-500/50 bg-blue-500/10 text-blue-300 font-semibold"
                : "border-[#1E293B] bg-[#0A0D14] text-slate-300 hover:border-slate-700"
            }`}
            menuClassName="min-w-[130px] shadow-2xl border border-[#1E293B] bg-[#0A0D14]/95 backdrop-blur-xl"
          />

          {/* Level Filter Dropdown */}
          <Select
            value={levelFilter}
            onChange={onLevelFilterChange}
            options={levelOptions}
            size="sm"
            className="min-w-[115px]"
            triggerClassName={`h-8 !py-1 !px-2.5 text-xs font-medium rounded-lg transition-colors ${
              levelFilter !== "all"
                ? "border-blue-500/50 bg-blue-500/10 text-blue-300 font-semibold"
                : "border-[#1E293B] bg-[#0A0D14] text-slate-300 hover:border-slate-700"
            }`}
            menuClassName="right-0 left-auto min-w-[130px] shadow-2xl border border-[#1E293B] bg-[#0A0D14]/95 backdrop-blur-xl"
          />

          {/* Reset Filters Quick Button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="h-8 px-2 py-1 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent hover:border-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
              title="Reset all filters to default"
            >
              <RotateCcw className="size-3" />
              <span className="hidden xl:inline">Reset</span>
            </button>
          )}

          {/* Search Box */}
          <div className="relative w-44 sm:w-52">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search in logs..."
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="h-8 w-full bg-[#0A0D14] border border-[#1E293B] rounded-lg pl-8 pr-7 text-xs text-white placeholder-slate-500 font-mono focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
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
