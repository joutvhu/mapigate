import type { ProviderRequestContext, ModelCallResult } from "../../core/types.js";
import { executeUpstreamFetch } from "../../../server/proxy/proxyDispatcher.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import {
  createResponsesStreamState,
  openAiChunkToResponsesEvents,
  finalizeResponsesStream,
  convertOpenAiResponseToResponsesApi,
} from "../../../core/adapters/responsesAdapter.js";
import { extractSessionId } from "../../../server/proxy/executorHelpers.js";
import { ResponseLogger } from "../../../server/proxy/responseLogger.js";
import { SettingsRepository } from "../../../storage/repositories/settingsRepo.js";
import { logger, LogSymbol, formatDoneLine } from "../../../shared/logger.js";
import { buildCommandCodeHeaders } from "./headers.js";
import {
  CommandCodeUpstreamError,
  buildCommandCodePayload,
  commandCodeLineToOpenAiChunks,
  createCommandCodeStreamState,
} from "./converter.js";

const DEFAULT_COMMAND_CODE_URL = "https://api.commandcode.ai/alpha/generate";
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  payloadStr: string,
  proxyUrl: string,
  signal?: AbortSignal
): Promise<{ response?: Response; errorResult?: ModelCallResult }> {
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await executeUpstreamFetch(
      url,
      { method: "POST", headers, body: payloadStr, signal },
      proxyUrl
    );
    if (res.ok) return { response: res };

    const errText = await res.text().catch(() => "");
    let status = res.status;
    let message = errText || res.statusText;
    try {
      const parsed = JSON.parse(errText);
      const errObj = parsed?.error || parsed;
      message = errObj?.message || parsed?.message || message;
      status = Number(errObj?.code || errObj?.statusCode || status) || status;
    } catch {}

    if (RETRYABLE_STATUSES.has(status) && attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    return { errorResult: { ok: false, status, error: message } };
  }
  return { errorResult: { ok: false, status: 503, error: "CommandCode upstream unavailable" } };
}

function recordCommandCodeSuccess(
  context: ProviderRequestContext,
  targetModel: string,
  usage: any,
  text: string,
  clientResponse: { status: number; headers: Record<string, string>; body: any }
): void {
  const { req, startTime, requestId, reqTag = "CMC" } = context;
  const durationMs = Date.now() - startTime;
  const promptTokens = usage?.prompt_tokens || context.rtkStats?.compressedTokens || 0;
  const completionTokens = usage?.completion_tokens || Math.ceil(text.length / 4);
  const cachedTokens = usage?.prompt_tokens_details?.cached_tokens || 0;
  const cacheCreationTokens = usage?.cache_creation_input_tokens || 0;
  const calculatedCost = ResponseLogger.logSuccess({
    requestId,
    startTime,
    durationMs,
    clientTool: context.clientTool || "generic",
    rawModel: context.rawModel || targetModel,
    targetModel,
    providerId: "commandcode",
    accountId: context.account?.id,
    accountName: context.account?.name,
    apiKeyId: context.apiKeyId,
    apiKeyName: context.apiKeyName,
    promptTokens,
    completionTokens,
    cachedTokens,
    cacheCreationTokens,
    reasoningTokens: 0,
    tokensSavedByRtk: context.rtkStats?.tokensSaved || 0,
    is1mContext: context.is1mContext,
    requestHeaders: (req?.headers as Record<string, string>) || {},
    requestBody: req?.body,
    clientResponse,
  });
  const doneMsg = formatDoneLine({
    durationMs,
    promptTokens,
    completionTokens,
    tokensSaved: context.rtkStats?.tokensSaved || 0,
    cost: calculatedCost,
  });
  logger.line(reqTag, LogSymbol.SUCCESS, `commandcode/${targetModel} · ${doneMsg}`);
}

