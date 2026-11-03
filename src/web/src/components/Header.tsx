import React, { useEffect } from "react";
import type { NavTab } from "./Sidebar";
import type { ProviderItem } from "../constants/providersData";
import { useAuth } from "../hooks/useAuth";
import { useSystemInfo } from "../hooks/useSystemInfo";
import { useMitmStatus } from "../hooks/useMitmStatus";
import { Github } from "lucide-react";

interface HeaderProps {
  currentTab: NavTab;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  detailProvider?: ProviderItem | null;
  onBackToProviders?: () => void;
  onRestartClick?: () => void;
  onSelectTab?: (tab: NavTab) => void;
}

const TOOL_NAME_MAP: Record<string, string> = {
  antigravity: "Antigravity",
  kiro: "Kiro",
  copilot: "GitHub Copilot",
  cursor: "Cursor",
};

function formatToolList(tools: string[]): string {
  if (!tools || tools.length === 0) return "";
  return tools
    .map((t) => TOOL_NAME_MAP[t] || t.charAt(0).toUpperCase() + t.slice(1))
    .join(", ");
}

const PAGE_META: Record<NavTab, { title: string; subtitle: string; icon: string }> = {
  endpoint: {
    title: "Endpoint & Key",
    subtitle: "Manage your local AI gateway endpoint and master keys",
    icon: "api",
  },
  providers: {
    title: "Providers",
    subtitle: "Manage your AI provider connections and encrypted API credentials",
    icon: "dns",
  },
  combos: {
    title: "Combos & Adapter",
    subtitle: "Group models under smart fallback and load-balancing combos",
    icon: "layers",
  },
  usage: {
    title: "Usage & Analytics",
    subtitle: "Real-time token metrics, savings analysis, and interactive routing topology",
    icon: "bar_chart",
  },
  quota: {
    title: "Quota Tracker",
    subtitle: "Track rate limits and multi-account sliding quota reset times",
    icon: "data_usage",
  },
  tokensaver: {
    title: "Token Saver",
    subtitle: "Lossless context optimization saving 20-40% input tokens",
    icon: "savings",
  },
  clitools: {
    title: "Tools & Mappings",
    subtitle: "One-click connection setups and universal model rewrite rules for AI assistants, IDEs & tools",
    icon: "widgets",
  },
  mitm: {
    title: "MITM Proxy",
    subtitle: "Intercept CLI & IDE tool traffic (Antigravity, Kiro, Copilot) via local Root CA",
    icon: "alt_route",
  },
  consolelog: {
    title: "Console Log",
    subtitle: "Live gateway server stdout, request streaming events, and system logs",
    icon: "terminal",
  },
  settings: {
    title: "Settings",
    subtitle: "Local SQLite database, hardware encryption vault, and system preferences",
    icon: "tune",
  },
};

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  searchQuery,
  onSearchChange,
  detailProvider,
  onBackToProviders,
  onRestartClick,
  onSelectTab,
}) => {
  const meta = PAGE_META[currentTab] || PAGE_META.providers;
  const isPasswordSet = useAuth((s) => s.isPasswordSet);
  const lock = useAuth((s) => s.lock);
  const systemInfo = useSystemInfo((s) => s.info);
  const fetchSystemInfo = useSystemInfo((s) => s.fetchSystemInfo);
  const version = systemInfo?.version;

  const mitmStatus = useMitmStatus((s) => s.status);
  const fetchMitmStatus = useMitmStatus((s) => s.fetchStatus);

  useEffect(() => {
    fetchMitmStatus();
    fetchSystemInfo();
    const interval = setInterval(() => {
      fetchMitmStatus();
      fetchSystemInfo();
    }, 10000);
    const onFocus = () => {
      fetchMitmStatus();
      fetchSystemInfo();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchMitmStatus, fetchSystemInfo]);

  const isMitmRunning = Boolean(mitmStatus?.running);
  const mitmPort = mitmStatus?.port || 443;
  const activeDnsCount = mitmStatus?.activeDnsCount || 0;
  const activeDnsTools = mitmStatus?.activeDnsTools || [];
  const orphanedDns = Boolean(mitmStatus?.orphanedDns);

  // Network listening status (Local-Only vs LAN)
  const listeningHost = systemInfo?.host || "127.0.0.1";
  const configuredHost = systemInfo?.configuredHost || listeningHost;
  const isRestartRequired = Boolean(systemInfo?.isRestartRequired);
  const isLanExposed = listeningHost === "0.0.0.0";

  let networkTooltip = isLanExposed
    ? `Network: LAN Active (0.0.0.0:${systemInfo?.port || 20127}) • Accessible from local network • Click to configure Endpoint`
    : `Network: Local Only (127.0.0.1:${systemInfo?.port || 20127}) • Isolated to this machine • Click to configure Endpoint`;
  let networkColorClass = isLanExposed
    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
    : "bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20";
  let networkLabel = isLanExposed ? "LAN Active" : "Local Only";
  let networkIcon = isLanExposed ? "wifi" : "shield";

  if (isRestartRequired) {
    const targetMode = configuredHost === "0.0.0.0" ? "LAN Active" : "Local Only";
    networkTooltip = `⚠️ Restart Required: Configured for ${targetMode} (${configuredHost}), but running on ${listeningHost}. Click Restart button to apply.`;
    networkColorClass = "bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25 animate-pulse";
    networkLabel = "Restart to apply";
    networkIcon = "restart_alt";
  }

  let mitmTooltip = "MITM Proxy: Stopped • Click to open settings";
  let mitmColorClass = "text-slate-500 hover:text-slate-300";

  if (orphanedDns) {
    mitmTooltip = `⚠️ MITM Warning: Server stopped but ${activeDnsCount} DNS redirect(s) still active (${formatToolList(activeDnsTools)})! Tools cannot connect. Click to fix.`;
    mitmColorClass = "text-amber-400 hover:text-amber-300 animate-pulse";
  } else if (isMitmRunning) {
    if (activeDnsCount > 0) {
      mitmTooltip = `MITM Proxy: Active on port ${mitmPort} • ${activeDnsCount} tool DNS active (${formatToolList(activeDnsTools)}) • Click to manage`;
      mitmColorClass = "text-emerald-400 hover:text-emerald-300";
    } else {
      mitmTooltip = `MITM Proxy: Running on port ${mitmPort} (Idle, 0 tool DNS active) • Click to configure`;
      mitmColorClass = "text-blue-400 hover:text-blue-300";
    }
  } else {
    mitmTooltip = "MITM Proxy: Stopped • Click to open settings";
    mitmColorClass = "text-slate-500 hover:text-slate-300";
  }

  return (
    <header className="rt-header">
      {/* Page Title & Breadcrumb */}
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="rt-header__icon-box">
          <span className="material-symbols-outlined text-[20px]">{meta.icon}</span>
        </div>
        <div className="flex flex-col min-w-0">
          {currentTab === "providers" && detailProvider ? (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={onBackToProviders}
                className="text-sm font-bold text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                title="Back to Providers"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                Providers
              </button>
              <span className="text-slate-600 text-xs">/</span>
              <h2 className="text-sm font-bold text-white tracking-tight leading-tight">
                {detailProvider.name}
              </h2>
            </div>
          ) : (
            <h2 className="text-sm font-bold text-white tracking-tight leading-tight">
              {meta.title}
            </h2>
          )}
          <p className="text-[11px] text-slate-400 truncate leading-tight mt-0.5">
            {currentTab === "providers" && detailProvider
              ? `Configure credentials, upstream headers, and fallback strategy for ${detailProvider.name}`
              : meta.subtitle}
          </p>
        </div>
      </div>

      {/* Header Tools */}
      <div className="flex items-center gap-2.5">
        {/* Search input */}
        <div className="relative w-64 h-8">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-slate-500 pointer-events-none">
            search
          </span>
          <input
            type="text"
            placeholder="Search providers & models..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-8 bg-[#111827] border border-[#1E293B] rounded-lg pl-9 pr-8 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors cursor-pointer flex items-center justify-center w-5 h-5 rounded hover:bg-white/5"
              title="Clear search"
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          )}
        </div>

        {/* Group 1: Gateway Status Indicators (Network Mode & MITM Proxy) */}
        <div className="flex items-center gap-1.5">
          {/* Network Access Status Button */}
          <button
            type="button"
            onClick={() => {
              if (isRestartRequired && onRestartClick) {
                onRestartClick();
              } else {
                onSelectTab?.("endpoint");
              }
            }}
            title={networkTooltip}
            className={`w-8 h-8 rounded-lg border text-xs font-medium transition-all cursor-pointer shadow-xs inline-flex items-center justify-center ${networkColorClass}`}
          >
            <span className="material-symbols-outlined text-[17px]">
              {networkIcon}
            </span>
          </button>

          {/* MITM Proxy Status Indicator Button */}
          <button
            type="button"
            onClick={() => onSelectTab?.("mitm")}
            title={mitmTooltip}
            className={`w-8 h-8 rounded-lg border border-[#1E293B] bg-[#111827] hover:bg-white/5 ${mitmColorClass} transition-colors cursor-pointer inline-flex items-center justify-center shadow-xs`}
          >
            <span className="material-symbols-outlined text-[17px]">alt_route</span>
          </button>
        </div>

        {/* Group 2: System & Security Actions */}
        <div className="flex items-center gap-1.5 border-l border-[#1E293B] pl-2.5">
          {onRestartClick && (
            <button
              type="button"
              onClick={onRestartClick}
              title="Restart Mapigate Gateway (Hot Reload)"
              className="w-8 h-8 rounded-lg border border-[#1E293B] bg-[#111827] hover:bg-white/5 hover:text-blue-400 text-slate-400 transition-colors cursor-pointer inline-flex items-center justify-center shadow-xs"
            >
              <span className="material-symbols-outlined text-[17px]">restart_alt</span>
            </button>
          )}

          {/* Lock Dashboard Button (visible when master password is configured) */}
          {isPasswordSet && (
            <button
              type="button"
              onClick={lock}
              title="Lock Dashboard (Master Password Protected)"
              className="w-8 h-8 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 hover:border-amber-500/30 transition-all cursor-pointer inline-flex items-center justify-center shadow-xs"
            >
              <span className="material-symbols-outlined text-[16px]">lock</span>
            </button>
          )}
        </div>

        {/* Group 3: External Links (GitHub) */}
        <div className="flex items-center border-l border-[#1E293B] pl-2.5">
          <a
            href="https://github.com/joutvhu/mapigate"
            target="_blank"
            rel="noreferrer"
            title="Mapigate on GitHub (joutvhu/mapigate)"
            className="hidden sm:inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#111827] hover:bg-white/5 text-slate-400 hover:text-white border border-[#1E293B] transition-all cursor-pointer shadow-xs"
          >
            <Github className="size-4" />
          </a>
        </div>
      </div>
    </header>
  );
};
