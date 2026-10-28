import React from "react";
import { useSystemInfo } from "../hooks/useSystemInfo";
import { Github } from "lucide-react";

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
      : 20127);
  const runningHost =
    systemInfo?.host ||
    (typeof window !== "undefined" && window.location.hostname
      ? window.location.hostname
      : "127.0.0.1");

  const mainNav = [
    { id: "endpoint" as NavTab, label: "Endpoint & Key", icon: "api" },
    { id: "providers" as NavTab, label: "Providers", icon: "dns" },
    { id: "combos" as NavTab, label: "Combo & Vision Adapter", icon: "layers" },
    { id: "usage" as NavTab, label: "Usage & Analytics", icon: "bar_chart" },
    { id: "quota" as NavTab, label: "Quota Tracker", icon: "data_usage" },
    { id: "tokensaver" as NavTab, label: "Token Saver", icon: "savings" },
    { id: "clitools" as NavTab, label: "Coding Tools", icon: "integration_instructions" },
    { id: "mitm" as NavTab, label: "MITM Proxy", icon: "security" },
  ];

  return (
    <aside className="rt-sidebar">
      <div>
        {/* Brand Logo Header */}
        <div className="rt-sidebar__brand pt-5">
          <div className="rt-sidebar__brand-icon">
            <span className="material-symbols-outlined text-[20px]">graph_5</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              Mapigate
              {version ? (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 font-mono font-medium">
                  v{version}
                </span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 font-mono">
                  AI
                </span>
              )}
            </h1>
            <span className="text-[11px] text-slate-400">AI Model API Gateway</span>
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
          <span className="text-[10px] text-blue-400 font-mono bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
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
