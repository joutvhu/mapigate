import React from "react";
import { ToolIcon } from "../ui/ToolIcon.js";
import { Select } from "../Select.js";
import type { ProviderSidebarItem } from "./types.js";

export interface ProviderSidebarProps {
  providers: ProviderSidebarItem[];
  selectedProvider: string;
  onSelectProvider: (providerId: string) => void;
  totalModelCount: number;
  allowCombos: boolean;
  combosCount: number;
  selectedCombosCount: number;
}

export const ProviderSidebar: React.FC<ProviderSidebarProps> = React.memo(
  ({
    providers,
    selectedProvider,
    onSelectProvider,
    totalModelCount,
    allowCombos,
    combosCount,
    selectedCombosCount,
  }) => {
    const isAllActive = selectedProvider === "all";
    const isComboActive = selectedProvider === "combo";

    return (
      <div className="hidden lg:flex lg:flex-col lg:col-span-3 min-h-0 bg-[#080B12]/70 overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-[#1E293B] flex items-center justify-between shrink-0">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Providers ({providers.length})
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
          {/* All Providers Item */}
          <button
            type="button"
            onClick={() => onSelectProvider("all")}
            className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left transition-colors duration-75 cursor-pointer ${
              isAllActive
                ? "bg-blue-600/15 border border-blue-500/40 text-white"
                : "border border-transparent text-slate-300 hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="size-6 rounded-lg bg-[#141B2D] border border-[#1E293B] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[15px] text-blue-400">apps</span>
              </div>
              <span className="text-xs font-semibold truncate">All Providers</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/90 text-slate-400 shrink-0">
              {totalModelCount}
            </span>
          </button>

          {/* Smart Combos Item */}
          {allowCombos && combosCount > 0 && (
            <button
              type="button"
              onClick={() => onSelectProvider("combo")}
              className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left transition-colors duration-75 cursor-pointer ${
                isComboActive
                  ? "bg-cyan-500/15 border border-cyan-500/40 text-cyan-200"
                  : "border border-transparent text-slate-300 hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="size-6 rounded-lg bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[15px] text-cyan-400">
                    layers
                  </span>
                </div>
                <span className="text-xs font-semibold truncate">Smart Combos</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {selectedCombosCount > 0 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/25 text-cyan-300 font-semibold">
                    {selectedCombosCount}
                  </span>
                )}
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/90 text-slate-400">
                  {combosCount}
                </span>
              </div>
            </button>
          )}

          {providers.length > 0 && <div className="my-1.5 border-t border-[#1E293B]/70" />}

          {/* Provider List */}
          {providers.map((p) => {
            const isActive = selectedProvider === p.providerId;
            return (
              <button
                key={p.providerId}
                type="button"
                onClick={() => onSelectProvider(p.providerId)}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-left transition-colors duration-75 cursor-pointer ${
                  isActive
                    ? "bg-blue-600/15 border border-blue-500/40 text-white"
                    : "border border-transparent text-slate-300 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <ToolIcon
                    src={p.image}
                    name={p.providerName}
                    color={p.color}
                    iconBg={p.iconBg}
                    size="sm"
                    className="!size-6 !rounded-lg !p-0.5"
                  />
                  <span className="text-xs font-medium truncate">{p.providerName}</span>
                  {p.isConnected && (
                    <span
                      className="size-1.5 rounded-full bg-emerald-400 shrink-0"
                      title="Account connected"
                    />
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {p.selectedCount > 0 && (
                    <span
                      className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-500/25 text-blue-300 border border-blue-500/35 font-semibold"
                      title={`${p.selectedCount} selected`}
                    >
                      {p.selectedCount}
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-slate-500 min-w-[20px] text-right">
                    {p.modelCount}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }
);
ProviderSidebar.displayName = "ProviderSidebar";

export const MobileProviderSelect: React.FC<ProviderSidebarProps> = React.memo(
  ({
    providers,
    selectedProvider,
    onSelectProvider,
    totalModelCount,
    allowCombos,
    combosCount,
  }) => {
    const options = [
      { value: "all", label: `All Providers (${totalModelCount})` },
      ...(allowCombos && combosCount > 0
        ? [{ value: "combo", label: `Smart Combos (${combosCount})` }]
        : []),
      ...providers.map((p) => ({
        value: p.providerId,
        label: `${p.providerName} (${p.modelCount})${p.selectedCount > 0 ? ` • ${p.selectedCount}✓` : ""}`,
      })),
    ];

    return (
      <div className="lg:hidden shrink-0">
        <Select
          value={selectedProvider}
          onChange={onSelectProvider}
          options={options}
          className="w-full"
        />
      </div>
    );
  }
);
MobileProviderSelect.displayName = "MobileProviderSelect";
