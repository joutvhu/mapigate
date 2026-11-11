import type { ModelCallResult, ProviderRequestContext } from "../../core/types.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import { executeUpstreamFetch } from "../../../server/proxy/proxyDispatcher.js";
import { ResponseLogger } from "../../../server/proxy/responseLogger.js";
import { SettingsRepository } from "../../../storage/repositories/settingsRepo.js";
import { logger, LogSymbol, formatDoneLine } from "../../../shared/logger.js";
import {
  OPENCODE_GO_RESPONSES_URL,
  isOpenCodeGoResponsesModel,
  buildOpenCodeGoResponsesPayload,
} from "./responsesPayload.js";

export { OPENCODE_GO_RESPONSES_URL, isOpenCodeGoResponsesModel, buildOpenCodeGoResponsesPayload };

function recordResponsesSuccess(
  context: ProviderRequestContext,
  targetModel: string,
  usage: any,
  fullText: string,
  clientResponse: { status: number; headers: Record<string, string>; body: any }
): void {
  const { req, startTime, requestId, reqTag = "OCG" } = context;
  const durationMs = Date.now() - startTime;
  const inTok = usage?.prompt_tokens || context.rtkStats?.compressedTokens || 0;
  const outTok = usage?.completion_tokens || Math.ceil(fullText.length / 4);
  const calculatedCost = ResponseLogger.logSuccess({
    requestId,
    startTime,
    durationMs,
    clientTool: context.clientTool || "generic",
    rawModel: context.rawModel || targetModel,
    targetModel,
    providerId: "opencode-go",
    accountId: context.account?.id,
    accountName: context.account?.name,
    apiKeyId: context.apiKeyId,
    apiKeyName: context.apiKeyName,
    promptTokens: inTok,
    completionTokens: outTok,
    cachedTokens: 0,
    cacheCreationTokens: 0,
    reasoningTokens: 0,
    tokensSavedByRtk: context.rtkStats?.tokensSaved || 0,
    is1mContext: context.is1mContext,
    requestHeaders: (req?.headers as Record<string, string>) || {},
    requestBody: req?.body,
    clientResponse,
  });
  const doneMsg = formatDoneLine({
    durationMs,
    promptTokens: inTok,
    completionTokens: outTok,
    tokensSaved: context.rtkStats?.tokensSaved || 0,
    cost: calculatedCost,
  });
  logger.line(reqTag, LogSymbol.SUCCESS, `opencode-go/${targetModel} · ${doneMsg}`);
}

