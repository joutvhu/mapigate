import React from "react";
import { useSystemInfo } from "../hooks/useSystemInfo";
import { Github } from "lucide-react";
import { DEFAULT_PORT, DEFAULT_HOST } from "../../../shared/constants/network.js";

export type NavTab =
  | "endpoint"
  | "providers"
  | "combos"
  | "usage"
  | "quota"
  | "tokensaver"
  | "clitools"
  | "mitm"
  | "consolelog"
  | "settings";

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab }) => {
  const systemInfo = useSystemInfo((s) => s.info);
  const version = systemInfo?.version;
  const runningPort =
    systemInfo?.port ||
    (typeof window !== "undefined" && window.location.port && window.location.port !== "5173"
      ? Number(window.location.port)
      : DEFAULT_PORT);
  const runningHost =
    systemInfo?.host ||
    (typeof window !== "undefined" && window.location.hostname
      ? window.location.hostname
      : DEFAULT_HOST);

  const mainNav = [
    { id: "endpoint" as NavTab, label: "Endpoint & Key", icon: "api" },
    { id: "providers" as NavTab, label: "Providers", icon: "dns" },
    { id: "combos" as NavTab, label: "Combo & Vision Adapter", icon: "layers" },
    { id: "usage" as NavTab, label: "Usage & Analytics", icon: "bar_chart" },
    { id: "quota" as NavTab, label: "Quota Tracker", icon: "data_usage" },
    { id: "tokensaver" as NavTab, label: "Token Saver", icon: "savings" },
    { id: "clitools" as NavTab, label: "Tools & Mappings", icon: "widgets" },
    { id: "mitm" as NavTab, label: "MITM Proxy", icon: "alt_route" },
  ];

  return (
    <aside className="rt-sidebar">
      <div>
        {/* Brand Logo Header */}
        <div className="rt-sidebar__brand pt-5 pr-4 flex items-center gap-3">
          <div className="rt-sidebar__brand-icon shrink-0">
            <span className="material-symbols-outlined text-[20px]">graph_5</span>
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            {/* Line 1: H1 Title + Version Badge right-aligned on the same baseline */}
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-sm font-bold tracking-tight text-white leading-none truncate">
                Mapigate
              </h1>
              {version && (
                systemInfo?.hasUpdate && systemInfo.latestVersion ? (
                  <a
                    href="https://www.npmjs.com/package/mapigate"
                    target="_blank"
                    rel="noreferrer"
                    className="group relative inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/35 font-mono font-semibold shrink-0 select-none leading-none hover:bg-amber-500/25 transition-all cursor-pointer"
                    title={`New version v${systemInfo.latestVersion} available! Click to view on npm or run 'mpg upgrade'`}
                  >
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                    </span>
                    <span>v{version}</span>
                    <span className="text-[9px] text-amber-400 group-hover:translate-y-[-0.5px] transition-transform">↑</span>
                  </a>
                ) : (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/30 font-mono font-semibold shrink-0 shadow-xs select-none leading-none"
                    title={`Mapigate Version v${version}`}
                  >
                    v{version}
                  </span>
                )
              )}
            </div>
            {/* Line 2: Subtitle on its own full line */}
            <span className="text-[11px] text-slate-400 leading-normal mt-1 truncate">
              AI Model API Gateway
            </span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="px-3 pt-3 space-y-1">
          {mainNav.map((item) => {
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`rt-sidebar__nav-item ${active ? "rt-sidebar__nav-item--active" : ""}`}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* System section */}
        <div className="px-5 pt-6 pb-2">
          <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">
            SYSTEM PREFERENCES
          </span>
        </div>

        <nav className="px-3 space-y-1">
          <button
            onClick={() => onSelectTab("consolelog")}
            className={`rt-sidebar__nav-item ${
              currentTab === "consolelog" ? "rt-sidebar__nav-item--active" : ""
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              terminal
            </span>
            <span>Console Log</span>
          </button>
          <button
            onClick={() => onSelectTab("settings")}
            className={`rt-sidebar__nav-item ${
              currentTab === "settings" ? "rt-sidebar__nav-item--active" : ""
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              tune
            </span>
            <span>Settings</span>
          </button>
        </nav>
      </div>

      {/* Footer Status Pill & Links */}
      <div className="p-4 border-t border-[#1E293B] space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400 bg-[#111827] px-3.5 py-2.5 rounded-xl border border-[#1E293B] shadow-inner">
          <div className="flex items-center gap-2">
            <span className="rt-beacon size-2 bg-emerald-400" />
            <span className="font-semibold text-slate-200">Port {runningPort}</span>
          </div>
          <span className="text-[10px] text-blue-300 font-mono bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
            {runningHost}
          </span>
        </div>

        <a
          href="https://github.com/joutvhu/mapigate"
          target="_blank"
          rel="noreferrer"
          title="Mapigate on GitHub (joutvhu/mapigate)"
          className="flex items-center justify-center gap-2 w-full py-1.5 px-3 rounded-xl bg-[#111827]/60 hover:bg-white/5 border border-[#1E293B]/60 hover:border-[#1E293B] text-[11px] font-medium text-slate-400 hover:text-white transition-all cursor-pointer"
        >
          <Github className="size-3.5 text-slate-400" />
          <span>GitHub · joutvhu/mapigate</span>
        </a>
      </div>
    </aside>
  );
};
