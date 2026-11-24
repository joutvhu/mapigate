import React, { useState, useMemo, useEffect, useRef, useCallback, useDeferredValue } from "react";
import { PortalModal } from "./PortalModal.js";
import { matchesModelQuery } from "./ModelAutocompleteInput.js";
import type { ModelSelectModalProps } from "./modelSelect/types.js";
import {
  buildStableProviderSidebarItems,
  computeSelectedCountsByProvider,
  filterCatalogModels,
} from "./modelSelect/catalogUtils.js";
import { useModelCatalog } from "./modelSelect/useModelCatalog.js";
import { useModelSelection } from "./modelSelect/useModelSelection.js";
import { ProviderSidebar } from "./modelSelect/ProviderSidebar.js";
import { SelectedModelsPanel } from "./modelSelect/SelectedModelsPanel.js";
import { CatalogToolbar } from "./modelSelect/CatalogToolbar.js";
import { CatalogPane } from "./modelSelect/CatalogPane.js";

export type { ModelOption, ModelSelectModalProps } from "./modelSelect/types.js";

const EMPTY_ALIASES: Record<string, string> = {};
const EMPTY_ARRAY: string[] = [];

export const ModelSelectModal: React.FC<ModelSelectModalProps> = ({
  isOpen,
  onClose,
  title = "Select & Reorder Models",
  initialSelectedModels = EMPTY_ARRAY,
  onConfirm,
  multiSelect = true,
  filterModality = null,
  onSelect,
  onDeselect,
  selectedModel,
  modelAliases = EMPTY_ALIASES,
  kindFilter = null,
  capFilter = null,
  addedModelValues,
  closeOnSelect = false,
  excludeModelIds = EMPTY_ARRAY,
  allowCombos = true,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [activeModalityFilter, setActiveModalityFilter] = useState<string>(
    capFilter || filterModality || "all"
  );
  const [customModelInput, setCustomModelInput] = useState("");
  const [mobileTab, setMobileTab] = useState<"catalog" | "selected">("catalog");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    combos,
    connectedProviderIds,
    hasConnectedAccounts,
    connectedOnly,
    setConnectedOnly,
    catalog,
  } = useModelCatalog(isOpen, allowCombos, modelAliases);

  const excludeSet = useMemo(
    () => new Set((excludeModelIds || []).map((x) => x.toLowerCase())),
    [excludeModelIds]
  );

  const searchTokens = useMemo(
    () => deferredSearchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean),
    [deferredSearchQuery]
  );

  const filteredCombos = useMemo(() => {
    if (allowCombos === false) return [];
    if (activeModalityFilter !== "all" || kindFilter) return [];
    const q = deferredSearchQuery.trim().toLowerCase();
    const pool = combos.filter(
      (c) =>
        !excludeSet.has(c.id.toLowerCase()) &&
        !excludeSet.has(c.name.toLowerCase()) &&
        !excludeSet.has(`combo/${c.name}`.toLowerCase())
    );
    const sortedPool = [...pool].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
    if (!q) return sortedPool;
    return sortedPool.filter((c) => {
      const fullSearch = `${c.name} ${c.id} ${c.strategy || ""} ${c.models.join(" ")}`;
      return matchesModelQuery(fullSearch, q);
    });
  }, [combos, deferredSearchQuery, activeModalityFilter, kindFilter, allowCombos, excludeSet]);

  const filteredCatalog = useMemo(
    () =>
      filterCatalogModels({
        allModels: catalog.allModels,
        connectedProviderIds,
        hasConnectedAccounts,
        connectedOnly,
        kindFilter,
        activeModalityFilter,
        searchTokens,
        excludeSet,
        selectedProvider,
      }),
    [
      catalog.allModels,
      connectedProviderIds,
      hasConnectedAccounts,
      connectedOnly,
      kindFilter,
      activeModalityFilter,
      searchTokens,
      excludeSet,
      selectedProvider,
    ]
  );

  const {
    selectedModels,
    setSelectedModels,
    selectedSet,
    handleToggleModel,
    handleToggleCombo,
    handleAddAllVisible,
    handleDeselectVisible,
    handleRemoveModel,
    handleMoveUp,
    handleMoveDown,
    handleDragEnd,
    handleClearAll,
    addCustomModel,
  } = useModelSelection({
    multiSelect,
    closeOnSelect,
    onClose,
    onSelect,
    onDeselect,
    modelOptionMap: catalog.modelOptionMap,
    visibleModels: filteredCatalog.visibleModels,
  });

  useEffect(() => {
    if (isOpen) {
      const init = addedModelValues || initialSelectedModels || [];
      setSelectedModels([...init]);
      setSearchQuery("");
      setSelectedProvider("all");
      setActiveModalityFilter(capFilter || filterModality || "all");
      setCustomModelInput("");
      setMobileTab("catalog");

      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialSelectedModels, addedModelValues, filterModality, capFilter, setSelectedModels]);

  const selectedCountsByProvider = useMemo(
    () => computeSelectedCountsByProvider(selectedModels, catalog.modelProviderMap),
    [selectedModels, catalog.modelProviderMap]
  );

  const selectedCombosCount = useMemo(() => {
    if (allowCombos === false || combos.length === 0) return 0;
    let count = 0;
    for (const c of combos) {
      if (selectedSet.has(c.name)) count++;
    }
    return count;
  }, [allowCombos, combos, selectedSet]);

  const sidebarProviders = useMemo(
    () =>
      buildStableProviderSidebarItems(
        filteredCatalog.providerCounts,
        filteredCatalog.providerMetadata,
        connectedProviderIds,
        selectedCountsByProvider
      ),
    [
      filteredCatalog.providerCounts,
      filteredCatalog.providerMetadata,
      connectedProviderIds,
      selectedCountsByProvider,
    ]
  );

  useEffect(() => {
    if (
      selectedProvider !== "all" &&
      selectedProvider !== "combo" &&
      !filteredCatalog.providerCounts.has(selectedProvider) &&
      !deferredSearchQuery.trim()
    ) {
      setSelectedProvider("all");
    }
  }, [selectedProvider, filteredCatalog.providerCounts, deferredSearchQuery]);

  const activeScopeLabel = useMemo(() => {
    if (selectedProvider === "all") return "All Providers";
    if (selectedProvider === "combo") return "Smart Combos";
    const found = sidebarProviders.find((p) => p.providerId === selectedProvider);
    return found?.providerName || selectedProvider;
  }, [selectedProvider, sidebarProviders]);

  const selectedInViewCount = useMemo(() => {
    let count = 0;
    for (const m of filteredCatalog.visibleModels) {
      if (selectedSet.has(m.value)) count++;
    }
    return count;
  }, [filteredCatalog.visibleModels, selectedSet]);

  const handleToggleConnectedOnly = useCallback(() => setConnectedOnly((prev) => !prev), [setConnectedOnly]);
  const handleShowAllRegistry = useCallback(() => setConnectedOnly(false), [setConnectedOnly]);

  const handleAddCustomModel = (e: React.FormEvent) => {
    e.preventDefault();
    const val = customModelInput.trim();
    if (!val) return;
    addCustomModel(val);
    setCustomModelInput("");
  };

  const handleConfirm = () => {
    onConfirm?.(selectedModels);
    onClose();
  };

  const scrollKey = `${isOpen ? "1" : "0"}|${selectedProvider}|${deferredSearchQuery}|${activeModalityFilter}|${connectedOnly ? "1" : "0"}|${kindFilter || ""}`;

  return (
    <PortalModal isOpen={isOpen} onClose={onClose} maxWidthClass="w-full max-w-[78rem]" overflowHidden>
      <div className="flex flex-col h-[86vh] max-h-[800px] -m-2 sm:-m-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-[#1E293B] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">tune</span>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white truncate">{title}</h3>
              <p className="text-xs text-slate-400 truncate">
                Browse by provider, search across all models, and reorder priority on the right
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <CatalogToolbar
          searchInputRef={searchInputRef}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          connectedOnly={connectedOnly}
          onToggleConnectedOnly={handleToggleConnectedOnly}
          hasConnectedAccounts={hasConnectedAccounts}
          connectedProvidersCount={connectedProviderIds.size}
          activeModalityFilter={activeModalityFilter}
          onModalityChange={setActiveModalityFilter}
          mobileTab={mobileTab}
          onMobileTabChange={setMobileTab}
          totalMatchingCount={filteredCatalog.totalMatchingCount}
          selectedCount={selectedModels.length}
        />

        {/* 3-Pane Workspace */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden lg:divide-x divide-[#1E293B]">
          <ProviderSidebar
            providers={sidebarProviders}
            selectedProvider={selectedProvider}
            onSelectProvider={setSelectedProvider}
            totalModelCount={filteredCatalog.totalMatchingCount}
            allowCombos={allowCombos !== false}
            combosCount={filteredCombos.length}
            selectedCombosCount={selectedCombosCount}
          />

          <CatalogPane
            visibleModels={filteredCatalog.visibleModels}
            totalMatchingCount={filteredCatalog.totalMatchingCount}
            sidebarProviders={sidebarProviders}
            selectedProvider={selectedProvider}
            onSelectProvider={setSelectedProvider}
            activeScopeLabel={activeScopeLabel}
            allowCombos={allowCombos !== false}
            filteredCombos={filteredCombos}
            selectedCombosCount={selectedCombosCount}
            selectedSet={selectedSet}
            selectedModel={selectedModel}
            selectedInViewCount={selectedInViewCount}
            multiSelect={multiSelect}
            connectedOnly={connectedOnly}
            hasConnectedAccounts={hasConnectedAccounts}
            onShowAllRegistry={handleShowAllRegistry}
            scrollKey={scrollKey}
            onToggleModel={handleToggleModel}
            onToggleCombo={handleToggleCombo}
            onAddAllVisible={handleAddAllVisible}
            onDeselectVisible={handleDeselectVisible}
            customModelInput={customModelInput}
            onCustomModelInputChange={setCustomModelInput}
            onAddCustomModel={handleAddCustomModel}
            className={mobileTab === "catalog" ? "flex" : "hidden lg:flex"}
          />

          <SelectedModelsPanel
            selectedModels={selectedModels}
            capsMap={catalog.capsMap}
            onClearAll={handleClearAll}
            onRemoveModel={handleRemoveModel}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            onDragEnd={handleDragEnd}
            className={`lg:col-span-4 ${mobileTab === "selected" ? "flex" : "hidden lg:flex"}`}
          />
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-t border-[#1E293B] bg-[#0A0D14]/60 shrink-0">
          <div className="text-xs text-slate-400">
            {selectedModels.length === 0 ? (
              <span>No models selected</span>
            ) : (
              <span>
                <strong className="text-white font-mono">{selectedModels.length}</strong> model
                {selectedModels.length > 1 ? "s" : ""} in priority order
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white bg-[#141B2D] border border-[#1E293B] hover:border-slate-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-600/20 transition-all cursor-pointer"
            >
              {onConfirm ? "Confirm Selection" : "Done"}
            </button>
          </div>
        </div>
      </div>
    </PortalModal>
  );
};
