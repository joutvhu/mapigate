import React, { useState, useEffect, useMemo, useCallback } from "react";
import { PortalModal } from "./PortalModal";
import { scanProviderModels } from "../services/providerService";
import type { ScannedModel } from "../../../shared/types";

export interface ScanModelsModalProps {
  isOpen: boolean;
  provider: {
    id: string;
    name: string;
    baseUrl?: string;
    image?: string;
    format?: string;
  };
  existingModels: string[];
  onClose: () => void;
  onApplyModels: (newModelIds: string[], mode: "merge" | "replace") => void;
}

export const ScanModelsModal: React.FC<ScanModelsModalProps> = ({
  isOpen,
  provider,
  existingModels,
  onClose,
  onApplyModels,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scannedModels, setScannedModels] = useState<ScannedModel[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [endpointUrl, setEndpointUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Collapsible manual overrides
  const [showOverrides, setShowOverrides] = useState(false);
  const [customBaseUrl, setCustomBaseUrl] = useState(provider.baseUrl || "");
  const [customApiKey, setCustomApiKey] = useState("");

  const triggerScan = useCallback(async (forcedBaseUrl?: string, forcedApiKey?: string) => {
    setIsScanning(true);
    setErrorMsg(null);
    try {
      const result = await scanProviderModels({
        providerId: provider.id,
        baseUrl: (forcedBaseUrl !== undefined ? forcedBaseUrl : customBaseUrl).trim() || undefined,
        apiKey: (forcedApiKey !== undefined ? forcedApiKey : customApiKey).trim() || undefined,
      });

      if (result.success) {
        setScannedModels(result.models);
        setEndpointUrl(result.endpointUrl || null);
        // Default: select all discovered models
        setSelectedIds(new Set(result.models.map((m) => m.id)));
      } else {
        setErrorMsg(result.error || "Failed to scan models from upstream provider.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setIsScanning(false);
    }
  }, [provider.id, customBaseUrl, customApiKey]);

  // Auto scan on initial open
  useEffect(() => {
    if (isOpen) {
      setCustomBaseUrl(provider.baseUrl || "");
      setCustomApiKey("");
      setSearchQuery("");
      setShowOverrides(false);
      triggerScan(provider.baseUrl || undefined, "");
    } else {
      setScannedModels([]);
      setSelectedIds(new Set());
      setErrorMsg(null);
      setEndpointUrl(null);
    }
  }, [isOpen, provider.id, provider.baseUrl, triggerScan]);

  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return scannedModels;
    const q = searchQuery.toLowerCase();
    return scannedModels.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        (m.name && m.name.toLowerCase().includes(q)) ||
        (m.description && m.description.toLowerCase().includes(q))
    );
  }, [scannedModels, searchQuery]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(filteredModels.map((m) => m.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleApply = (mode: "merge" | "replace") => {
    const chosen = scannedModels.filter((m) => selectedIds.has(m.id)).map((m) => m.id);
    onApplyModels(chosen, mode);
    onClose();
  };

  const newModelsCount = useMemo(() => {
    return scannedModels.filter((m) => !existingModels.includes(m.id)).length;
  }, [scannedModels, existingModels]);

  const existingModelsCount = useMemo(() => {
    return scannedModels.filter((m) => existingModels.includes(m.id)).length;
  }, [scannedModels, existingModels]);

  return (
    <PortalModal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-2xl">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-[#0D1322] border border-[#1E293B] p-2 flex items-center justify-center shrink-0">
              {provider.image ? (
                <img src={provider.image} alt={provider.name} className="size-full object-contain" />
              ) : (
                <span className="material-symbols-outlined text-blue-400 text-[20px]">radar</span>
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Scan Models from Provider API
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {provider.name}
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Automatically probe and import live available models from upstream API endpoints.
              </p>
            </div>
          </div>

          <button
            onClick={() => triggerScan()}
            disabled={isScanning}
            className="rt-btn rt-btn--secondary text-xs flex items-center gap-1.5"
            title="Rescan"
          >
            <span className={`material-symbols-outlined text-[15px] ${isScanning ? "animate-spin" : ""}`}>
              sync
            </span>
            {isScanning ? "Scanning..." : "Rescan"}
          </button>
        </div>

        {/* Endpoint probe info */}
        {endpointUrl && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0A0D14] border border-[#1E293B] text-[11px] font-mono text-slate-300">
            <span className="material-symbols-outlined text-emerald-400 text-[14px]">check_circle</span>
            <span className="text-slate-500">Discovered endpoint:</span>
            <span className="text-emerald-400 truncate">{endpointUrl}</span>
          </div>
        )}

        {/* Error message & retry settings */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 space-y-2">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-[18px] text-red-400 shrink-0 mt-0.5">error</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{errorMsg}</p>
                <p className="text-[11px] text-red-400/80 mt-1">
                  Ensure the provider has an active API key, or provide a custom endpoint URL below.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Custom overrides toggle */}
        <div className="rounded-xl border border-[#1E293B] bg-[#0A0D14]/60 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowOverrides(!showOverrides)}
            className="w-full flex items-center justify-between px-3.5 py-2 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <span className="material-symbols-outlined text-[15px]">tune</span>
              Scan Parameters & Endpoint Overrides
            </span>
            <span className="material-symbols-outlined text-[16px]">
              {showOverrides ? "expand_less" : "expand_more"}
            </span>
          </button>

          {showOverrides && (
            <div className="p-3.5 border-t border-[#1E293B] space-y-3 bg-[#080B12]">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Base URL or Models Endpoint
                </label>
                <input
                  type="text"
                  placeholder="e.g. https://api.xiaomimimo.com/v1/models or https://api.xkiro.com/v1"
                  value={customBaseUrl}
                  onChange={(e) => setCustomBaseUrl(e.target.value)}
                  className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  API Key Override (Optional)
                </label>
                <input
                  type="password"
                  placeholder="Leave blank to use existing stored credentials"
                  value={customApiKey}
                  onChange={(e) => setCustomApiKey(e.target.value)}
                  className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => triggerScan()}
                  disabled={isScanning}
                  className="rt-btn rt-btn--primary text-xs"
                >
                  Apply & Scan
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Scanning Spinner / Radar */}
        {isScanning && (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
            <div className="relative size-12 flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl text-blue-400 animate-spin">sync</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Probing provider endpoints...</p>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                Querying /v1/models and checking model schemas
              </p>
            </div>
          </div>
        )}

        {/* Results View */}
        {!isScanning && scannedModels.length > 0 && (
          <div className="space-y-3">
            {/* Search & Selection Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <div className="relative w-full">
                  <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-slate-500">
                    search
                  </span>
                  <input
                    type="text"
                    placeholder="Search discovered models..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] transition-colors cursor-pointer"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 text-slate-400 text-[11px] transition-colors cursor-pointer"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {/* Metrics summary */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 font-mono">
              <div className="flex items-center gap-3">
                <span>Discovered: <strong className="text-white">{scannedModels.length}</strong></span>
                <span>•</span>
                <span className="text-emerald-400">{newModelsCount} new</span>
                <span>•</span>
                <span className="text-slate-500">{existingModelsCount} existing</span>
              </div>
              <div>
                <span>Selected: <strong className="text-blue-400">{selectedIds.size}</strong></span>
              </div>
            </div>

            {/* Model list */}
            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 border border-[#1E293B] rounded-xl p-2 bg-[#0A0D14]/80">
              {filteredModels.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  No models match &quot;{searchQuery}&quot;
                </div>
              ) : (
                filteredModels.map((m) => {
                  const isSelected = selectedIds.has(m.id);
                  const isExisting = existingModels.includes(m.id);

                  return (
                    <div
                      key={m.id}
                      onClick={() => toggleSelect(m.id)}
                      className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-blue-500/10 border-blue-500/40 text-white"
                          : "bg-[#0D1322] border-[#1E293B] hover:border-slate-700 text-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(m.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="accent-blue-600 rounded"
                        />
                        <div className="min-w-0">
                          <span className="font-mono font-medium truncate block">{m.id}</span>
                          {m.name && m.name !== m.id && (
                            <span className="text-[10px] text-slate-500 truncate block">{m.name}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {m.capabilities?.reasoning && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            reasoning
                          </span>
                        )}
                        {m.capabilities?.vision && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            vision
                          </span>
                        )}
                        {isExisting ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400">
                            Configured
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                            NEW
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Empty state when no models and not scanning */}
        {!isScanning && scannedModels.length === 0 && !errorMsg && (
          <div className="py-8 text-center text-xs text-slate-400">
            Click &quot;Rescan&quot; or provide a custom endpoint URL above to scan for models.
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#1E293B]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={() => handleApply("replace")}
              className="rt-btn rt-btn--secondary text-xs disabled:opacity-40"
              title="Replace current provider models list with selected models"
            >
              Replace Existing ({selectedIds.size})
            </button>

            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={() => handleApply("merge")}
              className="rt-btn rt-btn--primary text-xs disabled:opacity-40"
              title="Append newly selected models without removing existing ones"
            >
              Merge with Existing ({selectedIds.size})
            </button>
          </div>
        </div>
      </div>
    </PortalModal>
  );
};
