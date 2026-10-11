import React, { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PortalModal } from "./PortalModal.js";
import { CapacityBadges } from "./CapacityBadges.js";
import { ModelSelectModal } from "./ModelSelectModal.js";
import { Select } from "./Select.js";

export interface ComboItem {
  id: string;
  name: string;
  models: string[];
  strategy: "round-robin" | "fallback" | "fusion";
  isActive?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface ComboFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  combo?: ComboItem | null;
  title?: string;
  onSave: (combo: {
    id?: string;
    name: string;
    models: string[];
    strategy: "round-robin" | "fallback" | "fusion";
    isActive?: boolean;
  }) => Promise<void> | void;
}

export const VALID_NAME_REGEX = /^[a-zA-Z0-9_.-]+$/;

interface SortableComboModelRowProps {
  id: string;
  model: string;
  index: number;
  onEdit: (newModel: string) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

const SortableComboModelRow: React.FC<SortableComboModelRowProps> = ({
  id,
  model,
  index,
  onEdit,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(model);

  useEffect(() => {
    setDraft(model);
  }, [model]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== model) {
      onEdit(trimmed);
    } else {
      setDraft(model);
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      setDraft(model);
      setEditing(false);
    }
  };

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl border bg-[#0A0D14] transition-all ${
        isDragging
          ? "border-blue-500 shadow-lg shadow-blue-500/10 bg-blue-950/40"
          : "border-[#1E293B] hover:border-slate-700"
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300 p-0.5 rounded touch-none shrink-0"
          title="Drag to reorder priority"
        >
          <span className="material-symbols-outlined text-[16px]">drag_indicator</span>
        </button>

        <span className="size-5 rounded-md bg-[#141B2D] border border-[#1E293B] text-[10px] font-mono text-blue-400 font-bold flex items-center justify-center shrink-0">
          {index + 1}
        </span>

        {editing ? (
          <input
            autoFocus
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            className="min-w-0 flex-1 rounded border border-blue-500/60 bg-[#141B2D] px-2 py-0.5 font-mono text-xs text-white outline-none focus:border-blue-400"
          />
        ) : (
          <div
            className="min-w-0 flex-1 cursor-text truncate rounded px-1.5 py-0.5 font-mono text-xs text-white hover:bg-white/5 flex items-center gap-2"
            onClick={() => setEditing(true)}
            title="Click to edit model ID inline"
          >
            <span className="truncate" title={id}>
              {id}
            </span>
            <span className="material-symbols-outlined text-[13px] text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
              edit
            </span>
          </div>
        )}

        {!editing && <CapacityBadges model={id} size="xs" />}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          className="p-1 text-slate-400 hover:text-white disabled:opacity-20 disabled:hover:text-slate-400 cursor-pointer transition-colors"
          title="Move up"
        >
          <span className="material-symbols-outlined text-[15px]">arrow_upward</span>
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          className="p-1 text-slate-400 hover:text-white disabled:opacity-20 disabled:hover:text-slate-400 cursor-pointer transition-colors"
          title="Move down"
        >
          <span className="material-symbols-outlined text-[15px]">arrow_downward</span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer transition-colors"
          title="Remove model"
        >
          <span className="material-symbols-outlined text-[15px]">close</span>
        </button>
      </div>
    </div>
  );
};

export const ComboFormModal: React.FC<ComboFormModalProps> = ({
  isOpen,
  onClose,
  combo,
  title,
  onSave,
}) => {
  const [name, setName] = useState("");
  const [strategy, setStrategy] = useState<"round-robin" | "fallback" | "fusion">("round-robin");
  const [models, setModels] = useState<string[]>([]);
  const [nameError, setNameError] = useState("");
  const [modelsError, setModelsError] = useState("");
  const [quickInputModel, setQuickInputModel] = useState("");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(combo);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (isOpen) {
      if (combo) {
        setName(combo.name);
        setStrategy(combo.strategy || "round-robin");
        setModels(Array.isArray(combo.models) ? [...combo.models] : []);
      } else {
        setName("");
        setStrategy("round-robin");
        setModels([]);
      }
      setNameError("");
      setModelsError("");
      setQuickInputModel("");
      setSaving(false);
    }
  }, [isOpen, combo]);

  const validateName = (val: string): boolean => {
    const trimmed = val.trim();
    if (!trimmed) {
      setNameError("Combo name is required.");
      return false;
    }
    if (!VALID_NAME_REGEX.test(trimmed)) {
      setNameError("Name can only contain letters, numbers, -, _ and .");
      return false;
    }
    setNameError("");
    return true;
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (val.trim()) {
      validateName(val);
    } else {
      setNameError("");
    }
  };

  const handleEditModel = (index: number, newModel: string) => {
    const updated = [...models];
    updated[index] = newModel;
    setModels(updated);
  };

  const handleRemoveModel = (index: number) => {
    setModels(models.filter((_, idx) => idx !== index));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const next = [...models];
    const temp = next[index - 1];
    next[index - 1] = next[index];
    next[index] = temp;
    setModels(next);
  };

  const handleMoveDown = (index: number) => {
    if (index === models.length - 1) return;
    const next = [...models];
    const temp = next[index + 1];
    next[index + 1] = next[index];
    next[index] = temp;
    setModels(next);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setModels((items) => {
        const itemIds = items.map((m, idx) => `${m}-${idx}`);
        const oldIndex = itemIds.indexOf(String(active.id));
        const newIndex = itemIds.indexOf(String(over.id));
        if (oldIndex !== -1 && newIndex !== -1) {
          return arrayMove(items, oldIndex, newIndex);
        }
        return items;
      });
    }
  };

  const handleAddQuickModel = (e: React.FormEvent) => {
    e.preventDefault();
    const val = quickInputModel.trim();
    if (!val) return;
    if (!models.includes(val)) {
      setModels([...models, val]);
      setModelsError("");
    }
    setQuickInputModel("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateName(name)) return;
    if (models.length === 0) {
      setModelsError("At least one model must be added to the combo.");
      return;
    }

    try {
      setSaving(true);
      await onSave({
        id: combo?.id,
        name: name.trim(),
        models,
        strategy,
        isActive: combo ? combo.isActive : true,
      });
      onClose();
    } catch (err: any) {
      setNameError(err?.message || "Failed to save combo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PortalModal isOpen={isOpen} onClose={onClose} maxWidthClass="w-full max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-5 -m-2 sm:-m-4 p-5 sm:p-6">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-[#1E293B]">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[20px]">
                  {isEdit ? "edit_note" : "add_circle"}
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {title || (isEdit ? `Edit Combo: ${combo?.name}` : "Create Smart Model Combo")}
                </h3>
                <p className="text-xs text-slate-400">
                  Configure an alias to rotate or fallback across multiple upstream models
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            {/* Combo Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                Combo Name / Alias <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. combo-fast-coding, claude-3-7-sonnet"
                value={name}
                onChange={handleNameChange}
                className={`w-full bg-[#0A0D14] border rounded-xl px-3.5 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none transition-colors ${
                  nameError
                    ? "border-rose-500/80 focus:border-rose-500"
                    : "border-[#1E293B] focus:border-blue-500"
                }`}
              />
              {nameError ? (
                <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px]">error</span>
                  {nameError}
                </p>
              ) : (
                <p className="text-[11px] text-slate-500 mt-1">
                  Can contain letters, numbers, dashes, underscores, and dots.
                </p>
              )}
            </div>

            {/* Routing Strategy */}
            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                Routing Strategy
              </label>
              <Select
                value={strategy}
                onChange={(val) =>
                  setStrategy(val as "round-robin" | "fallback" | "fusion")
                }
                options={[
                  { value: "round-robin", label: "Round Robin — Rotate across accounts" },
                  { value: "fallback", label: "Fallback — Sequential priority order" },
                  { value: "fusion", label: "Fusion — Parallel query panel + judge synthesis" },
                ]}
                className="w-full"
              />

              <div className="mt-2 p-2.5 rounded-xl bg-[#0A0D14] border border-[#1E293B] text-[11px] text-slate-400">
                {strategy === "round-robin" && (
                  <span className="text-cyan-300">
                    <strong>Round Robin:</strong> Spreads requests across member models in alternating turns to balance rate limits.
                  </span>
                )}
                {strategy === "fallback" && (
                  <span className="text-blue-300">
                    <strong>Fallback:</strong> Tries models sequentially; moves to backup on HTTP 429, 503, or quota errors.
                  </span>
                )}
                {strategy === "fusion" && (
                  <span className="text-indigo-300">
                    <strong>Fusion:</strong> Queries member models concurrently in parallel, then synthesizes the best answer with a judge.
                  </span>
                )}
              </div>
            </div>

            {/* Models Selection Section */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-200">
                  Member Models ({models.length}) <span className="text-rose-400">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowModelPicker(true)}
                  className="px-3 py-1 rounded-lg bg-blue-600/10 border border-blue-500/30 text-blue-400 hover:bg-blue-600/20 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px]">add</span>
                  Add Model
                </button>
              </div>

              {/* Drag-and-drop sortable list with item numbers, inline edit, and up/down buttons */}
              <div className="border border-[#1E293B] rounded-2xl bg-[#0A0D14]/50 p-2.5 space-y-2 min-h-[140px] max-h-[260px] overflow-y-auto">
                {models.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 text-xs">
                    No models in this combo yet. Click &ldquo;Add Model&rdquo; to pick from catalog or enter a model ID below.
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext items={models.map((m, idx) => `${m}-${idx}`)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-1.5">
                        {models.map((m, idx) => (
                          <SortableComboModelRow
                            key={`${m}-${idx}`}
                            id={`${m}-${idx}`}
                            model={m}
                            index={idx}
                            onEdit={(newVal) => handleEditModel(idx, newVal)}
                            onRemove={() => handleRemoveModel(idx)}
                            onMoveUp={() => handleMoveUp(idx)}
                            onMoveDown={() => handleMoveDown(idx)}
                            isFirst={idx === 0}
                            isLast={idx === models.length - 1}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </div>

              {modelsError && (
                <p className="text-[11px] text-rose-400 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px]">error</span>
                  {modelsError}
                </p>
              )}

              {/* Quick Input Form for manual additions */}
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Or type custom model ID (e.g. anthropic/claude-3-7-sonnet)..."
                  value={quickInputModel}
                  onChange={(e) => setQuickInputModel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddQuickModel(e);
                    }
                  }}
                  className="flex-1 bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-1.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAddQuickModel}
                  disabled={!quickInputModel.trim()}
                  className="px-3 py-1.5 rounded-xl bg-[#141B2D] border border-[#1E293B] hover:border-blue-500/50 hover:bg-blue-600/10 text-xs text-slate-300 hover:text-white disabled:opacity-40 cursor-pointer"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1E293B]">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white bg-[#141B2D] border border-[#1E293B] hover:border-slate-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-600/20 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {saving ? (
                <>
                  <span className="material-symbols-outlined text-[15px] animate-spin">
                    progress_activity
                  </span>
                  Saving...
                </>
              ) : (
                <span>{isEdit ? "Update Combo" : "Save Combo"}</span>
              )}
            </button>
          </div>
        </form>
      </PortalModal>

      {/* Model Catalog Picker Sub-Modal */}
      {showModelPicker && (
        <ModelSelectModal
          isOpen={showModelPicker}
          onClose={() => setShowModelPicker(false)}
          addedModelValues={models}
          initialSelectedModels={models}
          onSelect={(m) => {
            if (!models.includes(m.value)) {
              setModels((prev) => [...prev, m.value]);
              setModelsError("");
            }
          }}
          onDeselect={(m) => {
            setModels((prev) => prev.filter((val) => val !== m.value));
          }}
          onConfirm={(picked) => {
            setModels(picked);
            if (picked.length > 0) setModelsError("");
          }}
          title="Add Model to Combo"
          multiSelect={true}
          closeOnSelect={false}
        />
      )}
    </>
  );
};

export default ComboFormModal;
