import React, { useState, useEffect, useRef, useMemo } from "react";
import { CapacityBadges } from "./CapacityBadges.js";

export interface AvailableModelItem {
  id: string;
  value: string;
  name: string;
  providerId: string;
  providerName: string;
  hasConnectedAccount: boolean;
  accountsCount: number;
  caps: {
    vision: boolean;
    reasoning: boolean;
    audio: boolean;
  };
  contextLength: number;
  isCombo?: boolean;
  strategy?: "round-robin" | "fallback" | "fusion" | string;
  models?: string[];
}

export interface ModelAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  connectedOnly?: boolean;
  disabled?: boolean;
  excludeValues?: string[];
  allowCombos?: boolean;
}

let cachedModelsPromise: Promise<AvailableModelItem[]> | null = null;
let cachedModelsData: AvailableModelItem[] | null = null;
const cacheInvalidateListeners = new Set<() => void>();

export function onAvailableModelsCacheInvalidated(listener: () => void): () => void {
  cacheInvalidateListeners.add(listener);
  return () => {
    cacheInvalidateListeners.delete(listener);
  };
}

export function invalidateAvailableModelsCache(): void {
  cachedModelsPromise = null;
  cachedModelsData = null;
  for (const listener of cacheInvalidateListeners) {
    try {
      listener();
    } catch (err) {
      console.error("Error in model cache invalidation listener:", err);
    }
  }
}

export function getAvailableModelsCached(): Promise<AvailableModelItem[]> {
  if (cachedModelsData) return Promise.resolve(cachedModelsData);
  if (!cachedModelsPromise) {
    cachedModelsPromise = fetch("/api/models/available")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load models");
        return res.json();
      })
      .then((data: AvailableModelItem[]) => {
        cachedModelsData = data;
        return data;
      })
      .catch((err) => {
        cachedModelsPromise = null;
        throw err;
      });
  }
  return cachedModelsPromise;
}

