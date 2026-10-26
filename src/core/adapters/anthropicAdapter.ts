import {
  repairToolArguments,
  toolSchemaMap,
  extractToolNames,
  type JsonSchemaish,
} from "./helpers/toolArgsRepair.js";
import { rescueInlineToolCalls } from "./helpers/toolCallRescue.js";
import { normalizeToolParameters } from "./helpers/toolSchemaNormalize.js";

export interface AnthropicStreamState {
  messageStartSent?: boolean;
  messageId?: string;
  nextBlockIndex: number;
  currentBlockType: "thinking" | "text" | "tool_use" | null;
  currentBlockIndex: number | null;
  currentToolCallIndex?: number;
  toolCalls: Map<number, { id: string; name: string; blockIndex: number; started: boolean; stopped?: boolean }>;
  outputTokens?: number;
  messageStopSent?: boolean;
  toolSchemas?: Map<string, JsonSchemaish>;
}

export interface AnthropicToOpenAiStreamState {
  toolCallIndex: number;
  blockIndexToToolCallIndex: Map<number, number>;
  promptTokens?: number;
  cachedTokens?: number;
  cacheCreationTokens?: number;
}

function convertOpenAiContentToAnthropic(content: any): any {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content;

  return content.map((item: any) => {
    if (item?.type === "image_url" && item.image_url?.url) {
      const url = String(item.image_url.url);
      const match = url.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/s);
      if (match) {
        return {
          type: "image",
          source: {
            type: "base64",
            media_type: match[1],
            data: match[2].trim(),
          },
        };
      }
      return {
        type: "image",
        source: {
          type: "url",
          url,
        },
      };
    }
    return item;
  });
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
      currentToolCallIndex: undefined,
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
      promptTokens: 0,
      cachedTokens: 0,
      cacheCreationTokens: 0,
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
          const imageBlocks: any[] = [];

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
            } else if (block.type === "image" && block.source) {
              if (block.source.type === "base64" && block.source.data) {
                imageBlocks.push({
                  type: "image_url",
                  image_url: {
                    url: `data:${block.source.media_type || "image/png"};base64,${block.source.data}`,
                  },
                });
              } else if (block.source.type === "url" && block.source.url) {
                imageBlocks.push({
                  type: "image_url",
                  image_url: { url: block.source.url },
                });
              }
            } else if (block.type === "tool_result") {
              let toolContent = "";
              if (typeof block.content === "string") {
                toolContent = block.content;
              } else if (Array.isArray(block.content)) {
                toolContent = block.content
                  .map((c: any) => (typeof c === "string" ? c : c?.text || (c?.type === "text" ? c.text : JSON.stringify(c))))
                  .join("\n");
              } else {
                toolContent = JSON.stringify(block.content || "");
              }

              messages.push({
                role: "tool",
                tool_call_id: block.tool_use_id,
                content: toolContent,
              });
            }
          }

          const hasText = Boolean(textAccumulator.trim());
          const hasReasoning = Boolean(reasoningAccumulator.trim());
          const hasToolCalls = toolCalls.length > 0;
          const hasImages = imageBlocks.length > 0;

          if (hasText || hasReasoning || hasToolCalls || redactedThinking || hasImages) {
            let finalContent: any = textAccumulator.trim() || null;
            if (hasImages) {
              finalContent = [];
              if (textAccumulator.trim()) {
                finalContent.push({ type: "text", text: textAccumulator.trim() });
              }
              finalContent.push(...imageBlocks);
            }

            const outMsg: any = { role, content: finalContent };
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
    let systemCacheControl: any = undefined;
    const anthropicMessages: any[] = [];
    const toolSchemas = toolSchemaMap(openAiBody.tools);
    const toolNames = extractToolNames(openAiBody.tools);

    if (Array.isArray(openAiBody.messages)) {
      for (const msg of openAiBody.messages) {
        if (msg.role === "system") {
          const sysText = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content || "");
          systemPrompt = systemPrompt ? `${systemPrompt}\n${sysText}` : sysText;
          if (msg.cache_control) {
            systemCacheControl = msg.cache_control;
          }
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
          let rescuedBlocks: any[] = [];
          if (!hasToolCalls && textContent && toolNames.size > 0) {
            const rescue = rescueInlineToolCalls(textContent, toolNames);
            if (rescue.detected && rescue.calls && rescue.calls.length > 0) {
              textContent = rescue.cleanText || "";
              const timestamp = Date.now();
              for (let i = 0; i < rescue.calls.length; i++) {
                const c = rescue.calls[i];
                const repaired = repairToolArguments(c.arguments, toolSchemas.get(c.name));
                let parsedInput: any = {};
                try {
                  parsedInput = JSON.parse(repaired);
                } catch {
                  parsedInput = { raw: repaired };
                }
                if (!parsedInput || typeof parsedInput !== "object" || Array.isArray(parsedInput)) {
                  parsedInput = { input: parsedInput };
                }
                rescuedBlocks.push({
                  type: "tool_use",
                  id: `toolu_rescued_${timestamp}_${i + 1}`,
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

          if (rescuedBlocks.length > 0) {
            contentBlocks.push(...rescuedBlocks);
          }

          if (hasToolCalls) {
            for (const tc of msg.tool_calls) {
              let parsedInput: any = {};
              if (tc.function?.arguments) {
                try {
                  const repaired = repairToolArguments(tc.function.arguments, toolSchemas.get(tc.function?.name));
                  parsedInput = typeof repaired === "string" ? JSON.parse(repaired) : repaired;
                } catch {
                  parsedInput = { raw: tc.function.arguments };
                }
              }
              // Ensure Anthropic tool_use.input is strictly a JSON dictionary/object
              if (!parsedInput || typeof parsedInput !== "object" || Array.isArray(parsedInput)) {
                parsedInput = { input: parsedInput };
              }
              contentBlocks.push({
                type: "tool_use",
                id: tc.id || `toolu_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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
          content: convertOpenAiContentToAnthropic(msg.content),
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
          input_schema: normalizeToolParameters(t.function.parameters),
        }));
    }

    let formattedSystem: any = systemPrompt || undefined;
    if (systemPrompt && systemCacheControl) {
      formattedSystem = [
        {
          type: "text",
          text: systemPrompt,
          cache_control: systemCacheControl,
        },
      ];
    }

    return {
      model: openAiBody.model,
      messages: anthropicMessages,
      system: formattedSystem,
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

    if (event.type === "message_start") {
      const message = event.message;
      if (message?.usage) {
        streamState.promptTokens =
          (message.usage.input_tokens || 0) +
          (message.usage.cache_creation_input_tokens || 0) +
          (message.usage.cache_read_input_tokens || 0);
        streamState.cachedTokens = message.usage.cache_read_input_tokens || 0;
        streamState.cacheCreationTokens = message.usage.cache_creation_input_tokens || 0;
      }
      if (message?.role) {
        // Can emit empty role: assistant chunk if desired
      }
    } else if (event.type === "content_block_delta") {
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
      const stopReason = event.delta?.stop_reason;
      let finishReason: string | null = null;
      if (stopReason === "end_turn") finishReason = "stop";
      else if (stopReason === "max_tokens") finishReason = "length";
      else if (stopReason === "tool_use") finishReason = "tool_calls";
      else if (stopReason) finishReason = stopReason;

      const completionTokens = event.usage?.output_tokens || 0;
      const promptTokens = streamState.promptTokens || 0;
      const cachedTokens = streamState.cachedTokens || 0;

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
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
            ...(cachedTokens > 0 ? { prompt_tokens_details: { cached_tokens: cachedTokens } } : {}),
          },
        })}\n\n`
      );
    } else if (event.type === "message_stop") {
      AnthropicAdapter.anthropicStreamStates.delete(requestId);
      events.push("data: [DONE]\n\n");
    }

    return events;
  }

  /**
   * Convert OpenAI non-streaming chat completion to Anthropic Message response
   */
  public static openAiResponseToAnthropic(openAiResponse: any, requestId?: string): any {
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
  public static anthropicResponseToOpenAi(anthropicResponse: any, targetModel?: string): any {
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
}
