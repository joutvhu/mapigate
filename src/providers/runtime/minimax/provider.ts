import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderRequestContext, ProviderProbeContext, ProviderProbeResult } from "../../core/types.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import { getMiniMaxUsage } from "./quota.js";
import { metadata } from "./metadata.js";

export class MiniMaxProvider extends OpenAiCompatibleProvider {
  public override readonly id = "minimax";
  public override readonly name = "MiniMax";
  public override readonly defaultFormat = "claude";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getMiniMaxUsage(context.account.rawApiKey, context.providerId);
  }

  public override buildUrl(context: ProviderRequestContext): string {
    const psd = ((context.account?.providerSpecificData || {}) as any);
    const isCn = psd.region === "cn";
    const host = isCn ? "https://api.minimaxi.com" : "https://api.minimax.io";
    return `${host}/anthropic/v1/messages`;
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const token = (context.apiKey || context.account?.rawApiKey || "").trim();
    if (!token) {
      return {
        success: false,
        error: "MiniMax API key is required.",
      };
    }

    const psd = ((context.account?.providerSpecificData || context.providerSpecificData || {}) as any);
    const isCn = psd.region === "cn";
    const url = isCn
      ? "https://api.minimaxi.com/anthropic/v1/messages"
      : "https://api.minimax.io/anthropic/v1/messages";

    const timeoutMs = context.timeoutMs || 8000;
    const reqHeaders: Record<string, string> = {
      Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
      "x-api-key": token,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
      ...(context.customHeaders || {}),
    };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify({
          model: "MiniMax-M3",
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.ok || res.status === 200) {
        return {
          success: true,
          endpointUrl: url,
          models: metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
          count: metadata.models.length,
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          error: `Authentication failed (HTTP ${res.status}): Invalid MiniMax API key`,
          authError: "Invalid API key",
        };
      }

      const errText = await res.text().catch(() => "");
      return {
        success: false,
        error: `Endpoint ${url} returned HTTP ${res.status}: ${errText.slice(0, 100)}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Failed to connect to MiniMax: ${msg}`,
      };
    }
  }
}

export default MiniMaxProvider;
