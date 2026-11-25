import fs from "node:fs";
import path from "node:path";
import type { IProvider, ModelCallResult, ProviderRequestContext } from "../types.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import { convertOpenAiResponseToResponsesApi } from "../../../core/adapters/responsesAdapter.js";
import { applyCacheControlPolicy } from "../../../core/caching/cacheControlPolicy.js";
import { reasoningCache } from "../../../core/caching/reasoningCache.js";
import { executeUpstreamFetch } from "../../../server/proxy/proxyDispatcher.js";
import { ResponseLogger } from "../../../server/proxy/responseLogger.js";
import { appendStructuredLog } from "../../../server/utils/consoleLogBuffer.js";
import { SettingsRepository } from "../../../storage/repositories/settingsRepo.js";
import { getDefaultDataDir } from "../../../shared/constants/index.js";
import { formatDoneLine, logger, LogSymbol } from "../../../shared/logger.js";
import { sanitizeErrorMessage, sanitizeHeaders } from "../../../shared/utils/errorSanitizer.js";
import { formatOpenAiResponseForClient } from "./customExecutionHelper.js";

function writeDebugFailedRequest(
  url: string,
  status: number,
  cleanErrText: string,
  outgoingHeaders: Record<string, string>,
  upstreamBody: any
): void {
  try {
    const obsMode = SettingsRepository.getObservabilityMode();
    if (obsMode !== "off") {
      const debugFile = path.join(getDefaultDataDir(), "debug_failed_request.json");
      fs.writeFileSync(
        debugFile,
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            url,
            status,
            error: cleanErrText,
            headers: sanitizeHeaders(outgoingHeaders),
            body: obsMode === "all" ? upstreamBody : undefined,
          },
          null,
          2
        ),
        { encoding: "utf8", mode: 0o600 }
      );
    }
  } catch {}
}

function logResponsesSuccess(
  context: ProviderRequestContext,
  usage: any,
  fullText: string,
  ttftMs: number | undefined,
  upstreamUrl: string,
  outgoingHeaders: Record<string, string>,
  upstreamBody: any,
  upstreamStatus: number,
  upstreamHeaders: Headers,
  clientResponse: { status: number; headers: Record<string, string>; body: any },
  toolCallIds: string[],
  reasoningText: string
): void {
  const { req, startTime, requestId, targetModel, rawModel, clientTool, rtkStats, is1mContext, account, provider, reqTag = "PROXY" } = context;
  const providerId = provider?.id || "unknown";
  const durationMs = Date.now() - startTime;
  const inTok = usage?.prompt_tokens ?? rtkStats?.compressedTokens ?? 0;
  const outTok = usage?.completion_tokens ?? Math.max(1, Math.ceil((fullText || "").length / 4));
  const cachedTokens = usage?.prompt_tokens_details?.cached_tokens ?? 0;
  const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens ?? 0;

  if (toolCallIds.length > 0 && reasoningText) {
    reasoningCache.saveMultiple(toolCallIds, providerId, targetModel, reasoningText);
  }

  const calculatedCost = ResponseLogger.logSuccess({
    requestId,
    startTime,
    durationMs,
    clientTool: clientTool || "generic",
    rawModel: rawModel || targetModel,
    targetModel,
    providerId,
    accountId: account?.id,
    accountName: account?.name,
    apiKeyId: context.apiKeyId,
    apiKeyName: context.apiKeyName,
    promptTokens: inTok,
    completionTokens: outTok,
    cachedTokens,
    cacheCreationTokens: 0,
    reasoningTokens,
    tokensSavedByRtk: rtkStats?.tokensSaved || 0,
    ...(ttftMs !== undefined ? { ttftMs } : {}),
    is1mContext,
    requestHeaders: (req?.headers as Record<string, string>) || {},
    requestBody: req?.body,
    providerRequest: { url: upstreamUrl, headers: outgoingHeaders, body: upstreamBody },
    providerResponse: {
      status: upstreamStatus,
      headers: Object.fromEntries(upstreamHeaders.entries()),
    },
    clientResponse,
  });

  const doneMsg = formatDoneLine({
    durationMs,
    ...(ttftMs !== undefined ? { ttftMs } : {}),
    promptTokens: inTok,
    completionTokens: outTok,
    cachedTokens,
    tokensSaved: rtkStats?.tokensSaved || 0,
    cost: calculatedCost,
  });
  const doneSummary = `${providerId}/${targetModel} · ${doneMsg}`;
  logger.line(reqTag, LogSymbol.USAGE, doneSummary);

  appendStructuredLog({
    id: requestId,
    timestamp: Date.now(),
    level: "info",
    category: "proxy",
    message: doneSummary,
    requestId,
    reqTag,
    gateway: {
      clientTool,
      route: req?.path || "/v1/responses",
      requestedModel: rawModel,
      actualModel: targetModel,
      providerId,
      accountId: account?.id,
      accountName: account?.name,
      statusCode: 200,
      durationMs,
      ...(ttftMs !== undefined ? { ttftMs } : {}),
      tokens: {
        prompt: inTok,
        completion: outTok,
        cached: cachedTokens,
        cacheCreation: 0,
        reasoning: reasoningTokens,
        savedByRtk: rtkStats?.tokensSaved || 0,
      },
      cost: calculatedCost,
    },
    rawText: doneSummary,
  });
}

