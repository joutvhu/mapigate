export interface StreamTrackingState {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  cacheCreationTokens: number;
  reasoningTokens: number;
  ttftMs?: number;
  capturedResponseText: string;
}

export function createStreamTrackingState(initialPromptTokens = 0): StreamTrackingState {
  return {
    promptTokens: initialPromptTokens,
    completionTokens: 0,
    cachedTokens: 0,
    cacheCreationTokens: 0,
    reasoningTokens: 0,
    capturedResponseText: "",
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
