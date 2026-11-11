import { convertAnthropicImageToOpenAi } from "./imageUtils.js";

export interface AnthropicToOpenAiOptions {
  preserveCacheControl?: boolean;
}

/**
 * Translates Anthropic /v1/messages request payload to OpenAI /v1/chat/completions payload
 */
export function translateAnthropicToOpenAi(
  anthropicBody: any,
  opts: AnthropicToOpenAiOptions = {}
): any {
  const preserveCacheControl = Boolean(opts?.preserveCacheControl);
  const messages: any[] = [];

  // 1. Top-level system prompt
  if (anthropicBody.system) {
    if (
      preserveCacheControl &&
      Array.isArray(anthropicBody.system) &&
      anthropicBody.system.some((s: any) => s?.cache_control)
    ) {
      const systemParts: any[] = [];
      for (const s of anthropicBody.system) {
        const text = s?.text || "";
        if (text) {
          systemParts.push({
            type: "text",
            text,
            ...(s.cache_control ? { cache_control: s.cache_control } : {}),
          });
        } else if (s?.cache_control && systemParts.length > 0) {
          systemParts[systemParts.length - 1].cache_control = s.cache_control;
        }
      }
      if (systemParts.length > 0) {
        const content = systemParts.some((p) => p.cache_control)
          ? systemParts
          : systemParts.map((p) => p.text).join("\n");
        if (Array.isArray(content) ? content.length > 0 : content) {
          messages.push({ role: "system", content });
        }
      }
    } else {
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
        const textBlocks: Array<{ type: "text"; text: string; cache_control?: any }> = [];
        let hasTextCacheControl = false;
        let reasoningAccumulator = "";
        let thinkingSignature: string | undefined = undefined;
        let redactedThinking: string | undefined = undefined;
        const toolCalls: any[] = [];
        const imageBlocks: any[] = [];

        for (const block of msg.content) {
          if (block.type === "text") {
            textAccumulator += (block.text || "") + "\n";
            if (preserveCacheControl && block.cache_control) {
              hasTextCacheControl = true;
            }
            if (block.text) {
              textBlocks.push({
                type: "text",
                text: block.text,
                ...(preserveCacheControl && block.cache_control
                  ? { cache_control: block.cache_control }
                  : {}),
              });
            }
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
            const imgUrl = convertAnthropicImageToOpenAi(block.source);
            if (imgUrl) {
              imageBlocks.push(imgUrl);
            }
          } else if (block.type === "tool_result") {
            let toolContent = "";
            if (typeof block.content === "string") {
              toolContent = block.content;
            } else if (Array.isArray(block.content)) {
              for (const c of block.content) {
                if (c?.type === "image" && c.source) {
                  const img = convertAnthropicImageToOpenAi(c.source);
                  if (img) {
                    imageBlocks.push({
                      type: "text",
                      text: `[Image from tool result ${block.tool_use_id}]`,
                    });
                    imageBlocks.push(img);
                  }
                }
              }

              const textParts = block.content
                .filter((c: any) => c?.type !== "image")
                .map((c: any) => (typeof c === "string" ? c : c?.text || (c?.type === "text" ? c.text : JSON.stringify(c))))
                .filter(Boolean);
              toolContent = textParts.join("\n") || (imageBlocks.length > 0 ? "[Image returned]" : "");
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
          if (hasImages || (preserveCacheControl && hasTextCacheControl && textBlocks.length > 0)) {
            finalContent = [];
            if (preserveCacheControl && hasTextCacheControl && textBlocks.length > 0) {
              finalContent.push(...textBlocks);
            } else if (textAccumulator.trim()) {
              finalContent.push({ type: "text", text: textAccumulator.trim() });
            }
            if (hasImages) {
              finalContent.push(...imageBlocks);
            }
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

  const result: any = {
    model: anthropicBody.model,
    messages,
    tools,
    stream: Boolean(anthropicBody.stream),
    max_tokens: anthropicBody.max_tokens,
    temperature: anthropicBody.temperature,
  };

  const effort = anthropicBody.output_config?.effort || anthropicBody.reasoning_effort;
  if (effort) {
    result.reasoning_effort = effort;
  }

  return result;
}
