import React, { useState, useEffect, useRef, useCallback } from "react";
import { PortalModal } from "./PortalModal";
import { Select } from "./Select";
import { getRegistryProvider } from "../../../shared/constants/providerRegistry";
import { useSystemInfo } from "../hooks/useSystemInfo.js";
import { DEFAULT_PORT } from "../../../shared/constants/network.js";

interface DeviceCodeData {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  interval?: number;
  expires_in?: number;
  _zcodePollToken?: string;
}

interface OAuthModalProps {
  isOpen: boolean;
  providerId: string;
  providerName: string;
  preOpenedPopup?: Window | null;
  onSuccess: () => void;
  onClose: () => void;
}

export const OAuthModal: React.FC<OAuthModalProps> = ({
  isOpen,
  providerId,
  providerName,
  onSuccess,
  onClose,
}) => {
  const systemInfo = useSystemInfo((s) => s.info);
  const effectivePort = systemInfo?.port || DEFAULT_PORT;

  const regProvider = getRegistryProvider(providerId);
  const availableRegions = regProvider?.regions || [];
  const [selectedRegion, setSelectedRegion] = useState<string>(
    regProvider?.defaultRegion || (availableRegions.length > 0 ? availableRegions[0].id : "")
  );

  const [authUrl, setAuthUrl] = useState("");
  const [redirectUri, setRedirectUri] = useState(`http://localhost:${effectivePort}/callback`);
  const [callbackUrl, setCallbackUrl] = useState("");
  const [status, setStatus] = useState<"loading" | "waiting" | "processing" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);

  // Device Code Flow states
  const [isDeviceCode, setIsDeviceCode] = useState(false);
  const [deviceData, setDeviceData] = useState<DeviceCodeData | null>(null);

  const popupRef = useRef<Window | null>(null);
  const callbackHandledRef = useRef(false);
  const codeVerifierRef = useRef<string | undefined>(undefined);
  const stateRef = useRef<string | undefined>(undefined);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearTimeout(pollIntervalRef.current as any);
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const exchangeCode = useCallback(
    async (codeToExchange: string) => {
      if (callbackHandledRef.current) return;
      callbackHandledRef.current = true;
      stopPolling();

      setStatus("processing");
      setErrorMessage(null);

      try {
        const res = await fetch(`/api/oauth/${providerId}/exchange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: codeToExchange,
            redirectUri,
            codeVerifier: codeVerifierRef.current,
            state: stateRef.current,
            region: selectedRegion || undefined,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) {
          throw new Error(data.error || "Token exchange failed");
        }

        setStatus("success");
        try {
          localStorage.removeItem("oauth_pending_flow");
          localStorage.removeItem("oauth_callback");
        } catch {}
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1200);
      } catch (err: any) {
        callbackHandledRef.current = false;
        setStatus("error");
        setErrorMessage(err.message || "Failed to exchange authorization token");
      }
    },
    [providerId, redirectUri, onSuccess, onClose, stopPolling, selectedRegion]
  );

  const loadOAuth = useCallback(
    async (regionOverride?: string) => {
      callbackHandledRef.current = false;
      stopPolling();
      setStatus("loading");
      setErrorMessage(null);
      setCallbackUrl("");
      setIsDeviceCode(false);
      setDeviceData(null);
      setPopupBlocked(false);
      codeVerifierRef.current = undefined;
      stateRef.current = undefined;

      const currentRegion = regionOverride !== undefined ? regionOverride : selectedRegion;
      const regionParam = currentRegion ? `&region=${encodeURIComponent(currentRegion)}` : "";
      const regionDeviceParam = currentRegion ? `?region=${encodeURIComponent(currentRegion)}` : "";

      const currentRedirect =
        window.location.port === "5173"
          ? `http://localhost:${effectivePort}/callback`
          : `${window.location.origin}/callback`;
      setRedirectUri(currentRedirect);

      try {
        const res = await fetch(
          `/api/oauth/${providerId}/authorize?redirect_uri=${encodeURIComponent(currentRedirect)}${regionParam}`
        );
        const data = await res.json().catch(() => ({}));

        if (!res.ok || data.error) {
          throw new Error(data.error || `Authorization error (HTTP ${res.status})`);
        }

        if (data.flowType === "device_code" || (!data.authUrl && data.flowType)) {
          setIsDeviceCode(true);
          setStatus("waiting");

          const dRes = await fetch(`/api/oauth/${providerId}/device-code${regionDeviceParam}`);
          const dData = await dRes.json().catch(() => ({}));
          if (!dRes.ok || !dData.device_code) {
            throw new Error(dData.error || "Failed to initiate device code flow");
          }

          setDeviceData(dData);
          const targetUrl = dData.verification_uri_complete || dData.verification_uri;
          if (targetUrl) {
            try {
              window.open(targetUrl, "_blank", "noopener,noreferrer");
            } catch {}
          }

          let intervalSec = Number(dData.interval) || 5;
          let isPollingActive = true;

          const schedulePoll = (delaySec: number) => {
            if (pollIntervalRef.current) clearTimeout(pollIntervalRef.current as any);
            pollIntervalRef.current = setTimeout(async () => {
              if (!isPollingActive) return;
              try {
                const pollRes = await fetch(`/api/oauth/${providerId}/poll`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    device_code: dData.device_code,
                    codeVerifier: dData.codeVerifier,
                    region: currentRegion || undefined,
                    extraData: {
                      ...(dData || {}),
                      _zcodePollToken: dData._zcodePollToken,
                      _minimaxPollByUser: dData._minimaxPollByUser,
                      codeVerifier: dData.codeVerifier,
                      user_code: dData.user_code,
                      region: currentRegion || undefined,
                    },
                  }),
                });
                const pollData = await pollRes.json();
                if (pollData.ok && pollData.success) {
                  isPollingActive = false;
                  stopPolling();
                  setStatus("success");
                  setTimeout(() => {
                    onSuccess();
                    onClose();
                  }, 1200);
                  return;
                }

                if (pollData.error === "slow_down") {
                  intervalSec = Math.min(intervalSec + 5, 30);
                  schedulePoll(intervalSec);
                  return;
                }

                if (pollData.error === "authorization_pending") {
                  schedulePoll(intervalSec);
                  return;
                }

                if (pollData.error) {
                  isPollingActive = false;
                  stopPolling();
                  setStatus("error");
                  setErrorMessage(pollData.error_description || pollData.error);
                  return;
                }

                schedulePoll(intervalSec);
              } catch {
                if (isPollingActive) {
                  schedulePoll(intervalSec);
                }
              }
            }, delaySec * 1000) as any;
          };

          schedulePoll(intervalSec);
          return;
        }

      if (data.authUrl) {
        setAuthUrl(data.authUrl);
        if (data.redirectUri) setRedirectUri(data.redirectUri);
        if (data.codeVerifier) codeVerifierRef.current = data.codeVerifier;
        if (data.state) stateRef.current = data.state;
        setStatus("waiting");

        // Cache pending flow info for the callback page
        try {
          localStorage.setItem(
            "oauth_pending_flow",
            JSON.stringify({
              providerId,
              redirectUri: data.redirectUri || currentRedirect,
              state: data.state,
              codeVerifier: data.codeVerifier,
              timestamp: Date.now(),
            })
          );
        } catch {}

        // Open popup window to authorization URL
        try {
          const opened = window.open(data.authUrl, "oauth_popup", "width=600,height=700");
          if (opened && !opened.closed) {
            popupRef.current = opened;
          } else {
            setPopupBlocked(true);
          }
        } catch {
          setPopupBlocked(true);
        }
        return;
      }

      throw new Error("No authorization URL returned from provider");
    } catch (err: any) {
      if (providerId === "antigravity" && DEFAULT_ANTIGRAVITY_AUTH_URL) {
        setAuthUrl(DEFAULT_ANTIGRAVITY_AUTH_URL);
        setStatus("waiting");
        try {
          const opened = window.open(DEFAULT_ANTIGRAVITY_AUTH_URL, "oauth_popup", "width=600,height=700");
          if (opened) popupRef.current = opened;
          else setPopupBlocked(true);
        } catch {
          setPopupBlocked(true);
        }
      } else {
        setStatus("error");
        setErrorMessage(err.message || "Failed to initialize authorization endpoint");
      }
    }
  }, [providerId, stopPolling, onSuccess, onClose, selectedRegion, effectivePort]);

  useEffect(() => {
    if (!isOpen) {
      stopPolling();
      setStatus("loading");
      setErrorMessage(null);
      return;
    }
    loadOAuth();
    return () => {
      stopPolling();
    };
  }, [isOpen, loadOAuth, stopPolling]);

  // Listen for callback across postMessage, BroadcastChannel, and localStorage
  useEffect(() => {
    if (!isOpen) return;

    const handleCallbackData = (data: any) => {
      if (!data) return;
      if (data.done) {
        callbackHandledRef.current = true;
        stopPolling();
        setStatus("success");
        try {
          localStorage.removeItem("oauth_pending_flow");
          localStorage.removeItem("oauth_callback");
        } catch {}
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1200);
        return;
      }
      if (data.error) {
        setStatus("error");
        setErrorMessage(data.errorDescription || data.error);
        return;
      }
      const code = data.code || data.token || (data.userId && data.token ? (data.fullUrl || `${window.location.origin}/?user_id=${data.userId}&access_token=${data.token}`) : null);
      if (code) {
        exchangeCode(code);
      }
    };

    // 1. postMessage from popup window
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "oauth_callback") {
        handleCallbackData(event.data.data);
      }
    };
    window.addEventListener("message", onMessage);

    // 2. BroadcastChannel
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("oauth_callback");
      channel.onmessage = (event) => handleCallbackData(event.data);
    } catch {}

    // 3. localStorage storage event
    const onStorage = (event: StorageEvent) => {
      if (event.key === "oauth_callback" && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue);
          handleCallbackData(parsed);
          localStorage.removeItem("oauth_callback");
        } catch {}
      }
    };
    window.addEventListener("storage", onStorage);

    // 4. Polling check on localStorage fallback (mirroring 9router)
    const pollLocalInterval = setInterval(() => {
      try {
        const stored = localStorage.getItem("oauth_callback");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && (!parsed.timestamp || Date.now() - parsed.timestamp < 60000)) {
            handleCallbackData(parsed);
          }
          localStorage.removeItem("oauth_callback");
        }
      } catch {}
    }, 500);

    return () => {
      clearInterval(pollLocalInterval);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
      if (channel) channel.close();
    };
  }, [isOpen, exchangeCode]);

  if (!isOpen) return null;

  const handleCopyUrl = () => {
    if (!authUrl) return;
    navigator.clipboard.writeText(authUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleCopyCode = (code: string) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleOpenAuthWindow = () => {
    if (!authUrl) return;
    setPopupBlocked(false);
    try {
      const opened = window.open(authUrl, "oauth_popup", "width=600,height=700");
      if (opened) {
        popupRef.current = opened;
      }
    } catch {}
  };

  const handleManualSubmit = () => {
    if (!callbackUrl.trim()) return;
    exchangeCode(callbackUrl.trim());
  };

  return (
    <PortalModal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-lg">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-blue-400">lock</span>
            <h3 className="text-base font-bold text-white tracking-tight">
              Connect {providerName}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Region / Cluster Selector if provider defines multiple regions */}
        {availableRegions.length > 0 && (
          <div className="space-y-1.5 p-3 rounded-xl bg-[#0A0D14] border border-[#1E293B]">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-slate-300">
                Server / Region:
              </label>
              <span className="text-[10px] text-slate-500 font-mono">
                {selectedRegion}
              </span>
            </div>
            <Select
              value={selectedRegion}
              onChange={(val) => {
                setSelectedRegion(val);
                loadOAuth(val);
              }}
              options={availableRegions.map((r) => ({
                value: r.id,
                label: r.label,
              }))}
            />
          </div>
        )}

        {/* Status indicators */}
        {status === "loading" && (
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 border border-blue-500/20 rounded-xl bg-blue-500/10 text-xs text-blue-300">
            <span className="material-symbols-outlined text-[16px] text-blue-400 animate-spin">
              progress_activity
            </span>
            <span>Initializing authorization for {providerName}...</span>
          </div>
        )}

        {status === "waiting" && (
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 border border-blue-500/20 rounded-xl bg-blue-500/10 text-xs text-blue-300">
            <span className="material-symbols-outlined text-[16px] text-blue-400 animate-spin">
              progress_activity
            </span>
            <span>
              {isDeviceCode
                ? "Waiting for device authorization in browser..."
                : popupBlocked
                ? "Authorization link ready. Click button below to open login window."
                : "Popup window opened. Complete authorization in browser..."}
            </span>
          </div>
        )}

        {status === "processing" && (
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 border border-blue-500/20 rounded-xl bg-blue-500/10 text-xs text-blue-300">
            <span className="material-symbols-outlined text-[16px] text-blue-400 animate-spin">
              sync
            </span>
            <span>Exchanging authorization code and saving credentials...</span>
          </div>
        )}

        {status === "success" && (
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 border border-emerald-500/30 rounded-xl bg-emerald-500/10 text-xs text-emerald-300">
            <span className="material-symbols-outlined text-[16px] text-emerald-400 font-bold">
              check_circle
            </span>
            <span>Connected successfully! Refreshing connections...</span>
          </div>
        )}

        {status === "error" && errorMessage && (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 px-3.5 py-2.5 border border-red-500/30 rounded-xl bg-red-500/10 text-xs text-red-300">
              <span className="material-symbols-outlined text-[16px] text-red-400 mt-0.5 shrink-0">
                error
              </span>
              <div className="flex-1 space-y-1">
                <p className="font-semibold">Connection Failed</p>
                <p className="text-red-200">{errorMessage}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => loadOAuth()}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-200 border border-[#1E293B] cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">refresh</span>
              Retry Authorization
            </button>
          </div>
        )}

        {/* Device Code Flow UI */}
        {isDeviceCode && deviceData ? (
          <div className="space-y-4 pt-1">
            <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-2">
              <label className="text-xs font-semibold text-slate-200 block">
                Your One-Time Device Code:
              </label>
              <div className="flex items-center gap-2">
                <span className="flex-1 bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-sm font-mono text-white tracking-widest font-bold text-center select-all">
                  {deviceData.user_code}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyCode(deviceData.user_code)}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl border border-[#1E293B] bg-[#0A0D14] text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
                >
                  <span className={`material-symbols-outlined text-[15px] ${copiedCode ? "text-emerald-400" : ""}`}>
                    {copiedCode ? "check" : "content_copy"}
                  </span>
                  {copiedCode ? "Copied" : "Copy Code"}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                const url = deviceData.verification_uri_complete || deviceData.verification_uri;
                if (url) window.open(url, "_blank", "noopener,noreferrer");
              }}
              className="rt-btn rt-btn--primary w-full flex items-center justify-center gap-2 py-2.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">open_in_new</span>
              Open Verification Page
            </button>

            <div className="flex items-center gap-3 my-2">
              <div className="flex-1 h-px bg-[#1E293B]" />
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                OR PASTE TOKEN MANUALLY
              </span>
              <div className="flex-1 h-px bg-[#1E293B]" />
            </div>

            <div className="space-y-1.5">
              <input
                type="text"
                value={callbackUrl}
                onChange={(e) => setCallbackUrl(e.target.value)}
                placeholder="Paste token or authorization response..."
                className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        ) : (
          /* Standard Authorization Code Flow UI */
          <div className="space-y-4">
            {/* Direct Authorization Trigger Button */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleOpenAuthWindow}
                disabled={!authUrl || status === "loading"}
                className="rt-btn rt-btn--primary w-full flex items-center justify-center gap-2 py-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                <span>Open Authorization Window</span>
              </button>
              {popupBlocked && (
                <p className="text-[11px] text-amber-400 text-center flex items-center justify-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">info</span>
                  Browser blocked popup window. Click above to open the login window directly.
                </p>
              )}
            </div>

            {/* Step 1: URL & Copy */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-200">
                  Step 1: Authorization Link
                </label>
                {authUrl && (
                  <button
                    type="button"
                    onClick={() => window.open(authUrl, "_blank")}
                    className="text-[11px] text-blue-400 hover:text-blue-300 underline cursor-pointer"
                  >
                    Open in new tab
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={authUrl || (status === "loading" ? "Initializing link..." : "Generating authorization link...")}
                  className="flex-1 bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none focus:border-blue-500 select-all"
                />
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  disabled={!authUrl}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl border border-[#1E293B] bg-[#0A0D14] text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                >
                  <span className={`material-symbols-outlined text-[15px] ${copiedUrl ? "text-emerald-400" : ""}`}>
                    {copiedUrl ? "check" : "content_copy"}
                  </span>
                  {copiedUrl ? "Copied" : "Copy Link"}
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 my-2">
              <div className="flex-1 h-px bg-[#1E293B]" />
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                OR PASTE CALLBACK URL / CODE
              </span>
              <div className="flex-1 h-px bg-[#1E293B]" />
            </div>

            {/* Step 2: Callback paste */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-200">
                Step 2: Paste callback URL or authorization code here
              </label>
              <p className="text-[11px] text-slate-400">
                After logging in, copy the full URL from your browser address bar and paste it below.
              </p>
              <input
                type="text"
                value={callbackUrl}
                onChange={(e) => setCallbackUrl(e.target.value)}
                placeholder={
                  providerId === "codex"
                    ? "http://localhost:1455/auth/callback?code=... or code"
                    : `${window.location.origin}/callback?code=... or code`
                }
                className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#1E293B]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleManualSubmit}
            disabled={!callbackUrl.trim() || status === "processing"}
            className="rt-btn rt-btn--primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "processing" ? "Exchanging..." : "Connect"}
          </button>
        </div>
      </div>
    </PortalModal>
  );
};
