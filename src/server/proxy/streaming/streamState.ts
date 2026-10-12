import type { LogToolSnippet } from "../../../shared/types/index.js";

export interface StreamTrackingState {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  cacheCreationTokens: number;
  reasoningTokens: number;
  ttftMs?: number;
  capturedResponseText: string;
  tools: LogToolSnippet[];
  seenToolCallKeys: Set<string>;
}

export function createStreamTrackingState(initialPromptTokens = 0): StreamTrackingState {
  return {
    promptTokens: initialPromptTokens,
    completionTokens: 0,
    cachedTokens: 0,
    cacheCreationTokens: 0,
    reasoningTokens: 0,
    capturedResponseText: "",
    tools: [],
    seenToolCallKeys: new Set<string>(),
  };
}

export function extractTokensFromChunk(chunk: any, state: StreamTrackingState): void {
  if (!chunk || typeof chunk !== "object") return;

  if (chunk.usage) {
    if (chunk.usage.prompt_tokens) state.promptTokens = chunk.usage.prompt_tokens;
    if (chunk.usage.completion_tokens) state.completionTokens = chunk.usage.completion_tokens;
    if (chunk.usage.prompt_tokens_details?.cached_tokens) {
      state.cachedTokens = chunk.usage.prompt_tokens_details.cached_tokens;
    }
    if (chunk.usage.completion_tokens_details?.reasoning_tokens) {
      state.reasoningTokens = chunk.usage.completion_tokens_details.reasoning_tokens;
    }
  }

  if (chunk.type === "message_start" && chunk.message?.usage) {
    const u = chunk.message.usage;
    if (u.input_tokens) state.promptTokens = u.input_tokens;
    if (u.cache_read_input_tokens) state.cachedTokens = u.cache_read_input_tokens;
    if (u.cache_creation_input_tokens) state.cacheCreationTokens = u.cache_creation_input_tokens;
  } else if (chunk.type === "message_delta" && chunk.usage) {
    if (chunk.usage.output_tokens) state.completionTokens = chunk.usage.output_tokens;
  }

  const deltaText = chunk.choices?.[0]?.delta?.content || chunk.delta?.text || "";
  if (typeof deltaText === "string" && deltaText) {
    if (state.capturedResponseText.length < 4000) {
      state.capturedResponseText += deltaText;
    }
  }
}

/**
 * Extracts and records tool invocations in stream chunks without recording duplicate
 * calls if an upstream provider repeats tool call metadata (e.g. function names) across delta chunks.
 */
export function recordStreamToolCall(
  chunk: any,
  state: StreamTrackingState,
  onToolLogged?: (name: string) => void
): void {
  if (!chunk || typeof chunk !== "object") return;

  // Anthropic format
  if (chunk.type === "content_block_start" && chunk.content_block?.type === "tool_use") {
    const toolIndex = chunk.index !== undefined ? `anthropic_${chunk.index}` : null;
    if (!toolIndex || !state.seenToolCallKeys.has(toolIndex)) {
      if (toolIndex) state.seenToolCallKeys.add(toolIndex);
      const toolName = chunk.content_block.name || "tool";
      state.tools.push({
        name: toolName,
        type: "call",
        summary: `Tool: ${toolName}`,
      });
      onToolLogged?.(toolName);
    }
    return;
  }

  // OpenAI format: choices[0].delta.tool_calls
  if (Array.isArray(chunk.choices?.[0]?.delta?.tool_calls)) {
    for (const tc of chunk.choices[0].delta.tool_calls) {
      if (tc.function?.name) {
        const toolKey = tc.id
          ? `id_${tc.id}`
          : tc.index !== undefined
            ? `idx_${tc.index}`
            : null;

        if (toolKey && state.seenToolCallKeys.has(toolKey)) {
          continue;
        }
        if (toolKey) {
          state.seenToolCallKeys.add(toolKey);
        }

        const toolName = tc.function.name;
        state.tools.push({
          name: toolName,
          type: "call",
          summary: `Tool: ${toolName}`,
        });
        onToolLogged?.(toolName);
      }
    }
  }
}
