import React, { useState, useEffect } from "react";
import { PortalModal } from "./PortalModal";
import { ToolIcon } from "./ui/ToolIcon";

interface KiroAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type AuthMethod = "token" | "cliproxy" | "import" | "apikey" | "idc";

export const KiroAuthModal: React.FC<KiroAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [method, setMethod] = useState<AuthMethod>("token");

  // Direct Access Token method (Education / DevTools / aoa...)
  const [directToken, setDirectToken] = useState("");
  const [directRegion, setDirectRegion] = useState("us-east-1");
  const [directProfileArn, setDirectProfileArn] = useState("");

  // CLIProxy / External IDP JSON method
  const [cliProxyJson, setCliProxyJson] = useState("");

  // Auto-Import & Manual Refresh Token method
  const [refreshToken, setRefreshToken] = useState("");
  const [detectedAccessToken, setDetectedAccessToken] = useState("");
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
      if (data.found && (data.refreshToken || data.accessToken)) {
        if (data.refreshToken) setRefreshToken(data.refreshToken);
        if (data.accessToken) setDetectedAccessToken(data.accessToken);
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

  const handleSaveDirectToken = async () => {
    const token = directToken.trim();
    if (!token) {
      setError("Please enter your Access Token (aoa... or JWT)");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/oauth/kiro/access-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: token,
          name: accountName.trim() || (token.startsWith("aoa") ? "Kiro Education Token (aoa)" : undefined),
          region: directRegion.trim() || "us-east-1",
          profileArn: directProfileArn.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to save Access Token");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save Access Token");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCliProxy = async () => {
    const raw = cliProxyJson.trim();
    if (!raw) {
      setError("Please paste the External IDP / CLIProxy auth JSON");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/oauth/kiro/import-cli-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          json: raw,
          name: accountName.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to import External IDP JSON");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Import failed");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveImport = async () => {
    const rToken = refreshToken.trim();
    const aToken = detectedAccessToken.trim();
    if (!rToken && !aToken) {
      setError("Please provide a refresh token or access token");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/oauth/kiro/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refreshToken: rToken || undefined,
          accessToken: aToken || undefined,
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
            <ToolIcon
              src="/assets/providers/kiro/icon.png"
              name="Kiro"
              color="#FF9900"
              size="md"
            />
            <div>
              <h3 className="text-sm font-bold text-white">Connect Kiro IDE</h3>
              <p className="text-xs text-slate-400">Access Token, External IDP (Education), SSO, or API Key</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Method Switcher */}
        <div className="grid grid-cols-4 bg-[#0A0D14] p-1 rounded-xl border border-[#1E293B] text-[11px] gap-1">
          <button
            onClick={() => { setMethod("token"); setError(null); }}
            className={`py-1.5 px-2 rounded-lg font-medium transition-colors text-center ${
              method === "token" ? "bg-blue-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
            }`}
          >
            Access Token
          </button>
          <button
            onClick={() => { setMethod("cliproxy"); setError(null); }}
            className={`py-1.5 px-2 rounded-lg font-medium transition-colors text-center ${
              method === "cliproxy" ? "bg-blue-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
            }`}
          >
            External IDP
          </button>
          <button
            onClick={() => { setMethod("import"); setError(null); }}
            className={`py-1.5 px-2 rounded-lg font-medium transition-colors text-center ${
              method === "import" ? "bg-blue-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
            }`}
          >
            Auto-Import
          </button>
          <button
            onClick={() => { setMethod("apikey"); setError(null); }}
            className={`py-1.5 px-2 rounded-lg font-medium transition-colors text-center ${
              method === "apikey" ? "bg-blue-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
            }`}
          >
            API Key
          </button>
        </div>

        {/* Method 1: Direct Access Token (aoa... or JWT) */}
        {method === "token" && (
          <div className="space-y-3.5 text-xs">
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 space-y-1 text-[11px]">
              <div className="flex items-center gap-1.5 font-semibold text-blue-200">
                <span className="material-symbols-outlined text-[16px]">school</span>
                <span>Education / Student / Direct Token</span>
              </div>
              <p>Paste the <strong>AccessToken</strong> (starts with <code>aoa...</code>) or JWT token from DevTools (Cookies/Storage).</p>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Account Label</label>
              <input
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Kiro Education (aoa)"
                className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Access Token (aoaAAAAAG... or JWT)</label>
              <textarea
                rows={3}
                value={directToken}
                onChange={(e) => setDirectToken(e.target.value)}
                placeholder="Paste AccessToken (aoa... or eyJr...)"
                className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500 font-mono text-[11px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Region</label>
                <input
                  type="text"
                  value={directRegion}
                  onChange={(e) => setDirectRegion(e.target.value)}
                  placeholder="us-east-1"
                  className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-medium mb-1">Profile ARN (Optional)</label>
                <input
                  type="text"
                  value={directProfileArn}
                  onChange={(e) => setDirectProfileArn(e.target.value)}
                  placeholder="arn:aws:codewhisperer..."
                  className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>
            </div>

            {error && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleSaveDirectToken}
                disabled={saving || !directToken.trim()}
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

        {/* Method 2: External IDP / CLIProxy JSON */}
        {method === "cliproxy" && (
          <div className="space-y-3.5 text-xs">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[11px]">
              <p>For Microsoft/Federated accounts generated via CLIProxyAPI or Kiro external login. Paste the JSON containing <code>access_token</code>, <code>refresh_token</code>, and <code>token_endpoint</code>.</p>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Account Label (Optional)</label>
              <input
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Kiro Microsoft Education"
                className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">External IDP Auth JSON</label>
              <textarea
                rows={4}
                value={cliProxyJson}
                onChange={(e) => setCliProxyJson(e.target.value)}
                placeholder='{ "auth_method": "external_idp", "access_token": "...", "refresh_token": "...", "token_endpoint": "https://login.microsoftonline.com/..." }'
                className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500 font-mono text-[11px]"
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
                onClick={handleSaveCliProxy}
                disabled={saving || !cliProxyJson.trim()}
                className="flex-1 rt-btn rt-btn--primary disabled:opacity-50"
              >
                {saving ? "Importing..." : "Import JSON"}
              </button>
              <button type="button" onClick={onClose} className="rt-btn rt-btn--secondary">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Method 3: Auto-Import / SSO Cache */}
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
                    <span>Kiro token auto-detected from AWS SSO cache!</span>
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
                  <label className="block text-slate-300 font-medium mb-1">Refresh Token (starts with aor...)</label>
                  <input
                    type="password"
                    value={refreshToken}
                    onChange={(e) => setRefreshToken(e.target.value)}
                    placeholder="aorAAAAAG..."
                    className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                {detectedAccessToken && (
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Detected Access Token (aoa...)</label>
                    <input
                      type="password"
                      value={detectedAccessToken}
                      onChange={(e) => setDetectedAccessToken(e.target.value)}
                      placeholder="aoaAAAAAG..."
                      className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                )}
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
                disabled={saving || (!refreshToken.trim() && !detectedAccessToken.trim())}
                className="flex-1 rt-btn rt-btn--primary disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Connection"}
              </button>
            </div>
          </div>
        )}

        {/* Method 4: Headless API Key */}
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
