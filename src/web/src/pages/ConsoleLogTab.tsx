import React, { useState, useEffect, useRef, useMemo } from "react";
import type { StructuredLogEntry } from "../../../shared/types/logging.js";
import {
  ConsoleToolbar,
  type ConsoleCategoryTab,
  type ConsoleViewMode,
} from "../components/console/ConsoleToolbar.js";
import { StructuredLogCard } from "../components/console/StructuredLogCard.js";
import { RawTerminalView } from "../components/console/RawTerminalView.js";
import { LogDetailDrawer } from "../components/console/LogDetailDrawer.js";
import { Layers } from "lucide-react";
import { AuthService } from "../services/authService.js";

export const ConsoleLogTab: React.FC = () => {
  const [rawLogs, setRawLogs] = useState<string[]>([]);
  const [structuredLogs, setStructuredLogs] = useState<StructuredLogEntry[]>([]);
  const [connected, setConnected] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<ConsoleViewMode>("structured");
  const [categoryTab, setCategoryTab] = useState<ConsoleCategoryTab>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [clientToolFilter, setClientToolFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [gatewayLogLevel, setGatewayLogLevel] = useState<string>("info");
  const [copied, setCopied] = useState<boolean>(false);

  const [selectedLog, setSelectedLog] = useState<StructuredLogEntry | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Connect to SSE stream
  useEffect(() => {
    let es: EventSource | null = null;
    let isSubscribed = true;

    const connectSSE = () => {
      try {
        const token = AuthService.getToken();
        const streamUrl = token
          ? `/api/console-logs/stream?token=${encodeURIComponent(token)}`
          : "/api/console-logs/stream";
        es = new EventSource(streamUrl);

        es.onopen = () => {
          if (isSubscribed) setConnected(true);
        };

        es.onmessage = (e) => {
          if (!isSubscribed) return;
          try {
            const data = JSON.parse(e.data);
            if (data.type === "init") {
              if (Array.isArray(data.logs || data.lines)) {
                setRawLogs(data.logs || data.lines);
              }
              if (Array.isArray(data.structured)) {
                setStructuredLogs(data.structured);
              }
            } else if (data.type === "lines") {
              if (Array.isArray(data.lines)) {
                setRawLogs((prev) => [...prev, ...data.lines].slice(-500));
              }
              if (Array.isArray(data.structured)) {
                setStructuredLogs((prev) => [...prev, ...data.structured].slice(-500));
              }
            } else if (data.type === "clear") {
              setRawLogs([]);
              setStructuredLogs([]);
            }
          } catch {}
        };

        es.onerror = () => {
          if (isSubscribed) setConnected(false);
        };
      } catch {
        if (isSubscribed) setConnected(false);
      }
    };

    connectSSE();

    // Fallback snapshot load & log level load
    fetch("/api/console-logs")
      .then((res) => res.json())
      .then((data) => {
        if (isSubscribed && data.success) {
          if (Array.isArray(data.logs) && data.logs.length > 0) {
            setRawLogs((prev) => (prev.length === 0 ? data.logs : prev));
          }
          if (Array.isArray(data.structuredLogs) && data.structuredLogs.length > 0) {
            setStructuredLogs((prev) => (prev.length === 0 ? data.structuredLogs : prev));
          }
          if (data.level) {
            setGatewayLogLevel(data.level);
          }
        }
      })
      .catch(() => {});

    fetch("/api/console-logs/level")
      .then((res) => res.json())
      .then((data) => {
        if (isSubscribed && data.success && data.level) {
          setGatewayLogLevel(data.level);
        }
      })
      .catch(() => {});

    return () => {
      isSubscribed = false;
      es?.close();
    };
  }, []);

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [rawLogs, structuredLogs, autoScroll, viewMode]);

  // Available Tools and Providers for Filter Dropdowns
  const availableTools = useMemo(() => {
    const set = new Set<string>();
    for (const log of structuredLogs) {
      if (log.gateway?.clientTool) set.add(log.gateway.clientTool);
    }
    return Array.from(set).sort();
  }, [structuredLogs]);

  const availableProviders = useMemo(() => {
    const set = new Set<string>();
    for (const log of structuredLogs) {
      if (log.gateway?.providerId) set.add(log.gateway.providerId);
    }
    return Array.from(set).sort();
  }, [structuredLogs]);

  // Filtered Structured Logs
  const filteredStructuredLogs = useMemo(() => {
    return structuredLogs.filter((entry) => {
      // Category tab
      if (categoryTab === "proxy" && entry.category !== "proxy") return false;
      if (
        categoryTab === "stream" &&
        !(
          entry.rawText.includes("Tool invoked:") ||
          entry.rawText.includes("streaming chunks") ||
          (entry.gateway?.tools && entry.gateway.tools.length > 0)
        )
      ) {
        return false;
      }
      if (
        categoryTab === "errors" &&
        !(
          entry.level === "error" ||
          entry.level === "warn" ||
          (entry.gateway?.statusCode && entry.gateway.statusCode >= 400)
        )
      ) {
        return false;
      }
      if (
        categoryTab === "system" &&
        entry.category === "proxy"
      ) {
        return false;
      }

      // Client tool filter
      if (clientToolFilter !== "all" && entry.gateway?.clientTool !== clientToolFilter) {
        return false;
      }

      // Provider filter
      if (providerFilter !== "all" && entry.gateway?.providerId !== providerFilter) {
        return false;
      }

      // Status filter
      if (statusFilter === "200" && entry.gateway?.statusCode !== 200) return false;
      if (statusFilter === "429" && entry.gateway?.statusCode !== 429) return false;
      if (
        statusFilter === "error" &&
        !(
          entry.level === "error" ||
          (entry.gateway?.statusCode && entry.gateway.statusCode >= 400 && entry.gateway.statusCode !== 429)
        )
      ) {
        return false;
      }

      // Log level filter
      if (levelFilter !== "all" && entry.level !== levelFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          entry.rawText.toLowerCase().includes(q) ||
          entry.message.toLowerCase().includes(q) ||
          (entry.requestId && entry.requestId.toLowerCase().includes(q)) ||
          (entry.gateway?.actualModel && entry.gateway.actualModel.toLowerCase().includes(q)) ||
          (entry.gateway?.requestedModel && entry.gateway.requestedModel.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });
  }, [structuredLogs, categoryTab, clientToolFilter, providerFilter, statusFilter, levelFilter, searchQuery]);

  const handleGatewayLogLevelChange = async (newLevel: string) => {
    setGatewayLogLevel(newLevel);
    try {
      await fetch("/api/console-logs/level", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: newLevel }),
      });
    } catch {}
  };

  // Filtered Raw Logs - fully synchronized with category, tool, provider, status, level, and query filters
  const filteredRawLogs = useMemo(() => {
    if (structuredLogs.length > 0) {
      return filteredStructuredLogs.map((entry) => entry.rawText);
    }
    // Fallback if structuredLogs are not yet populated
    if (!searchQuery.trim()) return rawLogs;
    const lower = searchQuery.toLowerCase();
    return rawLogs.filter((line) => line.toLowerCase().includes(lower));
  }, [structuredLogs.length, filteredStructuredLogs, rawLogs, searchQuery]);

  // Clear Action
  const handleClear = async () => {
    try {
      setRawLogs([]);
      setStructuredLogs([]);
      await fetch("/api/console-logs", { method: "DELETE" });
    } catch {}
  };

  // Copy Action
  const handleCopy = async () => {
    const textToCopy =
      viewMode === "raw"
        ? filteredRawLogs.join("\n")
        : filteredStructuredLogs.map((l) => l.rawText).join("\n");
    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleInspectLog = (entry: StructuredLogEntry) => {
    setSelectedLog(entry);
    setIsDrawerOpen(true);
  };

  return (
    <div className="w-full px-2 sm:px-4 space-y-3 animate-rt-fade-in flex flex-col h-[calc(100vh-140px)] min-h-[500px]">
      {/* Unified Toolbar */}
      <ConsoleToolbar
        connected={connected}
        totalCount={viewMode === "raw" ? rawLogs.length : structuredLogs.length}
        filteredCount={
          viewMode === "raw" ? filteredRawLogs.length : filteredStructuredLogs.length
        }
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        categoryTab={categoryTab}
        onCategoryTabChange={setCategoryTab}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        clientToolFilter={clientToolFilter}
        onClientToolFilterChange={setClientToolFilter}
        providerFilter={providerFilter}
        onProviderFilterChange={setProviderFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        levelFilter={levelFilter}
        onLevelFilterChange={setLevelFilter}
        gatewayLogLevel={gatewayLogLevel}
        onGatewayLogLevelChange={handleGatewayLogLevelChange}
        autoScroll={autoScroll}
        onAutoScrollToggle={() => setAutoScroll((prev) => !prev)}
        onCopy={handleCopy}
        copied={copied}
        onClear={handleClear}
        availableTools={availableTools}
        availableProviders={availableProviders}
      />

      {/* Main Content View */}
      {viewMode === "raw" ? (
        <RawTerminalView
          logs={filteredRawLogs}
          filterText={searchQuery}
          scrollRef={scrollContainerRef}
        />
      ) : (
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto space-y-2 pr-1 select-text min-h-0"
        >
          {filteredStructuredLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 py-16 space-y-2 select-none border border-[#1E293B] rounded-xl bg-[#05070B]">
              <Layers className="size-8 text-slate-600" />
              <p className="text-xs">
                {searchQuery.trim() || clientToolFilter !== "all" || providerFilter !== "all"
                  ? "No structured logs match the current filters."
                  : "No structured logs yet. Proxy and system events will appear here."}
              </p>
              <span className="text-[10px] text-slate-600 font-mono">
                Listening on http://127.0.0.1:20127/api/console-logs/stream
              </span>
            </div>
          ) : (
            filteredStructuredLogs.map((entry) => (
              <StructuredLogCard
                key={entry.id}
                entry={entry}
                onClick={() => handleInspectLog(entry)}
                isSelected={selectedLog?.id === entry.id && isDrawerOpen}
              />
            ))
          )}
        </div>
      )}

      {/* Slide-over Inspection Drawer */}
      <LogDetailDrawer
        entry={selectedLog}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />
    </div>
  );
};
