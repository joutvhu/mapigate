import crypto from "node:crypto";
import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderRequestContext, ProviderProbeContext, ProviderProbeResult } from "../../core/types.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import { metadata } from "./metadata.js";
import { getCodeBuddyUsage } from "./quota.js";

const NEUTRAL_PROMPT = "You are a helpful AI assistant that helps with software engineering tasks.";

function sanitizePromptForCodeBuddy(body: any): any {
  if (!body || typeof body !== "object") return body;
  const clone = { ...body };
  if (Array.isArray(clone.messages)) {
    clone.messages = clone.messages.map((msg: any) => {
      if (msg.role === "system" && typeof msg.content === "string") {
        return { ...msg, content: NEUTRAL_PROMPT };
      }
      return msg;
    });
  }
  return clone;
}

export class CodebuddyProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getCodeBuddyUsage(context.account.rawApiKey, context.account.providerSpecificData);
  }

  public override buildUrl(context: ProviderRequestContext): string {
    const psd = ((context.account?.providerSpecificData || {}) as any);
    const isCn = psd.region === "cn";
    const host = isCn ? "https://copilot.tencent.com" : "https://www.codebuddy.ai";
    return `${host}/v2/chat/completions`;
  }

  public override async buildHeaders(context: ProviderRequestContext): Promise<Record<string, string>> {
    const headers = await super.buildHeaders(context);
    const requestId = crypto.randomUUID();
    headers["X-Request-ID"] = requestId;
    headers["X-Conversation-ID"] = crypto.randomUUID();
    headers["X-Conversation-Request-ID"] = requestId;
    headers["X-Conversation-Message-ID"] = requestId;
    return headers;
  }

  public override transformRequestBody(context: ProviderRequestContext): any {
    const sanitized = sanitizePromptForCodeBuddy(context.body);
    const converted = super.transformRequestBody({ ...context, body: sanitized });
    converted.model = context.targetModel;
    return converted;
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const token = (context.apiKey || context.account?.rawApiKey || "").trim();
    if (!token) {
      return {
        success: false,
        error: "CodeBuddy token or API key is required (sign in via OAuth Device Code or provide key).",
      };
    }

    const psd = ((context.account?.providerSpecificData || context.providerSpecificData || {}) as any);
    const isCn = psd.region === "cn";
    const host = isCn ? "https://copilot.tencent.com" : "https://www.codebuddy.ai";
    const timeoutMs = context.timeoutMs || 8000;
    // CodeBuddy exposes no /models listing; /v2/plugin/accounts validates the token.
    const url = `${host}/v2/plugin/accounts`;

    const reqHeaders: Record<string, string> = {
      Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
      "User-Agent": "IDE/2.108.1 CodeBuddy/2.108.1",
      "X-Product": "SaaS",
      "X-IDE-Type": "IDE",
      "X-IDE-Name": "IDE",
      "x-requested-with": "XMLHttpRequest",
      "x-codebuddy-request": "1",
      Accept: "application/json",
      ...(context.customHeaders || {}),
    };

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: reqHeaders,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.ok) {
        const payload: any = await res.json().catch(() => null);
        if (payload && payload.code !== undefined && payload.code !== 0) {
          return {
            success: false,
            error: `CodeBuddy rejected the token: ${payload.msg || `code ${payload.code}`}`,
            authError: payload.msg || "Invalid CodeBuddy token",
          };
        }
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
          error: `Authentication failed (HTTP ${res.status}): Invalid CodeBuddy token`,
          authError: "Invalid CodeBuddy token",
        };
      }

      return {
        success: false,
        error: `Endpoint ${url} returned HTTP ${res.status}: ${res.statusText}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Failed to connect to CodeBuddy: ${msg}`,
      };
    }
  }
}

export default CodebuddyProvider;
