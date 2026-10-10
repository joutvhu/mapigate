import React from "react";

export type NavTab =
  | "endpoint"
  | "providers"
  | "combos"
  | "usage"
  | "quota"
  | "tokensaver"
  | "clitools"
  | "mitm"
  | "settings";

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab }) => {
  const mainNav = [
    { id: "endpoint" as NavTab, label: "Endpoint & Key", icon: "api" },
    { id: "providers" as NavTab, label: "Providers", icon: "dns" },
    { id: "combos" as NavTab, label: "Combo & Vision Adapter", icon: "layers" },
    { id: "usage" as NavTab, label: "Usage & Analytics", icon: "bar_chart" },
    { id: "quota" as NavTab, label: "Quota Tracker", icon: "data_usage" },
    { id: "tokensaver" as NavTab, label: "Token Saver (RTK)", icon: "savings" },
    { id: "clitools" as NavTab, label: "CLI Tools", icon: "terminal" },
    { id: "mitm" as NavTab, label: "MITM Proxy", icon: "security" },
  ];

  return (
    <aside className="rt-sidebar">
      <div>
        {/* Brand Logo Header */}
        <div className="rt-sidebar__brand pt-5">
          <div className="rt-sidebar__brand-icon">
            <span className="material-symbols-outlined text-[20px]">hub</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              Routen
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 font-mono">
                AI
              </span>
            </h1>
            <span className="text-[11px] text-slate-400">Local-first Gateway</span>
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
            onClick={() => onSelectTab("settings")}
            className={`rt-sidebar__nav-item ${
              currentTab === "settings" ? "rt-sidebar__nav-item--active" : ""
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              tune
            </span>
            <span>Settings & Storage</span>
          </button>
        </nav>
      </div>

      {/* Footer Status Pill */}
      <div className="p-4 border-t border-[#1E293B]">
        <div className="flex items-center justify-between text-xs text-slate-400 bg-[#111827] px-3.5 py-2.5 rounded-xl border border-[#1E293B] shadow-inner">
          <div className="flex items-center gap-2">
            <span className="rt-beacon size-2 bg-emerald-400" />
            <span className="font-semibold text-slate-200">Port 20127</span>
          </div>
          <span className="text-[10px] text-blue-400 font-mono bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
            127.0.0.1
          </span>
        </div>
      </div>
    </aside>
  );
};
