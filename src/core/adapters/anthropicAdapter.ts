/**
 * Anthropic Adapter
 * Translates bidirectionally between Anthropic Messages format and OpenAI Chat format
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
   * Convert OpenAI /v1/chat/completions payload to Anthropic /v1/messages payload
   */
  public static openAiToAnthropic(openAiBody: any): any {
    let systemPrompt = "";
    const anthropicMessages: any[] = [];

    if (Array.isArray(openAiBody.messages)) {
      for (const msg of openAiBody.messages) {
        if (msg.role === "system") {
          const sysText = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content || "");
          systemPrompt = systemPrompt ? `${systemPrompt}\n${sysText}` : sysText;
          continue;
        }

        if (msg.role === "tool") {
          // Anthropic requires tool_result to be placed in a 'user' message
          const toolResultBlock = {
            type: "tool_result",
            tool_use_id: msg.tool_call_id,
            content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content || ""),
          };

          const lastMsg = anthropicMessages[anthropicMessages.length - 1];
          if (lastMsg && lastMsg.role === "user" && Array.isArray(lastMsg.content)) {
            lastMsg.content.push(toolResultBlock);
          } else {
            anthropicMessages.push({
              role: "user",
              content: [toolResultBlock],
            });
          }
          continue;
        }

        if (msg.role === "assistant") {
          const contentBlocks: any[] = [];
          if (msg.content) {
            contentBlocks.push({ type: "text", text: msg.content });
          }
          if (Array.isArray(msg.tool_calls)) {
            for (const tc of msg.tool_calls) {
              let parsedInput = {};
              if (tc.function?.arguments) {
                try {
                  parsedInput = typeof tc.function.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function.arguments;
                } catch {
                  parsedInput = { raw: tc.function.arguments };
                }
              }
              contentBlocks.push({
                type: "tool_use",
                id: tc.id,
                name: tc.function?.name,
                input: parsedInput,
              });
            }
          }

          anthropicMessages.push({
            role: "assistant",
            content: contentBlocks.length === 1 && contentBlocks[0].type === "text" ? contentBlocks[0].text : contentBlocks,
          });
          continue;
        }

        // Default role: user
        anthropicMessages.push({
          role: "user",
          content: msg.content,
        });
      }
    }

    // Tools conversion
    let tools: any[] | undefined = undefined;
    if (Array.isArray(openAiBody.tools)) {
      tools = openAiBody.tools
        .filter((t: any) => t.type === "function" && t.function)
        .map((t: any) => ({
          name: t.function.name,
          description: t.function.description || "",
          input_schema: t.function.parameters || { type: "object", properties: {} },
        }));
    }

    return {
      model: openAiBody.model,
      messages: anthropicMessages,
      system: systemPrompt || undefined,
      tools: tools && tools.length > 0 ? tools : undefined,
      max_tokens: openAiBody.max_tokens || 4096,
      temperature: openAiBody.temperature,
      stream: Boolean(openAiBody.stream),
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

    // Tool calls delta
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        if (tc.id && tc.function?.name) {
          events.push(
            `event: content_block_start\ndata: ${JSON.stringify({
              type: "content_block_start",
              index: tc.index || 0,
              content_block: {
                type: "tool_use",
                id: tc.id,
                name: tc.function.name,
              },
            })}\n\n`
          );
        }
        if (tc.function?.arguments) {
          events.push(
            `event: content_block_delta\ndata: ${JSON.stringify({
              type: "content_block_delta",
              index: tc.index || 0,
              delta: {
                type: "input_json_delta",
                partial_json: tc.function.arguments,
              },
            })}\n\n`
          );
        }
      }
    }

    // Finish reason
    if (chunk.choices?.[0]?.finish_reason) {
      const stopReason = chunk.choices[0].finish_reason === "tool_calls" ? "tool_use" : "end_turn";
      events.push(
        `event: message_delta\ndata: ${JSON.stringify({
          type: "message_delta",
          delta: { stop_reason: stopReason, stop_sequence: null },
          usage: { output_tokens: 0 },
        })}\n\n`
      );
      events.push(`event: message_stop\ndata: {"type":"message_stop"}\n\n`);
    }

    return events;
  }

  /**
   * Convert Anthropic SSE event to OpenAI SSE chunk format
   */
  public static anthropicChunkToOpenAiEvent(event: any, requestId: string): string[] {
    if (!event || !event.type) return [];
    const created = Math.floor(Date.now() / 1000);
    const chunkId = `chatcmpl-${requestId}`;
    const events: string[] = [];

    if (event.type === "content_block_delta") {
      if (event.delta?.type === "text_delta" && event.delta.text) {
        events.push(
          `data: ${JSON.stringify({
            id: chunkId,
            object: "chat.completion.chunk",
            created,
            choices: [
              {
                index: 0,
                delta: { content: event.delta.text },
                finish_reason: null,
              },
            ],
          })}\n\n`
        );
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
                      index: event.index || 0,
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
                    index: event.index || 0,
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
      const finishReason = event.delta?.stop_reason === "tool_use" ? "tool_calls" : "stop";
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
        })}\n\n`
      );
    } else if (event.type === "message_stop") {
      events.push("data: [DONE]\n\n");
    }

    return events;
  }
}
