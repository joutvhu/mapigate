import React from "react";
import type { NavTab } from "./Sidebar";
import type { ProviderItem } from "../constants/providersData";

interface HeaderProps {
  currentTab: NavTab;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  detailProvider?: ProviderItem | null;
  onBackToProviders?: () => void;
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
    title: "Combos & Vision Adapter",
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
    title: "Token Saver (RTK)",
    subtitle: "Lossless context optimization saving 20-40% input tokens",
    icon: "savings",
  },
  clitools: {
    title: "CLI Tools",
    subtitle: "One-click connection setups for Claude Code, Cursor, Cline, Copilot & more",
    icon: "terminal",
  },
  mitm: {
    title: "MITM Proxy",
    subtitle: "Intercept CLI & IDE tool traffic (Antigravity, Kiro, Copilot) via local Root CA",
    icon: "security",
  },
  settings: {
    title: "Settings & Storage",
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
}) => {
  const meta = PAGE_META[currentTab] || PAGE_META.providers;

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
            className="w-full bg-[#111827] border border-[#1E293B] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all"
          />
        </div>

        {/* Local-First Badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 text-blue-400 text-xs font-semibold border border-blue-500/20 shadow-xs">
          <span className="material-symbols-outlined text-[15px]">verified_user</span>
          100% Local-First
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 border-l border-[#1E293B] pl-2 text-slate-400">
          <button
            title="Active Protocol: OpenAI & Anthropic"
            className="p-2 rounded-lg hover:bg-white/5 hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">bolt</span>
          </button>

          <button
            title="English"
            className="px-2 py-1 rounded-lg hover:bg-white/5 hover:text-white text-xs font-semibold flex items-center gap-1"
          >
            <span className="text-xs">EN</span>
          </button>
        </div>
      </div>
    </header>
  );
};
