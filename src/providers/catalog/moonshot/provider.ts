import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type {
  ProviderProbeContext,
  ProviderProbeResult,
  ProviderRequestContext,
} from "../../core/types.js";
import { metadata } from "./metadata.js";

export class MoonshotProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public override buildUrl(context: ProviderRequestContext): string {
    const psd = (context.account?.providerSpecificData || {}) as any;
    const isCn = psd.region === "cn";
    const host = isCn ? "https://api.moonshot.cn" : "https://api.moonshot.ai";
    return `${host}/v1/chat/completions`;
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const token = (context.account?.rawApiKey || context.apiKey || "").trim();
    if (!token) {
      return {
        success: false,
        error: "Moonshot API key (sk-...) is required.",
      };
    }

    const psd = (context.account?.providerSpecificData || context.providerSpecificData || {}) as any;
    const isCn = psd.region === "cn";
    const timeoutMs = context.timeoutMs || 8000;
    const endpoints = isCn
      ? ["https://api.moonshot.cn/v1/models", "https://api.moonshot.ai/v1/models"]
      : ["https://api.moonshot.ai/v1/models", "https://api.moonshot.cn/v1/models"];

    let lastErr = "";
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            ...(context.customHeaders || {}),
          },
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (res.ok || res.status === 200) {
          return {
            success: true,
            endpointUrl: endpoint,
            models: metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
            count: metadata.models.length,
          };
        }

        if (res.status === 401) {
          return {
            success: false,
            error: `Authentication failed (HTTP 401): Invalid or expired Moonshot API Key`,
            authError: "Invalid or expired Moonshot API Key",
          };
        }

        const errText = await res.text().catch(() => "");
        lastErr = `Endpoint returned HTTP ${res.status}: ${errText.slice(0, 100)}`;
      } catch (err: unknown) {
        lastErr = err instanceof Error ? err.message : String(err);
      }
    }

    return {
      success: false,
      error: `Failed to connect to Moonshot AI: ${lastErr || "Unknown error"}`,
    };
  }
}

export default MoonshotProvider;
