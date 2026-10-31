import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderProbeContext, ProviderProbeResult } from "../../core/types.js";
import { metadata } from "./metadata.js";

export class IflowProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const raw = (context.account?.rawApiKey || context.apiKey || "").trim();
    if (!raw) {
      return {
        success: false,
        error: "iFlow API key or OAuth access token is required.",
      };
    }

    const psd = ((context.account?.providerSpecificData || context.providerSpecificData || {}) as any);
    const accessToken = psd.accessToken || (raw.startsWith("sk-") ? undefined : raw);
    const timeoutMs = context.timeoutMs || 8000;

    // 1. If we have the OAuth accessToken, verify against iFlow getUserInfo endpoint
    if (accessToken) {
      const userInfoUrl = `https://iflow.cn/api/oauth/getUserInfo?accessToken=${encodeURIComponent(accessToken)}`;
      try {
        const res = await fetch(userInfoUrl, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (res.ok || res.status === 200) {
          const body: any = await res.json().catch(() => null);
          if (body?.success || body?.code === "200") {
            return {
              success: true,
              endpointUrl: "https://apis.iflow.cn/v1",
              models: metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
              count: metadata.models.length,
            };
          }
        }

        if (res.status === 401 || res.status === 403) {
          return {
            success: false,
            error: `Authentication failed (HTTP ${res.status}): Invalid or expired iFlow token`,
            authError: "Invalid or expired iFlow token",
          };
        }
      } catch (err: unknown) {
        // Fall back to API key verification
      }
    }

    // 2. If raw is an API key (sk-...), send a minimal dry-run completion to verify the key
    const apiKey = raw.startsWith("sk-") ? raw : context.account?.rawApiKey;
    if (apiKey) {
      try {
        const chatUrl = "https://apis.iflow.cn/v1/chat/completions";
        const res = await fetch(chatUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": "iFlow-Cli",
            ...(context.customHeaders || {}),
          },
          body: JSON.stringify({
            model: "deepseek-v3",
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });

        // Any 200 or 4xx status other than 401/403 proves the API key itself is authenticated
        if (res.ok || (res.status !== 401 && res.status !== 403 && res.status < 500)) {
          return {
            success: true,
            endpointUrl: chatUrl,
            models: metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
            count: metadata.models.length,
          };
        }

        if (res.status === 401 || res.status === 403) {
          return {
            success: false,
            error: `Authentication failed (HTTP ${res.status}): Invalid or expired iFlow API key`,
            authError: "Invalid or expired iFlow API key",
          };
        }

        const errText = await res.text().catch(() => "");
        return {
          success: false,
          error: `Endpoint returned HTTP ${res.status}: ${errText.slice(0, 100)}`,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: `Failed to connect to iFlow: ${msg}`,
        };
      }
    }

    return {
      success: false,
      error: "Unable to verify iFlow credentials",
    };
  }
}

export default IflowProvider;
