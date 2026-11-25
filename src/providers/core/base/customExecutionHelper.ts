import type { Response } from "express";
import type { ModelCallResult, ProviderRequestContext } from "../types.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import {
  convertOpenAiResponseToResponsesApi,
  createResponsesStreamState,
  finalizeResponsesStream,
  openAiChunkToResponsesEvents,
} from "../../../core/adapters/responsesAdapter.js";
import { ResponseLogger } from "../../../server/proxy/responseLogger.js";
import { formatDoneLine, logger, LogSymbol } from "../../../shared/logger.js";

export function formatOpenAiResponseForClient(
  openAiJson: any,
  clientFormat: "openai" | "anthropic" | "responses" | string,
  requestId: string
): any {
  if (clientFormat === "responses") {
    return convertOpenAiResponseToResponsesApi(openAiJson);
  }
  if (clientFormat === "anthropic") {
    return AnthropicAdapter.openAiResponseToAnthropic(openAiJson, requestId);
  }
  return openAiJson;
}

export interface OpenAiClientStreamWriter {
  writeChunk(openAiChunk: any): void;
  finalize(finishReason?: string, usage?: any): void;
  hasHeadersSent(): boolean;
}

export function createOpenAiClientStreamWriter(
  res: Response,
  clientFormat: "openai" | "anthropic" | "responses" | string,
  requestId: string,
  targetModel: string,
  tools?: any[]
): OpenAiClientStreamWriter {
  const anthropicState =
    clientFormat === "anthropic"
      ? AnthropicAdapter.createStreamState(`msg_${requestId}`, tools)
      : undefined;
  const responsesState =
    clientFormat === "responses" ? createResponsesStreamState(requestId) : undefined;
  let headersSent = Boolean(res.headersSent);

  const ensureHeaders = () => {
    if (res.writableEnded || res.destroyed) return;
    if (!res.headersSent) {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
    }
    headersSent = true;
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

  return {
    hasHeadersSent: () => headersSent,
    writeChunk(openAiChunk: any) {
      if (res.writableEnded || res.destroyed) return;
      ensureHeaders();
      if (clientFormat === "responses" && responsesState) {
        const events = openAiChunkToResponsesEvents(openAiChunk, responsesState);
        for (const ev of events) {
          res.write(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`);
        }
      } else if (clientFormat === "anthropic" && anthropicState) {
        for (const ev of AnthropicAdapter.openAiChunkToAnthropicEvent(openAiChunk, `msg_${requestId}`, anthropicState)) {
          res.write(ev);
        }
      } else {
        res.write(`data: ${JSON.stringify(openAiChunk)}\n\n`);
      }
    },
    finalize(finishReason?: string, usage?: any) {
      if (res.writableEnded || res.destroyed) return;
      ensureHeaders();
      if (finishReason) {
        const endChunk: any = {
          id: `chatcmpl-${requestId}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: targetModel,
          choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
          ...(usage ? { usage } : {}),
        };
        if (clientFormat === "responses" && responsesState) {
          for (const ev of openAiChunkToResponsesEvents(endChunk, responsesState)) {
            res.write(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`);
          }
        } else if (clientFormat === "anthropic" && anthropicState) {
          for (const ev of AnthropicAdapter.openAiChunkToAnthropicEvent(endChunk, `msg_${requestId}`, anthropicState)) {
            res.write(ev);
          }
        } else {
          res.write(`data: ${JSON.stringify(endChunk)}\n\n`);
        }
      }

      if (clientFormat === "responses" && responsesState) {
        for (const ev of finalizeResponsesStream(responsesState)) {
          res.write(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`);
        }
        res.write("data: [DONE]\n\n");
      } else if (clientFormat === "anthropic" && anthropicState) {
        for (const ev of AnthropicAdapter.finalizeStream(anthropicState)) {
          res.write(ev);
        }
      } else {
        res.write("data: [DONE]\n\n");
      }
      res.end();
    },
  };
}

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
