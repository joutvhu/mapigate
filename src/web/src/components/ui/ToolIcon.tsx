import React, { useState, useEffect } from "react";

export type ToolIconSize = "sm" | "md" | "lg" | "xl";

export interface ToolIconProps {
  src?: string;
  name?: string;
  color?: string;
  iconBg?: string;
  size?: ToolIconSize;
  fallback?: React.ReactNode;
  className?: string;
  imgClassName?: string;
  style?: React.CSSProperties;
}

const SIZE_CONFIG: Record<
  ToolIconSize,
  {
    container: string;
    text: string;
    icon: string;
  }
> = {
  sm: {
    container: "size-8 rounded-lg p-1",
    text: "text-[11px] font-bold",
    icon: "text-[16px]",
  },
  md: {
    container: "size-10 rounded-xl p-1.5",
    text: "text-xs font-bold",
    icon: "text-[20px]",
  },
  lg: {
    container: "size-12 rounded-2xl p-2",
    text: "text-sm font-bold",
    icon: "text-[24px]",
  },
  xl: {
    container: "size-14 rounded-2xl p-2.5",
    text: "text-base font-bold",
    icon: "text-[28px]",
  },
};

function resolveBackgroundColor(iconBg?: string, color?: string): string {
  if (iconBg) return iconBg;
  if (color && /^#[0-9a-fA-F]{6}/.test(color)) {
    return `${color.slice(0, 7)}18`;
  }
  return "#0D1322";
}

function isLightColor(color?: string): boolean {
  if (!color) return false;
  const hex = color.replace("#", "");
  if (hex.length >= 6) {
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return r * 0.299 + g * 0.587 + b * 0.114 > 186;
  }
  return false;
}

export const ToolIcon: React.FC<ToolIconProps> = ({
  src,
  name,
  color,
  iconBg,
  size = "md",
  fallback,
  className = "",
  imgClassName = "",
  style,
}) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  const cfg = SIZE_CONFIG[size] || SIZE_CONFIG.md;
  const bgColor = resolveBackgroundColor(iconBg, color);
  const isLightBg = isLightColor(iconBg || (color ? `${color.slice(0, 7)}` : ""));
  const borderColor = isLightBg ? "border-black/10" : "border-[#1E293B]";

  const renderFallback = () => {
    if (fallback) return fallback;
    if (name) {
      const initial = name.trim().slice(0, 2).toUpperCase();
      const textColor = isLightColor(bgColor) ? "#0F172A" : color || "#94A3B8";
      return (
        <span className={cfg.text} style={{ color: textColor }}>
          {initial}
        </span>
      );
    }
    return (
      <span className={`material-symbols-outlined ${cfg.icon} text-slate-400`}>
        smart_toy
      </span>
    );
  };

  return (
    <div
      className={`flex items-center justify-center shrink-0 border overflow-hidden ${cfg.container} ${borderColor} ${className}`}
      style={{
        backgroundColor: bgColor,
        ...style,
      }}
    >
      {src && !hasError ? (
        <img
          src={src}
          alt={name || "Tool icon"}
          className={`size-full object-contain ${imgClassName}`}
          onError={() => setHasError(true)}
        />
      ) : (
        renderFallback()
      )}
    </div>
  );
};

export default ToolIcon;
