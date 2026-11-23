import React, { useState, useEffect, useMemo } from "react";
import { PortalModal } from "./PortalModal.js";
import { FreeTierComboToolbar } from "./FreeTierComboToolbar.js";
import { FreeTierComboConfigBar } from "./FreeTierComboConfigBar.js";
import { FreeTierComboList } from "./FreeTierComboList.js";
import { useFreeTierProviders } from "../hooks/useFreeTierProviders.js";
import {
  type FreeTierGroupMode,
  groupFreeTierModels,
  generateUniqueComboName,
  VALID_NAME_REGEX,
  buildMultiComboPayload,
} from "../utils/freeTierGrouping.js";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyConnected, setOnlyConnected] = useState(false);
  const [selectedModelValues, setSelectedModelValues] = useState<Set<string>>(new Set());
  const [groupComboNames, setGroupComboNames] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const {
    freeProvidersList,
    testingIds,
    isTestingAll,
    testConnection,
    testAll,
  } = useFreeTierProviders(isOpen);

  useEffect(() => {
    if (isOpen) {
      const defaultName = generateUniqueComboName("free-fallback", existingComboNames);
      setComboName(defaultName);
      setErrorMsg(null);
    }
  }, [isOpen, existingComboNames]);

  // Pre-select models from connected providers on initial open
  useEffect(() => {
    if (isOpen && selectedModelValues.size === 0 && freeProvidersList.length > 0) {
      const initial = new Set<string>();
      for (const item of freeProvidersList) {
        if (item.connectionStatus === "connected" && item.freeModels.length > 0) {
          for (const m of item.freeModels.slice(0, 3)) {
            initial.add(m.comboModelValue);
          }
        }
      }
      if (initial.size > 0) setSelectedModelValues(initial);
    }
  }, [isOpen, freeProvidersList]);

  // Filter providers
  const filteredProviders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return freeProvidersList.filter((item) => {
      if (onlyConnected && item.connectionStatus !== "connected") return false;
      if (!q) return true;
      if (item.provider.name.toLowerCase().includes(q)) return true;
      if (item.provider.id.toLowerCase().includes(q)) return true;
      return item.freeModels.some(
        (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
      );
    });
  }, [freeProvidersList, searchQuery, onlyConnected]);

  // Grouped models for non-provider modes
  const groups = useMemo(() => {
    if (groupMode === "provider") return [];
    let list = groupFreeTierModels(filteredProviders, groupMode, namePrefix);
    if (groupMode === "model" && onlyMultiProvider) {
      list = list.filter((g) => new Set(g.candidates.map((c) => c.provider.id)).size >= 2);
    }
    return list;
  }, [filteredProviders, groupMode, namePrefix, onlyMultiProvider]);

  // Active groups having at least 1 selected model
  const activeGroups = useMemo(() => {
    return groups.filter((g) =>
      g.candidates.some((c) => selectedModelValues.has(c.model.comboModelValue))
    );
  }, [groups, selectedModelValues]);

  const handleToggleModel = (comboModelValue: string) => {
    setSelectedModelValues((prev) => {
      const next = new Set(prev);
      if (next.has(comboModelValue)) next.delete(comboModelValue);
      else next.add(comboModelValue);
      return next;
    });
  };

  const handleToggleAllProviderModels = (providerId: string, selectAll: boolean) => {
    const item = freeProvidersList.find((p) => p.provider.id === providerId);
    if (!item) return;
    setSelectedModelValues((prev) => {
      const next = new Set(prev);
      for (const m of item.freeModels) {
        if (selectAll) next.add(m.comboModelValue);
        else next.delete(m.comboModelValue);
      }
      return next;
    });
  };

  const handleToggleAllGroupModels = (groupId: string, selectAll: boolean) => {
    const grp = groups.find((g) => g.id === groupId);
    if (!grp) return;
    setSelectedModelValues((prev) => {
      const next = new Set(prev);
      for (const c of grp.candidates) {
        if (selectAll) next.add(c.model.comboModelValue);
        else next.delete(c.model.comboModelValue);
      }
      return next;
    });
  };

  const handleSelectConnectedOnly = () => {
    const next = new Set<string>();
    for (const item of freeProvidersList) {
      if (item.connectionStatus === "connected") {
        for (const m of item.freeModels) next.add(m.comboModelValue);
      }
    }
    setSelectedModelValues(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedModelValues.size === 0) {
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
          models: Array.from(selectedModelValues),
          strategy,
        });
      } else {
        if (activeGroups.length === 0) {
          return setErrorMsg("Please select at least one model from any group.");
        }
        const { error, combos } = buildMultiComboPayload(
          activeGroups,
          selectedModelValues,
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
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create free tier combo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PortalModal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-5xl" className="max-h-[90vh] flex flex-col">
      <div className="flex items-center justify-between pb-4 border-b border-[#1E293B] shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[20px]">savings</span>
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              Create Free Tier Combo
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Zero-Cost Gateway
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Bundle verified free models across providers into high-availability fallback combos.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 pt-4 space-y-4">
        <FreeTierComboConfigBar
          isMultiMode={isMultiMode && groupMode !== "provider"}
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

        <FreeTierComboToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onlyConnected={onlyConnected}
          onToggleOnlyConnected={() => setOnlyConnected(!onlyConnected)}
          groupMode={groupMode}
          onGroupModeChange={(mode) => {
            setGroupMode(mode);
            if (mode === "provider") setIsMultiMode(false);
          }}
          onlyMultiProvider={onlyMultiProvider}
          onToggleOnlyMultiProvider={() => setOnlyMultiProvider(!onlyMultiProvider)}
          onSelectConnectedOnly={handleSelectConnectedOnly}
          onDeselectAll={() => setSelectedModelValues(new Set())}
          onTestAll={() => testAll(freeProvidersList.map((p) => p.provider.id))}
          isTestingAll={isTestingAll}
        />

        <FreeTierComboList
          groupMode={groupMode}
          filteredProviders={filteredProviders}
          groups={groups}
          selectedModelValues={selectedModelValues}
          onToggleModel={handleToggleModel}
          onToggleAllProviderModels={handleToggleAllProviderModels}
          onToggleAllGroupModels={handleToggleAllGroupModels}
          isMultiMode={isMultiMode}
          groupComboNames={groupComboNames}
          onGroupComboNameChange={(id, val) =>
            setGroupComboNames((prev) => ({ ...prev, [id]: val }))
          }
          onTestConnection={testConnection}
          testingIds={testingIds}
        />

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2 shrink-0">
            <span className="material-symbols-outlined text-[16px]">error</span>
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="pt-3 border-t border-[#1E293B] flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-400">
            Selected: <span className="font-semibold text-emerald-400">{selectedModelValues.size}</span> free model
            {selectedModelValues.size !== 1 ? "s" : ""}
            {isMultiMode && groupMode !== "provider" && activeGroups.length > 0 && (
              <span className="ml-2 text-slate-500">
                ({activeGroups.length} combo{activeGroups.length !== 1 ? "s" : ""})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || selectedModelValues.size === 0}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">
                {isSubmitting ? "hourglass_empty" : isMultiMode && activeGroups.length > 1 ? "dynamic_feed" : "check_circle"}
              </span>
              <span>
                {isMultiMode && activeGroups.length > 1
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
