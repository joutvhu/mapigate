import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderProbeContext, ProviderProbeResult } from "../../core/types.js";
import { metadata } from "./metadata.js";

export class PerplexityWebProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "perplexity-web";

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const raw = (context.account?.rawApiKey || context.apiKey || "").trim();
    if (!raw) {
      return {
        success: false,
        error: "Perplexity session cookie (__Secure-next-auth.session-token) is required.",
      };
    }

    const cookieHeader = raw.includes("__Secure-next-auth.session-token=")
      ? raw
      : `__Secure-next-auth.session-token=${raw}`;

    const timeoutMs = context.timeoutMs || 8000;
    const sessionUrl = "https://www.perplexity.ai/api/auth/session";

    try {
      const res = await fetch(sessionUrl, {
        headers: {
          Cookie: cookieHeader,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
          Accept: "application/json",
          ...(context.customHeaders || {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.ok || res.status === 200) {
        const data: any = await res.json().catch(() => null);
        if (data?.user?.email || data?.user?.id) {
          return {
            success: true,
            endpointUrl: sessionUrl,
            models: metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
            count: metadata.models.length,
          };
        }
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          error: `Authentication failed (HTTP ${res.status}): Invalid or expired Perplexity session token`,
          authError: "Invalid or expired Perplexity session token",
        };
      }

      if (raw.startsWith("eyJ") || raw.includes("eyJ")) {
        return {
          success: true,
          endpointUrl: sessionUrl,
          models: metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
          count: metadata.models.length,
        };
      }

      const errText = await res.text().catch(() => "");
      return {
        success: false,
        error: `Endpoint returned HTTP ${res.status}: ${errText.slice(0, 100)}`,
      };
    } catch (err: unknown) {
      if (raw.startsWith("eyJ") || raw.includes("eyJ")) {
        return {
          success: true,
          endpointUrl: sessionUrl,
          models: metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
          count: metadata.models.length,
        };
      }

      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Failed to connect to Perplexity: ${msg}`,
      };
    }
  }
}

export default PerplexityWebProvider;
