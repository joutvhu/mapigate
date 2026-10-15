import type { Response } from "express";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import { OpenAiAdapter } from "../../../core/adapters/openAiAdapter.js";
import {
  createResponsesStreamState,
  openAiChunkToResponsesEvents,
  finalizeResponsesStream,
} from "../../../core/adapters/responsesAdapter.js";
import { toolSchemaMap } from "../../../core/adapters/helpers/index.js";
import { logger, LogSymbol } from "../../../shared/logger.js";
import type { ProviderRequestContext, IProvider, StreamExecutionResult } from "../../../providers/types.js";
import { createStreamTrackingState, extractTokensFromChunk, recordStreamToolCall } from "./streamState.js";
import { reasoningCache } from "../../../core/caching/reasoningCache.js";

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
  const openAiToAnthropicState = AnthropicAdapter.createStreamState(requestId, requestTools);
  const responsesState = clientFormat === "responses" ? createResponsesStreamState(requestId) : null;

  if (clientFormat === "anthropic" && targetFormat === "openai") {
    clientRes.write(
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

  const claudeToOpenAiState = AnthropicAdapter.createAnthropicToOpenAiState();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEventName = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    if (!state.ttftMs) {
      state.ttftMs = Date.now() - startTime;
      logger.line(reqTag || "STREAM", LogSymbol.STREAM, `TTFT ${state.ttftMs}ms · streaming chunks...`);
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line.startsWith("event:")) {
        currentEventName = line.slice(6).trim();
        if (clientFormat === "anthropic" && targetFormat === "claude") {
          clientRes.write(rawLine + "\n");
        }
        continue;
      }

      if (!line.startsWith("data:")) continue;
      const dataStr = line.slice(5).trim();

      if (dataStr === "[DONE]") {
        if (clientFormat === "openai") {
          clientRes.write("data: [DONE]\n\n");
        }
        continue;
      }

      try {
        let jsonChunk = JSON.parse(dataStr);

        if (provider.transformResponseChunk) {
          jsonChunk = provider.transformResponseChunk(jsonChunk, context);
        }

        if (jsonChunk?.choices?.[0]?.delta?.tool_calls) {
          OpenAiAdapter.repairToolCalls(jsonChunk.choices[0].delta.tool_calls, toolSchemas);
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
                    clientRes.write(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`);
                  }
                } catch {}
              }
            }
          } else {
            const responsesEvents = openAiChunkToResponsesEvents(jsonChunk, responsesState);
            for (const ev of responsesEvents) {
              clientRes.write(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`);
            }
          }
        } else if (clientFormat === "anthropic" && targetFormat === "openai") {
          const anthropicEvents = AnthropicAdapter.openAiChunkToAnthropicEvent(
            jsonChunk,
            requestId,
            openAiToAnthropicState
          );
          for (const ev of anthropicEvents) {
            clientRes.write(ev);
          }
        } else if (clientFormat === "openai" && targetFormat === "claude") {
          const eventPayload = {
            type: currentEventName || jsonChunk.type,
            ...jsonChunk,
          };
          const openAiChunks = AnthropicAdapter.anthropicChunkToOpenAiEvent(
            eventPayload,
            requestId,
            claudeToOpenAiState
          );
          for (const ch of openAiChunks) {
            clientRes.write(ch);
          }
        } else {
          if (currentEventName && clientFormat === "anthropic") {
            clientRes.write(`event: ${currentEventName}\n`);
          }
          if (provider.transformResponseChunk) {
            clientRes.write(`data: ${JSON.stringify(jsonChunk)}\n\n`);
          } else {
            clientRes.write(rawLine + "\n\n");
          }
        }
      } catch {
        clientRes.write(rawLine + "\n\n");
      }
    }
  }

  if (clientFormat === "responses" && responsesState) {
    const finalEvents = finalizeResponsesStream(responsesState);
    for (const ev of finalEvents) {
      clientRes.write(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`);
    }
  } else if (clientFormat === "anthropic" && targetFormat === "openai") {
    const finalEvents = AnthropicAdapter.finalizeStream(openAiToAnthropicState);
    for (const ev of finalEvents) {
      clientRes.write(ev);
    }
  }

  clientRes.end();

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
