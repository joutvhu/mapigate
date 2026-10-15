import React, { useState, useEffect } from "react";
import { PortalModal } from "../components/PortalModal";
import { MasterPasswordModal, type MasterPasswordModalMode } from "../components/MasterPasswordModal";
import { useAuth } from "../hooks/useAuth";

interface SystemInfo {
  dataDir: string;
  dbPath: string;
  isDevelopmentMode: boolean;
  appName?: string;
  version?: string;
}

export const SettingsTab: React.FC = () => {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [isStopped, setIsStopped] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isPasswordSet = useAuth((s) => s.isPasswordSet);
  const [pwdModalMode, setPwdModalMode] = useState<MasterPasswordModalMode>(null);

  useEffect(() => {
    fetch("/api/settings/system-info")
      .then((res) => res.json())
      .then((data) => {
        if (data && (data.dbPath || data.dataDir)) {
          setSystemInfo(data);
        }
      })
      .catch(() => {});
  }, []);

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

      {/* Gateway Server Control / Danger Zone Card */}
      <div className="rt-card p-6 space-y-4 border border-rose-500/20">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1E293B]">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">power_settings_new</span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Gateway Server Control</h3>
              <p className="text-xs text-slate-400">Manage running server lifecycle and background processes</p>
            </div>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="rt-btn rt-btn--danger text-xs py-2 px-4 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[16px]">power_settings_new</span>
            Shutdown Server
          </button>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Shutting down the server stops all active AI proxy routing, terminates the background process, and releases the listening port. To resume using Mapigate afterwards, start it again from your terminal.
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
    </div>
  );
};
