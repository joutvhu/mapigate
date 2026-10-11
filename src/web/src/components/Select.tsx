import React, { useState, useRef, useEffect, useId, useCallback } from "react";

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  hint?: string;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  size?: "sm" | "md";
  id?: string;
}

export const Select: React.FC<SelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  label,
  error,
  hint,
  disabled = false,
  required = false,
  className = "",
  triggerClassName = "",
  menuClassName = "",
  size = "sm",
  id,
}) => {
  const generatedId = useId();
  const selectId = id || generatedId;
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  const selectedOption = options.find((opt) => opt.value === value);

  // Sync focused index to selected option when opened
  useEffect(() => {
    if (isOpen) {
      const idx = options.findIndex((opt) => opt.value === value);
      setFocusedIndex(idx >= 0 ? idx : 0);
    } else {
      setFocusedIndex(-1);
    }
  }, [isOpen, value, options]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isOpen]);

  // Scroll focused option into view
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && optionRefs.current[focusedIndex]) {
      optionRefs.current[focusedIndex]?.scrollIntoView({
        block: "nearest",
      });
    }
  }, [isOpen, focusedIndex]);

  const selectOption = useCallback(
    (opt: SelectOption) => {
      if (opt.disabled) return;
      onChange(opt.value);
      setIsOpen(false);
      triggerRef.current?.focus();
    },
    [onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        break;

      case "ArrowDown": {
        e.preventDefault();
        setFocusedIndex((prev) => {
          let next = prev + 1;
          while (next < options.length && options[next].disabled) {
            next++;
          }
          return next < options.length ? next : prev;
        });
        break;
      }

      case "ArrowUp": {
        e.preventDefault();
        setFocusedIndex((prev) => {
          let next = prev - 1;
          while (next >= 0 && options[next].disabled) {
            next--;
          }
          return next >= 0 ? next : prev;
        });
        break;
      }

      case "Home": {
        e.preventDefault();
        const first = options.findIndex((opt) => !opt.disabled);
        if (first >= 0) setFocusedIndex(first);
        break;
      }

      case "End": {
        e.preventDefault();
        for (let i = options.length - 1; i >= 0; i--) {
          if (!options[i].disabled) {
            setFocusedIndex(i);
            break;
          }
        }
        break;
      }

      case "Enter":
      case " ": {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < options.length) {
          selectOption(options[focusedIndex]);
        }
        break;
      }

      case "Tab":
        setIsOpen(false);
        break;

      default:
        break;
    }
  };

  const sizeClasses =
    size === "md"
      ? "py-2.5 px-3.5 text-xs sm:text-sm"
      : "py-1.5 px-3 text-xs";

  return (
    <div
      ref={containerRef}
      className={`relative inline-block text-left ${className}`}
      onKeyDown={handleKeyDown}
    >
      {label && (
        <label
          htmlFor={selectId}
          className="block text-xs font-semibold text-slate-300 mb-1"
        >
          {label}
          {required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
      )}

      <button
        ref={triggerRef}
        id={selectId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={`${selectId}-menu`}
        disabled={disabled}
        onClick={() => {
          if (!disabled) setIsOpen((prev) => !prev);
        }}
        className={`w-full flex items-center justify-between gap-2 rounded-xl border transition-all duration-150 select-none cursor-pointer ${sizeClasses} ${
          error
            ? "border-red-500/50 bg-[#0A0D14] text-slate-200 focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
            : "border-[#1E293B] bg-[#0A0D14] text-slate-200 hover:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
        } ${
          disabled
            ? "opacity-50 cursor-not-allowed pointer-events-none"
            : ""
        } ${triggerClassName}`}
      >
        <span className="flex items-center gap-2 truncate">
          {selectedOption ? (
            <>
              {selectedOption.icon && (
                <span className="shrink-0 flex items-center">
                  {selectedOption.icon}
                </span>
              )}
              <span className="truncate">{selectedOption.label}</span>
            </>
          ) : (
            <span className="text-slate-500 truncate">{placeholder}</span>
          )}
        </span>

        <span
          className={`material-symbols-outlined text-[18px] text-slate-400 shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-blue-400" : ""
          }`}
        >
          expand_more
        </span>
      </button>

      {/* Floating Menu */}
      {isOpen && (
        <div
          ref={menuRef}
          id={`${selectId}-menu`}
          role="listbox"
          tabIndex={-1}
          className={`absolute left-0 mt-1.5 w-full min-w-[160px] max-h-60 overflow-y-auto rounded-xl border border-[#1E293B] bg-[#0F1420] shadow-2xl z-50 py-1 backdrop-blur-md animate-rt-scale-in ${menuClassName}`}
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500 italic">
              No options available
            </div>
          ) : (
            options.map((option, idx) => {
              const isSelected = option.value === value;
              const isFocused = idx === focusedIndex;

              return (
                <div
                  key={option.value}
                  ref={(el) => {
                    optionRefs.current[idx] = el;
                  }}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled}
                  onClick={() => selectOption(option)}
                  onMouseEnter={() => {
                    if (!option.disabled) setFocusedIndex(idx);
                  }}
                  className={`flex items-center justify-between gap-2 px-3 py-2 text-xs transition-colors cursor-pointer select-none ${
                    option.disabled
                      ? "opacity-40 cursor-not-allowed"
                      : isFocused
                      ? "bg-[#1E293B] text-white"
                      : isSelected
                      ? "bg-blue-600/15 text-blue-400 font-medium"
                      : "text-slate-300 hover:bg-[#1E293B]/70 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate min-w-0">
                    {option.icon && (
                      <span className="shrink-0 flex items-center">
                        {option.icon}
                      </span>
                    )}
                    <span className="truncate">{option.label}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {option.hint && (
                      <span className="text-[10px] text-slate-500 font-mono">
                        {option.hint}
                      </span>
                    )}
                    {isSelected && (
                      <span className="material-symbols-outlined text-[16px] text-blue-400">
                        check
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {error && (
        <p className="mt-1 text-[11px] text-red-400 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">error</span>
          {error}
        </p>
      )}

      {hint && !error && (
        <p className="mt-1 text-[11px] text-slate-400">{hint}</p>
      )}
    </div>
  );
};