function buildUsageFromResponses(u: any): any | undefined {
  if (!u || typeof u !== "object") return undefined;
  const inTok = u.input_tokens ?? 0;
  const outTok = u.output_tokens ?? 0;
  const cached = u.input_tokens_details?.cached_tokens ?? 0;
  const reasoning = u.output_tokens_details?.reasoning_tokens ?? 0;
  return {
    prompt_tokens: inTok,
    completion_tokens: outTok,
    total_tokens: u.total_tokens ?? inTok + outTok,
    ...(cached ? { prompt_tokens_details: { cached_tokens: cached } } : {}),
    ...(reasoning ? { completion_tokens_details: { reasoning_tokens: reasoning } } : {}),
  };
}

function extractOpenAiFromJsonResponse(resp: any, targetModel: string, requestId: string): {
  openAiResp: any;
  fullText: string;
  reasoningText: string;
  toolCallIds: string[];
  usage: any;
} {
  let fullText = "";
  let reasoningText = "";
  const toolCalls: any[] = [];
  const outputItems = Array.isArray(resp?.output) ? resp.output : [];

  for (const item of outputItems) {
    if (!item || typeof item !== "object") continue;
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (typeof c?.text === "string") fullText += c.text;
      }
    } else if (item.type === "reasoning") {
      const sum = Array.isArray(item.summary) ? item.summary.map((s: any) => s?.text || "").join("") : "";
      const txt = Array.isArray(item.content) ? item.content.map((c: any) => c?.text || "").join("") : "";
      reasoningText += sum || txt;
    } else if (item.type === "function_call") {
      const callId = item.call_id || item.id || `call_${Date.now()}_${toolCalls.length}`;
      toolCalls.push({
        id: callId,
        type: "function",
        function: {
          name: item.name || "",
          arguments: typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments ?? {}),
        },
      });
    }
  }

  if (!fullText && typeof resp?.output_text === "string") {
    fullText = resp.output_text;
  }

  const usage = buildUsageFromResponses(resp?.usage);
  const incompleteReason = resp?.status === "incomplete" ? (resp?.incomplete_details?.reason === "content_filter" ? "content_filter" : "length") : undefined;
  const openAiResp: any = {
    id: resp?.id ? `chatcmpl-${resp.id}` : `chatcmpl-${requestId}`,
    object: "chat.completion",
    created: resp?.created_at || Math.floor(Date.now() / 1000),
    model: targetModel,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: fullText || null,
          ...(reasoningText ? { reasoning_content: reasoningText } : {}),
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: incompleteReason || (toolCalls.length > 0 ? "tool_calls" : "stop"),
      },
    ],
    ...(usage ? { usage } : {}),
  };

  return {
    openAiResp,
    fullText,
    reasoningText,
    toolCallIds: toolCalls.map((tc) => tc.id).filter(Boolean),
    usage,
  };
}

