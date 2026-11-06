import { type AnthropicToOpenAiStreamState, createAnthropicToOpenAiState } from "./types.js";

/**
 * Translates Anthropic SSE event to OpenAI SSE chunk format
 */
export function anthropicChunkToOpenAiEvent(
  event: any,
  requestId: string,
  state?: AnthropicToOpenAiStreamState,
  streamStatesMap?: Map<string, AnthropicToOpenAiStreamState>
): string[] {
  if (!event || !event.type) return [];
  const created = Math.floor(Date.now() / 1000);
  const chunkId = `chatcmpl-${requestId}`;
  const events: string[] = [];

  let streamState = state;
  if (!streamState && streamStatesMap) {
    streamState = streamStatesMap.get(requestId);
    if (!streamState) {
      streamState = createAnthropicToOpenAiState();
      streamStatesMap.set(requestId, streamState);
      if (streamStatesMap.size > 500) {
        const oldestKey = streamStatesMap.keys().next().value;
        if (oldestKey) streamStatesMap.delete(oldestKey);
      }
    }
  }

  if (!streamState) {
    streamState = createAnthropicToOpenAiState();
  }

  if (event.type === "message_start") {
    const message = event.message;
    if (message?.usage) {
      streamState.promptTokens =
        (message.usage.input_tokens || 0) +
        (message.usage.cache_creation_input_tokens || 0) +
        (message.usage.cache_read_input_tokens || 0);
      streamState.cachedTokens = message.usage.cache_read_input_tokens || 0;
      streamState.cacheCreationTokens = message.usage.cache_creation_input_tokens || 0;
    }
    if (message?.role) {
      // Can emit empty role: assistant chunk if desired
    }
  } else if (event.type === "content_block_delta") {
    if (event.delta?.type === "text_delta" && event.delta.text) {
      const rescuer = streamState.toolRescuer;
      const { calls, cleanText } = rescuer
        ? rescuer.feed(event.delta.text)
        : { calls: [], cleanText: event.delta.text };
      if (calls.length > 0) {
        for (const c of calls) {
          const toolIdx = streamState.toolCallIndex++;
          events.push(
            `data: ${JSON.stringify({
              id: chunkId,
              object: "chat.completion.chunk",
              created,
              choices: [
                {
                  index: 0,
                  delta: {
                    tool_calls: [
                      {
                        index: toolIdx,
                        id: `call_${Date.now()}_${toolIdx}`,
                        type: "function",
                        function: {
                          name: c.name,
                          arguments: c.arguments,
                        },
                      },
                    ],
                  },
                  finish_reason: null,
                },
              ],
            })}\n\n`
          );
        }
      }
      if (cleanText) {
        events.push(
          `data: ${JSON.stringify({
            id: chunkId,
            object: "chat.completion.chunk",
            created,
            choices: [
              {
                index: 0,
                delta: { content: cleanText },
                finish_reason: null,
              },
            ],
          })}\n\n`
        );
      }
    } else if (event.delta?.type === "thinking_delta" && event.delta.thinking) {
      events.push(
        `data: ${JSON.stringify({
          id: chunkId,
          object: "chat.completion.chunk",
          created,
          choices: [
            {
              index: 0,
              delta: { reasoning_content: event.delta.thinking },
              finish_reason: null,
            },
          ],
        })}\n\n`
      );
    } else if (event.delta?.type === "input_json_delta" && event.delta.partial_json) {
      const rawIndex = typeof event.index === "number" ? event.index : 0;
      let toolIdx = streamState.blockIndexToToolCallIndex.get(rawIndex);
      if (toolIdx === undefined) {
        toolIdx = streamState.toolCallIndex++;
        streamState.blockIndexToToolCallIndex.set(rawIndex, toolIdx);
      }

      events.push(
        `data: ${JSON.stringify({
          id: chunkId,
          object: "chat.completion.chunk",
          created,
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: toolIdx,
                    function: { arguments: event.delta.partial_json },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        })}\n\n`
      );
    }
  } else if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
    const rawIndex = typeof event.index === "number" ? event.index : 0;
    let toolIdx = streamState.blockIndexToToolCallIndex.get(rawIndex);
    if (toolIdx === undefined) {
      toolIdx = streamState.toolCallIndex++;
      streamState.blockIndexToToolCallIndex.set(rawIndex, toolIdx);
    }

    events.push(
      `data: ${JSON.stringify({
        id: chunkId,
        object: "chat.completion.chunk",
        created,
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: toolIdx,
                  id: event.content_block.id,
                  type: "function",
                  function: {
                    name: event.content_block.name,
                    arguments: "",
                  },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      })}\n\n`
    );
  } else if (event.type === "message_delta") {
    if (streamState.toolRescuer) {
      const { calls, cleanText } = streamState.toolRescuer.flush();
      if (calls.length > 0) {
        for (const c of calls) {
          const toolIdx = streamState.toolCallIndex++;
          events.push(
            `data: ${JSON.stringify({
              id: chunkId,
              object: "chat.completion.chunk",
              created,
              choices: [
                {
                  index: 0,
                  delta: {
                    tool_calls: [
                      {
                        index: toolIdx,
                        id: `call_${Date.now()}_${toolIdx}`,
                        type: "function",
                        function: {
                          name: c.name,
                          arguments: c.arguments,
                        },
                      },
                    ],
                  },
                  finish_reason: null,
                },
              ],
            })}\n\n`
          );
        }
      }
      if (cleanText) {
        events.push(
          `data: ${JSON.stringify({
            id: chunkId,
            object: "chat.completion.chunk",
            created,
            choices: [
              {
                index: 0,
                delta: { content: cleanText },
                finish_reason: null,
              },
            ],
          })}\n\n`
        );
      }
    }

    const stopReason = event.delta?.stop_reason;
    let finishReason: string | null = null;
    if (stopReason === "end_turn") finishReason = streamState.toolCallIndex > 0 ? "tool_calls" : "stop";
    else if (stopReason === "max_tokens") finishReason = "length";
    else if (stopReason === "tool_use") finishReason = "tool_calls";
    else if (stopReason) finishReason = stopReason;

    const completionTokens = event.usage?.output_tokens || 0;
    const promptTokens = streamState.promptTokens || 0;
    const cachedTokens = streamState.cachedTokens || 0;

    events.push(
      `data: ${JSON.stringify({
        id: chunkId,
        object: "chat.completion.chunk",
        created,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: finishReason,
          },
        ],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
          ...(cachedTokens > 0 ? { prompt_tokens_details: { cached_tokens: cachedTokens } } : {}),
        },
      })}\n\n`
    );
  } else if (event.type === "message_stop") {
    if (streamStatesMap) {
      streamStatesMap.delete(requestId);
    }
    events.push("data: [DONE]\n\n");
  }

  return events;
}
