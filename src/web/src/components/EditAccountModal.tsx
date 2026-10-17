import React, { useState, useEffect } from "react";
import { PortalModal } from "./PortalModal.js";
import { ToolIcon } from "./ui/ToolIcon.js";
import { Select } from "./Select.js";
import { getRegistryProvider } from "../../../shared/constants/providerRegistry.js";

export interface EditAccountData {
  id: string;
  providerId: string;
  name: string;
  isActive: boolean;
  rawApiKey?: string;
  providerSpecificData?: Record<string, any>;
}

export interface EditAccountModalProps {
  isOpen: boolean;
  account: EditAccountData | null;
  onClose: () => void;
  onSave: (updates: {
    name: string;
    apiKey?: string;
    isActive: boolean;
    providerSpecificData?: Record<string, any>;
  }) => Promise<void>;
}

export const EditAccountModal: React.FC<EditAccountModalProps> = ({
  isOpen,
  account,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Specialized provider states
  const [localHost, setLocalHost] = useState("");
  const [azureEndpoint, setAzureEndpoint] = useState("");
  const [azureDeployment, setAzureDeployment] = useState("");
  const [azureApiVersion, setAzureApiVersion] = useState("2024-10-01-preview");
  const [azureOrganization, setAzureOrganization] = useState("");
  const [cfAccountId, setCfAccountId] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("sgp");
  const [bedrockMode, setBedrockMode] = useState<"profile" | "static">("profile");
  const [bedrockProfile, setBedrockProfile] = useState("");
  const [bedrockRegion, setBedrockRegion] = useState("us-east-1");
  const [bedrockAccessKeyId, setBedrockAccessKeyId] = useState("");
  const [bedrockSessionToken, setBedrockSessionToken] = useState("");

  const pId = (account?.providerId || "").toLowerCase();
  const regProvider = getRegistryProvider(account?.providerId || "");

  const isNoAuth =
    pId === "opencode" ||
    pId === "oc" ||
    Boolean(regProvider?.noAuth) ||
    regProvider?.requiresApiKey === false ||
    regProvider?.authType === "none";
  const isOllamaLocal = pId === "ollama-local" || pId.includes("ollama");
  const isGenericLocal =
    Boolean(regProvider?.isLocal) ||
    pId === "lm-studio" ||
    pId === "jan" ||
    pId === "local-device";
  const isNoApiKey = isNoAuth || isOllamaLocal || isGenericLocal || regProvider?.requiresApiKey === false;
  const isAzure = pId === "azure" || pId.includes("azure");
  const isCloudflareAi = pId === "cloudflare-ai" || pId === "cloudflare";
  const isBedrock = pId === "bedrock" || pId.includes("bedrock");
  const isXiaomiTokenPlan = pId === "xiaomi-tokenplan";

  const availableRegions: { id: string; label: string }[] = isXiaomiTokenPlan
    ? [
        { id: "sgp", label: "Singapore (新加坡)" },
        { id: "cn", label: "China (中国大陆)" },
        { id: "ams", label: "Amsterdam (阿姆斯特丹)" },
      ]
    : regProvider?.regions || [];

  useEffect(() => {
    if (account) {
      setName(account.name || "");
      setApiKey("");
      setShowPassword(false);
      setIsActive(Boolean(account.isActive));
      setError(null);

      const psd = account.providerSpecificData || {};
      setLocalHost(
        psd.baseUrl ||
          (isOllamaLocal
            ? "http://127.0.0.1:11434"
            : pId === "lm-studio"
            ? "http://localhost:1234/v1"
            : pId === "jan"
            ? "http://localhost:1337/v1"
            : "http://localhost:8000/v1")
      );
      setAzureEndpoint(psd.azureEndpoint || "");
      setAzureDeployment(psd.deployment || "gpt-4");
      setAzureApiVersion(psd.apiVersion || "2024-10-01-preview");
      setAzureOrganization(psd.organization || "");
      setCfAccountId(psd.accountId || "");
      setSelectedRegion(
        psd.region || (availableRegions.length > 0 ? availableRegions[0].id : "sgp")
      );

      const isStatic = Boolean(psd.accessKeyId);
      setBedrockMode(isStatic ? "static" : "profile");
      setBedrockProfile(psd.profile || "");
      setBedrockRegion(psd.region || "us-east-1");
      setBedrockAccessKeyId(psd.accessKeyId || "");
      setBedrockSessionToken(psd.sessionToken || "");
    }
  }, [account]);

  if (!account) return null;

  const buildProviderSpecificData = (): Record<string, any> | undefined => {
    const existingPsd = account.providerSpecificData || {};
    let customPsd: Record<string, any> = {};

    if (isOllamaLocal) {
      customPsd.baseUrl = localHost.trim() || "http://127.0.0.1:11434";
    } else if (isGenericLocal) {
      customPsd.baseUrl = localHost.trim();
    } else if (isAzure) {
      customPsd = {
        azureEndpoint: azureEndpoint.trim(),
        deployment: azureDeployment.trim(),
        apiVersion: azureApiVersion.trim(),
        organization: azureOrganization.trim() || undefined,
      };
    } else if (isCloudflareAi) {
      customPsd = { accountId: cfAccountId.trim() };
    } else if (isBedrock) {
      if (bedrockMode === "profile") {
        customPsd = {
          profile: bedrockProfile.trim(),
          region: bedrockRegion.trim() || "us-east-1",
        };
      } else {
        customPsd = {
          accessKeyId: bedrockAccessKeyId.trim(),
          region: bedrockRegion.trim() || "us-east-1",
          sessionToken: bedrockSessionToken.trim() || undefined,
        };
      }
    } else if (isXiaomiTokenPlan || availableRegions.length > 0) {
      customPsd = { region: selectedRegion };
    }

    if (Object.keys(customPsd).length > 0) {
      return { ...existingPsd, ...customPsd };
    }
    return Object.keys(existingPsd).length > 0 ? existingPsd : undefined;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Account name is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        apiKey: apiKey.trim() ? apiKey.trim() : undefined,
        isActive,
        providerSpecificData: buildProviderSpecificData(),
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save account changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PortalModal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
          <div className="flex items-center gap-2.5">
            <ToolIcon
              src={regProvider?.image || `/assets/providers/${account.providerId}/icon.png`}
              name={regProvider?.name || account.providerId}
              color={regProvider?.color || "#3B82F6"}
              iconBg={regProvider?.iconBg}
              size="sm"
            />
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                Edit Account
              </h3>
              <div className="text-[11px] text-slate-400 font-mono">
                {regProvider?.name || account.providerId.toUpperCase()} • {account.id}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">error</span>
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-3.5 text-xs">
          {/* Account Name */}
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Account Name / Connection Label <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Work Account or user@example.com"
              className="w-full bg-[#0A0D14] border border-[#1E293B] text-slate-100 px-3 py-2 rounded-xl focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Zero-Auth Free or Local Provider Notice */}
          {isNoApiKey && (
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 text-[11px] flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-400 text-[16px]">verified</span>
              <span>
                {regProvider?.name || account.providerId} does not require an API key by default. You can leave the key blank.
              </span>
            </div>
          )}

          {/* API Key Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-slate-300 font-medium">
                {isNoApiKey ? "API Key / Auth Token (Optional)" : "Update API Key / Secret Token"}
              </label>
              <span className="text-slate-500 text-[11px]">Leave blank to keep existing key</span>
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter new API key or token to overwrite..."
                className="w-full bg-[#0A0D14] border border-[#1E293B] text-slate-100 pl-3 pr-9 py-2 rounded-xl focus:outline-none focus:border-blue-500 transition-colors font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                title={showPassword ? "Hide token" : "Show token"}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {showPassword ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
          </div>

          {/* Specialized: Local / Ollama Host */}
          {(isOllamaLocal || isGenericLocal) && (
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Local Host / Base URL
              </label>
              <input
                type="text"
                value={localHost}
                onChange={(e) => setLocalHost(e.target.value)}
                placeholder={isOllamaLocal ? "http://127.0.0.1:11434" : "http://localhost:1234/v1"}
                className="w-full bg-[#0A0D14] border border-[#1E293B] text-slate-100 px-3 py-2 rounded-xl focus:outline-none focus:border-blue-500 transition-colors font-mono"
              />
            </div>
          )}

          {/* Specialized: Azure OpenAI */}
          {isAzure && (
            <div className="space-y-2.5 p-3 bg-[#0A0D14] border border-[#1E293B] rounded-xl">
              <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-blue-400 text-[14px]">cloud</span>
                Azure OpenAI Deployment Parameters
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Endpoint URL</label>
                <input
                  type="text"
                  value={azureEndpoint}
                  onChange={(e) => setAzureEndpoint(e.target.value)}
                  placeholder="https://my-resource.openai.azure.com"
                  className="w-full bg-[#141B2D] border border-[#1E293B] text-slate-100 px-3 py-1.5 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Deployment Name</label>
                  <input
                    type="text"
                    value={azureDeployment}
                    onChange={(e) => setAzureDeployment(e.target.value)}
                    placeholder="gpt-4"
                    className="w-full bg-[#141B2D] border border-[#1E293B] text-slate-100 px-3 py-1.5 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">API Version</label>
                  <input
                    type="text"
                    value={azureApiVersion}
                    onChange={(e) => setAzureApiVersion(e.target.value)}
                    placeholder="2024-10-01-preview"
                    className="w-full bg-[#141B2D] border border-[#1E293B] text-slate-100 px-3 py-1.5 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Organization (Optional)</label>
                <input
                  type="text"
                  value={azureOrganization}
                  onChange={(e) => setAzureOrganization(e.target.value)}
                  placeholder="org-..."
                  className="w-full bg-[#141B2D] border border-[#1E293B] text-slate-100 px-3 py-1.5 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>
          )}

          {/* Specialized: Cloudflare AI */}
          {isCloudflareAi && (
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Cloudflare Account ID
              </label>
              <input
                type="text"
                value={cfAccountId}
                onChange={(e) => setCfAccountId(e.target.value)}
                placeholder="Cloudflare account ID (32 chars)"
                className="w-full bg-[#0A0D14] border border-[#1E293B] text-slate-100 px-3 py-2 rounded-xl focus:outline-none focus:border-blue-500 transition-colors font-mono"
              />
            </div>
          )}

          {/* Specialized: Bedrock */}
          {isBedrock && (
            <div className="space-y-2.5 p-3 bg-[#0A0D14] border border-[#1E293B] rounded-xl">
              <div className="flex bg-[#141B2D] p-1 rounded-lg border border-[#1E293B] text-xs">
                <button
                  type="button"
                  onClick={() => setBedrockMode("profile")}
                  className={`flex-1 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    bedrockMode === "profile"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  AWS Profile
                </button>
                <button
                  type="button"
                  onClick={() => setBedrockMode("static")}
                  className={`flex-1 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    bedrockMode === "static"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Static IAM Keys
                </button>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">AWS Region</label>
                <input
                  type="text"
                  value={bedrockRegion}
                  onChange={(e) => setBedrockRegion(e.target.value)}
                  placeholder="us-east-1"
                  className="w-full bg-[#141B2D] border border-[#1E293B] text-slate-100 px-3 py-1.5 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              {bedrockMode === "profile" ? (
                <div>
                  <label className="block text-slate-400 mb-1">AWS Profile Name</label>
                  <input
                    type="text"
                    value={bedrockProfile}
                    onChange={(e) => setBedrockProfile(e.target.value)}
                    placeholder="default"
                    className="w-full bg-[#141B2D] border border-[#1E293B] text-slate-100 px-3 py-1.5 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <div>
                    <label className="block text-slate-400 mb-1">Access Key ID</label>
                    <input
                      type="text"
                      value={bedrockAccessKeyId}
                      onChange={(e) => setBedrockAccessKeyId(e.target.value)}
                      placeholder="AKIA..."
                      className="w-full bg-[#141B2D] border border-[#1E293B] text-slate-100 px-3 py-1.5 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Session Token (Optional)</label>
                    <input
                      type="password"
                      value={bedrockSessionToken}
                      onChange={(e) => setBedrockSessionToken(e.target.value)}
                      placeholder="Optional STS token..."
                      className="w-full bg-[#141B2D] border border-[#1E293B] text-slate-100 px-3 py-1.5 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Specialized: Region Selector */}
          {(isXiaomiTokenPlan || availableRegions.length > 0) && (
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Cluster Region
              </label>
              <Select
                value={selectedRegion}
                onChange={(val) => setSelectedRegion(val)}
                options={availableRegions.map((r) => ({
                  value: r.id,
                  label: `${r.label} (${r.id})`,
                }))}
                className="w-full"
                triggerClassName="bg-[#0A0D14] font-mono text-xs py-2"
              />
            </div>
          )}

          {/* Active Status Toggle */}
          <div className="flex items-center justify-between p-3 bg-[#141B2D] border border-[#1E293B] rounded-xl">
            <div>
              <div className="font-medium text-slate-200">Active Status</div>
              <div className="text-[11px] text-slate-400">
                Inactive accounts are excluded from routing and quota polling.
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1E293B]">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white bg-[#141B2D] border border-[#1E293B] rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? (
              <>
                <span className="material-symbols-outlined text-[15px] animate-spin">progress_activity</span>
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </button>
        </div>
      </form>
    </PortalModal>
  );
};