export async function executeResponsesUpstream(
  context: ProviderRequestContext,
  provider: IProvider
): Promise<ModelCallResult> {
  const { res, clientFormat, isPanel, requestId, targetModel, startTime, reqTag = "PROXY", account } = context;
  if (!res) {
    return { ok: false, status: 500, error: "Response object is required" };
  }

  const upstreamBody = provider.transformRequestBody(context);
  applyCacheControlPolicy(upstreamBody, provider.id, targetModel, "openai-responses");

  const upstreamUrl = provider.buildUrl(context);
  const outgoingHeaders = await provider.buildHeaders(context);
  if (!outgoingHeaders["Accept"] && !outgoingHeaders["accept"]) {
    outgoingHeaders["Accept"] = upstreamBody?.stream !== false ? "text/event-stream" : "application/json";
  }

  const globalSettings = SettingsRepository.getEndpointSettings();
  if (globalSettings.customHeaders) {
    for (const [k, v] of Object.entries(globalSettings.customHeaders)) {
      if (!outgoingHeaders[k]) outgoingHeaders[k] = v;
    }
  }

  const effectiveProxy =
    (context.provider?.proxyUrl && context.provider.proxyUrl.trim()) ||
    (globalSettings.proxyUrl && globalSettings.proxyUrl.trim()) ||
    "";

  const upstreamTimeoutMs = Number(process.env.MAPIGATE_UPSTREAM_TIMEOUT_MS) || 180_000;
  const effectiveTimeoutMs = Math.max(upstreamTimeoutMs, 1_800_000);
  const timeoutSignal = AbortSignal.timeout(effectiveTimeoutMs);
  const abortController = context.abortController || new AbortController();
  const combinedSignal = (AbortSignal as any).any
    ? (AbortSignal as any).any([abortController.signal, timeoutSignal])
    : abortController.signal;

  const clientStreaming = context.body?.stream !== false && !isPanel;

  let upstreamRes: globalThis.Response;
  try {
    const fetchOptions: any = {
      method: "POST",
      headers: outgoingHeaders,
      body: JSON.stringify(upstreamBody),
      signal: combinedSignal,
    };
    upstreamRes = await executeUpstreamFetch(upstreamUrl, fetchOptions, effectiveProxy);

    if (!upstreamRes.ok && upstreamRes.status === 401 && provider.handleAuthRefresh) {
      const refreshed = await provider.handleAuthRefresh(context, upstreamRes.status);
      if (refreshed) {
        await upstreamRes.body?.cancel().catch(() => {});
        const refreshedHeaders = await provider.buildHeaders(context);
        if (!refreshedHeaders["Accept"] && !refreshedHeaders["accept"]) {
          refreshedHeaders["Accept"] = outgoingHeaders["Accept"];
        }
        if (globalSettings.customHeaders) {
          for (const [k, v] of Object.entries(globalSettings.customHeaders)) {
            if (!refreshedHeaders[k]) refreshedHeaders[k] = v;
          }
        }
        upstreamRes = await executeUpstreamFetch(
          upstreamUrl,
          { ...fetchOptions, headers: refreshedHeaders },
          effectiveProxy
        );
      }
    }
  } catch (err: any) {
    if (timeoutSignal.aborted) {
      return { ok: false, status: 504, error: `Upstream gateway timeout after ${upstreamTimeoutMs / 1000}s`, accountName: account?.name || account?.id };
    }
    if (abortController.signal.aborted) {
      return { ok: false, status: 499, error: "Client aborted request", accountName: account?.name || account?.id };
    }
    const cleanErr = sanitizeErrorMessage(err?.message || String(err));
    return { ok: false, status: 502, error: cleanErr, text: cleanErr, accountName: account?.name || account?.id };
  }

  if (!upstreamRes.ok) {
    const errText = await upstreamRes.text().catch(() => "");
    const cleanErrText = sanitizeErrorMessage(errText || `${provider.id} upstream failed (${upstreamRes.status})`);
    writeDebugFailedRequest(upstreamUrl, upstreamRes.status, cleanErrText, outgoingHeaders, upstreamBody);

    const durationMs = Date.now() - startTime;
    const accSuffix = account?.name ? ` (account: '${account.name}')` : "";
    logger.errorLine(
      reqTag,
      LogSymbol.ERROR,
      `UPSTREAM ERROR ${upstreamRes.status} · ${provider.id}/${targetModel}${accSuffix} · ${durationMs}ms [req: ${requestId}]\n    ${cleanErrText.slice(0, 500)}`
    );

    return {
      ok: false,
      status: upstreamRes.status,
      error: cleanErrText,
      text: cleanErrText,
      accountName: account?.name || account?.id,
    };
  }

  const contentType = (upstreamRes.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json") && !contentType.includes("text/event-stream")) {
    const rawJsonText = await upstreamRes.text();
    let parsedJson: any;
    try {
      parsedJson = JSON.parse(rawJsonText);
    } catch {
      return { ok: false, status: 502, error: `Invalid JSON from ${provider.id} /responses`, accountName: account?.name || account?.id };
    }

    if (parsedJson?.error) {
      const msg = sanitizeErrorMessage(parsedJson.error?.message || JSON.stringify(parsedJson.error));
      return { ok: false, status: Number(parsedJson.error?.status || 502) || 502, error: msg, accountName: account?.name || account?.id };
    }

    const { openAiResp, fullText, reasoningText, toolCallIds, usage } = extractOpenAiFromJsonResponse(
      parsedJson,
      targetModel,
      requestId
    );

    if (isPanel) {
      return { ok: true, status: 200, json: openAiResp, text: fullText, logged: false, modelUsed: targetModel };
    }

    const outBody =
      clientFormat === "responses"
        ? parsedJson
        : formatOpenAiResponseForClient(openAiResp, clientFormat, requestId);

    if (clientStreaming) {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
      if (clientFormat === "responses") {
        res.write(`event: response.created\ndata: ${JSON.stringify({ type: "response.created", response: { id: parsedJson.id || `resp_${requestId}`, status: "in_progress" } })}\n\n`);
        if (fullText) {
          res.write(`event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: fullText })}\n\n`);
        }
        res.write(`event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: parsedJson })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      } else {
        const msg = openAiResp.choices?.[0]?.message || {};
        const chunk = {
          id: openAiResp.id,
          object: "chat.completion.chunk",
          created: openAiResp.created,
          model: targetModel,
          choices: [{ index: 0, delta: { role: "assistant", ...(msg.content ? { content: msg.content } : {}), ...(msg.tool_calls ? { tool_calls: msg.tool_calls.map((tc: any, idx: number) => ({ index: idx, ...tc })) } : {}) }, finish_reason: openAiResp.choices?.[0]?.finish_reason || "stop" }],
          ...(usage ? { usage } : {}),
        };
        if (clientFormat === "anthropic") {
          const anthState = AnthropicAdapter.createStreamState(`msg_${requestId}`, context.body?.tools);
          res.write(`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: `msg_${requestId}`, type: "message", role: "assistant", model: targetModel, content: [] } })}\n\n`);
          anthState.messageStartSent = true;
          for (const ev of AnthropicAdapter.openAiChunkToAnthropicEvent(chunk, `msg_${requestId}`, anthState)) res.write(ev);
          for (const ev of AnthropicAdapter.finalizeStream(anthState)) res.write(ev);
        } else {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          res.write("data: [DONE]\n\n");
        }
        res.end();
      }
    } else {
      res.status(200).json(outBody);
    }

    logResponsesSuccess(
      context,
      usage,
      fullText,
      Date.now() - startTime,
      upstreamUrl,
      outgoingHeaders,
      upstreamBody,
      upstreamRes.status,
      upstreamRes.headers,
      { status: 200, headers: { "content-type": clientStreaming ? "text/event-stream" : "application/json" }, body: outBody },
      toolCallIds,
      reasoningText
    );
    return { ok: true, status: 200, json: outBody, text: fullText, logged: true, modelUsed: targetModel };
  }

  const reader = upstreamRes.body?.getReader();
  if (!reader) {
    return { ok: false, status: 502, error: `Empty response stream from ${provider.id}`, accountName: account?.name || account?.id };
  }

  const decoder = new TextDecoder();
  const responseId = `chatcmpl-${requestId}`;
  const created = Math.floor(Date.now() / 1000);
  const anthropicState =
    clientStreaming && clientFormat === "anthropic"
      ? AnthropicAdapter.createStreamState(`msg_${requestId}`, context.body?.tools)
      : undefined;

  let headersSent = false;
  let ttftMs: number | undefined;
  let sentDone = false;

  const ensureSseHeaders = () => {
    if (headersSent || res.writableEnded || res.destroyed) return;
    headersSent = true;
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    if (clientFormat === "anthropic" && anthropicState && !anthropicState.messageStartSent) {
      anthropicState.messageStartSent = true;
      res.write(
        `event: message_start\ndata: ${JSON.stringify({
          type: "message_start",
          message: { id: `msg_${requestId}`, type: "message", role: "assistant", model: targetModel, content: [] },
        })}\n\n`
      );
    }
  };

  const emitOpenAiChunk = (chunk: any) => {
    if (!clientStreaming || res.writableEnded || res.destroyed) return;
    ensureSseHeaders();
    if (clientFormat === "anthropic" && anthropicState) {
      for (const ev of AnthropicAdapter.openAiChunkToAnthropicEvent(chunk, `msg_${requestId}`, anthropicState)) {
        res.write(ev);
      }
    } else if (clientFormat === "openai") {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
  };

  let buffer = "";
  let currentEventName = "";
  let fullText = "";
  let reasoningText = "";
  let sentRole = false;
  let toolIdx = 0;
  const toolIndexByItemId = new Map<string, number>();
  const toolMetaByItemId = new Map<string, { id: string; name: string; args: string }>();
  let completedResponse: any = null;
  let usage: any = undefined;
  let terminalFinishReason: string | undefined;
  let upstreamError: { status: number; message: string } | null = null;
  const pendingPassthroughEvents: string[] = [];
  let sawValidStreamEvent = false;

  const flushPendingPassthrough = () => {
    if (!clientStreaming || clientFormat !== "responses" || pendingPassthroughEvents.length === 0) return;
    ensureSseHeaders();
    if (!res.writableEnded && !res.destroyed) {
      for (const block of pendingPassthroughEvents) {
        res.write(block);
      }
    }
    pendingPassthroughEvents.length = 0;
  };

  const handleEvent = (ev: any, rawBlock?: string) => {
    const t = ev?.type;
    if (!t) return;

    if (t === "response.failed" || t === "error") {
      if (headersSent && clientStreaming && clientFormat === "responses" && rawBlock && !res.writableEnded && !res.destroyed) {
        res.write(rawBlock);
      }
      const errObj = ev.response?.error || ev.error || ev;
      const message =
        errObj?.message ||
        ev?.detail ||
        (typeof errObj === "string" ? errObj : `${provider.id} response failed`);
      const status = Number(errObj?.status || errObj?.statusCode || 502) || 502;
      upstreamError = { status, message: sanitizeErrorMessage(message) };
      return;
    }

    sawValidStreamEvent = true;
    if (ttftMs === undefined && (t === "response.output_text.delta" || t === "response.reasoning_summary_text.delta" || t === "response.output_item.added")) {
      ttftMs = Date.now() - startTime;
    }

    if (clientStreaming && clientFormat === "responses" && rawBlock) {
      if (headersSent) {
        if (!res.writableEnded && !res.destroyed) res.write(rawBlock);
      } else {
        pendingPassthroughEvents.push(rawBlock);
        flushPendingPassthrough();
      }
    }

    if (t === "response.output_text.delta" && typeof ev.delta === "string") {
      fullText += ev.delta;
      const delta: any = { content: ev.delta };
      if (!sentRole) { delta.role = "assistant"; sentRole = true; }
      emitOpenAiChunk({ id: responseId, object: "chat.completion.chunk", created, model: targetModel, choices: [{ index: 0, delta, finish_reason: null }] });
    } else if (t === "response.reasoning_summary_text.delta" && typeof ev.delta === "string") {
      reasoningText += ev.delta;
      const delta: any = { reasoning_content: ev.delta };
      if (!sentRole) { delta.role = "assistant"; sentRole = true; }
      emitOpenAiChunk({ id: responseId, object: "chat.completion.chunk", created, model: targetModel, choices: [{ index: 0, delta, finish_reason: null }] });
    } else if (t === "response.output_item.added" && ev.item?.type === "function_call") {
      const itemId = ev.item.id || `item_${toolIdx}`;
      const callId = ev.item.call_id || itemId;
      const name = ev.item.name || "";
      const idx = toolIndexByItemId.has(itemId) ? toolIndexByItemId.get(itemId)! : toolIdx++;
      toolIndexByItemId.set(itemId, idx);
      toolMetaByItemId.set(itemId, { id: callId, name, args: "" });
      const delta: any = { tool_calls: [{ index: idx, id: callId, type: "function", function: { name, arguments: "" } }] };
      if (!sentRole) { delta.role = "assistant"; sentRole = true; }
      emitOpenAiChunk({ id: responseId, object: "chat.completion.chunk", created, model: targetModel, choices: [{ index: 0, delta, finish_reason: null }] });
    } else if (t === "response.function_call_arguments.delta" && typeof ev.delta === "string") {
      const idx = toolIndexByItemId.get(ev.item_id);
      if (idx !== undefined) {
        const meta = toolMetaByItemId.get(ev.item_id);
        if (meta) meta.args += ev.delta;
        emitOpenAiChunk({
          id: responseId,
          object: "chat.completion.chunk",
          created,
          model: targetModel,
          choices: [{ index: 0, delta: { tool_calls: [{ index: idx, function: { arguments: ev.delta } }] }, finish_reason: null }],
        });
      }
    } else if (t === "response.completed" || t === "response.incomplete") {
      completedResponse = ev.response || ev;
      usage = buildUsageFromResponses(completedResponse?.usage);
      if (t === "response.incomplete") {
        const reason = completedResponse?.incomplete_details?.reason;
        terminalFinishReason = reason === "content_filter" ? "content_filter" : "length";
      }
    }
  };

  const processLine = (rawLine: string) => {
    const line = rawLine.trim();
    if (!line) {
      currentEventName = "";
      return;
    }
    if (line.startsWith("event:")) {
      currentEventName = line.slice(6).trim();
      return;
    }
    if (!line.startsWith("data:")) return;
    const dataStr = line.slice(5).trim();
    if (!dataStr) return;
    if (dataStr === "[DONE]") {
      if (clientStreaming && clientFormat === "responses" && headersSent && !res.writableEnded && !res.destroyed) {
        sentDone = true;
        res.write("data: [DONE]\n\n");
      }
      currentEventName = "";
      return;
    }
    try {
      const parsed = JSON.parse(dataStr);
      if (!parsed.type && currentEventName) {
        parsed.type = currentEventName;
      }
      const evName = currentEventName || parsed.type;
      const rawBlock = evName ? `event: ${evName}\ndata: ${dataStr}\n\n` : `data: ${dataStr}\n\n`;
      currentEventName = "";
      handleEvent(parsed, rawBlock);
    } catch {
      currentEventName = "";
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const rawLine of lines) processLine(rawLine);
    if (upstreamError) break;
  }
  if (!upstreamError && buffer.trim()) processLine(buffer);

  if (upstreamError) {
    const err: { status: number; message: string } = upstreamError;
    if (!sawValidStreamEvent && !headersSent) {
      return { ok: false, status: err.status, error: err.message, text: err.message, accountName: account?.name || account?.id };
    }
    if (headersSent && !res.writableEnded && !res.destroyed) {
      res.end();
    }
    return { ok: false, status: err.status, error: err.message, text: err.message, accountName: account?.name || account?.id };
  }

  const toolCallIds = Array.from(toolMetaByItemId.values()).map((tc) => tc.id).filter(Boolean);

  if (clientStreaming) {
    if (clientFormat === "responses") {
      flushPendingPassthrough();
      ensureSseHeaders();
      if (!res.writableEnded && !res.destroyed) {
        if (!sentDone) res.write("data: [DONE]\n\n");
        res.end();
      }
    } else {
      const finishReason = terminalFinishReason || (toolMetaByItemId.size > 0 ? "tool_calls" : "stop");
      emitOpenAiChunk({
        id: responseId,
        object: "chat.completion.chunk",
        created,
        model: targetModel,
        choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
        ...(usage ? { usage } : {}),
      });
      if (!res.writableEnded && !res.destroyed) {
        if (clientFormat === "anthropic" && anthropicState) {
          for (const ev of AnthropicAdapter.finalizeStream(anthropicState)) res.write(ev);
        } else {
          res.write("data: [DONE]\n\n");
        }
        res.end();
      }
    }
    logResponsesSuccess(
      context,
      usage,
      fullText,
      ttftMs,
      upstreamUrl,
      outgoingHeaders,
      upstreamBody,
      upstreamRes.status,
      upstreamRes.headers,
      { status: 200, headers: { "content-type": "text/event-stream" }, body: { text: "Stream completed" } },
      toolCallIds,
      reasoningText
    );
    return { ok: true, status: 200, logged: true, modelUsed: targetModel, text: fullText };
  }

  const toolCalls = Array.from(toolMetaByItemId.values()).map((tc) => ({
    id: tc.id,
    type: "function",
    function: { name: tc.name, arguments: tc.args || "{}" },
  }));
  const openAiResp: any = {
    id: responseId,
    object: "chat.completion",
    created,
    model: targetModel,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: fullText || null,
          ...(reasoningText ? { reasoning_content: reasoningText } : {}),
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: terminalFinishReason || (toolCalls.length > 0 ? "tool_calls" : "stop"),
      },
    ],
    ...(usage ? { usage } : {}),
  };

  if (isPanel) {
    return { ok: true, status: 200, json: openAiResp, text: fullText, logged: false, modelUsed: targetModel };
  }

  const outBody =
    clientFormat === "responses"
      ? completedResponse || convertOpenAiResponseToResponsesApi(openAiResp)
      : formatOpenAiResponseForClient(openAiResp, clientFormat, requestId);

  res.status(200).json(outBody);
  logResponsesSuccess(
    context,
    usage,
    fullText,
    ttftMs,
    upstreamUrl,
    outgoingHeaders,
    upstreamBody,
    upstreamRes.status,
    upstreamRes.headers,
    { status: 200, headers: { "content-type": "application/json" }, body: outBody },
    toolCallIds,
    reasoningText
  );
  return { ok: true, status: 200, json: outBody, text: fullText, logged: true, modelUsed: targetModel };
}
