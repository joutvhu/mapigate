import type { ModelCallResult, ProviderRequestContext } from "./types.js";
import { ResponseLogger } from "./responseLogger.js";
import { pipeSseStream } from "./streaming/sseStreamer.js";
import { pipeBedrockEventStream } from "./streaming/bedrockStreamer.js";

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

  if (isJson) {
    res.status(200).json(responseBody);
  } else {
    res.status(200).send(responseBody);
  }

  const usage = responseBody?.usage || {};
  const promptTokens = usage.prompt_tokens ?? usage.input_tokens ?? usage.prompt_eval_count ?? rtkStats.compressedTokens ?? 0;
  const completionTokens = usage.completion_tokens ?? usage.output_tokens ?? usage.eval_count ?? 0;
  const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? usage.cache_read_input_tokens ?? 0;
  const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
  const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens ?? 0;

  ResponseLogger.logSuccess({
    requestId: context.requestId,
    startTime,
    durationMs,
    clientTool,
    rawModel,
    targetModel,
    providerId: provider.id,
    accountId: account?.id,
    accountName: account?.name,
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

  return { ok: true, status: 200, json: isJson ? responseBody : undefined, text: isJson ? undefined : responseBody, modelUsed: targetModel };
}

export async function handleStreamingResponse(
  upstreamRes: globalThis.Response,
  res: any,
  context: ProviderRequestContext,
  provider: any,
  meta: { upstreamUrl: string; outgoingHeaders: Record<string, string>; upstreamBody: any }
): Promise<ModelCallResult> {
  const { startTime, targetModel, rawModel, clientTool, rtkStats, is1mContext, req, account } = context;

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
  ResponseLogger.logSuccess({
    requestId: context.requestId,
    startTime,
    durationMs,
    clientTool,
    rawModel,
    targetModel,
    providerId: provider.id,
    accountId: account?.id,
    accountName: account?.name,
    promptTokens: streamRes.inputTokens,
    completionTokens: streamRes.outputTokens,
    cachedTokens: 0,
    cacheCreationTokens: 0,
    reasoningTokens: 0,
    tokensSavedByRtk: rtkStats.tokensSaved,
    ttftMs: streamRes.ttftMs,
    is1mContext,
    requestHeaders: req.headers as Record<string, string>,
    requestBody: req.body,
    providerRequest: { url: meta.upstreamUrl, headers: meta.outgoingHeaders, body: meta.upstreamBody },
    providerResponse: { status: upstreamRes.status, headers: Object.fromEntries(upstreamRes.headers.entries()) },
    clientResponse: { status: 200, headers: { "content-type": "text/event-stream" }, body: { text: "Stream completed" } },
  });

  return { ok: true, status: 200, modelUsed: targetModel };
}
