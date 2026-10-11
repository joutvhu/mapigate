import React, { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { ChartDataPoint } from "../../../../shared/types/index.js";

interface UsageChartProps {
  data: ChartDataPoint[];
  period: string;
  loading?: boolean;
}

export const UsageChart: React.FC<UsageChartProps> = ({ data, period, loading }) => {
  const [metric, setMetric] = useState<"tokens" | "requests" | "cost">("tokens");

  const formatYAxis = (val: number) => {
    if (metric === "cost") {
      return `$${val >= 10 ? val.toFixed(0) : val.toFixed(2)}`;
    }
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `${(val / 1_000).toFixed(0)}k`;
    return String(val);
  };

  const metricColors = {
    tokens: {
      stroke: "#38BDF8", // cyan-400
      fill: "#0284C7",   // sky-600
      label: "Total Tokens",
    },
    requests: {
      stroke: "#A855F7", // purple-500
      fill: "#7E22CE",   // purple-700
      label: "Requests",
    },
    cost: {
      stroke: "#F59E0B", // amber-500
      fill: "#B45309",   // amber-700
      label: "Estimated Cost ($)",
    },
  };

  const activeColor = metricColors[metric];

  const totalForCurrentMetric = data.reduce((acc, curr) => acc + (curr[metric] || 0), 0);

  return (
    <div className="bg-[#0E1320] border border-[#1E293B] rounded-xl p-4 sm:p-5 flex flex-col shadow-xs w-full">
      {/* Header with Title and Metric Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
            Usage Trend
            <span className="text-xs font-normal text-slate-500">
              ({period.toUpperCase()})
            </span>
          </h3>
          <span className="text-xs text-slate-400 mt-0.5 block">
            Aggregated {activeColor.label.toLowerCase()}:{" "}
            <span className="font-semibold text-slate-200">
              {metric === "cost" ? `$${totalForCurrentMetric.toFixed(2)}` : totalForCurrentMetric.toLocaleString()}
            </span>
          </span>
        </div>

        {/* Metric Segmented Control */}
        <div className="bg-[#151C2C] p-0.5 rounded-lg border border-[#243048] flex items-center text-xs">
          {(["tokens", "requests", "cost"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-3 py-1.5 rounded-md font-semibold capitalize transition-all ${
                metric === m
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Area */}
      <div className="h-64 sm:h-72 w-full">
        {loading ? (
          <div className="h-full w-full flex items-center justify-center text-slate-500 text-sm">
            Loading metrics...
          </div>
        ) : data.length === 0 ? (
          <div className="h-full w-full flex items-center justify-center text-slate-500 text-sm">
            No request activity recorded for this period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id={`gradient-${metric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={activeColor.stroke} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={activeColor.stroke} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="#64748B"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#1E293B" }}
              />
              <YAxis
                stroke="#64748B"
                fontSize={11}
                tickFormatter={formatYAxis}
                tickLine={false}
                axisLine={{ stroke: "#1E293B" }}
                width={45}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload as ChartDataPoint;
                    return (
                      <div className="bg-[#0B0F19]/95 backdrop-blur-md border border-[#2A374F] rounded-lg p-3 text-xs shadow-xl min-w-[160px]">
                        <p className="font-bold text-slate-200 mb-1.5 border-b border-slate-800 pb-1">
                          {item.time || label}
                        </p>
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-cyan-400">
                            <span>Tokens:</span>
                            <span className="font-mono font-semibold">{item.tokens.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between items-center text-purple-400">
                            <span>Requests:</span>
                            <span className="font-mono font-semibold">{item.requests.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between items-center text-amber-400">
                            <span>Cost:</span>
                            <span className="font-mono font-semibold">${item.cost.toFixed(4)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey={metric}
                stroke={activeColor.stroke}
                strokeWidth={2.5}
                fillOpacity={1}
                fill={`url(#gradient-${metric})`}
                dot={false}
                activeDot={{ r: 5, fill: activeColor.stroke, stroke: "#0E1320", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
