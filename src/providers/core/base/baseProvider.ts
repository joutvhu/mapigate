import type {
  IProvider,
  ProviderRequestContext,
  ProviderProbeContext,
  ProviderProbeResult,
} from "../types.js";
import { isRateLimitOrQuotaError } from "../../../core/router/loadBalancer.js";
import { extractModelsFromPayload } from "../../../core/scanner/payloadExtractor.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

async function checkBinaryInstalled(binary?: string): Promise<boolean> {
  if (!binary) return false;
  try {
    const isWindows = process.platform === "win32";
    const command = isWindows ? `where ${binary}` : `which ${binary}`;
    const env = isWindows
      ? { ...process.env, PATH: `${process.env.APPDATA}\\npm;${process.env.PATH}` }
      : process.env;
    await execAsync(command, { windowsHide: true, env });
    return true;
  } catch {
    return false;
  }
}

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
    const psd = ((context.account?.providerSpecificData || context.providerSpecificData || {}) as any);
    let rawBase = (context.baseUrl || psd.baseUrl || this.defaultBaseUrl || "").replace(/\/+$/, "");

    if (!rawBase) {
      return { success: false, error: "Base URL is required to probe models." };
    }

    // 1. Local CLI process bridges (auggie://, devin://, zcode://, or .../stdio)
    const isStdioBridge =
      rawBase.startsWith("devin://") ||
      rawBase.startsWith("auggie://") ||
      rawBase.startsWith("zcode://") ||
      (rawBase.includes("://") && rawBase.endsWith("/stdio"));

    if (isStdioBridge) {
      const binary = this.id.includes("devin")
        ? "devin"
        : this.id.includes("auggie")
          ? "auggie"
          : this.id.includes("zcode")
            ? "zcode"
            : "";
      const isInstalled = await checkBinaryInstalled(binary);
      if (isInstalled) {
        return {
          success: true,
          endpointUrl: rawBase,
          count: 1,
        };
      }
      return {
        success: false,
        error: `${this.name} CLI binary "${binary || this.id}" not found locally. Please install ${binary || this.name} or connect via standard API.`,
      };
    }

    // 2. Substitute accountId template in URL if present
    const accountId = psd.accountId || "";
    if (accountId && rawBase.includes("{accountId}")) {
      rawBase = rawBase.replace(/\{accountId\}/g, accountId);
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

    // Support Ollama host
    if (rawBase.includes("ollama") || this.id.includes("ollama")) {
      const cleanHost = rawBase.replace(/\/(api\/chat|v1)$/, "");
      candidateUrls.unshift(`${cleanHost}/api/tags`);
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
          let errDetail = res.statusText;
          try {
            const errJson: any = await res.json();
            if (errJson?.message || errJson?.error?.message) {
              errDetail = errJson?.message || errJson?.error?.message;
            }
          } catch {}
          lastError = `Endpoint ${url} returned HTTP ${res.status}: ${errDetail}`;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("ENOTFOUND")) {
          const hostMatch = rawBase.match(/https?:\/\/([^/]+)/);
          const host = hostMatch ? hostMatch[1] : rawBase;
          lastError = `Domain "${host}" could not be resolved (DNS ENOTFOUND). The service may be offline or moved.`;
        } else if (rawBase.includes("localhost") || rawBase.includes("127.0.0.1")) {
          const portMatch = rawBase.match(/:(\d+)/);
          const port = portMatch ? ` (port ${portMatch[1]})` : "";
          lastError = `Local server for ${this.name} is not running on ${rawBase}. Start ${this.name}${port} to connect.`;
        } else {
          lastError = `Failed to connect to ${url}: ${msg}`;
        }
      }
    }

    return {
      success: false,
      error: authError || lastError || "Failed to probe models",
      authError: authError || undefined,
    };
  }
}
