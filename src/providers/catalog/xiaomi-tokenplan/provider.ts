import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import { metadata } from "./metadata.js";
import type { ProviderRequestContext } from "../../core/types.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import { getMimoUsage } from "../../runtime/mimo/quota.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import {
  createStreamToolCallRescuer,
} from "../../../core/adapters/helpers/toolCallRescue.js";

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
        ...AnthropicAdapter.openAiToAnthropic(
          context.body,
          context.targetModel,
          context.provider?.id || this.id
        ),
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
      if (!headers["anthropic-beta"]) {
        headers["anthropic-beta"] = "claude-code-20250219,interleaved-thinking-2025-05-14";
      }
      if (!headers["user-agent"]) {
        headers["user-agent"] = "claude-code/0.2.29 (external; x86_64)";
      }
    }
    return headers;
  }

  public transformResponseChunk(chunk: any, context: ProviderRequestContext): any {
    if (!chunk?.choices?.length) return chunk;
    const choice = chunk.choices[0];
    const delta = choice?.delta;

    const ctx = context as any;
    if (!ctx._toolRescuer) {
      const tools = context.req?.body?.tools || context.body?.tools;
      const toolNames = Array.isArray(tools)
        ? new Set(tools.map((t: any) => t.function?.name || t.name).filter(Boolean))
        : undefined;
      ctx._toolRescuer = createStreamToolCallRescuer(toolNames);
    }

    if (choice.finish_reason) {
      const { calls, cleanText } = ctx._toolRescuer.flush();
      if (calls.length > 0) {
        if (!choice.delta) choice.delta = {};
        choice.delta.tool_calls = calls.map((c: any, idx: number) => ({
          index: idx,
          id: `call_mimo_${Date.now()}_${idx}`,
          type: "function",
          function: {
            name: c.name,
            arguments: c.arguments,
          },
        }));
        choice.finish_reason = "tool_calls";
      }
      if (cleanText && choice.delta) {
        choice.delta.content = (choice.delta.content || "") + cleanText;
      }
      return chunk;
    }

    if (!delta?.content || typeof delta.content !== "string") return chunk;

    const { calls, cleanText } = ctx._toolRescuer.feed(delta.content);
    if (calls.length > 0) {
      delta.tool_calls = calls.map((c: any, idx: number) => ({
        index: idx,
        id: `call_mimo_${Date.now()}_${idx}`,
        type: "function",
        function: {
          name: c.name,
          arguments: c.arguments,
        },
      }));
      delta.content = cleanText || null;
      if (choice.finish_reason === "stop") {
        choice.finish_reason = "tool_calls";
      }
      return chunk;
    }

    delta.content = cleanText;
    return chunk;
  }

  public transformResponseBody(body: any, context: ProviderRequestContext): any {
    if (!body || typeof body !== "object") return body;
    const choice = body.choices?.[0];
    const msg = choice?.message;
    if (msg?.content && typeof msg.content === "string") {
      const tools = context.req?.body?.tools || context.body?.tools;
      const toolNames = Array.isArray(tools)
        ? new Set(tools.map((t: any) => t.function?.name || t.name).filter(Boolean))
        : undefined;
      const rescuer = createStreamToolCallRescuer(toolNames);
      const r1 = rescuer.feed(msg.content);
      const r2 = rescuer.flush();
      const allCalls = [...r1.calls, ...r2.calls];
      if (allCalls.length > 0) {
        msg.tool_calls = allCalls.map((c, idx) => ({
          id: `call_mimo_${Date.now()}_${idx}`,
          type: "function",
          function: {
            name: c.name,
            arguments: c.arguments,
          },
        }));
        const combinedClean = [r1.cleanText, r2.cleanText].filter(Boolean).join("");
        msg.content = combinedClean.trim() || null;
        if (choice.finish_reason === "stop" || !choice.finish_reason) {
          choice.finish_reason = "tool_calls";
        }
      }
    }
    return body;
  }
}

export default XiaomiTokenplanProvider;
