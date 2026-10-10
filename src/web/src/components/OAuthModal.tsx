import React, { useState, useEffect, useRef, useCallback } from "react";
import { PortalModal } from "./PortalModal";

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

const DEFAULT_ANTIGRAVITY_AUTH_URL =
  "https://accounts.google.com/o/oauth2/v2/auth?client_id=REDACTED_GOOGLE_CLIENT_ID.apps.googleusercontent.com&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A20127%2Fcallback&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcloud-platform+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.profile+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcclog+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fexperimentsandconfigs&access_type=offline&prompt=consent";

export const OAuthModal: React.FC<OAuthModalProps> = ({
  isOpen,
  providerId,
  providerName,
  preOpenedPopup,
  onSuccess,
  onClose,
}) => {
  const [authUrl, setAuthUrl] = useState(
    providerId === "antigravity" ? DEFAULT_ANTIGRAVITY_AUTH_URL : ""
  );
  const [redirectUri, setRedirectUri] = useState("http://localhost:20127/callback");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [status, setStatus] = useState<"waiting" | "processing" | "success" | "error">("waiting");
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
          }),
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || "Token exchange failed");
        }

        setStatus("success");
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
    [providerId, redirectUri, onSuccess, onClose, stopPolling]
  );

  // Initialize and trigger OAuth flow
  useEffect(() => {
    if (!isOpen) {
      callbackHandledRef.current = false;
      stopPolling();
      setStatus("waiting");
      setErrorMessage(null);
      setCallbackUrl("");
      setIsDeviceCode(false);
      setDeviceData(null);
      setPopupBlocked(false);
      codeVerifierRef.current = undefined;
      stateRef.current = undefined;
      return;
    }

    const currentRedirect = `${window.location.origin}/callback`;
    setRedirectUri(currentRedirect);

    // If pre-opened popup was provided from user click gesture, attach it
    if (preOpenedPopup && !preOpenedPopup.closed) {
      popupRef.current = preOpenedPopup;
    }

    // Fetch authorization URL or detect device code flow
    fetch(`/api/oauth/${providerId}/authorize?redirect_uri=${encodeURIComponent(currentRedirect)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.flowType === "device_code" || (!data.authUrl && data.flowType)) {
          // Switch to Device Code Flow
          setIsDeviceCode(true);
          if (popupRef.current && !popupRef.current.closed) {
            try {
              popupRef.current.close();
            } catch {}
          }
          fetch(`/api/oauth/${providerId}/device-code`)
            .then((res) => res.json())
            .then((dData) => {
              if (dData.device_code) {
                setDeviceData(dData);
                // Open verification URL in new tab if available
                const targetUrl = dData.verification_uri_complete || dData.verification_uri;
                if (targetUrl) {
                  try {
                    window.open(targetUrl, "_blank", "noopener,noreferrer");
                  } catch {}
                }
                // Start polling
                const intervalSec = Number(dData.interval) || 5;
                pollIntervalRef.current = setInterval(async () => {
                  try {
                    const pollRes = await fetch(`/api/oauth/${providerId}/poll`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        device_code: dData.device_code,
                        extraData: { _zcodePollToken: dData._zcodePollToken },
                      }),
                    });
                    const pollData = await pollRes.json();
                    if (pollData.ok && pollData.success) {
                      stopPolling();
                      setStatus("success");
                      setTimeout(() => {
                        onSuccess();
                        onClose();
                      }, 1200);
                    }
                  } catch {}
                }, intervalSec * 1000);
              }
            })
            .catch((err) => {
              setStatus("error");
              setErrorMessage(err.message || "Failed to initiate device code flow");
            });
          return;
        }

        if (data.authUrl) {
          setAuthUrl(data.authUrl);
          if (data.redirectUri) setRedirectUri(data.redirectUri);
          if (data.codeVerifier) codeVerifierRef.current = data.codeVerifier;
          if (data.state) stateRef.current = data.state;

          // Navigate the pre-opened popup window
          if (popupRef.current && !popupRef.current.closed) {
            try {
              popupRef.current.location.href = data.authUrl;
            } catch {
              setPopupBlocked(true);
            }
          } else {
            // Attempt opening popup directly
            try {
              const opened = window.open(data.authUrl, "oauth_popup", "width=600,height=700");
              if (opened) {
                popupRef.current = opened;
              } else {
                setPopupBlocked(true);
              }
            } catch {
              setPopupBlocked(true);
            }
          }
        }
      })
      .catch(() => {
        // Fallback for antigravity if network error occurs
        const fallbackUrl = providerId === "antigravity" ? DEFAULT_ANTIGRAVITY_AUTH_URL : "";
        if (fallbackUrl) {
          setAuthUrl(fallbackUrl);
          if (popupRef.current && !popupRef.current.closed) {
            try {
              popupRef.current.location.href = fallbackUrl;
            } catch {
              setPopupBlocked(true);
            }
          } else {
            try {
              const opened = window.open(fallbackUrl, "oauth_popup", "width=600,height=700");
              if (opened) {
                popupRef.current = opened;
              } else {
                setPopupBlocked(true);
              }
            } catch {
              setPopupBlocked(true);
            }
          }
        }
      });

    return () => {
      stopPolling();
    };
  }, [isOpen, providerId, preOpenedPopup, stopPolling, onSuccess, onClose]);

  // Listen for callback across postMessage, BroadcastChannel, and localStorage
  useEffect(() => {
    if (!isOpen) return;

    const handleCallbackData = (data: any) => {
      if (!data) return;
      if (data.error) {
        setStatus("error");
        setErrorMessage(data.errorDescription || data.error);
        return;
      }
      const code = data.code || data.token;
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

    return () => {
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
    const opened = window.open(authUrl, "oauth_popup", "width=600,height=700");
    if (opened) {
      popupRef.current = opened;
    }
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
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Status indicators */}
        {status === "waiting" && (
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 border border-blue-500/20 rounded-xl bg-blue-500/10 text-xs text-blue-300">
            <span className="material-symbols-outlined text-[16px] text-blue-400 animate-spin">
              progress_activity
            </span>
            <span>
              {isDeviceCode
                ? "Waiting for device authorization in browser..."
                : "Waiting for popup authorization..."}
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
          <div className="flex items-start gap-2.5 px-3.5 py-2.5 border border-red-500/30 rounded-xl bg-red-500/10 text-xs text-red-300">
            <span className="material-symbols-outlined text-[16px] text-red-400 mt-0.5 shrink-0">
              error
            </span>
            <p className="flex-1">{errorMessage}</p>
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
              className="rt-btn rt-btn--primary w-full flex items-center justify-center gap-2 py-2.5"
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
                disabled={!authUrl}
                className="rt-btn rt-btn--primary w-full flex items-center justify-center gap-2 py-2.5 cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                <span>Open Authorization Window</span>
              </button>
              {popupBlocked && (
                <p className="text-[11px] text-amber-400 text-center flex items-center justify-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">info</span>
                  Browser blocked popup. Click above to open the authorization window.
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
                  value={authUrl || "Generating authorization link..."}
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
                placeholder="http://localhost:20127/callback?code=..."
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
            Connect
          </button>
        </div>
      </div>
    </PortalModal>
  );
};
