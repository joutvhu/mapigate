import React from "react";
import type { StructuredLogEntry } from "../../../../shared/types/logging.js";
import { ToolIcon } from "../ui/ToolIcon.js";
import {
  Clock,
  Zap,
  Repeat,
  Sparkles,
  ChevronRight,
  AlertCircle,
  Wrench,
} from "lucide-react";

interface StructuredLogCardProps {
  entry: StructuredLogEntry;
  onClick: () => void;
  isSelected?: boolean;
}

function formatTimeOnly(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const StructuredLogCard: React.FC<StructuredLogCardProps> = ({
  entry,
  onClick,
  isSelected = false,
}) => {
  const { gateway, level, category, message, reqTag, timestamp, error } = entry;
  const status = gateway?.statusCode || error?.status;
  const isSuccess = status && status >= 200 && status < 300;
  const isRateLimit = status === 429;
  const isError = level === "error" || (status && status >= 400 && !isRateLimit);

  // Status Badge
  const getStatusBadge = () => {
    if (isRateLimit) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          429
        </span>
      );
    }
    if (isError) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-500/15 text-red-400 border border-red-500/30">
          {status || "ERR"}
        </span>
      );
    }
    if (isSuccess) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          {status} OK
        </span>
      );
    }
    return null;
  };

  // Category Badge Style
  const getCategoryClass = () => {
    switch (category) {
      case "proxy":
        return "bg-blue-500/10 text-blue-400 border-blue-500/30";
      case "router":
        return "bg-purple-500/10 text-purple-400 border-purple-500/30";
      case "rtk":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
      case "mitm":
        return "bg-cyan-500/10 text-cyan-400 border-cyan-500/30";
      case "scheduler":
        return "bg-slate-700/30 text-slate-400 border-slate-700/50";
      default:
        return "bg-slate-800/40 text-slate-400 border-slate-700/60";
    }
  };

  return (
    <div
      onClick={onClick}
      className={`group px-3.5 py-2.5 rounded-xl border transition-all cursor-pointer select-text ${
        isSelected
          ? "bg-[#131B2E] border-blue-500 shadow-md ring-1 ring-blue-500/20"
          : "bg-[#0A0E18] hover:bg-[#0E1524] border-[#1E293B] hover:border-slate-700"
      }`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Left: Time, Tag, Category, Status, Identity */}
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {/* Time & Session Dot */}
          <span className="text-[11px] font-mono text-slate-500 shrink-0">
            {formatTimeOnly(timestamp)}
          </span>
          {reqTag && <span className="text-xs shrink-0 select-none">{reqTag}</span>}

          {/* Category Pill */}
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border shrink-0 ${getCategoryClass()}`}
          >
            {category}
          </span>

          {/* HTTP Status Code */}
          {getStatusBadge()}

          {/* Client Tool Icon & Name */}
          {gateway?.clientTool && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#05070B] border border-[#1E293B]">
              <ToolIcon name={gateway.clientTool} size="sm" className="size-4" />
              <span className="text-xs font-semibold text-slate-300">
                {gateway.clientTool}
              </span>
            </div>
          )}

          {/* Target Model & Provider */}
          {(gateway?.actualModel || gateway?.requestedModel) && (
            <div className="flex items-center gap-1 text-xs font-mono text-slate-300 truncate">
              {gateway.providerId && (
                <span className="text-slate-500">{gateway.providerId}/</span>
              )}
              <span className="font-medium text-blue-300">
                {gateway.actualModel || gateway.requestedModel}
              </span>
            </div>
          )}
        </div>

        {/* Right: Latency, Tokens, Cost & Inspection Hint */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {/* Latency Pill */}
          {gateway?.durationMs !== undefined && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-400">
              <Clock className="size-3 text-slate-500" />
              <span>{gateway.durationMs}ms</span>
              {gateway.ttftMs !== undefined && gateway.ttftMs > 0 && (
                <span className="text-slate-500">· TTFT {gateway.ttftMs}ms</span>
              )}
            </div>
          )}

          {/* Token Breakdown Pills */}
          {gateway?.tokens && (
            <div className="hidden sm:flex items-center gap-1 text-[11px] font-mono">
              <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                IN {gateway.tokens.prompt.toLocaleString()}
                {gateway.tokens.cached ? ` (↻${gateway.tokens.cached.toLocaleString()})` : ""}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                OUT {gateway.tokens.completion.toLocaleString()}
              </span>
              {gateway.tokens.savedByRtk ? (
                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-0.5">
                  <Zap className="size-2.5" />
                  <span>-{gateway.tokens.savedByRtk.toLocaleString()}</span>
                </span>
              ) : null}
            </div>
          )}

          {/* Cost Pill */}
          {gateway?.cost !== undefined && gateway.cost > 0 && (
            <span className="hidden md:inline px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-300 font-semibold">
              ${gateway.cost < 0.01 ? gateway.cost.toFixed(4) : gateway.cost.toFixed(3)}
            </span>
          )}

          <ChevronRight className="size-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
        </div>
      </div>

      {/* Second Line: Tool invocation chips or summary text */}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className="text-xs font-mono text-slate-400 truncate flex-1">{message}</p>

        {/* Tools chips */}
        {gateway?.tools && gateway.tools.length > 0 && (
          <div className="flex items-center gap-1 shrink-0 overflow-hidden">
            {gateway.tools.slice(0, 3).map((tool, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-500/15 text-purple-300 border border-purple-500/30"
              >
                <Wrench className="size-2.5" />
                <span className="truncate max-w-[120px]">{tool.name}</span>
              </span>
            ))}
            {gateway.tools.length > 3 && (
              <span className="text-[10px] text-slate-500 font-mono">
                +{gateway.tools.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
