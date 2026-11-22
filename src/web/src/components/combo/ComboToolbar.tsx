import React from "react";
import { ModelAutocompleteInput } from "../ModelAutocompleteInput.js";

export interface ComboToolbarProps {
  totalModels: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  providersList: string[];
  providerFilter: string;
  onProviderFilterChange: (provider: string) => void;
  onRemoveProviderRequest: (provider: string) => void;
  onBrowseCatalog: () => void;
  newModelInput: string;
  onNewModelInputChange: (value: string) => void;
  onQuickAdd: () => void;
  existingModels: string[];
}

export const ComboToolbar: React.FC<ComboToolbarProps> = ({
  totalModels,
  searchQuery,
  onSearchChange,
  providersList,
  providerFilter,
  onProviderFilterChange,
  onRemoveProviderRequest,
  onBrowseCatalog,
  newModelInput,
  onNewModelInputChange,
  onQuickAdd,
  existingModels,
}) => {
  return (
    <div className="space-y-4">
      {/* Search, Provider Filter & Browse Catalog */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1 max-w-sm">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-slate-500">
              search
            </span>
            <input
              type="text"
              placeholder={`Search among ${totalModels} models...`}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl pl-9 pr-8 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}
          </div>

          {/* Provider Filter Dropdown */}
          {providersList.length > 1 && (
            <select
              value={providerFilter}
              onChange={(e) => onProviderFilterChange(e.target.value)}
              className="bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500/50 cursor-pointer"
            >
              <option value="all">All Providers ({providersList.length})</option>
              {providersList.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}

          {/* Bulk remove button when filtered to a single provider */}
          {providerFilter !== "all" && (
            <button
              type="button"
              onClick={() => onRemoveProviderRequest(providerFilter)}
              className="px-2.5 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 text-xs font-semibold flex items-center gap-1 cursor-pointer"
              title={`Remove all models from ${providerFilter}`}
            >
              <span className="material-symbols-outlined text-[14px]">delete_sweep</span>
              <span>Remove &ldquo;{providerFilter}&rdquo;</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onBrowseCatalog}
          className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white flex items-center gap-1.5 shadow-lg shadow-blue-600/20 cursor-pointer shrink-0"
        >
          <span className="material-symbols-outlined text-[16px]">add_circle</span>
          <span>Browse Catalog</span>
        </button>
      </div>

      {/* Quick Add Model Bar */}
      <div className="flex items-center gap-2 pt-1 border-t border-[#1E293B]/60">
        <div className="flex-1 min-w-0">
          <ModelAutocompleteInput
            value={newModelInput}
            onChange={onNewModelInputChange}
            onEnter={onQuickAdd}
            placeholder="Quick add model (e.g. anthropic/claude-3-7-sonnet or devin/gpt-5-low)..."
            excludeValues={existingModels}
            allowCombos={false}
          />
        </div>
        <button
          type="button"
          disabled={!newModelInput.trim()}
          onClick={onQuickAdd}
          className="px-4 py-2 rounded-xl bg-[#1E293B] hover:bg-blue-600 text-xs font-semibold text-white transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer shrink-0"
        >
          Add
        </button>
      </div>
    </div>
  );
};
