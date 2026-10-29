import type { ModelCallResult, ProviderRequestContext } from "./types.js";
import { ResponseLogger } from "./responseLogger.js";
import { pipeSseStream } from "./streaming/sseStreamer.js";
import { pipeBedrockEventStream } from "./streaming/bedrockStreamer.js";
import { formatDoneLine, logger, LogSymbol } from "../../shared/logger.js";
import { appendStructuredLog } from "../utils/consoleLogBuffer.js";
import type { LogToolSnippet } from "../../shared/types/index.js";
import { reasoningCache } from "../../core/caching/reasoningCache.js";
import { OpenAiAdapter } from "../../core/adapters/openAiAdapter.js";
import { AnthropicAdapter } from "../../core/adapters/anthropicAdapter.js";
import { convertOpenAiResponseToResponsesApi } from "../../core/adapters/responsesAdapter.js";

export async function handleNonStreamingResponse(
  upstreamRes: globalThis.Response,
  res: any,
  context: ProviderRequestContext,
  provider: any,
  meta: { upstreamUrl: string; outgoingHeaders: Record<string, string>; upstreamBody: any }
): Promise<ModelCallResult> {
  const { startTime, targetModel, rawModel, clientTool, rtkStats, is1mContext, req, account } = context;
  const durationMs = Date.now() - startTime;
  const rawText = await upstreamRes.text();
  let responseBody: any;
  let isJson = false;
  try {
    responseBody = JSON.parse(rawText);
    isJson = true;
  } catch {
    responseBody = rawText;
  }

  if (provider.transformResponseBody) {
    responseBody = provider.transformResponseBody(responseBody, context);
  }

  const requestTools = context.req?.body?.tools || context.body?.tools;
  if (isJson && responseBody && typeof responseBody === "object") {
    responseBody = OpenAiAdapter.rescueAndRepairResponse(responseBody, requestTools);
  }

  if (isJson) {
    if (context.clientFormat === "responses") {
      responseBody = convertOpenAiResponseToResponsesApi(responseBody);
    } else if (context.clientFormat === "anthropic" && context.targetFormat === "openai") {
      responseBody = AnthropicAdapter.openAiResponseToAnthropic(responseBody, context.requestId);
    } else if (context.clientFormat === "openai" && (context.targetFormat === "claude" || (responseBody?.type === "message" && Array.isArray(responseBody?.content)))) {
      responseBody = AnthropicAdapter.anthropicResponseToOpenAi(responseBody, context.targetModel);
    }
    res.status(200).json(responseBody);
  } else {
    res.status(200).send(responseBody);
  }

  const usage = responseBody?.usage || {};
  let promptTokens = usage.prompt_tokens ?? usage.input_tokens ?? usage.prompt_eval_count ?? rtkStats.compressedTokens ?? 0;
  const completionTokens = usage.completion_tokens ?? usage.output_tokens ?? usage.eval_count ?? 0;
  const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? usage.cache_read_input_tokens ?? 0;
  const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
  const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens ?? 0;

  if (usage.input_tokens !== undefined && usage.prompt_tokens === undefined) {
    promptTokens = (usage.input_tokens || 0) + cachedTokens + cacheCreationTokens;
  }

  const calculatedCost = ResponseLogger.logSuccess({
    requestId: context.requestId,
    startTime,
    durationMs,
    clientTool,
    rawModel,
    targetModel,
    providerId: provider.id,
    accountId: account?.id,
    accountName: account?.name,
    apiKeyId: context.apiKeyId,
    apiKeyName: context.apiKeyName,
    promptTokens,
    completionTokens,
    cachedTokens,
    cacheCreationTokens,
    reasoningTokens,
    tokensSavedByRtk: rtkStats.tokensSaved,
    is1mContext,
    requestHeaders: req.headers as Record<string, string>,
    requestBody: req.body,
    providerRequest: { url: meta.upstreamUrl, headers: meta.outgoingHeaders, body: meta.upstreamBody },
    providerResponse: {
      status: upstreamRes.status,
      headers: Object.fromEntries(upstreamRes.headers.entries()),
      body: responseBody,
    },
    clientResponse: {
      status: 200,
      headers: { "content-type": isJson ? "application/json" : "text/plain" },
      body: responseBody,
    },
  });

  // Extract tools if non-streaming response body contains tool_calls or tool_use
  const toolSnippets: LogToolSnippet[] = [];
  try {
    if (responseBody?.choices?.[0]?.message?.tool_calls) {
      for (const tc of responseBody.choices[0].message.tool_calls) {
        toolSnippets.push({
          name: tc.function?.name || "tool",
          type: "call",
          summary: `${tc.function?.name || "tool"}(${tc.function?.arguments?.slice?.(0, 80) || ""})`,
        });
      }
    } else if (Array.isArray(responseBody?.content)) {
      for (const block of responseBody.content) {
        if (block.type === "tool_use") {
          toolSnippets.push({
            name: block.name || "tool",
            type: "call",
            summary: `${block.name || "tool"}(${JSON.stringify(block.input || {}).slice(0, 80)})`,
          });
        }
      }
    }
  } catch {}

  // Persist tool call reasoning if present
  try {
    let reasoningText = "";
    const toolCallIds: string[] = [];

    const msg = responseBody?.choices?.[0]?.message;
    if (msg) {
      const reasoning = msg.reasoning_content || msg.reasoning || "";
      if (typeof reasoning === "string" && reasoning) {
        reasoningText = reasoning;
      }
      if (Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          if (tc.id) toolCallIds.push(tc.id);
        }
      }
    }

    if (Array.isArray(responseBody?.content)) {
      for (const block of responseBody.content) {
        if (block.type === "thinking" && typeof block.thinking === "string") {
          reasoningText = block.thinking;
        } else if (block.type === "tool_use" && block.id) {
          toolCallIds.push(block.id);
        }
      }
    }

    if (toolCallIds.length > 0 && reasoningText) {
      reasoningCache.saveMultiple(toolCallIds, provider.id, targetModel, reasoningText);
    }
  } catch {}

  const doneMsg = formatDoneLine({
    durationMs,
    promptTokens,
    completionTokens,
    cachedTokens,
    cacheCreationTokens,
    tokensSaved: rtkStats.tokensSaved,
    cost: calculatedCost,
  });

  const reqTag = context.reqTag || "PROXY";
  const doneSummary = `${provider.id}/${targetModel} · ${doneMsg}`;
  logger.line(reqTag, LogSymbol.USAGE, doneSummary);

  appendStructuredLog({
    id: context.requestId,
    timestamp: Date.now(),
    level: "info",
    category: "proxy",
    message: doneSummary,
    requestId: context.requestId,
    reqTag,
    gateway: {
      clientTool,
      route: req.path,
      requestedModel: rawModel,
      actualModel: targetModel,
      providerId: provider.id,
      accountId: account?.id,
      accountName: account?.name,
      statusCode: 200,
      durationMs,
      tokens: {
        prompt: promptTokens,
        completion: completionTokens,
        cached: cachedTokens,
        cacheCreation: cacheCreationTokens,
        reasoning: reasoningTokens,
        savedByRtk: rtkStats.tokensSaved,
      },
      cost: calculatedCost,
      tools: toolSnippets.length ? toolSnippets : undefined,
    },
    rawText: doneSummary,
  });

  return { ok: true, status: 200, json: isJson ? responseBody : undefined, text: isJson ? undefined : responseBody, modelUsed: targetModel, logged: true };
}

