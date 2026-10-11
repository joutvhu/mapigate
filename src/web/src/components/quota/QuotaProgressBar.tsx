import React from "react";

export interface QuotaProgressBarProps {
  label: string;
  used: number;
  total: number;
  percentage: number;
  resetInText?: string;
  unlimited?: boolean;
  recurring?: boolean;
}

export const QuotaProgressBar: React.FC<QuotaProgressBarProps> = ({
  label,
  used,
  total,
  percentage,
  resetInText = "-",
  unlimited = false,
  recurring = true,
}) => {
  const getColorClasses = (pct: number) => {
    if (pct >= 50) {
      return {
        text: "text-emerald-400",
        bg: "bg-emerald-500",
        bgTrack: "bg-emerald-500/15",
        emoji: "🟢",
      };
    }
    if (pct > 0) {
      return {
        text: "text-amber-400",
        bg: "bg-amber-500",
        bgTrack: "bg-amber-500/15",
        emoji: "🟡",
      };
    }
    return {
      text: "text-red-400",
      bg: "bg-red-500",
      bgTrack: "bg-red-500/15",
      emoji: "🔴",
    };
  };

  const colors = getColorClasses(percentage);
  const resetWord = recurring ? "Reset" : "Expires";

  return (
    <div className="space-y-1.5 py-1">
      {/* Label and Percentage */}
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-200 truncate pr-2" title={label}>
          {label}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px]">{colors.emoji}</span>
          <span className={`font-semibold ${colors.text}`}>
            {unlimited ? "100%" : `${percentage}%`}
          </span>
        </div>
      </div>

      {/* Progress Bar Track */}
      {!unlimited && (
        <div className={`h-2 rounded-full overflow-hidden ${colors.bgTrack} w-full`}>
          <div
            className={`h-full transition-all duration-300 rounded-full ${colors.bg}`}
            style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
          />
        </div>
      )}

      {/* Usage details and countdown */}
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>
          {unlimited
            ? "Unlimited"
            : total === 100
            ? `${used}% used`
            : `${used.toLocaleString()} / ${total.toLocaleString()} ${total <= 100 ? "%" : "reqs"}`}
        </span>
        {resetInText && resetInText !== "-" && (
          <div className="flex items-center gap-1 font-mono text-[10px] text-slate-400">
            <span>•</span>
            <span>
              {resetWord} in {resetInText}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
