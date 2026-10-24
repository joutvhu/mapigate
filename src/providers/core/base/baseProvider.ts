import type {
  IProvider,
  ProviderRequestContext,
  ProviderProbeContext,
  ProviderProbeResult,
} from "../types.js";
import { isRateLimitOrQuotaError } from "../../../core/router/loadBalancer.js";
import { extractModelsFromPayload } from "../../../core/scanner/payloadExtractor.js";

export function extractHeader(req: any, headerName: string): string | undefined {
  if (!req?.headers) return undefined;
  const val = req.headers[headerName.toLowerCase()];
  if (!val) return undefined;
  if (Array.isArray(val)) return val.join(",");
  return String(val);
}

export function mergeAnthropicBeta(...values: (string | undefined | null)[]): string {
  const flags = values
    .flatMap((v) => (typeof v === "string" ? v.split(",") : []))
    .map((f) => f.trim())
    .filter(Boolean);
  return [...new Set(flags)].join(",");
}

export abstract class BaseProvider implements IProvider {
  public abstract readonly id: string;
  public abstract readonly name: string;
  public abstract readonly defaultFormat: string;

  public readonly requiresAccount: boolean = true;
  public requiresApiKey?: boolean;
  public isLocal?: boolean;
  public defaultBaseUrl?: string;
  public readonly streamType: "sse" | "eventstream" | "custom" = "sse";

  public buildUrl(context: ProviderRequestContext): string {
    const accountBase = (context.account?.providerSpecificData?.baseUrl || "").trim();
    const rawBase = (accountBase || context.provider?.baseUrl || "").trim();
    const hasTerminalPath =
      rawBase.includes("/chat/completions") ||
      rawBase.includes("/messages") ||
      rawBase.includes("/responses") ||
      rawBase.includes("/generateAssistantResponse");

    if (hasTerminalPath) {
      return rawBase;
    }

    const cleanBase = rawBase.replace(/\/+$/, "");
    if (this.defaultFormat === "claude") {
      return cleanBase.endsWith("/v1") ? `${cleanBase}/messages` : `${cleanBase}/v1/messages`;
    }
    return cleanBase.endsWith("/v1") ? `${cleanBase}/chat/completions` : `${cleanBase}/v1/chat/completions`;
  }

  public async buildHeaders(context: ProviderRequestContext): Promise<Record<string, string>> {
    const bearerToken = (context.account?.rawApiKey || "").trim();
    const prov = context.provider as any;
    const isNoApiKey =
      prov?.requiresApiKey === false ||
      prov?.authType === "none" ||
      this.requiresApiKey === false;

    const outgoingHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      ...(context.provider?.customHeaders || {}),
    };

    if (isNoApiKey && !bearerToken) {
      delete outgoingHeaders["Authorization"];
    }

    const isWebCookie =
      prov?.category === "webCookie" ||
      prov?.format === "grok-web" ||
      prov?.id === "grok-web" ||
      prov?.id === "iflow" ||
      prov?.id === "perplexity-web";

    if (isWebCookie) {
      delete outgoingHeaders["Authorization"];
      if (bearerToken) {
        outgoingHeaders["Cookie"] = bearerToken;
      }
    }

