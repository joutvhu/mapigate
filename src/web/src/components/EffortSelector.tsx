import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { getCapabilitiesForModel } from "../../../core/capabilities/index.js";
import { getSupportedEffortsForTarget, isFixedVariantModel } from "../../../core/thinking/effortResolver.js";

const EFFORT_SUFFIX_RE = /^(.*?)\(([a-z][a-z0-9_-]*)\)$/i;
const CONTEXT_MARKER_RE = /\[1m\]$/i;

const EFFORT_LABELS: Record<string, string> = {
  none: "None",
  minimal: "Minimal",
  "extra-low": "Extra Low",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "XHigh",
  max: "Max",
  ultra: "Ultra",
  disabled: "Disabled",
};

function formatEffortLabel(raw: string): string {
  const lower = raw.trim().toLowerCase();
  if (!lower) return "Auto";
  if (EFFORT_LABELS[lower]) return EFFORT_LABELS[lower];
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function splitModelEffort(modelStr?: string): {
  baseValue: string;
  effort: string;
} {
  if (!modelStr) return { baseValue: "", effort: "" };
  const trimmed = modelStr.trim();
  const ctxMatch = trimmed.match(CONTEXT_MARKER_RE);
  const withoutCtx = ctxMatch ? trimmed.slice(0, -ctxMatch[0].length).trim() : trimmed;
  const match = withoutCtx.match(EFFORT_SUFFIX_RE);
  if (!match) {
    return { baseValue: trimmed, effort: "" };
  }
  const base = match[1].trim();
  const effort = match[2].trim().toLowerCase();
  return {
    baseValue: ctxMatch ? `${base}${ctxMatch[0]}` : base,
    effort,
  };
}

export function joinModelEffort(baseValue: string, effort?: string): string {
  const cleanBase = baseValue.trim();
  const cleanEffort = (effort || "").trim().toLowerCase();
  if (!cleanBase || !cleanEffort) return cleanBase;

  const ctxMatch = cleanBase.match(CONTEXT_MARKER_RE);
  if (ctxMatch) {
    const withoutCtx = cleanBase.slice(0, -ctxMatch[0].length).trim();
    return `${withoutCtx}(${cleanEffort})${ctxMatch[0]}`;
  }
  return `${cleanBase}(${cleanEffort})`;
}

export function resolveSupportedEffortsForValue(
  modelStr: string,
  availableModels?: Array<{ value: string; isCombo?: boolean; supportedEfforts?: string[] }>
): string[] | undefined {
  const { baseValue } = splitModelEffort(modelStr);
  if (!baseValue) return undefined;

  if (availableModels && availableModels.length > 0) {
    const lower = baseValue.toLowerCase();
    const matched = availableModels.find((m) => m.value.toLowerCase() === lower);
    if (matched) {
      if (matched.isCombo) return undefined;
      if (Array.isArray(matched.supportedEfforts) && matched.supportedEfforts.length > 0) {
        return matched.supportedEfforts;
      }
    }
  }

  const cleanWithoutCtx = baseValue.replace(/\[1m\]$/i, "").trim();
  const slash = cleanWithoutCtx.indexOf("/");
  if (slash === -1) return undefined;

  const rawProvider = cleanWithoutCtx.slice(0, slash);
  const providerId = rawProvider.replace(/\[[^[\]]+\]$/, "");
  if (providerId === "combo") return undefined;

  const modelId = cleanWithoutCtx.slice(slash + 1);
  if (!modelId || isFixedVariantModel(modelId, [])) return undefined;

  const caps = getCapabilitiesForModel(providerId, modelId);
  if (!caps.reasoning) return undefined;

  return getSupportedEffortsForTarget(providerId, modelId, caps);
}

export interface EffortSelectorProps {
  value: string;
  supportedEfforts?: string[];
  onChange: (nextValue: string) => void;
  disabled?: boolean;
  size?: "xs" | "sm";
  className?: string;
}

export const EffortSelector: React.FC<EffortSelectorProps> = ({
  value,
  supportedEfforts,
  onChange,
  disabled = false,
  size = "sm",
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; openUp: boolean }>({
    top: 0,
    left: 0,
    openUp: false,
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const { baseValue, effort } = splitModelEffort(value);
  const baseOptions = supportedEfforts || [];

  const options =
    effort && !baseOptions.some((o) => o.toLowerCase() === effort)
      ? [...baseOptions, effort]
      : baseOptions;

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = 148;
    const estimatedHeight = Math.min((options.length + 1) * 32 + 24, 260);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < estimatedHeight && rect.top > spaceBelow;
    const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
    setMenuPos({
      top: openUp ? rect.top - 6 : rect.bottom + 6,
      left,
      openUp,
    });
  }, [options.length]);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleOutside = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        menuRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setIsOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    const handleScroll = () => updatePosition();

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", handleScroll);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", handleScroll);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [isOpen, updatePosition]);

  if (baseOptions.length === 0 && !effort) {
    return null;
  }

  const isXs = size === "xs";
  const activeLabel = formatEffortLabel(effort);

  const triggerBase = isXs
    ? "inline-flex items-center gap-1 h-[24px] px-2 rounded-md border text-[11px] font-medium transition-colors cursor-pointer shrink-0 select-none"
    : "inline-flex items-center gap-1.5 h-[32px] px-2.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer shrink-0 select-none";

  const triggerTone = effort
    ? "bg-violet-500/12 border-violet-500/35 text-violet-300 hover:bg-violet-500/20 hover:border-violet-400/50"
    : "bg-[#0F1522] border-[#1E293B] text-slate-400 hover:text-slate-200 hover:border-slate-600/80 hover:bg-[#141B2D]";

  const pickEffort = (next: string) => {
    onChange(joinModelEffort(baseValue, next));
    setIsOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setIsOpen((prev) => !prev);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        title="Reasoning effort for this target model"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`${triggerBase} ${triggerTone} disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      >
        <span
          className={`material-symbols-outlined ${isXs ? "text-[13px]" : "text-[14px]"} ${
            effort ? "text-violet-400" : "text-slate-500"
          }`}
        >
          bolt
        </span>
        <span className="font-mono tracking-tight">
          {isXs ? activeLabel : `Effort: ${activeLabel}`}
        </span>
        <span
          className={`material-symbols-outlined ${isXs ? "text-[13px]" : "text-[14px]"} opacity-60 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        >
          expand_more
        </span>
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: menuPos.top,
              left: menuPos.left,
              width: 148,
              transform: menuPos.openUp ? "translateY(-100%)" : undefined,
              zIndex: 99999,
            }}
            className="rounded-xl bg-[#0F172A]/95 backdrop-blur-xl border border-[#1E293B] shadow-[0_12px_36px_-4px_rgba(0,0,0,0.75)] p-1 text-xs animate-rt-scale-in"
          >
            <button
              type="button"
              role="option"
              aria-selected={!effort}
              onClick={() => pickEffort("")}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                !effort
                  ? "bg-blue-600/20 text-blue-300 font-medium"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span>Auto</span>
              {!effort && <span className="material-symbols-outlined text-[14px] text-blue-400">check</span>}
            </button>

            <div className="my-1 border-t border-[#1E293B]/80" />

            <div className="max-h-52 overflow-y-auto space-y-0.5">
              {options.map((opt) => {
                const lower = opt.toLowerCase();
                const isSelected = effort === lower;
                return (
                  <button
                    key={opt}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => pickEffort(lower)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-violet-500/20 text-violet-200 font-medium"
                        : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span className="font-mono text-[11.5px]">{formatEffortLabel(opt)}</span>
                    {isSelected && (
                      <span className="material-symbols-outlined text-[14px] text-violet-400">check</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
