import React, { useState } from "react";
import { planBulkAdd } from "../utils/bulkAdd";

interface AddAccountModalProps {
  isOpen: boolean;
  provider: {
    id: string;
    name: string;
    image?: string;
    format?: string;
    website?: string;
    apiKeyUrl?: string;
  };
  existingNames?: string[];
  onClose: () => void;
  onSuccess: () => void;
}

export const AddAccountModal: React.FC<AddAccountModalProps> = ({
  isOpen,
  provider,
  existingNames = [],
  onClose,
  onSuccess,
}) => {
  const pId = provider.id.toLowerCase();
  const isOllamaLocal = pId === "ollama-local" || pId.includes("ollama");
  const isAzure = pId === "azure" || pId.includes("azure");
  const isCloudflareAi = pId === "cloudflare-ai";
  const isBedrock = pId === "bedrock" || pId.includes("bedrock");
  const isCookie = pId === "grok-web" || pId === "iflow";

  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [accountName, setAccountName] = useState("");
  const [apiKey, setApiKey] = useState("");

  // Specialized states
  const [ollamaHost, setOllamaHost] = useState("http://127.0.0.1:11434");
  const [azureEndpoint, setAzureEndpoint] = useState("");
  const [azureDeployment, setAzureDeployment] = useState("gpt-4");
  const [azureApiVersion, setAzureApiVersion] = useState("2024-10-01-preview");
  const [azureOrganization, setAzureOrganization] = useState("");
  const [cfAccountId, setCfAccountId] = useState("");

  // Bedrock
  const [bedrockMode, setBedrockMode] = useState<"profile" | "static">("profile");
  const [bedrockProfile, setBedrockProfile] = useState("");
  const [bedrockRegion, setBedrockRegion] = useState("us-east-1");
  const [bedrockAccessKeyId, setBedrockAccessKeyId] = useState("");
  const [bedrockSessionToken, setBedrockSessionToken] = useState("");

  // Bulk add
  const [bulkText, setBulkText] = useState("");
  const [bulkResult, setBulkResult] = useState<{ success: number; failed: number } | null>(null);

  // Status
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<"valid" | "invalid" | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const getPlaceholder = () => {
    if (isCookie) {
      return pId === "grok-web" ? "sso=xxxx... or raw cookie" : "eyJhbGciOi...";
    }
    if (pId.startsWith("deepseek")) return "sk-...";
    if (pId.startsWith("xai")) return "xai-...";
    if (pId.startsWith("groq")) return "gsk_...";
    if (pId.startsWith("anthropic")) return "sk-ant-...";
    if (pId.startsWith("gemini")) return "AIzaSy...";
    return "sk-...";
  };

  const buildProviderSpecificData = (): Record<string, any> | undefined => {
    if (isOllamaLocal) {
      return { baseUrl: ollamaHost.trim() || "http://127.0.0.1:11434" };
    }
    if (isAzure) {
      return {
        azureEndpoint: azureEndpoint.trim(),
        deployment: azureDeployment.trim(),
        apiVersion: azureApiVersion.trim(),
        organization: azureOrganization.trim() || undefined,
      };
    }
    if (isCloudflareAi) {
      return { accountId: cfAccountId.trim() };
    }
    if (isBedrock) {
      if (bedrockMode === "profile") {
        return {
          profile: bedrockProfile.trim(),
          region: bedrockRegion.trim() || "us-east-1",
        };
      }
      return {
        accessKeyId: bedrockAccessKeyId.trim(),
        region: bedrockRegion.trim() || "us-east-1",
        sessionToken: bedrockSessionToken.trim() || undefined,
      };
    }
    return undefined;
  };

  const isFormValid = () => {
    if (isOllamaLocal) return true;
    if (isBedrock && bedrockMode === "profile") return Boolean(bedrockProfile.trim());
    if (isBedrock && bedrockMode === "static") return Boolean(apiKey.trim() && bedrockAccessKeyId.trim());
    if (isAzure) return Boolean(apiKey.trim() && azureEndpoint.trim() && azureDeployment.trim());
    if (isCloudflareAi) return Boolean(apiKey.trim() && cfAccountId.trim());
    return Boolean(apiKey.trim());
  };

  const handleValidate = async () => {
    setValidating(true);
    setValidationResult(null);
    setValidationError(null);

    try {
      const psd = buildProviderSpecificData();
      const res = await fetch("/api/providers/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: provider.id,
          apiKey: apiKey.trim(),
          providerSpecificData: psd,
        }),
      });
      const data = await res.json();
      if (data.valid) {
        setValidationResult("valid");
      } else {
        setValidationResult("invalid");
        setValidationError(data.error || "Validation check failed");
      }
    } catch (err: any) {
      setValidationResult("invalid");
      setValidationError(err.message || "Connection check error");
    } finally {
      setValidating(false);
    }
  };

  const handleSaveSingle = async () => {
    if (!isFormValid()) return;
    setSaving(true);
    setError(null);

    const defaultName = isOllamaLocal
      ? "Ollama Local"
      : isBedrock && bedrockMode === "profile"
      ? `Bedrock (${bedrockProfile})`
      : `${provider.name} Account`;

    const name = accountName.trim() || defaultName;
    const psd = buildProviderSpecificData();

    try {
      const res = await fetch(`/api/providers/${provider.id}/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          apiKey: apiKey.trim(),
          providerSpecificData: psd,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Server returned ${res.status}`);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save account");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBulk = async () => {
    if (!bulkText.trim()) return;
    setSaving(true);
    setBulkResult(null);
    setError(null);

    const lines = bulkText.split("\n");
    const plan = planBulkAdd(lines, existingNames, { isCloudflareAi });

    if (plan.length === 0) {
      setError("No valid keys found in input");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`/api/providers/${provider.id}/accounts/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accounts: plan }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Bulk addition failed (${res.status})`);
      }

      const data = await res.json();
      setBulkResult({ success: data.count || plan.length, failed: 0 });
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 700);
    } catch (err: any) {
      setError(err.message || "Failed to add bulk keys");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rt-modal-backdrop">
      <div className="rt-modal-content max-w-xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-[#0D1322] border border-[#1E293B] p-1.5 flex items-center justify-center">
              {provider.image ? (
                <img src={provider.image} alt={provider.name} className="size-full object-contain" />
              ) : (
                <span className="material-symbols-outlined text-blue-400 text-[20px]">vpn_key</span>
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Add {provider.name} Connection
              </h3>
              <p className="text-xs text-slate-400">
                {isCookie
                  ? "Paste session cookie credentials"
                  : isBedrock
                  ? "Configure AWS SSO profile or static keys"
                  : isAzure
                  ? "Configure Azure OpenAI deployment & endpoint"
                  : isOllamaLocal
                  ? "Connect local self-hosted model service"
                  : "API key is hardware-encrypted (AES-256-GCM)"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Mode Selector for Standard Providers */}
        {!isBedrock && !isOllamaLocal && (
          <div className="flex bg-[#0A0D14] p-1 rounded-xl border border-[#1E293B] text-xs">
            <button
              onClick={() => { setMode("single"); setBulkResult(null); }}
              className={`flex-1 py-1.5 rounded-lg font-medium transition-colors ${
                mode === "single" ? "bg-blue-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
              }`}
            >
              Single Connection
            </button>
            <button
              onClick={() => { setMode("bulk"); setBulkResult(null); }}
              className={`flex-1 py-1.5 rounded-lg font-medium transition-colors ${
                mode === "bulk" ? "bg-blue-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
              }`}
            >
              Bulk Add Keys
            </button>
          </div>
        )}

        {/* Bulk Mode */}
        {mode === "bulk" && !isBedrock && !isOllamaLocal ? (
          <div className="space-y-3">
            <div className="text-xs text-slate-400 space-y-1">
              <p>One key per line. Format:</p>
              <code className="block bg-[#0A0D14] p-2 rounded-lg border border-[#1E293B] font-mono text-[11px] text-blue-300">
                {isCloudflareAi ? "name|apiToken|accountId\nor just apiToken" : "name|apiKey\nor just apiKey (auto-numbered)"}
              </code>
            </div>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={isCloudflareAi ? "Prod|cf_token_123|acc_xyz456\nBeta|cf_token_456|acc_xyz789" : "Primary|sk-...\nBackup|sk-..."}
              className="w-full h-36 bg-[#0A0D14] border border-[#1E293B] rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
            />
            {bulkResult && (
              <div className="text-xs text-emerald-400 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                Successfully added {bulkResult.success} connection(s).
              </div>
            )}
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSaveBulk}
                disabled={saving || !bulkText.trim()}
                className="flex-1 rt-btn rt-btn--primary disabled:opacity-50"
              >
                {saving ? "Adding..." : "Add All Keys"}
              </button>
              <button onClick={onClose} className="rt-btn rt-btn--secondary">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          /* Single Mode */
          <div className="space-y-3.5 text-xs">
            {/* Account Name */}
            <div>
              <label className="block text-slate-300 font-medium mb-1">Connection Label</label>
              <input
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder={isOllamaLocal ? "Ollama Local" : "Primary Key (Production)"}
                className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Ollama Local Specific Form */}
            {isOllamaLocal && (
              <div className="space-y-3 p-3.5 bg-[#0A0D14] border border-[#1E293B] rounded-xl">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Ollama Host URL</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={ollamaHost}
                      onChange={(e) => setOllamaHost(e.target.value)}
                      placeholder="http://127.0.0.1:11434"
                      className="flex-1 bg-[#0F1420] border border-[#1E293B] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleValidate}
                      disabled={validating}
                      className="rt-btn rt-btn--secondary shrink-0"
                    >
                      {validating ? "Checking..." : "Check"}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    Default is <code className="text-blue-300 font-mono">http://127.0.0.1:11434</code>. For remote Ollama instances, enter the full host URL.
                  </p>
                </div>
              </div>
            )}

            {/* Azure OpenAI Specific Form */}
            {isAzure && (
              <div className="space-y-3 p-3.5 bg-[#0A0D14] border border-[#1E293B] rounded-xl">
                <span className="font-semibold text-blue-400 block">Azure OpenAI Configuration</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Azure Endpoint</label>
                    <input
                      type="text"
                      value={azureEndpoint}
                      onChange={(e) => setAzureEndpoint(e.target.value)}
                      placeholder="https://my-resource.openai.azure.com"
                      className="w-full bg-[#0F1420] border border-[#1E293B] rounded-xl px-3 py-1.5 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Deployment Name</label>
                    <input
                      type="text"
                      value={azureDeployment}
                      onChange={(e) => setAzureDeployment(e.target.value)}
                      placeholder="gpt-4"
                      className="w-full bg-[#0F1420] border border-[#1E293B] rounded-xl px-3 py-1.5 text-white font-mono"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">API Version</label>
                    <input
                      type="text"
                      value={azureApiVersion}
                      onChange={(e) => setAzureApiVersion(e.target.value)}
                      placeholder="2024-10-01-preview"
                      className="w-full bg-[#0F1420] border border-[#1E293B] rounded-xl px-3 py-1.5 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Organization (Optional)</label>
                    <input
                      type="text"
                      value={azureOrganization}
                      onChange={(e) => setAzureOrganization(e.target.value)}
                      placeholder="org-id"
                      className="w-full bg-[#0F1420] border border-[#1E293B] rounded-xl px-3 py-1.5 text-white font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Cloudflare AI Specific Form */}
            {isCloudflareAi && (
              <div className="space-y-3 p-3.5 bg-[#0A0D14] border border-[#1E293B] rounded-xl">
                <span className="font-semibold text-blue-400 block">Cloudflare Workers AI</span>
                <div>
                  <label className="block text-slate-400 mb-1">Account ID</label>
                  <input
                    type="text"
                    value={cfAccountId}
                    onChange={(e) => setCfAccountId(e.target.value)}
                    placeholder="abc123def456..."
                    className="w-full bg-[#0F1420] border border-[#1E293B] rounded-xl px-3 py-1.5 text-white font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Find Account ID in the right sidebar of{" "}
                    <a href="https://dash.cloudflare.com" target="_blank" rel="noreferrer" className="text-blue-400 underline">
                      dash.cloudflare.com
                    </a>
                  </p>
                </div>
              </div>
            )}

            {/* AWS Bedrock Specific Form */}
            {isBedrock && (
              <div className="space-y-3 p-3.5 bg-[#0A0D14] border border-[#1E293B] rounded-xl">
                <div className="flex bg-[#0F1420] p-1 rounded-xl border border-[#1E293B] text-[11px]">
                  <button
                    type="button"
                    onClick={() => setBedrockMode("profile")}
                    className={`flex-1 py-1 rounded-lg font-medium transition-colors ${
                      bedrockMode === "profile" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    AWS Profile (SSO — Recommended)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBedrockMode("static")}
                    className={`flex-1 py-1 rounded-lg font-medium transition-colors ${
                      bedrockMode === "static" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Static Keys (AKIA...)
                  </button>
                </div>

                {bedrockMode === "profile" ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">AWS Profile Name</label>
                        <input
                          type="text"
                          value={bedrockProfile}
                          onChange={(e) => setBedrockProfile(e.target.value)}
                          placeholder="my-sso-profile"
                          className="w-full bg-[#0F1420] border border-[#1E293B] rounded-xl px-3 py-1.5 text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">AWS Region</label>
                        <input
                          type="text"
                          value={bedrockRegion}
                          onChange={(e) => setBedrockRegion(e.target.value)}
                          placeholder="us-east-1"
                          className="w-full bg-[#0F1420] border border-[#1E293B] rounded-xl px-3 py-1.5 text-white font-mono"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Configure a profile from <code className="text-blue-300 font-mono">~/.aws/config</code> and run{" "}
                      <code className="text-blue-300 font-mono">aws sso login --profile {bedrockProfile || "my-sso-profile"}</code>.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">Access Key ID</label>
                        <input
                          type="text"
                          value={bedrockAccessKeyId}
                          onChange={(e) => setBedrockAccessKeyId(e.target.value)}
                          placeholder="AKIA..."
                          className="w-full bg-[#0F1420] border border-[#1E293B] rounded-xl px-3 py-1.5 text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">AWS Region</label>
                        <input
                          type="text"
                          value={bedrockRegion}
                          onChange={(e) => setBedrockRegion(e.target.value)}
                          placeholder="us-east-1"
                          className="w-full bg-[#0F1420] border border-[#1E293B] rounded-xl px-3 py-1.5 text-white font-mono"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Session Token (Optional)</label>
                      <input
                        type="password"
                        value={bedrockSessionToken}
                        onChange={(e) => setBedrockSessionToken(e.target.value)}
                        placeholder="FwoGZXIvYXdz..."
                        className="w-full bg-[#0F1420] border border-[#1E293B] rounded-xl px-3 py-1.5 text-white font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Main Credential Input (API Key / Cookie / Secret Key) */}
            {(!isOllamaLocal && !(isBedrock && bedrockMode === "profile")) && (
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  {isCookie
                    ? "Cookie Value"
                    : isBedrock
                    ? "Secret Access Key"
                    : isCloudflareAi
                    ? "Cloudflare API Token"
                    : "API Key"}
                </label>
                <div className="flex gap-2">
                  <input
                    type={isCookie ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={getPlaceholder()}
                    className="flex-1 bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleValidate}
                    disabled={validating || !isFormValid()}
                    className="rt-btn rt-btn--secondary shrink-0"
                  >
                    {validating ? "Checking..." : "Check"}
                  </button>
                </div>
              </div>
            )}

            {/* Validation Outcome Indicator */}
            {validationResult && (
              <div
                className={`p-2.5 rounded-xl border flex items-center gap-2 ${
                  validationResult === "valid"
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    : "bg-rose-500/10 border-rose-500/20 text-rose-400"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {validationResult === "valid" ? "check_circle" : "error"}
                </span>
                <span>
                  {validationResult === "valid"
                    ? "Credentials verified successfully!"
                    : validationError || "Invalid credentials."}
                </span>
              </div>
            )}

            {error && <p className="text-xs text-rose-400">{error}</p>}

            {/* Actions */}
            <div className="flex gap-2 pt-3 border-t border-[#1E293B]">
              <button
                type="button"
                onClick={handleSaveSingle}
                disabled={saving || !isFormValid()}
                className="flex-1 rt-btn rt-btn--primary disabled:opacity-50"
              >
                {saving ? "Saving Connection..." : "Save Connection"}
              </button>
              <button type="button" onClick={onClose} className="rt-btn rt-btn--secondary">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
