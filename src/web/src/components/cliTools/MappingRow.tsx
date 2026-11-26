import React, { useState, useEffect } from "react";
import { ModelAutocompleteInput } from "../ModelAutocompleteInput.js";
import { EffortRulesEditor, type EffortRuleRow } from "./EffortRulesEditor.js";
import type { SaveMappingOptions, ToolMappingItem } from "./types.js";

export interface MappingRowProps {
  mapping: ToolMappingItem;
  isCombo: boolean;
  isEditing: boolean;
  editingTargetInput: string;
  copiedCmd: string | null;
  onToggleMapping: (sourceModel: string, isEnabled: boolean) => void;
  onCopyText: (text: string) => void;
  onStartEdit: (mapping: ToolMappingItem) => void;
  onChangeEditInput: (val: string) => void;
  onSaveEdit: (mapping: ToolMappingItem, targetModel: string) => void;
  onCancelEdit: () => void;
  onSaveOptions: (
    sourceModel: string,
    targetModel: string,
    options: SaveMappingOptions
  ) => Promise<void> | void;
  onDeleteMapping: (sourceModel: string) => void;
}

export const MappingRow: React.FC<MappingRowProps> = ({
  mapping: m,
  isCombo,
  isEditing,
  editingTargetInput,
  copiedCmd,
  onToggleMapping,
  onCopyText,
  onStartEdit,
  onChangeEditInput,
  onSaveEdit,
  onCancelEdit,
  onSaveOptions,
  onDeleteMapping,
}) => {
  const [effortPanelOpen, setEffortPanelOpen] = useState(false);
  const [effortRows, setEffortRows] = useState<EffortRuleRow[]>([]);
  const [savingEfforts, setSavingEfforts] = useState(false);

  const isEnabled = m.isEnabled !== false;
  const effortEntries = Object.entries(m.effortTargets || {});

  useEffect(() => {
    if (effortPanelOpen) {
      setEffortRows(
        Object.entries(m.effortTargets || {}).map(([effort, target]) => ({ effort, target }))
      );
    }
  }, [effortPanelOpen, m.effortTargets]);

  const handleSaveEfforts = async () => {
    const nextTargets: Record<string, string> = {};
    for (const row of effortRows) {
      const k = row.effort.trim().toLowerCase();
      const v = row.target.trim();
      if (k && v) nextTargets[k] = v;
    }
    if (!m.targetModel?.trim() && Object.keys(nextTargets).length === 0) {
      return;
    }
    setSavingEfforts(true);
    try {
      await onSaveOptions(m.sourceModel, m.targetModel || "", {
        effortTargets: Object.keys(nextTargets).length > 0 ? nextTargets : null,
      });
      setEffortPanelOpen(false);
    } finally {
      setSavingEfforts(false);
    }
  };

  return (
    <>
      <tr
        className={`transition-colors ${
          isEditing
            ? "bg-blue-500/10"
            : isEnabled
            ? "hover:bg-white/5"
            : "opacity-50 hover:bg-white/5"
        }`}
      >
        {/* API visibility toggle switch */}
        <td className="p-3 pl-4 w-14 text-center">
          <button
            type="button"
            role="switch"
            aria-checked={isEnabled}
            onClick={() => onToggleMapping(m.sourceModel, !isEnabled)}
            title={
              isEnabled
                ? isCombo
                  ? "Mapping exposed in /v1/models (click to disable mapping; active combos remain listed separately)"
                  : "Exposed in /v1/models (click to hide)"
                : "Hidden from /v1/models (click to enable)"
            }
            className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors cursor-pointer ${
              isEnabled ? "bg-blue-600" : "bg-slate-700"
            }`}
          >
            <span
              className={`inline-block size-3 transform rounded-full bg-white transition-transform ${
                isEnabled ? "translate-x-3.5" : "translate-x-0.5"
              }`}
            />
          </button>
        </td>

        {/* Source model */}
        <td className="p-3 font-mono text-slate-200">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-100 font-medium">
              {m.sourceModel}
            </span>
            <button
              type="button"
              onClick={() => onCopyText(m.sourceModel)}
              className="text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
              title="Copy source model"
            >
              <span className="material-symbols-outlined text-[13px]">
                {copiedCmd === m.sourceModel ? "done" : "content_copy"}
              </span>
            </button>
          </div>
        </td>

        {/* Target + optional per-effort rules */}
        <td className="p-3">
          {isEditing ? (
            <div className="flex items-center gap-2 w-full max-w-md">
              <span className="text-blue-400 font-mono">→</span>
              <ModelAutocompleteInput
                value={editingTargetInput}
                onChange={onChangeEditInput}
                onEnter={() => onSaveEdit(m, editingTargetInput)}
                placeholder="Search model or combo..."
                className="bg-[#080B11] border border-blue-500/60 focus:border-blue-400 rounded-xl px-3 py-1.5 text-xs text-white font-mono w-full focus:outline-none"
                autoFocus
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {m.targetModel ? (
                <div className="inline-flex items-center gap-2 flex-wrap">
                  <span className="text-slate-500 font-mono">→</span>
                  {isCombo && (
                    <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 border border-cyan-500/40 text-[9.5px] font-mono text-cyan-300 font-semibold tracking-wide">
                      COMBO
                    </span>
                  )}
                  <span className="text-emerald-300 font-mono font-medium text-xs">
                    {m.targetModel}
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onStartEdit(m)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/10 text-amber-300 hover:border-amber-400 text-xs font-medium transition-colors cursor-pointer w-fit"
                >
                  <span className="material-symbols-outlined text-[14px]">add</span>
                  Click to select target model or combo
                </button>
              )}

              {effortEntries.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pl-4">
                  {effortEntries.map(([eff, target]) => (
                    <button
                      key={eff}
                      type="button"
                      onClick={() => setEffortPanelOpen((prev) => !prev)}
                      title={`${eff} → ${target} (click to edit)`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-500/12 border border-violet-500/30 hover:border-violet-400/60 text-[10.5px] font-mono cursor-pointer"
                    >
                      <span className="text-violet-300 font-semibold">{eff}</span>
                      <span className="text-slate-500">→</span>
                      <span className="text-slate-200 max-w-[180px] truncate">{target}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </td>

        {/* Actions */}
        <td className="p-3 pr-4 text-right whitespace-nowrap">
          <div className="inline-flex items-center gap-1">
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={() => onSaveEdit(m, editingTargetInput)}
                  className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-sans text-xs font-semibold cursor-pointer"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-sans text-xs cursor-pointer"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setEffortPanelOpen((prev) => !prev)}
                  className={`px-2 py-1 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 transition-colors cursor-pointer ${
                    effortPanelOpen
                      ? "bg-violet-600/25 border-violet-500/50 text-violet-200"
                      : "bg-[#0A0D14] border-[#1E293B] text-slate-300 hover:text-violet-300 hover:border-violet-500/40"
                  }`}
                  title={`Add or edit effort mapping for ${m.sourceModel}`}
                >
                  <span className="material-symbols-outlined text-[13px] text-violet-400">bolt</span>
                  + Effort
                </button>
                <button
                  type="button"
                  onClick={() => onStartEdit(m)}
                  className="p-1 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors cursor-pointer"
                  title="Edit default target"
                >
                  <span className="material-symbols-outlined text-[16px]">edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteMapping(m.sourceModel)}
                  className="p-1 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                  title="Delete mapping"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </>
            )}
          </div>
        </td>
      </tr>

      {/* Inline expandable per-effort mapping editor for this model */}
      {effortPanelOpen && (
        <tr className="bg-[#0B101D]">
          <td colSpan={4} className="px-6 py-3 border-b border-[#1E293B]">
            <EffortRulesEditor
              modelLabel={m.sourceModel}
              defaultTarget={m.targetModel || ""}
              effortRows={effortRows}
              onChange={setEffortRows}
              footer={
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEffortPanelOpen(false)}
                    className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={
                      savingEfforts ||
                      (!m.targetModel?.trim() && effortRows.every((r) => !r.target.trim()))
                    }
                    onClick={handleSaveEfforts}
                    className="px-3 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
                  >
                    {savingEfforts ? "Saving..." : "Save Efforts"}
                  </button>
                </div>
              }
            />
          </td>
        </tr>
      )}
    </>
  );
};
