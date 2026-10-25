import { AnthropicCompatibleProvider } from "../../core/base/anthropicProvider.js";
import type { ProviderRequestContext, ProviderProbeContext, ProviderProbeResult } from "../../core/types.js";
import type { ScannedModel } from "../../../shared/types/index.js";
import { ensureFreshCredentials } from "../../../core/usage/tokenHelper.js";
import { metadata } from "./metadata.js";

async function fetchLiveMiniMaxCodeModels(isCn: boolean, timeoutMs: number = 6000): Promise<ScannedModel[]> {
  const host = isCn ? "https://agent.minimax.cn" : "https://agent.minimax.io";
  const region = isCn ? "cn" : "en";
  const url = `${host}/mavis/api/v1/models?region=${region}&buildEnv=prod`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "MiniMaxAgent",
        "X-Mavis-Agent-Id": "main",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) return [];
    const data = (await res.json()) as any;
    const providerConfig = data?.providers?.[0]?.config;
    const modelsObj = providerConfig?.models;
    const modelOrder: string[] = providerConfig?.model_order || [];
    const whitelist: string[] = providerConfig?.whitelist || [];

    const results: ScannedModel[] = [];
    const seen = new Set<string>();

    if (modelsObj && typeof modelsObj === "object") {
      for (const [id, m] of Object.entries<any>(modelsObj)) {
        if (!id || typeof id !== "string") continue;
        seen.add(id);
        results.push({
          id,
          name: m?.name ? `MiniMax ${m.name}` : id,
          contextLength: Number(m?.limit?.context) || 512000,
          capabilities: {
            reasoning: Boolean(m?.reasoning),
            vision: Boolean(m?.modalities?.input?.includes("image")),
            audio: false,
          },
        });
      }
    }

    for (const id of whitelist) {
      if (typeof id === "string" && id && !seen.has(id)) {
        seen.add(id);
        results.push({
          id,
          name: id,
          contextLength: 512000,
          capabilities: { reasoning: true, vision: false, audio: false },
        });
      }
    }

    results.sort((a, b) => {
      const idxA = modelOrder.indexOf(a.id);
      const idxB = modelOrder.indexOf(b.id);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.id.localeCompare(b.id);
    });

    return results;
  } catch {
    return [];
  }
}

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
    const account = context.account;
    let token = (context.apiKey || account?.rawApiKey || "").trim();

    // Auto-refresh token if account has refresh token and is expired
    if (account?.id && account.providerSpecificData?.refreshToken) {
      try {
        const fresh = await ensureFreshCredentials(
          account.id,
          this.id,
          account.rawApiKey || "",
          account.providerSpecificData
        );
        if (fresh?.accessToken) {
          token = fresh.accessToken;
        }
      } catch {}
    }

    if (!token) {
      return {
        success: false,
        error: "MiniMax Code access token is required (sign in via OAuth Device Code).",
      };
    }

    const psd = ((account?.providerSpecificData || context.providerSpecificData || {}) as any);
    const isCn = psd.region === "cn";
    const host = isCn ? "https://agent.minimax.cn" : "https://agent.minimax.io";
    const url = `${host}/mavis/api/v1/llm/v1/messages`;

    const timeoutMs = context.timeoutMs || 8000;

    // 1. Fetch live models catalog from MiniMax Code public API
    const liveModels = await fetchLiveMiniMaxCodeModels(isCn, Math.min(timeoutMs, 5000));
    const finalModels: ScannedModel[] =
      liveModels.length > 0
        ? liveModels
        : metadata.models.map((m) => ({
            id: m.id,
            name: m.name,
            contextLength: m.contextLength || 512000,
            capabilities: { reasoning: true, vision: false, audio: false },
          }));

    // 2. Validate token via ping using free model MiniMax-M3.1-Flash
    const buildHeaders = (bearerToken: string) => ({
      Authorization: bearerToken.startsWith("Bearer ") ? bearerToken : `Bearer ${bearerToken}`,
      "Content-Type": "application/json",
      "User-Agent": "MiniMaxAgent",
      "X-Mavis-Agent-Id": "main",
      ...(context.customHeaders || {}),
    });

    const ping = (bearerToken: string) =>
      fetch(url, {
        method: "POST",
        headers: buildHeaders(bearerToken),
        body: JSON.stringify({
          model: "MiniMax-M3.1-Flash",
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

    try {
      let res = await ping(token);

      // If token expired (401/403) and we have a refreshToken, force a refresh and retry
      if ((res.status === 401 || res.status === 403) && account?.id && account.providerSpecificData?.refreshToken) {
        try {
          const fresh = await ensureFreshCredentials(
            account.id,
            this.id,
            account.rawApiKey || "",
            account.providerSpecificData,
            true
          );
          if (fresh?.accessToken && fresh.accessToken !== token) {
            token = fresh.accessToken;
            res = await ping(token);
          }
        } catch {}
      }

      if (res.ok || res.status === 200) {
        return {
          success: true,
          endpointUrl: url,
          models: finalModels,
          count: finalModels.length,
        };
      }

      // HTTP 402 means OAuth token is valid and authenticated, but account has depleted balance for paid quota
      if (res.status === 402) {
        return {
          success: true,
          endpointUrl: url,
          models: finalModels,
          count: finalModels.length,
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          error: `Authentication failed (HTTP ${res.status}): Invalid or expired MiniMax Code OAuth token. Please click "Connect MiniMax Code" to sign in again.`,
          authError: "Invalid or expired token. Please click 'Connect MiniMax Code' to re-authenticate.",
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
