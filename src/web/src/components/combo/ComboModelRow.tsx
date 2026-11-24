import React from "react";
import { CapacityBadges } from "../CapacityBadges.js";
import { getCapabilitiesForModel } from "../../../../core/capabilities/index.js";

export interface ComboModelRowProps {
  model: string;
  index: number;
  total: number;
  onMoveToTop: (index: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onMoveToBottom: (index: number) => void;
  onRemove: (index: number) => void;
}

export const ComboModelRow: React.FC<ComboModelRowProps> = React.memo(({
  model,
  index,
  total,
  onMoveToTop,
  onMoveUp,
  onMoveDown,
  onMoveToBottom,
  onRemove,
}) => {
  // Extract provider prefix if present
  let provider = "";
  let modelName = model;
  if (model.includes("/")) {
    const slashIdx = model.indexOf("/");
    provider = model.slice(0, slashIdx);
    modelName = model.slice(slashIdx + 1);
  }

  const caps = getCapabilitiesForModel(provider || null, modelName);

  const isFirst = index === 0;
  const isLast = index === total - 1;

  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-[#1E293B] bg-[#0A0D14] hover:border-slate-700 hover:bg-[#0F1420] transition-colors group">
      {/* Left: Priority Rank, Provider Badge, Model Name & Capabilities */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span
          className={`size-6 rounded-lg text-[10px] font-mono font-bold flex items-center justify-center shrink-0 border ${
            index === 0
              ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
              : index === 1
              ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/25"
              : "bg-[#141B2D] text-slate-400 border-[#1E293B]"
          }`}
          title={`Priority #${index + 1}`}
        >
          {index + 1}
        </span>

        {provider && (
          <span className="px-2 py-0.5 rounded-md bg-[#161F30] border border-[#26354D] text-[11px] text-cyan-400 font-mono font-medium shrink-0 max-w-[140px] sm:max-w-none truncate">
            {provider}
          </span>
        )}

        <span className="text-xs text-white font-mono font-semibold truncate flex-1 min-w-0">
          {modelName}
        </span>

        {caps && (
          <div className="shrink-0 hidden sm:block">
            <CapacityBadges caps={caps} size="xs" />
          </div>
        )}
      </div>

      {/* Right: Quick Action Buttons (Move to Top, Move Up, Move Down, Move to Bottom, Remove) */}
      <div className="flex items-center gap-1 text-slate-400 shrink-0">
        <button
          type="button"
          disabled={isFirst}
          onClick={() => onMoveToTop(index)}
          title="Move to top priority (#1)"
          className="p-1 rounded-md transition-colors hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:pointer-events-none cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">vertical_align_top</span>
        </button>

        <button
          type="button"
          disabled={isFirst}
          onClick={() => onMoveUp(index)}
          title="Move up"
          className="p-1 rounded-md transition-colors hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:pointer-events-none cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
        </button>

        <button
          type="button"
          disabled={isLast}
          onClick={() => onMoveDown(index)}
          title="Move down"
          className="p-1 rounded-md transition-colors hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:pointer-events-none cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
        </button>

        <button
          type="button"
          disabled={isLast}
          onClick={() => onMoveToBottom(index)}
          title="Move to lowest priority"
          className="p-1 rounded-md transition-colors hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:pointer-events-none cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">vertical_align_bottom</span>
        </button>

        <div className="h-4 w-px bg-[#1E293B] mx-0.5" />

        <button
          type="button"
          onClick={() => onRemove(index)}
          title="Remove model from combo"
          className="p-1 rounded-md transition-colors hover:bg-rose-500/20 hover:text-rose-400 text-slate-500 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>
    </div>
  );
});
ComboModelRow.displayName = "ComboModelRow";
