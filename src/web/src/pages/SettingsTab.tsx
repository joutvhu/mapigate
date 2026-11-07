import React, { useState, useEffect } from "react";
import { PortalModal } from "../components/PortalModal";
import { RestartModal } from "../components/RestartModal";
import { MasterPasswordModal, type MasterPasswordModalMode } from "../components/MasterPasswordModal";
import { BackupCard } from "../components/BackupCard.js";
import { useAuth } from "../hooks/useAuth";
import { Github } from "lucide-react";
import { DEFAULT_PORT } from "../../../shared/constants/network.js";

interface SystemInfo {
  dataDir: string;
  dbPath: string;
  isDevelopmentMode: boolean;
  appName?: string;
  version?: string;
  port?: number;
  host?: string;
}

export interface SettingsTabProps {
  onRestartClick?: () => void;
  onUpgradeClick?: () => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({ onRestartClick, onUpgradeClick }) => {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRestartOpenInternal, setIsRestartOpenInternal] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [isStopped, setIsStopped] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isPasswordSet = useAuth((s) => s.isPasswordSet);
  const [pwdModalMode, setPwdModalMode] = useState<MasterPasswordModalMode>(null);
  const [autostartInfo, setAutostartInfo] = useState<{
    enabled: boolean;
    platform: string;
    targetPath: string | null;
  } | null>(null);
  const [isUpdatingAutostart, setIsUpdatingAutostart] = useState(false);
  const [logRetentionDays, setLogRetentionDays] = useState<number>(10);
  const [isSavingRetention, setIsSavingRetention] = useState<boolean>(false);
  const [retentionSaved, setRetentionSaved] = useState<boolean>(false);

  const handleOpenRestart = onRestartClick || (() => setIsRestartOpenInternal(true));

