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
import { useAuth } from "./hooks/useAuth";
import { useSystemInfo } from "./hooks/useSystemInfo";
import { LockScreen } from "./components/LockScreen";
import { RestartModal } from "./components/RestartModal";
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

  const isChecking = useAuth((s) => s.isChecking);
  const isLocked = useAuth((s) => s.isLocked);
  const checkAuth = useAuth((s) => s.checkAuth);
  const fetchSystemInfo = useSystemInfo((s) => s.fetchSystemInfo);

  useEffect(() => {
    checkAuth();
    fetchSystemInfo();
  }, [checkAuth, fetchSystemInfo]);

  const [currentTab, setCurrentTab] = useState<NavTab>("providers");
  const [searchQuery, setSearchQuery] = useState("");
  const [detailProvider, setDetailProvider] = useState<ProviderItem | null>(null);
  const [isRestartModalOpen, setIsRestartModalOpen] = useState(false);

  const handleSelectTab = (tab: NavTab) => {
    setCurrentTab(tab);
    setDetailProvider(null);
  };

  if (isChecking) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0A0D14] text-slate-400">
        <div className="size-8 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
      </div>
    );
  }

  if (isLocked) {
    return <LockScreen />;
  }

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
          onRestartClick={() => setIsRestartModalOpen(true)}
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
          {currentTab === "settings" && (
            <SettingsTab onRestartClick={() => setIsRestartModalOpen(true)} />
          )}
        </main>
      </div>

      {/* Global Restart Gateway Modal */}
      <RestartModal
        isOpen={isRestartModalOpen}
        onClose={() => setIsRestartModalOpen(false)}
      />
    </div>
  );
}
