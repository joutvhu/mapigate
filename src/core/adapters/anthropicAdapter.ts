/**
 * Anthropic Adapter
 * Translates between Anthropic Messages format and OpenAI Chat format
 */
export class AnthropicAdapter {
  /**
   * Convert Anthropic /v1/messages payload to OpenAI /v1/chat/completions payload
   */
  public static anthropicToOpenAi(anthropicBody: any): any {
    const messages: any[] = [];

    // 1. Top-level system prompt
    if (anthropicBody.system) {
      const sysContent =
        typeof anthropicBody.system === "string"
          ? anthropicBody.system
          : Array.isArray(anthropicBody.system)
          ? anthropicBody.system.map((s: any) => s.text || "").join("\n")
          : "";
      if (sysContent) {
        messages.push({ role: "system", content: sysContent });
      }
    }

    // 2. Messages array
    if (Array.isArray(anthropicBody.messages)) {
      for (const msg of anthropicBody.messages) {
        const role = msg.role;

        if (typeof msg.content === "string") {
          messages.push({ role, content: msg.content });
          continue;
        }

        if (Array.isArray(msg.content)) {
          let textAccumulator = "";
          const toolCalls: any[] = [];

          for (const block of msg.content) {
            if (block.type === "text") {
              textAccumulator += (block.text || "") + "\n";
            } else if (block.type === "tool_use") {
              toolCalls.push({
                id: block.id,
                type: "function",
                function: {
                  name: block.name,
                  arguments: typeof block.input === "string" ? block.input : JSON.stringify(block.input || {}),
                },
              });
            } else if (block.type === "tool_result") {
              // Anthropic puts tool_result in user message; OpenAI expects role: 'tool'
              messages.push({
                role: "tool",
                tool_call_id: block.tool_use_id,
                content: typeof block.content === "string" ? block.content : JSON.stringify(block.content || ""),
              });
            }
          }

          if (textAccumulator.trim() || toolCalls.length > 0) {
            const outMsg: any = { role, content: textAccumulator.trim() || null };
            if (toolCalls.length > 0) {
              outMsg.tool_calls = toolCalls;
            }
            messages.push(outMsg);
          }
        }
      }
    }

    // 3. Tools
    let tools: any[] | undefined = undefined;
    if (Array.isArray(anthropicBody.tools)) {
      tools = anthropicBody.tools.map((t: any) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      }));
    }

    return {
      model: anthropicBody.model,
      messages,
      tools,
      stream: Boolean(anthropicBody.stream),
      max_tokens: anthropicBody.max_tokens,
      temperature: anthropicBody.temperature,
    };
  }

  /**
   * Convert OpenAI response chunk to Anthropic SSE event format
   */
  public static openAiChunkToAnthropicEvent(chunk: any, messageId: string): string[] {
    const delta = chunk?.choices?.[0]?.delta;
    if (!delta) return [];

    const events: string[] = [];

    // Text delta
    if (delta.content) {
      events.push(
        `event: content_block_delta\ndata: ${JSON.stringify({
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: delta.content },
        })}\n\n`
      );
    }

    // Reasoning / Thinking delta
    if (delta.reasoning_content) {
      events.push(
        `event: content_block_delta\ndata: ${JSON.stringify({
          type: "content_block_delta",
          index: 0,
          delta: { type: "thinking_delta", thinking: delta.reasoning_content },
        })}\n\n`
      );
    }

    // Finish reason
    if (chunk.choices?.[0]?.finish_reason) {
      events.push(
        `event: message_delta\ndata: ${JSON.stringify({
          type: "message_delta",
          delta: { stop_reason: "end_turn", stop_sequence: null },
          usage: { output_tokens: 0 },
        })}\n\n`
      );
      events.push(`event: message_stop\ndata: {"type":"message_stop"}\n\n`);
    }

    return events;
  }
}
