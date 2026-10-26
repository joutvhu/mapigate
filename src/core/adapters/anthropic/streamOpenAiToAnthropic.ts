import { repairToolArguments } from "../helpers/toolArgsRepair.js";
import { type AnthropicStreamState, createStreamState } from "./types.js";

/**
 * Translates OpenAI response chunk to Anthropic SSE event format
 */
export function openAiChunkToAnthropicEvent(
  chunk: any,
  messageId: string,
  state?: AnthropicStreamState,
  streamStatesMap?: Map<string, AnthropicStreamState>
): string[] {
  const delta = chunk?.choices?.[0]?.delta;
  const finishReason = chunk?.choices?.[0]?.finish_reason;
  if (!delta && !finishReason && !chunk?.usage) return [];

  let streamState = state;
  if (!streamState && streamStatesMap) {
    streamState = streamStatesMap.get(messageId);
    if (!streamState) {
      streamState = createStreamState(messageId);
      streamStatesMap.set(messageId, streamState);
      if (streamStatesMap.size > 500) {
        const oldestKey = streamStatesMap.keys().next().value;
        if (oldestKey) streamStatesMap.delete(oldestKey);
      }
    }
  }

  if (!streamState) {
    streamState = createStreamState(messageId);
  }

  const events: string[] = [];

  // Track usage if present
  if (chunk.usage?.completion_tokens != null) {
    streamState.outputTokens = chunk.usage.completion_tokens;
  }

  // 1. Check reasoning / thinking across vendor formats:
  let reasoningText =
    (typeof delta?.reasoning_content === "string" && delta.reasoning_content) ||
    (typeof delta?.reasoning === "string" && delta.reasoning) ||
    (typeof delta?.thought === "string" && delta.thought) ||
    "";

  if (!reasoningText && Array.isArray(delta?.reasoning_details)) {
    reasoningText = delta.reasoning_details
      .map((d: any) => (typeof d === "string" ? d : d?.text || d?.content || ""))
      .join("");
  }

  if (reasoningText) {
    // If a tool call block was open, close it first
    if (streamState.currentToolCallIndex !== undefined) {
      const prevEntry = streamState.toolCalls.get(streamState.currentToolCallIndex);
      if (prevEntry && prevEntry.started && !prevEntry.stopped) {
        events.push(
          `event: content_block_stop\ndata: ${JSON.stringify({
            type: "content_block_stop",
            index: prevEntry.blockIndex,
          })}\n\n`
        );
        prevEntry.stopped = true;
      }
      streamState.currentToolCallIndex = undefined;
    }

    if (streamState.currentBlockType !== "thinking") {
      if (streamState.currentBlockType !== null && streamState.currentBlockIndex !== null) {
        events.push(
          `event: content_block_stop\ndata: ${JSON.stringify({
            type: "content_block_stop",
            index: streamState.currentBlockIndex,
          })}\n\n`
        );
      }
      streamState.currentBlockIndex = streamState.nextBlockIndex++;
      streamState.currentBlockType = "thinking";
      events.push(
        `event: content_block_start\ndata: ${JSON.stringify({
          type: "content_block_start",
          index: streamState.currentBlockIndex,
          content_block: { type: "thinking", thinking: "" },
        })}\n\n`
      );
    }

    events.push(
      `event: content_block_delta\ndata: ${JSON.stringify({
        type: "content_block_delta",
        index: streamState.currentBlockIndex,
        delta: { type: "thinking_delta", thinking: reasoningText },
      })}\n\n`
    );
  }

  // 2. Text delta
  if (typeof delta?.content === "string" && delta.content) {
    // If a tool call block was open, close it first
    if (streamState.currentToolCallIndex !== undefined) {
      const prevEntry = streamState.toolCalls.get(streamState.currentToolCallIndex);
      if (prevEntry && prevEntry.started && !prevEntry.stopped) {
        events.push(
          `event: content_block_stop\ndata: ${JSON.stringify({
            type: "content_block_stop",
            index: prevEntry.blockIndex,
          })}\n\n`
        );
        prevEntry.stopped = true;
      }
      streamState.currentToolCallIndex = undefined;
    }

    if (streamState.currentBlockType !== "text") {
      if (streamState.currentBlockType !== null && streamState.currentBlockIndex !== null) {
        events.push(
          `event: content_block_stop\ndata: ${JSON.stringify({
            type: "content_block_stop",
            index: streamState.currentBlockIndex,
          })}\n\n`
        );
      }
      streamState.currentBlockIndex = streamState.nextBlockIndex++;
      streamState.currentBlockType = "text";
      events.push(
        `event: content_block_start\ndata: ${JSON.stringify({
          type: "content_block_start",
          index: streamState.currentBlockIndex,
          content_block: { type: "text", text: "" },
        })}\n\n`
      );
    }

    events.push(
      `event: content_block_delta\ndata: ${JSON.stringify({
        type: "content_block_delta",
        index: streamState.currentBlockIndex,
        delta: { type: "text_delta", text: delta.content },
      })}\n\n`
    );
  }

  // 3. Tool calls delta
  if (Array.isArray(delta?.tool_calls)) {
    if (streamState.currentBlockType === "thinking" || streamState.currentBlockType === "text") {
      events.push(
        `event: content_block_stop\ndata: ${JSON.stringify({
          type: "content_block_stop",
          index: streamState.currentBlockIndex,
        })}\n\n`
      );
      streamState.currentBlockType = null;
      streamState.currentBlockIndex = null;
    }

    for (const tc of delta.tool_calls) {
      const tcIndex = tc.index ?? 0;

      // If switching from a previous tool call block to a new tool call block, close the previous one first
      if (
        streamState.currentToolCallIndex !== undefined &&
        streamState.currentToolCallIndex !== tcIndex
      ) {
        const prevEntry = streamState.toolCalls.get(streamState.currentToolCallIndex);
        if (prevEntry && prevEntry.started && !prevEntry.stopped) {
          events.push(
            `event: content_block_stop\ndata: ${JSON.stringify({
              type: "content_block_stop",
              index: prevEntry.blockIndex,
            })}\n\n`
          );
          prevEntry.stopped = true;
        }
      }

      let toolInfo = streamState.toolCalls.get(tcIndex);

      if (!toolInfo) {
        const toolBlockIndex = streamState.nextBlockIndex++;
        toolInfo = {
          id: tc.id || `call_${Math.random().toString(36).slice(2, 9)}`,
          name: tc.function?.name || "",
          blockIndex: toolBlockIndex,
          started: false,
        };
        streamState.toolCalls.set(tcIndex, toolInfo);
      }

      streamState.currentToolCallIndex = tcIndex;
      streamState.currentBlockType = "tool_use";
      streamState.currentBlockIndex = toolInfo.blockIndex;

      if (tc.id && !toolInfo.id) {
        toolInfo.id = tc.id;
      }
      if (tc.function?.name && !toolInfo.name) {
        toolInfo.name = tc.function.name;
      }

      if (!toolInfo.started && toolInfo.name) {
        toolInfo.started = true;
        events.push(
          `event: content_block_start\ndata: ${JSON.stringify({
            type: "content_block_start",
            index: toolInfo.blockIndex,
            content_block: {
              type: "tool_use",
              id: toolInfo.id,
              name: toolInfo.name,
              input: {},
            },
          })}\n\n`
        );
      }

      if (tc.function?.arguments) {
        const schema = streamState.toolSchemas?.get(toolInfo.name || tc.function?.name);
        const sanitizedArgs = repairToolArguments(tc.function.arguments, schema);
        events.push(
          `event: content_block_delta\ndata: ${JSON.stringify({
            type: "content_block_delta",
            index: toolInfo.blockIndex,
            delta: {
              type: "input_json_delta",
              partial_json: sanitizedArgs,
            },
          })}\n\n`
        );
      }
    }
  }

  // 4. Finish reason
  if (finishReason) {
    if (streamState.currentBlockType === "thinking" || streamState.currentBlockType === "text") {
      events.push(
        `event: content_block_stop\ndata: ${JSON.stringify({
          type: "content_block_stop",
          index: streamState.currentBlockIndex,
        })}\n\n`
      );
      streamState.currentBlockType = null;
      streamState.currentBlockIndex = null;
    }

    for (const toolInfo of streamState.toolCalls.values()) {
      if (toolInfo.started && !toolInfo.stopped) {
        toolInfo.stopped = true;
        events.push(
          `event: content_block_stop\ndata: ${JSON.stringify({
            type: "content_block_stop",
            index: toolInfo.blockIndex,
          })}\n\n`
        );
      }
    }
    streamState.currentToolCallIndex = undefined;

    const stopReason =
      finishReason === "tool_calls"
        ? "tool_use"
        : finishReason === "length"
        ? "max_tokens"
        : "end_turn";

    events.push(
      `event: message_delta\ndata: ${JSON.stringify({
        type: "message_delta",
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: streamState.outputTokens || 0 },
      })}\n\n`
    );
    events.push(`event: message_stop\ndata: {"type":"message_stop"}\n\n`);
    streamState.messageStopSent = true;

    if (streamStatesMap) {
      streamStatesMap.delete(messageId);
    }
  }

  return events;
}

