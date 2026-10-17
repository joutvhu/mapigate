import React, { useState, useEffect, useRef } from "react";
import { PortalModal } from "./PortalModal";

export interface RestartModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type RestartState = "confirm" | "restarting" | "success" | "timeout";

export const RestartModal: React.FC<RestartModalProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<RestartState>("confirm");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const elapsedTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Reset modal state when opened
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
    const startTime = Date.now();
    let attempts = 0;

    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 500);

    // Initial wait before polling to give old process time to close socket
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
              }, 600);
            }
          }
        } catch {
          // Server still restarting / socket not bound yet
        }

        // Timeout after ~25 seconds
        if (attempts >= 50) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
          setStatus("timeout");
        }
      }, 500);
    }, 600);
  };

  const handleConfirmRestart = async () => {
    setStatus("restarting");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/server/restart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.error || "Failed to initiate server restart.");
        setStatus("confirm");
        return;
      }
    } catch {
      // If network closes immediately because socket was closed, proceed with polling
    }

    startPolling();
  };

  return (
    <PortalModal
      isOpen={isOpen}
      onClose={() => {
        if (status === "confirm" || status === "timeout") {
          onClose();
        }
      }}
      maxWidthClass="max-w-md"
    >
      <div className="space-y-4">
        {status === "confirm" && (
          <>
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">restart_alt</span>
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Restart Mapigate Gateway?</h4>
                <p className="text-xs text-slate-400">Gracefully reload server and apply new version</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0A0D14] border border-[#1E293B] text-xs text-slate-300 space-y-2 leading-relaxed">
              <p>
                Hot restarting the gateway reloads all provider modules, registries, and configuration. MITM proxy and tool DNS entries remain active across restart.
              </p>
              <p className="text-slate-400 text-[11px]">
                If you recently installed an update (e.g. via <code className="text-blue-400">npm install -g mapigate</code> or <code className="text-blue-400">npm run local:publish</code>), the new code will take effect immediately without needing to open a terminal or turn off DNS.
              </p>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                {errorMessage}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rt-btn rt-btn--secondary text-xs py-2 px-4 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRestart}
                className="rt-btn rt-btn--primary text-xs py-2 px-4 flex items-center gap-1.5 cursor-pointer font-semibold"
              >
                <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                Restart Gateway
              </button>
            </div>
          </>
        )}

        {status === "restarting" && (
          <div className="py-6 px-2 text-center space-y-4">
            <div className="relative size-14 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
              <span className="material-symbols-outlined text-[28px] text-blue-400">restart_alt</span>
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">Restarting Mapigate Gateway...</h4>
              <p className="text-xs text-slate-400">
                Re-spawning daemon and binding port ({elapsedSeconds}s)
              </p>
            </div>
            <p className="text-[11px] text-slate-500">
              Please wait. This page will refresh automatically once the new server responds.
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="py-6 px-2 text-center space-y-4">
            <div className="size-14 mx-auto rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <span className="material-symbols-outlined text-[32px]">check_circle</span>
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">Restart Succeeded!</h4>
              <p className="text-xs text-emerald-400 font-medium">
                Gateway is back online. Refreshing dashboard...
              </p>
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
                <h4 className="text-sm font-bold text-white">Restart Taking Longer Than Expected</h4>
                <p className="text-xs text-slate-400">The gateway server has not responded yet.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0A0D14] border border-[#1E293B] text-xs text-slate-300 space-y-2">
              <p>
                If the server failed to restart automatically, you can start it manually in your terminal:
              </p>
              <div className="bg-[#111827] p-2.5 rounded-lg border border-[#1E293B] font-mono text-[11px] text-blue-400">
                mpg start
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
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
                className="rt-btn rt-btn--primary text-xs py-2 px-4 flex items-center gap-1.5 cursor-pointer"
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
