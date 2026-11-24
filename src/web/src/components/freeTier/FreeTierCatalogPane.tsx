import React, { useCallback } from "react";
import { ToolIcon } from "../ui/ToolIcon.js";
import { VirtualModelList } from "../modelSelect/VirtualModelList.js";
import { FreeTierModelRow } from "./FreeTierModelRow.js";
import { MobileFreeTierScopeSelect } from "./FreeTierSidebar.js";
import type { FreeTierGroup, FreeTierGroupMode } from "../../utils/freeTierGrouping.js";
import type { FreeTierProviderData } from "../../utils/freeTierHelper.js";
import type { FreeTierCandidateItem, FreeTierRailItem } from "./freeTierModalUtils.js";

const ROW_HEIGHT = 66;

const LIMIT_TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  local: { label: "Local Engine", cls: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  credits: { label: "Free Credits", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  "per-model": { label: "Per-Model Limits", cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  requests: { label: "Free Requests", cls: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
};

export interface FreeTierCatalogPaneProps {
  groupMode: FreeTierGroupMode;
  railItems: FreeTierRailItem[];
  activeScopeId: string;
  onSelectScope: (id: string) => void;
  visibleCandidates: FreeTierCandidateItem[];
  totalMatchingCount: number;
  activeProvider: FreeTierProviderData | null;
  activeGroup: FreeTierGroup | null;
  selectedSet: Set<string>;
  selectedInViewCount: number;
  testingIds: Set<string>;
  isMultiMode: boolean;
  groupComboName?: string;
  onGroupComboNameChange: (groupId: string, val: string) => void;
  onToggleModel: (comboModelValue: string) => void;
  onAddAllVisible: () => void;
  onDeselectVisible: () => void;
  onTestConnection: (providerId: string) => void;
  onlyConnected: boolean;
  onShowAllProviders: () => void;
  scrollKey: string;
  className?: string;
}

export const FreeTierCatalogPane: React.FC<FreeTierCatalogPaneProps> = ({
  groupMode,
  railItems,
  activeScopeId,
  onSelectScope,
  visibleCandidates,
  totalMatchingCount,
  activeProvider,
  activeGroup,
  selectedSet,
  selectedInViewCount,
  testingIds,
  isMultiMode,
  groupComboName,
  onGroupComboNameChange,
  onToggleModel,
  onAddAllVisible,
  onDeselectVisible,
  onTestConnection,
  onlyConnected,
  onShowAllProviders,
  scrollKey,
  className = "",
}) => {
  const showProviderInfo = activeScopeId === "all" || groupMode !== "provider";

  const renderRow = useCallback(
    (item: FreeTierCandidateItem) => (
      <FreeTierModelRow
        item={item}
        isSelected={selectedSet.has(item.comboModelValue)}
        showProviderInfo={showProviderInfo}
        isTesting={testingIds.has(item.providerId)}
        onToggle={onToggleModel}
        onTestConnection={onTestConnection}
      />
    ),
    [selectedSet, showProviderInfo, testingIds, onToggleModel, onTestConnection]
  );

  const getKey = useCallback((item: FreeTierCandidateItem) => item.comboModelValue, []);

  const limitBadge = activeProvider
    ? LIMIT_TYPE_BADGE[activeProvider.freeTier.limitType || "requests"] || LIMIT_TYPE_BADGE.requests
    : null;

  return (
    <div className={`lg:col-span-5 flex-col min-h-0 p-3.5 space-y-2.5 overflow-hidden ${className}`}>
      <MobileFreeTierScopeSelect
        groupMode={groupMode}
        railItems={railItems}
        activeScopeId={activeScopeId}
        onSelectScope={onSelectScope}
        totalMatchingCount={totalMatchingCount}
      />

      {/* Active Provider / Group Context Header */}
      {activeProvider ? (
        <div className="p-2.5 rounded-xl border border-[#1E293B] bg-[#0A0D14]/80 space-y-1.5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <ToolIcon
                src={activeProvider.provider.image}
                name={activeProvider.provider.name}
                color={activeProvider.provider.color}
                iconBg={activeProvider.provider.iconBg}
                size="sm"
                className="!size-6 !rounded-lg !p-0.5 shrink-0"
              />
              <span className="text-xs font-bold text-white truncate">
                {activeProvider.provider.name}
              </span>
              {limitBadge && (
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-medium border shrink-0 ${limitBadge.cls}`}>
                  {limitBadge.label}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-medium border ${
                  activeProvider.connectionStatus === "connected"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : activeProvider.connectionStatus === "not_connected"
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                }`}
                title={activeProvider.statusDetail || activeProvider.statusLabel}
              >
                <span className="size-1.5 rounded-full bg-current" />
                <span>{activeProvider.statusLabel}</span>
              </span>

              <button
                type="button"
                onClick={() => onTestConnection(activeProvider.provider.id)}
                disabled={testingIds.has(activeProvider.provider.id)}
                className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10.5px] font-medium flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <span
                  className={`material-symbols-outlined text-[12px] ${
                    testingIds.has(activeProvider.provider.id) ? "animate-spin text-blue-400" : ""
                  }`}
                >
                  {testingIds.has(activeProvider.provider.id) ? "refresh" : "network_check"}
                </span>
                <span>Test</span>
              </button>
            </div>
          </div>

          {activeProvider.freeTier.note && (
            <p className="text-[11px] text-slate-400 leading-snug">{activeProvider.freeTier.note}</p>
          )}
        </div>
      ) : activeGroup ? (
        <div className="p-2.5 rounded-xl border border-[#1E293B] bg-[#0A0D14]/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <span className="text-xs font-bold text-white truncate block">{activeGroup.name}</span>
            {activeGroup.description && (
              <span className="text-[11px] text-slate-400 truncate block">
                {activeGroup.description}
              </span>
            )}
          </div>
          {isMultiMode && groupMode !== "provider" && (
            <div className="flex items-center gap-1.5 bg-[#0F1420] px-2 py-1 rounded-lg border border-[#1E293B]">
              <span className="text-[10px] font-mono text-slate-400">Combo:</span>
              <input
                type="text"
                value={groupComboName ?? activeGroup.defaultComboName}
                onChange={(e) => onGroupComboNameChange(activeGroup.id, e.target.value)}
                placeholder={activeGroup.defaultComboName}
                className="w-36 bg-transparent text-[11px] font-mono text-emerald-400 focus:outline-none"
              />
            </div>
          )}
        </div>
      ) : null}

      {/* Scope Count + Bulk Select Actions */}
      <div className="flex items-center justify-between gap-2 px-0.5 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-white truncate">
            {activeProvider
              ? "Models"
              : activeGroup
              ? "Providers for Group"
              : groupMode === "provider"
              ? "All Free Models"
              : "All Matching Candidates"}
          </span>
          <span className="text-[11px] font-mono text-slate-400 shrink-0">
            {visibleCandidates.length} model{visibleCandidates.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {selectedInViewCount > 0 && (
            <button
              type="button"
              onClick={onDeselectVisible}
              className="text-[11px] text-slate-400 hover:text-rose-400 cursor-pointer transition-colors"
            >
              Deselect ({selectedInViewCount})
            </button>
          )}
          {visibleCandidates.length > 0 &&
            visibleCandidates.length <= 50 &&
            selectedInViewCount < visibleCandidates.length && (
              <button
                type="button"
                onClick={onAddAllVisible}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer transition-colors"
              >
                + Select all ({visibleCandidates.length})
              </button>
            )}
        </div>
      </div>

      {/* Virtualized Candidate List */}
      {visibleCandidates.length === 0 ? (
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="py-10 text-center text-slate-500 text-xs space-y-2.5 px-4">
            <span className="material-symbols-outlined text-[28px] text-slate-600 block mx-auto">
              search_off
            </span>
            <p className="max-w-xs mx-auto leading-relaxed">
              {onlyConnected
                ? "No connected free tier models match your current filter."
                : "No matching free tier models found."}
            </p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {activeScopeId !== "all" && totalMatchingCount > 0 && (
                <button
                  type="button"
                  onClick={() => onSelectScope("all")}
                  className="px-3 py-1 rounded-lg bg-emerald-600/15 border border-emerald-500/35 text-emerald-300 hover:bg-emerald-600/25 text-xs font-medium cursor-pointer"
                >
                  Search All ({totalMatchingCount})
                </button>
              )}
              {onlyConnected && (
                <button
                  type="button"
                  onClick={onShowAllProviders}
                  className="px-3 py-1 rounded-lg bg-blue-600/10 border border-blue-500/30 text-blue-300 hover:bg-blue-600/20 text-xs font-medium cursor-pointer"
                >
                  Show All Free Providers
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <VirtualModelList
          items={visibleCandidates}
          itemHeight={ROW_HEIGHT}
          scrollKey={scrollKey}
          getKey={getKey}
          renderItem={renderRow}
          className="flex-1 min-h-0 pr-1"
        />
      )}
    </div>
  );
};
