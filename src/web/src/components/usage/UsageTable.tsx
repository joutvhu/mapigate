import React, { useState } from "react";
import type {
  CounterBucket,
  ModelCounterBucket,
  AccountCounterBucket,
} from "../../../../shared/types/index.js";
import { Table, Layers } from "lucide-react";

interface UsageTableProps {
  byProvider: Record<string, CounterBucket>;
  byModel: Record<string, ModelCounterBucket>;
  byAccount: Record<string, AccountCounterBucket>;
}

export const UsageTable: React.FC<UsageTableProps> = ({
  byProvider,
  byModel,
  byAccount,
}) => {
  const [groupBy, setGroupBy] = useState<"provider" | "model" | "account">("model");

  let tableData: Array<{
    id: string;
    name: string;
    sublabel?: string;
    requests: number;
    promptTokens: number;
    cachedTokens: number;
    completionTokens: number;
    cost: number;
    lastUsed?: string | number;
  }> = [];

  if (groupBy === "provider") {
    tableData = Object.entries(byProvider || {}).map(([id, d]) => ({
      id,
      name: id.toUpperCase(),
      sublabel: "Provider Gateway",
      requests: d.requests || 0,
      promptTokens: d.promptTokens || 0,
      cachedTokens: d.cachedTokens || 0,
      completionTokens: d.completionTokens || 0,
      cost: d.cost || 0,
    }));
  } else if (groupBy === "model") {
    tableData = Object.entries(byModel || {}).map(([id, d]) => ({
      id,
      name: d.rawModel || id,
      sublabel: d.provider ? `Provider: ${d.provider}` : undefined,
      requests: d.requests || 0,
      promptTokens: d.promptTokens || 0,
      cachedTokens: d.cachedTokens || 0,
      completionTokens: d.completionTokens || 0,
      cost: d.cost || 0,
      lastUsed: d.lastUsed,
    }));
  } else {
    tableData = Object.entries(byAccount || {}).map(([id, d]) => ({
      id,
      name: d.accountName || d.accountId || id,
      sublabel: d.rawModel ? `${d.rawModel} (${d.provider || "default"})` : undefined,
      requests: d.requests || 0,
      promptTokens: d.promptTokens || 0,
      cachedTokens: d.cachedTokens || 0,
      completionTokens: d.completionTokens || 0,
      cost: d.cost || 0,
      lastUsed: d.lastUsed,
    }));
  }

  tableData.sort((a, b) => b.requests - a.requests);

  const fmt = (n?: number) => (n || 0).toLocaleString();
  const fmtCost = (n?: number) => `$${(n || 0).toFixed(4)}`;

  return (
    <div className="bg-[#0E1320] border border-[#1E293B] rounded-xl p-4 sm:p-5 flex flex-col shadow-xs w-full">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Table className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm sm:text-base font-bold text-white">
            Usage Breakdown
          </h3>
          <span className="text-xs text-slate-500">
            ({tableData.length} records)
          </span>
        </div>

        {/* Group By selector */}
        <div className="bg-[#151C2C] p-0.5 rounded-lg border border-[#243048] flex items-center text-xs">
          <span className="px-2 text-slate-500 flex items-center gap-1">
            <Layers className="w-3 h-3" /> Group:
          </span>
          {(["model", "provider", "account"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              className={`px-3 py-1.5 rounded-md font-semibold capitalize transition-all ${
                groupBy === g
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {tableData.length === 0 ? (
        <div className="py-12 text-center text-slate-500 text-sm">
          No usage records found for this period.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                <th className="py-2.5 px-3">Name</th>
                <th className="py-2.5 px-3 text-right">Requests</th>
                <th className="py-2.5 px-3 text-right text-blue-400">Input Tokens</th>
                <th className="py-2.5 px-3 text-right text-cyan-400">Cached</th>
                <th className="py-2.5 px-3 text-right text-emerald-400">Output Tokens</th>
                <th className="py-2.5 px-3 text-right text-amber-400">Est. Cost</th>
                <th className="py-2.5 px-3 text-right">Last Used</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {tableData.map((row) => (
                <tr key={row.id} className="hover:bg-slate-800/25 transition-colors">
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-slate-200">{row.name}</div>
                    {row.sublabel && (
                      <div className="text-[10px] text-slate-500 mt-0.5">{row.sublabel}</div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-300">
                    {fmt(row.requests)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-blue-400/90">
                    {fmt(row.promptTokens)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-cyan-400/90">
                    {fmt(row.cachedTokens)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-emerald-400/90">
                    {fmt(row.completionTokens)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-semibold text-amber-400/90">
                    {fmtCost(row.cost)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-400 text-[11px]">
                    {row.lastUsed ? new Date(row.lastUsed).toLocaleDateString() : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
