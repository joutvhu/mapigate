import React, { useState, useMemo, useEffect, useRef } from "react";
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
import { Select } from "./Select.js";
import { PROVIDER_REGISTRY } from "../../../shared/constants/providerRegistry.js";
import { getCapabilitiesForModel, type ModelCapabilities } from "../../../core/capabilities/index.js";
import { getAvailableModelsCached, type AvailableModelItem } from "./ModelAutocompleteInput.js";

export interface ModelOption {
  id: string;
  value: string;
  name: string;
  providerId: string;
  providerName: string;
  caps: ModelCapabilities;
  contextLength?: number;
  kind?: string;
  isCustom?: boolean;
}

export interface ModelSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  initialSelectedModels?: string[];
  onConfirm?: (models: string[]) => void;
  multiSelect?: boolean;
  filterModality?: "vision" | "audio" | "pdf" | "thinking" | null;
  // 9router-style props
  onSelect?: (model: ModelOption) => void;
  onDeselect?: (model: ModelOption) => void;
  selectedModel?: string;
  activeProviders?: Array<{
    id?: string;
    provider?: string;
    name?: string;
    accountsCount?: number;
    [key: string]: any;
  }>;
  modelAliases?: Record<string, string>;
  kindFilter?: string | null;
  capFilter?: "vision" | "audio" | "pdf" | "thinking" | string | null;
  addedModelValues?: string[];
  closeOnSelect?: boolean;
}

interface ComboSummary {
  id: string;
  name: string;
  models: string[];
}

