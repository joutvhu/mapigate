import React, { useState, useEffect, useRef } from "react";
import { PortalModal } from "./PortalModal";
import { ToolIcon } from "./ui/ToolIcon";

interface CopilotAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CopilotAuthModal: React.FC<CopilotAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [tab, setTab] = useState<"device" | "token">("device");
  const [deviceData, setDeviceData] = useState<{
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  } | null>(null);

  const [loadingCode, setLoadingCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<"idle" | "polling" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Paste token tab
  const [manualToken, setManualToken] = useState("");
  const [tokenName, setTokenName] = useState("");
  const [savingToken, setSavingToken] = useState(false);

  const pollIntervalRef = useRef<any>(null);

  useEffect(() => {
    if (!isOpen) {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      setDeviceData(null);
      setStatus("idle");
      return;
    }

    if (tab === "device") {
      startDeviceFlow();
    }

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [isOpen, tab]);

  const startDeviceFlow = async () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setLoadingCode(true);
    setErrorMessage(null);
    setStatus("idle");

    try {
      const res = await fetch("/api/oauth/github/device-code", { method: "POST" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to initiate GitHub device flow");
      }
      const data = await res.json();
      setDeviceData(data);
      setStatus("polling");

      const intervalSec = Math.max(data.interval || 5, 5);
      pollIntervalRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch("/api/oauth/github/poll", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device_code: data.device_code }),
          });
          const pollJson = await pollRes.json();
          if (pollJson.ok) {
            clearInterval(pollIntervalRef.current);
            setStatus("success");
            setTimeout(() => {
              onSuccess();
              onClose();
            }, 1200);
          } else if (pollJson.error && pollJson.error !== "authorization_pending") {
            clearInterval(pollIntervalRef.current);
            setStatus("error");
            setErrorMessage(pollJson.error_description || pollJson.error);
          }
        } catch {
          // Retry on next cycle
        }
      }, intervalSec * 1000);
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err.message || "Failed to request device code");
    } finally {
      setLoadingCode(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveManualToken = async () => {
    if (!manualToken.trim()) return;
    setSavingToken(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/oauth/github/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: manualToken.trim(),
          name: tokenName.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to save GitHub token");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Could not save token");
    } finally {
      setSavingToken(false);
    }
  };

  if (!isOpen) return null;

  return (
    <PortalModal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-lg">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
          <div className="flex items-center gap-3">
            <ToolIcon
              src="/assets/providers/github/icon.png"
              name="GitHub Copilot"
              color="#333333"
              iconBg="#FFFFFF"
              size="md"
            />
            <div>
              <h3 className="text-sm font-bold text-white">Connect GitHub Copilot</h3>
              <p className="text-xs text-slate-400">Authorize via official GitHub Device Flow</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-[#0A0D14] p-1 rounded-xl border border-[#1E293B] text-xs">
          <button
            onClick={() => setTab("device")}
            className={`flex-1 py-1.5 rounded-lg font-medium transition-colors ${
              tab === "device" ? "bg-blue-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
            }`}
          >
            GitHub Device Code Flow
          </button>
          <button
            onClick={() => setTab("token")}
            className={`flex-1 py-1.5 rounded-lg font-medium transition-colors ${
              tab === "token" ? "bg-blue-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
            }`}
          >
            Paste Token Directly
          </button>
        </div>

        {tab === "device" ? (
          <div className="space-y-4 text-xs">
            {loadingCode ? (
              <div className="py-8 text-center text-slate-400 space-y-2">
                <span className="material-symbols-outlined text-3xl text-blue-400 animate-spin">
                  progress_activity
                </span>
                <p>Requesting GitHub device code...</p>
              </div>
            ) : deviceData ? (
              <div className="space-y-4">
                {/* Step 1 */}
                <div className="p-3 bg-[#0A0D14] border border-[#1E293B] rounded-xl space-y-2">
                  <span className="text-slate-400 uppercase text-[10px] font-bold block">
                    Step 1: Copy One-Time User Code
                  </span>
                  <div className="flex items-center justify-between gap-3 bg-[#0F1420] p-3 rounded-lg border border-[#1E293B]">
                    <span className="text-xl font-mono font-bold text-white tracking-widest">
                      {deviceData.user_code}
                    </span>
                    <button
                      onClick={() => copyToClipboard(deviceData.user_code)}
                      className="rt-btn rt-btn--secondary py-1 text-xs"
                    >
                      <span className="material-symbols-outlined text-[15px]">
                        {copied ? "check" : "content_copy"}
                      </span>
                      {copied ? "Copied" : "Copy Code"}
                    </button>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="p-3 bg-[#0A0D14] border border-[#1E293B] rounded-xl space-y-2">
                  <span className="text-slate-400 uppercase text-[10px] font-bold block">
                    Step 2: Authorize in Browser
                  </span>
                  <p className="text-slate-300">
                    Open GitHub activation page and enter the user code shown above:
                  </p>
                  <a
                    href={deviceData.verification_uri || "https://github.com/login/device"}
                    target="_blank"
                    rel="noreferrer"
                    className="rt-btn rt-btn--primary w-full text-center inline-flex items-center justify-center gap-1.5"
                  >
                    <span>Open https://github.com/login/device</span>
                    <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                  </a>
                </div>

                {/* Status indicator */}
                {status === "polling" && (
                  <div className="flex items-center justify-center gap-2 text-slate-400 py-1 font-mono text-[11px]">
                    <span className="material-symbols-outlined text-blue-400 text-[16px] animate-spin">
                      sync
                    </span>
                    <span>Waiting for authorization on github.com...</span>
                  </div>
                )}

                {status === "success" && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">check_circle</span>
                    <span>Authorized successfully! Connecting Copilot...</span>
                  </div>
                )}
              </div>
            ) : null}

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">error</span>
                <span>{errorMessage}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3.5 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Account Label</label>
              <input
                type="text"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                placeholder="Copilot Work Account"
                className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">GitHub Access Token or Copilot Token</label>
              <input
                type="password"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="ghu_... or ghp_..."
                className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500 font-mono"
              />
              <p className="text-[11px] text-slate-400 mt-1.5">
                Paste your GitHub token from VS Code extension or personal token. Mapigate encrypts it locally.
              </p>
            </div>

            {errorMessage && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                {errorMessage}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSaveManualToken}
                disabled={savingToken || !manualToken.trim()}
                className="flex-1 rt-btn rt-btn--primary disabled:opacity-50"
              >
                {savingToken ? "Connecting..." : "Save Copilot Account"}
              </button>
              <button onClick={onClose} className="rt-btn rt-btn--secondary">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </PortalModal>
  );
};
