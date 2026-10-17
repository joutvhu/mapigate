import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { StructuredLogEntry } from "../../../../shared/types/logging.js";
import { ToolIcon } from "../ui/ToolIcon.js";
import { TokenEconomicsPanel } from "./TokenEconomicsPanel.js";
import { ToolCallsPanel } from "./ToolCallsPanel.js";
import { useSystemInfo } from "../../hooks/useSystemInfo.js";
import {
  X,
  Copy,
  Check,
  Clock,
  Cpu,
  Server,
  Terminal,
  Code,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";

interface LogDetailDrawerProps {
  entry: StructuredLogEntry | null;
  isOpen: boolean;
  onClose: () => void;
}

export const LogDetailDrawer: React.FC<LogDetailDrawerProps> = ({
  entry,
  isOpen,
  onClose,
}) => {
  const systemInfo = useSystemInfo((s) => s.info);
  const effectivePort = systemInfo?.port || 20127;
  const effectiveHost = systemInfo?.host || "127.0.0.1";

  const [copiedId, setCopiedId] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = origOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen || !entry || typeof document === "undefined") return null;

  const { gateway, error, level, category, timestamp, rawText, reqTag, id, requestId } = entry;
  const status = gateway?.statusCode || error?.status;
  const isSuccess = status && status >= 200 && status < 300;
  const isRateLimit = status === 429;
  const isError = level === "error" || (status && status >= 400 && !isRateLimit);

  const copyToClipboard = (text: string, type: "id" | "json" | "curl") => {
    navigator.clipboard.writeText(text);
    if (type === "id") {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } else if (type === "json") {
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } else if (type === "curl") {
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2000);
    }
  };

  const generateCurl = () => {
    const route = gateway?.route || "/v1/messages";
    const model = gateway?.actualModel || gateway?.requestedModel || "claude-3-7-sonnet";
    return `curl -X POST http://${effectiveHost}:${effectivePort}${route} \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer [REDACTED]" \\\n  -d '{"model": "${model}", "messages": [{"role": "user", "content": "Hello"}]}'`;
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex justify-end bg-black/70 backdrop-blur-xs animate-rt-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-2xl sm:max-w-3xl h-full bg-[#0D121F] border-l border-[#1E293B] shadow-2xl flex flex-col text-slate-100 overflow-hidden animate-rt-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#1E293B] flex items-center justify-between bg-[#0A0E18]">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {gateway?.clientTool && (
                <ToolIcon name={gateway.clientTool} size="md" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm text-white">
                    Request Details
                  </h3>
                  {reqTag && <span>{reqTag}</span>}
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    {category}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-slate-400 font-mono">
                    {id || requestId || "N/A"}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(id || requestId || "", "id")}
                    className="text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                    title="Copy Request ID"
                  >
                    {copiedId ? (
                      <Check className="size-3 text-emerald-400" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-[#0A0E18] border border-[#1E293B]">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-blue-400" /> Status
              </span>
              <p className="mt-1 text-sm font-bold">
                {isRateLimit ? (
                  <span className="text-amber-400">429 Rate Limit</span>
                ) : isError ? (
                  <span className="text-red-400">{status || "Error"}</span>
                ) : isSuccess ? (
                  <span className="text-emerald-400">{status} OK</span>
                ) : (
                  <span className="text-slate-300">{level.toUpperCase()}</span>
                )}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-[#0A0E18] border border-[#1E293B]">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Clock className="size-3.5 text-amber-400" /> Duration
              </span>
              <p className="mt-1 text-sm font-bold text-slate-200 font-mono">
                {gateway?.durationMs !== undefined ? `${gateway.durationMs}ms` : "N/A"}
              </p>
              {gateway?.ttftMs !== undefined && gateway.ttftMs > 0 && (
                <span className="text-[10px] text-slate-500 font-mono">
                  TTFT: {gateway.ttftMs}ms
                </span>
              )}
            </div>

            <div className="p-3 rounded-xl bg-[#0A0E18] border border-[#1E293B]">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Cpu className="size-3.5 text-purple-400" /> Model
              </span>
              <p className="mt-1 text-xs font-bold text-slate-200 font-mono truncate" title={gateway?.actualModel || gateway?.requestedModel}>
                {gateway?.actualModel || gateway?.requestedModel || "N/A"}
              </p>
              {gateway?.providerId && (
                <span className="text-[10px] text-slate-500 font-mono">
                  via {gateway.providerId}
                </span>
              )}
            </div>

            <div className="p-3 rounded-xl bg-[#0A0E18] border border-[#1E293B]">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Server className="size-3.5 text-emerald-400" /> Cost
              </span>
              <p className="mt-1 text-sm font-bold text-emerald-400 font-mono">
                {gateway?.cost !== undefined ? `$${gateway.cost < 0.01 ? gateway.cost.toFixed(4) : gateway.cost.toFixed(3)}` : "$0.00"}
              </p>
            </div>
          </div>

          {/* Token Breakdown Section */}
          {gateway?.tokens && <TokenEconomicsPanel tokens={gateway.tokens} />}

          {/* Tools Invoked Section */}
          {gateway?.tools && gateway.tools.length > 0 && (
            <ToolCallsPanel tools={gateway.tools} />
          )}

          {/* Error Diagnostics Section */}
          {entry.error && (
            <div className="p-4 rounded-xl bg-red-950/20 border border-red-500/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                  <AlertCircle className="size-4 text-red-400" /> Error Diagnostics
                </span>
                {entry.error.code && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-500/20 text-red-300 border border-red-500/40">
                    {entry.error.code}
                  </span>
                )}
              </div>
              <div className="text-xs font-mono text-red-200 bg-black/40 p-3 rounded-lg border border-red-500/20 whitespace-pre-wrap break-all leading-relaxed">
                {entry.error.message || "Unknown error occurred"}
              </div>
              {entry.error.stack && (
                <details className="text-[11px] font-mono text-slate-400">
                  <summary className="cursor-pointer hover:text-slate-200 select-none">
                    View Stack Trace
                  </summary>
                  <pre className="mt-2 p-2.5 rounded bg-black/60 text-[10px] text-slate-400 overflow-x-auto whitespace-pre-wrap leading-relaxed border border-slate-800">
                    {entry.error.stack}
                  </pre>
                </details>
              )}
            </div>
          )}

          {/* Raw Log & Summary Text */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Terminal className="size-3.5 text-slate-400" /> Log Output
            </h4>
            <div className="p-3 rounded-lg bg-[#05070B] border border-[#1E293B] font-mono text-xs text-slate-300 whitespace-pre-wrap break-all leading-relaxed">
              {rawText}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[#1E293B] bg-[#0A0E18] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => copyToClipboard(generateCurl(), "curl")}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#131B2E] border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {copiedCurl ? <Check className="size-3.5 text-emerald-400" /> : <Terminal className="size-3.5" />}
              <span>{copiedCurl ? "Copied cURL!" : "Copy cURL"}</span>
            </button>

            <button
              type="button"
              onClick={() => copyToClipboard(JSON.stringify(entry, null, 2), "json")}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1E293B] text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {copiedJson ? <Check className="size-3.5 text-emerald-400" /> : <Code className="size-3.5" />}
              <span>{copiedJson ? "Copied JSON!" : "Copy JSON"}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
