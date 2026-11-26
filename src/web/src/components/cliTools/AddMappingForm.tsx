import React, { useState } from "react";
import { ModelAutocompleteInput } from "../ModelAutocompleteInput.js";
import { EffortRulesEditor, type EffortRuleRow } from "./EffortRulesEditor.js";
import type { SaveMappingOptions } from "./types.js";

export interface AddMappingFormProps {
  onSubmit: (
    sourceModel: string,
    targetModel: string,
    options?: SaveMappingOptions
  ) => Promise<void> | void;
  onCancel: () => void;
}

export const AddMappingForm: React.FC<AddMappingFormProps> = ({ onSubmit, onCancel }) => {
  const [sourceModel, setSourceModel] = useState("");
  const [targetModel, setTargetModel] = useState("");
  const [showEfforts, setShowEfforts] = useState(false);
  const [effortRows, setEffortRows] = useState<EffortRuleRow[]>([]);
  const [saving, setSaving] = useState(false);

  const hasAnyTarget =
    targetModel.trim().length > 0 || effortRows.some((r) => r.target.trim().length > 0);

  const handleSave = async () => {
    if (!sourceModel.trim() || !hasAnyTarget) return;
    const effortTargets: Record<string, string> = {};
    for (const row of effortRows) {
      const k = row.effort.trim().toLowerCase();
      const v = row.target.trim();
      if (k && v) effortTargets[k] = v;
    }

    setSaving(true);
    try {
      await onSubmit(sourceModel.trim(), targetModel.trim(), {
        ...(Object.keys(effortTargets).length > 0 ? { effortTargets } : {}),
      });
      setSourceModel("");
      setTargetModel("");
      setEffortRows([]);
      setShowEfforts(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-[#0E1424] border border-blue-500/40 space-y-3.5 animate-rt-scale-in">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[17px]">add_circle</span>
          Add New Model Mapping
        </div>
        <button
          type="button"
          onClick={() => setShowEfforts((prev) => !prev)}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border flex items-center gap-1 transition-colors cursor-pointer ${
            showEfforts || effortRows.length > 0
              ? "bg-violet-500/15 border-violet-500/40 text-violet-300"
              : "bg-[#080B11] border-[#1E293B] text-slate-300 hover:border-violet-500/40 hover:text-violet-300"
          }`}
        >
          <span className="material-symbols-outlined text-[14px]">bolt</span>
          {showEfforts ? "Hide Effort Rules" : "+ Effort"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-400 block mb-1">Client Model (Source Alias):</label>
          <input
            type="text"
            value={sourceModel}
            onChange={(e) => setSourceModel(e.target.value)}
            placeholder="e.g. sol, gpt-6.2-sol, sonnet..."
            className="bg-[#080B11] border border-[#1E293B] focus:border-blue-400 rounded-xl px-3 py-2 text-xs text-white font-mono w-full focus:outline-none"
            autoFocus
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">
            Gateway Target{effortRows.length > 0 ? " (Default fallback)" : ""}:
          </label>
          <ModelAutocompleteInput
            value={targetModel}
            onChange={setTargetModel}
            placeholder="e.g. codex/gpt-6.2-sol or combo/..."
            className="bg-[#080B11] border border-[#1E293B] focus:border-blue-400 rounded-xl px-3 py-2 text-xs text-white font-mono w-full focus:outline-none"
            onEnter={handleSave}
          />
        </div>
      </div>

      {showEfforts && (
        <EffortRulesEditor
          modelLabel={sourceModel.trim() || "this model"}
          defaultTarget={targetModel.trim()}
          effortRows={effortRows}
          onChange={setEffortRows}
        />
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-3.5 py-1.5 text-xs rounded-xl bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !sourceModel.trim() || !hasAnyTarget}
          className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 cursor-pointer shadow-md shadow-blue-600/30"
        >
          {saving ? "Saving..." : "Save Mapping"}
        </button>
      </div>
    </div>
  );
};
