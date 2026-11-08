import {
  repairToolArguments,
  toolSchemaMap,
  extractToolNames,
} from "../helpers/toolArgsRepair.js";
import { rescueInlineToolCalls } from "../helpers/toolCallRescue.js";
import { normalizeToolParameters } from "../helpers/toolSchemaNormalize.js";
import { convertOpenAiContentToAnthropic } from "./imageUtils.js";
import { getCapabilitiesForModel } from "../../capabilities/index.js";

export const DEFAULT_MAX_TOKENS = 64000;
export const DEFAULT_MIN_TOKENS = 32000;

/**
 * Adjust max_tokens based on request context and model ceiling.
 * Parity with 9router:
 * - Default maxTokens: 64,000 (when client does not pass max_tokens)
 * - Tool calling floor: auto-raise to at least 32,000 to prevent truncated tool args
 * - Thinking buffer: ensure max_tokens > thinking.budget_tokens + 1024
 * - Clamped at model capability maxOutput ceiling
 */
export function adjustMaxTokens(
  body: any,
  ceiling: number = DEFAULT_MAX_TOKENS
): number {
  let maxTokens = body.max_tokens ?? body.max_completion_tokens ?? DEFAULT_MAX_TOKENS;

  // Auto-increase for tool calling to prevent truncated arguments (min never above ceiling)
  if (body.tools && Array.isArray(body.tools) && body.tools.length > 0) {
    if (maxTokens < DEFAULT_MIN_TOKENS) {
      maxTokens = Math.min(DEFAULT_MIN_TOKENS, ceiling);
    }
  }

  // Ensure max_tokens > thinking.budget_tokens (Claude API requirement)
  if (body.thinking?.budget_tokens && maxTokens <= body.thinking.budget_tokens) {
    maxTokens = body.thinking.budget_tokens + 1024;
  }

  // Never exceed the ceiling
  if (maxTokens > ceiling) maxTokens = ceiling;

  if (body.thinking?.budget_tokens && body.thinking.budget_tokens >= maxTokens) {
    body.thinking.budget_tokens = Math.max(1024, maxTokens - 1024);
  }

  return maxTokens;
}

/**
 * Translates OpenAI /v1/chat/completions payload to Anthropic /v1/messages payload
 */
export function translateOpenAiToAnthropic(
  openAiBody: any,
  modelOverride?: string,
  providerId?: string | null
): any {
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
        let toolContent: any = msg.content;
        if (typeof toolContent === "string") {
          // keep string as is
        } else if (Array.isArray(toolContent)) {
          toolContent = convertOpenAiContentToAnthropic(toolContent);
        } else {
          toolContent = JSON.stringify(toolContent || "");
        }

        const toolResultBlock: any = {
          type: "tool_result",
          tool_use_id: msg.tool_call_id,
          content: toolContent,
        };
        if (msg.is_error !== undefined) {
          toolResultBlock.is_error = Boolean(msg.is_error);
        }

        const lastMsg = anthropicMessages[anthropicMessages.length - 1];
        if (lastMsg && lastMsg.role === "user") {
          if (Array.isArray(lastMsg.content)) {
            lastMsg.content.push(toolResultBlock);
          } else {
            const existingText = typeof lastMsg.content === "string" ? lastMsg.content : "";
            lastMsg.content = existingText
              ? [{ type: "text", text: existingText }, toolResultBlock]
              : [toolResultBlock];
          }
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

        const assistantContent =
          contentBlocks.length === 1 && contentBlocks[0].type === "text"
            ? contentBlocks[0].text
            : contentBlocks.length > 0
            ? contentBlocks
            : "...";

        const lastMsg = anthropicMessages[anthropicMessages.length - 1];
        if (lastMsg && lastMsg.role === "assistant") {
          const existingBlocks = Array.isArray(lastMsg.content)
            ? lastMsg.content
            : typeof lastMsg.content === "string" && lastMsg.content
            ? [{ type: "text", text: lastMsg.content }]
            : [];
          const newBlocks = Array.isArray(assistantContent)
            ? assistantContent
            : typeof assistantContent === "string" && assistantContent
            ? [{ type: "text", text: assistantContent }]
            : [];
          lastMsg.content = [...existingBlocks, ...newBlocks];
        } else {
          anthropicMessages.push({
            role: "assistant",
            content: assistantContent,
          });
        }
        continue;
      }

      // Default role: user
      const userContent = convertOpenAiContentToAnthropic(msg.content);
      const lastMsg = anthropicMessages[anthropicMessages.length - 1];
      if (lastMsg && lastMsg.role === "user") {
        const existingBlocks = Array.isArray(lastMsg.content)
          ? lastMsg.content
          : typeof lastMsg.content === "string" && lastMsg.content
          ? [{ type: "text", text: lastMsg.content }]
          : [];
        const newBlocks = Array.isArray(userContent)
          ? userContent
          : typeof userContent === "string" && userContent
          ? [{ type: "text", text: userContent }]
          : [];
        lastMsg.content = [...existingBlocks, ...newBlocks];
      } else {
        anthropicMessages.push({
          role: "user",
          content: userContent,
        });
      }
    }
  }

  // Clean empty content messages
  for (const m of anthropicMessages) {
    if (!m.content || (Array.isArray(m.content) && m.content.length === 0)) {
      m.content = "...";
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

  const targetModel = modelOverride || openAiBody?.model;
  const caps = getCapabilitiesForModel(providerId, targetModel);
  const ceiling = caps?.maxOutput > 0 ? caps.maxOutput : DEFAULT_MAX_TOKENS;

  const result: any = {
    model: openAiBody.model,
    messages: anthropicMessages,
    system: formattedSystem,
    tools: tools && tools.length > 0 ? tools : undefined,
    max_tokens: adjustMaxTokens(openAiBody, ceiling),
    temperature: openAiBody.temperature,
    stream: Boolean(openAiBody.stream),
  };

  if (openAiBody.reasoning_effort) {
    result.output_config = { effort: openAiBody.reasoning_effort };
  }

  return result;
}