export async function handleStreamingResponse(
  upstreamRes: globalThis.Response,
  res: any,
  context: ProviderRequestContext,
  provider: any,
  meta: { upstreamUrl: string; outgoingHeaders: Record<string, string>; upstreamBody: any }
): Promise<ModelCallResult> {
  const { startTime, targetModel, rawModel, clientTool, rtkStats, is1mContext, req, account } = context;

  if (res.headersSent || res.writableEnded || res.destroyed) {
    return {
      ok: false,
      status: 499,
      error: "Client connection already closed or headers already sent",
    };
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let streamRes;
  if (provider.streamResponse) {
    streamRes = await provider.streamResponse(upstreamRes, res, context);
  } else if (provider.streamType === "eventstream") {
    streamRes = await pipeBedrockEventStream(upstreamRes, res, context, provider);
  } else {
    streamRes = await pipeSseStream(upstreamRes, res, context, provider);
  }

  const durationMs = streamRes.totalDurationMs;
  const promptTokens = streamRes.inputTokens;
  const completionTokens = streamRes.outputTokens;
  const cachedTokens = streamRes.cachedTokens || 0;
  const cacheCreationTokens = streamRes.cacheCreationTokens || 0;
  const reasoningTokens = streamRes.reasoningTokens || 0;

  const calculatedCost = ResponseLogger.logSuccess({
    requestId: context.requestId,
    startTime,
    durationMs,
    clientTool,
    rawModel,
    targetModel,
    providerId: provider.id,
    accountId: account?.id,
    accountName: account?.name,
    apiKeyId: context.apiKeyId,
    apiKeyName: context.apiKeyName,
    promptTokens,
    completionTokens,
    cachedTokens,
    cacheCreationTokens,
    reasoningTokens,
    tokensSavedByRtk: rtkStats.tokensSaved,
    ttftMs: streamRes.ttftMs,
    is1mContext,
    requestHeaders: req.headers as Record<string, string>,
    requestBody: req.body,
    providerRequest: { url: meta.upstreamUrl, headers: meta.outgoingHeaders, body: meta.upstreamBody },
    providerResponse: { status: upstreamRes.status, headers: Object.fromEntries(upstreamRes.headers.entries()) },
    clientResponse: { status: 200, headers: { "content-type": "text/event-stream" }, body: { text: "Stream completed" } },
  });

  const doneMsg = formatDoneLine({
    durationMs,
    ttftMs: streamRes.ttftMs,
    promptTokens,
    completionTokens,
    cachedTokens,
    cacheCreationTokens,
    tokensSaved: rtkStats.tokensSaved,
    cost: calculatedCost,
  });

  const reqTag = context.reqTag || "PROXY";
  const doneSummary = `${provider.id}/${targetModel} · ${doneMsg}`;
  logger.line(reqTag, LogSymbol.USAGE, doneSummary);

  appendStructuredLog({
    id: context.requestId,
    timestamp: Date.now(),
    level: "info",
    category: "proxy",
    message: doneSummary,
    requestId: context.requestId,
    reqTag,
    gateway: {
      clientTool,
      route: req.path,
      requestedModel: rawModel,
      actualModel: targetModel,
      providerId: provider.id,
      accountId: account?.id,
      accountName: account?.name,
      statusCode: 200,
      durationMs,
      ttftMs: streamRes.ttftMs,
      tokens: {
        prompt: promptTokens,
        completion: completionTokens,
        cached: cachedTokens,
        cacheCreation: cacheCreationTokens,
        reasoning: reasoningTokens,
        savedByRtk: rtkStats.tokensSaved,
      },
      cost: calculatedCost,
      tools: streamRes.tools && streamRes.tools.length ? streamRes.tools : undefined,
    },
    rawText: doneSummary,
  });

  return { ok: true, status: 200, modelUsed: targetModel, logged: true };
}
