import React from "react";
import { FreeTierProviderCard } from "./FreeTierProviderCard.js";
import { FreeTierGroupCard } from "./FreeTierGroupCard.js";
import type { FreeTierProviderData } from "../utils/freeTierHelper.js";
import type { FreeTierGroup, FreeTierGroupMode } from "../utils/freeTierGrouping.js";

export interface FreeTierComboListProps {
  groupMode: FreeTierGroupMode;
  filteredProviders: FreeTierProviderData[];
  groups: FreeTierGroup[];
  selectedModelValues: Set<string>;
  onToggleModel: (comboModelValue: string) => void;
  onToggleAllProviderModels: (providerId: string, selectAll: boolean) => void;
  onToggleAllGroupModels: (groupId: string, selectAll: boolean) => void;
  isMultiMode: boolean;
  groupComboNames: Record<string, string>;
  onGroupComboNameChange: (groupId: string, val: string) => void;
  onTestConnection: (providerId: string) => Promise<void>;
  testingIds: Set<string>;
}

export const FreeTierComboList: React.FC<FreeTierComboListProps> = ({
  groupMode,
  filteredProviders,
  groups,
  selectedModelValues,
  onToggleModel,
  onToggleAllProviderModels,
  onToggleAllGroupModels,
  isMultiMode,
  groupComboNames,
  onGroupComboNameChange,
  onTestConnection,
  testingIds,
}) => {
  return (
    <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 min-h-[220px]">
      {groupMode === "provider" ? (
        filteredProviders.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            No matching free providers found.
          </div>
        ) : (
          filteredProviders.map((item) => (
            <FreeTierProviderCard
              key={item.provider.id}
              provider={item.provider}
              freeTier={item.freeTier}
              freeModels={item.freeModels}
              selectedModelValues={selectedModelValues}
              onToggleModel={onToggleModel}
              onToggleAllProviderModels={onToggleAllProviderModels}
              connectionStatus={item.connectionStatus}
              statusLabel={item.statusLabel}
              statusDetail={item.statusDetail}
              onTestConnection={onTestConnection}
              isTesting={testingIds.has(item.provider.id)}
              defaultExpanded={item.freeModels.some((m) =>
                selectedModelValues.has(m.comboModelValue)
              )}
            />
          ))
        )
      ) : groups.length === 0 ? (
        <div className="py-12 text-center text-slate-500 text-xs">
          No matching model groups found.
        </div>
      ) : (
        groups.map((grp) => (
          <FreeTierGroupCard
            key={grp.id}
            group={grp}
            selectedModelValues={selectedModelValues}
            onToggleModel={onToggleModel}
            onToggleAllGroupModels={onToggleAllGroupModels}
            isMultiMode={isMultiMode}
            comboNameValue={groupComboNames[grp.id]}
            onComboNameChange={onGroupComboNameChange}
            onTestConnection={onTestConnection}
            testingIds={testingIds}
            defaultExpanded={grp.candidates.some((c) =>
              selectedModelValues.has(c.model.comboModelValue)
            )}
          />
        ))
      )}
    </div>
  );
};
