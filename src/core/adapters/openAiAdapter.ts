import {
  repairToolArguments,
  toolSchemaMap,
  extractToolNames,
  type JsonSchemaish,
} from "./helpers/toolArgsRepair.js";
import { rescueInlineToolCalls } from "./helpers/toolCallRescue.js";

/**
 * OpenAI Adapter
 * Normalizes OpenAI Chat Completions requests and manages tool call resilience
 */
export class OpenAiAdapter {
  /**
   * Normalize an OpenAI request body
   */
  public static normalizeRequest(body: any, targetModel: string): any {
    return {
      ...body,
      model: targetModel,
      stream: body.stream !== undefined ? Boolean(body.stream) : true,
    };
  }

  /**
   * Format an OpenAI chunk to SSE string
   */
  public static toSseEvent(chunk: any): string {
    return `data: ${JSON.stringify(chunk)}\n\n`;
  }

  /**
   * Repair tool call arguments against schemas
   */
  public static repairToolCalls(
    toolCalls: any[],
    schemas?: Map<string, JsonSchemaish> | Array<any>
  ): any[] {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) return toolCalls;
    try {
      const schemaMap = schemas instanceof Map ? schemas : toolSchemaMap(schemas);
      for (const tc of toolCalls) {
        if (tc?.function?.arguments && typeof tc.function.arguments === "string") {
          const toolName = tc.function.name;
          const paramSchema = toolName ? schemaMap.get(toolName) : undefined;
          tc.function.arguments = repairToolArguments(tc.function.arguments, paramSchema);
        }
      }
    } catch {
      // Fail-open
    }
    return toolCalls;
  }

  /**
   * Rescue inline dialects and repair tool arguments in chat completion response
   */
  public static rescueAndRepairResponse(
    responseBody: any,
    requestTools?: Array<any>
  ): any {
    if (!responseBody || typeof responseBody !== "object") return responseBody;

    try {
      const schemas = toolSchemaMap(requestTools);
      const toolNames = extractToolNames(requestTools);

      // Handle OpenAI choices format
      if (Array.isArray(responseBody.choices)) {
        for (const choice of responseBody.choices) {
          const msg = choice?.message;
          if (!msg) continue;

          // 1. Repair existing tool calls
          if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
            OpenAiAdapter.repairToolCalls(msg.tool_calls, schemas);
            continue;
          }

          // 2. Rescue inline tool calls if text contains dialect markers or bare JSON
          if (
            typeof msg.content === "string" &&
            msg.content &&
            toolNames.size > 0
          ) {
            const rescue = rescueInlineToolCalls(msg.content, toolNames);
            if (rescue.detected && rescue.calls && rescue.calls.length > 0) {
              msg.tool_calls = rescue.calls.map((c, idx) => ({
                id: `call_rescued_${Date.now()}_${idx}`,
                type: "function",
                function: {
                  name: c.name,
                  arguments: repairToolArguments(c.arguments, schemas.get(c.name)),
                },
              }));
              msg.content = rescue.cleanText || null;
              if (choice.finish_reason === "stop" || !choice.finish_reason) {
                choice.finish_reason = "tool_calls";
              }
            }
          }
        }
      }

      // Handle Anthropic content blocks format if non-streaming Anthropic response
      if (Array.isArray(responseBody.content)) {
        let hasToolUse = false;
        for (const block of responseBody.content) {
          if (block?.type === "tool_use") {
            hasToolUse = true;
            if (block.input && typeof block.input === "object") {
              const schema = schemas.get(block.name);
              const repairedStr = repairToolArguments(JSON.stringify(block.input), schema);
              try {
                block.input = JSON.parse(repairedStr);
              } catch {
                // Keep input as-is
              }
            }
          }
        }

        // If no tool_use block, check text blocks for dialect rescue
        if (!hasToolUse && toolNames.size > 0) {
          const newBlocks: any[] = [];
          for (const block of responseBody.content) {
            if (block?.type === "text" && typeof block.text === "string") {
              const rescue = rescueInlineToolCalls(block.text, toolNames);
              if (rescue.detected && rescue.calls && rescue.calls.length > 0) {
                if (rescue.cleanText) {
                  newBlocks.push({ type: "text", text: rescue.cleanText });
                }
                for (let i = 0; i < rescue.calls.length; i++) {
                  const call = rescue.calls[i];
                  const repairedArgs = repairToolArguments(call.arguments, schemas.get(call.name));
                  let inputObj = {};
                  try {
                    inputObj = JSON.parse(repairedArgs);
                  } catch {
                    inputObj = { raw: repairedArgs };
                  }
                  newBlocks.push({
                    type: "tool_use",
                    id: `toolu_rescued_${Date.now()}_${i}`,
                    name: call.name,
                    input: inputObj,
                  });
                }
                if (responseBody.stop_reason === "end_turn" || !responseBody.stop_reason) {
                  responseBody.stop_reason = "tool_use";
                }
                continue;
              }
            }
            newBlocks.push(block);
          }
          responseBody.content = newBlocks;
        }
      }
    } catch {
      // Fail-open: return untouched
    }

    return responseBody;
  }
}
export default OpenAiAdapter;
