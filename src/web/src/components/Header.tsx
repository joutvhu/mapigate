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
  const version = systemInfo?.version;

  const mitmStatus = useMitmStatus((s) => s.status);
  const fetchMitmStatus = useMitmStatus((s) => s.fetchStatus);

  useEffect(() => {
    fetchMitmStatus();
    const interval = setInterval(fetchMitmStatus, 10000);
    const onFocus = () => fetchMitmStatus();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchMitmStatus]);

  const isMitmRunning = Boolean(mitmStatus?.running);
  const mitmPort = mitmStatus?.port || 443;
  const activeDnsCount = mitmStatus?.activeDnsCount || 0;
  const activeDnsTools = mitmStatus?.activeDnsTools || [];
  const orphanedDns = Boolean(mitmStatus?.orphanedDns);

  let mitmTooltip = "MITM Proxy: Stopped • Click to open settings";
  let mitmIcon = "alt_route";
  let mitmButtonClass =
    "p-2 rounded-lg hover:bg-white/5 hover:text-slate-300 text-slate-500 transition-colors cursor-pointer";
  let mitmBadge: React.ReactNode = null;

  if (orphanedDns) {
    mitmTooltip = `⚠️ MITM Warning: Server stopped but ${activeDnsCount} DNS redirect(s) still active (${formatToolList(activeDnsTools)})! Tools cannot connect. Click to fix.`;
    mitmIcon = "alt_route";
    mitmButtonClass =
      "p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition-all cursor-pointer shadow-xs";
    mitmBadge = (
      <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
      </span>
    );
  } else if (isMitmRunning) {
    if (activeDnsCount > 0) {
      mitmTooltip = `MITM Proxy: Active on port ${mitmPort} • ${activeDnsCount} tool DNS active (${formatToolList(activeDnsTools)}) • Click to manage`;
      mitmIcon = "alt_route";
      mitmButtonClass =
        "p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 transition-all cursor-pointer shadow-xs";
      mitmBadge = (
        <span className="absolute -top-1 -right-1 flex h-3.5 min-w-[14px] px-1 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-slate-950 ring-2 ring-[#0B0F19] leading-none">
          {activeDnsCount}
        </span>
      );
    } else {
      mitmTooltip = `MITM Proxy: Running on port ${mitmPort} (Idle, 0 tool DNS active) • Click to configure`;
      mitmIcon = "alt_route";
      mitmButtonClass =
        "p-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/25 transition-all cursor-pointer shadow-xs";
      mitmBadge = (
        <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.8)]" />
      );
    }
  } else {
    mitmTooltip = "MITM Proxy: Stopped • Click to open settings";
    mitmIcon = "alt_route";
    mitmButtonClass =
      "p-2 rounded-lg hover:bg-white/5 hover:text-slate-300 text-slate-500 transition-colors cursor-pointer";
    mitmBadge = (
      <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-slate-600" />
    );
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
      <div className="flex items-center gap-3">
        {/* Search input */}
        <div className="relative w-64">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-slate-500">
            search
          </span>
          <input
            type="text"
            placeholder="Search providers & models..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-[#111827] border border-[#1E293B] rounded-xl pl-9 pr-8 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
              title="Clear search"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>

        {/* Local-First Badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 text-blue-400 text-xs font-semibold border border-blue-500/20 shadow-xs">
          <span className="material-symbols-outlined text-[15px]">verified_user</span>
          100% Local-First
        </div>

        {/* Version Badge */}
        {version && (
          <div className="hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#111827] text-slate-300 text-xs font-mono border border-[#1E293B] shadow-inner" title={`Mapigate Version v${version}`}>
            <span className="text-slate-500 text-[10px]">v</span>
            <span className="font-semibold text-slate-200">{version}</span>
          </div>
        )}

        {/* GitHub Repository Link */}
        <a
          href="https://github.com/joutvhu/mapigate"
          target="_blank"
          rel="noreferrer"
          title="Mapigate on GitHub (joutvhu/mapigate)"
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#111827] hover:bg-white/5 text-slate-300 hover:text-white text-xs font-medium border border-[#1E293B] transition-all cursor-pointer shadow-xs"
        >
          <Github className="size-3.5 text-slate-400" />
          <span className="hidden lg:inline text-[11px]">GitHub</span>
        </a>

        {/* Lock Dashboard Button (visible when master password is configured) */}
        {isPasswordSet && (
          <button
            type="button"
            onClick={lock}
            title="Lock Dashboard (Master Password Protected)"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 hover:border-amber-500/30 text-xs font-semibold transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px]">lock</span>
            <span className="hidden sm:inline">Lock</span>
          </button>
        )}

        {/* Action icons */}
        <div className="flex items-center gap-1 border-l border-[#1E293B] pl-2 text-slate-400">
          {onRestartClick && (
            <button
              type="button"
              onClick={onRestartClick}
              title="Restart Mapigate Gateway (Hot Reload)"
              className="p-2 rounded-lg hover:bg-white/5 hover:text-blue-400 text-slate-400 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">restart_alt</span>
            </button>
          )}
          {/* MITM Proxy Status Indicator Button */}
          <button
            type="button"
            onClick={() => onSelectTab?.("mitm")}
            title={mitmTooltip}
            className={`relative ${mitmButtonClass} ${currentTab === "mitm" ? "ring-1 ring-blue-500/50" : ""}`}
          >
            <span className="material-symbols-outlined text-[18px]">{mitmIcon}</span>
            {mitmBadge}
          </button>
        </div>
      </div>
    </header>
  );
};