/**
 * Finalize an Anthropic stream if finish_reason was omitted or unclosed blocks remain
 */
export function finalizeStream(
  state: AnthropicStreamState,
  streamStatesMap?: Map<string, AnthropicStreamState>
): string[] {
  if (state.messageStopSent) return [];

  const events: string[] = [];

  if (state.currentBlockType === "thinking" || state.currentBlockType === "text") {
    events.push(
      `event: content_block_stop\ndata: ${JSON.stringify({
        type: "content_block_stop",
        index: state.currentBlockIndex,
      })}\n\n`
    );
    state.currentBlockType = null;
    state.currentBlockIndex = null;
  }

  for (const toolInfo of state.toolCalls.values()) {
    if (toolInfo.started && !toolInfo.stopped) {
      toolInfo.stopped = true;
      events.push(
        `event: content_block_stop\ndata: ${JSON.stringify({
          type: "content_block_stop",
          index: toolInfo.blockIndex,
        })}\n\n`
      );
    }
  }
  state.currentToolCallIndex = undefined;

  events.push(
    `event: message_delta\ndata: ${JSON.stringify({
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: state.outputTokens || 0 },
    })}\n\n`
  );
  events.push(`event: message_stop\ndata: {"type":"message_stop"}\n\n`);
  state.messageStopSent = true;

  if (state.messageId && streamStatesMap) {
    streamStatesMap.delete(state.messageId);
  }

  return events;
}
