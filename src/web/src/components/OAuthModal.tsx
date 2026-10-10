import React, { useState, useEffect, useRef, useCallback } from "react";

interface OAuthModalProps {
  isOpen: boolean;
  providerId: string;
  providerName: string;
  onSuccess: () => void;
  onClose: () => void;
}

const DEFAULT_ANTIGRAVITY_AUTH_URL =
  "https://accounts.google.com/o/oauth2/v2/auth?client_id=REDACTED_GOOGLE_CLIENT_ID.apps.googleusercontent.com&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A20127%2Fcallback&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcloud-platform+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.profile+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcclog+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fexperimentsandconfigs&access_type=offline&prompt=consent";

export const OAuthModal: React.FC<OAuthModalProps> = ({
  isOpen,
  providerId,
  providerName,
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
  const [copied, setCopied] = useState(false);

  const popupRef = useRef<Window | null>(null);
  const callbackHandledRef = useRef(false);

  const exchangeCode = useCallback(
    async (codeToExchange: string) => {
      if (callbackHandledRef.current) return;
      callbackHandledRef.current = true;

      setStatus("processing");
      setErrorMessage(null);

      try {
        const res = await fetch(`/api/oauth/${providerId}/exchange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: codeToExchange,
            redirectUri,
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
    [providerId, redirectUri, onSuccess, onClose]
  );

  // Initialize and open popup
  useEffect(() => {
    if (!isOpen) {
      callbackHandledRef.current = false;
      setStatus("waiting");
      setErrorMessage(null);
      setCallbackUrl("");
      return;
    }

    const currentRedirect = `${window.location.origin}/callback`;
    setRedirectUri(currentRedirect);

    // Fetch dynamic authorize URL if available
    fetch(`/api/oauth/${providerId}/authorize?redirect_uri=${encodeURIComponent(currentRedirect)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.authUrl) {
          setAuthUrl(data.authUrl);
          if (data.redirectUri) setRedirectUri(data.redirectUri);
          popupRef.current = window.open(data.authUrl, "oauth_popup", "width=600,height=700");
        }
      })
      .catch(() => {
        // Fallback to static URL
        const fallbackUrl = providerId === "antigravity" ? DEFAULT_ANTIGRAVITY_AUTH_URL : "";
        if (fallbackUrl) {
          setAuthUrl(fallbackUrl);
          popupRef.current = window.open(fallbackUrl, "oauth_popup", "width=600,height=700");
        }
      });
  }, [isOpen, providerId]);

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

    // 1. postMessage
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
    } catch {
      // BroadcastChannel unsupported
    }

    // 3. localStorage storage event
    const onStorage = (event: StorageEvent) => {
      if (event.key === "oauth_callback" && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue);
          handleCallbackData(parsed);
          localStorage.removeItem("oauth_callback");
        } catch {
          //
        }
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

  const handleCopy = () => {
    if (!authUrl) return;
    navigator.clipboard.writeText(authUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleManualSubmit = () => {
    if (!callbackUrl.trim()) return;
    exchangeCode(callbackUrl.trim());
  };

  return (
    <div className="rt-modal-backdrop">
      <div className="rt-modal-content max-w-lg space-y-4">
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

        {/* Status indicator */}
        {status === "waiting" && (
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 border border-blue-500/20 rounded-xl bg-blue-500/10 text-xs text-blue-300">
            <span className="material-symbols-outlined text-[16px] text-blue-400 animate-spin">
              progress_activity
            </span>
            <span>Waiting for popup authorization...</span>
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
            <span>Connected successfully! Reloading connections...</span>
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

        {/* Divider */}
        <div className="flex items-center gap-3 my-2">
          <div className="flex-1 h-px bg-[#1E293B]" />
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            OR PASTE CALLBACK URL MANUALLY
          </span>
          <div className="flex-1 h-px bg-[#1E293B]" />
        </div>

        {/* Step 1 */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-200">
            Step 1: Open this URL in your browser
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={authUrl}
              className="flex-1 bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none focus:border-blue-500 select-all"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 px-3 py-2 rounded-xl border border-[#1E293B] bg-[#0A0D14] text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              <span className={`material-symbols-outlined text-[15px] ${copied ? "text-emerald-400" : ""}`}>
                {copied ? "check" : "content_copy"}
              </span>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        {/* Step 2 */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-200">
            Step 2: Paste the callback URL here
          </label>
          <p className="text-[11px] text-slate-400">
            After authorization, copy the full URL from your browser.
          </p>
          <input
            type="text"
            value={callbackUrl}
            onChange={(e) => setCallbackUrl(e.target.value)}
            placeholder="http://localhost:20127/callback?code=..."
            className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Actions */}
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
    </div>
  );
};
