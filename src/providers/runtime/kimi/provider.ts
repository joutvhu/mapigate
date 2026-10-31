import { AnthropicCompatibleProvider } from "../../core/base/anthropicProvider.js";
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

  public override async buildHeaders(context: ProviderRequestContext): Promise<Record<string, string>> {
    const raw = (context.account?.rawApiKey || "").trim();
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

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const raw = (context.account?.rawApiKey || context.apiKey || "").trim();
    if (!raw) {
      return {
        success: false,
        error: "Kimi for Coding OAuth token is required.",
      };
    }

    let token = raw;
    const psd = (context.account?.providerSpecificData || context.providerSpecificData || {}) as any;
    const deviceId: string | undefined = psd?.deviceId;
    if (raw.startsWith("{") && raw.endsWith("}")) {
      try {
        const parsed = JSON.parse(raw);
        token = parsed.accessToken || parsed.access_token || token;
      } catch {}
    }

    const timeoutMs = context.timeoutMs || 8000;
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
          error: `Authentication failed (HTTP ${res.status}): Invalid or expired Kimi for Coding subscription token`,
          authError: "Invalid or expired Kimi for Coding subscription token",
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
