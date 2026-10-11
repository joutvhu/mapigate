import React, { useState } from "react";
import type { ModelCounterBucket } from "../../../../shared/types/index.js";
import { Cpu } from "lucide-react";

interface TopModelsChartProps {
  byModel: Record<string, ModelCounterBucket>;
}

export const TopModelsChart: React.FC<TopModelsChartProps> = ({ byModel }) => {
  const [sortBy, setSortBy] = useState<"tokens" | "requests">("tokens");

  const modelsList = Object.entries(byModel || {}).map(([key, data]) => {
    const totalTokens = (data.promptTokens || 0) + (data.completionTokens || 0);
    return {
      key,
      name: data.rawModel || key,
      provider: data.provider || "default",
      requests: data.requests || 0,
      totalTokens,
      promptTokens: data.promptTokens || 0,
      completionTokens: data.completionTokens || 0,
      cost: data.cost || 0,
    };
  });

  const sortedModels = modelsList
    .sort((a, b) => (sortBy === "tokens" ? b.totalTokens - a.totalTokens : b.requests - a.requests))
    .slice(0, 5);

  const maxVal = sortedModels.length > 0
    ? (sortBy === "tokens" ? sortedModels[0].totalTokens : sortedModels[0].requests)
    : 1;

  return (
    <div className="bg-[#0E1320] border border-[#1E293B] rounded-xl p-4 sm:p-5 flex flex-col justify-between shadow-xs w-full h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
          <Cpu className="w-4 h-4 text-blue-400" />
          Top Models
        </h3>
        <div className="bg-[#151C2C] p-0.5 rounded-lg border border-[#243048] flex items-center text-xs">
          <button
            onClick={() => setSortBy("tokens")}
            className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
              sortBy === "tokens"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Tokens
          </button>
          <button
            onClick={() => setSortBy("requests")}
            className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
              sortBy === "requests"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Requests
          </button>
        </div>
      </div>

      {sortedModels.length === 0 ? (
        <div className="py-12 text-center text-slate-500 text-xs">
          No model usage recorded yet.
        </div>
      ) : (
        <div className="space-y-3.5">
          {sortedModels.map((item, index) => {
            const currentVal = sortBy === "tokens" ? item.totalTokens : item.requests;
            const percentage = maxVal > 0 ? Math.round((currentVal / maxVal) * 100) : 0;

            return (
              <div key={item.key} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 truncate max-w-[70%]">
                    <span className="w-4.5 h-4.5 rounded-sm bg-slate-800 text-slate-300 font-bold text-[10px] flex items-center justify-center shrink-0">
                      {index + 1}
                    </span>
                    <span className="font-semibold text-slate-200 truncate" title={item.name}>
                      {item.name}
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800/80 text-slate-400 border border-slate-700/50 shrink-0">
                      {item.provider}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono font-bold text-slate-200">
                      {sortBy === "tokens" ? item.totalTokens.toLocaleString() : item.requests.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-500 ml-1">
                      {sortBy === "tokens" ? "tok" : "req"}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-[#151D2F] h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(4, percentage)}%` }}
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
