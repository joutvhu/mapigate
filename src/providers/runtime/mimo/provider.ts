import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderRequestContext } from "../../core/types.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import { getMimoUsage } from "./quota.js";
import {
  rescueInlineToolCalls,
  createStreamToolCallRescuer,
} from "../../../core/adapters/helpers/toolCallRescue.js";

export class MimoProvider extends OpenAiCompatibleProvider {
  public override readonly id = "mimo";
  public override readonly name = "Xiaomi MiMo";
  public override readonly defaultFormat = "openai";

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

export default MimoProvider;
