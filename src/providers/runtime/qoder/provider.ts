import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderRequestContext, ProviderProbeContext, ProviderProbeResult } from "../../core/types.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import { getQoderUsage } from "./quota.js";
import { buildCosyHeaders } from "./cosy.js";
import { metadata } from "./metadata.js";

export class QoderProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getQoderUsage(context.account.rawApiKey, context.providerId);
  }

  public override buildUrl(context: ProviderRequestContext): string {
    const psd = ((context.account?.providerSpecificData || {}) as any);
    const isCn = psd.region === "cn";
    return isCn
      ? "https://gateway.qoder.com.cn/algo/api/v2/service/pro/sse/agent_chat_generation"
      : "https://api3.qoder.sh/algo/api/v2/service/pro/sse/agent_chat_generation";
  }

  public override async buildHeaders(context: ProviderRequestContext): Promise<Record<string, string>> {
    const baseHeaders = await super.buildHeaders(context);
    const psd = context.account?.providerSpecificData || {};
    const userId = psd.userId;
    const token = context.account?.rawApiKey || "";

    if (userId && token) {
      const url = this.buildUrl(context);
      const bodyBytes = Buffer.from(JSON.stringify(context.body || {}), "utf8");
      const cosyHeaders = buildCosyHeaders(bodyBytes, url, {
        userId,
        authToken: token,
        machineId: psd.machineId,
      });
      return { ...baseHeaders, ...cosyHeaders };
    }

    return baseHeaders;
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const token = (context.apiKey || context.account?.rawApiKey || "").trim();
    if (!token) {
      return {
        success: false,
        error: "Qoder access token is required (sign in via OAuth Device Code).",
      };
    }

    const psd = ((context.account?.providerSpecificData || context.providerSpecificData || {}) as any);
    const isCn = psd.region === "cn";
    const userinfoUrl = isCn
      ? "https://openapi.qoder.com.cn/api/v1/userinfo"
      : "https://openapi.qoder.sh/api/v1/userinfo";
    const timeoutMs = context.timeoutMs || 8000;

    try {
      const res = await fetch(userinfoUrl, {
        headers: {
          Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
          Accept: "application/json",
          ...(context.customHeaders || {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.ok || res.status === 200) {
        return {
          success: true,
          endpointUrl: userinfoUrl,
          models: metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
          count: metadata.models.length,
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          error: `Authentication failed (HTTP ${res.status}): Invalid or expired Qoder token`,
          authError: "Invalid or expired Qoder token",
        };
      }

      const errText = await res.text().catch(() => "");
      return {
        success: false,
        error: `Endpoint ${userinfoUrl} returned HTTP ${res.status}: ${errText.slice(0, 100)}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Failed to connect to Qoder: ${msg}`,
      };
    }
  }
}

export default QoderProvider;
