import React, { useState, useEffect, useMemo, useRef, useCallback, useDeferredValue } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";
import { PortalModal } from "./PortalModal.js";
import { FreeTierComboToolbar } from "./FreeTierComboToolbar.js";
import { FreeTierComboConfigBar } from "./FreeTierComboConfigBar.js";
import { FreeTierSidebar } from "./freeTier/FreeTierSidebar.js";
import { FreeTierCatalogPane } from "./freeTier/FreeTierCatalogPane.js";
import { BatchCombosPreviewPanel } from "./freeTier/BatchCombosPreviewPanel.js";
import { SelectedModelsPanel } from "./modelSelect/SelectedModelsPanel.js";
import { useFreeTierProviders } from "../hooks/useFreeTierProviders.js";
import {
  type FreeTierGroupMode,
  groupFreeTierModels,
  generateUniqueComboName,
  VALID_NAME_REGEX,
  buildMultiComboPayload,
} from "../utils/freeTierGrouping.js";
import {
  buildFreeTierCapsMap,
  filterFreeTierWorkspace,
  type FreeTierModalityFilter,
} from "./freeTier/freeTierModalUtils.js";

export interface FreeTierComboPayload {
  name: string;
  models: string[];
  strategy: "round-robin" | "fallback" | "fusion" | "lkgp" | "p2c";
}

export interface FreeTierComboModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (combo: FreeTierComboPayload) => Promise<void> | void;
  onSaveBatch?: (combos: FreeTierComboPayload[]) => Promise<void> | void;
  existingComboNames?: string[];
}

