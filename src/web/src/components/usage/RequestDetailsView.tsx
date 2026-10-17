import React, { useState, useEffect, useCallback } from "react";
import type { RequestDetail, RequestDetailsListResponse } from "../../../../shared/types/index.js";
import { RequestDetailDrawer } from "./RequestDetailDrawer.js";
import { Select } from "../Select.js";
import {
  Search,
  RefreshCw,
  Filter,
  ChevronLeft,
  ChevronRight,
  Clock,
  Terminal,
  Cpu,
  X,
} from "lucide-react";

export const RequestDetailsView: React.FC = () => {
  const [data, setData] = useState<RequestDetailsListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("all");
  const [status, setStatus] = useState("all");
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<RequestDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch("/api/usage/providers");
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) setAvailableProviders(list);
      }
    } catch {}
  }, []);

  const fetchDetails = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (provider !== "all") params.set("provider", provider);
      if (status !== "all") params.set("status", status);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/usage/request-details?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to fetch request details:", err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, provider, status, search]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const handleRowClick = async (item: RequestDetail) => {
    try {
      const res = await fetch(`/api/usage/request-details/${item.id}`);
      if (res.ok) {
        const fullDetail = await res.json();
        setSelectedDetail(fullDetail);
      } else {
        setSelectedDetail(item);
      }
    } catch {
      setSelectedDetail(item);
    }
    setDrawerOpen(true);
  };

  const getStatusBadge = (statusVal?: string | number | null) => {
    const s = String(statusVal || "");
    if (s === "200" || s === "success" || s === "ok") {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          200 OK
        </span>
      );
    }
    if (s === "429" || s === "rate_limited") {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
          429
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
        {s || "500"}
      </span>
    );
  };

  return (
    <div className="w-full space-y-4">
      {/* Filter and Search Bar */}
      <div className="bg-[#0E1320] border border-[#1E293B] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Search box */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by model, ID, provider, tool..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-8 py-1.5 rounded-lg bg-[#070A11] border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-blue-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Provider selector */}
          <div className="flex items-center gap-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <Select
              value={provider}
              onChange={(val) => {
                setProvider(val);
                setPage(1);
              }}
              options={[
                { value: "all", label: "All Providers" },
                ...availableProviders.map((p) => ({ value: p, label: p.toUpperCase() })),
              ]}
              className="min-w-[140px]"
            />
          </div>

          {/* Status selector */}
          <div className="flex items-center text-xs">
            <Select
              value={status}
              onChange={(val) => {
                setStatus(val);
                setPage(1);
              }}
              options={[
                { value: "all", label: "All Statuses" },
                { value: "200", label: "200 OK" },
                { value: "429", label: "429 Rate Limit" },
                { value: "500", label: "500 Error" },
              ]}
              className="min-w-[130px]"
            />
          </div>
        </div>

        {/* Refresh & Pagination Stats */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchDetails()}
            disabled={loading}
            className="p-1.5 rounded-lg bg-[#151D2F] border border-slate-700/60 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            title="Refresh logs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-400" : ""}`} />
          </button>

          <span className="text-xs text-slate-400 font-mono">
            {data?.pagination ? `${data.pagination.totalItems} records` : ""}
          </span>
        </div>
      </div>

      {/* Main Request History Table */}
      <div className="bg-[#0E1320] border border-[#1E293B] rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider bg-[#0A0E18]">
                <th className="py-3 px-3.5">Status</th>
                <th className="py-3 px-3.5">Time</th>
                <th className="py-3 px-3.5">Model</th>
                <th className="py-3 px-3.5">Provider</th>
                <th className="py-3 px-3.5">Tool / Client</th>
                <th className="py-3 px-3.5 text-right text-blue-400">In Tok</th>
                <th className="py-3 px-3.5 text-right text-emerald-400">Out Tok</th>
                <th className="py-3 px-3.5 text-right">Latency</th>
                <th className="py-3 px-3.5 text-right text-amber-400">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading && (!data?.details || data.details.length === 0) ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    Loading request records...
                  </td>
                </tr>
              ) : !data?.details || data.details.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    No matching request logs found.
                  </td>
                </tr>
              ) : (
                data.details.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => handleRowClick(item)}
                    className="hover:bg-blue-600/10 cursor-pointer transition-colors group"
                  >
                    <td className="py-2.5 px-3.5">{getStatusBadge(item.status)}</td>
                    <td className="py-2.5 px-3.5 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-3.5 font-semibold text-slate-200 group-hover:text-blue-400 transition-colors truncate max-w-[180px]">
                      {item.model || "unknown"}
                    </td>
                    <td className="py-2.5 px-3.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-mono">
                        {item.provider || "-"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 font-mono text-slate-400 truncate max-w-[140px]" title={item.clientTool}>
                      {item.clientTool || "-"}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono text-blue-400/90">
                      {(item.tokens?.promptTokens || 0).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono text-emerald-400/90">
                      {(item.tokens?.completionTokens || 0).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono text-slate-300">
                      {item.latency?.totalMs != null ? `${item.latency.totalMs}ms` : "-"}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono font-semibold text-amber-400/90">
                      ${item.cost != null ? item.cost.toFixed(4) : "0.0000"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {data?.pagination && data.pagination.totalPages > 1 && (
          <div className="p-3 border-t border-slate-800 bg-[#0A0E18] flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <Select
                value={String(pageSize)}
                onChange={(val) => {
                  setPageSize(Number(val));
                  setPage(1);
                }}
                options={[
                  { value: "10", label: "10" },
                  { value: "20", label: "20" },
                  { value: "50", label: "50" },
                ]}
                className="w-20"
              />
            </div>

            <div className="flex items-center gap-3">
              <span>
                Page <span className="font-bold text-slate-200">{data.pagination.page}</span> of{" "}
                <span className="font-bold text-slate-200">{data.pagination.totalPages}</span>
              </span>

              <div className="flex items-center gap-1">
                <button
                  disabled={!data.pagination.hasPrev}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  disabled={!data.pagination.hasNext}
                  onClick={() => setPage((p) => p + 1)}
                  className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Drawer mounted via React Portal */}
      <RequestDetailDrawer
        detail={selectedDetail}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
};
