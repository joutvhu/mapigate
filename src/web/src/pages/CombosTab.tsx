import React, { useState, useEffect } from "react";
import { DEFAULT_SEED_COMBOS, type ComboItem } from "../constants/mockData";

export const CombosTab: React.FC = () => {
  const [combos, setCombos] = useState<ComboItem[]>(DEFAULT_SEED_COMBOS);
  const [visionEnabled, setVisionEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newComboName, setNewComboName] = useState("");
  const [newModelsText, setNewModelsText] = useState("");
  const [strategyChoice, setStrategyChoice] = useState<"round-robin" | "fallback" | "fusion">("round-robin");

  const loadCombos = async () => {
    try {
      const res = await fetch("/api/combos");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setCombos(data);
        }
      }
    } catch {
      // Offline fallback
    }
  };

  useEffect(() => {
    loadCombos();
  }, []);

  const handleCreate = async () => {
    if (!newComboName) return;
    const modelList = newModelsText.split(",").map((s) => s.trim()).filter(Boolean);

    try {
      const res = await fetch("/api/combos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newComboName.trim(),
          models: modelList.length > 0 ? modelList : ["default-model"],
          strategy: strategyChoice,
        }),
      });

      if (res.ok) {
        await loadCombos();
      } else {
        setCombos([
          ...combos,
          {
            id: newComboName.toLowerCase().replace(/\s+/g, "-"),
            name: newComboName,
            models: modelList.length > 0 ? modelList : ["default-model"],
            strategy: strategyChoice,
          },
        ]);
      }
    } catch {
      // Fallback
    } finally {
      setNewComboName("");
      setNewModelsText("");
      setShowCreateModal(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/combos/${id}`, { method: "DELETE" });
    } catch {
      //
    }
    setCombos(combos.filter((c) => c.id !== id));
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16 animate-rt-fade-in">
      {/* Header Description & Create Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-2xl bg-[#0F1420]/70 border border-[#1E293B]">
        <div className="text-xs text-slate-400 max-w-2xl leading-relaxed space-y-1">
          <p className="font-semibold text-slate-200">
            Group models under a single alias to eliminate rate limits and distribute load:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
            <div className="p-2 rounded-lg bg-[#0A0D14] border border-[#1E293B]">
              <span className="text-blue-400 font-bold block">Fallback</span>
              Tries models in order; moves next on 429/quota error.
            </div>
            <div className="p-2 rounded-lg bg-[#0A0D14] border border-[#1E293B]">
              <span className="text-cyan-400 font-bold block">Round Robin</span>
              Spreads requests evenly across model accounts.
            </div>
            <div className="p-2 rounded-lg bg-[#0A0D14] border border-[#1E293B]">
              <span className="text-indigo-400 font-bold block">Fusion</span>
              Parallel queries merged by a judge model.
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="rt-btn rt-btn--primary shrink-0"
        >
          <span className="material-symbols-outlined text-[16px]">add_circle</span>
          Create Combo
        </button>
      </div>

      {/* Combos List */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1 text-xs text-slate-400">
          <span className="material-symbols-outlined text-blue-400 text-[18px]">layers</span>
          <span className="font-semibold text-white">Configured Combos ({combos.length})</span>
        </div>

        <div className="space-y-2.5">
          {combos.map((combo, idx) => (
            <div
              key={combo.id}
              className="rt-card stagger-item flex flex-wrap items-center justify-between gap-4 py-3.5 px-5"
              style={{ animationDelay: `${idx * 40}ms` }}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="size-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20">
                  <span className="material-symbols-outlined text-[18px]">shuffle</span>
                </div>
                <div>
                  <span className="text-xs font-bold text-white font-mono block">
                    {combo.name}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    {combo.models.map((m, mIdx) => (
                      <span
                        key={mIdx}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#0A0D14] border border-[#1E293B] text-[10.5px] text-slate-300 font-mono"
                      >
                        <span className="size-1.5 rounded-full bg-blue-400" />
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Strategy selector & action buttons */}
              <div className="flex items-center gap-3 shrink-0">
                <select
                  value={combo.strategy}
                  onChange={(e) => {
                    const strat = e.target.value as any;
                    setCombos(combos.map((c) => (c.id === combo.id ? { ...c, strategy: strat } : c)));
                  }}
                  className="bg-[#0A0D14] border border-[#1E293B] text-xs text-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                >
                  <option value="round-robin">Round Robin — rotate</option>
                  <option value="fallback">Fallback — try in order</option>
                  <option value="fusion">Fusion — panel + judge</option>
                </select>

                <div className="flex items-center gap-1 text-slate-400">
                  <button
                    title="Copy combo identifier"
                    onClick={() => navigator.clipboard.writeText(combo.name)}
                    className="p-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">content_copy</span>
                  </button>
                  <button
                    title="Delete combo"
                    onClick={() => handleDelete(combo.id)}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-400 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 2: Vision Adapter */}
      <div className="space-y-4 pt-4 border-t border-[#1E293B]">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-cyan-400 text-[18px]">visibility</span>
            Vision & Multimodal Adapter
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            When your requested model lacks vision/audio capabilities, Routen auto-reroutes requests to designated multimodal models:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* Vision card */}
          <div className="rt-card p-4.5 flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-blue-400 text-[20px]">image</span>
                <div>
                  <h4 className="text-xs font-bold text-white">Vision Support</h4>
                  <p className="text-[11px] text-slate-400">images (png, jpg, webp, base64)</p>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={visionEnabled}
                  onChange={(e) => setVisionEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5.5 bg-[#1E293B] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-blue-600" />
              </label>
            </div>

            <div className="text-[11px] text-slate-400 bg-[#0A0D14] p-3 rounded-xl border border-[#1E293B] flex items-center justify-between">
              <span className="font-mono text-emerald-400">Pool: oc/mimo-v2.6-flash-free</span>
              <span className="text-[10px] text-slate-500">Auto fallback</span>
            </div>
          </div>

          {/* Audio card */}
          <div className="rt-card p-4.5 flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-cyan-400 text-[20px]">graphic_eq</span>
                <div>
                  <h4 className="text-xs font-bold text-white">Audio Processing</h4>
                  <p className="text-[11px] text-slate-400">raw voice and speech inputs</p>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={audioEnabled}
                  onChange={(e) => setAudioEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5.5 bg-[#1E293B] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-blue-600" />
              </label>
            </div>

            <div className="text-[11px] text-slate-400 bg-[#0A0D14] p-3 rounded-xl border border-[#1E293B] flex items-center justify-between">
              <span className="font-mono text-cyan-400">Pool: oc/mimo-v2.6-flash-free</span>
              <span className="text-[10px] text-slate-500">Auto fallback</span>
            </div>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="rt-modal-backdrop">
          <div className="rt-modal-content space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400 text-[18px]">add_circle</span>
                Create Smart Model Combo
              </h4>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Combo Name / Alias
                </label>
                <input
                  type="text"
                  placeholder="e.g. combo-fast-coding"
                  value={newComboName}
                  onChange={(e) => setNewComboName(e.target.value)}
                  className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Models (comma-separated list)
                </label>
                <input
                  type="text"
                  placeholder="deepseek-chat, gpt-4o-mini, claude-3-5-haiku"
                  value={newModelsText}
                  onChange={(e) => setNewModelsText(e.target.value)}
                  className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Routing Strategy
                </label>
                <select
                  value={strategyChoice}
                  onChange={(e) => setStrategyChoice(e.target.value as any)}
                  className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="round-robin">Round Robin — Rotate across accounts</option>
                  <option value="fallback">Fallback — Sequential priority order</option>
                  <option value="fusion">Fusion — Parallel query panel</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#1E293B]">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button onClick={handleCreate} className="rt-btn rt-btn--primary">
                Save Combo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
