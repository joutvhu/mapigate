import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type {
  ProviderProbeContext,
  ProviderProbeResult,
} from "../../core/types.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import type { ScannedModel } from "../../../shared/types/index.js";
import { getIteracomputeUsage } from "./quota.js";
import { metadata } from "./metadata.js";

export class IteracomputeProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getIteracomputeUsage(context);
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const token = (context.apiKey || context.account?.rawApiKey || context.account?.apiKey || "").trim();
    const timeoutMs = context.timeoutMs || 8000;
    const probeUrl = "https://api.iteracompute.com/v1/models";

    const reqHeaders: Record<string, string> = {
      Accept: "application/json",
      ...(metadata.defaultHeaders || {}),
      ...(context.customHeaders || {}),
    };
    if (token) {
      reqHeaders["Authorization"] = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
    }

    try {
      const res = await fetch(probeUrl, {
        method: "GET",
        headers: reqHeaders,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.status === 401 || res.status === 403) {
        let errDetail = "";
        try {
          const errJson: any = await res.json();
          errDetail = errJson?.error?.message || errJson?.message || errJson?.detail || "";
        } catch {
          const errText = await res.text().catch(() => "");
          if (errText && !errText.includes("<html") && errText.length < 200) {
            errDetail = errText.trim();
          }
        }
        return {
          success: false,
          error: errDetail
            ? `Authentication failed (HTTP ${res.status}): ${errDetail}`
            : `Authentication failed (HTTP ${res.status}) for account "${context.account?.name || this.name}". Please verify your IteraCompute API key.`,
          authError: errDetail || "Invalid API key",
        };
      }

      if (res.ok || res.status === 200) {
        const payload: any = await res.json();
        const rawList = Array.isArray(payload?.data) ? payload.data : [];
        if (rawList.length > 0) {
          const scanned: ScannedModel[] = rawList.map((m: any) => {
            const p = m.model_disclosure?.model_parameters;
            return {
              id: m.id,
              name: m.name || m.id,
              contextLength: m.context_window || p?.limits?.context_tokens || 128000,
              capabilities: {
                tools: Boolean(p?.features?.tools || m.tools || m.id?.includes("code") || m.id?.includes("flash") || m.id?.includes("27b") || m.id === "Auto"),
                reasoning: Boolean(p?.features?.reasoning || m.reasoning?.supported || m.id?.includes("reason") || m.id?.includes("pro") || m.id === "Auto"),
                vision: Boolean(p?.features?.vision || m.id?.includes("vision") || m.id?.includes("image") || m.id?.includes("glm") || m.id === "Auto"),
                audio: false,
              },
            };
          });

          return {
            success: true,
            endpointUrl: probeUrl,
            models: scanned,
            count: scanned.length,
          };
        }
      }

      // Upstream catalog unavailable (e.g. 503 "provider catalog unavailable"):
      // Gracefully fall back to pre-configured models so valid accounts remain connected
      const fallbackModels: ScannedModel[] = metadata.models.map((m) => ({
        id: m.id,
        name: m.name,
        contextLength: m.contextLength || 128000,
        capabilities: {
          tools: Boolean(m.capabilities?.includes("tools")),
          reasoning: Boolean(m.capabilities?.includes("reasoning")),
          vision: Boolean(m.capabilities?.includes("vision")),
          audio: false,
        },
      }));

      return {
        success: true,
        endpointUrl: probeUrl,
        models: fallbackModels,
        count: fallbackModels.length,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (token) {
        const fallbackModels: ScannedModel[] = metadata.models.map((m) => ({
          id: m.id,
          name: m.name,
          contextLength: m.contextLength || 128000,
          capabilities: {
            tools: Boolean(m.capabilities?.includes("tools")),
            reasoning: Boolean(m.capabilities?.includes("reasoning")),
            vision: Boolean(m.capabilities?.includes("vision")),
            audio: false,
          },
        }));
        return {
          success: true,
          endpointUrl: probeUrl,
          models: fallbackModels,
          count: fallbackModels.length,
        };
      }

      return {
        success: false,
        error: `Failed to connect to IteraCompute (${probeUrl}): ${msg}`,
      };
    }
  }
}

export default IteracomputeProvider;
