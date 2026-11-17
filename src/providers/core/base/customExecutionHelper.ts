import type { ModelCallResult, ProviderRequestContext } from "../types.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import { convertOpenAiResponseToResponsesApi } from "../../../core/adapters/responsesAdapter.js";
import { ResponseLogger } from "../../../server/proxy/responseLogger.js";
import { formatDoneLine, logger, LogSymbol } from "../../../shared/logger.js";

export interface FinalizeCustomNonStreamingOptions {
  providerId: string;
  targetModel: string;
  responseId: string;
  created: number;
  fullText: string;
  context: ProviderRequestContext;
  body?: any;
}

/**
 * Shared non-streaming finalizer for custom runtime providers (Trae, Windsurf, Zed).
 * Handles Combo panel passthrough, clientFormat conversion (OpenAI / Anthropic / Responses),
 * usage token estimation, and full per-account ResponseLogger attribution.
 */
export function finalizeCustomNonStreamingResponse(
  options: FinalizeCustomNonStreamingOptions
): ModelCallResult {
  const { providerId, targetModel, responseId, created, fullText, context, body } = options;
  const promptTokens = context.rtkStats?.compressedTokens || 0;
  const completionTokens = Math.ceil((fullText || "").length / 4);
  const qualifiedModel = `${providerId}/${targetModel}`;

  const openAiJson = {
    id: responseId,
    object: "chat.completion",
    created,
    model: targetModel,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: fullText },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };

  if (context.isPanel) {
    return {
      ok: true,
      status: 200,
      json: openAiJson,
      logged: false,
      modelUsed: qualifiedModel,
    };
  }

  let clientResponseBody: any = openAiJson;
  if (context.clientFormat === "responses") {
    clientResponseBody = convertOpenAiResponseToResponsesApi(openAiJson);
  } else if (context.clientFormat === "anthropic") {
    clientResponseBody = AnthropicAdapter.openAiResponseToAnthropic(openAiJson, context.requestId);
  }

  context.res?.status?.(200)?.json?.(clientResponseBody);

  const durationMs = Date.now() - context.startTime;
  const calculatedCost = ResponseLogger.logSuccess({
    requestId: context.requestId,
    startTime: context.startTime,
    durationMs,
    clientTool: context.clientTool || "generic",
    rawModel: context.rawModel || targetModel,
    targetModel,
    providerId,
    accountId: context.account?.id,
    accountName: context.account?.name,
    apiKeyId: context.apiKeyId,
    apiKeyName: context.apiKeyName,
    promptTokens,
    completionTokens,
    cachedTokens: 0,
    cacheCreationTokens: 0,
    reasoningTokens: 0,
    tokensSavedByRtk: context.rtkStats?.tokensSaved || 0,
    is1mContext: context.is1mContext,
    requestHeaders: (context.req?.headers as Record<string, string>) || {},
    requestBody: context.req?.body || body,
    clientResponse: {
      status: 200,
      headers: { "content-type": "application/json" },
      body: clientResponseBody,
    },
  });

  const doneMsg = formatDoneLine({
    durationMs,
    promptTokens,
    completionTokens,
    tokensSaved: context.rtkStats?.tokensSaved || 0,
    cost: calculatedCost,
  });
  logger.line(context.reqTag || "PROXY", LogSymbol.USAGE, `${qualifiedModel} · ${doneMsg}`);

  return {
    ok: true,
    status: 200,
    json: clientResponseBody,
    logged: true,
    modelUsed: qualifiedModel,
  };
}
