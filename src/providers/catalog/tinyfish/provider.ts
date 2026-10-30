import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import { metadata } from "./metadata.js";
import type { ProviderProbeContext, ProviderProbeResult, ProviderRequestContext } from "../../core/types.js";
import { extractTokenFromAccount } from "../../core/base/tokenExtractor.js";

export class TinyfishProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public override async buildHeaders(context: ProviderRequestContext): Promise<Record<string, string>> {
    const headers = await super.buildHeaders(context);
    const token = extractTokenFromAccount(context.account);
    if (token) {
      headers["X-API-Key"] = token;
      delete headers["Authorization"];
    }
    return headers;
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const token = (context.apiKey || context.account?.rawApiKey || context.account?.apiKey || "").trim();
    if (!token) {
      return {
        success: false,
        error: "TinyFish API key is required. Get one at https://agent.tinyfish.ai/api-keys",
      };
    }

    const timeoutMs = context.timeoutMs || 8000;
    const url = metadata.validateUrl || "https://api.search.tinyfish.ai/usage?limit=1";

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-API-Key": token,
          ...(context.customHeaders || {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          authError: `Authentication failed (HTTP ${res.status}) for account "${context.account?.name || this.name}". Please verify your TinyFish API key.`,
          error: `Authentication failed (HTTP ${res.status})`,
        };
      }

      if (res.ok || res.status === 200) {
        const models = (metadata.models || []).map((m) => ({
          id: m.id,
          name: m.name || m.id,
          contextLength: m.contextLength,
          capabilities: { vision: false, reasoning: false, audio: false },
          raw: m,
        }));

        return {
          success: true,
          endpointUrl: url,
          models,
          count: models.length,
        };
      }

      let errDetail = res.statusText;
      try {
        const errJson: any = await res.json();
        if (errJson?.error?.message || errJson?.message) {
          errDetail = errJson.error?.message || errJson.message;
        }
      } catch {}

      return {
        success: false,
        error: `TinyFish endpoint returned HTTP ${res.status}: ${errDetail}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Failed to connect to TinyFish: ${msg}`,
      };
    }
  }
}

export default TinyfishProvider;
