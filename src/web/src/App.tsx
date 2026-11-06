import { useState, useEffect, lazy, Suspense } from "react";
import { Sidebar, type NavTab } from "./components/Sidebar";
import { Header } from "./components/Header";
import { useAuth } from "./hooks/useAuth";
import { useSystemInfo } from "./hooks/useSystemInfo";
import { LockScreen } from "./components/LockScreen";
import { RestartModal } from "./components/RestartModal";
import { UpgradeModal } from "./components/UpgradeModal";
import type { ProviderItem } from "./constants/providersData";

const ProvidersTab = lazy(() => import("./pages/ProvidersTab").then((m) => ({ default: m.ProvidersTab })));
const ProviderDetailPage = lazy(() => import("./pages/ProviderDetailPage").then((m) => ({ default: m.ProviderDetailPage })));
const CombosTab = lazy(() => import("./pages/CombosTab").then((m) => ({ default: m.CombosTab })));
const UsageTab = lazy(() => import("./pages/UsageTab").then((m) => ({ default: m.UsageTab })));
const QuotaTab = lazy(() => import("./pages/QuotaTab").then((m) => ({ default: m.QuotaTab })));
const CliToolsTab = lazy(() => import("./pages/CliToolsTab").then((m) => ({ default: m.CliToolsTab })));
const MitmTab = lazy(() => import("./pages/MitmTab").then((m) => ({ default: m.MitmTab })));
const EndpointTab = lazy(() => import("./pages/EndpointTab").then((m) => ({ default: m.EndpointTab })));
const TokenSaverTab = lazy(() => import("./pages/TokenSaverTab").then((m) => ({ default: m.TokenSaverTab })));
const ConsoleLogTab = lazy(() => import("./pages/ConsoleLogTab").then((m) => ({ default: m.ConsoleLogTab })));
const SettingsTab = lazy(() => import("./pages/SettingsTab").then((m) => ({ default: m.SettingsTab })));
const CallbackPage = lazy(() => import("./pages/CallbackPage"));

function TabLoadingFallback() {
  return (
    <div className="flex items-center justify-center py-24 text-slate-500">
      <div className="size-6 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
    </div>
  );
}

export default function App() {
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const hasCallbackParams = Boolean(
    searchParams &&
      ((searchParams.has("user_id") && (searchParams.has("access_token") || searchParams.has("accessToken") || searchParams.has("token"))) ||
        (searchParams.has("userId") && (searchParams.has("access_token") || searchParams.has("accessToken") || searchParams.has("token"))))
  );

  const isCallbackRoute =
    typeof window !== "undefined" &&
    (window.location.pathname === "/callback" ||
      window.location.pathname === "/auth/callback" ||
      window.location.pathname === "/authorize" ||
      window.location.pathname.startsWith("/callback") ||
      hasCallbackParams);

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
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const systemInfo = useSystemInfo((s) => s.info);

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
      <Sidebar
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        onUpgradeClick={() => setIsUpgradeModalOpen(true)}
      />

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
          onSelectTab={handleSelectTab}
        />

        {/* Tab Pages Scrollable Container */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 w-full">
          <Suspense fallback={<TabLoadingFallback />}>
            {currentTab === "endpoint" && (
              <EndpointTab onRestartClick={() => setIsRestartModalOpen(true)} />
            )}

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
            {currentTab === "quota" && (
              <QuotaTab searchQuery={searchQuery} />
            )}
            {currentTab === "tokensaver" && <TokenSaverTab />}
            {currentTab === "clitools" && <CliToolsTab />}
            {currentTab === "mitm" && <MitmTab />}
            {currentTab === "consolelog" && <ConsoleLogTab />}
            {currentTab === "settings" && (
              <SettingsTab
                onRestartClick={() => setIsRestartModalOpen(true)}
                onUpgradeClick={() => setIsUpgradeModalOpen(true)}
              />
            )}
          </Suspense>
        </main>
      </div>

      {/* Global Restart Gateway Modal */}
      <RestartModal
        isOpen={isRestartModalOpen}
        onClose={() => setIsRestartModalOpen(false)}
      />

      {/* Global Upgrade Gateway Modal */}
      <UpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        currentVersion={systemInfo?.version}
        latestVersion={systemInfo?.latestVersion}
      />
    </div>
  );
}
