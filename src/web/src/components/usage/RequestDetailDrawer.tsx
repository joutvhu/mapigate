import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { RequestDetail } from "../../../../shared/types/index.js";
import { useBackdropClose } from "../../hooks/useBackdropClose.js";
import {
  X,
  Copy,
  Check,
  Clock,
  Cpu,
  Server,
  Terminal,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Code,
} from "lucide-react";

interface RequestDetailDrawerProps {
  detail: RequestDetail | null;
  isOpen: boolean;
  onClose: () => void;
}

export const RequestDetailDrawer: React.FC<RequestDetailDrawerProps> = ({
  detail,
  isOpen,
  onClose,
}) => {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [openHeaders, setOpenHeaders] = useState(false);
  const [activeTab, setActiveTab] = useState<"client" | "providerReq" | "response">("client");

  const { backdropProps } = useBackdropClose(onClose, !isOpen);

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

  if (!isOpen || !detail || typeof document === "undefined") return null;

  const copyToClipboard = (text: string, type: "id" | string) => {
    navigator.clipboard.writeText(text);
    if (type === "id") {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } else {
      setCopiedSection(type);
      setTimeout(() => setCopiedSection(null), 2000);
    }
  };

  const statusNum = Number(detail.status);
  const isSuccess = statusNum >= 200 && statusNum < 300 || detail.status === "success" || detail.status === "ok";
  const isRateLimit = statusNum === 429 || detail.status === "rate_limited";

  const getStatusBadge = () => {
    if (isRateLimit) {
      return (
        <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
          429 Rate Limit
        </span>
      );
    }
    if (isSuccess) {
      return (
        <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          {detail.status === "success" || detail.status === "ok" ? "200 OK" : `${detail.status} OK`}
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">
        {detail.status || "500 Error"}
      </span>
    );
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex justify-end bg-black/70 backdrop-blur-xs animate-rt-fade-in"
      {...backdropProps}
    >
      <div
        className="w-full max-w-2xl sm:max-w-3xl h-full bg-[#0D121F] border-l border-[#1E293B] shadow-2xl flex flex-col text-slate-100 overflow-hidden animate-rt-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-[#1E293B] flex items-center justify-between bg-[#0A0E18]">
          <div className="flex items-center gap-3">
            {getStatusBadge()}
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>{detail.model || "Unknown Model"}</span>
                {detail.provider && (
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                    {detail.provider}
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                <span className="font-mono text-[11px] truncate max-w-[200px]" title={detail.id}>
                  {detail.id}
                </span>
                <button
                  onClick={() => copyToClipboard(detail.id, "id")}
                  className="p-1 hover:text-white transition-colors"
                  title="Copy Request ID"
                >
                  {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-xs">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#111726] border border-[#1E293B] rounded-xl p-3.5">
            <div>
              <span className="text-slate-500 uppercase tracking-wider text-[10px] block font-semibold flex items-center gap-1">
                <Clock className="w-3 h-3" /> Latency
              </span>
              <span className="font-mono text-sm font-bold text-slate-200 mt-1 block">
                {detail.latency?.totalMs != null ? `${detail.latency.totalMs} ms` : "-"}
              </span>
              {detail.latency?.ttftMs != null && (
                <span className="text-[10px] text-slate-500 font-mono">
                  TTFT: {detail.latency.ttftMs}ms
                </span>
              )}
            </div>

            <div>
              <span className="text-slate-500 uppercase tracking-wider text-[10px] block font-semibold flex items-center gap-1">
                <Server className="w-3 h-3" /> Account
              </span>
              <span className="font-mono text-xs font-semibold text-slate-200 mt-1 block truncate">
                {detail.accountName || detail.connectionId || "Default"}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {detail.provider || "-"}
              </span>
            </div>

            <div>
              <span className="text-slate-500 uppercase tracking-wider text-[10px] block font-semibold flex items-center gap-1">
                <Terminal className="w-3 h-3" /> Client Tool
              </span>
              <span className="font-mono text-xs font-semibold text-slate-200 mt-1 block truncate" title={detail.clientTool}>
                {detail.clientTool || "unknown"}
              </span>
            </div>

            <div>
              <span className="text-slate-500 uppercase tracking-wider text-[10px] block font-semibold">
                Cost Est.
              </span>
              <span className="font-mono text-sm font-bold text-amber-400 mt-1 block">
                ${detail.cost != null ? detail.cost.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : "0.0000"}
              </span>
            </div>
          </div>

          {/* Token Metrics Breakdown */}
          <div className="bg-[#111726] border border-[#1E293B] rounded-xl p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-blue-400" /> Token Breakdown
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="bg-[#0B0F19] p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block uppercase font-semibold">Input</span>
                <span className="font-mono text-base font-bold text-blue-400 mt-1 block">
                  {(detail.tokens?.promptTokens || 0).toLocaleString()}
                </span>
              </div>
              <div className="bg-[#0B0F19] p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block uppercase font-semibold">Cached</span>
                <span className="font-mono text-base font-bold text-cyan-400 mt-1 block">
                  {(detail.tokens?.cachedTokens || 0).toLocaleString()}
                </span>
              </div>
              <div className="bg-[#0B0F19] p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block uppercase font-semibold">Output</span>
                <span className="font-mono text-base font-bold text-emerald-400 mt-1 block">
                  {(detail.tokens?.completionTokens || 0).toLocaleString()}
                </span>
              </div>
              <div className="bg-[#0B0F19] p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block uppercase font-semibold">Tokens Saved</span>
                <span className="font-mono text-base font-bold text-purple-400 mt-1 block">
                  {(detail.tokens?.tokensSavedByRtk || 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Headers Accordion */}
          <div className="bg-[#111726] border border-[#1E293B] rounded-xl overflow-hidden">
            <button
              onClick={() => setOpenHeaders(!openHeaders)}
              className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors"
            >
              <span className="font-bold text-xs text-slate-300 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                HTTP Headers (Sanitized)
              </span>
              {openHeaders ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            </button>
            {openHeaders && (
              <div className="p-3.5 border-t border-[#1E293B] space-y-3 bg-[#0B0F19]">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Client Inbound Headers:
                  </span>
                  <pre className="font-mono text-[11px] p-2.5 rounded bg-[#070A11] border border-slate-800/80 overflow-x-auto text-slate-300">
                    {JSON.stringify(detail.request?.headers || {}, null, 2)}
                  </pre>
                </div>
                {detail.providerRequest?.headers && (
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Provider Outbound Headers:
                    </span>
                    <pre className="font-mono text-[11px] p-2.5 rounded bg-[#070A11] border border-slate-800/80 overflow-x-auto text-slate-300">
                      {JSON.stringify(detail.providerRequest.headers, null, 2)}
                    </pre>
                  </div>
                )}
                {(detail.response?.headers || detail.providerResponse?.headers) && (
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Response Headers:
                    </span>
                    <pre className="font-mono text-[11px] p-2.5 rounded bg-[#070A11] border border-slate-800/80 overflow-x-auto text-slate-300">
                      {JSON.stringify(detail.response?.headers || detail.providerResponse?.headers, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Payload Inspector with Tabs */}
          <div className="bg-[#111726] border border-[#1E293B] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1 bg-[#0B0F19] p-1 rounded-lg border border-slate-800">
                <button
                  onClick={() => setActiveTab("client")}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                    activeTab === "client" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Client Request
                </button>
                <button
                  onClick={() => setActiveTab("providerReq")}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                    activeTab === "providerReq" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Provider Request
                </button>
                <button
                  onClick={() => setActiveTab("response")}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                    activeTab === "response" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Response Output
                </button>
              </div>

              <button
                onClick={() => {
                  const targetContent =
                    activeTab === "client"
                      ? detail.request?.body
                      : activeTab === "providerReq"
                      ? detail.providerRequest?.body
                      : detail.response?.body || detail.providerResponse?.body;
                  copyToClipboard(JSON.stringify(targetContent, null, 2), activeTab);
                }}
                className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors text-xs"
              >
                {copiedSection === activeTab ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy JSON</span>
                  </>
                )}
              </button>
            </div>

            {/* Payload View Box */}
            <div className="relative rounded-lg bg-[#070A11] border border-slate-800/80 p-3 max-h-96 overflow-y-auto">
              <pre className="font-mono text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed">
                {activeTab === "client"
                  ? JSON.stringify(detail.request?.body || { message: "No request body captured" }, null, 2)
                  : activeTab === "providerReq"
                  ? JSON.stringify(detail.providerRequest?.body || { message: "Same as client or pass-through" }, null, 2)
                  : JSON.stringify(detail.response?.body || detail.providerResponse?.body || { message: "Stream completed successfully" }, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
