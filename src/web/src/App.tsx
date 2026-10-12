import { useState, useEffect } from "react";
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
import { ConsoleLogTab } from "./pages/ConsoleLogTab";
import { SettingsTab } from "./pages/SettingsTab";
import { CallbackPage } from "./pages/CallbackPage";
import type { ProviderItem } from "./constants/providersData";

export default function App() {
  const isCallbackRoute =
    typeof window !== "undefined" &&
    (window.location.pathname === "/callback" ||
      window.location.pathname === "/auth/callback" ||
      window.location.pathname.startsWith("/callback"));

  if (isCallbackRoute) {
    return <CallbackPage />;
  }

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
          {currentTab === "consolelog" && <ConsoleLogTab />}
          {currentTab === "settings" && <SettingsTab />}
        </main>
      </div>
    </div>
  );
}