  useEffect(() => {
    fetch("/api/settings/system-info")
      .then((res) => res.json())
      .then((data) => {
        if (data && (data.dbPath || data.dataDir)) {
          setSystemInfo(data);
        }
      })
      .catch(() => {});

    fetch("/api/settings/autostart")
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data.enabled === "boolean") {
          setAutostartInfo(data);
        }
      })
      .catch(() => {});

    fetch("/api/settings/logging")
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data.logRetentionDays === "number") {
          setLogRetentionDays(data.logRetentionDays);
        }
      })
      .catch(() => {});
  }, []);

  const handleToggleAutostart = async () => {
    if (!autostartInfo || isUpdatingAutostart) return;
    const targetState = !autostartInfo.enabled;
    setIsUpdatingAutostart(true);
    try {
      const res = await fetch("/api/settings/autostart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: targetState }),
      });
      if (res.ok) {
        const data = await res.json();
        setAutostartInfo((prev) => (prev ? { ...prev, enabled: data.enabled } : data));
      }
    } catch {
      // ignore
    } finally {
      setIsUpdatingAutostart(false);
    }
  };

  const handleUpdateRetention = async (days: number) => {
    setLogRetentionDays(days);
    setIsSavingRetention(true);
    setRetentionSaved(false);
    try {
      const res = await fetch("/api/settings/logging", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logRetentionDays: days }),
      });
      if (res.ok) {
        setRetentionSaved(true);
        setTimeout(() => setRetentionSaved(false), 2000);
      }
    } catch {
      // ignore
    } finally {
      setIsSavingRetention(false);
    }
  };

  const handleConfirmShutdown = async () => {
    setIsShuttingDown(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/server/shutdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        setIsStopped(true);
        setIsModalOpen(false);
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error || "Failed to initiate server shutdown.");
        setIsShuttingDown(false);
      }
    } catch {
      // If server closed immediately or network error occurred, consider it stopped
      setIsStopped(true);
      setIsModalOpen(false);
    }
  };

  if (isStopped) {
    return (
      <div className="w-full px-2 sm:px-4 py-8 animate-rt-fade-in">
        <div className="max-w-xl mx-auto rt-card p-8 text-center space-y-4 border border-rose-500/20 bg-[#0F1420]">
          <div className="size-14 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px]">power_off</span>
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-white">Mapigate Gateway Server Stopped</h3>
            <p className="text-xs text-slate-400">
              The local server has shut down and will no longer accept proxy requests.
            </p>
          </div>
          <div className="bg-[#0A0D14] p-3 rounded-xl border border-[#1E293B] text-xs font-mono text-slate-300">
            To restart, run in terminal: <code className="text-blue-400">mpg</code> or <code className="text-blue-400">mapigate start</code>
          </div>
          <p className="text-[11px] text-slate-500">
            You may now safely close this browser tab.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-2 sm:px-4 space-y-6 animate-rt-fade-in pb-16">
      {/* System & Storage Preferences Card */}
      <div className="rt-card p-6 space-y-6">
        <div className="flex items-center gap-3 pb-3 border-b border-[#1E293B]">
          <span className="material-symbols-outlined text-blue-400 text-[22px]">tune</span>
          <div>
            <h3 className="text-sm font-bold text-white">System & Storage Preferences</h3>
            <p className="text-xs text-slate-400">Local SQLite database and hardware encryption status</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="bg-[#0A0D14] p-4 rounded-xl border border-[#1E293B] space-y-1">
            <span className="text-slate-500 uppercase text-[10px] font-bold">App Version & Gateway</span>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-white font-mono font-semibold">Mapigate v{systemInfo?.version || "0.3.3"}</p>
              {systemInfo?.hasUpdate && systemInfo.latestVersion && (
                <button
                  type="button"
                  onClick={onUpgradeClick}
                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/35 font-mono font-semibold hover:bg-amber-500/25 transition-all cursor-pointer"
                  title={`Upgrade to v${systemInfo.latestVersion}`}
                >
                  <span>v{systemInfo.latestVersion}</span>
                  <span className="text-[9px] text-amber-400">↑ Upgrade</span>
                </button>
              )}
            </div>
            <p className="text-blue-400 font-mono text-[11px]">Active on port {systemInfo?.port || DEFAULT_PORT}</p>
          </div>

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

          <div className="bg-[#0A0D14] p-4 rounded-xl border border-[#1E293B] space-y-1 flex flex-col justify-between">
            <div>
              <span className="text-slate-500 uppercase text-[10px] font-bold">Open Source</span>
              <p className="text-white font-mono font-semibold">GitHub Repository</p>
            </div>
            <a
              href="https://github.com/joutvhu/mapigate"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-[11px] font-medium hover:underline pt-1"
            >
              <Github className="size-3.5" />
              <span>joutvhu/mapigate</span>
              <span className="material-symbols-outlined text-[12px]">open_in_new</span>
            </a>
          </div>
        </div>

        <div className="bg-[#0A0D14] p-4 rounded-xl border border-[#1E293B] text-xs font-mono text-slate-300 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 uppercase text-[10px] font-bold block font-sans">
              Local Data Directory:
            </span>
            {systemInfo?.isDevelopmentMode && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 font-sans font-medium">
                Development Mode (.mapigate local)
              </span>
            )}
          </div>
          <code className="text-blue-400 block bg-[#0F1420] p-2.5 rounded-lg border border-[#1E293B] break-all select-all">
            {systemInfo?.dbPath || systemInfo?.dataDir || "~/.mapigate/mapigate.sqlite"}
          </code>
        </div>
      </div>

      {/* System Startup (Autostart on Boot) Card */}
      <div className="rt-card p-6 space-y-4 border border-[#1E293B]">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1E293B]">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">rocket_launch</span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">System Startup (Autostart on Boot)</h3>
              <p className="text-xs text-slate-400">Launch Mapigate gateway automatically in the background on computer boot</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleToggleAutostart}
              disabled={isUpdatingAutostart || !autostartInfo}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                autostartInfo?.enabled ? "bg-blue-600" : "bg-slate-700"
              }`}
              title={autostartInfo?.enabled ? "Click to disable autostart" : "Click to enable autostart"}
            >
              <span
                className={`pointer-events-none inline-block size-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  autostartInfo?.enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
            <span className={`text-xs font-semibold ${autostartInfo?.enabled ? "text-emerald-400" : "text-slate-400"}`}>
              {autostartInfo?.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
        </div>

        <div className="space-y-2 text-xs text-slate-400 leading-relaxed">
          <p>
            When enabled, Mapigate will automatically start as a silent background daemon with system tray icon whenever you log in to this computer. Coding assistants (Claude Code, Cursor, Cline, Copilot) can access AI endpoints without having to manually start the gateway.
          </p>
          {autostartInfo?.targetPath && (
            <div className="bg-[#0A0D14] p-3 rounded-xl border border-[#1E293B] text-slate-300 font-mono text-[11px] flex items-center justify-between gap-2">
              <span className="text-slate-500 uppercase text-[10px] font-bold font-sans shrink-0">
                Startup Target ({autostartInfo.platform}):
              </span>
              <code className="text-blue-400 truncate select-all">{autostartInfo.targetPath}</code>
            </div>
          )}
        </div>
      </div>

      {/* Master Password Protection Card */}
      <div className="rt-card p-6 space-y-4 border border-blue-500/20">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1E293B]">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">lock</span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Master Password Protection</h3>
              <p className="text-xs text-slate-400">Lock the Web Dashboard and guard management REST APIs</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isPasswordSet ? (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Protected
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20 flex items-center gap-1.5">
                Disabled (No Auth Required)
              </span>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          {isPasswordSet
            ? "Master Password protection is active. Accessing the Mapigate dashboard requires entering your password. AI coding assistant proxy endpoints (/v1/*) remain 100% unauthenticated and fast."
            : "By default, Mapigate requires no login. Set a master password if you want to protect your dashboard settings, provider credentials, and management APIs from unauthorized access."}
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          {!isPasswordSet ? (
            <button
              type="button"
              onClick={() => setPwdModalMode("setup")}
              className="rt-btn rt-btn--primary text-xs py-2 px-4 flex items-center gap-2 cursor-pointer font-semibold"
            >
              <span className="material-symbols-outlined text-[16px]">lock</span>
              Set Master Password
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setPwdModalMode("change")}
                className="rt-btn rt-btn--secondary text-xs py-2 px-4 flex items-center gap-2 cursor-pointer font-semibold"
              >
                <span className="material-symbols-outlined text-[16px]">key</span>
                Change Password
              </button>
              <button
                type="button"
                onClick={() => setPwdModalMode("remove")}
                className="rt-btn rt-btn--danger text-xs py-2 px-4 flex items-center gap-2 cursor-pointer font-semibold"
              >
                <span className="material-symbols-outlined text-[16px]">lock_open</span>
                Remove Password
              </button>
            </>
          )}
        </div>
      </div>

      {/* Configuration Backup & Migration Card */}
      <BackupCard />

      {/* Data Retention & Storage Policy Card */}
      <div className="rt-card p-6 space-y-4 border border-[#1E293B]">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1E293B]">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">database</span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Usage & Request Log Retention</h3>
              <p className="text-xs text-slate-400">Configure how long detailed request payloads and debug logs are kept</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {retentionSaved && (
              <span className="text-[11px] font-semibold text-emerald-400 animate-rt-fade-in flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                Saved
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3 text-xs text-slate-400 leading-relaxed">
          <p>
            Mapigate stores data in 3 tiers to maximize performance and prevent SQLite database bloat:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-slate-400 text-[11px]">
            <li><strong className="text-white">Tier 1 (Detailed Request Payloads):</strong> Kept according to the retention window below for debugging and inspection.</li>
            <li><strong className="text-white">Tier 2 (Daily Usage Analytics):</strong> Compact daily rollups by model, provider, account, and API key kept for 365+ days.</li>
            <li><strong className="text-white">Tier 3 (All-Time Totals):</strong> Total tokens saved, aggregate request counts, and cost metrics kept permanently.</li>
          </ul>

          <div className="pt-2">
            <label className="text-slate-300 font-semibold block text-xs mb-2">
              Detailed Request Log Retention Period:
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { label: "7 Days", value: 7 },
                { label: "10 Days (Default)", value: 10 },
                { label: "30 Days", value: 30 },
                { label: "90 Days", value: 90 },
                { label: "Keep All (No Auto-Prune)", value: 0 },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={isSavingRetention}
                  onClick={() => handleUpdateRetention(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    logRetentionDays === opt.value
                      ? "bg-blue-600 text-white shadow-xs border border-blue-500"
                      : "bg-[#0A0D14] border border-[#1E293B] text-slate-400 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Gateway Server Control Card */}
      <div className="rt-card p-6 space-y-4 border border-[#1E293B]">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1E293B]">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">power_settings_new</span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Gateway Server Control</h3>
              <p className="text-xs text-slate-400">Manage running server lifecycle, hot restart, and daemon</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleOpenRestart}
              className="rt-btn rt-btn--primary text-xs py-2 px-4 flex items-center gap-2 font-semibold cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">restart_alt</span>
              Restart Gateway
            </button>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="rt-btn rt-btn--danger text-xs py-2 px-4 flex items-center gap-2 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">power_settings_new</span>
              Shutdown Server
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Restarting the gateway applies any newly installed updates, re-initializes provider modules, and clears active sockets without needing to run terminal commands. Shutting down the server stops all active proxy routing, terminates the background process, and releases port {systemInfo?.port || DEFAULT_PORT}.
        </p>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Shutdown Confirmation Modal */}
      <PortalModal isOpen={isModalOpen} onClose={() => !isShuttingDown && setIsModalOpen(false)} maxWidthClass="max-w-md">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">warning</span>
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Shutdown Mapigate Gateway?</h4>
              <p className="text-xs text-slate-400">This will terminate the server process.</p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0A0D14] border border-[#1E293B] text-xs text-slate-300 space-y-2 leading-relaxed">
            <p>
              Are you sure you want to shut down the server? Active connections from coding assistants (Claude Code, Cursor, Kiro, etc.) will be disconnected immediately.
            </p>
            <p className="text-slate-400 text-[11px]">
              To restart later, run <span className="text-blue-400 font-mono">mapigate</span> in your terminal.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={() => setIsModalOpen(false)}
              disabled={isShuttingDown}
              className="rt-btn rt-btn--secondary text-xs py-2 px-4"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmShutdown}
              disabled={isShuttingDown}
              className="rt-btn rt-btn--danger text-xs py-2 px-4 flex items-center gap-1.5"
            >
              {isShuttingDown ? (
                <>
                  <span className="animate-spin text-[14px]">⠋</span>
                  Shutting Down...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">power_settings_new</span>
                  Confirm Shutdown
                </>
              )}
            </button>
          </div>
        </div>
      </PortalModal>

      {/* Master Password Configuration Modal */}
      <MasterPasswordModal
        mode={pwdModalMode}
        onClose={() => setPwdModalMode(null)}
      />

      {/* Internal Restart Modal (if not passed as external callback) */}
      {!onRestartClick && (
        <RestartModal
          isOpen={isRestartOpenInternal}
          onClose={() => setIsRestartOpenInternal(false)}
        />
      )}
    </div>
  );
};
