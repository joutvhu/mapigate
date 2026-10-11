import React, { useState } from "react";
import type { AccountQuotaResult } from "../../../core/usage/types.js";
import { QuotaProgressBar } from "./QuotaProgressBar.js";

export interface ProviderLimitCardProps {
  account: AccountQuotaResult;
  loading?: boolean;
  onRefresh: (accountId: string) => Promise<void>;
  onEdit: (account: AccountQuotaResult) => void;
  onToggle: (accountId: string, isActive: boolean) => Promise<void>;
}

const PROVIDER_COLORS: Record<string, string> = {
  antigravity: "#4285F4",
  gemini: "#1A73E8",
  "gemini-cli": "#1A73E8",
  claude: "#D97757",
  codex: "#10A37F",
  openai: "#10A37F",
  github: "#24292F",
  copilot: "#24292F",
  kiro: "#FF9900",
  deepseek: "#4D6BFE",
  grok: "#E11D48",
  "grok-cli": "#E11D48",
  minimax: "#7C3AED",
  "minimax-cn": "#7C3AED",
  qoder: "#EC4899",
  "qoder-cn": "#EC4899",
  glm: "#0055FF",
  "glm-cn": "#0055FF",
};

export const ProviderLimitCard: React.FC<ProviderLimitCardProps> = ({
  account,
  loading = false,
  onRefresh,
  onEdit,
  onToggle,
}) => {
  const [refreshing, setRefreshing] = useState(false);
  const [imageError, setImageError] = useState(false);

  const providerColor = PROVIDER_COLORS[account.providerId.toLowerCase()] || "#3B82F6";
  const fallbackText = account.providerId.slice(0, 2).toUpperCase();

  const handleRefresh = async () => {
    if (refreshing || loading) return;
    setRefreshing(true);
    try {
      await onRefresh(account.accountId);
    } finally {
      setRefreshing(false);
    }
  };

  const isCardLoading = loading || refreshing;

  return (
    <div
      className={`flex flex-col justify-between bg-[#0F1420]/80 border border-[#1E293B] hover:border-slate-700/80 rounded-2xl p-4 sm:p-5 transition-all duration-200 shadow-lg ${
        !account.isActive ? "opacity-60 bg-[#0B0E17]/60" : ""
      }`}
    >
      <div className="space-y-4">
        {/* Card Header */}
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#1E293B]/70">
          <div className="flex items-center gap-3 min-w-0">
            {/* Provider Avatar */}
            <div
              className="size-10 rounded-xl flex items-center justify-center p-1.5 shrink-0 border border-white/5"
              style={{ backgroundColor: `${providerColor}20` }}
            >
              {!imageError ? (
                <img
                  src={`/providers/${account.providerId}.png`}
                  alt={account.providerId}
                  className="size-7 object-contain rounded-lg"
                  onError={() => setImageError(true)}
                />
              ) : (
                <span className="font-bold text-xs" style={{ color: providerColor }}>
                  {fallbackText}
                </span>
              )}
            </div>

            {/* Provider and Account Label */}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-slate-100 text-xs sm:text-sm capitalize truncate">
                  {account.providerId}
                </span>
                {account.plan && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    {account.plan}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 truncate max-w-[170px]" title={account.accountName}>
                {account.accountName}
              </div>
            </div>
          </div>

          {/* Action Icons */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={isCardLoading}
              title="Refresh Quota"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1E293B]/70 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <span
                className={`material-symbols-outlined text-[18px] ${
                  isCardLoading ? "animate-spin text-blue-400" : ""
                }`}
              >
                refresh
              </span>
            </button>

            {/* Edit Button */}
            <button
              onClick={() => onEdit(account)}
              title="Edit Account"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1E293B]/70 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">edit</span>
            </button>

            {/* Active Toggle Switch */}
            <label className="relative inline-flex items-center cursor-pointer ml-1" title="Toggle active status">
              <input
                type="checkbox"
                checked={account.isActive}
                onChange={(e) => onToggle(account.accountId, e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-8 h-4.5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>

        {/* Quota Progress Bars or Skeletons */}
        {isCardLoading && account.quotas.length === 0 ? (
          <div className="space-y-3 py-2">
            <div className="h-4 bg-slate-800/60 rounded animate-pulse w-3/4" />
            <div className="h-2 bg-slate-800/60 rounded-full animate-pulse w-full" />
            <div className="h-4 bg-slate-800/60 rounded animate-pulse w-2/3" />
            <div className="h-2 bg-slate-800/60 rounded-full animate-pulse w-full" />
          </div>
        ) : account.quotas.length > 0 ? (
          <div className="space-y-2.5">
            {account.quotas.map((q, idx) => (
              <QuotaProgressBar
                key={`${q.label}-${idx}`}
                label={q.label}
                used={q.used}
                total={q.total}
                percentage={q.remainingPercentage}
                resetInText={q.resetInText}
                unlimited={q.unlimited}
                recurring={q.recurring}
              />
            ))}
          </div>
        ) : (
          <div className="py-4 text-center text-xs text-slate-400 bg-[#0A0D14]/50 rounded-xl border border-[#1E293B]/50 px-3">
            {account.error ? (
              <span className="text-red-400/90">{account.error}</span>
            ) : (
              account.message || "No quota data available."
            )}
          </div>
        )}
      </div>

      {/* Card Footer status info */}
      <div className="pt-3 mt-2 border-t border-[#1E293B]/50 flex items-center justify-between text-[10px] text-slate-500 font-mono">
        <span>
          {account.isActive ? (
            <span className="text-emerald-400 font-medium">Active</span>
          ) : (
            <span className="text-slate-400">Inactive</span>
          )}
        </span>
        {account.lastFetchedAt && (
          <span>
            Updated {new Date(account.lastFetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
    </div>
  );
};
