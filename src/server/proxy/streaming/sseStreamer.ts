import type { Response } from "express";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import { OpenAiAdapter } from "../../../core/adapters/openAiAdapter.js";
import {
  createResponsesStreamState,
  openAiChunkToResponsesEvents,
  finalizeResponsesStream,
} from "../../../core/adapters/responsesAdapter.js";
import {
  toolSchemaMap,
  createStreamToolCallTracker,
  normalizeStreamToolCallIndices,
  type StreamToolCallTracker,
} from "../../../core/adapters/helpers/index.js";
import { logger, LogSymbol } from "../../../shared/logger.js";
import type { ProviderRequestContext, IProvider, StreamExecutionResult } from "../../../providers/core/types.js";
import { createStreamTrackingState, extractTokensFromChunk, recordStreamToolCall } from "./streamState.js";
import { reasoningCache } from "../../../core/caching/reasoningCache.js";
import { getRegistryProvider } from "../../../providers/core/metadataRegistry.js";

function ensureStreamToolCallIds(chunk: any, tracker: StreamToolCallTracker): boolean {
  if (!chunk?.choices?.length) return false;
  let changed = false;

  for (const choice of chunk.choices) {
    const calls = choice?.delta?.tool_calls;
    if (!Array.isArray(calls) || calls.length === 0) continue;
    if (normalizeStreamToolCallIndices(calls, tracker)) {
      changed = true;
    }
  }

  return changed;
}

