import type { ProviderRequestContext, ModelCallResult } from "../../core/types.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import { ResponseLogger } from "../../../server/proxy/responseLogger.js";
import { logger, LogSymbol, formatDoneLine } from "../../../shared/logger.js";

export interface StreamKiroCreateResponseParams {
  upstreamRes: globalThis.Response;
  res: any;
  context: ProviderRequestContext;
  rawModel: string;
  targetModel: string;
  responseId: string;
  created: number;
}

export async function streamKiroCreateResponse(
  params: StreamKiroCreateResponseParams
): Promise<ModelCallResult> {
  const { upstreamRes, res, context, rawModel, targetModel, responseId, created } = params;
  const { req, clientFormat, startTime, requestId, reqTag = "KIRO" } = context;

  if (!res.headersSent) {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
  }

  const reader = upstreamRes.body?.getReader();
  if (!reader) {
    return { ok: false, status: 502, error: "Empty stream body from Kiro /v1/responses" };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let promptTokens = context.rtkStats?.compressedTokens || 0;
  let completionTokens = 0;
  let sawToolUse = false;
  let toolIdxCounter = 0;
  let clientDisconnected = false;
  const itemIdToToolIdx = new Map<string, number>();

  const onClose = () => {
    clientDisconnected = true;
    reader.cancel().catch(() => {});
  };
  if (typeof res?.once === "function") {
    res.once("close", onClose);
  }

  const anthropicState =
    clientFormat === "anthropic" ? AnthropicAdapter.createStreamState(`msg_${requestId}`) : undefined;

  const writeOpenAiOrAnthropicChunk = (chunk: any) => {
    if (clientDisconnected || res?.writableEnded || res?.destroyed) return;
    if (clientFormat === "anthropic" && anthropicState) {
      const events = AnthropicAdapter.openAiChunkToAnthropicEvent(chunk, `msg_${requestId}`, anthropicState);
      for (const ev of events) res.write(ev);
    } else {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
  };

  try {
    while (true) {
      if (clientDisconnected) break;
      const { done, value } = await reader.read();
      if (done || clientDisconnected) break;
      if (!value) continue;

      const decoded = decoder.decode(value, { stream: true });
      if (clientFormat === "responses" && !clientDisconnected && !res?.writableEnded && !res?.destroyed) {
        res.write(decoded);
      }

      buffer += decoded;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr || jsonStr === "[DONE]") continue;

        let ev: any;
        try {
          ev = JSON.parse(jsonStr);
        } catch {
          continue;
        }

        if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") {
          fullText += ev.delta;
          if (clientFormat !== "responses") {
            writeOpenAiOrAnthropicChunk({
              id: responseId,
              object: "chat.completion.chunk",
              created,
              model: rawModel,
              choices: [{ index: 0, delta: { content: ev.delta }, finish_reason: null }],
            });
          }
        } else if (ev.type === "response.reasoning_summary_text.delta" && typeof ev.delta === "string") {
          if (clientFormat !== "responses") {
            writeOpenAiOrAnthropicChunk({
              id: responseId,
              object: "chat.completion.chunk",
              created,
              model: rawModel,
              choices: [{ index: 0, delta: { reasoning_content: ev.delta }, finish_reason: null }],
            });
          }
        } else if (ev.type === "response.output_item.added" && ev.item?.type === "function_call") {
          sawToolUse = true;
          const idx = toolIdxCounter++;
          if (ev.item.id) itemIdToToolIdx.set(ev.item.id, idx);
          if (clientFormat !== "responses") {
            writeOpenAiOrAnthropicChunk({
              id: responseId,
              object: "chat.completion.chunk",
              created,
              model: rawModel,
              choices: [
                {
                  index: 0,
                  delta: {
                    tool_calls: [
                      {
                        index: idx,
                        id: ev.item.call_id || ev.item.id || `call_${Date.now()}_${idx}`,
                        type: "function",
                        function: { name: ev.item.name || "", arguments: "" },
                      },
                    ],
                  },
                  finish_reason: null,
                },
              ],
            });
          }
        } else if (ev.type === "response.function_call_arguments.delta" && typeof ev.delta === "string") {
          const idx = (ev.item_id && itemIdToToolIdx.get(ev.item_id)) ?? 0;
          if (clientFormat !== "responses") {
            writeOpenAiOrAnthropicChunk({
              id: responseId,
              object: "chat.completion.chunk",
              created,
              model: rawModel,
              choices: [
                {
                  index: 0,
                  delta: { tool_calls: [{ index: idx, function: { arguments: ev.delta } }] },
                  finish_reason: null,
                },
              ],
            });
          }
        } else if (ev.type === "response.completed") {
          const u = ev.response?.usage;
          if (u) {
            if (typeof u.input_tokens === "number") promptTokens = u.input_tokens;
            if (typeof u.output_tokens === "number") completionTokens = u.output_tokens;
          }
        }
      }
    }

    if (!clientDisconnected && !res?.writableEnded && !res?.destroyed) {
      if (clientFormat !== "responses") {
        writeOpenAiOrAnthropicChunk({
          id: responseId,
          object: "chat.completion.chunk",
          created,
          model: rawModel,
          choices: [{ index: 0, delta: {}, finish_reason: sawToolUse ? "tool_calls" : "stop" }],
        });
        if (clientFormat === "anthropic" && anthropicState) {
          const finalEvents = AnthropicAdapter.finalizeStream(anthropicState);
          for (const ev of finalEvents) res.write(ev);
        } else {
          res.write("data: [DONE]\n\n");
        }
      }
      res.end();
    }
  } catch (streamErr: any) {
    if (!res.headersSent) {
      return { ok: false, status: 502, error: streamErr.message };
    }
    if (!res.writableEnded && !res.destroyed) res.end();
    return { ok: false, status: 502, error: streamErr.message };
  } finally {
    if (typeof res?.off === "function") {
      res.off("close", onClose);
    }
  }

  const durationMs = Date.now() - startTime;
  if (!completionTokens) completionTokens = Math.ceil(fullText.length / 4);
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
  });
  const doneMsg = formatDoneLine({
    durationMs,
    promptTokens,
    completionTokens,
    tokensSaved: context.rtkStats?.tokensSaved || 0,
    cost: calculatedCost,
  });
  logger.line(reqTag, LogSymbol.SUCCESS, `kiro/${targetModel} (responses) · ${doneMsg}`);

  return { ok: true, status: 200, isStream: true, modelUsed: targetModel };
}
