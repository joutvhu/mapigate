import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import type { ProviderProbeContext, ProviderProbeResult, ProviderRequestContext } from "../../core/types.js";
import { extractModelsFromPayload } from "../../../core/scanner/payloadExtractor.js";

export class GeminiProvider extends OpenAiCompatibleProvider {
  public override readonly id = "gemini";
  public override readonly name = "Google Gemini";
  public override readonly defaultFormat = "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public override buildUrl(context: ProviderRequestContext): string {
    const accountBase = (context.account?.providerSpecificData?.baseUrl || "").trim();
    const rawBase = (accountBase || context.provider?.baseUrl || "").trim();

    if (rawBase.includes("/chat/completions")) {
      return rawBase;
    }

    const cleanBase = rawBase.replace(/\/+$/, "");
    if (cleanBase.endsWith("/openai")) {
      return `${cleanBase}/chat/completions`;
    }
    return super.buildUrl(context);
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    const key = (context.account.rawApiKey || "").trim();
    if (!key) {
      return { plan: "Free Tier", message: "Google AI Studio API key not configured." };
    }
    return {
      plan: "Google AI Studio",
      message: "API key connected. Quota limits follow Google AI Studio tier (viewable at aistudio.google.com).",
    };
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const account = context.account;
    const timeoutMs = context.timeoutMs || 6000;
    let token = (context.apiKey || account?.rawApiKey || "").trim();

    if (token.startsWith("{") && token.endsWith("}")) {
      try {
        const parsed = JSON.parse(token);
        token = parsed.accessToken || parsed.access_token || parsed.apiKey || token;
      } catch {}
    }

    if (token) {
      // 1. First probe via OpenAI compatibility endpoint with Bearer token
      try {
        const openAiUrl = "https://generativelanguage.googleapis.com/v1beta/openai/models";
        const res = await fetch(openAiUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            ...(context.customHeaders || {}),
          },
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (res.ok || res.status === 200) {
          const payload: any = await res.json();
          const models = extractModelsFromPayload(payload, this.id);
          return {
            success: true,
            endpointUrl: openAiUrl,
            models: models.length > 0 ? models : undefined,
            count: models.length,
          };
        }
      } catch {}

      // 2. Fallback to Google native models endpoint with ?key= param
      const testUrls = [
        `https://generativelanguage.googleapis.com/v1beta/models?key=${token}`,
        `https://generativelanguage.googleapis.com/v1/models?key=${token}`,
      ];

      for (const url of testUrls) {
        try {
          const res = await fetch(url, {
            method: "GET",
            headers: {
              Accept: "application/json",
              ...(context.customHeaders || {}),
            },
            signal: AbortSignal.timeout(timeoutMs),
          });

          if (res.ok || res.status === 200) {
            const payload: any = await res.json();
            const models = extractModelsFromPayload(payload, this.id);
            return {
              success: true,
              endpointUrl: url,
              models: models.length > 0 ? models : undefined,
              count: models.length,
            };
          }

          if (res.status === 400 || res.status === 401 || res.status === 403) {
            let errText = "Invalid Google AI Studio API key";
            try {
              const errPayload: any = await res.json();
              if (errPayload?.error?.message) errText = errPayload.error.message;
            } catch {}
            return {
              success: false,
              error: `Authentication failed (HTTP ${res.status}): ${errText}`,
              authError: errText,
            };
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            success: false,
            error: `Failed to connect to Google Gemini: ${msg}`,
          };
        }
      }
    }

    return super.probeModels(context);
  }
}

export default GeminiProvider;
