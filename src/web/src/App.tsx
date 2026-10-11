import React, { useState } from "react";
import { Sidebar, type NavTab } from "./components/Sidebar";
import { Header } from "./components/Header";
import { ProvidersTab } from "./pages/ProvidersTab";
import { ProviderDetailPage } from "./pages/ProviderDetailPage";
import { CombosTab } from "./pages/CombosTab";
import { UsageTab } from "./pages/UsageTab";
import { QuotaTab } from "./pages/QuotaTab";
import { CliToolsTab } from "./pages/CliToolsTab";
import { MitmTab } from "./pages/MitmTab";
import { EndpointTab } from "./pages/EndpointTab";
import { TokenSaverTab } from "./pages/TokenSaverTab";
import type { ProviderItem } from "./constants/providersData";

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavTab>("providers");
  const [searchQuery, setSearchQuery] = useState("");
  const [detailProvider, setDetailProvider] = useState<ProviderItem | null>(null);

  const handleSelectTab = (tab: NavTab) => {
    setCurrentTab(tab);
    setDetailProvider(null);
  };

  return (
    <div className="rt-app">
      {/* Blue Theme Sidebar with Glass Accents */}
      <Sidebar currentTab={currentTab} onSelectTab={handleSelectTab} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Sleek Top Header */}
        <Header
          currentTab={currentTab}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          detailProvider={detailProvider}
          onBackToProviders={() => setDetailProvider(null)}
        />

        {/* Tab Pages Scrollable Container */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 w-full">
          {currentTab === "endpoint" && <EndpointTab />}

          {currentTab === "providers" &&
            (detailProvider ? (
              <ProviderDetailPage
                provider={detailProvider}
                onBack={() => setDetailProvider(null)}
              />
            ) : (
              <ProvidersTab
                searchQuery={searchQuery}
                onSelectProvider={(p) => setDetailProvider(p)}
              />
            ))}

          {currentTab === "combos" && <CombosTab />}
          {currentTab === "usage" && <UsageTab />}
          {currentTab === "quota" && <QuotaTab />}
          {currentTab === "tokensaver" && <TokenSaverTab />}
          {currentTab === "clitools" && <CliToolsTab />}
          {currentTab === "mitm" && <MitmTab />}

          {currentTab === "settings" && (
            <div className="w-full px-2 sm:px-4 rt-card p-6 space-y-6 animate-rt-fade-in">
              <div className="flex items-center gap-3 pb-3 border-b border-[#1E293B]">
                <span className="material-symbols-outlined text-blue-400 text-[22px]">tune</span>
                <div>
                  <h3 className="text-sm font-bold text-white">System & Storage Preferences</h3>
                  <p className="text-xs text-slate-400">Local SQLite database and hardware encryption status</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="bg-[#0A0D14] p-4 rounded-xl border border-[#1E293B] space-y-1">
                  <span className="text-slate-500 uppercase text-[10px] font-bold">Storage Engine</span>
                  <p className="text-white font-mono font-semibold">SQLite WAL (node:sqlite)</p>
                  <p className="text-slate-400 text-[11px]">Concurrent read/write without locks</p>
                </div>

                <div className="bg-[#0A0D14] p-4 rounded-xl border border-[#1E293B] space-y-1">
                  <span className="text-slate-500 uppercase text-[10px] font-bold">Credential Vault</span>
                  <p className="text-emerald-400 font-mono font-semibold">AES-256-GCM Hardware-salted</p>
                  <p className="text-slate-400 text-[11px]">Tied to this machine ID</p>
                </div>
              </div>

              <div className="bg-[#0A0D14] p-4 rounded-xl border border-[#1E293B] text-xs font-mono text-slate-300 space-y-2">
                <span className="text-slate-500 uppercase text-[10px] font-bold block font-sans">
                  Local Data Directory:
                </span>
                <code className="text-blue-400 block bg-[#0F1420] p-2.5 rounded-lg border border-[#1E293B]">
                  ~/.routen/routen.sqlite
                </code>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
