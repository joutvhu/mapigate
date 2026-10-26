import type { Response } from "express";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import {
  createResponsesStreamState,
  openAiChunkToResponsesEvents,
  finalizeResponsesStream,
} from "../../../core/adapters/responsesAdapter.js";
import { decodeEventStreamChunk } from "../../../providers/runtime/bedrock/eventStream.js";
import { logger, LogSymbol } from "../../../shared/logger.js";
import type { ProviderRequestContext, IProvider, StreamExecutionResult } from "../../../providers/types.js";
import { createStreamTrackingState, recordStreamToolCall } from "./streamState.js";

export async function pipeBedrockEventStream(
  upstreamRes: globalThis.Response,
  clientRes: Response,
  context: ProviderRequestContext,
  _provider: IProvider
): Promise<StreamExecutionResult> {
  const { reqTag, startTime, requestId, clientFormat, rtkStats } = context;
  const reader = upstreamRes.body?.getReader();
  if (!reader) {
    throw new Error("Bedrock upstream response body is not readable");
  }

  const state = createStreamTrackingState(rtkStats.compressedTokens || 0);
  let residualBuffer: any = new Uint8Array(0);
  const bedrockOpenAiState = AnthropicAdapter.createAnthropicToOpenAiState();
  const responsesState =
    clientFormat === "responses" ? createResponsesStreamState(requestId) : undefined;

  let clientDisconnected = false;
  const onClose = () => {
    clientDisconnected = true;
    reader.cancel().catch(() => {});
  };

  if (typeof clientRes?.once === "function") {
    clientRes.once("close", onClose);
  }

  const safeWrite = (data: string): boolean => {
    if (clientDisconnected || clientRes?.writableEnded || clientRes?.destroyed) return false;
    try {
      return clientRes.write(data);
    } catch {
      return false;
    }
  };

  try {
    while (true) {
      if (clientDisconnected || clientRes?.writableEnded || clientRes?.destroyed) break;

      const { done, value } = await reader.read();
      if (done || clientDisconnected) break;
      if (!value) continue;

      if (!state.ttftMs) {
        state.ttftMs = Date.now() - startTime;
        logger.line(reqTag || "STREAM", LogSymbol.STREAM, `TTFT ${state.ttftMs}ms · streaming chunks...`);
      }

      const { frames, remainder } = decodeEventStreamChunk(value, residualBuffer);
      residualBuffer = remainder;

      for (const frame of frames) {
        if (clientDisconnected || clientRes?.writableEnded || clientRes?.destroyed) break;
        if (!frame.payload?.bytes) continue;
        try {
          const rawEventString = Buffer.from(frame.payload.bytes, "base64").toString("utf8");
          const eventObj = JSON.parse(rawEventString);

          if (eventObj.type === "message_start" && eventObj.message?.usage) {
            const u = eventObj.message.usage;
            if (u.input_tokens) state.promptTokens = u.input_tokens;
            if (u.cache_read_input_tokens) state.cachedTokens = u.cache_read_input_tokens;
            if (u.cache_creation_input_tokens) state.cacheCreationTokens = u.cache_creation_input_tokens;
          } else if (eventObj.type === "message_delta" && eventObj.usage) {
            if (eventObj.usage.output_tokens) state.completionTokens = eventObj.usage.output_tokens;
          }

          // Detect and record tool calls in stream chunks (with deduplication tracking)
          recordStreamToolCall(eventObj, state, (toolName) => {
            logger.line(reqTag || "STREAM", "🛠️", `Tool invoked: ${toolName}`);
          });

          if (eventObj.delta?.text) {
            if (state.capturedResponseText.length < 4000) {
              state.capturedResponseText += eventObj.delta.text;
            }
          }

          if (clientFormat === "responses" && responsesState) {
            const openAiChunks = AnthropicAdapter.anthropicChunkToOpenAiEvent(
              eventObj,
              requestId,
              bedrockOpenAiState
            );
            for (const ch of openAiChunks) {
              const trimmed = ch.trim();
              if (trimmed.startsWith("data:") && !trimmed.includes("[DONE]")) {
                try {
                  const parsed = JSON.parse(trimmed.slice(5).trim());
                  const responsesEvents = openAiChunkToResponsesEvents(parsed, responsesState);
                  for (const ev of responsesEvents) {
                    safeWrite(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`);
                  }
                } catch {}
              }
            }
          } else if (clientFormat === "anthropic") {
            safeWrite(`event: ${eventObj.type || "content_block_delta"}\ndata: ${rawEventString}\n\n`);
          } else {
            const openAiChunks = AnthropicAdapter.anthropicChunkToOpenAiEvent(
              eventObj,
              requestId,
              bedrockOpenAiState
            );
            for (const ch of openAiChunks) {
              safeWrite(ch);
            }
          }
        } catch {}
      }
    }

    if (!clientDisconnected && !clientRes?.writableEnded && !clientRes?.destroyed) {
      if (clientFormat === "responses" && responsesState) {
        const finalEvents = finalizeResponsesStream(responsesState);
        for (const ev of finalEvents) {
          safeWrite(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`);
        }
        safeWrite("data: [DONE]\n\n");
      } else if (clientFormat === "openai") {
        safeWrite("data: [DONE]\n\n");
      }
      try {
        clientRes.end();
      } catch {}
    }
  } finally {
    if (typeof clientRes?.removeListener === "function") {
      clientRes.removeListener("close", onClose);
    }
  }

  if (state.completionTokens === 0 && state.capturedResponseText.length > 0) {
    state.completionTokens = Math.max(1, Math.round(state.capturedResponseText.length / 4));
  }

  return {
    inputTokens: state.promptTokens,
    outputTokens: state.completionTokens,
    cachedTokens: state.cachedTokens,
    cacheCreationTokens: state.cacheCreationTokens,
    reasoningTokens: state.reasoningTokens,
    tools: state.tools,
    ttftMs: state.ttftMs || (Date.now() - startTime),
    totalDurationMs: Date.now() - startTime,
  };
}