    this.applyAnthropicClientHeaders(outgoingHeaders, context);
    return outgoingHeaders;
  }

  protected applyAnthropicClientHeaders(
    headers: Record<string, string>,
    context: ProviderRequestContext
  ): void {
    const incomingBeta = extractHeader(context.req, "anthropic-beta");
    const incomingVersion = extractHeader(context.req, "anthropic-version");

    if (incomingBeta) {
      const existingBetaKey = Object.keys(headers).find(
        (k) => k.toLowerCase() === "anthropic-beta"
      );
      if (existingBetaKey) {
        const merged = mergeAnthropicBeta(headers[existingBetaKey], incomingBeta);
        delete headers[existingBetaKey];
        headers["anthropic-beta"] = merged;
      } else {
        headers["anthropic-beta"] = incomingBeta;
      }
    }

    if (context.is1mContext && (this.defaultFormat === "claude" || this.id === "anthropic" || this.id === "claude")) {
      const existingBeta = headers["anthropic-beta"] || headers["Anthropic-Beta"];
      headers["anthropic-beta"] = mergeAnthropicBeta(existingBeta, "context-1m-2025-08-07");
      delete headers["Anthropic-Beta"];
    }

    if (incomingVersion) {
      const existingVersionKey = Object.keys(headers).find(
        (k) => k.toLowerCase() === "anthropic-version"
      );
      if (existingVersionKey) {
        delete headers[existingVersionKey];
      }
      headers["anthropic-version"] = incomingVersion;
    }
  }

  public transformRequestBody(context: ProviderRequestContext): any {
    return context.body;
  }

  public isRateLimitOrQuotaError(status: number, errorText?: string): boolean {
    return isRateLimitOrQuotaError(status, errorText);
  }

  public supportsQuota(): boolean {
    return false;
  }

  /**
   * Default model probing implementation for standard OpenAI / Anthropic compatible endpoints.
   * Providers with specialized discovery/auth (Antigravity, Codex, Kiro, OpenCode, Ollama, etc.)
   * override this method cleanly in their own provider class.
   */
  public async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const token = (context.apiKey || context.account?.rawApiKey || "").trim();
    const rawBase = (context.baseUrl || context.account?.providerSpecificData?.baseUrl || this.defaultBaseUrl || "").replace(/\/+$/, "");
    if (!rawBase) {
      return { success: false, error: "Base URL is required to probe models." };
    }

    const candidateUrls: string[] = [];
    if (rawBase.endsWith("/models") || rawBase.endsWith("/api/tags")) {
      candidateUrls.push(rawBase);
    } else if (rawBase.endsWith("/chat/completions") || rawBase.endsWith("/messages")) {
      const clean = rawBase.replace(/\/(chat\/completions|messages)$/, "");
      candidateUrls.push(`${clean}/models`);
    } else if (rawBase.endsWith("/v1")) {
      candidateUrls.push(`${rawBase}/models`);
      candidateUrls.push(rawBase.slice(0, -3) + "/models");
    } else {
      candidateUrls.push(`${rawBase}/v1/models`);
      candidateUrls.push(`${rawBase}/models`);
    }

    const isAnthropic = this.defaultFormat === "claude" || this.id.includes("anthropic") || this.id.includes("claude");
    const isGemini = this.defaultFormat === "gemini" || this.id.includes("gemini");
    const reqHeaders: Record<string, string> = {
      Accept: "application/json",
      ...(context.customHeaders || {}),
    };

    if (token) {
      if (isAnthropic) {
        reqHeaders["x-api-key"] = token;
        reqHeaders["anthropic-version"] = "2023-06-01";
      } else if (isGemini) {
        reqHeaders["x-goog-api-key"] = token;
      } else {
        reqHeaders["Authorization"] = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
      }
    }

    let authError: string | null = null;
    let lastError: string | null = null;
    const timeoutMs = context.timeoutMs || 6000;

    for (const url of candidateUrls) {
      try {
        const res = await fetch(url, {
          method: "GET",
          headers: reqHeaders,
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (res.ok || res.status === 200) {
          const payload: any = await res.json();
          const models = extractModelsFromPayload(payload, this.id);
          if (models.length > 0) {
            return {
              success: true,
              endpointUrl: url,
              models,
              count: models.length,
            };
          }
        }

        if (res.status === 401 || res.status === 403) {
          authError = `Authentication failed (HTTP ${res.status}) for account "${context.account?.name || this.name}". Please verify credentials.`;
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
      error: authError || lastError || "Failed to probe models",
      authError: authError || undefined,
    };
  }
}
