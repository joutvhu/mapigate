import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import type { ProviderProbeContext, ProviderProbeResult, ProviderRequestContext } from "../../core/types.js";
import { extractModelsFromPayload } from "../../../core/scanner/payloadExtractor.js";

const GEMINI_OPENAI_ALLOWED_FIELDS = new Set([
  "model",
  "messages",
  "temperature",
  "top_p",
  "n",
  "stream",
  "stream_options",
  "stop",
  "max_tokens",
  "max_completion_tokens",
  "response_format",
  "seed",
  "tools",
  "tool_choice",
  "reasoning_effort",
  "extra_body",
  "modalities",
  "audio",
  "cached_content",
]);

const GEMINI_MESSAGE_ALLOWED_FIELDS = new Set([
  "role",
  "content",
  "name",
  "tool_calls",
  "tool_call_id",
  "refusal",
  "audio",
]);

function sanitizeGeminiOpenAiPayload(payload: any): any {
  if (!payload || typeof payload !== "object") return payload;

  const sanitized: Record<string, any> = {};
  for (const key of Object.keys(payload)) {
    if (GEMINI_OPENAI_ALLOWED_FIELDS.has(key) && payload[key] !== undefined) {
      sanitized[key] = payload[key];
    }
  }

  if (Array.isArray(sanitized.messages)) {
    sanitized.messages = sanitized.messages.map((msg: any) => {
      if (!msg || typeof msg !== "object") return msg;
      const cleanMsg: Record<string, any> = {};
      for (const key of Object.keys(msg)) {
        if (GEMINI_MESSAGE_ALLOWED_FIELDS.has(key) && msg[key] !== undefined) {
          cleanMsg[key] = msg[key];
        }
      }
      return cleanMsg;
    });
  }

  if (Array.isArray(sanitized.tools)) {
    sanitized.tools = sanitized.tools.map((tool: any) => {
      if (!tool || typeof tool !== "object") return tool;
      if (tool.type === "function" && tool.function && typeof tool.function === "object") {
        const cleanFn: Record<string, any> = {
          name: tool.function.name,
        };
        if (tool.function.description !== undefined) {
          cleanFn.description = tool.function.description;
        }
        if (tool.function.parameters !== undefined) {
          cleanFn.parameters = tool.function.parameters;
        }
        return { type: "function", function: cleanFn };
      }
      return tool;
    });
  }

  return sanitized;
}

export class GeminiProvider extends OpenAiCompatibleProvider {
  public override readonly id = "gemini";
  public override readonly name = "Google Gemini";
  public override readonly defaultFormat = "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public override transformRequestBody(context: ProviderRequestContext): any {
    const converted = super.transformRequestBody(context);
    return sanitizeGeminiOpenAiPayload(converted);
  }

  public override buildUrl(context: ProviderRequestContext): string {
    const accountBase = (context.account?.providerSpecificData?.baseUrl || "").trim();
    const rawBase = (accountBase || context.provider?.baseUrl || "").trim();

    if (rawBase.includes("/chat/completions")) {
      return rawBase;
    }

    const cleanBase = rawBase.replace(/\/+$/, "");
    if (cleanBase.endsWith("/openai")) {
      return `${cleanBase}/chat/completions`;
    }
    return super.buildUrl(context);
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    const key = (context.account.rawApiKey || "").trim();
    if (!key) {
      return { plan: "Free Tier", message: "Google AI Studio API key not configured." };
    }
    return {
      plan: "Google AI Studio",
      message: "API key connected. Quota limits follow Google AI Studio tier (viewable at aistudio.google.com).",
    };
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const account = context.account;
    const timeoutMs = context.timeoutMs || 6000;
    let token = (context.apiKey || account?.rawApiKey || "").trim();

    if (token.startsWith("{") && token.endsWith("}")) {
      try {
        const parsed = JSON.parse(token);
        token = parsed.accessToken || parsed.access_token || parsed.apiKey || token;
      } catch {}
    }

    if (token) {
      // 1. First probe via OpenAI compatibility endpoint with Bearer token
      try {
        const openAiUrl = "https://generativelanguage.googleapis.com/v1beta/openai/models";
        const res = await fetch(openAiUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            ...(context.customHeaders || {}),
          },
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (res.ok || res.status === 200) {
          const payload: any = await res.json();
          const models = extractModelsFromPayload(payload, this.id);
          return {
            success: true,
            endpointUrl: openAiUrl,
            models: models.length > 0 ? models : undefined,
            count: models.length,
          };
        }
      } catch {}

      // 2. Fallback to Google native models endpoint with ?key= param
      const testUrls = [
        `https://generativelanguage.googleapis.com/v1beta/models?key=${token}`,
        `https://generativelanguage.googleapis.com/v1/models?key=${token}`,
      ];

      for (const url of testUrls) {
        try {
          const res = await fetch(url, {
            method: "GET",
            headers: {
              Accept: "application/json",
              ...(context.customHeaders || {}),
            },
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

          if (res.status === 400 || res.status === 401 || res.status === 403) {
            let errText = "Invalid Google AI Studio API key";
            try {
              const errPayload: any = await res.json();
              if (errPayload?.error?.message) errText = errPayload.error.message;
            } catch {}
            return {
              success: false,
              error: `Authentication failed (HTTP ${res.status}): ${errText}`,
              authError: errText,
            };
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            success: false,
            error: `Failed to connect to Google Gemini: ${msg}`,
          };
        }
      }
    }

    return super.probeModels(context);
  }
}

export default GeminiProvider;