export const FreeTierComboModal: React.FC<FreeTierComboModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onSaveBatch,
  existingComboNames = [],
}) => {
  const [comboName, setComboName] = useState("free-fallback");
  const [namePrefix, setNamePrefix] = useState("free-");
  const [strategy, setStrategy] = useState<"round-robin" | "fallback" | "fusion" | "lkgp" | "p2c">("fallback");
  const [groupMode, setGroupMode] = useState<FreeTierGroupMode>("provider");
  const [isMultiMode, setIsMultiMode] = useState(false);
  const [onlyMultiProvider, setOnlyMultiProvider] = useState(false);
  const [onlyConnected, setOnlyConnected] = useState(false);
  const [modalityFilter, setModalityFilter] = useState<FreeTierModalityFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const [activeScopeId, setActiveScopeId] = useState<string>("all");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [groupComboNames, setGroupComboNames] = useState<Record<string, string>>({});
  const [mobileTab, setMobileTab] = useState<"catalog" | "selected">("catalog");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const hasInitializedRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { freeProvidersList, testingIds, isTestingAll, testConnection, testAll } =
    useFreeTierProviders(isOpen);

  // Reset modal state on open
  useEffect(() => {
    if (isOpen) {
      hasInitializedRef.current = false;
      setComboName(generateUniqueComboName("free-fallback", existingComboNames));
      setSelectedModels([]);
      setGroupComboNames({});
      setSearchQuery("");
      setActiveScopeId("all");
      setModalityFilter("all");
      setMobileTab("catalog");
      setErrorMsg(null);
      const timer = setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Pre-select up to 3 models from each connected provider ONCE per modal open
  useEffect(() => {
    if (isOpen && !hasInitializedRef.current && freeProvidersList.length > 0) {
      hasInitializedRef.current = true;
      const initial: string[] = [];
      for (const item of freeProvidersList) {
        if (item.connectionStatus === "connected" && item.freeModels.length > 0) {
          for (const m of item.freeModels.slice(0, 3)) {
            if (!initial.includes(m.comboModelValue)) {
              initial.push(m.comboModelValue);
            }
          }
        }
      }
      if (initial.length > 0) setSelectedModels(initial);
    }
  }, [isOpen, freeProvidersList]);

  const selectedSet = useMemo(() => new Set(selectedModels), [selectedModels]);

  const capsMap = useMemo(() => buildFreeTierCapsMap(freeProvidersList), [freeProvidersList]);

  const groups = useMemo(() => {
    if (groupMode === "provider") return [];
    return groupFreeTierModels(freeProvidersList, groupMode, namePrefix);
  }, [freeProvidersList, groupMode, namePrefix]);

  const workspace = useMemo(
    () =>
      filterFreeTierWorkspace({
        freeProvidersList,
        groups,
        groupMode,
        searchQuery: deferredSearchQuery,
        onlyConnected,
        onlyMultiProvider,
        modalityFilter,
        activeScopeId,
        selectedSet,
        capsMap,
      }),
    [
      freeProvidersList,
      groups,
      groupMode,
      deferredSearchQuery,
      onlyConnected,
      onlyMultiProvider,
      modalityFilter,
      activeScopeId,
      selectedSet,
      capsMap,
    ]
  );

  // Fall back to "all" if activeScopeId is absent when search is empty
  useEffect(() => {
    if (
      activeScopeId !== "all" &&
      !deferredSearchQuery.trim() &&
      !workspace.railItems.some((r) => r.id === activeScopeId)
    ) {
      setActiveScopeId("all");
    }
  }, [activeScopeId, deferredSearchQuery, workspace.railItems]);

  const activeGroups = useMemo(() => {
    return groups.filter((g) => g.candidates.some((c) => selectedSet.has(c.model.comboModelValue)));
  }, [groups, selectedSet]);

  const selectedInViewCount = useMemo(() => {
    let count = 0;
    for (const c of workspace.visibleCandidates) {
      if (selectedSet.has(c.comboModelValue)) count++;
    }
    return count;
  }, [workspace.visibleCandidates, selectedSet]);

  const handleGroupModeChange = useCallback((mode: FreeTierGroupMode) => {
    setGroupMode(mode);
    setActiveScopeId("all");
    if (mode === "provider") setIsMultiMode(false);
  }, []);

  const handleToggleModel = useCallback((val: string) => {
    setSelectedModels((prev) =>
      prev.includes(val) ? prev.filter((m) => m !== val) : [...prev, val]
    );
  }, []);

  const handleAddAllVisible = useCallback(() => {
    setSelectedModels((prev) => {
      const existing = new Set(prev);
      const next = [...prev];
      for (const c of workspace.visibleCandidates) {
        if (!existing.has(c.comboModelValue)) {
          existing.add(c.comboModelValue);
          next.push(c.comboModelValue);
        }
      }
      return next;
    });
  }, [workspace.visibleCandidates]);

  const handleDeselectVisible = useCallback(() => {
    const visibleSet = new Set(workspace.visibleCandidates.map((c) => c.comboModelValue));
    setSelectedModels((prev) => prev.filter((v) => !visibleSet.has(v)));
  }, [workspace.visibleCandidates]);

  const handleSelectConnectedOnly = useCallback(() => {
    const next: string[] = [];
    const seen = new Set<string>();
    for (const item of freeProvidersList) {
      if (item.connectionStatus === "connected") {
        for (const m of item.freeModels) {
          if (!seen.has(m.comboModelValue)) {
            seen.add(m.comboModelValue);
            next.push(m.comboModelValue);
          }
        }
      }
    }
    setSelectedModels(next);
  }, [freeProvidersList]);

  const handleClearAll = useCallback(() => setSelectedModels([]), []);

  const handleRemoveModel = useCallback((val: string) => {
    setSelectedModels((prev) => prev.filter((m) => m !== val));
  }, []);

  const handleMoveUp = useCallback((index: number) => {
    if (index <= 0) return;
    setSelectedModels((prev) => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
  }, []);

  const handleMoveDown = useCallback((index: number) => {
    setSelectedModels((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSelectedModels((items) => {
        const oldIndex = items.indexOf(String(active.id));
        const newIndex = items.indexOf(String(over.id));
        if (oldIndex !== -1 && newIndex !== -1) {
          return arrayMove(items, oldIndex, newIndex);
        }
        return items;
      });
    }
  }, []);

  const handleGroupComboNameChange = useCallback((id: string, val: string) => {
    setGroupComboNames((prev) => ({ ...prev, [id]: val }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedModels.length === 0) {
      return setErrorMsg("Please select at least one free model for this combo.");
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      if (!isMultiMode || groupMode === "provider") {
        const trimmed = comboName.trim();
        if (!trimmed) return setErrorMsg("Combo name is required.");
        if (!VALID_NAME_REGEX.test(trimmed)) {
          return setErrorMsg("Name can only contain letters, numbers, -, _ and .");
        }
        await onSave({
          name: trimmed,
          models: selectedModels,
          strategy,
        });
      } else {
        if (activeGroups.length === 0) {
          return setErrorMsg("Please select at least one model from any group.");
        }
        const { error, combos } = buildMultiComboPayload(
          activeGroups,
          selectedSet,
          groupComboNames,
          existingComboNames,
          strategy
        );
        if (error) return setErrorMsg(error);
        if (!combos || combos.length === 0) return setErrorMsg("No valid combos to create.");

        if (onSaveBatch) {
          await onSaveBatch(combos);
        } else {
          for (const c of combos) await onSave(c);
        }
      }
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to create free tier combo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const effectiveBatchMode = isMultiMode && groupMode !== "provider";
  const scrollKey = `${isOpen ? "1" : "0"}|${groupMode}|${activeScopeId}|${deferredSearchQuery}|${onlyConnected ? "1" : "0"}|${onlyMultiProvider ? "1" : "0"}|${modalityFilter}`;

  return (
    <PortalModal isOpen={isOpen} onClose={onClose} maxWidthClass="w-full max-w-[78rem]" overflowHidden>
      <form onSubmit={handleSubmit} className="flex flex-col h-[88vh] max-h-[820px] -m-2 sm:-m-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-[#1E293B] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">savings</span>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 truncate">
                <span>Create Free Tier Combo</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                  Zero-Cost Gateway
                </span>
              </h3>
              <p className="text-xs text-slate-400 truncate">
                Bundle verified free models across providers and set priority order on the right
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

        {/* Config Bar */}
        <FreeTierComboConfigBar
          isMultiMode={effectiveBatchMode}
          onToggleMultiMode={setIsMultiMode}
          canMultiMode={groupMode !== "provider"}
          comboName={comboName}
          onComboNameChange={(val) => {
            setComboName(val);
            if (errorMsg) setErrorMsg(null);
          }}
          namePrefix={namePrefix}
          onNamePrefixChange={setNamePrefix}
          strategy={strategy}
          onStrategyChange={setStrategy}
          activeGroupsCount={activeGroups.length}
        />

        {/* Filter Toolbar */}
        <FreeTierComboToolbar
          searchInputRef={searchInputRef}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onlyConnected={onlyConnected}
          onToggleOnlyConnected={() => setOnlyConnected((p) => !p)}
          groupMode={groupMode}
          onGroupModeChange={handleGroupModeChange}
          onlyMultiProvider={onlyMultiProvider}
          onToggleOnlyMultiProvider={() => setOnlyMultiProvider((p) => !p)}
          modalityFilter={modalityFilter}
          onModalityFilterChange={setModalityFilter}
          onSelectConnectedOnly={handleSelectConnectedOnly}
          onDeselectAll={handleClearAll}
          onTestAll={() => testAll(freeProvidersList.map((p) => p.provider.id))}
          isTestingAll={isTestingAll}
          mobileTab={mobileTab}
          onMobileTabChange={setMobileTab}
          totalMatchingCount={workspace.totalMatchingCount}
          selectedCount={selectedModels.length}
          isMultiMode={effectiveBatchMode}
          activeGroupsCount={activeGroups.length}
        />

        {/* 3-Pane Workspace */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden lg:divide-x divide-[#1E293B]">
          <FreeTierSidebar
            groupMode={groupMode}
            railItems={workspace.railItems}
            activeScopeId={activeScopeId}
            onSelectScope={setActiveScopeId}
            totalMatchingCount={workspace.totalMatchingCount}
          />

          <FreeTierCatalogPane
            groupMode={groupMode}
            railItems={workspace.railItems}
            activeScopeId={activeScopeId}
            onSelectScope={setActiveScopeId}
            visibleCandidates={workspace.visibleCandidates}
            totalMatchingCount={workspace.totalMatchingCount}
            activeProvider={workspace.activeProvider}
            activeGroup={workspace.activeGroup}
            selectedSet={selectedSet}
            selectedInViewCount={selectedInViewCount}
            testingIds={testingIds}
            isMultiMode={effectiveBatchMode}
            groupComboName={workspace.activeGroup ? groupComboNames[workspace.activeGroup.id] : undefined}
            onGroupComboNameChange={handleGroupComboNameChange}
            onToggleModel={handleToggleModel}
            onAddAllVisible={handleAddAllVisible}
            onDeselectVisible={handleDeselectVisible}
            onTestConnection={testConnection}
            onlyConnected={onlyConnected}
            onShowAllProviders={() => setOnlyConnected(false)}
            scrollKey={scrollKey}
            className={mobileTab === "catalog" ? "flex" : "hidden lg:flex"}
          />

          {effectiveBatchMode ? (
            <BatchCombosPreviewPanel
              activeGroups={activeGroups}
              selectedSet={selectedSet}
              groupComboNames={groupComboNames}
              onGroupComboNameChange={handleGroupComboNameChange}
              onRemoveModel={handleRemoveModel}
              onClearAll={handleClearAll}
              className={`lg:col-span-4 ${mobileTab === "selected" ? "flex" : "hidden lg:flex"}`}
            />
          ) : (
            <SelectedModelsPanel
              selectedModels={selectedModels}
              capsMap={capsMap}
              onClearAll={handleClearAll}
              onRemoveModel={handleRemoveModel}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
              onDragEnd={handleDragEnd}
              className={`lg:col-span-4 ${mobileTab === "selected" ? "flex" : "hidden lg:flex"}`}
            />
          )}
        </div>

        {/* Error Banner */}
        {errorMsg && (
          <div className="px-4 sm:px-5 py-2 bg-rose-500/10 border-t border-rose-500/20 text-rose-400 text-xs flex items-center gap-2 shrink-0">
            <span className="material-symbols-outlined text-[15px]">error</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-t border-[#1E293B] bg-[#0A0D14]/60 shrink-0">
          <div className="text-xs text-slate-400">
            Selected:{" "}
            <strong className="text-emerald-400 font-mono">{selectedModels.length}</strong> free model
            {selectedModels.length !== 1 ? "s" : ""}
            {effectiveBatchMode && activeGroups.length > 0 && (
              <span className="ml-2 text-slate-500">
                ({activeGroups.length} combo{activeGroups.length !== 1 ? "s" : ""})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-[#141B2D] border border-[#1E293B] hover:border-slate-700 text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || selectedModels.length === 0}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">
                {isSubmitting
                  ? "hourglass_empty"
                  : effectiveBatchMode && activeGroups.length > 1
                  ? "dynamic_feed"
                  : "check_circle"}
              </span>
              <span>
                {effectiveBatchMode && activeGroups.length > 1
                  ? `Create ${activeGroups.length} Free Combos`
                  : "Create Free Tier Combo"}
              </span>
            </button>
          </div>
        </div>
      </form>
    </PortalModal>
  );
};
