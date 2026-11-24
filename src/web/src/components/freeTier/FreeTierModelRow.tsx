import React from "react";
import { ToolIcon } from "../ui/ToolIcon.js";
import { CapacityBadges } from "../CapacityBadges.js";
import { formatContextLength } from "../modelSelect/types.js";
import type { FreeTierCandidateItem } from "./freeTierModalUtils.js";

export interface FreeTierModelRowProps {
  item: FreeTierCandidateItem;
  isSelected: boolean;
  showProviderInfo: boolean;
  isTesting: boolean;
  onToggle: (comboModelValue: string) => void;
  onTestConnection: (providerId: string) => void;
}

export const FreeTierModelRow = React.memo<FreeTierModelRowProps>(
  ({ item, isSelected, showProviderInfo, isTesting, onToggle, onTestConnection }) => {
    const ctxBadge = formatContextLength(item.contextLength);
    const dotClass =
      item.connectionStatus === "connected"
        ? "bg-emerald-400"
        : item.connectionStatus === "not_connected"
        ? "bg-amber-400"
        : "bg-rose-400";

    return (
      <div
        onClick={() => onToggle(item.comboModelValue)}
        className={`h-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl border transition-colors duration-75 cursor-pointer select-none ${
          isSelected
            ? "bg-emerald-600/12 border-emerald-500/45 text-white"
            : "bg-[#0A0D14] border-[#1E293B] hover:border-slate-700 hover:bg-[#0F1420] text-slate-300"
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {showProviderInfo && (
            <ToolIcon
              src={item.providerImage}
              name={item.providerName}
              color={item.providerColor}
              iconBg={item.providerIconBg}
              size="sm"
              className="!size-6 !rounded-lg !p-0.5 shrink-0"
            />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              {showProviderInfo && (
                <span className="px-1.5 py-0.2 rounded bg-slate-800/90 border border-slate-700/70 text-[9.5px] font-medium text-slate-300 shrink-0 max-w-[96px] truncate">
                  {item.providerName}
                </span>
              )}
              <span className="text-xs font-semibold text-white truncate">{item.modelName}</span>
              {ctxBadge && (
                <span className="text-[9.5px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700/60 leading-tight shrink-0">
                  {ctxBadge}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 min-w-0 mt-0.5">
              <span className="font-mono text-[10.5px] text-slate-400 truncate">
                {item.comboModelValue}
              </span>
              {item.limit && (
                <span className="text-[10px] text-cyan-400/90 truncate shrink-0 max-w-[150px]">
                  • {item.limit}
                </span>
              )}
              {item.latencyMs != null && (
                <span className="text-[10px] text-emerald-400 font-mono shrink-0">
                  {item.latencyMs}ms
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <CapacityBadges caps={item.caps} size="xs" />

          {showProviderInfo && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTestConnection(item.providerId);
              }}
              disabled={isTesting}
              title={item.statusDetail ? `${item.statusLabel} (${item.statusDetail})` : item.statusLabel}
              className="p-1 rounded-lg bg-[#141B2D] border border-[#1E293B] hover:border-slate-600 text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <span className={`size-1.5 rounded-full ${dotClass}`} />
              <span
                className={`material-symbols-outlined text-[13px] ${
                  isTesting ? "animate-spin text-blue-400" : ""
                }`}
              >
                {isTesting ? "refresh" : "network_check"}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(item.comboModelValue);
            }}
            aria-label={isSelected ? `Deselect ${item.comboModelValue}` : `Select ${item.comboModelValue}`}
            className={`size-7 rounded-lg flex items-center justify-center shrink-0 border transition-colors duration-75 cursor-pointer ${
              isSelected
                ? "bg-emerald-600 border-emerald-500 text-white"
                : "bg-[#141B2D] border-[#1E293B] text-slate-400 hover:text-white hover:border-slate-600"
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              {isSelected ? "check" : "add"}
            </span>
          </button>
        </div>
      </div>
    );
  }
);
FreeTierModelRow.displayName = "FreeTierModelRow";
