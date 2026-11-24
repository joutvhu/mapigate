import React from "react";
import type { FreeTierGroup } from "../../utils/freeTierGrouping.js";

export interface BatchCombosPreviewPanelProps {
  activeGroups: FreeTierGroup[];
  selectedSet: Set<string>;
  groupComboNames: Record<string, string>;
  onGroupComboNameChange: (groupId: string, name: string) => void;
  onRemoveModel: (comboModelValue: string) => void;
  onClearAll: () => void;
  className?: string;
}

export const BatchCombosPreviewPanel: React.FC<BatchCombosPreviewPanelProps> = React.memo(
  ({
    activeGroups,
    selectedSet,
    groupComboNames,
    onGroupComboNameChange,
    onRemoveModel,
    onClearAll,
    className = "",
  }) => {
    return (
      <div
        className={`flex flex-col min-h-0 p-3.5 space-y-2.5 bg-[#0A0D14]/45 overflow-hidden ${className}`}
      >
        <div className="flex items-center justify-between pb-2 border-b border-[#1E293B] shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-emerald-400 text-[18px]">
              dynamic_feed
            </span>
            <span className="text-xs font-bold text-white">
              Batch Combos ({activeGroups.length})
            </span>
          </div>
          {selectedSet.size > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-[11px] text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
            >
              Clear all
            </button>
          )}
        </div>

        <p className="text-[11px] text-slate-400 leading-snug shrink-0">
          Each active group generates a separate combo. Edit combo names inline before creating.
        </p>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
          {activeGroups.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs border border-dashed border-[#1E293B] rounded-2xl p-4">
              Select models from any group on the left to preview batch combos here.
            </div>
          ) : (
            activeGroups.map((grp) => {
              const members = grp.candidates
                .map((c) => c.model.comboModelValue)
                .filter((val) => selectedSet.has(val));
              return (
                <div
                  key={grp.id}
                  className="p-2.5 rounded-xl border border-[#1E293B] bg-[#0A0D14] space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={groupComboNames[grp.id] ?? grp.defaultComboName}
                      onChange={(e) => onGroupComboNameChange(grp.id, e.target.value)}
                      placeholder={grp.defaultComboName}
                      className="flex-1 min-w-0 bg-[#141B2D] border border-[#1E293B] focus:border-emerald-500 rounded-lg px-2 py-1 text-xs font-mono text-emerald-300 focus:outline-none"
                    />
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                      {members.length} model{members.length > 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {members.map((val) => (
                      <span
                        key={val}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#141B2D] border border-[#1E293B] text-[10.5px] font-mono text-slate-300 max-w-full"
                      >
                        <span className="truncate">{val}</span>
                        <button
                          type="button"
                          onClick={() => onRemoveModel(val)}
                          className="text-slate-500 hover:text-rose-400 cursor-pointer shrink-0"
                          title="Remove"
                        >
                          <span className="material-symbols-outlined text-[12px]">close</span>
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }
);
BatchCombosPreviewPanel.displayName = "BatchCombosPreviewPanel";
