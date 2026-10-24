import { AnthropicCompatibleProvider } from "../../core/base/anthropicProvider.js";
import type { ProviderRequestContext, ProviderProbeContext, ProviderProbeResult } from "../../core/types.js";
import { metadata } from "./metadata.js";

export class MiniMaxCodeProvider extends AnthropicCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "claude";

  public override buildUrl(context: ProviderRequestContext): string {
    const psd = ((context.account?.providerSpecificData || {}) as any);
    const isCn = psd.region === "cn";
    const host = isCn ? "https://agent.minimax.cn" : "https://agent.minimax.io";
    return `${host}/mavis/api/v1/llm/v1/messages`;
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const token = (context.apiKey || context.account?.rawApiKey || "").trim();
    if (!token) {
      return {
        success: false,
        error: "MiniMax Code access token is required (sign in via OAuth Device Code).",
      };
    }

    const psd = ((context.account?.providerSpecificData || context.providerSpecificData || {}) as any);
    const isCn = psd.region === "cn";
    const url = isCn
      ? "https://agent.minimax.cn/mavis/api/v1/llm/v1/messages"
      : "https://agent.minimax.io/mavis/api/v1/llm/v1/messages";

    const timeoutMs = context.timeoutMs || 8000;
    const reqHeaders: Record<string, string> = {
      Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "MiniMaxAgent",
      "X-Mavis-Agent-Id": "main",
      ...(context.customHeaders || {}),
    };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify({
          model: "MiniMax-M3",
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.ok || res.status === 200) {
        return {
          success: true,
          endpointUrl: url,
          models: metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
          count: metadata.models.length,
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          error: `Authentication failed (HTTP ${res.status}): Invalid or expired MiniMax Code OAuth token`,
          authError: "Invalid or expired token",
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
        error: `Failed to connect to MiniMax Code: ${msg}`,
      };
    }
  }
}

export default MiniMaxCodeProvider;
