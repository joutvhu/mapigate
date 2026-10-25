import React from "react";
import type { CounterBucket } from "../../../../shared/types/index.js";
import { Server } from "lucide-react";

interface ProviderBarChartProps {
  byProvider: Record<string, CounterBucket>;
}

export const ProviderBarChart: React.FC<ProviderBarChartProps> = ({ byProvider }) => {
  const providerList = Object.entries(byProvider || {}).map(([providerId, data]) => {
    const totalTokens = (data.promptTokens || 0) + (data.completionTokens || 0);
    return {
      id: providerId,
      requests: data.requests || 0,
      totalTokens,
      cost: data.cost || 0,
    };
  });

  const totalRequestsAll = providerList.reduce((acc, p) => acc + p.requests, 0) || 1;
  const sorted = providerList.sort((a, b) => b.requests - a.requests);

  const providerColors: Record<string, string> = {
    antigravity: "#3B82F6",
    claude: "#F97316",
    anthropic: "#F97316",
    openai: "#10B981",
    github: "#6366F1",
    gemini: "#38BDF8",
    deepseek: "#8B5CF6",
    default: "#64748B",
  };

  return (
    <div className="bg-[#0E1320] border border-[#1E293B] rounded-xl p-4 sm:p-5 flex flex-col justify-between shadow-xs w-full h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
          <Server className="w-4 h-4 text-cyan-400" />
          By Provider
        </h3>
        <span className="text-xs text-slate-400">
          {sorted.length} {sorted.length === 1 ? "provider" : "providers"} active
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="py-12 text-center text-slate-500 text-xs">
          No provider activity recorded yet.
        </div>
      ) : (
        <div className="space-y-3.5">
          {sorted.map((item) => {
            const pct = Math.round((item.requests / totalRequestsAll) * 100);
            const color = providerColors[item.id.toLowerCase()] || providerColors.default;

            return (
              <div key={item.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 truncate">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="font-semibold text-slate-200 uppercase tracking-wide truncate">
                      {item.id}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-right shrink-0">
                    <span className="font-mono text-slate-400">
                      {item.requests.toLocaleString()} reqs ({pct}%)
                    </span>
                    <span className="font-mono text-xs font-semibold text-slate-200">
                      ${item.cost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Allocation bar */}
                <div className="w-full bg-[#151D2F] h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(4, pct)}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
