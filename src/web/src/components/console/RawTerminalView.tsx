import React from "react";
import { Terminal } from "lucide-react";
import { useSystemInfo } from "../../hooks/useSystemInfo.js";
import { DEFAULT_PORT, DEFAULT_HOST } from "../../../../shared/constants/network.js";

interface RawTerminalViewProps {
  logs: string[];
  filterText: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

function getLineColor(line: string): string {
  const upper = line.toUpperCase();
  if (
    upper.includes("[ERROR]") ||
    upper.includes("ERROR:") ||
    upper.includes("EXCEPTION") ||
    line.includes("Error:") ||
    line.includes("ERR!") ||
    line.toLowerCase().includes("failed") ||
    line.includes("💥") ||
    line.includes("❌")
  ) {
    return "text-red-400";
  }
  if (
    upper.includes("[WARN]") ||
    upper.includes("WARN:") ||
    upper.includes("WARNING:") ||
    line.includes("⚠️")
  ) {
    return "text-amber-400";
  }
  if (upper.includes("[INFO]") || upper.includes("INFO:") || line.includes("ℹ️")) {
    return "text-blue-400";
  }
  if (
    upper.includes("[LOG]") ||
    line.includes("🚀") ||
    line.includes("📡") ||
    line.includes("▶") ||
    line.includes("✔") ||
    line.includes("Gateway running") ||
    line.includes("📊")
  ) {
    return "text-emerald-400";
  }
  if (upper.includes("[DEBUG]") || line.includes("🔍")) {
    return "text-purple-400";
  }
  return "text-slate-300";
}

export const RawTerminalView: React.FC<RawTerminalViewProps> = ({
  logs,
  filterText,
  scrollRef,
}) => {
  const systemInfo = useSystemInfo((s) => s.info);
  const effectivePort = systemInfo?.port || DEFAULT_PORT;
  const effectiveHost = systemInfo?.host || DEFAULT_HOST;

  return (
    <div className="flex-1 flex flex-col rounded-xl border border-[#1E293B] bg-[#05070B] overflow-hidden shadow-2xl min-h-0">
      {/* Terminal Header Chrome */}
      <div className="bg-[#0A0D14] px-4 py-2 border-b border-[#1E293B] flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-2">
          <span className="size-3 rounded-full bg-[#EF4444]/80 inline-block" />
          <span className="size-3 rounded-full bg-[#F59E0B]/80 inline-block" />
          <span className="size-3 rounded-full bg-[#10B981]/80 inline-block" />
          <span className="ml-2 text-[11px] font-mono text-slate-400">
            mapigate-gateway &gt; stdout / stderr
          </span>
        </div>
        <div className="text-[10px] font-mono text-slate-500">
          UTF-8 · Local Gateway
        </div>
      </div>

      {/* Scrollable Terminal Output */}
      <div
        ref={scrollRef}
        className="flex-1 p-4 font-mono text-xs overflow-y-auto space-y-0.5 select-text"
      >
        {logs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 py-16 space-y-2 select-none">
            <Terminal className="size-8 text-slate-600" />
            <p className="text-xs">
              {filterText.trim()
                ? `No logs match "${filterText}"`
                : "No console logs yet. Gateway logs will stream here in real time."}
            </p>
            <span className="text-[10px] text-slate-600 font-mono">
              Listening on http://{effectiveHost}:{effectivePort}/api/console-logs/stream
            </span>
          </div>
        ) : (
          logs.map((line, idx) => {
            const colorClass = getLineColor(line);
            return (
              <div
                key={idx}
                className={`py-0.5 px-1.5 rounded flex items-start gap-2.5 hover:bg-white/[0.03] transition-colors leading-relaxed ${colorClass}`}
              >
                <span className="text-slate-600 select-none text-[10px] w-9 text-right shrink-0 pt-0.5 font-mono">
                  {idx + 1}
                </span>
                <span className="break-all whitespace-pre-wrap flex-1">{line}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
