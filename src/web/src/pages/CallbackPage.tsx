import { useEffect, useState, useRef } from "react";

export function CallbackPage() {
  const [status, setStatus] = useState<"processing" | "success" | "error" | "manual">("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canCloseManual, setCanCloseManual] = useState(false);
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const token = params.get("token") || params.get("access_token") || params.get("accessToken");
    const userId = params.get("user_id") || params.get("userId");
    const state = params.get("state");
    const error = params.get("error");
    const errorDescription = params.get("error_description");

    const effectiveCode = code || (userId && token ? window.location.href : token);

    const callbackData = {
      code: effectiveCode,
      token,
      userId,
      state,
      error,
      errorDescription,
      fullUrl: window.location.href,
    };

    // 1. Relay data to parent/opener via multiple channels (mirroring 9router)
    const relayToOpener = (payload: any) => {
      if (window.opener) {
        try {
          window.opener.postMessage({ type: "oauth_callback", data: payload }, "*");
        } catch {}
      }
      try {
        const channel = new BroadcastChannel("oauth_callback");
        channel.postMessage(payload);
        channel.close();
      } catch {}
      try {
        localStorage.setItem(
          "oauth_callback",
          JSON.stringify({ ...payload, timestamp: Date.now() })
        );
      } catch {}
    };

    if (error) {
      setStatus("error");
      setErrorMessage(errorDescription || error);
      relayToOpener(callbackData);
      return;
    }

    if (!effectiveCode) {
      setStatus("manual");
      return;
    }

    // Immediately relay raw code/token to opener
    relayToOpener(callbackData);

    // Also attempt direct server exchange from popup if pending flow metadata is cached
    const finishFlow = async () => {
      let pendingFlow: any = null;
      try {
        const raw = localStorage.getItem("oauth_pending_flow");
        if (raw) pendingFlow = JSON.parse(raw);
      } catch {}

      if (pendingFlow?.providerId) {
        try {
          const res = await fetch(`/api/oauth/${pendingFlow.providerId}/exchange`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code: effectiveCode,
              redirectUri: pendingFlow.redirectUri || `${window.location.origin}/callback`,
              codeVerifier: pendingFlow.codeVerifier,
              state: state || pendingFlow.state,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.success) {
            relayToOpener({ done: true, account: data.account });
            localStorage.removeItem("oauth_pending_flow");
          }
        } catch {
          // If direct exchange from popup fails, opener will handle it via relayed code
        }
      }

      setStatus("success");

      // Auto-close popup window
      setTimeout(() => {
        try {
          window.close();
        } catch {}
        setTimeout(() => {
          setCanCloseManual(true);
        }, 600);
      }, 800);
    };

    finishFlow();
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0D14] text-slate-100 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-sm bg-[#0F1420] border border-[#1E293B] rounded-2xl p-6 text-center shadow-2xl">
        {status === "processing" && (
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-2xl text-blue-500 animate-spin">
                progress_activity
              </span>
            </div>
            <h1 className="text-base font-semibold text-slate-100 mb-1">Connecting to Mapigate...</h1>
            <p className="text-xs text-slate-400">Verifying authorization and sending credentials to server.</p>
          </div>
        )}

        {status === "success" && (
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-2xl text-emerald-400">
                check_circle
              </span>
            </div>
            <h1 className="text-base font-semibold text-slate-100 mb-1">Authorization Successful!</h1>
            <p className="text-xs text-slate-400 mb-4">
              Credentials received. This window will close automatically...
            </p>
            {canCloseManual && (
              <button
                type="button"
                onClick={() => window.close()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium transition-colors"
              >
                Close Window
              </button>
            )}
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-2xl text-red-400">
                error
              </span>
            </div>
            <h1 className="text-base font-semibold text-slate-100 mb-1">Authorization Failed</h1>
            <p className="text-xs text-red-400 mb-4 break-words">
              {errorMessage || "Unable to complete authentication."}
            </p>
            <button
              type="button"
              onClick={() => window.close()}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium transition-colors"
            >
              Close Window
            </button>
          </div>
        )}

        {status === "manual" && (
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-2xl text-amber-400">
                info
              </span>
            </div>
            <h1 className="text-base font-semibold text-slate-100 mb-1">Copy Callback URL</h1>
            <p className="text-xs text-slate-400 mb-4">
              Please copy the URL from your address bar and paste it into the application.
            </p>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium transition-colors"
            >
              Copy URL
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default CallbackPage;
