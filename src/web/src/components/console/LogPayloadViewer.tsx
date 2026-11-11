import React, { useState } from "react";
import type { RequestDetail } from "../../../../shared/types/index.js";
import { Check, Copy, ArrowUpRight, ArrowDownLeft, FileText, Database } from "lucide-react";

interface LogPayloadViewerProps {
  detail: RequestDetail | null;
  loading?: boolean;
}

export const LogPayloadViewer: React.FC<LogPayloadViewerProps> = ({
  detail,
  loading = false,
}) => {
  const [activeTab, setActiveTab] = useState<"client" | "providerReq" | "response">("client");
  const [copiedTab, setCopiedTab] = useState<string | null>(null);

  const copyToClipboard = (text: string, tab: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTab(tab);
    setTimeout(() => setCopiedTab(null), 2000);
  };

  if (loading) {
    return (
      <div className="p-6 rounded-xl bg-[#0A0E18] border border-[#1E293B] flex items-center justify-center gap-3 text-slate-400">
        <span className="size-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-mono">Loading full payload observability trace...</span>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-5 rounded-xl bg-[#0A0E18] border border-[#1E293B] space-y-2 text-center select-none">
        <Database className="size-6 text-slate-500 mx-auto" />
        <p className="text-xs font-semibold text-slate-300">
          No payload trace snapshot found for this request
        </p>
        <p className="text-[11px] text-slate-500 max-w-md mx-auto">
          Observability trace is either set to <strong className="text-amber-400 font-mono">Errors Only</strong> (which bypasses successful 200 OK payloads) or <strong className="text-slate-400 font-mono">Off</strong>. Switch to <strong className="text-emerald-400 font-mono">Trace: All</strong> in the top toolbar to record all full payloads.
        </p>
      </div>
    );
  }

  const clientPayload = detail.request?.body || {};
  const providerReqPayload = detail.providerRequest?.body || {};
  const responsePayload = detail.response?.body || detail.providerResponse?.body || detail.errorMessage || {};

  const currentContent =
    activeTab === "client"
      ? clientPayload
      : activeTab === "providerReq"
      ? providerReqPayload
      : responsePayload;

  const currentHeaders =
    activeTab === "client"
      ? detail.request?.headers
      : activeTab === "providerReq"
      ? detail.providerRequest?.headers
      : detail.response?.headers || detail.providerResponse?.headers;

  const jsonString = JSON.stringify(currentContent, null, 2);

  return (
    <div className="space-y-3">
      {/* Tab Navigation and Copy Action */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1 bg-[#05070B] p-1 rounded-lg border border-[#1E293B]">
          <button
            type="button"
            onClick={() => setActiveTab("client")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "client"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <ArrowDownLeft className="size-3.5" />
            <span>Client Inbound</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("providerReq")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "providerReq"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <ArrowUpRight className="size-3.5" />
            <span>Provider Transformed</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("response")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "response"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText className="size-3.5" />
            <span>Response & Output</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => copyToClipboard(jsonString, activeTab)}
          className="px-2.5 py-1 rounded-md bg-[#0A0E18] border border-[#1E293B] text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors text-xs cursor-pointer"
        >
          {copiedTab === activeTab ? (
            <>
              <Check className="size-3.5 text-emerald-400" />
              <span>Copied JSON</span>
            </>
          ) : (
            <>
              <Copy className="size-3.5" />
              <span>Copy JSON</span>
            </>
          )}
        </button>
      </div>

      {/* Target Upstream Endpoint if available */}
      {activeTab === "providerReq" && detail.providerRequest?.url && (
        <div className="px-3 py-1.5 rounded-lg bg-[#05070B] border border-[#1E293B] text-[11px] font-mono text-slate-400 flex items-center gap-2">
          <span className="text-slate-500 uppercase font-bold text-[10px]">URL:</span>
          <span className="text-blue-300 truncate">{detail.providerRequest.url}</span>
        </div>
      )}

      {/* Sanitized Headers Accordion */}
      {currentHeaders && Object.keys(currentHeaders).length > 0 && (
        <details className="rounded-lg bg-[#05070B] border border-[#1E293B] text-[11px] font-mono text-slate-400 overflow-hidden">
          <summary className="px-3 py-1.5 cursor-pointer hover:text-slate-200 select-none flex items-center justify-between">
            <span className="font-semibold text-slate-300">
              Headers ({Object.keys(currentHeaders).length})
            </span>
          </summary>
          <div className="p-3 border-t border-[#1E293B] bg-black/40 max-h-36 overflow-y-auto">
            <pre className="text-[10px] text-slate-300 whitespace-pre-wrap">
              {JSON.stringify(currentHeaders, null, 2)}
            </pre>
          </div>
        </details>
      )}

      {/* Main JSON Payload Box */}
      <div className="rounded-xl bg-[#05070B] border border-[#1E293B] p-3 max-h-96 overflow-y-auto font-mono text-[11px] text-slate-200 leading-relaxed">
        {jsonString && jsonString !== "{}" ? (
          <pre className="whitespace-pre-wrap break-all select-text">{jsonString}</pre>
        ) : (
          <span className="text-slate-500 italic">No JSON payload body captured for this section.</span>
        )}
      </div>
    </div>
  );
};
