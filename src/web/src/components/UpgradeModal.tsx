import React, { useState, useEffect, useRef } from "react";
import { PortalModal } from "./PortalModal";

export interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentVersion?: string;
  latestVersion?: string | null;
}

type UpgradeState = "confirm" | "upgrading" | "restarting" | "success" | "error" | "timeout";

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  isOpen,
  onClose,
  currentVersion,
  latestVersion,
}) => {
  const [status, setStatus] = useState<UpgradeState>("confirm");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const elapsedTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStatus("confirm");
      setErrorMessage(null);
      setElapsedSeconds(0);
    } else {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, [isOpen]);

  const startPolling = () => {
    let attempts = 0;

    // Wait a brief moment before starting poll to allow old server to exit
    setTimeout(() => {
      pollTimerRef.current = setInterval(async () => {
        attempts += 1;
        try {
          const res = await fetch("/health", {
            cache: "no-store",
            headers: { Accept: "application/json" },
          });
          if (res.ok) {
            const data = await res.json().catch(() => null);
            if (data?.status === "ok") {
              if (pollTimerRef.current) clearInterval(pollTimerRef.current);
              if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
              setStatus("success");
              setTimeout(() => {
                window.location.reload();
              }, 800);
            }
          }
        } catch {
          // Socket not ready yet
        }

        if (attempts >= 60) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
          setStatus("timeout");
        }
      }, 500);
    }, 800);
  };

  const handleConfirmUpgrade = async () => {
    setStatus("upgrading");
    setErrorMessage(null);
    setElapsedSeconds(0);

    const startTime = Date.now();
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 500);

    try {
      const res = await fetch("/api/server/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: false }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
        setErrorMessage(data.error || "Failed to upgrade Mapigate.");
        setStatus("error");
        return;
      }

      // Upgrade succeeded, gateway is now restarting
      setStatus("restarting");
      startPolling();
    } catch (err: any) {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
      setErrorMessage(err?.message || "Network error while requesting upgrade.");
      setStatus("error");
    }
  };

  return (
    <PortalModal
      isOpen={isOpen}
      onClose={() => {
        if (status === "confirm" || status === "error" || status === "timeout") {
          onClose();
        }
      }}
      maxWidthClass="max-w-md"
    >
      <div className="space-y-4">
        {status === "confirm" && (
          <>
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">upgrade</span>
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Upgrade Mapigate Gateway</h4>
                <p className="text-xs text-slate-400">Install the latest release from npm and reload</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0A0D14] border border-[#1E293B] space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Current Version:</span>
                <span className="font-mono font-semibold text-slate-300">v{currentVersion || "0.0.0"}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Target Version:</span>
                <span className="font-mono font-semibold text-amber-400">v{latestVersion || "latest"}</span>
              </div>
              <div className="pt-2 border-t border-[#1E293B] text-[11px] text-slate-400 leading-relaxed">
                Mapigate will run <code className="text-amber-400 font-mono">npm install -g mapigate@{latestVersion || "latest"}</code> and hot-reload the gateway. All database settings, API keys, and active combos will be preserved.
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <a
                href={`https://www.npmjs.com/package/mapigate`}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-1"
              >
                <span>View on npm</span>
                <span className="material-symbols-outlined text-[13px]">open_in_new</span>
              </a>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rt-btn rt-btn--secondary text-xs py-2 px-3.5 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmUpgrade}
                  className="rt-btn rt-btn--primary text-xs py-2 px-4 flex items-center gap-1.5 cursor-pointer font-semibold bg-amber-600 hover:bg-amber-500 text-white border-amber-500/40"
                >
                  <span className="material-symbols-outlined text-[16px]">upgrade</span>
                  Upgrade to v{latestVersion}
                </button>
              </div>
            </div>
          </>
        )}

        {status === "upgrading" && (
          <div className="py-6 px-2 text-center space-y-4">
            <div className="relative size-14 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-2 border-amber-500/20 border-t-amber-500 animate-spin" />
              <span className="material-symbols-outlined text-[28px] text-amber-400">download</span>
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">Upgrading Mapigate...</h4>
              <p className="text-xs text-slate-400 font-mono">
                npm install -g mapigate@{latestVersion || "latest"} ({elapsedSeconds}s)
              </p>
            </div>
            <p className="text-[11px] text-slate-500">
              Downloading and installing update. Please do not close this window.
            </p>
          </div>
        )}

        {status === "restarting" && (
          <div className="py-6 px-2 text-center space-y-4">
            <div className="relative size-14 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
              <span className="material-symbols-outlined text-[28px] text-blue-400">restart_alt</span>
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">Restarting Gateway...</h4>
              <p className="text-xs text-slate-400">
                Re-spawning daemon with v{latestVersion} ({elapsedSeconds}s)
              </p>
            </div>
            <p className="text-[11px] text-slate-500">
              Gateway is reloading. This dashboard will refresh automatically once online.
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="py-6 px-2 text-center space-y-4">
            <div className="size-14 mx-auto rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <span className="material-symbols-outlined text-[32px]">check_circle</span>
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">Upgrade Succeeded!</h4>
              <p className="text-xs text-emerald-400 font-medium">
                Mapigate v{latestVersion} is live. Refreshing dashboard...
              </p>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">error</span>
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Upgrade Failed</h4>
                <p className="text-xs text-slate-400">An error occurred while updating</p>
              </div>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 font-mono break-words leading-relaxed max-h-36 overflow-y-auto">
                {errorMessage}
              </div>
            )}

            <div className="p-3 rounded-xl bg-[#0A0D14] border border-[#1E293B] text-[11px] text-slate-400 space-y-1.5 leading-relaxed">
              <p className="font-semibold text-slate-300">You can upgrade manually from your terminal:</p>
              <div className="p-2 rounded bg-black/50 font-mono text-slate-200 text-[10px] space-y-1 select-all">
                <div>npm install -g mapigate@latest</div>
                <div>mpg restart</div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rt-btn rt-btn--secondary text-xs py-2 px-4 cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleConfirmUpgrade}
                className="rt-btn rt-btn--primary text-xs py-2 px-4 flex items-center gap-1 cursor-pointer font-semibold"
              >
                <span className="material-symbols-outlined text-[15px]">refresh</span>
                Retry
              </button>
            </div>
          </div>
        )}

        {status === "timeout" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">schedule</span>
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Server Still Starting</h4>
                <p className="text-xs text-slate-400">The gateway has not responded yet</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0A0D14] border border-[#1E293B] text-xs text-slate-300 space-y-2 leading-relaxed">
              <p>
                The upgrade may have completed, but the server is taking longer than expected to bind to port.
              </p>
              <p className="text-slate-400 text-[11px]">
                You can try refreshing the page or checking <code className="text-blue-400">mpg status</code> in your terminal.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rt-btn rt-btn--secondary text-xs py-2 px-4 cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rt-btn rt-btn--primary text-xs py-2 px-4 flex items-center gap-1.5 cursor-pointer font-semibold"
              >
                <span className="material-symbols-outlined text-[16px]">refresh</span>
                Refresh Page
              </button>
            </div>
          </div>
        )}
      </div>
    </PortalModal>
  );
};
