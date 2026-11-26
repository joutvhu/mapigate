import React, { useState } from "react";
import { ModelAutocompleteInput } from "../ModelAutocompleteInput.js";

const QUICK_EFFORTS = ["low", "medium", "high", "xhigh", "max", "ultra"];

export interface EffortRuleRow {
  effort: string;
  target: string;
}

export interface EffortRulesEditorProps {
  modelLabel?: string;
  defaultTarget?: string;
  effortRows: EffortRuleRow[];
  onChange: (rows: EffortRuleRow[]) => void;
  footer?: React.ReactNode;
}

export const EffortRulesEditor: React.FC<EffortRulesEditorProps> = ({
  modelLabel,
  defaultTarget = "",
  effortRows,
  onChange,
  footer,
}) => {
  const [customEffort, setCustomEffort] = useState("");
  const usedEfforts = new Set(effortRows.map((r) => r.effort.toLowerCase()));

  const addEffortRow = (eff: string) => {
    const clean = eff.trim().toLowerCase();
    if (!clean || usedEfforts.has(clean)) return;
    onChange([...effortRows, { effort: clean, target: defaultTarget }]);
  };

  return (
    <div className="p-3 rounded-xl bg-[#080B11] border border-violet-500/30 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-semibold text-violet-300 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[15px]">bolt</span>
          <span>
            Effort Mappings
            {modelLabel ? (
              <>
                {" "}
                for <code className="font-mono text-white">{modelLabel}</code>
              </>
            ) : null}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {QUICK_EFFORTS.map((eff) => (
            <button
              key={eff}
              type="button"
              disabled={usedEfforts.has(eff)}
              onClick={() => addEffortRow(eff)}
              className="px-2 py-0.5 rounded-md bg-[#0E1424] border border-[#1E293B] hover:border-violet-500/40 text-slate-300 hover:text-violet-300 disabled:opacity-30 font-mono text-[10.5px] cursor-pointer"
            >
              + {eff}
            </button>
          ))}
        </div>
      </div>

      {effortRows.length === 0 ? (
        <p className="text-[11px] text-slate-500">
          Pick an effort level above (e.g. <code className="text-slate-300">+ low</code>,{" "}
          <code className="text-slate-300">+ ultra</code>) or enter a custom one below.
        </p>
      ) : (
        <div className="space-y-2">
          {effortRows.map((row, idx) => (
            <div key={row.effort} className="flex items-center gap-2">
              <span className="px-2 py-1 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-300 font-mono text-[11px] font-semibold w-20 text-center shrink-0">
                {row.effort}
              </span>
              <span className="text-slate-500 font-mono">→</span>
              <div className="flex-1 min-w-0">
                <ModelAutocompleteInput
                  value={row.target}
                  onChange={(val) =>
                    onChange(effortRows.map((item, i) => (i === idx ? { ...item, target: val } : item)))
                  }
                  placeholder={`Target model for ${row.effort}...`}
                  className="bg-[#0E1424] border border-[#1E293B] focus:border-violet-400 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono w-full focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => onChange(effortRows.filter((_, i) => i !== idx))}
                className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"
                title="Remove effort rule"
              >
                <span className="material-symbols-outlined text-[15px]">close</span>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2 flex-1 min-w-[220px] max-w-sm">
          <input
            type="text"
            value={customEffort}
            onChange={(e) => setCustomEffort(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customEffort.trim()) {
                e.preventDefault();
                addEffortRow(customEffort);
                setCustomEffort("");
              }
            }}
            placeholder="Custom effort (e.g. minimal)..."
            className="flex-1 bg-[#0E1424] border border-[#1E293B] focus:border-violet-400 rounded-lg px-2.5 py-1 text-[11px] text-white font-mono focus:outline-none"
          />
          <button
            type="button"
            disabled={!customEffort.trim() || usedEfforts.has(customEffort.trim().toLowerCase())}
            onClick={() => {
              addEffortRow(customEffort);
              setCustomEffort("");
            }}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] disabled:opacity-40 cursor-pointer"
          >
            + Custom
          </button>
        </div>

        {footer}
      </div>
    </div>
  );
};
