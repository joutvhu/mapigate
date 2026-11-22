import React, { useState, useMemo, useCallback } from "react";
import type { ComboItem } from "../components/ComboFormModal.js";
import { ConfirmModal } from "../components/ConfirmModal.js";
import { ModelSelectModal } from "../components/ModelSelectModal.js";
import { invalidateAvailableModelsCache } from "../components/ModelAutocompleteInput.js";
import { ComboModelRow } from "../components/combo/ComboModelRow.js";
import { ComboDetailHeader } from "../components/combo/ComboDetailHeader.js";
import { ComboToolbar } from "../components/combo/ComboToolbar.js";

export interface ComboDetailPageProps {
  combo: ComboItem;
  onBack: () => void;
  onComboUpdated?: (updated: ComboItem) => void;
  onComboDeleted?: () => void;
}

export const ComboDetailPage: React.FC<ComboDetailPageProps> = ({
  combo: initialCombo,
  onBack,
  onComboUpdated,
  onComboDeleted,
}) => {
  const [combo, setCombo] = useState<ComboItem>(initialCombo);
  const [searchQuery, setSearchQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [newModelInput, setNewModelInput] = useState("");
  const [showModelSelectModal, setShowModelSelectModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [providerToRemove, setProviderToRemove] = useState<string | null>(null);

  // Extract all distinct provider prefixes from models
  const providersList = useMemo(() => {
    const set = new Set<string>();
    for (const m of combo.models) {
      if (m.includes("/")) {
        const p = m.split("/")[0].replace(/\(.*?\)/, "").trim();
        if (p) set.add(p);
      }
    }
    return Array.from(set).sort();
  }, [combo.models]);

  // Persist combo changes to backend API
  const persistChanges = useCallback(
    async (patch: Partial<ComboItem>) => {
      const updated: ComboItem = { ...combo, ...patch };
      setCombo(updated);
      onComboUpdated?.(updated);
      try {
        setSaving(true);
        const res = await fetch(`/api/combos/${combo.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: updated.name,
            models: updated.models,
            strategy: updated.strategy,
            isActive: updated.isActive,
          }),
        });
        if (res.ok) {
          const saved = await res.json();
          setCombo(saved);
          onComboUpdated?.(saved);
          invalidateAvailableModelsCache();
        }
      } catch (err) {
        console.error("Failed to update combo:", err);
      } finally {
        setSaving(false);
      }
    },
    [combo, onComboUpdated]
  );

  // Reorder handlers
  const handleMoveToTop = (index: number) => {
    if (index <= 0) return;
    const item = combo.models[index];
    const newModels = [item, ...combo.models.slice(0, index), ...combo.models.slice(index + 1)];
    persistChanges({ models: newModels });
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const newModels = [...combo.models];
    const temp = newModels[index];
    newModels[index] = newModels[index - 1];
    newModels[index - 1] = temp;
    persistChanges({ models: newModels });
  };

  const handleMoveDown = (index: number) => {
    if (index >= combo.models.length - 1) return;
    const newModels = [...combo.models];
    const temp = newModels[index];
    newModels[index] = newModels[index + 1];
    newModels[index + 1] = temp;
    persistChanges({ models: newModels });
  };

  const handleMoveToBottom = (index: number) => {
    if (index >= combo.models.length - 1) return;
    const item = combo.models[index];
    const newModels = [...combo.models.slice(0, index), ...combo.models.slice(index + 1), item];
    persistChanges({ models: newModels });
  };

  const handleRemove = (index: number) => {
    const newModels = combo.models.filter((_, i) => i !== index);
    persistChanges({ models: newModels });
  };

  const handleQuickAdd = () => {
    const trimmed = newModelInput.trim();
    if (!trimmed || combo.models.includes(trimmed)) return;
    persistChanges({ models: [...combo.models, trimmed] });
    setNewModelInput("");
  };

  const handleSelectModalConfirm = (selected: string[]) => {
    const existing = new Set(combo.models);
    const toAdd = selected.filter((m) => !existing.has(m));
    if (toAdd.length > 0) {
      persistChanges({ models: [...combo.models, ...toAdd] });
    }
    setShowModelSelectModal(false);
  };

  const handleRemoveByProvider = (providerName: string) => {
    const newModels = combo.models.filter((m) => {
      const p = m.split("/")[0].replace(/\(.*?\)/, "").trim();
      return p !== providerName;
    });
    persistChanges({ models: newModels });
    setProviderToRemove(null);
    if (providerFilter === providerName) {
      setProviderFilter("all");
    }
  };

  const handleDeleteCombo = async () => {
    try {
      const res = await fetch(`/api/combos/${combo.id}`, { method: "DELETE" });
      if (res.ok) {
        invalidateAvailableModelsCache();
        onComboDeleted?.();
        onBack();
      }
    } catch (err) {
      console.error("Failed to delete combo:", err);
    }
  };

  // Filtered list with original indices
  const filteredWithIndex = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return combo.models
      .map((model, originalIndex) => ({ model, originalIndex }))
      .filter(({ model }) => {
        if (providerFilter !== "all") {
          const p = model.split("/")[0].replace(/\(.*?\)/, "").trim();
          if (p !== providerFilter) return false;
        }
        if (q && !model.toLowerCase().includes(q)) return false;
        return true;
      });
  }, [combo.models, searchQuery, providerFilter]);

  return (
    <div className="space-y-6 w-full pb-16 animate-rt-fade-in">
      {/* Top Banner Card */}
      <ComboDetailHeader
        combo={combo}
        providersCount={providersList.length}
        saving={saving}
        onBack={onBack}
        onUpdateStrategy={(strategy) => persistChanges({ strategy })}
        onToggleActive={() => persistChanges({ isActive: combo.isActive === false })}
        onDeleteRequest={() => setConfirmDelete(true)}
      />

      {/* Model Management Section */}
      <div className="w-full p-5 rounded-2xl bg-[#0F1420]/80 border border-[#1E293B] space-y-4">
        <ComboToolbar
          totalModels={combo.models.length}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          providersList={providersList}
          providerFilter={providerFilter}
          onProviderFilterChange={setProviderFilter}
          onRemoveProviderRequest={(p) => setProviderToRemove(p)}
          onBrowseCatalog={() => setShowModelSelectModal(true)}
          newModelInput={newModelInput}
          onNewModelInputChange={setNewModelInput}
          onQuickAdd={handleQuickAdd}
          existingModels={combo.models}
        />

        {/* Models List */}
        <div className="space-y-2 pt-2">
          {filteredWithIndex.length === 0 ? (
            <div className="py-12 text-center text-slate-500 bg-[#0A0D14]/60 rounded-xl border border-[#1E293B]">
              <span className="material-symbols-outlined text-3xl mb-1 text-slate-600">
                filter_list_off
              </span>
              <p className="text-xs">No models match current filter</p>
              {(searchQuery || providerFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setProviderFilter("all");
                  }}
                  className="mt-2 text-xs text-blue-400 hover:underline cursor-pointer"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            filteredWithIndex.map(({ model, originalIndex }) => (
              <ComboModelRow
                key={`${model}-${originalIndex}`}
                model={model}
                index={originalIndex}
                total={combo.models.length}
                onMoveToTop={handleMoveToTop}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                onMoveToBottom={handleMoveToBottom}
                onRemove={handleRemove}
              />
            ))
          )}
        </div>
      </div>

      {/* Delete Combo Confirm Modal */}
      {confirmDelete && (
        <ConfirmModal
          isOpen={confirmDelete}
          title="Delete Combo"
          message={`Are you sure you want to delete combo "${combo.name}"? This action cannot be undone.`}
          confirmText="Delete Combo"
          variant="danger"
          onClose={() => setConfirmDelete(false)}
          onConfirm={handleDeleteCombo}
        />
      )}

      {/* Remove Provider Models Confirm Modal */}
      {providerToRemove && (
        <ConfirmModal
          isOpen={Boolean(providerToRemove)}
          title={`Remove ${providerToRemove} Models`}
          message={`Remove all models belonging to provider "${providerToRemove}" from this combo?`}
          confirmText="Remove Models"
          variant="danger"
          onClose={() => setProviderToRemove(null)}
          onConfirm={() => handleRemoveByProvider(providerToRemove)}
        />
      )}

      {/* Browse Catalog Model Select Modal */}
      {showModelSelectModal && (
        <ModelSelectModal
          isOpen={showModelSelectModal}
          onClose={() => setShowModelSelectModal(false)}
          title={`Add Models to ${combo.name}`}
          initialSelectedModels={combo.models}
          onConfirm={handleSelectModalConfirm}
          multiSelect
          allowCombos={false}
        />
      )}
    </div>
  );
};
