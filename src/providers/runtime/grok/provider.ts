import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import type { ProviderProbeContext, ProviderProbeResult } from "../../core/types.js";
import { getGrokUsage } from "./quota.js";
import { metadata } from "./metadata.js";

export class GrokProvider extends OpenAiCompatibleProvider {
  public override readonly id = "grok";
  public override readonly name = "xAI Grok";
  public override readonly defaultFormat = "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getGrokUsage(context.account.rawApiKey, context.account.providerSpecificData);
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const token = (context.account?.rawApiKey || context.apiKey || "").trim();
    if (!token) {
      return {
        success: false,
        error: "Grok API key or OAuth token is required.",
      };
    }

    const timeoutMs = context.timeoutMs || 8000;

    // 1. If it's an OAuth token from device code flow (or JWT), verify via cli-chat-proxy user endpoint
    if (token.startsWith("eyJ") || context.account?.providerSpecificData?.authMethod === "device_code") {
      try {
        const uRes = await fetch("https://cli-chat-proxy.grok.com/v1/user", {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "User-Agent": "grok-pager/1.0.44 grok-shell/1.0.44 (linux; x86_64)",
            "x-xai-token-auth": "xai-grok-cli",
            "x-grok-client-version": "1.0.44",
            ...(context.customHeaders || {}),
          },
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (uRes.ok || uRes.status === 200) {
          return {
            success: true,
            endpointUrl: "https://cli-chat-proxy.grok.com/v1",
            models: metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
            count: metadata.models.length,
          };
        }

        if (uRes.status === 401 || uRes.status === 403) {
          return {
            success: false,
            error: `Authentication failed (HTTP ${uRes.status}): Invalid or expired Grok token`,
            authError: "Invalid or expired Grok token",
          };
        }
      } catch {
        // Fall back to standard probe
      }
    }

    // 2. Standard OpenAI-compatible probe against api.x.ai
    return super.probeModels(context);
  }
}

export default GrokProvider;
