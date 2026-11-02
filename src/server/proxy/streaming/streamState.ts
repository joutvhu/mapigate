import type { LogToolSnippet } from "../../../shared/types/index.js";

export interface StreamTrackingState {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  cacheCreationTokens: number;
  reasoningTokens: number;
  ttftMs?: number;
  capturedResponseText: string;
  capturedReasoningText: string;
  capturedToolCallIds: string[];
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
    capturedReasoningText: "",
    capturedToolCallIds: [],
    tools: [],
    seenToolCallKeys: new Set<string>(),
  };
}

export function extractTokensFromChunk(chunk: any, state: StreamTrackingState): void {
  if (!chunk || typeof chunk !== "object") return;

  if (chunk.usage) {
    if (chunk.usage.prompt_tokens) state.promptTokens = chunk.usage.prompt_tokens;
    if (chunk.usage.completion_tokens) state.completionTokens = chunk.usage.completion_tokens;
    const cached =
      chunk.usage.prompt_tokens_details?.cached_tokens ??
      chunk.usage.input_tokens_details?.cached_tokens ??
      chunk.usage.prompt_cache_hit_tokens ??
      chunk.usage.cachedContentTokenCount ??
      chunk.usage.cached_tokens;
    if (cached != null) {
      state.cachedTokens = Number(cached) || 0;
    }
    const reasoning =
      chunk.usage.completion_tokens_details?.reasoning_tokens ??
      chunk.usage.output_tokens_details?.reasoning_tokens ??
      chunk.usage.reasoning_tokens;
    if (reasoning != null) {
      state.reasoningTokens = Number(reasoning) || 0;
    }
  }

  if (chunk.type === "message_start" && chunk.message?.usage) {
    const u = chunk.message.usage;
    const baseInput = u.input_tokens || 0;
    const cacheRead = u.cache_read_input_tokens || 0;
    const cacheCreation = u.cache_creation_input_tokens || 0;
    state.promptTokens = baseInput + cacheRead + cacheCreation;
    if (cacheRead) state.cachedTokens = cacheRead;
    if (cacheCreation) state.cacheCreationTokens = cacheCreation;
  } else if (chunk.type === "message_delta" && chunk.usage) {
    if (chunk.usage.output_tokens) state.completionTokens = chunk.usage.output_tokens;
  }

  const deltaText = chunk.choices?.[0]?.delta?.content || chunk.delta?.text || "";
  if (typeof deltaText === "string" && deltaText) {
    if (state.capturedResponseText.length < 4000) {
      state.capturedResponseText += deltaText;
    }
  }

  const reasoningDelta =
    chunk.choices?.[0]?.delta?.reasoning_content ||
    chunk.choices?.[0]?.delta?.reasoning ||
    chunk.choices?.[0]?.delta?.thought ||
    (chunk.delta?.type === "thinking_delta" ? chunk.delta.thinking : "") ||
    (chunk.content_block?.type === "thinking" ? chunk.content_block.thinking : "") ||
    "";
  if (typeof reasoningDelta === "string" && reasoningDelta) {
    state.capturedReasoningText += reasoningDelta;
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
    if (chunk.content_block.id && !state.capturedToolCallIds.includes(chunk.content_block.id)) {
      state.capturedToolCallIds.push(chunk.content_block.id);
    }
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
      if (tc.id && !state.capturedToolCallIds.includes(tc.id)) {
        state.capturedToolCallIds.push(tc.id);
      }
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
