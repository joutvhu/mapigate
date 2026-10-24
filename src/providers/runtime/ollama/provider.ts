import { BaseProvider } from "../../core/base/baseProvider.js";
import type { ProviderRequestContext, ProviderProbeContext, ProviderProbeResult } from "../../core/types.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import { extractModelsFromPayload } from "../../../core/scanner/payloadExtractor.js";

export class OllamaProvider extends BaseProvider {
  public readonly id = "ollama";
  public readonly name = "Ollama Cloud";
  public readonly defaultFormat = "openai";
  public override readonly requiresAccount = false;

  public override buildUrl(context: ProviderRequestContext): string {
    const psd = context.account?.providerSpecificData || {};
    const host = (psd.baseUrl || context.provider?.baseUrl || "https://ollama.com").replace(/\/+$/, "");
    if (host.includes("/v1") || host.includes("/api/chat")) {
      return host;
    }
    return `${host}/v1/chat/completions`;
  }

  public override async buildHeaders(context: ProviderRequestContext): Promise<Record<string, string>> {
    const headers = await super.buildHeaders(context);
    const bearerToken = context.account?.rawApiKey || "";
    if (!bearerToken) {
      delete headers["Authorization"];
    }
    return headers;
  }

  public override transformRequestBody(context: ProviderRequestContext): any {
    if (context.clientFormat === "anthropic") {
      const converted = AnthropicAdapter.anthropicToOpenAi(context.body);
      converted.model = context.targetModel;
      return converted;
    }
    return { ...context.body, model: context.targetModel };
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const token = (context.apiKey || context.account?.rawApiKey || "").trim();
    const psd = ((context.account?.providerSpecificData || context.providerSpecificData || {}) as any);
    const rawBase = (psd.baseUrl || context.baseUrl || "https://ollama.com").replace(/\/+$/, "");
    const cleanHost = rawBase.replace(/\/(api\/chat|v1)$/, "");

    const timeoutMs = context.timeoutMs || 6000;
    const endpoints = [
      `${cleanHost}/api/tags`,
      `${cleanHost}/v1/models`,
      `${cleanHost}/models`,
    ];

    const reqHeaders: Record<string, string> = {
      Accept: "application/json",
      ...(context.customHeaders || {}),
    };
    if (token) {
      reqHeaders["Authorization"] = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
    }

    let lastError: string | null = null;
    let authError: string | null = null;

    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          method: "GET",
          headers: reqHeaders,
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (res.ok || res.status === 200) {
          const payload: any = await res.json();
          const models = extractModelsFromPayload(payload, this.id);
          return {
            success: true,
            endpointUrl: url,
            models: models.length > 0 ? models : undefined,
            count: models.length,
          };
        }

        if (res.status === 401 || res.status === 403) {
          authError = `Authentication failed (HTTP ${res.status}): Invalid Ollama API key`;
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
      error: authError || lastError || `Could not connect to Ollama at ${cleanHost}`,
      authError: authError || undefined,
    };
  }
}

export default OllamaProvider;