interface SortableModelItemProps {
  id: string;
  index: number;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

function formatContextLength(len?: number): string | null {
  if (!len || len <= 0) return null;
  if (len >= 1000000) {
    const m = (len / 1000000).toFixed(len % 1000000 === 0 ? 0 : 1);
    return `${m}M ctx`;
  }
  if (len >= 1000) {
    const k = Math.round(len / 1000);
    return `${k}K ctx`;
  }
  return `${len} ctx`;
}

const SortableModelItem: React.FC<SortableModelItemProps> = ({
  id,
  index,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}) => {
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
      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border bg-[#0A0D14] transition-all ${
        isDragging
          ? "border-blue-500 shadow-lg shadow-blue-500/10 bg-blue-950/40"
          : "border-[#1E293B] hover:border-slate-700"
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300 p-0.5 rounded touch-none"
          title="Drag to reorder priority"
        >
          <span className="material-symbols-outlined text-[16px]">drag_indicator</span>
        </button>
        <span className="size-5 rounded-md bg-[#141B2D] border border-[#1E293B] text-[10px] font-mono text-blue-400 font-bold flex items-center justify-center shrink-0">
          {index + 1}
        </span>
        <span className="font-mono text-xs text-white truncate max-w-[200px] sm:max-w-[260px]" title={id}>
          {id}
        </span>
        <CapacityBadges model={id} size="xs" />
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          className="p-1 text-slate-400 hover:text-white disabled:opacity-20 disabled:hover:text-slate-400 cursor-pointer"
          title="Move up"
        >
          <span className="material-symbols-outlined text-[15px]">arrow_upward</span>
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          className="p-1 text-slate-400 hover:text-white disabled:opacity-20 disabled:hover:text-slate-400 cursor-pointer"
          title="Move down"
        >
          <span className="material-symbols-outlined text-[15px]">arrow_downward</span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
          title="Remove"
        >
          <span className="material-symbols-outlined text-[15px]">close</span>
        </button>
      </div>
    </div>
  );
};

export const ModelSelectModal: React.FC<ModelSelectModalProps> = ({
  isOpen,
  onClose,
  title = "Select & Reorder Models",
  initialSelectedModels = [],
  onConfirm,
  multiSelect = true,
  filterModality = null,
  onSelect,
  onDeselect,
  selectedModel,
  activeProviders = [],
  modelAliases = {},
  kindFilter = null,
  capFilter = null,
  addedModelValues,
  closeOnSelect = false,
}) => {
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [activeModalityFilter, setActiveModalityFilter] = useState<string>(
    capFilter || filterModality || "all"
  );
  const [customModelInput, setCustomModelInput] = useState("");
  const [combos, setCombos] = useState<ComboSummary[]>([]);
  const [availableModels, setAvailableModels] = useState<AvailableModelItem[]>([]);
  const [connectedOnly, setConnectedOnly] = useState<boolean>(true);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // Initialize selected models from either prop
  useEffect(() => {
    if (isOpen) {
      const init = addedModelValues || initialSelectedModels || [];
      setSelectedModels([...init]);
      setSearchQuery("");
      setSelectedProvider("all");
      setActiveModalityFilter(capFilter || filterModality || "all");
      setCustomModelInput("");

      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialSelectedModels, addedModelValues, filterModality, capFilter]);

  // Fetch combos
  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;

    fetch("/api/combos")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!isCancelled) {
          const list = Array.isArray(data) ? data : data.combos || [];
          setCombos(list);
        }
      })
      .catch(() => {
        if (!isCancelled) setCombos([]);
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen]);

  // Fetch available models with connected status
  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;

    getAvailableModelsCached()
      .then((data) => {
        if (!isCancelled) {
          setAvailableModels(data);
          const hasConnected = data.some((m) => m.hasConnectedAccount);
          setConnectedOnly(hasConnected);
        }
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [isOpen]);

  const connectedProviderIds = useMemo(() => {
    const set = new Set<string>();
    for (const m of availableModels) {
      if (m.hasConnectedAccount) {
        set.add(m.providerId);
      }
    }
    return set;
  }, [availableModels]);

  const hasConnectedAccounts = useMemo(() => {
    return connectedProviderIds.size > 0;
  }, [connectedProviderIds]);

  // Build model catalog from PROVIDER_REGISTRY
  const allModels: ModelOption[] = useMemo(() => {
    const list: ModelOption[] = [];
    const seen = new Set<string>();

    for (const [providerId, provider] of Object.entries(PROVIDER_REGISTRY)) {
      if (!provider || !provider.models) continue;
      const alias = provider.alias || provider.id || providerId;

      for (const m of provider.models) {
        const val = m.id.includes("/") ? m.id : `${alias}/${m.id}`;
        if (seen.has(val)) continue;
        seen.add(val);

        const caps = getCapabilitiesForModel(providerId, m.id);
        list.push({
          id: m.id,
          value: val,
          name: m.name || m.id,
          providerId,
          providerName: provider.name || providerId,
          caps,
          contextLength: m.contextLength,
          kind: m.kind || "llm",
          isCustom: false,
        });
      }

      // Add alias-mapped models
      for (const [aliasKey, fullVal] of Object.entries(modelAliases)) {
        if (
          (fullVal.startsWith(`${alias}/`) || fullVal.startsWith(`${providerId}/`)) &&
          !seen.has(fullVal)
        ) {
          seen.add(fullVal);
          const slash = fullVal.indexOf("/");
          const modelId = slash === -1 ? fullVal : fullVal.slice(slash + 1);
          const caps = getCapabilitiesForModel(providerId, modelId);
          list.push({
            id: modelId,
            value: fullVal,
            name: aliasKey,
            providerId,
            providerName: provider.name || providerId,
            caps,
            isCustom: true,
          });
        }
      }
    }

    return list;
  }, [modelAliases]);

  // Distinct providers list
  const providerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of allModels) {
      if (connectedOnly && hasConnectedAccounts && !connectedProviderIds.has(m.providerId)) {
        continue;
      }
      if (!map.has(m.providerId)) {
        map.set(m.providerId, m.providerName);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [allModels, connectedOnly, hasConnectedAccounts, connectedProviderIds]);

  // Filter combos by search query (hidden if modality filter active)
  const filteredCombos = useMemo(() => {
    if (activeModalityFilter !== "all" || kindFilter) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return combos;
    return combos.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.models.some((m) => m.toLowerCase().includes(q))
    );
  }, [combos, searchQuery, activeModalityFilter, kindFilter]);

  // Filtered available models
  const filteredModels = useMemo(() => {
    return allModels.filter((item) => {
      // Connected only filter
      if (connectedOnly && hasConnectedAccounts) {
        if (!connectedProviderIds.has(item.providerId)) {
          return false;
        }
      }

      // Kind filter
      if (kindFilter && item.kind && item.kind !== kindFilter) return false;

      // Provider filter
      if (selectedProvider !== "all" && item.providerId !== selectedProvider) {
        return false;
      }

      // Modality filter
      if (activeModalityFilter === "vision" && !item.caps.vision) return false;
      if (activeModalityFilter === "pdf" && !item.caps.pdf) return false;
      if (
        activeModalityFilter === "audio" &&
        !item.caps.audioInput &&
        !(item.caps as any).audio
      )
        return false;
      if (
        activeModalityFilter === "thinking" &&
        !item.caps.reasoning &&
        !(item.caps as any).thinking &&
        !item.caps.thinkingFormat
      )
        return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesVal = item.value.toLowerCase().includes(q);
        const matchesProvider = item.providerName.toLowerCase().includes(q);
        if (!matchesName && !matchesVal && !matchesProvider) return false;
      }

      return true;
    });
  }, [
    allModels,
    selectedProvider,
    activeModalityFilter,
    kindFilter,
    searchQuery,
    connectedOnly,
    hasConnectedAccounts,
    connectedProviderIds,
  ]);

  const handleToggleModel = (item: ModelOption) => {
    const val = item.value;
    const isCurrentlySelected = selectedModels.includes(val);

    if (isCurrentlySelected) {
      if (onDeselect) {
        onDeselect(item);
      }
      setSelectedModels((prev) => prev.filter((m) => m !== val));
    } else {
      if (onSelect) {
        onSelect(item);
      }
      if (!multiSelect) {
        setSelectedModels([val]);
      } else {
        setSelectedModels((prev) => [...prev, val]);
      }
    }

    if (closeOnSelect) {
      onClose();
    }
  };

  const handleToggleCombo = (combo: ComboSummary) => {
    const val = combo.name;
    const isCurrentlySelected = selectedModels.includes(val);

    const comboOption: ModelOption = {
      id: combo.name,
      value: combo.name,
      name: combo.name,
      providerId: "combo",
      providerName: "Combos",
      caps: getCapabilitiesForModel(null, combo.name),
    };

    if (isCurrentlySelected) {
      if (onDeselect) onDeselect(comboOption);
      setSelectedModels((prev) => prev.filter((m) => m !== val));
    } else {
      if (onSelect) onSelect(comboOption);
      if (!multiSelect) {
        setSelectedModels([val]);
      } else {
        setSelectedModels((prev) => [...prev, val]);
      }
    }

    if (closeOnSelect) {
      onClose();
    }
  };

  const handleRemoveModel = (val: string) => {
    setSelectedModels((prev) => prev.filter((m) => m !== val));
    const opt = allModels.find((m) => m.value === val);
    if (opt && onDeselect) {
      onDeselect(opt);
    }
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const next = [...selectedModels];
    const temp = next[index - 1];
    next[index - 1] = next[index];
    next[index] = temp;
    setSelectedModels(next);
  };

  const handleMoveDown = (index: number) => {
    if (index === selectedModels.length - 1) return;
    const next = [...selectedModels];
    const temp = next[index + 1];
    next[index + 1] = next[index];
    next[index] = temp;
    setSelectedModels(next);
  };

  const handleDragEnd = (event: DragEndEvent) => {
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
  };

  const handleAddCustomModel = (e: React.FormEvent) => {
    e.preventDefault();
    const val = customModelInput.trim();
    if (!val) return;
    if (!selectedModels.includes(val)) {
      if (!multiSelect) {
        setSelectedModels([val]);
      } else {
        setSelectedModels((prev) => [...prev, val]);
      }
    }
    setCustomModelInput("");
  };

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm(selectedModels);
    }
    onClose();
  };

  return (
    <PortalModal isOpen={isOpen} onClose={onClose} maxWidthClass="w-full max-w-4xl">
      <div className="flex flex-col h-[85vh] max-h-[780px] -m-2 sm:-m-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#1E293B]">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">tune</span>
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">{title}</h3>
              <p className="text-xs text-slate-400">
                Pick models and drag & drop in the right panel to set priority order
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

        {/* Modal Body: 2 Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 min-h-0 overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-[#1E293B]">
          {/* Left Column: Catalog & Filters (7 cols) */}
          <div className="lg:col-span-7 flex flex-col min-h-0 p-4 space-y-3.5 overflow-hidden">
            {/* Search Input with Auto-focus and Clear button */}
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-500">
                search
              </span>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search models by name, provider, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>

            {/* Provider and Modality Filters */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Custom Select for Provider */}
              <Select
                value={selectedProvider}
                onChange={setSelectedProvider}
                options={[
                  { value: "all", label: `All Providers (${providerOptions.length})` },
                  ...providerOptions.map((p) => ({ value: p.id, label: p.name })),
                ]}
                className="shrink-0 min-w-[150px]"
              />

              {/* Connected Only Filter Button */}
              <button
                type="button"
                onClick={() => setConnectedOnly(!connectedOnly)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer flex items-center gap-1.5 ${
                  connectedOnly
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    : "bg-[#0A0D14] text-slate-400 border-[#1E293B] hover:text-white"
                }`}
                title={
                  connectedOnly
                    ? "Showing only models from connected accounts. Click to show all models."
                    : "Showing all catalog models. Click to filter by connected accounts."
                }
              >
                <span className="material-symbols-outlined text-[13px]">
                  {connectedOnly ? "check_circle" : "tune"}
                </span>
                Connected Only
                {hasConnectedAccounts && (
                  <span className="text-[9.5px] px-1 rounded bg-emerald-500/30 text-emerald-300 font-mono">
                    {connectedProviderIds.size}
                  </span>
                )}
              </button>

              {/* Modality Chips */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setActiveModalityFilter("all")}
                  className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                    activeModalityFilter === "all"
                      ? "bg-blue-600 text-white border-blue-500"
                      : "bg-[#0A0D14] text-slate-400 border-[#1E293B] hover:text-white"
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModalityFilter("vision")}
                  className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer flex items-center gap-1 ${
                    activeModalityFilter === "vision"
                      ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                      : "bg-[#0A0D14] text-slate-400 border-[#1E293B] hover:text-cyan-300"
                  }`}
                >
                  <span className="material-symbols-outlined text-[13px]">visibility</span>
                  Vision
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModalityFilter("audio")}
                  className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer flex items-center gap-1 ${
                    activeModalityFilter === "audio"
                      ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                      : "bg-[#0A0D14] text-slate-400 border-[#1E293B] hover:text-purple-300"
                  }`}
                >
                  <span className="material-symbols-outlined text-[13px]">graphic_eq</span>
                  Audio
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModalityFilter("thinking")}
                  className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer flex items-center gap-1 ${
                    activeModalityFilter === "thinking"
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                      : "bg-[#0A0D14] text-slate-400 border-[#1E293B] hover:text-emerald-300"
                  }`}
                >
                  <span className="material-symbols-outlined text-[13px]">psychology</span>
                  Reasoning
                </button>
              </div>
            </div>

            {/* Models Scrollable List */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
              {/* Combos section at top if any */}
              {filteredCombos.length > 0 && (
                <div className="p-2.5 rounded-xl border border-cyan-500/20 bg-cyan-950/20 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-cyan-400 font-semibold">
                    <span className="material-symbols-outlined text-[15px]">layers</span>
                    <span>Smart Combos ({filteredCombos.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {filteredCombos.map((combo) => {
                      const isSelected = selectedModels.includes(combo.name);
                      return (
                        <button
                          key={combo.id}
                          type="button"
                          onClick={() => handleToggleCombo(combo)}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-mono font-medium border transition-colors cursor-pointer ${
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

              {filteredModels.length === 0 ? (
                <div className="py-10 text-center text-slate-500 text-xs space-y-2">
                  <span className="material-symbols-outlined text-[26px] text-slate-600 block mx-auto">
                    search_off
                  </span>
                  <p className="max-w-xs mx-auto">
                    {connectedOnly && !hasConnectedAccounts
                      ? "No accounts connected yet. All models are currently hidden by 'Connected Only'."
                      : connectedOnly
                      ? "No models found from connected accounts matching your search/filters."
                      : "No models matched your filter. Try clearing filters or enter a custom model below."}
                  </p>
                  {connectedOnly && (
                    <button
                      type="button"
                      onClick={() => setConnectedOnly(false)}
                      className="px-3 py-1 rounded-lg bg-blue-600/10 border border-blue-500/30 text-blue-400 hover:bg-blue-600/20 text-xs font-medium cursor-pointer transition-colors"
                    >
                      Show All Registry Models
                    </button>
                  )}
                </div>
              ) : (
                filteredModels.map((item) => {
                  const isSelected = selectedModels.includes(item.value) || selectedModel === item.value;
                  const ctxBadge = formatContextLength(item.contextLength);

                  return (
                    <div
                      key={item.value}
                      onClick={() => handleToggleModel(item)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-blue-600/10 border-blue-500/40 text-white"
                          : "bg-[#0A0D14]/70 border-[#1E293B] hover:border-slate-700 text-slate-300"
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-white truncate">
                            {item.name}
                          </span>
                          <span className="px-1.5 py-0.2 rounded bg-[#141B2D] border border-[#1E293B] text-[10px] text-slate-400 shrink-0 font-mono">
                            {item.providerName}
                          </span>
                          {ctxBadge && (
                            <span className="text-[9.5px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700/60 leading-tight">
                              {ctxBadge}
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[11px] text-slate-400 truncate mt-0.5">
                          {item.value}
                        </div>
                        <div className="mt-1">
                          <CapacityBadges caps={item.caps} size="xs" />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleModel(item);
                        }}
                        className={`size-7 rounded-lg flex items-center justify-center shrink-0 border transition-all ${
                          isSelected
                            ? "bg-blue-600 border-blue-500 text-white"
                            : "bg-[#141B2D] border-[#1E293B] text-slate-400 hover:text-white hover:border-slate-600"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          {isSelected ? "check" : "add"}
                        </span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Custom Model Input */}
            <form onSubmit={handleAddCustomModel} className="flex gap-2 pt-1 border-t border-[#1E293B]">
              <input
                type="text"
                placeholder="Or enter custom model ID (e.g. provider/model)..."
                value={customModelInput}
                onChange={(e) => setCustomModelInput(e.target.value)}
                className="flex-1 bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-1.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={!customModelInput.trim()}
                className="px-3 py-1.5 rounded-xl bg-[#141B2D] border border-[#1E293B] hover:border-blue-500/50 hover:bg-blue-600/10 text-xs text-slate-300 hover:text-white disabled:opacity-40 cursor-pointer"
              >
                Add Custom
              </button>
            </form>
          </div>

          {/* Right Column: Selected Models & Drag-and-Drop Sorting (5 cols) */}
          <div className="lg:col-span-5 flex flex-col min-h-0 p-4 space-y-3 bg-[#0A0D14]/40">
            <div className="flex items-center justify-between pb-2 border-b border-[#1E293B]">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-blue-400 text-[18px]">
                  format_list_numbered
                </span>
                <span className="text-xs font-bold text-white">
                  Selected Models ({selectedModels.length})
                </span>
              </div>
              {selectedModels.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedModels([])}
                  className="text-[11px] text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                >
                  Clear all
                </button>
              )}
            </div>

            <p className="text-[11px] text-slate-400 leading-normal">
              Order determines execution priority (1 = primary, 2+ = backup fallbacks). Drag handles to reorder.
            </p>

            {/* Sortable List */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
              {selectedModels.length === 0 ? (
                <div className="py-16 text-center text-slate-500 text-xs border border-dashed border-[#1E293B] rounded-2xl p-4">
                  No models selected yet. Click any model on the left to add it to this priority list.
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={selectedModels} strategy={verticalListSortingStrategy}>
                    <div className="space-y-1.5">
                      {selectedModels.map((modelId, index) => (
                        <SortableModelItem
                          key={modelId}
                          id={modelId}
                          index={index}
                          onRemove={() => handleRemoveModel(modelId)}
                          onMoveUp={() => handleMoveUp(index)}
                          onMoveDown={() => handleMoveDown(index)}
                          isFirst={index === 0}
                          isLast={index === selectedModels.length - 1}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-t border-[#1E293B] bg-[#0A0D14]/60">
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