export async function executeCommandCode(context: ProviderRequestContext): Promise<ModelCallResult> {
  const { req, res, clientFormat, isPanel, requestId } = context;
  if (!res) {
    return { ok: false, status: 500, error: "Response object is required for CommandCode execution" };
  }

  const targetModel = context.targetModel || "deepseek/deepseek-v4-pro";
  const rawBody = context.body || req?.body || {};
  const openAiBody = clientFormat === "anthropic" ? AnthropicAdapter.anthropicToOpenAi(rawBody) : rawBody;
  const isStreaming = rawBody.stream !== false && !isPanel;

  const globalSettings = SettingsRepository.getEndpointSettings();
  const mergedCustomHeaders: Record<string, string> = {
    ...(globalSettings.customHeaders || {}),
    ...(context.provider?.customHeaders || {}),
  };

  const sessionId = extractSessionId(req, rawBody);
  const payload = buildCommandCodePayload(targetModel, openAiBody, sessionId);
  const apiKey = (context.account?.rawApiKey || "").trim();
  const headers = buildCommandCodeHeaders({
    apiKey,
    sessionId: payload.threadId,
    accept: "text/event-stream",
    customHeaders: mergedCustomHeaders,
  });

  const targetUrl =
    (context.account?.providerSpecificData?.baseUrl || "").trim() ||
    (context.provider?.baseUrl || "").trim() ||
    DEFAULT_COMMAND_CODE_URL;
  const effectiveProxy = (context.provider?.proxyUrl || "").trim() || (globalSettings.proxyUrl || "").trim();

  const abortController = new AbortController();
  const onClientClose = () => abortController.abort();
  if (typeof res?.once === "function") res.once("close", onClientClose);

  try {
    const { response: upstreamRes, errorResult } = await fetchWithRetry(
      targetUrl,
      headers,
      JSON.stringify(payload),
      effectiveProxy,
      abortController.signal
    );
    if (errorResult || !upstreamRes) return errorResult || { ok: false, status: 502, error: "CommandCode failed" };

    const reader = upstreamRes.body?.getReader();
    if (!reader) return { ok: false, status: 502, error: "Empty response stream from CommandCode" };

    const decoder = new TextDecoder();
    const state = createCommandCodeStreamState(targetModel, requestId);

    if (isStreaming) {
      let headersSent = false;
      const anthropicState =
        clientFormat === "anthropic" ? AnthropicAdapter.createStreamState(`msg_${requestId}`, openAiBody.tools) : undefined;
      const responsesState = clientFormat === "responses" ? createResponsesStreamState(requestId) : undefined;

      const ensureSseHeaders = () => {
        if (headersSent || res.writableEnded || res.destroyed) return;
        headersSent = true;
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
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

      const writeChunk = (chunk: any) => {
        if (res.writableEnded || res.destroyed) return;
        ensureSseHeaders();
        if (clientFormat === "responses" && responsesState) {
          for (const ev of openAiChunkToResponsesEvents(chunk, responsesState)) {
            res.write(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`);
          }
        } else if (clientFormat === "anthropic" && anthropicState) {
          for (const ev of AnthropicAdapter.openAiChunkToAnthropicEvent(chunk, `msg_${requestId}`, anthropicState)) {
            res.write(ev);
          }
        } else {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      };

      let buffer = "";
      let contentText = "";
      let lastUsage: any = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            for (const c of commandCodeLineToOpenAiChunks(line, state)) {
              if (c.choices?.[0]?.delta?.content) contentText += c.choices[0].delta.content;
              if (c.usage) lastUsage = c.usage;
              writeChunk(c);
            }
          }
        }
        if (buffer.trim()) {
          for (const c of commandCodeLineToOpenAiChunks(buffer.trim(), state)) {
            if (c.choices?.[0]?.delta?.content) contentText += c.choices[0].delta.content;
            if (c.usage) lastUsage = c.usage;
            writeChunk(c);
          }
        }
      } catch (err: any) {
        const status = err instanceof CommandCodeUpstreamError ? err.statusCode : 502;
        if (headersSent && !res.writableEnded && !res.destroyed) res.end();
        return { ok: false, status, error: err?.message || "CommandCode stream error" };
      }

      if (!res.writableEnded && !res.destroyed) {
        ensureSseHeaders();
        if (clientFormat === "responses" && responsesState) {
          for (const ev of finalizeResponsesStream(responsesState)) {
            res.write(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`);
          }
          res.write("data: [DONE]\n\n");
        } else if (clientFormat === "anthropic" && anthropicState) {
          for (const ev of AnthropicAdapter.finalizeStream(anthropicState)) res.write(ev);
        } else {
          res.write("data: [DONE]\n\n");
        }
        res.end();
      }

      recordCommandCodeSuccess(context, targetModel, lastUsage, contentText, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: { text: "Stream completed" },
      });
      return { ok: true, status: 200, logged: true, modelUsed: targetModel, text: contentText };
    }

    // Non-streaming / isPanel
    let buffer = "";
    let fullText = "";
    let reasoningText = "";
    const toolCallsByIndex = new Map<number, { id: string; type: "function"; function: { name: string; arguments: string } }>();
    let finishReason = "stop";
    let usage: any = undefined;

    const consumeLine = (line: string) => {
      for (const c of commandCodeLineToOpenAiChunks(line, state)) {
        const d = c.choices?.[0]?.delta;
        if (d?.content) fullText += d.content;
        if (d?.reasoning_content) reasoningText += d.reasoning_content;
        if (Array.isArray(d?.tool_calls)) {
          for (const tc of d.tool_calls) {
            const existing = toolCallsByIndex.get(tc.index) || {
              id: tc.id || `call_${tc.index}`,
              type: "function" as const,
              function: { name: tc.function?.name || "", arguments: "" },
            };
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.function.name = tc.function.name;
            if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
            toolCallsByIndex.set(tc.index, existing);
          }
        }
        if (c.choices?.[0]?.finish_reason) finishReason = c.choices[0].finish_reason;
        if (c.usage) usage = c.usage;
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) consumeLine(line);
      }
      if (buffer.trim()) consumeLine(buffer.trim());
    } catch (err: any) {
      const status = err instanceof CommandCodeUpstreamError ? err.statusCode : 502;
      return { ok: false, status, error: err?.message || "CommandCode upstream error" };
    }

    const openAiResp: any = {
      id: state.responseId,
      object: "chat.completion",
      created: state.created,
      model: targetModel,
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: fullText || null,
          ...(reasoningText ? { reasoning_content: reasoningText } : {}),
          ...(toolCallsByIndex.size > 0 ? { tool_calls: Array.from(toolCallsByIndex.values()) } : {}),
        },
        finish_reason: finishReason,
      }],
      ...(usage ? { usage } : {}),
    };

    if (isPanel) {
      return { ok: true, status: 200, json: openAiResp, text: fullText, logged: false, modelUsed: targetModel };
    }

    const outBody =
      clientFormat === "anthropic"
        ? AnthropicAdapter.openAiResponseToAnthropic(openAiResp)
        : clientFormat === "responses"
        ? convertOpenAiResponseToResponsesApi(openAiResp)
        : openAiResp;

    res.status(200).json(outBody);
    recordCommandCodeSuccess(context, targetModel, usage, fullText, {
      status: 200,
      headers: { "content-type": "application/json" },
      body: outBody,
    });
    return { ok: true, status: 200, json: outBody, text: fullText, logged: true, modelUsed: targetModel };
  } finally {
    if (typeof res?.removeListener === "function") res.removeListener("close", onClientClose);
  }
}