export const ModelAutocompleteInput: React.FC<ModelAutocompleteInputProps> = ({
  value,
  onChange,
  onEnter,
  placeholder = "Search model (e.g. openai/gpt-4o)...",
  className = "",
  autoFocus = false,
  connectedOnly = true,
  disabled = false,
  excludeValues,
  allowCombos = true,
}) => {
  const [models, setModels] = useState<AvailableModelItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [filterConnected, setFilterConnected] = useState(connectedOnly);

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchModels = () => {
      getAvailableModelsCached()
        .then((data) => {
          if (isMounted) setModels(data);
        })
        .catch(() => {
          // Fail-open: if fetching fails, free-form input remains fully functional
        });
    };

    fetchModels();

    const unsubscribe = onAvailableModelsCacheInvalidated(() => {
      if (isMounted) {
        fetchModels();
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    setFilterConnected(connectedOnly);
  }, [connectedOnly]);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const hasAnyConnected = useMemo(
    () => models.some((m) => m.hasConnectedAccount),
    [models]
  );

  // If filterConnected is on but no providers have accounts, we don't forcefully blank the list if user wants to see catalog
  const filteredModels = useMemo(() => {
    const q = (value || "").trim().toLowerCase();
    const excludeSet = new Set((excludeValues || []).map((v) => v.toLowerCase()));

    let pool = models;
    if (allowCombos === false) {
      pool = pool.filter((m) => !m.isCombo);
    }
    if (excludeSet.size > 0) {
      pool = pool.filter(
        (m) => !excludeSet.has(m.value.toLowerCase()) && !excludeSet.has(m.id.toLowerCase())
      );
    }

    if (filterConnected && hasAnyConnected) {
      pool = pool.filter((m) => m.hasConnectedAccount);
    }

    if (!q) {
      return pool.slice(0, 50);
    }

    const matches = pool.filter((m) => {
      const matchBasic =
        m.value.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.providerName.toLowerCase().includes(q) ||
        m.providerId.toLowerCase().includes(q);

      if (matchBasic) return true;

      // If combo, also search strategy and bundled model names
      if (m.isCombo) {
        if (m.strategy && m.strategy.toLowerCase().includes(q)) return true;
        if (m.models && m.models.some((sub) => sub.toLowerCase().includes(q))) return true;
      }

      return false;
    });

    // Sort: exact matches or prefixes first
    matches.sort((a, b) => {
      const aVal = a.value.toLowerCase();
      const bVal = b.value.toLowerCase();
      const aId = a.id.toLowerCase();
      const bId = b.id.toLowerCase();

      if (aVal === q || aId === q) return -1;
      if (bVal === q || bId === q) return 1;
      if (aVal.startsWith(q) || aId.startsWith(q)) return -1;
      if (bVal.startsWith(q) || bId.startsWith(q)) return 1;

      // Prioritize combos when matched
      if (a.isCombo && !b.isCombo) return -1;
      if (!a.isCombo && b.isCombo) return 1;
      return 0;
    });

    return matches.slice(0, 50);
  }, [models, value, filterConnected, hasAnyConnected, excludeValues, allowCombos]);

  // Keep highlighted item in view
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const activeElement = listRef.current.children[highlightIndex] as HTMLElement;
      if (activeElement) {
        activeElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightIndex]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setHighlightIndex((prev) =>
          prev < filteredModels.length - 1 ? prev + 1 : 0
        );
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setHighlightIndex((prev) =>
          prev > 0 ? prev - 1 : filteredModels.length - 1
        );
      }
    } else if (e.key === "Enter") {
      if (isOpen && highlightIndex >= 0 && filteredModels[highlightIndex]) {
        e.preventDefault();
        const selected = filteredModels[highlightIndex];
        onChange(selected.value);
        setIsOpen(false);
        setHighlightIndex(-1);
        if (onEnter) onEnter();
      } else {
        setIsOpen(false);
        if (onEnter) {
          e.preventDefault();
          onEnter();
        }
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      setHighlightIndex(-1);
    }
  };

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
    setHighlightIndex(-1);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (!isOpen) setIsOpen(true);
          setHighlightIndex(-1);
        }}
        onFocus={() => {
          if (models.length === 0 || !cachedModelsData) {
            getAvailableModelsCached()
              .then((data) => setModels(data))
              .catch(() => {});
          }
          setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        className={
          className ||
          "w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl pl-3 pr-8 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
        }
      />
      {value && !disabled && (
        <button
          type="button"
          onClick={() => {
            onChange("");
            setHighlightIndex(-1);
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
          title="Clear input"
        >
          <span className="material-symbols-outlined text-[15px]">close</span>
        </button>
      )}

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl bg-[#0A0D14] border border-[#1E293B] shadow-2xl overflow-hidden animate-rt-scale-in min-w-[280px]">
          {/* Header with filter toggle */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#1E293B] bg-[#05070B] text-[11px]">
            <span className="text-slate-400 font-mono text-[10.5px]">
              {filteredModels.length} models {value.trim() ? "found" : "available"}
            </span>

            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setFilterConnected(!filterConnected);
              }}
              className={`px-2 py-0.5 rounded-md font-sans text-[10.5px] font-medium flex items-center gap-1 transition-all cursor-pointer ${
                filterConnected
                  ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
                  : "bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200"
              }`}
              title={
                filterConnected
                  ? "Showing only models from connected accounts. Click to show all catalog models."
                  : "Showing all catalog models. Click to filter by connected accounts."
              }
            >
              <span className="material-symbols-outlined text-[12px]">
                {filterConnected ? "check" : "filter_alt"}
              </span>
              Connected only
            </button>
          </div>

          {/* Model list */}
          <div ref={listRef} className="max-h-56 overflow-y-auto divide-y divide-[#1E293B]/40">
            {filteredModels.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-500 space-y-1">
                <p>No matching models in catalog.</p>
                <p className="text-[10.5px] text-slate-400">
                  Custom IDs are supported. Press Enter or click outside to use your custom model ID.
                </p>
                {filterConnected && !hasAnyConnected && (
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setFilterConnected(false);
                    }}
                    className="mt-1 text-[11px] text-blue-400 hover:underline"
                  >
                    View all registry models
                  </button>
                )}
              </div>
            ) : (
              filteredModels.map((item, idx) => {
                const isHighlighted = idx === highlightIndex;
                const isSelected = item.value === value;

                return (
                  <div
                    key={item.value}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(item.value);
                    }}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    className={`px-3 py-2 cursor-pointer transition-colors flex items-center justify-between gap-2.5 ${
                      isHighlighted
                        ? "bg-blue-600/20 text-white"
                        : isSelected
                        ? "bg-[#141B2D] text-slate-100"
                        : "hover:bg-white/5 text-slate-300"
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.isCombo ? (
                          <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 border border-cyan-500/40 font-mono text-[9.5px] text-cyan-300 font-semibold tracking-wide">
                            COMBO
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded bg-slate-800/80 border border-slate-700/60 font-mono text-[9.5px] text-slate-300">
                            {item.providerName || item.providerId}
                          </span>
                        )}

                        <span className="font-medium text-xs text-slate-100 truncate">
                          {item.name}
                        </span>

                        {item.isCombo && item.strategy && (
                          <span
                            className={`px-1.5 py-0.2 rounded font-sans text-[9px] font-medium border ${
                              item.strategy === "round-robin"
                                ? "bg-cyan-950/40 text-cyan-300 border-cyan-500/30"
                                : item.strategy === "fusion"
                                ? "bg-purple-950/40 text-purple-300 border-purple-500/30"
                                : "bg-amber-950/40 text-amber-300 border-amber-500/30"
                            }`}
                          >
                            {item.strategy === "round-robin"
                              ? "Round Robin"
                              : item.strategy === "fusion"
                              ? "Fusion"
                              : "Fallback"}
                          </span>
                        )}

                        {item.hasConnectedAccount && (
                          <span
                            className="size-1.5 rounded-full bg-emerald-400 shrink-0"
                            title={`Connected account active (${item.accountsCount})`}
                          />
                        )}
                      </div>

                      {item.isCombo && item.models && item.models.length > 0 ? (
                        <div className="font-mono text-[10.5px] text-slate-400 truncate">
                          <span className="text-cyan-400 font-semibold">
                            {item.models.length} model{item.models.length > 1 ? "s" : ""}:
                          </span>{" "}
                          <span className="text-slate-300">
                            {item.models.slice(0, 3).join(", ")}
                            {item.models.length > 3 ? ` +${item.models.length - 3} more` : ""}
                          </span>
                        </div>
                      ) : (
                        <div className="font-mono text-[10.5px] text-slate-400 truncate">
                          {item.value}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5">
                      <CapacityBadges caps={item.caps} size="xs" showLabels={false} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
