import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import { metadata } from "./metadata.js";
import type { ProviderRequestContext } from "../../core/types.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import { getMimoUsage } from "../../runtime/mimo/quota.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import { rescueInlineToolCalls } from "../../../core/adapters/helpers/toolCallRescue.js";

export class XiaomiTokenplanProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "claude";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getMimoUsage(
      context.account.rawApiKey,
      context.providerId,
      context.account.providerSpecificData,
      context.account.id
    );
  }

  public override transformRequestBody(context: ProviderRequestContext): any {
    if (context.targetFormat === "claude") {
      if (context.clientFormat === "anthropic") {
        return { ...context.body, model: context.targetModel };
      }
      return {
        ...AnthropicAdapter.openAiToAnthropic(context.body),
        model: context.targetModel,
      };
    }
    return super.transformRequestBody(context);
  }

  public override buildUrl(context: ProviderRequestContext): string {
    const psd = context.account?.providerSpecificData || {};
    const region = psd.region || "sgp";
    const customBase = context.provider?.baseUrl;

    if (customBase && !customBase.includes("xiaomimimo.com")) {
      const cleanBase = customBase.replace(/\/+$/, "");
      if (context.targetFormat === "claude") {
        return cleanBase.endsWith("/messages") ? cleanBase : `${cleanBase}/v1/messages`;
      }
      return cleanBase.endsWith("/chat/completions") ? cleanBase : `${cleanBase}/v1/chat/completions`;
    }

    if (context.targetFormat === "claude") {
      return `https://token-plan-${region}.xiaomimimo.com/anthropic/v1/messages`;
    }
    return `https://token-plan-${region}.xiaomimimo.com/v1/chat/completions`;
  }

  public override async buildHeaders(context: ProviderRequestContext): Promise<Record<string, string>> {
    const headers = await super.buildHeaders(context);
    const apiKey = (context.account?.rawApiKey || "").trim();
    if (context.targetFormat === "claude") {
      delete headers["Authorization"];
      if (apiKey) {
        headers["x-api-key"] = apiKey;
      }
      if (!headers["anthropic-version"]) {
        headers["anthropic-version"] = "2023-06-01";
      }
    }
    return headers;
  }

  public transformResponseChunk(chunk: any, context: ProviderRequestContext): any {
    if (!chunk?.choices?.length) return chunk;
    const choice = chunk.choices[0];
    const delta = choice?.delta;
    if (!delta?.content || typeof delta.content !== "string") return chunk;

    const ctx = context as any;
    if (ctx._mimoBuffer === undefined) {
      ctx._mimoBuffer = "";
      ctx._mimoInToolCall = false;
    }

    const text = delta.content;
    if (!ctx._mimoInToolCall && !text.includes("<tool_call>")) {
      return chunk;
    }

    ctx._mimoBuffer += text;
    if (ctx._mimoBuffer.includes("<tool_call>")) {
      ctx._mimoInToolCall = true;
      if (ctx._mimoBuffer.includes("</tool_call>")) {
        const rescue = rescueInlineToolCalls(ctx._mimoBuffer, new Set());
        ctx._mimoBuffer = "";
        ctx._mimoInToolCall = false;
        if (rescue.detected && rescue.calls && rescue.calls.length > 0) {
          delta.tool_calls = rescue.calls.map((c, idx) => ({
            index: idx,
            id: `call_mimo_${Date.now()}_${idx}`,
            type: "function",
            function: {
              name: c.name,
              arguments: c.arguments,
            },
          }));
          delta.content = rescue.cleanText || null;
          if (choice.finish_reason === "stop") {
            choice.finish_reason = "tool_calls";
          }
          return chunk;
        }
      } else {
        const startIdx = ctx._mimoBuffer.indexOf("<tool_call>");
        const before = ctx._mimoBuffer.slice(0, startIdx);
        delta.content = before || null;
        return chunk;
      }
    }

    return chunk;
  }

  public transformResponseBody(body: any, _context: ProviderRequestContext): any {
    if (!body || typeof body !== "object") return body;
    const choice = body.choices?.[0];
    const msg = choice?.message;
    if (msg?.content && typeof msg.content === "string" && msg.content.includes("<tool_call>")) {
      const rescue = rescueInlineToolCalls(msg.content, new Set());
      if (rescue.detected && rescue.calls && rescue.calls.length > 0) {
        msg.tool_calls = rescue.calls.map((c, idx) => ({
          id: `call_mimo_${Date.now()}_${idx}`,
          type: "function",
          function: {
            name: c.name,
            arguments: c.arguments,
          },
        }));
        msg.content = rescue.cleanText || null;
        if (choice.finish_reason === "stop" || !choice.finish_reason) {
          choice.finish_reason = "tool_calls";
        }
      }
    }
    return body;
  }
}

export default XiaomiTokenplanProvider;
