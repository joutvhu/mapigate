import React, { useCallback } from "react";
import { VirtualModelList } from "./VirtualModelList.js";
import { ModelOptionRow } from "./ModelOptionRow.js";
import { MobileProviderSelect } from "./ProviderSidebar.js";
import { ComboSelectorList } from "./ComboSelectorList.js";
import type { ComboSummary, ModelOption, ProviderSidebarItem } from "./types.js";

const MODEL_ROW_HEIGHT = 64;

export interface CatalogPaneProps {
  visibleModels: ModelOption[];
  totalMatchingCount: number;
  sidebarProviders: ProviderSidebarItem[];
  selectedProvider: string;
  onSelectProvider: (providerId: string) => void;
  activeScopeLabel: string;
  allowCombos: boolean;
  filteredCombos: ComboSummary[];
  selectedCombosCount: number;
  selectedSet: Set<string>;
  selectedModel?: string;
  selectedInViewCount: number;
  multiSelect: boolean;
  connectedOnly: boolean;
  hasConnectedAccounts: boolean;
  onShowAllRegistry: () => void;
  scrollKey: string;
  onToggleModel: (item: ModelOption) => void;
  onToggleCombo: (combo: ComboSummary) => void;
  onAddAllVisible: () => void;
  onDeselectVisible: () => void;
  customModelInput: string;
  onCustomModelInputChange: (val: string) => void;
  onAddCustomModel: (e: React.FormEvent) => void;
  className?: string;
}

