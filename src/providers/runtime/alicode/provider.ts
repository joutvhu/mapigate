import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderRequestContext, ProviderProbeContext, ProviderProbeResult } from "../../core/types.js";
import { metadata, ALIBABA_REGIONS } from "./metadata.js";
import { extractModelsFromPayload } from "../../../core/scanner/payloadExtractor.js";

/**
 * Standardize an Alibaba custom or workspace base URL.
 * Handles inputs like:
 * - "ws-tx2va1idka7fndag.ap-southeast-1.maas.aliyuncs.com"
 * - "https://ws-tx2va1idka7fndag.ap-southeast-1.maas.aliyuncs.com"
 * - "https://ws-tx2va1idka7fndag.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1"
 * - "https://ws-tx2va1idka7fndag.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions"
 */
export function normalizeAlibabaEndpoint(rawUrl: string): string {
  let url = rawUrl.trim();
  if (!url) return "";

  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  // Remove trailing slashes and common path suffixes
  url = url.replace(/\/+$/, "");
  url = url.replace(/\/(chat\/completions|messages|models)$/i, "");

  // If host only without path, append /compatible-mode/v1
  try {
    const parsed = new URL(url);
    if (!parsed.pathname || parsed.pathname === "/" || parsed.pathname === "") {
      return `${parsed.origin}/compatible-mode/v1`;
    }
  } catch {
    // Return sanitized url if parsing fails
  }

  return url;
}

export function resolveAlibabaBaseUrl(
  region?: string,
  token?: string,
  customBaseUrl?: string,
  workspaceId?: string
): string {
  // 1. Explicit customBaseUrl from providerSpecificData or account
  if (customBaseUrl && customBaseUrl.trim()) {
    return normalizeAlibabaEndpoint(customBaseUrl);
  }

  // 2. Dedicated Workspace ID + Region
  if (workspaceId && workspaceId.trim()) {
    const cleanWs = workspaceId.trim();
    const effectiveRegion = region && region !== "coding-intl" && region !== "coding-cn" && region !== "token-plan"
      ? region
      : "ap-southeast-1";
    return `https://${cleanWs}.${effectiveRegion}.maas.aliyuncs.com/compatible-mode/v1`;
  }

  // 3. Explicit region matching ALIBABA_REGIONS
  if (region) {
    const found = ALIBABA_REGIONS.find((r) => r.id === region);
    if (found) return found.baseUrl;
  }

  // 4. Auto-detect from token pattern
  if (token) {
    const cleanToken = token.trim();
    if (cleanToken.startsWith("sk-sp-")) {
      return "https://coding-intl.dashscope.aliyuncs.com/v1";
    }
    if (cleanToken.startsWith("tp-")) {
      return "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1";
    }
    if (cleanToken.startsWith("sk-")) {
      return "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
    }
  }

  return "https://coding-intl.dashscope.aliyuncs.com/v1";
}

export class AlibabaProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public override buildUrl(context: ProviderRequestContext): string {
    const psd = ((context.account?.providerSpecificData || {}) as any);
    const token = context.account?.rawApiKey || "";
    const base = resolveAlibabaBaseUrl(psd.region, token, psd.baseUrl, psd.workspaceId);
    return `${base.replace(/\/+$/, "")}/chat/completions`;
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const token = (context.apiKey || context.account?.rawApiKey || "").trim();
    if (!token) {
      return {
        success: false,
        error: "Alibaba API key is required (e.g. sk-sp-..., sk-..., or tp-...)",
      };
    }

    const psd = ((context.account?.providerSpecificData || context.providerSpecificData || {}) as any);
    const resolvedBase = resolveAlibabaBaseUrl(
      psd.region || context.region,
      token,
      psd.baseUrl || context.baseUrl,
      psd.workspaceId
    );
    const timeoutMs = context.timeoutMs || 8000;

    const candidateUrls = [
      `${resolvedBase}/models`,
      resolvedBase.endsWith("/v1") ? `${resolvedBase.slice(0, -3)}/models` : `${resolvedBase}/v1/models`,
    ];

    const reqHeaders: Record<string, string> = {
      Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
      Accept: "application/json",
      ...(context.customHeaders || {}),
    };

    let authError: string | null = null;
    let lastError: string | null = null;

    for (const url of candidateUrls) {
      try {
        const res = await fetch(url, {
          method: "GET",
          headers: reqHeaders,
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (res.ok || res.status === 200) {
          const payload: any = await res.json();
          const scanned = extractModelsFromPayload(payload, this.id);
          if (scanned.length > 0) {
            return {
              success: true,
              endpointUrl: url,
              models: scanned,
              count: scanned.length,
            };
          }
        }

        if (res.status === 401 || res.status === 403) {
          authError = `Authentication failed (HTTP ${res.status}): Invalid API key for cluster ${resolvedBase}`;
        } else {
          lastError = `Endpoint ${url} returned HTTP ${res.status}: ${res.statusText}`;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        lastError = `Failed to connect to ${url}: ${msg}`;
      }
    }

    return {
      success: false,
      error: authError || lastError || "Failed to probe Alibaba models",
      authError: authError || undefined,
    };
  }
}

export default AlibabaProvider;
