import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderRequestContext, ProviderProbeContext, ProviderProbeResult } from "../../core/types.js";
import { metadata, ALIBABA_REGIONS } from "./metadata.js";
import { extractModelsFromPayload } from "../../../core/scanner/payloadExtractor.js";

export function resolveAlibabaBaseUrl(region?: string, token?: string): string {
  // 1. Explicit region
  if (region) {
    const found = ALIBABA_REGIONS.find((r) => r.id === region);
    if (found) return found.baseUrl;
  }

  // 2. Auto-detect from token pattern
  if (token) {
    const cleanToken = token.trim();
    if (cleanToken.startsWith("sk-sp-")) {
      return "https://coding-intl.dashscope.aliyuncs.com/v1";
    }
    if (cleanToken.startsWith("tp-")) {
      return "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1";
    }
    if (cleanToken.startsWith("sk-")) {
      return "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
    }
  }

  return "https://coding-intl.dashscope.aliyuncs.com/v1";
}

export class AlibabaProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public override buildUrl(context: ProviderRequestContext): string {
    const psd = ((context.account?.providerSpecificData || {}) as any);
    const token = context.account?.rawApiKey || "";
    const base = resolveAlibabaBaseUrl(psd.region, token);
    return `${base.replace(/\/+$/, "")}/chat/completions`;
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const token = (context.apiKey || context.account?.rawApiKey || "").trim();
    if (!token) {
      return {
        success: false,
        error: "Alibaba API key is required (e.g. sk-sp-..., sk-..., or tp-...)",
      };
    }

    const psd = ((context.account?.providerSpecificData || context.providerSpecificData || {}) as any);
    const resolvedBase = resolveAlibabaBaseUrl(psd.region || context.region, token);
    const timeoutMs = context.timeoutMs || 8000;

    const candidateUrls = [
      `${resolvedBase}/models`,
      resolvedBase.endsWith("/v1") ? `${resolvedBase.slice(0, -3)}/models` : `${resolvedBase}/v1/models`,
    ];

    const reqHeaders: Record<string, string> = {
      Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
      Accept: "application/json",
      ...(context.customHeaders || {}),
    };

    let authError: string | null = null;
    let lastError: string | null = null;

    for (const url of candidateUrls) {
      try {
        const res = await fetch(url, {
          method: "GET",
          headers: reqHeaders,
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (res.ok || res.status === 200) {
          const payload: any = await res.json();
          const scanned = extractModelsFromPayload(payload, this.id);
          if (scanned.length > 0) {
            return {
              success: true,
              endpointUrl: url,
              models: scanned,
              count: scanned.length,
            };
          }
        }

        if (res.status === 401 || res.status === 403) {
          authError = `Authentication failed (HTTP ${res.status}): Invalid API key for cluster ${resolvedBase}`;
        } else {
          lastError = `Endpoint ${url} returned HTTP ${res.status}: ${res.statusText}`;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        lastError = `Failed to connect to ${url}: ${msg}`;
      }
    }

    return {
      success: false,
      error: authError || lastError || "Failed to probe Alibaba models",
      authError: authError || undefined,
    };
  }
}

export default AlibabaProvider;