export async function executeOpenCodeGoResponses(
  context: ProviderRequestContext,
  targetUrl: string,
  baseHeaders: Record<string, string>
): Promise<ModelCallResult> {
  const { req, res, clientFormat, isPanel, requestId, targetModel } = context;
  if (!res) return { ok: false, status: 500, error: "Response object is required" };

  const globalSettings = SettingsRepository.getEndpointSettings();
  const headers: Record<string, string> = { ...baseHeaders };
  if (globalSettings.customHeaders) {
    for (const [k, v] of Object.entries(globalSettings.customHeaders)) {
      if (!headers[k]) headers[k] = v;
    }
  }
  const proxyUrl = (context.provider?.proxyUrl || "").trim() || (globalSettings.proxyUrl || "").trim();

  const rawBody = context.body || req?.body || {};
  const isStreaming = rawBody.stream !== false && !isPanel;
  const payload = buildOpenCodeGoResponsesPayload(rawBody, targetModel, clientFormat);

  const abortController = new AbortController();
  const onClose = () => abortController.abort();
  if (typeof res?.once === "function") res.once("close", onClose);

  try {
    const upstreamRes = await executeUpstreamFetch(
      targetUrl,
      { method: "POST", headers, body: JSON.stringify(payload), signal: abortController.signal },
      proxyUrl
    );

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text().catch(() => "");
      return { ok: false, status: upstreamRes.status, error: errText || `OpenCode Go responses failed (${upstreamRes.status})` };
    }

    const reader = upstreamRes.body?.getReader();
    if (!reader) return { ok: false, status: 502, error: "Empty response stream from OpenCode Go" };

    const decoder = new TextDecoder();
    const responseId = `chatcmpl-${requestId}`;
    const created = Math.floor(Date.now() / 1000);
    const anthropicState =
      isStreaming && clientFormat === "anthropic"
        ? AnthropicAdapter.createStreamState(`msg_${requestId}`, rawBody.tools)
        : undefined;

    let headersSent = false;
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

    const emitOpenAiChunk = (chunk: any) => {
      if (!isStreaming || res.writableEnded || res.destroyed) return;
      ensureSseHeaders();
      if (clientFormat === "anthropic" && anthropicState) {
        for (const ev of AnthropicAdapter.openAiChunkToAnthropicEvent(chunk, `msg_${requestId}`, anthropicState)) {
          res.write(ev);
        }
      } else {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    };

    let buffer = "";
    let fullText = "";
    let reasoningText = "";
    let sentRole = false;
    let toolIdx = 0;
    const toolIndexByItemId = new Map<string, number>();
    const toolMetaByItemId = new Map<string, { id: string; name: string; args: string }>();
    let completedResponse: any = null;
    let usage: any = undefined;
    let upstreamError: { status: number; message: string } | null = null;

    const handleEvent = (ev: any) => {
      const t = ev?.type;
      if (!t) return;

      if (t === "response.failed" || t === "error") {
        const errObj = ev.response?.error || ev.error || ev;
        const message = errObj?.message || (typeof errObj === "string" ? errObj : "OpenCode Go response failed");
        const status = Number(errObj?.status || errObj?.statusCode || 502) || 502;
        upstreamError = { status, message };
        return;
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
      } else if (t === "response.completed") {
        completedResponse = ev.response || ev;
        const u = completedResponse?.usage;
        if (u) {
          const inTok = u.input_tokens ?? 0;
          const outTok = u.output_tokens ?? 0;
          usage = { prompt_tokens: inTok, completion_tokens: outTok, total_tokens: inTok + outTok };
        }
      }
    };

    const processLine = (rawLine: string) => {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) return;
      const dataStr = line.slice(5).trim();
      if (!dataStr || dataStr === "[DONE]") return;
      try { handleEvent(JSON.parse(dataStr)); } catch {}
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunkStr = decoder.decode(value, { stream: true });
      buffer += chunkStr;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const rawLine of lines) processLine(rawLine);

      if (upstreamError) break;
      if (isStreaming && clientFormat === "responses") {
        ensureSseHeaders();
        if (!res.writableEnded && !res.destroyed) res.write(chunkStr);
      }
    }
    if (!upstreamError && buffer.trim()) processLine(buffer);

    if (upstreamError) {
      const err: { status: number; message: string } = upstreamError;
      if (headersSent && !res.writableEnded && !res.destroyed) res.end();
      return { ok: false, status: err.status, error: err.message };
    }

    if (isStreaming) {
      if (clientFormat === "responses") {
        if (!res.writableEnded && !res.destroyed) res.end();
      } else {
        const finishReason = toolMetaByItemId.size > 0 ? "tool_calls" : "stop";
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
      recordResponsesSuccess(context, targetModel, usage, fullText, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: { text: "Stream completed" },
      });
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
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: fullText || null,
          ...(reasoningText ? { reasoning_content: reasoningText } : {}),
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
      }],
      ...(usage ? { usage } : {}),
    };

    if (isPanel) {
      return { ok: true, status: 200, json: openAiResp, text: fullText, logged: false, modelUsed: targetModel };
    }

    const outBody =
      clientFormat === "responses" && completedResponse
        ? completedResponse
        : clientFormat === "anthropic"
        ? AnthropicAdapter.openAiResponseToAnthropic(openAiResp)
        : openAiResp;

    res.status(200).json(outBody);
    recordResponsesSuccess(context, targetModel, usage, fullText, {
      status: 200,
      headers: { "content-type": "application/json" },
      body: outBody,
    });
    return { ok: true, status: 200, json: outBody, text: fullText, logged: true, modelUsed: targetModel };
  } finally {
    if (typeof res?.removeListener === "function") res.removeListener("close", onClose);
  }
}