export async function pipeSseStream(
  upstreamRes: globalThis.Response,
  clientRes: Response,
  context: ProviderRequestContext,
  provider: IProvider
): Promise<StreamExecutionResult> {
  const { reqTag, startTime, requestId, clientFormat, targetFormat, targetModel, rtkStats } = context;
  const reader = upstreamRes.body?.getReader();
  if (!reader) {
    throw new Error("Upstream response body is not readable");
  }

  const state = createStreamTrackingState(rtkStats.compressedTokens || 0);
  const requestTools = context.req?.body?.tools || context.body?.tools;
  const toolSchemas = toolSchemaMap(requestTools);
  const toolNameSet = new Set(toolSchemas.keys());

  const regMeta = provider?.id ? getRegistryProvider(provider.id) : undefined;
  const shouldRescue = Boolean(
    (context.provider as any)?.rescueInlineTools ?? regMeta?.rescueInlineTools
  );
  const rescueToolNames = shouldRescue ? toolNameSet : undefined;
  const requestSafeguards = context.req?.body?.safeguards || context.body?.safeguards;

  const openAiToAnthropicState = AnthropicAdapter.createStreamState(
    requestId,
    requestTools,
    requestSafeguards
  );
  const responsesState =
    clientFormat === "responses" ? createResponsesStreamState(requestId, rescueToolNames) : null;
  const toolCallTracker = createStreamToolCallTracker();
  const claudeToOpenAiState = AnthropicAdapter.createAnthropicToOpenAiState(rescueToolNames);
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEventName = "";
  let clientDisconnected = false;
  let doneSent = false;

  const onClose = () => {
    clientDisconnected = true;
    reader.cancel().catch(() => {});
    context.abortController?.abort();
  };

  if (typeof clientRes?.once === "function") {
    clientRes.once("close", onClose);
  }

  const ensureHeaders = () => {
    if (!clientRes.headersSent && !clientRes.writableEnded && !clientRes.destroyed) {
      clientRes.setHeader("Content-Type", "text/event-stream");
      clientRes.setHeader("Cache-Control", "no-cache");
      clientRes.setHeader("Connection", "keep-alive");
      clientRes.setHeader("X-Accel-Buffering", "no");
      clientRes.flushHeaders?.();
    }
  };

  const safeWrite = (data: string): boolean => {
    if (clientDisconnected || clientRes?.writableEnded || clientRes?.destroyed) return false;
    try {
      ensureHeaders();
      return clientRes.write(data);
    } catch {
      return false;
    }
  };

  try {
    // 1. Read and verify initial chunk before committing HTTP headers to client
    let firstRead: Awaited<ReturnType<typeof reader.read>>;
    try {
      firstRead = await reader.read();
    } catch (readErr) {
      reader.cancel().catch(() => {});
      throw readErr;
    }
    const firstReadDone = firstRead.done;
    const firstReadValue = firstRead.value;

    if (firstReadDone && !firstReadValue) {
      reader.cancel().catch(() => {});
      throw new Error("Upstream stream ended immediately without sending any data");
    }

    // Pre-decode initial chunk to detect inline error events / rate limits before sending headers
    if (firstReadValue) {
      const preview = decoder.decode(firstReadValue, { stream: true });
      const previewLines = preview.split("\n");
      for (const pl of previewLines) {
        const trimmed = pl.trim();
        if (trimmed.startsWith("data:") && trimmed.includes('"error"')) {
          try {
            const parsed = JSON.parse(trimmed.slice(5).trim());
            if (parsed && parsed.error) {
              const msg = parsed.error.message || "Upstream stream error in initial chunk";
              const isRateLimit =
                parsed.error.code === "rate_limit_exceeded" ||
                parsed.error.type?.includes("rate_limit") ||
                msg.toLowerCase().includes("rate limit") ||
                msg.toLowerCase().includes("quota");
              const errObj: any = new Error(msg);
              errObj.status = isRateLimit ? 429 : 502;
              errObj.isRateLimit = isRateLimit;
              throw errObj;
            }
          } catch (e: any) {
            if (e.status) {
              reader.cancel().catch(() => {});
              throw e;
            }
          }
        }
      }
      buffer = preview;
    }

    if (clientFormat === "anthropic" && targetFormat === "openai") {
      safeWrite(
        `event: message_start\ndata: ${JSON.stringify({
          type: "message_start",
          message: {
            id: `msg_${requestId}`,
            type: "message",
            role: "assistant",
            model: targetModel,
            content: [],
          },
        })}\n\n`
      );
      openAiToAnthropicState.messageStartSent = true;
    }

    let isFirstIteration = true;

    while (true) {
      if (clientDisconnected || clientRes?.writableEnded || clientRes?.destroyed) break;

      if (!isFirstIteration) {
        const { done, value } = await reader.read();
        if (done || clientDisconnected) break;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
        }
      } else {
        isFirstIteration = false;
      }

      if (!state.ttftMs) {
        state.ttftMs = Date.now() - startTime;
        logger.line(reqTag || "STREAM", LogSymbol.STREAM, `TTFT ${state.ttftMs}ms · streaming chunks...`);
      }

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const rawLine of lines) {
        if (clientDisconnected || clientRes?.writableEnded || clientRes?.destroyed) break;
        const line = rawLine.trim();
        if (!line) continue;

        if (line.startsWith("event:")) {
          currentEventName = line.slice(6).trim();
          continue;
        }

        if (!line.startsWith("data:")) continue;
        const dataStr = line.slice(5).trim();

        if (dataStr === "[DONE]") {
          currentEventName = "";
          if (clientFormat === "openai") {
            doneSent = true;
            safeWrite("data: [DONE]\n\n");
          }
          continue;
        }

        try {
          let jsonChunk = JSON.parse(dataStr);
          let chunkModified = false;

          if (provider.transformResponseChunk) {
            jsonChunk = provider.transformResponseChunk(jsonChunk, context);
            chunkModified = true;
          }

          if (jsonChunk?.choices?.[0]?.delta?.tool_calls) {
            OpenAiAdapter.repairToolCalls(jsonChunk.choices[0].delta.tool_calls, toolSchemas);
            chunkModified = true;
          }

          if (ensureStreamToolCallIds(jsonChunk, toolCallTracker)) {
            chunkModified = true;
          }

          extractTokensFromChunk(jsonChunk, state);

          // Detect and record tool calls in stream chunks (with deduplication tracking)
          recordStreamToolCall(jsonChunk, state, (toolName) => {
            logger.line(reqTag || "STREAM", "🛠️", `Tool invoked: ${toolName}`);
          });

          if (clientFormat === "responses" && responsesState) {
            if (targetFormat === "claude") {
              const eventPayload = {
                type: currentEventName || jsonChunk.type,
                ...jsonChunk,
              };
              currentEventName = "";
              const openAiChunks = AnthropicAdapter.anthropicChunkToOpenAiEvent(
                eventPayload,
                requestId,
                claudeToOpenAiState
              );
              for (const ch of openAiChunks) {
                const trimmed = ch.trim();
                if (trimmed.startsWith("data:") && !trimmed.includes("[DONE]")) {
                  try {
                    const parsedOpenAiChunk = JSON.parse(trimmed.slice(5).trim());
                    const responsesEvents = openAiChunkToResponsesEvents(parsedOpenAiChunk, responsesState);
                    for (const ev of responsesEvents) {
                      safeWrite(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`);
                    }
                  } catch {}
                }
              }
            } else {
              currentEventName = "";
              const responsesEvents = openAiChunkToResponsesEvents(jsonChunk, responsesState);
              for (const ev of responsesEvents) {
                safeWrite(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`);
              }
            }
          } else if (clientFormat === "anthropic" && targetFormat === "openai") {
            currentEventName = "";
            const anthropicEvents = AnthropicAdapter.openAiChunkToAnthropicEvent(
              jsonChunk,
              requestId,
              openAiToAnthropicState
            );
            for (const ev of anthropicEvents) {
              safeWrite(ev);
            }
          } else if (clientFormat === "openai" && targetFormat === "claude") {
            const eventPayload = {
              type: currentEventName || jsonChunk.type,
              ...jsonChunk,
            };
            currentEventName = "";
            const openAiChunks = AnthropicAdapter.anthropicChunkToOpenAiEvent(
              eventPayload,
              requestId,
              claudeToOpenAiState
            );
            for (const ch of openAiChunks) {
              if (ch.includes("[DONE]")) {
                doneSent = true;
              }
              safeWrite(ch);
            }
          } else {
            if (currentEventName && clientFormat === "anthropic") {
              safeWrite(`event: ${currentEventName}\n`);
            }
            currentEventName = "";
            if (provider.transformResponseChunk || chunkModified) {
              safeWrite(`data: ${JSON.stringify(jsonChunk)}\n\n`);
            } else {
              safeWrite(rawLine + "\n\n");
            }
          }
        } catch {
          currentEventName = "";
          safeWrite(rawLine + "\n\n");
        }
      }
    }

    if (!clientDisconnected && !clientRes?.writableEnded && !clientRes?.destroyed) {
      if (clientFormat === "responses" && responsesState) {
        const finalEvents = finalizeResponsesStream(responsesState);
        for (const ev of finalEvents) {
          safeWrite(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`);
        }
        safeWrite("data: [DONE]\n\n");
      } else if (clientFormat === "anthropic" && targetFormat === "openai") {
        const finalEvents = AnthropicAdapter.finalizeStream(openAiToAnthropicState);
        for (const ev of finalEvents) {
          safeWrite(ev);
        }
      } else if (clientFormat === "openai" && !doneSent) {
        doneSent = true;
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

  if (logger.isDebugEnabled()) {
    logger.debug(
      "STREAM",
      `[${reqTag || "STREAM"}] Completed in ${Date.now() - startTime}ms (TTFT: ${state.ttftMs || 0}ms, tools: ${state.tools.length})`
    );
  }

  if (state.capturedToolCallIds.length > 0 && state.capturedReasoningText) {
    reasoningCache.saveMultiple(
      state.capturedToolCallIds,
      provider.id,
      targetModel,
      state.capturedReasoningText
    );
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
