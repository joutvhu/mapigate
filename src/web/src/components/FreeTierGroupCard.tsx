import React, { useState } from "react";
import { ToolIcon } from "./ui/ToolIcon.js";
import type { FreeTierGroup, FreeTierModelCandidate } from "../utils/freeTierGrouping.js";

export interface FreeTierGroupCardProps {
  group: FreeTierGroup;
  selectedModelValues: Set<string>;
  onToggleModel: (comboModelValue: string) => void;
  onToggleAllGroupModels: (groupId: string, selectAll: boolean) => void;
  isMultiMode: boolean;
  comboNameValue?: string;
  onComboNameChange?: (groupId: string, name: string) => void;
  onTestConnection: (providerId: string) => Promise<void>;
  testingIds: Set<string>;
  defaultExpanded?: boolean;
}

export const FreeTierGroupCard: React.FC<FreeTierGroupCardProps> = ({
  group,
  selectedModelValues,
  onToggleModel,
  onToggleAllGroupModels,
  isMultiMode,
  comboNameValue,
  onComboNameChange,
  onTestConnection,
  testingIds,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const selectedCount = group.candidates.filter((c) =>
    selectedModelValues.has(c.model.comboModelValue)
  ).length;

  const allSelected = group.candidates.length > 0 && selectedCount === group.candidates.length;
  const isIndeterminate = selectedCount > 0 && selectedCount < group.candidates.length;

  const uniqueProvidersCount = new Set(group.candidates.map((c) => c.provider.id)).size;
  const connectedProvidersCount = new Set(
    group.candidates.filter((c) => c.connectionStatus === "connected").map((c) => c.provider.id)
  ).size;

  return (
    <div className="rounded-xl border border-[#1E293B] bg-[#0A0D14]/90 overflow-hidden transition-all duration-200 hover:border-slate-700">
      {/* Header */}
      <div className="p-3.5 flex flex-wrap items-center justify-between gap-3 bg-[#0F1420]/60">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = isIndeterminate;
            }}
            onChange={(e) => onToggleAllGroupModels(group.id, e.target.checked)}
            title={allSelected ? "Deselect all in group" : "Select all in group"}
            className="size-4 rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-xs text-white truncate">{group.name}</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                  uniqueProvidersCount > 1
                    ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }`}
              >
                {uniqueProvidersCount} Provider{uniqueProvidersCount > 1 ? "s" : ""}
              </span>

              {connectedProvidersCount > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {connectedProvidersCount} Connected
                </span>
              )}
            </div>

            {group.description && (
              <p className="text-[11px] text-slate-400 truncate max-w-md mt-0.5" title={group.description}>
                {group.description}
              </p>
            )}
          </div>
        </div>

        {/* Right side: combo name if multi mode, selection badge & expand button */}
        <div className="flex items-center gap-2.5 shrink-0 ml-auto">
          {isMultiMode && selectedCount > 0 && onComboNameChange && (
            <div className="flex items-center gap-1.5 bg-[#0A0D14] px-2 py-1 rounded-lg border border-[#1E293B]">
              <span className="text-[10px] font-mono text-slate-400">Combo:</span>
              <input
                type="text"
                value={comboNameValue ?? group.defaultComboName}
                onChange={(e) => onComboNameChange(group.id, e.target.value)}
                placeholder={group.defaultComboName}
                className="w-32 sm:w-40 bg-transparent text-[11px] font-mono text-emerald-400 focus:outline-none"
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="px-2 py-1 rounded-lg bg-slate-800/50 hover:bg-slate-800 text-slate-300 text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span className="text-slate-400">
              {selectedCount}/{group.candidates.length}
            </span>
            <span className="material-symbols-outlined text-[15px] transition-transform duration-200">
              {expanded ? "expand_less" : "expand_more"}
            </span>
          </button>
        </div>
      </div>

      {/* Expanded Candidate List */}
      {expanded && (
        <div className="p-3 border-t border-[#1E293B] bg-[#0A0D14]/40 space-y-1.5 animate-rt-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto pr-1">
            {group.candidates.map((cand) => {
              const isSelected = selectedModelValues.has(cand.model.comboModelValue);
              const isTesting = testingIds.has(cand.provider.id);

              return (
                <div
                  key={cand.model.comboModelValue}
                  className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs transition-all ${
                    isSelected
                      ? "bg-blue-600/10 border-blue-500/30 text-white"
                      : "bg-[#0F1420]/50 border-[#1E293B]/70 text-slate-300 hover:bg-white/5"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleModel(cand.model.comboModelValue)}
                    className="size-3.5 mt-0.5 rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer shrink-0"
                  />

                  <div className="size-6 shrink-0 mt-0.5">
                    <ToolIcon
                      src={cand.provider.image}
                      name={cand.provider.name}
                      color={cand.provider.color}
                      iconBg={cand.provider.iconBg}
                      size="sm"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-slate-200 truncate">
                        {cand.provider.name}
                      </span>
                      <span className="text-slate-500 text-[10px]">/</span>
                      <span className="text-slate-300 truncate text-[11px]">{cand.model.name}</span>
                    </div>

                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-[10px] text-slate-500 truncate">
                        {cand.model.comboModelValue}
                      </span>
                      {cand.latencyMs != null && (
                        <span className="text-[10px] text-emerald-400 font-mono">
                          {cand.latencyMs}ms
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-1">
                    <span
                      className={`size-2 rounded-full ${
                        cand.connectionStatus === "connected"
                          ? "bg-emerald-400"
                          : cand.connectionStatus === "not_connected"
                          ? "bg-amber-400"
                          : "bg-rose-400"
                      }`}
                      title={cand.statusDetail || cand.statusLabel}
                    />
                    <button
                      type="button"
                      onClick={() => onTestConnection(cand.provider.id)}
                      disabled={isTesting}
                      title="Test provider"
                      className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <span
                        className={`material-symbols-outlined text-[13px] ${
                          isTesting ? "animate-spin text-blue-400" : ""
                        }`}
                      >
                        {isTesting ? "refresh" : "network_check"}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
