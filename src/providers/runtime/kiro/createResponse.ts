import type { ProviderRequestContext, ModelCallResult } from "../../core/types.js";
import { executeUpstreamFetch } from "../../../server/proxy/proxyDispatcher.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import { isZeroContentResponse } from "../../../core/adapters/helpers/zeroContentCheck.js";
import { ResponseLogger } from "../../../server/proxy/responseLogger.js";
import { logger, LogSymbol, formatDoneLine } from "../../../shared/logger.js";
import { resolveDefaultProfileArn } from "./quota.js";
import {
  type KiroCreateResponseMode,
  getKiroCreateResponseMode,
  isKiroUserRateExceeded,
  buildKiroCreateResponseUrl,
  buildKiroCreateResponsePayload,
  responsesApiToOpenAiResponse,
} from "./createResponseConverter.js";
import { streamKiroCreateResponse } from "./createResponseStream.js";

export {
  type KiroCreateResponseMode,
  getKiroCreateResponseMode,
  isKiroUserRateExceeded,
  buildKiroCreateResponseUrl,
  buildKiroCreateResponsePayload,
  responsesApiToOpenAiResponse,
};

export interface ExecuteKiroCreateResponseOptions {
  context: ProviderRequestContext;
  upstreamModel: string;
  region: string;
  headers: Record<string, string>;
  effectiveProxy: string;
  isStreaming: boolean;
  profileArn?: string;
  fetchFn?: typeof executeUpstreamFetch;
  retryDelayMs?: number;
}

export async function executeKiroCreateResponse(
  opts: ExecuteKiroCreateResponseOptions
): Promise<ModelCallResult> {
  const {
    context,
    upstreamModel,
    region,
    headers,
    effectiveProxy,
    isStreaming,
    fetchFn = executeUpstreamFetch,
    retryDelayMs = 1500,
  } = opts;

  const { req, res, clientFormat, startTime, requestId, reqTag = "KIRO" } = context;
  if (!res) {
    return { ok: false, status: 500, error: "Response object is required for Kiro CreateResponse" };
  }

  const rawModel = context.targetModel || upstreamModel;
  const targetModel = context.targetModel || rawModel;
  const body = context.body || req?.body || {};

  const psd = (context.account?.providerSpecificData || {}) as Record<string, any>;
  const effectiveProfileArn =
    (opts.profileArn || "").trim() ||
    (psd.profileArn || "").trim() ||
    (headers["x-amzn-codewhisperer-profile-arn"] || "").trim() ||
    resolveDefaultProfileArn(psd.authMethod);

  const url = buildKiroCreateResponseUrl(region);
  const payload = buildKiroCreateResponsePayload(body, upstreamModel, isStreaming, effectiveProfileArn);

  const reqHeaders: Record<string, string> = {
    ...headers,
    "Content-Type": "application/json",
    Accept: isStreaming ? "text/event-stream" : "application/json",
    "x-amzn-kiro-origin": "AI_EDITOR",
    ...(effectiveProfileArn ? { "x-amzn-kiro-profile": effectiveProfileArn } : {}),
  };
  delete reqHeaders["X-Amz-Target"];

  let upstreamRes = await fetchFn(
    url,
    { method: "POST", headers: reqHeaders, body: JSON.stringify(payload) },
    effectiveProxy
  );

  // 1 retry after 1500ms if /v1/responses also returns 429 burst limit
  if (!upstreamRes.ok && upstreamRes.status === 429) {
    logger.warn("KIRO", `/v1/responses returned 429; retrying once after ${retryDelayMs}ms`);
    if (retryDelayMs > 0) {
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
    upstreamRes = await fetchFn(
      url,
      { method: "POST", headers: reqHeaders, body: JSON.stringify(payload) },
      effectiveProxy
    );
  }

  if (!upstreamRes.ok) {
    const errText = await upstreamRes.text().catch(() => "");
    return {
      ok: false,
      status: upstreamRes.status,
      error: errText || `Kiro /v1/responses failed with status ${upstreamRes.status}`,
    };
  }

  const responseId = `chatcmpl-${requestId}`;
  const created = Math.floor(Date.now() / 1000);

  if (isStreaming) {
    return await streamKiroCreateResponse({
      upstreamRes,
      res,
      context,
      rawModel,
      targetModel,
      responseId,
      created,
    });
  }

  // Non-streaming path
  const rawText = await upstreamRes.text();
  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    return { ok: false, status: 502, error: "Failed to parse Kiro /v1/responses JSON response" };
  }

  const openAiJson = responsesApiToOpenAiResponse(data, rawModel);
  let clientResponseBody: any = openAiJson;
  if (clientFormat === "responses") {
    clientResponseBody = data;
  } else if (clientFormat === "anthropic") {
    clientResponseBody = AnthropicAdapter.openAiResponseToAnthropic(openAiJson, requestId);
  }

  if (isZeroContentResponse(clientResponseBody)) {
    return { ok: false, status: 502, error: "Upstream returned HTTP 200 with empty content" };
  }

  const durationMs = Date.now() - startTime;
  const promptTokens = openAiJson.usage?.prompt_tokens || context.rtkStats?.compressedTokens || 0;
  const completionTokens = openAiJson.usage?.completion_tokens || 0;
  const calculatedCost = ResponseLogger.logSuccess({
    requestId,
    startTime,
    durationMs,
    clientTool: context.clientTool || "generic",
    rawModel: context.rawModel || targetModel,
    targetModel,
    providerId: "kiro",
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
    requestHeaders: req.headers as Record<string, string>,
    requestBody: req.body,
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
  logger.line(reqTag, LogSymbol.SUCCESS, `kiro/${targetModel} (responses) · ${doneMsg}`);

  res.status(200).json(clientResponseBody);
  return { ok: true, status: 200, json: clientResponseBody, logged: true, modelUsed: targetModel };
}
