import {
  repairToolArguments,
  toolSchemaMap,
  extractToolNames,
  type JsonSchemaish,
} from "./helpers/toolArgsRepair.js";
import { rescueInlineToolCalls } from "./helpers/toolCallRescue.js";

export interface AnthropicStreamState {
  messageStartSent?: boolean;
  messageId?: string;
  nextBlockIndex: number;
  currentBlockType: "thinking" | "text" | null;
  currentBlockIndex: number | null;
  toolCalls: Map<number, { id: string; name: string; blockIndex: number; started: boolean; stopped?: boolean }>;
  outputTokens?: number;
  messageStopSent?: boolean;
  toolSchemas?: Map<string, JsonSchemaish>;
}

export interface AnthropicToOpenAiStreamState {
  toolCallIndex: number;
  blockIndexToToolCallIndex: Map<number, number>;
}

/**
 * Anthropic Adapter
 * Translates bidirectionally between Anthropic Messages format and OpenAI Chat format
 */
export class AnthropicAdapter {
  private static openAiStreamStates = new Map<string, AnthropicStreamState>();
  private static anthropicStreamStates = new Map<string, AnthropicToOpenAiStreamState>();

  /**
   * Create a state tracker for OpenAI -> Anthropic streaming
   */
  public static createStreamState(messageId?: string, tools?: any[]): AnthropicStreamState {
    return {
      messageStartSent: false,
      messageId: messageId || `msg_${Date.now()}`,
      nextBlockIndex: 0,
      currentBlockType: null,
      currentBlockIndex: null,
      toolCalls: new Map(),
      toolSchemas: tools ? toolSchemaMap(tools) : undefined,
    };
  }

