import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type {
  ProviderProbeContext,
  ProviderProbeResult,
} from "../../core/types.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import type { ScannedModel } from "../../../shared/types/index.js";
import { getCoarenaUsage, COARENA_LIMITS_URL } from "./quota.js";
import { metadata } from "./metadata.js";

export class CoarenaProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getCoarenaUsage(context);
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const token = (context.apiKey || context.account?.rawApiKey || "").trim();
    if (!token) {
      return {
        success: false,
        error: "Coarena API key is required.",
      };
    }

    const timeoutMs = context.timeoutMs || 8000;
    const reqHeaders: Record<string, string> = {
      Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
      Accept: "application/json",
      ...(context.customHeaders || {}),
    };

    // 1. Verify key validity against limits endpoint
    try {
      const limitsRes = await fetch(COARENA_LIMITS_URL, {
        method: "GET",
        headers: reqHeaders,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (limitsRes.status === 401 || limitsRes.status === 403) {
        return {
          success: false,
          error: `Authentication failed (HTTP ${limitsRes.status}): Invalid Coarena API key`,
          authError: "Invalid API key",
        };
      }
    } catch {
      // Proceed to models endpoint if limits verification encounters network timeout
    }

    // 2. Fetch active models from /api/v1/models
    const modelsUrl = metadata.modelsUrl || "https://coarena.ai/api/v1/models";
    try {
      const res = await fetch(modelsUrl, {
        method: "GET",
        headers: reqHeaders,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.ok) {
        const payload: any = await res.json();
        const rawList = Array.isArray(payload?.data) ? payload.data : [];
        const models: ScannedModel[] = rawList.map((m: any) => ({
          id: m.id,
          name: m.display_name || m.name || m.id,
          contextLength: m.context_length || m.max_input_tokens || 128000,
          capabilities: {
            reasoning: Boolean(m.capabilities?.reasoning_text),
            vision: Boolean(m.capabilities?.vision),
            audio: false,
          },
        }));

        return {
          success: true,
          endpointUrl: modelsUrl,
          models: models.length > 0
            ? models
            : metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
          count: models.length > 0 ? models.length : metadata.models.length,
        };
      }

      const errText = await res.text().catch(() => "");
      return {
        success: false,
        error: `Endpoint ${modelsUrl} returned HTTP ${res.status}: ${errText.slice(0, 100)}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Failed to connect to Coarena: ${msg}`,
      };
    }
  }
}

export default CoarenaProvider;
