import React, { useState, useEffect, useRef, useMemo } from "react";

export const ConsoleLogTab: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [connected, setConnected] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [filterText, setFilterText] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Connect to SSE stream
  useEffect(() => {
    let es: EventSource | null = null;
    let isSubscribed = true;

    const connectSSE = () => {
      try {
        es = new EventSource("/api/console-logs/stream");

        es.onopen = () => {
          if (isSubscribed) {
            setConnected(true);
          }
        };

        es.onmessage = (e) => {
          if (!isSubscribed) return;
          try {
            const data = JSON.parse(e.data);
            if (data.type === "init" && Array.isArray(data.logs)) {
              setLogs(data.logs);
            } else if (data.type === "lines" && Array.isArray(data.lines)) {
              setLogs((prev) => {
                const updated = [...prev, ...data.lines];
                return updated.length > 500 ? updated.slice(-500) : updated;
              });
            } else if (data.type === "clear") {
              setLogs([]);
            }
          } catch {
            // Ignored non-json ping/comment
          }
        };

        es.onerror = () => {
          if (isSubscribed) {
            setConnected(false);
          }
        };
      } catch {
        if (isSubscribed) {
          setConnected(false);
        }
      }
    };

    connectSSE();

    // Fallback snapshot load if SSE took time
    fetch("/api/console-logs")
      .then((res) => res.json())
      .then((data) => {
        if (isSubscribed && data.success && Array.isArray(data.logs) && data.logs.length > 0) {
          setLogs((prev) => (prev.length === 0 ? data.logs : prev));
        }
      })
      .catch(() => {});

    return () => {
      isSubscribed = false;
      if (es) {
        es.close();
      }
    };
  }, []);

  // Auto-scroll when logs change if autoScroll is enabled
  useEffect(() => {
    if (autoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Filtered log lines
  const filteredLogs = useMemo(() => {
    if (!filterText.trim()) return logs;
    const lower = filterText.toLowerCase();
    return logs.filter((line) => line.toLowerCase().includes(lower));
  }, [logs, filterText]);

  // Clear logs on server & UI
  const handleClear = async () => {
    try {
      setLogs([]);
      await fetch("/api/console-logs", { method: "DELETE" });
    } catch (err) {
      console.error("Failed to clear console logs:", err);
    }
  };

  // Copy logs to clipboard
  const handleCopy = async () => {
    const textToCopy = filteredLogs.join("\n");
    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy logs:", err);
    }
  };

  // Color determination for log lines
  const getLineColor = (line: string): string => {
    const upper = line.toUpperCase();
    if (
      upper.includes("[ERROR]") ||
      upper.includes("ERROR:") ||
      upper.includes("EXCEPTION") ||
      line.includes("Error:") ||
      line.includes("ERR!") ||
      line.toLowerCase().includes("failed")
    ) {
      return "text-red-400";
    }
    if (
      upper.includes("[WARN]") ||
      upper.includes("WARN:") ||
      upper.includes("WARNING:")
    ) {
      return "text-amber-400";
    }
    if (upper.includes("[INFO]") || upper.includes("INFO:")) {
      return "text-blue-400";
    }
    if (
      upper.includes("[LOG]") ||
      line.includes("🚀") ||
      line.includes("📡") ||
      line.includes("▶") ||
      line.includes("Gateway running")
    ) {
      return "text-emerald-400";
    }
    if (upper.includes("[DEBUG]")) {
      return "text-purple-400";
    }
    return "text-slate-300";
  };

  return (
    <div className="w-full px-2 sm:px-4 space-y-4 animate-rt-fade-in flex flex-col h-[calc(100vh-140px)] min-h-[500px]">
      {/* Top Toolbar Card */}
      <div className="rt-card px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Left: Stream Status & Line Counter */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#0A0D14] border border-[#1E293B]">
            <span
              className={`size-2 rounded-full ${
                connected ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-red-500 animate-pulse"
              }`}
            />
            <span className="text-xs font-semibold text-slate-300">
              {connected ? "Live Stream Connected" : "Disconnected"}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0A0D14] border border-[#1E293B] text-xs font-mono text-slate-400">
            <span className="text-slate-200 font-semibold">{filteredLogs.length}</span>
            {filterText.trim() && (
              <span className="text-slate-500">/ {logs.length}</span>
            )}
            <span>lines</span>
          </div>
        </div>

        {/* Right: Actions, Filter & Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter Search Input */}
          <div className="relative w-44 sm:w-56">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[15px] text-slate-500">
              search
            </span>
            <input
              type="text"
              placeholder="Filter logs..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-lg pl-8 pr-7 py-1 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all"
            />
            {filterText && (
              <button
                type="button"
                onClick={() => setFilterText("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs cursor-pointer"
                title="Clear filter"
              >
                ✕
              </button>
            )}
          </div>

          {/* Auto-scroll Toggle */}
          <button
            type="button"
            onClick={() => setAutoScroll((prev) => !prev)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${
              autoScroll
                ? "bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20"
                : "bg-slate-800/40 text-slate-400 border-slate-700/60 hover:text-slate-200"
            }`}
            title={autoScroll ? "Click to pause auto-scrolling" : "Click to enable auto-scrolling"}
          >
            <span className="material-symbols-outlined text-[15px]">
              {autoScroll ? "vertical_align_bottom" : "pause"}
            </span>
            <span className="hidden sm:inline">
              {autoScroll ? "Auto-scroll ON" : "Pause Auto-scroll"}
            </span>
          </button>

          {/* Copy All Logs */}
          <button
            type="button"
            onClick={handleCopy}
            disabled={filteredLogs.length === 0}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#0A0D14] border border-[#1E293B] text-slate-300 hover:text-white hover:border-slate-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Copy logs to clipboard"
          >
            <span className="material-symbols-outlined text-[15px]">
              {copied ? "check" : "content_copy"}
            </span>
            <span>{copied ? "Copied!" : "Copy"}</span>
          </button>

          {/* Clear Logs */}
          <button
            type="button"
            onClick={handleClear}
            disabled={logs.length === 0}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:border-red-500/40 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Clear all logs"
          >
            <span className="material-symbols-outlined text-[15px]">delete_sweep</span>
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Terminal View Container */}
      <div className="flex-1 flex flex-col rounded-xl border border-[#1E293B] bg-[#05070B] overflow-hidden shadow-2xl min-h-0">
        {/* Terminal Header Chrome */}
        <div className="bg-[#0A0D14] px-4 py-2 border-b border-[#1E293B] flex items-center justify-between shrink-0 select-none">
          {/* Terminal Window Controls */}
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
          ref={scrollContainerRef}
          className="flex-1 p-4 font-mono text-xs overflow-y-auto space-y-0.5 select-text"
        >
          {filteredLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 py-16 space-y-2 select-none">
              <span className="material-symbols-outlined text-[36px] text-slate-600">terminal</span>
              <p className="text-xs">
                {filterText.trim()
                  ? `No logs match "${filterText}"`
                  : "No console logs yet. Gateway logs will stream here in real time."}
              </p>
              <span className="text-[10px] text-slate-600 font-mono">
                Listening on http://127.0.0.1:20127/api/console-logs/stream
              </span>
            </div>
          ) : (
            filteredLogs.map((line, idx) => {
              const colorClass = getLineColor(line);
              return (
                <div
                  key={idx}
                  className={`py-0.5 px-1.5 rounded flex items-start gap-2.5 hover:bg-white/[0.03] transition-colors leading-relaxed ${colorClass}`}
                >
                  <span className="text-slate-600 select-none text-[10px] w-9 text-right shrink-0 pt-0.5 font-mono">
                    {idx + 1}
                  </span>
                  <span className="flex-1 whitespace-pre-wrap break-all font-mono">
                    {line}
                  </span>
                </div>
              );
            })
          )}
          <div ref={terminalEndRef} />
        </div>
      </div>
    </div>
  );
};
