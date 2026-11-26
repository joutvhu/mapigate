import React, { useMemo, useState } from "react";
import { AddMappingForm } from "./AddMappingForm.js";
import { MappingRow } from "./MappingRow.js";
import type { SaveMappingOptions, ToolMappingItem } from "./types.js";

export interface UniversalMappingsSectionProps {
  mappings: ToolMappingItem[];
  loading: boolean;
  comboNames: Set<string>;
  exposureMode: "all" | "connected" | "mapped_only";
  onUpdateExposureMode: (mode: "all" | "connected" | "mapped_only") => void;
  onResetDefaults: () => void;
  onImportCombos: () => void;
  onOpenSimulate: () => void;
  onSaveMapping: (
    sourceModel: string,
    targetModel: string,
    options?: SaveMappingOptions
  ) => Promise<void> | void;
  onDeleteMapping: (sourceModel: string) => void;
  onToggleMapping: (sourceModel: string, isEnabled: boolean) => void;
  copiedCmd: string | null;
  onCopyText: (text: string) => void;
}

export const UniversalMappingsSection: React.FC<UniversalMappingsSectionProps> = ({
  mappings,
  loading,
  comboNames,
  exposureMode,
  onUpdateExposureMode,
  onResetDefaults,
  onImportCombos,
  onOpenSimulate,
  onSaveMapping,
  onDeleteMapping,
  onToggleMapping,
  copiedCmd,
  onCopyText,
}) => {
  const [mappingSearch, setMappingSearch] = useState("");
  const [sortBy, setSortBy] = useState<"source" | "target">("source");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [editingSourceModel, setEditingSourceModel] = useState<string | null>(null);
  const [editingTargetInput, setEditingTargetInput] = useState("");
  const [isAddingMapping, setIsAddingMapping] = useState(false);

  const toggleSort = (col: "source" | "target") => {
    if (sortBy === col) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortOrder("asc");
    }
  };

  const filteredMappings = useMemo(() => {
    const q = mappingSearch.trim().toLowerCase();
    const list = mappings.filter((m) => {
      if (!q) return true;
      const effortStr = Object.entries(m.effortTargets || {})
        .map(([k, v]) => `${k} ${v}`)
        .join(" ")
        .toLowerCase();
      return (
        m.sourceModel.toLowerCase().includes(q) ||
        (m.targetModel || "").toLowerCase().includes(q) ||
        effortStr.includes(q)
      );
    });

    return [...list].sort((a, b) => {
      let comp = 0;
      if (sortBy === "source") {
        comp = a.sourceModel.localeCompare(b.sourceModel, undefined, { numeric: true, sensitivity: "base" });
      } else {
        const tA = (a.targetModel || "").trim();
        const tB = (b.targetModel || "").trim();
        if (!tA && tB) comp = 1;
        else if (tA && !tB) comp = -1;
        else comp = tA.localeCompare(tB, undefined, { numeric: true, sensitivity: "base" });
      }
      return sortOrder === "asc" ? comp : -comp;
    });
  }, [mappings, mappingSearch, sortBy, sortOrder]);

  const handleInlineSave = async (m: ToolMappingItem, targetModel: string) => {
    const trimmed = targetModel.trim();
    const hasEffortTargets = Boolean(
      m.effortTargets && Object.values(m.effortTargets).some((v) => v && v.trim().length > 0)
    );
    if (!trimmed && !hasEffortTargets) {
      return;
    }
    await onSaveMapping(m.sourceModel, trimmed);
    setEditingSourceModel(null);
    setEditingTargetInput("");
  };

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="p-4 rounded-2xl bg-[#0F1420]/80 border border-[#1E293B] flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-400 text-[20px]">alt_route</span>
            Universal Model Mappings
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">
            Translate client aliases to target models or combos. Click{" "}
            <strong className="text-violet-300">+ Effort</strong> on any row to attach optional per-effort targets.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Exposure Mode Control */}
          <div className="flex items-center gap-1 bg-[#080B11] border border-[#1E293B] p-1 rounded-xl text-xs">
            <span className="text-[11px] text-slate-400 px-2 flex items-center gap-1 font-medium">
              <span className="material-symbols-outlined text-[14px] text-slate-500">visibility</span>
              /v1/models:
            </span>
            {(["all", "connected", "mapped_only"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onUpdateExposureMode(mode)}
                className={`px-2 py-1 rounded-lg text-[11px] transition-all cursor-pointer ${
                  exposureMode === mode
                    ? "bg-blue-600 text-white font-semibold shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {mode === "all" ? "All" : mode === "connected" ? "Connected" : "Mappings Only"}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onResetDefaults}
            className="px-3 py-1.5 text-xs font-medium rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-[#1E293B] hover:border-slate-600 text-slate-200 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px] text-slate-400">restart_alt</span>
            Reset
          </button>

          <button
            type="button"
            onClick={onImportCombos}
            className="px-3 py-1.5 text-xs font-medium rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-[#1E293B] hover:border-slate-600 text-slate-200 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] text-cyan-400">sync_alt</span>
            Sync Combos
          </button>

          <button
            type="button"
            onClick={onOpenSimulate}
            className="px-3 py-1.5 text-xs font-medium rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-[#1E293B] hover:border-slate-600 text-slate-200 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] text-emerald-400">play_circle</span>
            Test Route
          </button>

          <button
            type="button"
            onClick={() => setIsAddingMapping((prev) => !prev)}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-600/30 text-white flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">
              {isAddingMapping ? "close" : "add_circle"}
            </span>
            {isAddingMapping ? "Cancel" : "Add Mapping"}
          </button>
        </div>
      </div>

      {/* Add Mapping Form */}
      {isAddingMapping && (
        <AddMappingForm
          onSubmit={async (s, t, opts) => {
            await onSaveMapping(s, t, opts);
            setIsAddingMapping(false);
          }}
          onCancel={() => setIsAddingMapping(false)}
        />
      )}

      {/* Search Bar */}
      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[18px]">
          search
        </span>
        <input
          type="text"
          value={mappingSearch}
          onChange={(e) => setMappingSearch(e.target.value)}
          placeholder="Search model alias, destination, or effort rule..."
          className="w-full bg-[#0F1420]/80 border border-[#1E293B] focus:border-blue-500 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 focus:outline-none"
        />
      </div>

      {/* Mappings Table */}
      <div className="rounded-2xl border border-[#1E293B] overflow-hidden bg-[#0F1420]/80">
        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[18px] animate-spin text-blue-400">
              progress_activity
            </span>
            Loading model mappings...
          </div>
        ) : filteredMappings.length === 0 ? (
          <div className="py-14 text-center text-xs text-slate-400 space-y-2">
            <span className="material-symbols-outlined text-3xl text-slate-600 block">alt_route</span>
            <p className="font-semibold text-slate-300">
              {mappingSearch ? `No mappings match "${mappingSearch}"` : "No model mappings configured yet"}
            </p>
            <p className="text-slate-500 max-w-md mx-auto text-[11.5px] leading-relaxed">
              Click <strong className="text-slate-300">&ldquo;Sync Aliases&rdquo;</strong> on a tool card or click{" "}
              <strong className="text-blue-400">&ldquo;+ Add Mapping&rdquo;</strong> above.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#1E293B] bg-[#0A0D14] text-slate-400 font-semibold">
                  <th className="p-3 pl-4 w-14 text-center" title="Expose in /v1/models">API</th>
                  <th
                    onClick={() => toggleSort("source")}
                    className="p-3 cursor-pointer hover:text-white select-none transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Source Model (Client Sends)</span>
                      <span className="material-symbols-outlined text-[14px] text-blue-400">
                        {sortBy === "source" ? (sortOrder === "asc" ? "arrow_upward" : "arrow_downward") : "unfold_more"}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => toggleSort("target")}
                    className="p-3 cursor-pointer hover:text-white select-none transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Target Destination</span>
                      <span className="material-symbols-outlined text-[14px] text-blue-400">
                        {sortBy === "target" ? (sortOrder === "asc" ? "arrow_upward" : "arrow_downward") : "unfold_more"}
                      </span>
                    </div>
                  </th>
                  <th className="p-3 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B]">
                {filteredMappings.map((m) => {
                  const isCombo = Boolean(
                    m.targetModel &&
                      (m.targetModel.startsWith("combo/") || comboNames.has(m.targetModel.toLowerCase()))
                  );
                  return (
                    <MappingRow
                      key={m.sourceModel}
                      mapping={m}
                      isCombo={isCombo}
                      isEditing={editingSourceModel === m.sourceModel}
                      editingTargetInput={editingTargetInput}
                      copiedCmd={copiedCmd}
                      onToggleMapping={onToggleMapping}
                      onCopyText={onCopyText}
                      onStartEdit={(item) => {
                        setEditingSourceModel(item.sourceModel);
                        setEditingTargetInput(item.targetModel || "");
                      }}
                      onChangeEditInput={setEditingTargetInput}
                      onSaveEdit={handleInlineSave}
                      onCancelEdit={() => {
                        setEditingSourceModel(null);
                        setEditingTargetInput("");
                      }}
                      onSaveOptions={onSaveMapping}
                      onDeleteMapping={onDeleteMapping}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
