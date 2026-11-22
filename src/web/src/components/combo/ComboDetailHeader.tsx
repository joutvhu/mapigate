import React, { useState } from "react";
import type { ComboItem } from "../ComboFormModal.js";
import { Select } from "../Select.js";
import { CapacityBadges } from "../CapacityBadges.js";
import { aggregateComboCapabilities } from "../../../../core/capabilities/index.js";

export interface ComboDetailHeaderProps {
  combo: ComboItem;
  providersCount: number;
  saving: boolean;
  onBack: () => void;
  onUpdateStrategy: (strategy: "round-robin" | "fallback" | "fusion" | "lkgp" | "p2c") => void;
  onToggleActive: () => void;
  onDeleteRequest: () => void;
}

export const ComboDetailHeader: React.FC<ComboDetailHeaderProps> = ({
  combo,
  providersCount,
  saving,
  onBack,
  onUpdateStrategy,
  onToggleActive,
  onDeleteRequest,
}) => {
  const [copied, setCopied] = useState(false);
  const comboCaps = aggregateComboCapabilities(combo.models);
  const isActive = combo.isActive !== false;

  const handleCopy = () => {
    navigator.clipboard.writeText(combo.name);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full p-5 rounded-2xl bg-[#0F1420]/80 border border-[#1E293B] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Back button, Name, Badges, Metrics */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl bg-[#0A0D14] border border-[#1E293B] text-slate-400 hover:text-white hover:border-slate-700 transition-colors cursor-pointer shrink-0"
            title="Back to Combos"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-base font-bold text-white tracking-tight truncate">
                {combo.name}
              </span>
              {comboCaps && <CapacityBadges caps={comboCaps} size="xs" />}
              {!isActive && (
                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] uppercase font-bold">
                  Disabled
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
              <span>
                <strong className="text-white">{combo.models.length}</strong> models configured
              </span>
              <span>•</span>
              <span>
                <strong className="text-cyan-400">{providersCount}</strong> providers
              </span>
              {saving && (
                <>
                  <span>•</span>
                  <span className="text-blue-400 font-mono text-[11px] flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px] animate-spin">
                      progress_activity
                    </span>
                    Saving...
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Copy Alias, Strategy Selector, Active Switch, Delete Button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              copied
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-[#0A0D14] text-slate-300 border-[#1E293B] hover:text-white hover:border-slate-700"
            }`}
            title="Copy combo alias"
          >
            <span className="material-symbols-outlined text-[16px]">
              {copied ? "check" : "content_copy"}
            </span>
            <span>{copied ? "Copied" : "Copy Alias"}</span>
          </button>

          <Select
            value={combo.strategy}
            onChange={(val) =>
              onUpdateStrategy(val as "round-robin" | "fallback" | "fusion" | "lkgp" | "p2c")
            }
            options={[
              { value: "fallback", label: "Fallback (in order)" },
              { value: "round-robin", label: "Round Robin" },
              { value: "fusion", label: "Fusion (parallel)" },
              { value: "lkgp", label: "LKGP (prompt cache)" },
              { value: "p2c", label: "P2C (two choices)" },
            ]}
            className="min-w-[170px]"
          />

          <label
            className="relative inline-flex items-center cursor-pointer ml-1"
            title={isActive ? "Disable combo" : "Enable combo"}
          >
            <input
              type="checkbox"
              checked={isActive}
              onChange={onToggleActive}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-[#1E293B] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
          </label>

          <button
            type="button"
            onClick={onDeleteRequest}
            className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer"
            title="Delete Combo"
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      </div>
    </div>
  );
};
