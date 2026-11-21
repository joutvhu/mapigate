import React, { useState, useEffect, useMemo } from "react";
import { PortalModal } from "./PortalModal.js";
import { FreeTierProviderCard } from "./FreeTierProviderCard.js";
import { FreeTierComboToolbar } from "./FreeTierComboToolbar.js";
import { FreeTierComboConfigBar } from "./FreeTierComboConfigBar.js";
import { useFreeTierProviders } from "../hooks/useFreeTierProviders.js";

export interface FreeTierComboModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (combo: {
    name: string;
    models: string[];
    strategy: "round-robin" | "fallback" | "fusion" | "lkgp" | "p2c";
  }) => Promise<void> | void;
  existingComboNames?: string[];
}

export const VALID_NAME_REGEX = /^[a-zA-Z0-9_.-]+$/;

export const FreeTierComboModal: React.FC<FreeTierComboModalProps> = ({
  isOpen,
  onClose,
  onSave,
  existingComboNames = [],
}) => {
  const [comboName, setComboName] = useState("free-fallback");
  const [strategy, setStrategy] = useState<"round-robin" | "fallback" | "fusion" | "lkgp" | "p2c">("fallback");
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyConnected, setOnlyConnected] = useState(false);
  const [selectedModelValues, setSelectedModelValues] = useState<Set<string>>(new Set());
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
      let defaultName = "free-fallback";
      let counter = 2;
      while (existingComboNames.includes(defaultName)) {
        defaultName = `free-fallback-${counter++}`;
      }
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
    const trimmed = comboName.trim();
    if (!trimmed) return setErrorMsg("Combo name is required.");
    if (!VALID_NAME_REGEX.test(trimmed)) {
      return setErrorMsg("Name can only contain letters, numbers, -, _ and .");
    }
    if (selectedModelValues.size === 0) {
      return setErrorMsg("Please select at least one free model for this combo.");
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      await onSave({
        name: trimmed,
        models: Array.from(selectedModelValues),
        strategy,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create free tier combo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PortalModal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-4xl" className="max-h-[90vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#1E293B] shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[20px]">savings</span>
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              Create Free Tier Combo
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Auto-Fallback
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Select verified free models across providers and bundle them into a resilient free combo.
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
          comboName={comboName}
          onComboNameChange={(val) => {
            setComboName(val);
            if (errorMsg) setErrorMsg(null);
          }}
          strategy={strategy}
          onStrategyChange={setStrategy}
        />

        <FreeTierComboToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onlyConnected={onlyConnected}
          onToggleOnlyConnected={() => setOnlyConnected(!onlyConnected)}
          onSelectConnectedOnly={handleSelectConnectedOnly}
          onDeselectAll={() => setSelectedModelValues(new Set())}
          onTestAll={() => testAll(filteredProviders.map((p) => p.provider.id))}
          isTestingAll={isTestingAll}
        />

        {/* Scrollable Provider Cards */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 min-h-[220px]">
          {filteredProviders.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              No matching free providers found.
            </div>
          ) : (
            filteredProviders.map((item) => (
              <FreeTierProviderCard
                key={item.provider.id}
                provider={item.provider}
                freeTier={item.freeTier}
                freeModels={item.freeModels}
                selectedModelValues={selectedModelValues}
                onToggleModel={handleToggleModel}
                onToggleAllProviderModels={handleToggleAllProviderModels}
                connectionStatus={item.connectionStatus}
                statusLabel={item.statusLabel}
                statusDetail={item.statusDetail}
                onTestConnection={testConnection}
                isTesting={testingIds.has(item.provider.id)}
                defaultExpanded={item.freeModels.some((m) => selectedModelValues.has(m.comboModelValue))}
              />
            ))
          )}
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2 shrink-0">
            <span className="material-symbols-outlined text-[16px]">error</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Footer */}
        <div className="pt-3 border-t border-[#1E293B] flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-400">
            Selected: <span className="font-semibold text-emerald-400">{selectedModelValues.size}</span> free model
            {selectedModelValues.size !== 1 ? "s" : ""}
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
                {isSubmitting ? "hourglass_empty" : "check_circle"}
              </span>
              <span>Create Free Tier Combo</span>
            </button>
          </div>
        </div>
      </form>
    </PortalModal>
  );
};
