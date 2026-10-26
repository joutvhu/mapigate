/**
 * Convert OpenAI non-streaming chat completion to Anthropic Message response
 */
export function openAiResponseToAnthropic(openAiResponse: any, requestId?: string): any {
  if (!openAiResponse || typeof openAiResponse !== "object") return openAiResponse;
  const choice = openAiResponse.choices?.[0];
  const message = choice?.message || {};
  const contentBlocks: any[] = [];

  const reasoning = message.reasoning_content || message.reasoning || message.thought;
  if (reasoning) {
    contentBlocks.push({ type: "thinking", thinking: reasoning });
  }
  if (message.content) {
    contentBlocks.push({ type: "text", text: message.content });
  }
  if (Array.isArray(message.tool_calls)) {
    for (const tc of message.tool_calls) {
      let input: any = {};
      try {
        input = typeof tc.function?.arguments === "string" ? JSON.parse(tc.function.arguments) : (tc.function?.arguments || {});
      } catch {
        input = { raw: tc.function?.arguments };
      }
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        input = { input };
      }
      contentBlocks.push({
        type: "tool_use",
        id: tc.id || `toolu_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: tc.function?.name,
        input,
      });
    }
  }

  if (contentBlocks.length === 0) {
    contentBlocks.push({ type: "text", text: "" });
  }

  const finishReason = choice?.finish_reason;
  const usage = openAiResponse.usage || {};

  return {
    id: requestId ? `msg_${requestId}` : (openAiResponse.id ? `msg_${openAiResponse.id}` : `msg_${Date.now()}`),
    type: "message",
    role: "assistant",
    model: openAiResponse.model || "claude",
    content: contentBlocks,
    stop_reason: finishReason === "length" ? "max_tokens" : finishReason === "tool_calls" ? "tool_use" : "end_turn",
    usage: {
      input_tokens: usage.prompt_tokens || usage.input_tokens || 0,
      output_tokens: usage.completion_tokens || usage.output_tokens || 0,
    },
  };
}

/**
 * Convert Anthropic non-streaming Message response to OpenAI chat completion response
 */
export function anthropicResponseToOpenAi(anthropicResponse: any, targetModel?: string): any {
  if (!anthropicResponse || typeof anthropicResponse !== "object") return anthropicResponse;

  let textContent = "";
  let reasoningText = "";
  const toolCalls: any[] = [];

  if (Array.isArray(anthropicResponse.content)) {
    for (const block of anthropicResponse.content) {
      if (block.type === "text") {
        textContent += (block.text || "") + "\n";
      } else if (block.type === "thinking") {
        reasoningText += (block.thinking || "") + "\n";
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          type: "function",
          function: {
            name: block.name,
            arguments: typeof block.input === "string" ? block.input : JSON.stringify(block.input || {}),
          },
        });
      }
    }
  }

  const stopReason = anthropicResponse.stop_reason;
  const finishReason =
    stopReason === "tool_use"
      ? "tool_calls"
      : stopReason === "max_tokens"
      ? "length"
      : "stop";

  const usage = anthropicResponse.usage || {};
  const inputTokens = usage.input_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const cacheCreation = usage.cache_creation_input_tokens || 0;
  const promptTokens = inputTokens + cacheRead + cacheCreation;
  const outputTokens = usage.output_tokens || 0;

  const message: any = {
    role: "assistant",
    content: textContent.trim() || (toolCalls.length > 0 ? null : ""),
  };
  if (reasoningText.trim()) {
    message.reasoning_content = reasoningText.trim();
  }
  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }

  return {
    id: anthropicResponse.id ? `chatcmpl_${anthropicResponse.id.replace(/^msg_/, "")}` : `chatcmpl_${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: targetModel || anthropicResponse.model || "claude",
    choices: [
      {
        index: 0,
        message,
        finish_reason: finishReason,
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: outputTokens,
      total_tokens: promptTokens + outputTokens,
      ...(cacheRead > 0 ? { prompt_tokens_details: { cached_tokens: cacheRead } } : {}),
    },
  };
}
