import React, { useState, useEffect } from "react";
import { PortalModal } from "./PortalModal";

interface KiroAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const KiroAuthModal: React.FC<KiroAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [method, setMethod] = useState<"import" | "idc" | "apikey">("import");

  // Import method
  const [refreshToken, setRefreshToken] = useState("");
  const [accountName, setAccountName] = useState("");
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);
  const [idcMeta, setIdcMeta] = useState<{
    clientId?: string;
    clientSecret?: string;
    region?: string;
    authMethod?: string;
    profileArn?: string;
  } | null>(null);

  // IDC method
  const [idcStartUrl, setIdcStartUrl] = useState("");
  const [idcRegion, setIdcRegion] = useState("us-east-1");

  // API Key method
  const [apiKey, setApiKey] = useState("");
  const [apiKeyRegion, setApiKeyRegion] = useState("us-east-1");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (method === "import") {
      runAutoDetect();
    }
  }, [isOpen, method]);

  const runAutoDetect = async () => {
    setAutoDetecting(true);
    setAutoDetected(false);
    setError(null);

    try {
      const res = await fetch("/api/oauth/kiro/auto-import");
      const data = await res.json();
      if (data.found && data.refreshToken) {
        setRefreshToken(data.refreshToken);
        setAutoDetected(true);
        if (data.clientId && data.clientSecret) {
          setIdcMeta({
            clientId: data.clientId,
            clientSecret: data.clientSecret,
            region: data.region || "us-east-1",
            authMethod: data.authMethod || "idc",
            profileArn: data.profileArn,
          });
        }
      } else {
        setError(data.error || "Could not auto-detect token from ~/.aws/sso/cache");
      }
    } catch (err: any) {
      setError(err.message || "Failed to scan AWS SSO cache");
    } finally {
      setAutoDetecting(false);
    }
  };

  const handleSaveImport = async () => {
    if (!refreshToken.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/oauth/kiro/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refreshToken: refreshToken.trim(),
          name: accountName.trim() || undefined,
          ...(idcMeta || {}),
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to import Kiro credentials");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Import failed");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/oauth/kiro/api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey.trim(),
          region: apiKeyRegion.trim() || "us-east-1",
          name: accountName.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to save Kiro API key");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Could not save API key");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <PortalModal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-lg">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-[#0D1322] border border-[#1E293B] p-1.5 flex items-center justify-center">
              <img src="/providers/kiro.png" alt="Kiro" className="size-full object-contain" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Connect Kiro IDE</h3>
              <p className="text-xs text-slate-400">AWS Builder ID, IAM Identity Center (IDC), or API Key</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Method Switcher */}
        <div className="flex bg-[#0A0D14] p-1 rounded-xl border border-[#1E293B] text-xs">
          <button
            onClick={() => { setMethod("import"); setError(null); }}
            className={`flex-1 py-1.5 rounded-lg font-medium transition-colors ${
              method === "import" ? "bg-blue-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
            }`}
          >
            Auto-Import Token
          </button>
          <button
            onClick={() => { setMethod("idc"); setError(null); }}
            className={`flex-1 py-1.5 rounded-lg font-medium transition-colors ${
              method === "idc" ? "bg-blue-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
            }`}
          >
            AWS IAM (IDC)
          </button>
          <button
            onClick={() => { setMethod("apikey"); setError(null); }}
            className={`flex-1 py-1.5 rounded-lg font-medium transition-colors ${
              method === "apikey" ? "bg-blue-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
            }`}
          >
            Headless API Key
          </button>
        </div>

        {method === "import" && (
          <div className="space-y-3.5 text-xs">
            {autoDetecting ? (
              <div className="py-6 text-center text-slate-400 space-y-2">
                <span className="material-symbols-outlined text-3xl text-blue-400 animate-spin">
                  progress_activity
                </span>
                <p>Detecting token in ~/.aws/sso/cache...</p>
              </div>
            ) : (
              <>
                {autoDetected && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">check_circle</span>
                    <span>Kiro refresh token auto-detected from AWS SSO cache!</span>
                  </div>
                )}

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Account Label</label>
                  <input
                    type="text"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="Kiro Desktop Account"
                    className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Refresh Token (starts with aorAAAAAG...)</label>
                  <input
                    type="password"
                    value={refreshToken}
                    onChange={(e) => setRefreshToken(e.target.value)}
                    placeholder="aorAAAAAG..."
                    className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </>
            )}

            {error && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={runAutoDetect}
                className="rt-btn rt-btn--secondary"
              >
                <span className="material-symbols-outlined text-[15px]">refresh</span>
                Re-detect
              </button>
              <button
                type="button"
                onClick={handleSaveImport}
                disabled={saving || !refreshToken.trim()}
                className="flex-1 rt-btn rt-btn--primary disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Connection"}
              </button>
            </div>
          </div>
        )}

        {method === "idc" && (
          <div className="space-y-3.5 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Account Label</label>
              <input
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Enterprise Kiro Account"
                className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">AWS IDC Start URL</label>
              <input
                type="text"
                value={idcStartUrl}
                onChange={(e) => setIdcStartUrl(e.target.value)}
                placeholder="https://my-company.awsapps.com/start"
                className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">AWS Region</label>
              <input
                type="text"
                value={idcRegion}
                onChange={(e) => setIdcRegion(e.target.value)}
                placeholder="us-east-1"
                className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-white font-mono"
              />
            </div>
            <p className="text-[11px] text-slate-400">
              For IAM Identity Center SSO, log in once via the Kiro IDE or AWS CLI, then switch to the Auto-Import tab to read cached tokens.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMethod("import")}
                className="flex-1 rt-btn rt-btn--primary"
              >
                Use Auto-Import
              </button>
              <button type="button" onClick={onClose} className="rt-btn rt-btn--secondary">
                Cancel
              </button>
            </div>
          </div>
        )}

        {method === "apikey" && (
          <div className="space-y-3.5 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Account Label</label>
              <input
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Kiro Headless Key"
                className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Kiro API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste Kiro / CodeWhisperer key"
                className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Region</label>
              <input
                type="text"
                value={apiKeyRegion}
                onChange={(e) => setApiKeyRegion(e.target.value)}
                placeholder="us-east-1"
                className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-white font-mono"
              />
            </div>

            {error && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleSaveApiKey}
                disabled={saving || !apiKey.trim()}
                className="flex-1 rt-btn rt-btn--primary disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Connection"}
              </button>
              <button type="button" onClick={onClose} className="rt-btn rt-btn--secondary">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </PortalModal>
  );
};
