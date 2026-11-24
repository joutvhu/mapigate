import React from "react";
import { CapacityBadges } from "../CapacityBadges.js";
import { formatContextLength, type ModelOption } from "./types.js";

export interface ModelOptionRowProps {
  item: ModelOption;
  isSelected: boolean;
  showProviderBadge?: boolean;
  onToggle: (item: ModelOption) => void;
}

export const ModelOptionRow = React.memo<ModelOptionRowProps>(
  ({ item, isSelected, showProviderBadge = false, onToggle }) => {
    const ctxBadge = formatContextLength(item.contextLength);

    return (
      <div
        onClick={() => onToggle(item)}
        className={`h-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl border transition-colors duration-75 cursor-pointer select-none ${
          isSelected
            ? "bg-blue-600/12 border-blue-500/45 text-white"
            : "bg-[#0A0D14] border-[#1E293B] hover:border-slate-700 hover:bg-[#0F1420] text-slate-300"
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {showProviderBadge && (
              <span className="px-1.5 py-0.2 rounded bg-slate-800/90 border border-slate-700/70 text-[9.5px] font-medium text-slate-300 shrink-0 max-w-[100px] truncate">
                {item.providerName}
              </span>
            )}
            <span className="text-xs font-semibold text-white truncate">{item.name}</span>
            {ctxBadge && (
              <span className="text-[9.5px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700/60 leading-tight shrink-0">
                {ctxBadge}
              </span>
            )}
            {item.isCustom && (
              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 shrink-0">
                alias
              </span>
            )}
          </div>
          <div className="font-mono text-[11px] text-slate-400 truncate mt-0.5">{item.value}</div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <CapacityBadges caps={item.caps} size="xs" />

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(item);
            }}
            aria-label={isSelected ? `Deselect ${item.value}` : `Select ${item.value}`}
            className={`size-7 rounded-lg flex items-center justify-center shrink-0 border transition-colors duration-75 cursor-pointer ${
              isSelected
                ? "bg-blue-600 border-blue-500 text-white"
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
ModelOptionRow.displayName = "ModelOptionRow";
