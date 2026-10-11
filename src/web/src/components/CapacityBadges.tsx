import React from "react";
import { getCapabilitiesForModel, type ModelCapabilities } from "../../../core/capabilities/index.js";

export interface CapacityBadgesProps {
  caps?: Partial<ModelCapabilities> | { [key: string]: any } | null;
  model?: string;
  className?: string;
  showLabels?: boolean;
  size?: "xs" | "sm" | "md";
}

export interface CapacityMetaItem {
  key: string;
  label: string;
  icon: string;
  desc: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
}

export const CAPACITY_BADGE_META: Record<string, CapacityMetaItem> = {
  vision: {
    key: "vision",
    label: "Vision",
    icon: "visibility",
    desc: "Supports image inputs (png, jpg, webp, base64)",
    colorClass: "text-cyan-400",
    bgClass: "bg-cyan-500/10",
    borderClass: "border-cyan-500/20",
  },
  pdf: {
    key: "pdf",
    label: "PDF",
    icon: "picture_as_pdf",
    desc: "Supports PDF and document parsing",
    colorClass: "text-orange-400",
    bgClass: "bg-orange-500/10",
    borderClass: "border-orange-500/20",
  },
  audio: {
    key: "audio",
    label: "Audio",
    icon: "graphic_eq",
    desc: "Supports raw voice and audio speech input",
    colorClass: "text-purple-400",
    bgClass: "bg-purple-500/10",
    borderClass: "border-purple-500/20",
  },
  thinking: {
    key: "thinking",
    label: "Thinking",
    icon: "psychology",
    desc: "Supports reasoning and thinking trace",
    colorClass: "text-emerald-400",
    bgClass: "bg-emerald-500/10",
    borderClass: "border-emerald-500/20",
  },
};

export function resolveModelCapabilities(modelStr?: string | null): ModelCapabilities | null {
  if (!modelStr) return null;
  const slash = modelStr.indexOf("/");
  const provider = slash === -1 ? null : modelStr.slice(0, slash);
  const model = slash === -1 ? modelStr : modelStr.slice(slash + 1);
  return getCapabilitiesForModel(provider, model);
}

export const CapacityBadges: React.FC<CapacityBadgesProps> = ({
  caps,
  model,
  className = "",
  showLabels = false,
  size = "sm",
}) => {
  const resolvedCaps = caps || (model ? resolveModelCapabilities(model) : null);
  if (!resolvedCaps) return null;

  const hasVision = Boolean(resolvedCaps.vision);
  const hasPdf = Boolean(resolvedCaps.pdf);
  const hasAudio = Boolean(resolvedCaps.audioInput || (resolvedCaps as any).audio);
  const hasThinking = Boolean(
    resolvedCaps.reasoning ||
      (resolvedCaps as any).thinking ||
      (resolvedCaps.thinkingFormat && resolvedCaps.thinkingFormat !== null)
  );

  const activeBadges: CapacityMetaItem[] = [];
  if (hasVision) activeBadges.push(CAPACITY_BADGE_META.vision);
  if (hasPdf) activeBadges.push(CAPACITY_BADGE_META.pdf);
  if (hasAudio) activeBadges.push(CAPACITY_BADGE_META.audio);
  if (hasThinking) activeBadges.push(CAPACITY_BADGE_META.thinking);

  if (activeBadges.length === 0) return null;

  const iconSizes = {
    xs: "text-[12px]",
    sm: "text-[14px]",
    md: "text-[16px]",
  };

  const textSizes = {
    xs: "text-[9.5px]",
    sm: "text-[10.5px]",
    md: "text-xs",
  };

  return (
    <div className={`inline-flex items-center gap-1.5 flex-wrap ${className}`}>
      {activeBadges.map((badge) => (
        <span
          key={badge.key}
          title={`${badge.label}: ${badge.desc}`}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border font-medium transition-all ${
            badge.colorClass
          } ${badge.bgClass} ${badge.borderClass} ${textSizes[size]}`}
        >
          <span className={`material-symbols-outlined leading-none ${iconSizes[size]}`}>
            {badge.icon}
          </span>
          {showLabels && <span>{badge.label}</span>}
        </span>
      ))}
    </div>
  );
};