export const CatalogPane: React.FC<CatalogPaneProps> = ({
  visibleModels,
  totalMatchingCount,
  sidebarProviders,
  selectedProvider,
  onSelectProvider,
  activeScopeLabel,
  allowCombos,
  filteredCombos,
  selectedCombosCount,
  selectedSet,
  selectedModel,
  selectedInViewCount,
  multiSelect,
  connectedOnly,
  hasConnectedAccounts,
  onShowAllRegistry,
  scrollKey,
  onToggleModel,
  onToggleCombo,
  onAddAllVisible,
  onDeselectVisible,
  customModelInput,
  onCustomModelInputChange,
  onAddCustomModel,
  className = "",
}) => {
  const renderModelRow = useCallback(
    (item: ModelOption) => (
      <ModelOptionRow
        item={item}
        isSelected={selectedSet.has(item.value) || selectedModel === item.value}
        showProviderBadge={selectedProvider === "all"}
        onToggle={onToggleModel}
      />
    ),
    [selectedSet, selectedModel, selectedProvider, onToggleModel]
  );

  const getModelKey = useCallback((item: ModelOption) => item.value, []);

  return (
    <div className={`lg:col-span-5 flex-col min-h-0 p-3.5 space-y-2.5 overflow-hidden ${className}`}>
      <MobileProviderSelect
        providers={sidebarProviders}
        selectedProvider={selectedProvider}
        onSelectProvider={onSelectProvider}
        totalModelCount={totalMatchingCount}
        allowCombos={allowCombos}
        combosCount={filteredCombos.length}
        selectedCombosCount={selectedCombosCount}
      />

      {/* Catalog Scope Header */}
      <div className="flex items-center justify-between gap-2 px-0.5 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-white truncate">{activeScopeLabel}</span>
          <span className="text-[11px] font-mono text-slate-400 shrink-0">
            {selectedProvider === "combo"
              ? `${filteredCombos.length} combo${filteredCombos.length !== 1 ? "s" : ""}`
              : `${visibleModels.length} model${visibleModels.length !== 1 ? "s" : ""}`}
          </span>
        </div>

        {selectedProvider !== "combo" && multiSelect && (
          <div className="flex items-center gap-2 shrink-0">
            {selectedInViewCount > 0 && (
              <button
                type="button"
                onClick={onDeselectVisible}
                className="text-[11px] text-slate-400 hover:text-rose-400 cursor-pointer transition-colors"
              >
                Deselect ({selectedInViewCount})
              </button>
            )}
            {visibleModels.length > 0 &&
              visibleModels.length <= 50 &&
              selectedInViewCount < visibleModels.length && (
                <button
                  type="button"
                  onClick={onAddAllVisible}
                  className="text-[11px] text-blue-400 hover:text-blue-300 font-medium cursor-pointer transition-colors"
                >
                  + Add all ({visibleModels.length})
                </button>
              )}
          </div>
        )}
      </div>

      {/* Compact Matching Combos Strip when viewing All Providers */}
      {selectedProvider === "all" && filteredCombos.length > 0 && (
        <div className="p-2 rounded-xl border border-cyan-500/20 bg-cyan-950/15 space-y-1.5 shrink-0">
          <div className="flex items-center justify-between text-[11px] text-cyan-400 font-semibold">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">layers</span>
              Smart Combos ({filteredCombos.length})
            </span>
            <button
              type="button"
              onClick={() => onSelectProvider("combo")}
              className="text-[10.5px] text-cyan-300 hover:underline cursor-pointer"
            >
              View details
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-[64px] overflow-y-auto pr-1">
            {filteredCombos.map((combo) => {
              const isSelected = selectedSet.has(combo.name);
              return (
                <button
                  key={combo.id}
                  type="button"
                  onClick={() => onToggleCombo(combo)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono font-medium border transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-cyan-600 text-white border-cyan-500"
                      : "bg-[#0A0D14] text-slate-300 border-[#1E293B] hover:border-cyan-500/40 hover:text-white"
                  }`}
                >
                  {isSelected && (
                    <span className="material-symbols-outlined text-[12px] text-cyan-200">
                      check
                    </span>
                  )}
                  <span>{combo.name}</span>
                  <span className="text-[10px] opacity-60">({combo.models.length})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main List Area */}
      {selectedProvider === "combo" ? (
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          <ComboSelectorList
            combos={filteredCombos}
            selectedSet={selectedSet}
            onToggleCombo={onToggleCombo}
          />
        </div>
      ) : visibleModels.length === 0 ? (
        <div className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center">
          <div className="py-10 text-center text-slate-500 text-xs space-y-2.5 px-4">
            <span className="material-symbols-outlined text-[28px] text-slate-600 block mx-auto">
              search_off
            </span>
            <p className="max-w-xs mx-auto leading-relaxed">
              {connectedOnly && !hasConnectedAccounts
                ? "No accounts connected yet. Models are currently hidden by 'Connected Only'."
                : selectedProvider !== "all" && totalMatchingCount > 0
                ? `No matching models in ${activeScopeLabel}.`
                : connectedOnly
                ? "No models found from connected accounts matching your search/filters."
                : "No models matched your filter. Try clearing filters or enter a custom model below."}
            </p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {selectedProvider !== "all" && totalMatchingCount > 0 && (
                <button
                  type="button"
                  onClick={() => onSelectProvider("all")}
                  className="px-3 py-1 rounded-lg bg-blue-600/15 border border-blue-500/35 text-blue-300 hover:bg-blue-600/25 text-xs font-medium cursor-pointer transition-colors"
                >
                  Search All Providers ({totalMatchingCount})
                </button>
              )}
              {connectedOnly && (
                <button
                  type="button"
                  onClick={onShowAllRegistry}
                  className="px-3 py-1 rounded-lg bg-emerald-600/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-600/20 text-xs font-medium cursor-pointer transition-colors"
                >
                  Show All Registry Models
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <VirtualModelList
          items={visibleModels}
          itemHeight={MODEL_ROW_HEIGHT}
          scrollKey={scrollKey}
          getKey={getModelKey}
          renderItem={renderModelRow}
          className="flex-1 min-h-0 pr-1"
        />
      )}

      {/* Custom Model Input */}
      <form
        onSubmit={onAddCustomModel}
        className="flex gap-2 pt-2 border-t border-[#1E293B] shrink-0"
      >
        <input
          type="text"
          placeholder="Or enter custom model ID (e.g. provider/model)..."
          value={customModelInput}
          onChange={(e) => onCustomModelInputChange(e.target.value)}
          className="flex-1 bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-1.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={!customModelInput.trim()}
          className="px-3 py-1.5 rounded-xl bg-[#141B2D] border border-[#1E293B] hover:border-blue-500/50 hover:bg-blue-600/10 text-xs text-slate-300 hover:text-white disabled:opacity-40 cursor-pointer shrink-0"
        >
          Add Custom
        </button>
      </form>
    </div>
  );
};
