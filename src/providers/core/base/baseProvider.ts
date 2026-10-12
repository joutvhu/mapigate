import type {
  IProvider,
  ProviderRequestContext,
} from "../types.js";
import { isRateLimitOrQuotaError } from "../../../core/router/loadBalancer.js";

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
  public readonly streamType: "sse" | "eventstream" | "custom" = "sse";

  public buildUrl(context: ProviderRequestContext): string {
    const rawBase = (context.provider?.baseUrl || "").trim();
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
    const bearerToken = context.account?.rawApiKey || "";
    const outgoingHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      ...(context.provider?.customHeaders || {}),
    };

    const prov = context.provider as any;
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
}
