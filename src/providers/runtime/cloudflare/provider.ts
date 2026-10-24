import { BaseProvider } from "../../core/base/baseProvider.js";
import type { ProviderRequestContext, ProviderProbeContext, ProviderProbeResult } from "../../core/types.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";

export class CloudflareProvider extends BaseProvider {
  public readonly id = "cloudflare";
  public readonly name = "Cloudflare Workers AI";
  public readonly defaultFormat = "openai";

  public override buildUrl(context: ProviderRequestContext): string {
    const psd = context.account?.providerSpecificData || {};
    const accountId = psd.accountId || "";
    if (accountId) {
      return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;
    }
    return super.buildUrl(context);
  }

  public override transformRequestBody(context: ProviderRequestContext): any {
    if (context.clientFormat === "anthropic") {
      const converted = AnthropicAdapter.anthropicToOpenAi(context.body);
      converted.model = context.targetModel;
      return converted;
    }
    return { ...context.body, model: context.targetModel };
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const token = (context.apiKey || context.account?.rawApiKey || "").trim();
    const psd = ((context.account?.providerSpecificData || context.providerSpecificData || {}) as any);
    const accountId = psd.accountId || "";

    if (!accountId) {
      return {
        success: false,
        error: "Cloudflare Account ID is required. Please set Account ID in account settings.",
      };
    }
    if (!token) {
      return {
        success: false,
        error: "Cloudflare API Token is required.",
      };
    }

    const timeoutMs = context.timeoutMs || 8000;
    const searchUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search`;

    try {
      const res = await fetch(searchUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(context.customHeaders || {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.ok || res.status === 200) {
        const data: any = await res.json();
        const rawList = Array.isArray(data.result) ? data.result : Array.isArray(data.models) ? data.models : [];
        const models = rawList.map((m: any) => ({
          id: m.name || m.id,
          name: m.name || m.id,
          description: m.description,
          contextLength: m.context_window || m.properties?.max_tokens,
          capabilities: {
            vision: Boolean(m.task?.name?.includes("image") || m.tags?.includes("vision")),
            reasoning: Boolean(m.name?.includes("r1") || m.name?.includes("qwq")),
            audio: false,
          },
          raw: m,
        }));

        return {
          success: true,
          endpointUrl: searchUrl,
          models: models.length > 0 ? models : undefined,
          count: models.length,
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          error: `Authentication failed (HTTP ${res.status}): Invalid Cloudflare API token or Account ID`,
          authError: `Authentication failed (HTTP ${res.status})`,
        };
      }

      return {
        success: false,
        error: `Endpoint ${searchUrl} returned HTTP ${res.status}: ${res.statusText}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Failed to connect to Cloudflare: ${msg}`,
      };
    }
  }
}

export default CloudflareProvider;