  /**
   * Create a state tracker for Anthropic -> OpenAI streaming
   */
  public static createAnthropicToOpenAiState(): AnthropicToOpenAiStreamState {
    return {
      toolCallIndex: 0,
      blockIndexToToolCallIndex: new Map(),
    };
  }

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
          const outMsg: any = { role, content: msg.content };
          if (msg.reasoning_content || msg.reasoning || msg.thought) {
            outMsg.reasoning_content = msg.reasoning_content || msg.reasoning || msg.thought;
          }
          if (msg.thinking_signature || msg.signature) {
            outMsg.thinking_signature = msg.thinking_signature || msg.signature;
            outMsg.signature = msg.thinking_signature || msg.signature;
          }
          messages.push(outMsg);
          continue;
        }

        if (Array.isArray(msg.content)) {
          let textAccumulator = "";
          let reasoningAccumulator = "";
          let thinkingSignature: string | undefined = undefined;
          let redactedThinking: string | undefined = undefined;
          const toolCalls: any[] = [];

          for (const block of msg.content) {
            if (block.type === "text") {
              textAccumulator += (block.text || "") + "\n";
            } else if (block.type === "thinking") {
              if (block.thinking) {
                reasoningAccumulator += (block.thinking || "") + "\n";
              }
              if (block.signature) {
                thinkingSignature = block.signature;
              }
            } else if (block.type === "redacted_thinking") {
              if (block.data) {
                redactedThinking = block.data;
              }
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

          const hasText = Boolean(textAccumulator.trim());
          const hasReasoning = Boolean(reasoningAccumulator.trim());
          const hasToolCalls = toolCalls.length > 0;

          if (hasText || hasReasoning || hasToolCalls || redactedThinking) {
            const outMsg: any = { role, content: textAccumulator.trim() || null };
            if (hasReasoning) {
              outMsg.reasoning_content = reasoningAccumulator.trim();
            }
            if (thinkingSignature) {
              outMsg.thinking_signature = thinkingSignature;
              outMsg.signature = thinkingSignature;
            }
            if (redactedThinking) {
              outMsg.redacted_thinking = redactedThinking;
            }
            if (hasToolCalls) {
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
    const toolSchemas = toolSchemaMap(openAiBody.tools);
    const toolNames = extractToolNames(openAiBody.tools);

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
          const reasoning = msg.reasoning_content || msg.reasoning || msg.thought;
          if (reasoning) {
            const thinkingBlock: any = {
              type: "thinking",
              thinking: reasoning,
            };
            if (msg.thinking_signature || msg.signature) {
              thinkingBlock.signature = msg.thinking_signature || msg.signature;
            }
            contentBlocks.push(thinkingBlock);
          }

          let textContent = typeof msg.content === "string" ? msg.content : "";
          const hasToolCalls = Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;

          // Inline dialect rescue if no structured tool_calls present
          if (!hasToolCalls && textContent && toolNames.size > 0) {
            const rescue = rescueInlineToolCalls(textContent, toolNames);
            if (rescue.detected && rescue.calls && rescue.calls.length > 0) {
              textContent = rescue.cleanText || "";
              for (let i = 0; i < rescue.calls.length; i++) {
                const c = rescue.calls[i];
                const repaired = repairToolArguments(c.arguments, toolSchemas.get(c.name));
                let parsedInput: any = {};
                try {
                  parsedInput = JSON.parse(repaired);
                } catch {
                  parsedInput = { raw: repaired };
                }
                contentBlocks.push({
                  type: "tool_use",
                  id: `toolu_rescued_${i + 1}`,
                  name: c.name,
                  input: parsedInput,
                });
              }
            }
          }

          if (textContent) {
            contentBlocks.push({ type: "text", text: textContent });
          } else if (msg.content && typeof msg.content !== "string") {
            contentBlocks.push({ type: "text", text: JSON.stringify(msg.content) });
          }

          if (hasToolCalls) {
            for (const tc of msg.tool_calls) {
              let parsedInput = {};
              if (tc.function?.arguments) {
                try {
                  const repaired = repairToolArguments(tc.function.arguments, toolSchemas.get(tc.function?.name));
                  parsedInput = typeof repaired === "string" ? JSON.parse(repaired) : repaired;
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
  public static openAiChunkToAnthropicEvent(
    chunk: any,
    messageId: string,
    state?: AnthropicStreamState
  ): string[] {
    const delta = chunk?.choices?.[0]?.delta;
    const finishReason = chunk?.choices?.[0]?.finish_reason;
    if (!delta && !finishReason && !chunk?.usage) return [];

    let streamState = state;
    if (!streamState) {
      streamState = AnthropicAdapter.openAiStreamStates.get(messageId);
      if (!streamState) {
        streamState = AnthropicAdapter.createStreamState(messageId);
        AnthropicAdapter.openAiStreamStates.set(messageId, streamState);
        if (AnthropicAdapter.openAiStreamStates.size > 500) {
          const oldestKey = AnthropicAdapter.openAiStreamStates.keys().next().value;
          if (oldestKey) AnthropicAdapter.openAiStreamStates.delete(oldestKey);
        }
      }
    }

    const events: string[] = [];

    // Track usage if present
    if (chunk.usage?.completion_tokens != null) {
      streamState.outputTokens = chunk.usage.completion_tokens;
    }

    // 1. Check reasoning / thinking across vendor formats:
    // reasoning_content (OpenAI, DeepSeek, GLM, Qwen)
    // reasoning (compat layers, Ollama, Groq)
    // thought (Gemini, etc.)
    // reasoning_details (MiniMax)
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
      if (streamState.currentBlockType !== null && streamState.currentBlockIndex !== null) {
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
        let toolInfo = streamState.toolCalls.get(tcIndex);

        if (tc.id && tc.function?.name && !toolInfo) {
          const toolBlockIndex = streamState.nextBlockIndex++;
          toolInfo = {
            id: tc.id,
            name: tc.function.name,
            blockIndex: toolBlockIndex,
            started: true,
          };
          streamState.toolCalls.set(tcIndex, toolInfo);

          events.push(
            `event: content_block_start\ndata: ${JSON.stringify({
              type: "content_block_start",
              index: toolBlockIndex,
              content_block: {
                type: "tool_use",
                id: tc.id,
                name: tc.function.name,
                input: {},
              },
            })}\n\n`
          );
        }

        if (tc.function?.arguments) {
          const blockIdx = toolInfo ? toolInfo.blockIndex : streamState.nextBlockIndex;
          const schema = streamState.toolSchemas?.get(toolInfo?.name || tc.function?.name);
          const sanitizedArgs = repairToolArguments(tc.function.arguments, schema);
          events.push(
            `event: content_block_delta\ndata: ${JSON.stringify({
              type: "content_block_delta",
              index: blockIdx,
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
      if (streamState.currentBlockType !== null && streamState.currentBlockIndex !== null) {
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

      AnthropicAdapter.openAiStreamStates.delete(messageId);
    }

    return events;
  }

  /**
   * Finalize an Anthropic stream if finish_reason was omitted or unclosed blocks remain
   */
  public static finalizeStream(state: AnthropicStreamState): string[] {
    if (state.messageStopSent) return [];

    const events: string[] = [];

    if (state.currentBlockType !== null && state.currentBlockIndex !== null) {
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

    events.push(
      `event: message_delta\ndata: ${JSON.stringify({
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: state.outputTokens || 0 },
      })}\n\n`
    );
    events.push(`event: message_stop\ndata: {"type":"message_stop"}\n\n`);
    state.messageStopSent = true;

    if (state.messageId) {
      AnthropicAdapter.openAiStreamStates.delete(state.messageId);
    }

    return events;
  }

  /**
   * Convert Anthropic SSE event to OpenAI SSE chunk format
   */
  public static anthropicChunkToOpenAiEvent(
    event: any,
    requestId: string,
    state?: AnthropicToOpenAiStreamState
  ): string[] {
    if (!event || !event.type) return [];
    const created = Math.floor(Date.now() / 1000);
    const chunkId = `chatcmpl-${requestId}`;
    const events: string[] = [];

    let streamState = state;
    if (!streamState) {
      streamState = AnthropicAdapter.anthropicStreamStates.get(requestId);
      if (!streamState) {
        streamState = AnthropicAdapter.createAnthropicToOpenAiState();
        AnthropicAdapter.anthropicStreamStates.set(requestId, streamState);
        if (AnthropicAdapter.anthropicStreamStates.size > 500) {
          const oldestKey = AnthropicAdapter.anthropicStreamStates.keys().next().value;
          if (oldestKey) AnthropicAdapter.anthropicStreamStates.delete(oldestKey);
        }
      }
    }

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
      AnthropicAdapter.anthropicStreamStates.delete(requestId);
      events.push("data: [DONE]\n\n");
    }

    return events;
  }
}
