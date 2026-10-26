import React, { useState, useEffect, useCallback, useRef } from "react";
import type {
  UsageStatsResult,
  ChartDataPoint,
  ActiveRequestItem,
  RecentRequestItem,
} from "../../../shared/types/index.js";
import { OverviewCards } from "../components/usage/OverviewCards.js";
import { ProviderTopology } from "../components/usage/ProviderTopology.js";
import { UsageChart } from "../components/usage/UsageChart.js";
import { TopModelsChart } from "../components/usage/TopModelsChart.js";
import { ProviderBarChart } from "../components/usage/ProviderBarChart.js";
import { UsageTable } from "../components/usage/UsageTable.js";
import { RequestDetailsView } from "../components/usage/RequestDetailsView.js";
import { Activity, LayoutDashboard, ListFilter, RefreshCw } from "lucide-react";
import { AuthService } from "../services/authService.js";

export const UsageTab: React.FC = () => {
  const [viewMode, setViewMode] = useState<"overview" | "details">("overview");
  const [period, setPeriod] = useState<string>("7d");
  const [stats, setStats] = useState<UsageStatsResult | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [activeRequests, setActiveRequests] = useState<ActiveRequestItem[]>([]);
  const [recentRequests, setRecentRequests] = useState<RecentRequestItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingChart, setLoadingChart] = useState<boolean>(true);
  const [sseConnected, setSseConnected] = useState<boolean>(false);

  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch static usage stats for selected period
  const fetchStats = useCallback(async (p: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/usage/stats?period=${p}`);
      if (res.ok) {
        const data: UsageStatsResult = await res.json();
        setStats(data);
        if (data.activeRequests) setActiveRequests(data.activeRequests);
        if (data.recentRequests) setRecentRequests(data.recentRequests);
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch chart data for selected period
  const fetchChart = useCallback(async (p: string) => {
    try {
      setLoadingChart(true);
      const res = await fetch(`/api/usage/chart?period=${p}`);
      if (res.ok) {
        const data: ChartDataPoint[] = await res.json();
        setChartData(data);
      }
    } catch (err) {
      console.error("Failed to fetch chart data:", err);
    } finally {
      setLoadingChart(false);
    }
  }, []);

  // Initial fetch and on period change
  useEffect(() => {
    fetchStats(period);
    fetchChart(period);
  }, [period, fetchStats, fetchChart]);

  // Connect to SSE stream for real-time telemetry
  useEffect(() => {
    let sse: EventSource | null = null;
    let retryTimer: NodeJS.Timeout | null = null;

    const connectSSE = () => {
      try {
        const token = AuthService.getToken();
        const streamUrl = token
          ? `/api/usage/stream?token=${encodeURIComponent(token)}`
          : "/api/usage/stream";
        sse = new EventSource(streamUrl);
        eventSourceRef.current = sse;

        sse.onopen = () => {
          setSseConnected(true);
        };

        sse.addEventListener("stats", (e: MessageEvent) => {
          try {
            const newStats: UsageStatsResult = JSON.parse(e.data);
            setStats(newStats);
            if (newStats.activeRequests) setActiveRequests(newStats.activeRequests);
            if (newStats.recentRequests) setRecentRequests(newStats.recentRequests);
          } catch {}
        });

        sse.addEventListener("pending", (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            if (data.activeRequests) setActiveRequests(data.activeRequests);
          } catch {}
        });

        sse.onerror = () => {
          setSseConnected(false);
          sse?.close();
          eventSourceRef.current = null;
          // Reconnect with backoff
          retryTimer = setTimeout(connectSSE, 5000);
        };
      } catch {
        setSseConnected(false);
      }
    };

    connectSSE();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (sse) sse.close();
      eventSourceRef.current = null;
    };
  }, []);

  const providerNames = Object.keys(stats?.byProvider || {});

  return (
    <div className="w-full min-w-0 space-y-6 px-2 sm:px-4 lg:px-6 pb-20 animate-rt-fade-in">
      {/* Top Filter and Navigation Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0B0F19] border border-[#1E293B] rounded-2xl p-2 sm:p-2.5 shadow-sm">
        {/* Main Segmented Control: Overview / Details */}
        <div className="bg-[#151C2C] p-1 rounded-xl border border-[#243048] flex items-center">
          <button
            onClick={() => setViewMode("overview")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
              viewMode === "overview"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            Overview
          </button>
          <button
            onClick={() => setViewMode("details")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
              viewMode === "details"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <ListFilter className="w-3.5 h-3.5" />
            Details (Inspector)
          </button>
        </div>

        {/* Right side controls: Period selector & Live Indicator */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Live telemetry status beacon */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#151C2C] border border-slate-800 text-[11px] text-slate-400">
            <span
              className={`w-2 h-2 rounded-full ${
                sseConnected ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-amber-400"
              }`}
            />
            <span className="font-mono text-[10px]">
              {sseConnected ? "LIVE TELEMETRY" : "POLLING"}
            </span>
          </div>

          {/* Period selector */}
          {viewMode === "overview" && (
            <div className="bg-[#151C2C] p-1 rounded-xl border border-[#243048] flex items-center text-xs">
              {(["today", "24h", "7d", "30d", "60d", "all"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-2.5 sm:px-3 py-1 rounded-lg uppercase font-semibold transition-all ${
                    period === p
                      ? "bg-blue-600/30 text-blue-400 border border-blue-500/40 shadow-xs"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => {
              fetchStats(period);
              fetchChart(period);
            }}
            className="p-2 rounded-xl bg-[#151C2C] border border-[#243048] text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            title="Refresh statistics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-blue-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* VIEW MODE 1: OVERVIEW */}
      {viewMode === "overview" && (
        <div className="space-y-6 w-full">
          {/* 5 KPI Metric Cards + RTK Tokens Saved */}
          <OverviewCards stats={stats} loading={loading} />

          {/* Middle Row: Active Routing Topology + Live Recent Requests */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 w-full">
            {/* Real-time Topology Graph */}
            <div className="lg:col-span-7 w-full flex">
              <ProviderTopology
                providers={providerNames}
                activeRequests={activeRequests}
              />
            </div>

            {/* Live Recent Requests Stream Feed */}
            <div className="lg:col-span-5 w-full bg-[#0E1320] border border-[#1E293B] rounded-xl p-4 sm:p-5 flex flex-col justify-between shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-[#1E293B] shrink-0">
                <span className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-400" />
                  Recent Requests
                </span>
                <span className="text-[10px] text-cyan-400 font-mono bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  Live Stream
                </span>
              </div>

              <div className="flex-1 overflow-y-auto mt-2 min-h-[220px] max-h-[300px]">
                {recentRequests.length === 0 ? (
                  <div className="py-16 text-center text-slate-500 text-xs">
                    No recent proxy requests yet. Call /v1/messages or /v1/chat/completions to see live logs.
                  </div>
                ) : (
                  <table className="w-full text-left text-xs font-mono border-collapse">
                    <thead>
                      <tr className="text-slate-500 text-[10px] uppercase border-b border-[#1E293B]">
                        <th className="pb-2 font-semibold">Model</th>
                        <th className="pb-2 font-semibold text-right">In / Out</th>
                        <th className="pb-2 font-semibold text-right">When</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E293B]/50">
                      {recentRequests.slice(0, 15).map((r, i) => {
                        const isOk = r.status === "success" || r.status === "ok";
                        return (
                          <tr key={r.id || i} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-2 flex items-center gap-1.5 truncate max-w-[140px]">
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  isOk ? "bg-emerald-400" : "bg-red-400"
                                }`}
                              />
                              <span className="text-slate-200 text-xs truncate font-medium" title={r.model}>
                                {r.model}
                              </span>
                            </td>
                            <td className="py-2 text-right whitespace-nowrap text-[11px]">
                              <span className="text-blue-400">{r.promptTokens.toLocaleString()}↑</span>{" "}
                              <span className="text-emerald-400">{r.completionTokens.toLocaleString()}↓</span>
                            </td>
                            <td className="py-2 text-right text-[10px] text-slate-400 whitespace-nowrap">
                              {typeof r.timestamp === "number"
                                ? new Date(r.timestamp).toLocaleTimeString()
                                : new Date(String(r.timestamp)).toLocaleTimeString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Time Series Recharts Area Chart */}
          <UsageChart data={chartData} period={period} loading={loadingChart} />

          {/* 2-Column Row: Top Models Chart + Provider Allocation Bar Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 w-full">
            <TopModelsChart byModel={stats?.byModel || {}} />
            <ProviderBarChart byProvider={stats?.byProvider || {}} />
          </div>

          {/* Multi-level Usage Table with Group By (Model / Provider / Account / API Key) */}
          <UsageTable
            byProvider={stats?.byProvider || {}}
            byModel={stats?.byModel || {}}
            byAccount={stats?.byAccount || {}}
            byApiKey={stats?.byApiKey || {}}
          />
        </div>
      )}

      {/* VIEW MODE 2: DETAILS (REQUEST INSPECTOR) */}
      {viewMode === "details" && <RequestDetailsView />}
    </div>
  );
};
