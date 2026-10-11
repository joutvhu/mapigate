import React from "react";
import type { UsageStatsResult } from "../../../../shared/types/index.js";
import { Zap, ArrowDownLeft, Database, ArrowUpRight, DollarSign, ShieldCheck } from "lucide-react";

interface OverviewCardsProps {
  stats: UsageStatsResult | null;
  loading?: boolean;
}

export const OverviewCards: React.FC<OverviewCardsProps> = ({ stats, loading }) => {
  const fmt = (n?: number) => (n || 0).toLocaleString();
  const fmtCost = (n?: number) => `$${(n || 0).toFixed(2)}`;

  const totalRequests = stats?.totalRequests ?? 0;
  const promptTokens = stats?.totalPromptTokens ?? 0;
  const cachedTokens = stats?.totalCachedTokens ?? 0;
  const completionTokens = stats?.totalCompletionTokens ?? 0;
  const totalCost = stats?.totalCost ?? 0;
  const tokensSaved = stats?.totalTokensSaved ?? 0;

  return (
    <div className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
      {/* 1. Total Requests */}
      <div className="bg-[#0E1320] border border-[#1E293B] rounded-xl p-4 flex flex-col justify-between hover:border-blue-500/30 transition-all shadow-xs">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider">Total Requests</span>
          <Zap className="w-4 h-4 text-blue-400" />
        </div>
        <div>
          <div className="text-xl sm:text-2xl font-black text-white truncate" title={fmt(totalRequests)}>
            {loading ? "..." : fmt(totalRequests)}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">API Invocations</span>
        </div>
      </div>

      {/* 2. Total Input Tokens */}
      <div className="bg-[#0E1320] border border-[#1E293B] rounded-xl p-4 flex flex-col justify-between hover:border-blue-500/30 transition-all shadow-xs">
        <div className="flex items-center justify-between text-blue-400 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider">Input Tokens</span>
          <ArrowDownLeft className="w-4 h-4 text-blue-400" />
        </div>
        <div>
          <div className="text-xl sm:text-2xl font-black text-blue-400 truncate" title={fmt(promptTokens)}>
            {loading ? "..." : fmt(promptTokens)}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Prompt & context</span>
        </div>
      </div>

      {/* 3. Cached Tokens */}
      <div className="bg-[#0E1320] border border-[#1E293B] rounded-xl p-4 flex flex-col justify-between hover:border-cyan-500/30 transition-all shadow-xs">
        <div className="flex items-center justify-between text-cyan-400 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider">Cached Tokens</span>
          <Database className="w-4 h-4 text-cyan-400" />
        </div>
        <div>
          <div className="text-xl sm:text-2xl font-black text-cyan-400 truncate" title={fmt(cachedTokens)}>
            {loading ? "..." : fmt(cachedTokens)}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Prompt cache hits</span>
        </div>
      </div>

      {/* 4. Output Tokens */}
      <div className="bg-[#0E1320] border border-[#1E293B] rounded-xl p-4 flex flex-col justify-between hover:border-emerald-500/30 transition-all shadow-xs">
        <div className="flex items-center justify-between text-emerald-400 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider">Output Tokens</span>
          <ArrowUpRight className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <div className="text-xl sm:text-2xl font-black text-emerald-400 truncate" title={fmt(completionTokens)}>
            {loading ? "..." : fmt(completionTokens)}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Generated output</span>
        </div>
      </div>

      {/* 5. RTK Tokens Saved */}
      <div className="bg-[#0E1320] border border-[#1E293B] rounded-xl p-4 flex flex-col justify-between hover:border-purple-500/30 transition-all shadow-xs">
        <div className="flex items-center justify-between text-purple-400 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider">RTK Saved</span>
          <ShieldCheck className="w-4 h-4 text-purple-400" />
        </div>
        <div>
          <div className="text-xl sm:text-2xl font-black text-purple-400 truncate" title={fmt(tokensSaved)}>
            {loading ? "..." : fmt(tokensSaved)}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Context optimized</span>
        </div>
      </div>

      {/* 6. Est. Cost */}
      <div className="bg-[#0E1320] border border-[#1E293B] rounded-xl p-4 flex flex-col justify-between hover:border-amber-500/30 transition-all shadow-xs">
        <div className="flex items-center justify-between text-amber-400 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider">Est. Cost</span>
          <DollarSign className="w-4 h-4 text-amber-400" />
        </div>
        <div>
          <div className="text-xl sm:text-2xl font-black text-amber-400 truncate" title={fmtCost(totalCost)}>
            {loading ? "..." : `~${fmtCost(totalCost)}`}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block" title="Estimated, not actual billing">
            Estimated, not actual
          </span>
        </div>
      </div>
    </div>
  );
};
