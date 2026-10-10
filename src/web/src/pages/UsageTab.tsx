import React, { useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  SEED_HOURLY_USAGE as HOURLY_METRICS_DATA,
  SEED_REQUESTS,
  TOPOLOGY_NODES,
} from "../constants/mockData";

export const UsageTab: React.FC = () => {
  const [chartMetric, setChartMetric] = useState<"tokens" | "requests" | "cost">("tokens");
  const [timePeriod, setTimePeriod] = useState("today");
  const [realStats, setRealStats] = useState<any>(null);
  const [recentLogs, setRecentLogs] = useState<any[]>(SEED_REQUESTS);
  const [activeNodeId, setActiveNodeId] = useState<string>("antigravity");

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => setRealStats(d))
      .catch(() => {});

    fetch("/api/stats/logs?limit=15")
      .then((r) => r.json())
      .then((logs) => {
        if (Array.isArray(logs) && logs.length > 0) {
          setRecentLogs(
            logs.map((l: any) => ({
              model: l.actualModel || l.requestedModel,
              inTok: (l.promptTokens || 0).toLocaleString(),
              outTok: (l.completionTokens || 0).toLocaleString(),
              when: new Date(l.timestamp).toLocaleTimeString(),
              ok: l.status === "success",
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6 w-full px-2 sm:px-4 pb-16 animate-rt-fade-in">
      {/* Top Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="bg-[#0E1320] p-1 rounded-xl border border-[#1E293B] flex items-center">
          <button className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-xs">
            Overview
          </button>
          <button className="px-3.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white transition-colors">
            Details
          </button>
        </div>

        <div className="bg-[#0E1320] p-1 rounded-xl border border-[#1E293B] flex items-center text-xs">
          {["today", "24h", "7d", "30d", "60d", "all"].map((p) => (
            <button
              key={p}
              onClick={() => setTimePeriod(p)}
              className={`px-3 py-1 rounded-lg uppercase font-semibold transition-all ${
                timePeriod === p
                  ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* 5 KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="rt-card text-center p-4">
          <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">
            TOTAL REQUESTS
          </span>
          <p className="text-2xl font-black text-white mt-1.5">
            {realStats?.totalRequests || 290}
          </p>
        </div>

        <div className="rt-card text-center p-4">
          <span className="text-[10px] font-bold text-blue-400 tracking-wider uppercase">
            INPUT TOKENS
          </span>
          <p className="text-2xl font-black text-blue-400 mt-1.5">
            {realStats?.totalPromptTokens ? realStats.totalPromptTokens.toLocaleString() : "25,716,174"}
          </p>
        </div>

        <div className="rt-card text-center p-4">
          <span className="text-[10px] font-bold text-cyan-400 tracking-wider uppercase">
            RTK TOKENS SAVED
          </span>
          <p className="text-2xl font-black text-cyan-400 mt-1.5">
            {realStats?.totalTokensSaved ? realStats.totalTokensSaved.toLocaleString() : "23,332,740"}
          </p>
        </div>

        <div className="rt-card text-center p-4">
          <span className="text-[10px] font-bold text-emerald-400 tracking-wider uppercase">
            OUTPUT TOKENS
          </span>
          <p className="text-2xl font-black text-emerald-400 mt-1.5">
            {realStats?.totalCompletionTokens ? realStats.totalCompletionTokens.toLocaleString() : "183,873"}
          </p>
        </div>

        <div className="rt-card text-center p-4">
          <span className="text-[10px] font-bold text-indigo-400 tracking-wider uppercase">
            EST. COST SAVED
          </span>
          <p className="text-2xl font-black text-white mt-1.5">
            ${realStats?.estimatedCostSavedUsd || "8.45"}
          </p>
          <span className="text-[10px] text-slate-500 block">via RTK compression</span>
        </div>
      </div>

      {/* Middle Section: Radiating Topology Graph + Live Requests Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Topology Diagram */}
        <div className="lg:col-span-7 rt-card p-4.5 flex flex-col justify-between overflow-hidden">
          <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wide flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-400 text-[18px]">hub</span>
              Active Routing Topology
            </span>
            <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1.5">
              <span className="rt-beacon size-2 bg-emerald-400" />
              12 Nodes Operational
            </span>
          </div>

          <div className="relative h-[320px] w-full flex items-center justify-center">
            <svg className="w-full h-full" viewBox="0 0 540 380">
              <defs>
                <linearGradient id="streamEnergyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#10B981" />
                  <stop offset="50%" stopColor="#06B6D4" />
                  <stop offset="100%" stopColor="#3B82F6" />
                </linearGradient>
              </defs>

              {/* Passive lines to all nodes */}
              {TOPOLOGY_NODES.map((node) => {
                const isActive = activeNodeId === node.id;
                if (isActive) return null;
                return (
                  <line
                    key={node.id}
                    x1="270"
                    y1="190"
                    x2={node.x}
                    y2={node.y}
                    stroke={node.color}
                    strokeWidth="1.2"
                    strokeOpacity="0.25"
                    strokeDasharray="4 4"
                  />
                );
              })}

              {/* Active streaming curved flow if node is selected (like Screenshot 1!) */}
              {(() => {
                const activeNode = TOPOLOGY_NODES.find((n) => n.id === activeNodeId);
                if (!activeNode) return null;
                const midX = (270 + activeNode.x) / 2;
                const midY = (190 + activeNode.y) / 2 - 25;
                const pathD = `M 270 190 Q ${midX} ${midY} ${activeNode.x} ${activeNode.y}`;
                return (
                  <g>
                    {/* Glowing under-stroke */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#06B6D4"
                      strokeWidth="7"
                      strokeOpacity="0.3"
                      strokeLinecap="round"
                    />
                    {/* Animated dashed stream */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke="url(#streamEnergyGradient)"
                      strokeWidth="3.5"
                      strokeDasharray="8 6"
                      strokeLinecap="round"
                      style={{ animation: "rtFlowLine 1.2s linear infinite" }}
                    />
                    {/* Moving energy beads */}
                    <circle cx={midX} cy={midY + 5} r="3" fill="#FDE047" />
                  </g>
                );
              })()}

              {/* Center Gateway Node with Glow */}
              <circle cx="270" cy="190" r="34" fill="#0E1320" stroke="#F59E0B" strokeWidth="2.5" />
              <circle cx="270" cy="190" r="40" fill="none" stroke="#F59E0B" strokeWidth="1" strokeOpacity="0.2" className="animate-pulse" />
              <text x="270" y="187" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="bold">
                Routen
              </text>
              <text x="270" y="202" textAnchor="middle" fill="#F59E0B" fontSize="9" fontWeight="bold">
                1 Gateway
              </text>

              {/* Provider Nodes */}
              {TOPOLOGY_NODES.map((node) => {
                const isActive = activeNodeId === node.id;
                return (
                  <g
                    key={node.id}
                    onClick={() => setActiveNodeId(node.id)}
                    className="cursor-pointer transition-transform hover:scale-105"
                  >
                    <rect
                      x={node.x - 38}
                      y={node.y - 12}
                      width="76"
                      height="24"
                      rx="8"
                      fill="#0F1420"
                      stroke={isActive ? "#F59E0B" : node.color}
                      strokeWidth={isActive ? 2 : 1.2}
                      className={isActive ? "filter drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" : ""}
                    />
                    <text
                      x={node.x}
                      y={node.y + 4}
                      textAnchor="middle"
                      fill={isActive ? "#FFFFFF" : "#E2E8F0"}
                      fontSize="9.5"
                      fontWeight={isActive ? "bold" : "600"}
                    >
                      {node.name}
                    </text>
                    {isActive && (
                      <circle cx={node.x + 32} cy={node.y - 6} r="2.5" fill="#F59E0B" className="animate-ping" />
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Live Requests Stream */}
        <div className="lg:col-span-5 rt-card p-4.5 flex flex-col h-[380px]">
          <div className="flex items-center justify-between pb-3 border-b border-[#1E293B] shrink-0">
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
              <span className="material-symbols-outlined text-blue-400 text-[18px]">history</span>
              Recent Requests
            </span>
            <span className="text-[10px] text-blue-400 font-mono bg-blue-500/10 px-2 py-0.5 rounded">
              Live Stream
            </span>
          </div>

          <div className="flex-1 overflow-y-auto mt-2 space-y-1">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="text-slate-500 text-[10px] uppercase border-b border-[#1E293B]">
                  <th className="pb-1.5 font-semibold">Model</th>
                  <th className="pb-1.5 font-semibold text-right">In / Out</th>
                  <th className="pb-1.5 font-semibold text-right">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B]/60">
                {recentLogs.map((r, i) => (
                  <tr key={i} className="hover:bg-white/5 transition-colors">
                    <td className="py-2 flex items-center gap-1.5 truncate max-w-[130px]">
                      <span
                        className={`size-1.5 rounded-full shrink-0 ${
                          r.ok ? "bg-emerald-400" : "bg-red-400"
                        }`}
                      />
                      <span className="text-white text-[11px] truncate font-medium">{r.model}</span>
                    </td>
                    <td className="py-2 text-right whitespace-nowrap text-[11px]">
                      <span className="text-blue-400">{r.inTok}↑</span>{" "}
                      <span className="text-emerald-400">{r.outTok}↓</span>
                    </td>
                    <td className="py-2 text-right text-[10px] text-slate-400 whitespace-nowrap">
                      {r.when}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Bottom Area Chart: Blue Gradient & Interactive Tabs */}
      <div className="rt-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="bg-[#0A0D14] p-1 rounded-xl border border-[#1E293B] flex items-center text-xs">
            <button
              onClick={() => setChartMetric("tokens")}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                chartMetric === "tokens" ? "bg-blue-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
              }`}
            >
              Tokens Volume
            </button>
            <button
              onClick={() => setChartMetric("requests")}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                chartMetric === "requests" ? "bg-blue-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
              }`}
            >
              Requests Count
            </button>
            <button
              onClick={() => setChartMetric("cost")}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                chartMetric === "cost" ? "bg-blue-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
              }`}
            >
              Cost Projection
            </button>
          </div>
          <span className="text-xs text-slate-400 font-mono">24h Timeline Distribution</span>
        </div>

        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={HOURLY_METRICS_DATA}>
              <defs>
                <linearGradient id="cyberBlueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" stroke="#475569" fontSize={11} tickLine={false} />
              <YAxis stroke="#475569" fontSize={11} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0F1420",
                  borderColor: "#1E293B",
                  borderRadius: "10px",
                  fontSize: "12px",
                  color: "#fff",
                }}
              />
              <Area
                type="monotone"
                dataKey={chartMetric}
                stroke="#3B82F6"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#cyberBlueGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
