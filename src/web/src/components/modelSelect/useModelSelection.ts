import { useState, useMemo, useCallback } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";
import { getCapabilitiesForModel } from "../../../../core/capabilities/index.js";
import { createModelOption, type ComboSummary, type ModelOption } from "./types.js";

export interface UseModelSelectionParams {
  multiSelect: boolean;
  closeOnSelect: boolean;
  onClose: () => void;
  onSelect?: (model: ModelOption) => void;
  onDeselect?: (model: ModelOption) => void;
  modelOptionMap: Map<string, ModelOption>;
  visibleModels: ModelOption[];
}

export function useModelSelection({
  multiSelect,
  closeOnSelect,
  onClose,
  onSelect,
  onDeselect,
  modelOptionMap,
  visibleModels,
}: UseModelSelectionParams) {
  const [selectedModels, setSelectedModels] = useState<string[]>([]);

  const selectedSet = useMemo(() => new Set(selectedModels), [selectedModels]);

  const handleToggleModel = useCallback(
    (item: ModelOption) => {
      const val = item.value;
      const isCurrentlySelected = selectedSet.has(val);

      if (isCurrentlySelected) {
        onDeselect?.(item);
        setSelectedModels((prev) => prev.filter((m) => m !== val));
      } else {
        onSelect?.(item);
        if (!multiSelect) {
          setSelectedModels([val]);
        } else {
          setSelectedModels((prev) => [...prev, val]);
        }
      }

      if (closeOnSelect) {
        onClose();
      }
    },
    [selectedSet, onDeselect, onSelect, multiSelect, closeOnSelect, onClose]
  );

  const handleToggleCombo = useCallback(
    (combo: ComboSummary) => {
      const val = combo.name;
      const isCurrentlySelected = selectedSet.has(val);

      const comboOption: ModelOption = createModelOption(
        combo.name,
        combo.name,
        combo.name,
        "combo",
        "Combos",
        combo.caps || getCapabilitiesForModel(null, combo.name),
        undefined,
        "combo",
        false
      );

      if (isCurrentlySelected) {
        onDeselect?.(comboOption);
        setSelectedModels((prev) => prev.filter((m) => m !== val));
      } else {
        onSelect?.(comboOption);
        if (!multiSelect) {
          setSelectedModels([val]);
        } else {
          setSelectedModels((prev) => [...prev, val]);
        }
      }

      if (closeOnSelect) {
        onClose();
      }
    },
    [selectedSet, onDeselect, onSelect, multiSelect, closeOnSelect, onClose]
  );

  const handleAddAllVisible = useCallback(() => {
    if (!multiSelect) return;
    const toAdd: string[] = [];
    for (const item of visibleModels) {
      if (!selectedSet.has(item.value)) {
        toAdd.push(item.value);
        onSelect?.(item);
      }
    }
    if (toAdd.length > 0) {
      setSelectedModels((prev) => [...prev, ...toAdd]);
    }
  }, [multiSelect, visibleModels, selectedSet, onSelect]);

  const handleDeselectVisible = useCallback(() => {
    const visibleSet = new Set(visibleModels.map((m) => m.value));
    for (const item of visibleModels) {
      if (selectedSet.has(item.value)) {
        onDeselect?.(item);
      }
    }
    setSelectedModels((prev) => prev.filter((v) => !visibleSet.has(v)));
  }, [visibleModels, selectedSet, onDeselect]);

  const handleRemoveModel = useCallback(
    (val: string) => {
      setSelectedModels((prev) => prev.filter((m) => m !== val));
      const opt = modelOptionMap.get(val);
      if (opt && onDeselect) {
        onDeselect(opt);
      }
    },
    [modelOptionMap, onDeselect]
  );

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

  const handleClearAll = useCallback(() => setSelectedModels([]), []);

  const addCustomModel = useCallback(
    (val: string) => {
      if (!val || selectedSet.has(val)) return;
      if (!multiSelect) {
        setSelectedModels([val]);
      } else {
        setSelectedModels((prev) => [...prev, val]);
      }
    },
    [selectedSet, multiSelect]
  );

  const handleUpdateModel = useCallback((index: number, nextVal: string) => {
    const trimmed = nextVal.trim();
    if (!trimmed) return;
    setSelectedModels((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const next = [...prev];
      next[index] = trimmed;
      return next;
    });
  }, []);

  return {
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
    handleUpdateModel,
  };
}
