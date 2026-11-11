export interface ExtractedUsageTokens {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  cacheCreationTokens: number;
  reasoningTokens: number;
}

/**
 * Extracts normalized token counts from OpenAI Chat, OpenAI Responses,
 * Anthropic Messages, DeepSeek/Qwen, Ollama, or Gemini usage payloads
 * without double-counting cached tokens.
 */
export function extractUsageTokens(
  payload: any,
  fallbackPromptTokens: number = 0
): ExtractedUsageTokens {
  const usage = payload?.usage || {};
  const geminiMeta = payload?.usageMetadata;

  if (!payload?.usage && geminiMeta) {
    const promptTokens = Number(geminiMeta.promptTokenCount ?? fallbackPromptTokens ?? 0) || 0;
    const completionTokens = Number(geminiMeta.candidatesTokenCount ?? 0) || 0;
    const cachedTokens = Number(geminiMeta.cachedContentTokenCount ?? 0) || 0;
    const reasoningTokens = Number(geminiMeta.thoughtsTokenCount ?? 0) || 0;
    return {
      promptTokens,
      completionTokens,
      cachedTokens,
      cacheCreationTokens: 0,
      reasoningTokens,
    };
  }

  let promptTokens =
    Number(
      usage.prompt_tokens ??
        usage.input_tokens ??
        usage.prompt_eval_count ??
        fallbackPromptTokens ??
        0
    ) || 0;

  const completionTokens =
    Number(
      usage.completion_tokens ??
        usage.output_tokens ??
        usage.eval_count ??
        0
    ) || 0;

  const cachedTokens =
    Number(
      usage.prompt_tokens_details?.cached_tokens ??
        usage.input_tokens_details?.cached_tokens ??
        usage.cache_read_input_tokens ??
        usage.prompt_cache_hit_tokens ??
        usage.cached_tokens ??
        0
    ) || 0;

  const cacheCreationTokens = Number(usage.cache_creation_input_tokens ?? 0) || 0;

  const reasoningTokens =
    Number(
      usage.completion_tokens_details?.reasoning_tokens ??
        usage.output_tokens_details?.reasoning_tokens ??
        0
    ) || 0;

  // In Anthropic Messages API, `input_tokens` excludes `cache_read_input_tokens` and
  // `cache_creation_input_tokens`. In OpenAI Responses API (`input_tokens_details`),
  // `input_tokens` ALREADY includes `cached_tokens` — never add cachedTokens twice.
  const isAnthropicInputShape =
    usage.input_tokens !== undefined &&
    usage.prompt_tokens === undefined &&
    usage.input_tokens_details === undefined &&
    (usage.cache_read_input_tokens !== undefined ||
      usage.cache_creation_input_tokens !== undefined);

  if (isAnthropicInputShape) {
    promptTokens = (Number(usage.input_tokens) || 0) + cachedTokens + cacheCreationTokens;
  }

  return {
    promptTokens,
    completionTokens,
    cachedTokens,
    cacheCreationTokens,
    reasoningTokens,
  };
}
