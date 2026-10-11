import React, { useState, useEffect, useCallback } from "react";
import { ComboFormModal, type ComboItem } from "../components/ComboFormModal.js";
import { ModelSelectModal } from "../components/ModelSelectModal.js";
import { ConfirmModal } from "../components/ConfirmModal.js";
import { CapacityBadges } from "../components/CapacityBadges.js";
import { Select } from "../components/Select.js";
import { aggregateComboCapabilities } from "../../../core/capabilities/index.js";

export interface CapacityAdapterEntry {
  enabled: boolean;
  roundRobin: boolean;
  models: string[];
}

export interface CapacityAdapterSettings {
  vision: CapacityAdapterEntry;
  audioInput: CapacityAdapterEntry;
  pdf?: CapacityAdapterEntry;
  videoInput?: CapacityAdapterEntry;
}

const DEFAULT_CAPACITY_ADAPTER: CapacityAdapterSettings = {
  vision: {
    enabled: true,
    roundRobin: false,
    models: [],
  },
  audioInput: {
    enabled: true,
    roundRobin: false,
    models: [],
  },
};

export const CombosTab: React.FC = () => {
  const [combos, setCombos] = useState<ComboItem[]>([]);
  const [loadingCombos, setLoadingCombos] = useState(true);
  const [capacityAdapter, setCapacityAdapter] = useState<CapacityAdapterSettings>(
    DEFAULT_CAPACITY_ADAPTER
  );
  const [savingAdapter, setSavingAdapter] = useState(false);
  const [presetLoading, setPresetLoading] = useState<"cursor" | "claude" | null>(null);
  const [copiedComboId, setCopiedComboId] = useState<string | null>(null);

  // Modals state
  const [showComboModal, setShowComboModal] = useState(false);
  const [editingCombo, setEditingCombo] = useState<ComboItem | null>(null);
  const [adapterModalKey, setAdapterModalKey] = useState<"vision" | "audioInput" | null>(null);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    variant?: "danger" | "primary" | "emerald";
  } | null>(null);

  // 1. Fetch Combos from SQLite API
  const loadCombos = useCallback(async () => {
    try {
      setLoadingCombos(true);
      const res = await fetch("/api/combos");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setCombos(data);
        }
      }
    } catch (err) {
      console.error("Failed to load combos:", err);
    } finally {
      setLoadingCombos(false);
    }
  }, []);

  // 2. Fetch Capacity Adapter Settings from SQLite API
  const loadCapacityAdapter = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/capacity-adapter");
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === "object") {
          setCapacityAdapter({
            vision: data.vision || {
              enabled: true,
              roundRobin: false,
              models: ["oc/mimo-v2.6-flash-free"],
            },
            audioInput: data.audioInput || {
              enabled: true,
              roundRobin: false,
              models: ["oc/mimo-v2.6-flash-free"],
            },
            pdf: data.pdf,
            videoInput: data.videoInput,
          });
        }
      }
    } catch (err) {
      console.error("Failed to load capacity adapter settings:", err);
    }
  }, []);

  useEffect(() => {
    loadCombos();
    loadCapacityAdapter();
  }, [loadCombos, loadCapacityAdapter]);

  // 3. Persist Capacity Adapter Settings
  const persistCapacityAdapter = async (updated: CapacityAdapterSettings) => {
    setCapacityAdapter(updated);
    try {
      setSavingAdapter(true);
      await fetch("/api/settings/capacity-adapter", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
    } catch (err) {
      console.error("Failed to save capacity adapter settings:", err);
    } finally {
      setSavingAdapter(false);
    }
  };

  const handleToggleModalityEnabled = (modality: "vision" | "audioInput") => {
    const current = capacityAdapter[modality];
    persistCapacityAdapter({
      ...capacityAdapter,
      [modality]: {
        ...current,
        enabled: !current.enabled,
      },
    });
  };

  const handleChangeModalityStrategy = (
    modality: "vision" | "audioInput",
    roundRobin: boolean
  ) => {
    const current = capacityAdapter[modality];
    persistCapacityAdapter({
      ...capacityAdapter,
      [modality]: {
        ...current,
        roundRobin,
      },
    });
  };

  const handleRemoveAdapterModel = (modality: "vision" | "audioInput", modelToRemove: string) => {
    const current = capacityAdapter[modality];
    persistCapacityAdapter({
      ...capacityAdapter,
      [modality]: {
        ...current,
        models: current.models.filter((m) => m !== modelToRemove),
      },
    });
  };

  const handleConfirmAdapterModels = (newModels: string[]) => {
    if (!adapterModalKey) return;
    const current = capacityAdapter[adapterModalKey];
    persistCapacityAdapter({
      ...capacityAdapter,
      [adapterModalKey]: {
        ...current,
        models: newModels,
      },
    });
    setAdapterModalKey(null);
  };

  // 4. Save/Update Combo
  const handleSaveCombo = async (item: {
    id?: string;
    name: string;
    models: string[];
    strategy: "round-robin" | "fallback" | "fusion";
    isActive?: boolean;
  }) => {
    if (item.id) {
      const res = await fetch(`/api/combos/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: item.name,
          models: item.models,
          strategy: item.strategy,
          isActive: item.isActive,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update combo");
      }
    } else {
      const res = await fetch("/api/combos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: item.name,
          models: item.models,
          strategy: item.strategy,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create combo");
      }
    }
    await loadCombos();
    setShowComboModal(false);
    setEditingCombo(null);
  };

  // 5. Toggle Combo Active
  const handleToggleComboActive = async (combo: ComboItem) => {
    try {
      const res = await fetch(`/api/combos/${combo.id}/toggle`, { method: "POST" });
      if (res.ok) {
        const updated = await res.json();
        setCombos((prev) => prev.map((c) => (c.id === combo.id ? updated : c)));
      }
    } catch (err) {
      console.error("Error toggling combo status:", err);
    }
  };

  // 6. Change Combo Strategy
  const handleChangeComboStrategy = async (
    combo: ComboItem,
    strategy: "round-robin" | "fallback" | "fusion"
  ) => {
    try {
      const res = await fetch(`/api/combos/${combo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy }),
      });
      if (res.ok) {
        const updated = await res.json();
        setCombos((prev) => prev.map((c) => (c.id === combo.id ? updated : c)));
      }
    } catch (err) {
      console.error("Error updating strategy:", err);
    }
  };

  // 7. Delete Combo
  const handleDeleteCombo = (combo: ComboItem) => {
    setConfirmState({
      title: "Delete Combo",
      message: `Are you sure you want to delete combo "${combo.name}"? This action cannot be undone.`,
      confirmText: "Delete Combo",
      variant: "danger",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/combos/${combo.id}`, { method: "DELETE" });
          if (res.ok) {
            setCombos((prev) => prev.filter((c) => c.id !== combo.id));
          }
        } catch (err) {
          console.error("Error deleting combo:", err);
        } finally {
          setConfirmState(null);
        }
      },
    });
  };

  // 8. Preset Generator (Cursor Default / Claude Default)
  const handleGeneratePresets = async (source: "cursor" | "claude") => {
    const label = source === "cursor" ? "Cursor Default" : "Claude Default";
    setPresetLoading(source);
    try {
      const res = await fetch(`/api/combos/presets?source=${source}`);
      const preview = await res.json();
      if (!res.ok) {
        alert(preview.error || `Failed to preview ${label} presets`);
        return;
      }

      const toCreate = preview.toCreate ?? (preview.items || []).filter((i: any) => !i.exists).length;
      const toSkip = preview.toSkip ?? (preview.items || []).filter((i: any) => i.exists).length;
      const total = (preview.items || []).length;

      if (total === 0) {
        alert(`No ${label} preset models available to generate.`);
        return;
      }

      if (toCreate === 0) {
        setConfirmState({
          title: `${label} Presets Ready`,
          message: `All ${total} ${label} combos already exist in your database. Nothing new to create.`,
          confirmText: "OK",
          onConfirm: () => setConfirmState(null),
        });
        return;
      }

      setConfirmState({
        title: `Generate ${label} Presets`,
        message: `Create ${toCreate} missing combo${
          toCreate === 1 ? "" : "s"
        } for ${label}? (${toSkip} already exist and will be untouched).`,
        confirmText: `Create (${toCreate})`,
        variant: "primary",
        onConfirm: async () => {
          try {
            const createRes = await fetch("/api/combos/presets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ source }),
            });
            if (createRes.ok) {
              await loadCombos();
            }
          } catch (err) {
            console.error("Error generating presets:", err);
          } finally {
            setConfirmState(null);
          }
        },
      });
    } catch (err) {
      console.error("Error previewing presets:", err);
    } finally {
      setPresetLoading(null);
    }
  };

  const handleCopyCombo = (name: string, id: string) => {
    navigator.clipboard.writeText(name);
    setCopiedComboId(id);
    setTimeout(() => setCopiedComboId(null), 2000);
  };

  return (
    <div className="space-y-8 w-full px-2 sm:px-4 pb-16 animate-rt-fade-in">
      {/* SECTION 1: Header, Strategies Description & Action Buttons */}
      <div className="w-full p-5 rounded-2xl bg-[#0F1420]/80 border border-[#1E293B] flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5">
        <div className="text-xs text-slate-400 leading-relaxed space-y-2 flex-1">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-400 text-[20px]">
              hub
            </span>
            <span className="font-bold text-sm text-slate-100">
              Smart Model Combos & Routing Strategies
            </span>
          </div>
          <p className="text-slate-300">
            Group multiple models and provider accounts under a single unified alias. Mapigate automatically manages fallbacks, load balances requests, or fuses multiple outputs together.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1 text-[11px]">
            <div className="p-3 rounded-xl bg-[#0A0D14] border border-[#1E293B] space-y-1">
              <span className="text-blue-400 font-bold flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">low_priority</span>
                Fallback Strategy
              </span>
              <p className="text-slate-400">
                Tries models in order; moves to backup on 429, 503, or quota limits.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-[#0A0D14] border border-[#1E293B] space-y-1">
              <span className="text-cyan-400 font-bold flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">sync</span>
                Round Robin Strategy
              </span>
              <p className="text-slate-400">
                Spreads requests sequentially across accounts to maximize throughput.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-[#0A0D14] border border-[#1E293B] space-y-1">
              <span className="text-indigo-400 font-bold flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">call_split</span>
                Fusion Strategy
              </span>
              <p className="text-slate-400">
                Queries models in parallel and synthesizes the best answer with a judge.
              </p>
            </div>
          </div>
        </div>

        {/* Buttons: Preset Generators + Create Combo */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start xl:self-center">
          <button
            type="button"
            onClick={() => handleGeneratePresets("cursor")}
            disabled={presetLoading !== null}
            className="px-3.5 py-2 rounded-xl bg-[#141B2D] border border-[#1E293B] hover:border-slate-600 text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            title="Generate standard Cursor Default combos"
          >
            {presetLoading === "cursor" ? (
              <span className="material-symbols-outlined text-[16px] animate-spin">
                progress_activity
              </span>
            ) : (
              <span className="material-symbols-outlined text-[16px] text-purple-400">
                auto_mode
              </span>
            )}
            Cursor Default
          </button>

          <button
            type="button"
            onClick={() => handleGeneratePresets("claude")}
            disabled={presetLoading !== null}
            className="px-3.5 py-2 rounded-xl bg-[#141B2D] border border-[#1E293B] hover:border-slate-600 text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            title="Generate standard Claude Default combos"
          >
            {presetLoading === "claude" ? (
              <span className="material-symbols-outlined text-[16px] animate-spin">
                progress_activity
              </span>
            ) : (
              <span className="material-symbols-outlined text-[16px] text-amber-400">
                smart_toy
              </span>
            )}
            Claude Default
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingCombo(null);
              setShowComboModal(true);
            }}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/20 text-xs font-semibold text-white flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">add_circle</span>
            Create Combo
          </button>
        </div>
      </div>

      {/* SECTION 2: Configured Combos List */}
      <div className="w-full space-y-3.5">
        <div className="flex items-center justify-between px-1 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-400 text-[18px]">
              layers
            </span>
            <span className="font-bold text-white text-sm">
              Configured Combos ({combos.length})
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            Backed directly by SQLite database
          </span>
        </div>

        {loadingCombos ? (
          <div className="w-full py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3 bg-[#0F1420]/40 rounded-2xl border border-[#1E293B]">
            <span className="material-symbols-outlined text-3xl text-blue-400 animate-spin">
              progress_activity
            </span>
            <span className="text-xs">Loading combos from database...</span>
          </div>
        ) : combos.length === 0 ? (
          <div className="w-full py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3 bg-[#0F1420]/40 rounded-2xl border border-[#1E293B]">
            <span className="material-symbols-outlined text-3xl text-slate-600">
              layers_clear
            </span>
            <p className="text-sm font-semibold text-slate-300">
              No combos configured in SQLite database yet
            </p>
            <p className="text-xs text-slate-500 max-w-md">
              Click &ldquo;Create Combo&rdquo; to build your first alias, or click &ldquo;Claude Default&rdquo; / &ldquo;Cursor Default&rdquo; above to quickly generate presets.
            </p>
          </div>
        ) : (
          <div className="w-full space-y-2.5">
            {combos.map((combo, idx) => {
              const comboCaps = aggregateComboCapabilities(combo.models);
              const isActive = combo.isActive !== false;

              return (
                <div
                  key={combo.id}
                  className={`w-full flex flex-wrap items-center justify-between gap-4 py-3.5 px-5 rounded-2xl border transition-all ${
                    isActive
                      ? "bg-[#0F1420]/80 border-[#1E293B] hover:border-slate-700"
                      : "bg-[#0A0D14]/50 border-[#1E293B]/50 opacity-60"
                  }`}
                  style={{ animationDelay: `${idx * 30}ms` }}
                >
                  {/* Left: Combo Icon, Name, Badges, Models List */}
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                    <div
                      className={`size-9 rounded-xl flex items-center justify-center shrink-0 border ${
                        combo.strategy === "fallback"
                          ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                          : combo.strategy === "round-robin"
                          ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                          : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {combo.strategy === "fallback"
                          ? "low_priority"
                          : combo.strategy === "round-robin"
                          ? "sync"
                          : "call_split"}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-white font-mono">
                          {combo.name}
                        </span>

                        {/* Modality capability badges */}
                        {comboCaps && (
                          <CapacityBadges caps={comboCaps} size="xs" />
                        )}

                        {!isActive && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] uppercase font-bold">
                            Disabled
                          </span>
                        )}
                      </div>

                      {/* Models chips */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        {combo.models.map((m, mIdx) => (
                          <span
                            key={mIdx}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-[#0A0D14] border border-[#1E293B] text-[11px] text-slate-300 font-mono"
                          >
                            <span className="text-[10px] text-blue-400 font-bold">
                              {mIdx + 1}
                            </span>
                            <span>{m}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right: Strategy selector, Active Toggle, Actions */}
                  <div className="flex items-center gap-2.5 shrink-0">
                    {/* Strategy Selector Dropdown */}
                    <Select
                      value={combo.strategy}
                      onChange={(val) =>
                        handleChangeComboStrategy(
                          combo,
                          val as "round-robin" | "fallback" | "fusion"
                        )
                      }
                      options={[
                        { value: "round-robin", label: "Round Robin (rotate)" },
                        { value: "fallback", label: "Fallback (try in order)" },
                        { value: "fusion", label: "Fusion (parallel panel)" },
                      ]}
                      className="min-w-[180px]"
                    />

                    {/* Active Toggle Switch */}
                    <label
                      className="relative inline-flex items-center cursor-pointer"
                      title={isActive ? "Disable combo" : "Enable combo"}
                    >
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={() => handleToggleComboActive(combo)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[#1E293B] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                    </label>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 text-slate-400 border-l border-[#1E293B] pl-2">
                      <button
                        type="button"
                        title={
                          copiedComboId === combo.id
                            ? "Copied to clipboard!"
                            : "Copy combo identifier"
                        }
                        onClick={() => handleCopyCombo(combo.name, combo.id)}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          copiedComboId === combo.id
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          {copiedComboId === combo.id ? "check" : "content_copy"}
                        </span>
                      </button>

                      <button
                        type="button"
                        title="Edit combo"
                        onClick={() => {
                          setEditingCombo(combo);
                          setShowComboModal(true);
                        }}
                        className="p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                      </button>

                      <button
                        type="button"
                        title="Delete combo"
                        onClick={() => handleDeleteCombo(combo)}
                        className="p-1.5 rounded-lg hover:bg-rose-500/10 hover:text-rose-400 transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 3: Capacity Adapter UI Controls (Vision & Audio) */}
      <div className="w-full space-y-4 pt-6 border-t border-[#1E293B]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-cyan-400 text-[20px]">
                visibility
              </span>
              Multimodal Capacity Adapter
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              When client coding tools send image or audio prompts to models lacking those modalities, Mapigate seamlessly elevates designated adapter models to priority #1.
            </p>
          </div>
          {savingAdapter && (
            <span className="text-[11px] text-blue-400 flex items-center gap-1 font-mono">
              <span className="material-symbols-outlined text-[14px] animate-spin">
                progress_activity
              </span>
              Syncing settings...
            </span>
          )}
        </div>

        {/* 2 Full-width Cards: Vision & Audio */}
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1: Vision Support */}
          <div className="w-full p-5 rounded-2xl bg-[#0F1420]/80 border border-[#1E293B] flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[20px]">
                      image
                    </span>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      Vision Input Adapter
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                        Images & Screenshots
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Auto-reroutes image payloads (png, jpg, webp, base64)
                    </p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={capacityAdapter.vision.enabled}
                    onChange={() => handleToggleModalityEnabled("vision")}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5.5 bg-[#1E293B] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-cyan-600" />
                </label>
              </div>

              {/* Strategy selector */}
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-slate-400">Adapter Pool Strategy:</span>
                <Select
                  value={capacityAdapter.vision.roundRobin ? "round-robin" : "fallback"}
                  onChange={(val) =>
                    handleChangeModalityStrategy("vision", val === "round-robin")
                  }
                  options={[
                    { value: "fallback", label: "Fallback (try in order)" },
                    { value: "round-robin", label: "Round Robin (rotate)" },
                  ]}
                  className="min-w-[170px]"
                />
              </div>
            </div>

            {/* Models Pool Chip List */}
            <div className="space-y-2 pt-2 border-t border-[#1E293B]">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-semibold">
                  Vision Model Pool ({capacityAdapter.vision.models.length})
                </span>
                <button
                  type="button"
                  onClick={() => setAdapterModalKey("vision")}
                  className="px-2.5 py-1 rounded-lg bg-cyan-600/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-600/20 font-medium flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[13px]">add</span>
                  Manage Models
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 min-h-[38px] p-2 rounded-xl bg-[#0A0D14] border border-[#1E293B]">
                {capacityAdapter.vision.models.length === 0 ? (
                  <span className="text-[11px] text-slate-500 italic">
                    No models in vision pool. Click Manage Models to add.
                  </span>
                ) : (
                  capacityAdapter.vision.models.map((m) => (
                    <span
                      key={m}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-[#141B2D] border border-cyan-500/20 text-[11px] text-cyan-300 font-mono"
                    >
                      <span className="size-1.5 rounded-full bg-cyan-400" />
                      <span>{m}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAdapterModel("vision", m)}
                        className="text-slate-500 hover:text-rose-400 cursor-pointer ml-0.5"
                        title="Remove model from pool"
                      >
                        <span className="material-symbols-outlined text-[13px]">close</span>
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Card 2: Audio Processing */}
          <div className="w-full p-5 rounded-2xl bg-[#0F1420]/80 border border-[#1E293B] flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[20px]">
                      graphic_eq
                    </span>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      Audio Input Adapter
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        Speech & Voice
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Auto-reroutes speech and audio inputs to audio-capable models
                    </p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={capacityAdapter.audioInput.enabled}
                    onChange={() => handleToggleModalityEnabled("audioInput")}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5.5 bg-[#1E293B] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-purple-600" />
                </label>
              </div>

              {/* Strategy selector */}
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-slate-400">Adapter Pool Strategy:</span>
                <Select
                  value={capacityAdapter.audioInput.roundRobin ? "round-robin" : "fallback"}
                  onChange={(val) =>
                    handleChangeModalityStrategy("audioInput", val === "round-robin")
                  }
                  options={[
                    { value: "fallback", label: "Fallback (try in order)" },
                    { value: "round-robin", label: "Round Robin (rotate)" },
                  ]}
                  className="min-w-[170px]"
                />
              </div>
            </div>

            {/* Models Pool Chip List */}
            <div className="space-y-2 pt-2 border-t border-[#1E293B]">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-semibold">
                  Audio Model Pool ({capacityAdapter.audioInput.models.length})
                </span>
                <button
                  type="button"
                  onClick={() => setAdapterModalKey("audioInput")}
                  className="px-2.5 py-1 rounded-lg bg-purple-600/10 border border-purple-500/30 text-purple-400 hover:bg-purple-600/20 font-medium flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[13px]">add</span>
                  Manage Models
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 min-h-[38px] p-2 rounded-xl bg-[#0A0D14] border border-[#1E293B]">
                {capacityAdapter.audioInput.models.length === 0 ? (
                  <span className="text-[11px] text-slate-500 italic">
                    No models in audio pool. Click Manage Models to add.
                  </span>
                ) : (
                  capacityAdapter.audioInput.models.map((m) => (
                    <span
                      key={m}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-[#141B2D] border border-purple-500/20 text-[11px] text-purple-300 font-mono"
                    >
                      <span className="size-1.5 rounded-full bg-purple-400" />
                      <span>{m}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAdapterModel("audioInput", m)}
                        className="text-slate-500 hover:text-rose-400 cursor-pointer ml-0.5"
                        title="Remove model from pool"
                      >
                        <span className="material-symbols-outlined text-[13px]">close</span>
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Combo Create/Edit Modal */}
      <ComboFormModal
        isOpen={showComboModal}
        onClose={() => {
          setShowComboModal(false);
          setEditingCombo(null);
        }}
        combo={editingCombo}
        onSave={handleSaveCombo}
      />

      {/* Capacity Adapter Model Picker Modal */}
      {adapterModalKey && (
        <ModelSelectModal
          isOpen={adapterModalKey !== null}
          onClose={() => setAdapterModalKey(null)}
          title={`Configure ${
            adapterModalKey === "vision" ? "Vision" : "Audio"
          } Adapter Model Pool`}
          initialSelectedModels={capacityAdapter[adapterModalKey].models}
          onConfirm={handleConfirmAdapterModels}
          filterModality={adapterModalKey === "vision" ? "vision" : "audio"}
          multiSelect={true}
        />
      )}

      {/* Confirmation Modal */}
      {confirmState && (
        <ConfirmModal
          isOpen={confirmState !== null}
          title={confirmState.title}
          message={confirmState.message}
          confirmText={confirmState.confirmText || "Confirm"}
          variant={confirmState.variant || "primary"}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
};
