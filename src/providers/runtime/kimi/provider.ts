import { AnthropicCompatibleProvider } from "../../core/base/anthropicProvider.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import type {
  ProviderUsageContext,
  RawProviderQuotaResult,
} from "../../../core/usage/types.js";
import type {
  ProviderProbeContext,
  ProviderProbeResult,
  ProviderRequestContext,
} from "../../core/types.js";
import { metadata } from "./metadata.js";
import { getKimiUsage } from "./quota.js";

export class KimiProvider extends AnthropicCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "claude";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getKimiUsage(
      context.account.rawApiKey,
      context.account.rawApiKey,
      context.account.providerSpecificData
    );
  }

  public override buildUrl(context: ProviderRequestContext): string {
    const raw = (context.account?.rawApiKey || "").trim();
    const isApiKey = raw.startsWith("sk-");

    if (isApiKey) {
      const psd = (context.account?.providerSpecificData || {}) as any;
      const isCn = psd.region === "cn";
      const host = isCn ? "https://api.moonshot.cn" : "https://api.moonshot.ai";
      return `${host}/v1/chat/completions`;
    }

    return super.buildUrl(context);
  }

  public override async buildHeaders(context: ProviderRequestContext): Promise<Record<string, string>> {
    const raw = (context.account?.rawApiKey || "").trim();
    const isApiKey = raw.startsWith("sk-");

    if (isApiKey) {
      const base = await super.buildHeaders(context);
      return {
        ...base,
        Authorization: `Bearer ${raw}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      };
    }

    let token = raw;
    if (raw.startsWith("{") && raw.endsWith("}")) {
      try {
        const parsed = JSON.parse(raw);
        token = parsed.accessToken || parsed.access_token || token;
      } catch {}
    }

    const headers = await super.buildHeaders(context);
    const psd = (context.account?.providerSpecificData || {}) as any;
    if (psd.deviceId) {
      headers["X-Msh-Device-Id"] = psd.deviceId;
    }
    headers["Authorization"] = `Bearer ${token}`;
    return headers;
  }

  public override transformRequestBody(context: ProviderRequestContext): any {
    const raw = (context.account?.rawApiKey || "").trim();
    const isApiKey = raw.startsWith("sk-");

    if (isApiKey) {
      let body = context.body;
      if (context.clientFormat === "anthropic") {
        body = AnthropicAdapter.anthropicToOpenAi(body);
      }
      return {
        ...body,
        model: context.targetModel,
      };
    }

    return super.transformRequestBody(context);
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const raw = (context.account?.rawApiKey || context.apiKey || "").trim();
    if (!raw) {
      return {
        success: false,
        error: "Kimi token or API key is required.",
      };
    }

    let token = raw;
    const psd = (context.account?.providerSpecificData || context.providerSpecificData || {}) as any;
    const deviceId: string | undefined = psd?.deviceId;
    if (raw.startsWith("{") && raw.endsWith("}")) {
      try {
        const parsed = JSON.parse(raw);
        token = parsed.accessToken || parsed.access_token || parsed.apiKey || token;
      } catch {}
    }

    const timeoutMs = context.timeoutMs || 8000;
    const isApiKey = token.startsWith("sk-");

    // 1. If it's a Developer Platform API Key (sk-...), probe platform.kimi.ai / platform.moonshot.cn
    if (isApiKey) {
      const isCn = psd.region === "cn";
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
            const data: any = await res.json().catch(() => null);
            const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
            const scannedModels = list.map((m: any) => ({
              id: m.id || m.name,
              name: m.name || m.id,
              contextLength: 128000,
            }));

            return {
              success: true,
              endpointUrl: endpoint,
              models: scannedModels.length > 0 ? scannedModels : metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
              count: scannedModels.length > 0 ? scannedModels.length : metadata.models.length,
            };
          }

          if (res.status === 401) {
            return {
              success: false,
              error: `Authentication failed (HTTP 401): Invalid or expired Kimi API Key`,
              authError: "Invalid or expired Kimi API Key",
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
        error: `Failed to connect to Kimi Platform: ${lastErr || "Unknown error"}`,
      };
    }

    // 2. If it's an OAuth token (Kimi for Coding), probe https://api.kimi.com/coding/v1/usages
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(deviceId ? { "X-Msh-Device-Id": deviceId } : {}),
      ...(context.customHeaders || {}),
    };

    try {
      const res = await fetch("https://api.kimi.com/coding/v1/usages", {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.ok || res.status === 200) {
        return {
          success: true,
          endpointUrl: "https://api.kimi.com/coding/v1",
          models: metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
          count: metadata.models.length,
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          error: `Authentication failed (HTTP ${res.status}): Invalid or expired Kimi credentials`,
          authError: "Invalid or expired Kimi credentials",
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
        error: `Failed to connect to Kimi: ${msg}`,
      };
    }
  }
}

export default KimiProvider;
