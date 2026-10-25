import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type {
  ProviderProbeContext,
  ProviderProbeResult,
} from "../../core/types.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import type { ScannedModel } from "../../../shared/types/index.js";
import { getOnomeoUsage } from "./quota.js";
import { metadata } from "./metadata.js";

export class OnomeoProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getOnomeoUsage(context);
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const token = (context.apiKey || context.account?.rawApiKey || "").trim();
    if (!token) {
      return {
        success: false,
        error: "Onomeo API key is required.",
      };
    }

    const url = "https://onomeo.com/v1/models";
    const timeoutMs = context.timeoutMs || 8000;
    const reqHeaders: Record<string, string> = {
      Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
      Accept: "application/json",
      ...(context.customHeaders || {}),
    };

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: reqHeaders,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          error: `Authentication failed (HTTP ${res.status}): Invalid Onomeo API key`,
          authError: "Invalid API key",
        };
      }

      if (res.ok) {
        const payload: any = await res.json();
        const rawList = Array.isArray(payload?.data) ? payload.data : [];
        const models: ScannedModel[] = rawList.map((m: any) => ({
          id: m.id,
          name: m.name || m.id,
          contextLength: 128000,
          capabilities: {
            reasoning: true,
            vision: Boolean(m.id?.includes("flash") || m.id?.includes("vision") || m.id?.includes("gemini") || m.id?.includes("claude")),
            audio: false,
          },
        }));

        return {
          success: true,
          endpointUrl: url,
          models: models.length > 0 ? models : metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
          count: models.length > 0 ? models.length : metadata.models.length,
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
        error: `Failed to connect to Onomeo: ${msg}`,
      };
    }
  }
}

export default OnomeoProvider;
