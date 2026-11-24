import React from "react";
import { CapacityBadges } from "../CapacityBadges.js";
import type { ComboSummary } from "./types.js";

export interface ComboSelectorListProps {
  combos: ComboSummary[];
  selectedSet: Set<string>;
  onToggleCombo: (combo: ComboSummary) => void;
}

const STRATEGY_BADGE_MAP: Record<string, { label: string; cls: string }> = {
  "round-robin": {
    label: "Round Robin",
    cls: "bg-cyan-950/40 text-cyan-300 border-cyan-500/30",
  },
  fusion: {
    label: "Fusion",
    cls: "bg-purple-950/40 text-purple-300 border-purple-500/30",
  },
  lkgp: {
    label: "LKGP",
    cls: "bg-emerald-950/40 text-emerald-300 border-emerald-500/30",
  },
  p2c: {
    label: "P2C",
    cls: "bg-indigo-950/40 text-indigo-300 border-indigo-500/30",
  },
  fallback: {
    label: "Fallback",
    cls: "bg-amber-950/40 text-amber-300 border-amber-500/30",
  },
};

export const ComboSelectorList: React.FC<ComboSelectorListProps> = React.memo(
  ({ combos, selectedSet, onToggleCombo }) => {
    if (combos.length === 0) {
      return (
        <div className="py-12 text-center text-slate-500 text-xs space-y-2">
          <span className="material-symbols-outlined text-[26px] text-slate-600 block mx-auto">
            layers_clear
          </span>
          <p className="max-w-xs mx-auto">No combos found matching your search or filters.</p>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {combos.map((combo) => {
          const isSelected = selectedSet.has(combo.name);
          const strat = combo.strategy
            ? STRATEGY_BADGE_MAP[combo.strategy] || STRATEGY_BADGE_MAP.fallback
            : null;

          return (
            <div
              key={combo.id}
              onClick={() => onToggleCombo(combo)}
              className={`flex items-center justify-between p-3 rounded-xl border transition-colors duration-75 cursor-pointer ${
                isSelected
                  ? "bg-cyan-950/30 border-cyan-500/50 text-white"
                  : "bg-[#0A0D14]/70 border-[#1E293B] hover:border-slate-700 text-slate-300"
              }`}
            >
              <div className="min-w-0 pr-2 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 border border-cyan-500/40 font-mono text-[9.5px] text-cyan-300 font-semibold tracking-wide">
                    COMBO
                  </span>
                  <span className="text-xs font-semibold text-white truncate">{combo.name}</span>
                  {strat && (
                    <span
                      className={`px-1.5 py-0.2 rounded font-sans text-[9px] font-medium border ${strat.cls}`}
                    >
                      {strat.label}
                    </span>
                  )}
                </div>

                <div className="font-mono text-[11px] text-slate-400 truncate">
                  <span className="text-cyan-400 font-semibold">
                    {combo.models.length} model{combo.models.length > 1 ? "s" : ""}:
                  </span>{" "}
                  <span className="text-slate-300">{combo.models.join(", ")}</span>
                </div>

                {combo.caps && (
                  <div className="pt-0.5">
                    <CapacityBadges caps={combo.caps} size="xs" />
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCombo(combo);
                }}
                className={`size-7 rounded-lg flex items-center justify-center shrink-0 border transition-colors duration-75 cursor-pointer ${
                  isSelected
                    ? "bg-cyan-600 border-cyan-500 text-white"
                    : "bg-[#141B2D] border-[#1E293B] text-slate-400 hover:text-white hover:border-slate-600"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {isSelected ? "check" : "add"}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    );
  }
);
ComboSelectorList.displayName = "ComboSelectorList";
