import React, { useState, useEffect, useRef, useMemo } from "react";

export interface SuggestedSourceModelItem {
  id: string;
  name: string;
  category: "native" | "standard";
  toolId?: string;
}

export interface SourceModelAutocompleteInputProps {
  toolId?: string | null;
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

const cacheByTool: Record<string, SuggestedSourceModelItem[]> = {};

export const SourceModelAutocompleteInput: React.FC<SourceModelAutocompleteInputProps> = ({
  toolId = "kiro",
  value,
  onChange,
  onEnter,
  placeholder = "Select or type source model ID...",
  className = "",
  autoFocus = false,
  disabled = false,
}) => {
  const currentTool = (toolId || "kiro").toLowerCase();
  const [items, setItems] = useState<SuggestedSourceModelItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const dropdownHeight = 240;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
        setPlacement("top");
      } else {
        setPlacement("bottom");
      }
    }
  }, [isOpen]);

  useEffect(() => {
    let isMounted = true;
    if (cacheByTool[currentTool]) {
      setItems(cacheByTool[currentTool]);
      return;
    }

    fetch(`/api/mitm/mappings/source-models/${encodeURIComponent(currentTool)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load source models");
        return res.json();
      })
      .then((data: SuggestedSourceModelItem[]) => {
        if (isMounted && Array.isArray(data)) {
          cacheByTool[currentTool] = data;
          setItems(data);
        }
      })
      .catch(() => {
        // Fail-open: free-form input remains fully functional
      });

    return () => {
      isMounted = false;
    };
  }, [currentTool]);

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

  const filteredItems = useMemo(() => {
    const q = (value || "").trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.id.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q)
    );
  }, [items, value]);

  useEffect(() => {
    setHighlightIndex(filteredItems.length > 0 ? 0 : -1);
  }, [filteredItems]);

  useEffect(() => {
    if (isOpen && highlightIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.children[highlightIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightIndex, isOpen]);

  const handleSelect = (selectedId: string) => {
    onChange(selectedId);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else if (filteredItems.length > 0) {
        setHighlightIndex((prev) => (prev + 1) % filteredItems.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (isOpen && filteredItems.length > 0) {
        setHighlightIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
      }
    } else if (e.key === "Enter") {
      if (isOpen && highlightIndex >= 0 && highlightIndex < filteredItems.length) {
        e.preventDefault();
        handleSelect(filteredItems[highlightIndex].id);
      } else if (onEnter) {
        e.preventDefault();
        onEnter();
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          className={
            className ||
            "w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
          }
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setIsOpen((prev) => !prev)}
          className="absolute right-2 text-slate-500 hover:text-slate-300 p-0.5 rounded cursor-pointer"
          title="Toggle model suggestions"
        >
          <span className="material-symbols-outlined text-[16px]">
            {isOpen ? "arrow_drop_up" : "arrow_drop_down"}
          </span>
        </button>
      </div>

      {isOpen && filteredItems.length > 0 && (
        <div
          ref={listRef}
          className={`absolute left-0 right-0 z-50 max-h-56 overflow-y-auto rounded-xl border border-[#1E293B] bg-[#0A0D14] shadow-2xl py-1 ${
            placement === "top" ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {filteredItems.map((item, idx) => {
            const isHighlighted = idx === highlightIndex;
            const isNative = item.category === "native";

            return (
              <div
                key={`${item.category}-${item.id}`}
                onClick={() => handleSelect(item.id)}
                onMouseEnter={() => setHighlightIndex(idx)}
                className={`px-3 py-2 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                  isHighlighted ? "bg-blue-600/20 text-white" : "text-slate-300 hover:bg-white/5"
                }`}
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="font-mono font-medium text-slate-100 truncate">
                    {item.id}
                  </span>
                  {item.name && item.name !== item.id && (
                    <span className="text-[10.5px] text-slate-400 font-sans truncate">
                      {item.name}
                    </span>
                  )}
                </div>

                <div className="flex-shrink-0">
                  {isNative ? (
                    <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-[9.5px] font-mono text-cyan-300 uppercase tracking-wider font-semibold">
                      {currentTool} native
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded bg-purple-500/15 border border-purple-500/30 text-[9.5px] font-mono text-purple-300 uppercase tracking-wider font-semibold">
                      Standard
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
