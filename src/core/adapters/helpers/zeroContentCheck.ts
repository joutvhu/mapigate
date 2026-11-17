function hasNonEmptyString(val: unknown): boolean {
  return typeof val === "string" && val.trim().length > 0;
}

/**
 * Detects HTTP 200 responses that carry zero usable content across OpenAI Chat,
 * Anthropic Messages, Gemini/Antigravity, OpenAI Responses, and bare `{"text":""}`.
 * Reasoning/thinking blocks count as content. `content_filter` / safety refusals
 * are treated as non-retryable (returns false).
 */
export function isZeroContentResponse(payload: any): boolean {
  if (payload == null) return true;

  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return true;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        return isZeroContentResponse(parsed);
      }
      return false;
    } catch {
      return false;
    }
  }

  if (typeof payload !== "object") return false;
  if (Array.isArray(payload)) return payload.length === 0;

  // Respect content_filter / safety refusals as non-retryable
  if (
    payload.choices?.[0]?.finish_reason === "content_filter" ||
    payload.stop_reason === "content_filter" ||
    payload.stop_reason === "refusal" ||
    payload.candidates?.[0]?.finishReason === "SAFETY" ||
    payload.candidates?.[0]?.finishReason === "RECITATION" ||
    payload.candidates?.[0]?.finishReason === "PROHIBITED_CONTENT" ||
    (payload.status === "incomplete" && payload.incomplete_details?.reason === "content_filter")
  ) {
    return false;
  }

  // 1. OpenAI Chat Completions
  if (Array.isArray(payload.choices)) {
    if (payload.choices.length === 0) return true;
    const hasAnyContent = payload.choices.some((choice: any) => {
      const msg = choice?.message || choice?.delta || {};
      const hasText =
        hasNonEmptyString(msg.content) ||
        (Array.isArray(msg.content) && msg.content.length > 0);
      const hasReasoning =
        hasNonEmptyString(msg.reasoning_content) ||
        hasNonEmptyString(msg.reasoning) ||
        hasNonEmptyString(msg.thought);
      const hasTools =
        (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) ||
        Boolean(msg.function_call);
      return hasText || hasReasoning || hasTools;
    });
    return !hasAnyContent;
  }

  // 2. Anthropic Messages
  if (payload.type === "message" || Array.isArray(payload.content)) {
    if (!Array.isArray(payload.content) || payload.content.length === 0) return true;
    const hasAnyBlock = payload.content.some((block: any) => {
      if (!block || typeof block !== "object") return false;
      if (block.type === "text") return hasNonEmptyString(block.text);
      if (block.type === "thinking") return hasNonEmptyString(block.thinking);
      if (block.type === "redacted_thinking") return Boolean(block.data);
      if (
        block.type === "tool_use" ||
        block.type === "server_tool_use" ||
        block.type === "web_search_tool_result"
      ) {
        return true;
      }
      return false;
    });
    return !hasAnyBlock;
  }

  // 3. Gemini / Antigravity
  const candidates = Array.isArray(payload.candidates)
    ? payload.candidates
    : Array.isArray(payload.response?.candidates)
    ? payload.response.candidates
    : null;
  if (candidates) {
    if (candidates.length === 0) return true;
    const hasAnyPart = candidates.some((cand: any) => {
      const parts = cand?.content?.parts;
      if (!Array.isArray(parts) || parts.length === 0) return false;
      return parts.some(
        (p: any) =>
          p &&
          (hasNonEmptyString(p.text) ||
            Boolean(p.functionCall) ||
            Boolean(p.inlineData) ||
            Boolean(p.fileData))
      );
    });
    return !hasAnyPart;
  }

  // 4. OpenAI Responses API
  if (payload.object === "response" || Array.isArray(payload.output)) {
    if (!Array.isArray(payload.output) || payload.output.length === 0) return true;
    const hasAnyOutput = payload.output.some((item: any) => {
      if (!item || typeof item !== "object") return false;
      if (item.type === "function_call") return true;
      if (item.type === "reasoning") {
        return (
          (Array.isArray(item.summary) && item.summary.length > 0) ||
          (Array.isArray(item.content) && item.content.length > 0)
        );
      }
      if (item.type === "message" && Array.isArray(item.content)) {
        return item.content.some(
          (c: any) => c && (hasNonEmptyString(c.text) || hasNonEmptyString(c.output_text))
        );
      }
      return false;
    });
    return !hasAnyOutput;
  }

  // 5. Empty object `{}` or bare `{"text": ""}`
  const keys = Object.keys(payload);
  if (keys.length === 0) return true;
  if ("text" in payload && keys.length <= 2 && typeof payload.text === "string") {
    return payload.text.trim().length === 0;
  }

  return false;
}
