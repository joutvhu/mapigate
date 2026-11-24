import React from "react";
import { ToolIcon } from "../ui/ToolIcon.js";
import { Select } from "../Select.js";
import type { FreeTierGroupMode } from "../../utils/freeTierGrouping.js";
import type { FreeTierRailItem } from "./freeTierModalUtils.js";

export interface FreeTierSidebarProps {
  groupMode: FreeTierGroupMode;
  railItems: FreeTierRailItem[];
  activeScopeId: string;
  onSelectScope: (id: string) => void;
  totalMatchingCount: number;
}

export const FreeTierSidebar: React.FC<FreeTierSidebarProps> = React.memo(
  ({ groupMode, railItems, activeScopeId, onSelectScope, totalMatchingCount }) => {
    const isAllActive = activeScopeId === "all";
    const railTitle =
      groupMode === "provider"
        ? `Free Providers (${railItems.length})`
        : groupMode === "model"
        ? `Model Groups (${railItems.length})`
        : groupMode === "family"
        ? `Model Families (${railItems.length})`
        : `Model Roles (${railItems.length})`;

    return (
      <div className="hidden lg:flex lg:flex-col lg:col-span-3 min-h-0 bg-[#080B12]/70 overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-[#1E293B] flex items-center justify-between shrink-0">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {railTitle}
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
          <button
            type="button"
            onClick={() => onSelectScope("all")}
            className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left transition-colors duration-75 cursor-pointer ${
              isAllActive
                ? "bg-emerald-600/15 border border-emerald-500/40 text-white"
                : "border border-transparent text-slate-300 hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="size-6 rounded-lg bg-[#141B2D] border border-[#1E293B] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[15px] text-emerald-400">
                  savings
                </span>
              </div>
              <span className="text-xs font-semibold truncate">
                {groupMode === "provider" ? "All Free Models" : "All Groups"}
              </span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/90 text-slate-400 shrink-0">
              {totalMatchingCount}
            </span>
          </button>

          {railItems.length > 0 && <div className="my-1.5 border-t border-[#1E293B]/70" />}

          {railItems.map((item) => {
            const isActive = activeScopeId === item.id;
            const statusDotClass =
              item.connectionStatus === "connected"
                ? "bg-emerald-400"
                : item.connectionStatus === "not_connected"
                ? "bg-amber-400"
                : item.connectionStatus
                ? "bg-rose-400"
                : null;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectScope(item.id)}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-left transition-colors duration-75 cursor-pointer ${
                  isActive
                    ? "bg-emerald-600/15 border border-emerald-500/40 text-white"
                    : "border border-transparent text-slate-300 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {groupMode === "provider" ? (
                    <ToolIcon
                      src={item.image}
                      name={item.name}
                      color={item.color}
                      iconBg={item.iconBg}
                      size="sm"
                      className="!size-6 !rounded-lg !p-0.5"
                    />
                  ) : (
                    <div className="size-6 rounded-lg bg-[#141B2D] border border-[#1E293B] flex items-center justify-center shrink-0 text-[10px] font-mono font-bold text-purple-300">
                      {item.uniqueProvidersCount ?? 1}P
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-medium truncate">{item.name}</span>
                      {statusDotClass && (
                        <span
                          className={`size-1.5 rounded-full shrink-0 ${statusDotClass}`}
                          title={item.subLabel}
                        />
                      )}
                    </div>
                    {groupMode !== "provider" && (item.connectedProvidersCount ?? 0) > 0 && (
                      <span className="text-[9.5px] text-emerald-400 block leading-tight">
                        {item.connectedProvidersCount} connected
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {item.selectedCount > 0 && (
                    <span
                      className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/25 text-emerald-300 border border-emerald-500/35 font-semibold"
                      title={`${item.selectedCount} selected`}
                    >
                      {item.selectedCount}
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-slate-500 min-w-[20px] text-right">
                    {item.totalCount}
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
FreeTierSidebar.displayName = "FreeTierSidebar";

export const MobileFreeTierScopeSelect: React.FC<FreeTierSidebarProps> = React.memo(
  ({ groupMode, railItems, activeScopeId, onSelectScope, totalMatchingCount }) => {
    const options = [
      {
        value: "all",
        label:
          groupMode === "provider"
            ? `All Free Models (${totalMatchingCount})`
            : `All Groups (${totalMatchingCount})`,
      },
      ...railItems.map((item) => ({
        value: item.id,
        label: `${item.name} (${item.totalCount})${item.selectedCount > 0 ? ` • ${item.selectedCount}✓` : ""}`,
      })),
    ];

    return (
      <div className="lg:hidden shrink-0">
        <Select
          value={activeScopeId}
          onChange={onSelectScope}
          options={options}
          className="w-full"
        />
      </div>
    );
  }
);
MobileFreeTierScopeSelect.displayName = "MobileFreeTierScopeSelect";
