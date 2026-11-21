import React, { useState } from "react";
import { ToolIcon } from "./ui/ToolIcon.js";
import type { ProviderRegistryItem, FreeTierConfig } from "../../../providers/core/types.js";
import type { ResolvedFreeModel, ConnectionTestResult } from "../utils/freeTierHelper.js";

export interface FreeTierProviderCardProps {
  provider: ProviderRegistryItem;
  freeTier: FreeTierConfig;
  freeModels: ResolvedFreeModel[];
  selectedModelValues: Set<string>;
  onToggleModel: (comboModelValue: string) => void;
  onToggleAllProviderModels: (providerId: string, selectAll: boolean) => void;
  connectionStatus: "connected" | "not_connected" | "error" | "exhausted";
  statusLabel: string;
  statusDetail?: string;
  onTestConnection: (providerId: string) => Promise<void>;
  isTesting: boolean;
  defaultExpanded?: boolean;
}

export const FreeTierProviderCard: React.FC<FreeTierProviderCardProps> = ({
  provider,
  freeTier,
  freeModels,
  selectedModelValues,
  onToggleModel,
  onToggleAllProviderModels,
  connectionStatus,
  statusLabel,
  statusDetail,
  onTestConnection,
  isTesting,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const selectedCount = freeModels.filter((m) =>
    selectedModelValues.has(m.comboModelValue)
  ).length;

  const allSelected = freeModels.length > 0 && selectedCount === freeModels.length;
  const isIndeterminate = selectedCount > 0 && selectedCount < freeModels.length;

  const formatLimitTypeBadge = (limitType?: string) => {
    switch (limitType) {
      case "local":
        return { label: "Local Engine", bg: "bg-purple-500/10 text-purple-400 border-purple-500/20" };
      case "credits":
        return { label: "Free Credits", bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
      case "per-model":
        return { label: "Per-Model Limits", bg: "bg-blue-500/10 text-blue-400 border-blue-500/20" };
      case "requests":
      default:
        return { label: "Free Requests", bg: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" };
    }
  };

  const limitBadge = formatLimitTypeBadge(freeTier.limitType);

  return (
    <div className="rounded-xl border border-[#1E293B] bg-[#0A0D14]/90 overflow-hidden transition-all duration-200 hover:border-slate-700">
      {/* Header bar */}
      <div className="p-3.5 flex flex-wrap items-center justify-between gap-3 bg-[#0F1420]/60">
        <div className="flex items-center gap-3 min-w-0">
          {/* Select all checkbox for this provider */}
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = isIndeterminate;
            }}
            onChange={(e) => onToggleAllProviderModels(provider.id, e.target.checked)}
            title={allSelected ? "Deselect all models" : "Select all free models"}
            className="size-4 rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
          />

          {/* Provider icon */}
          <ToolIcon
            id={provider.id}
            name={provider.name}
            image={provider.image}
            color={provider.color}
            iconBg={provider.iconBg}
            size="sm"
          />

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-xs text-white truncate">{provider.name}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${limitBadge.bg}`}>
                {limitBadge.label}
              </span>
            </div>

            {freeTier.note && (
              <p className="text-[11px] text-slate-400 truncate max-w-md" title={freeTier.note}>
                {freeTier.note}
              </p>
            )}
          </div>
        </div>

        {/* Right side status & action buttons */}
        <div className="flex items-center gap-2.5 shrink-0 ml-auto">
          {/* Connection status badge */}
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border ${
              connectionStatus === "connected"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : connectionStatus === "not_connected"
                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                : "bg-rose-500/10 text-rose-400 border-rose-500/20"
            }`}
            title={statusDetail || statusLabel}
          >
            <span className="size-1.5 rounded-full animate-pulse bg-current" />
            <span>{statusLabel}</span>
            {statusDetail && (
              <span className="opacity-75 font-mono text-[10px]">({statusDetail})</span>
            )}
          </div>

          {/* Connection test button */}
          <button
            type="button"
            onClick={() => onTestConnection(provider.id)}
            disabled={isTesting}
            title="Test upstream connection"
            className="px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
          >
            <span
              className={`material-symbols-outlined text-[13px] ${
                isTesting ? "animate-spin text-blue-400" : ""
              }`}
            >
              {isTesting ? "refresh" : "network_check"}
            </span>
            <span>{isTesting ? "Testing" : "Test"}</span>
          </button>

          {/* Selection counter & expand toggle */}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="px-2 py-1 rounded-lg bg-slate-800/50 hover:bg-slate-800 text-slate-300 text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span className="text-slate-400">
              {selectedCount}/{freeModels.length}
            </span>
            <span className="material-symbols-outlined text-[15px] transition-transform duration-200">
              {expanded ? "expand_less" : "expand_more"}
            </span>
          </button>
        </div>
      </div>

      {/* Expanded free model list */}
      {expanded && (
        <div className="p-3 border-t border-[#1E293B] bg-[#0A0D14]/40 space-y-1.5 animate-rt-fade-in">
          {freeModels.length === 0 ? (
            <div className="py-3 text-center text-xs text-slate-500 italic">
              No free models configured or discovered yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto pr-1">
              {freeModels.map((m) => {
                const isSelected = selectedModelValues.has(m.comboModelValue);
                return (
                  <label
                    key={m.comboModelValue}
                    className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                      isSelected
                        ? "bg-blue-600/10 border-blue-500/30 text-white"
                        : "bg-[#0F1420]/50 border-[#1E293B]/70 text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleModel(m.comboModelValue)}
                      className="size-3.5 mt-0.5 rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer shrink-0"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-slate-200 truncate">{m.name}</span>
                        {m.contextLength && (
                          <span className="text-[10px] px-1 rounded bg-slate-800 text-slate-400">
                            {Math.round(m.contextLength / 1000)}k ctx
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-[10px] text-slate-500 truncate">
                          {m.comboModelValue}
                        </span>
                        {m.limit && (
                          <span className="text-[10px] text-cyan-400/90 truncate">
                            • {m.limit}
                          </span>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
