import { resolveKiroServiceRegion } from "./models.js";
import { extractPlainTextContent } from "../../../shared/utils/extractText.js";

export type KiroCreateResponseMode = "auto" | "always" | "off";

export function getKiroCreateResponseMode(): KiroCreateResponseMode {
  const raw = (process.env.MAPIGATE_KIRO_CREATE_RESPONSE || "auto").trim().toLowerCase();
  if (raw === "always") return "always";
  if (raw === "off" || raw === "false" || raw === "0") return "off";
  return "auto";
}

export function isKiroUserRateExceeded(status: number, errText: string): boolean {
  return status === 429 && typeof errText === "string" && errText.includes("USER_REQUEST_RATE_EXCEEDED");
}

export function buildKiroCreateResponseUrl(region: string): string {
  const runtimeRegion = resolveKiroServiceRegion("runtime", region || "us-east-1");
  return `https://runtime.${runtimeRegion}.kiro.dev/v1/responses`;
}

export function buildKiroCreateResponsePayload(
  body: any,
  upstreamModel: string,
  isStreaming: boolean
): Record<string, any> {
  const payload: Record<string, any> = {
    model: upstreamModel,
    stream: isStreaming,
  };

  if (Array.isArray(body?.input)) {
    payload.input = body.input;
    if (body.instructions) payload.instructions = body.instructions;
  } else if (Array.isArray(body?.messages)) {
    const systemParts: string[] = [];
    const inputItems: any[] = [];

    for (const msg of body.messages) {
      if (!msg) continue;
      if (msg.role === "system" || msg.role === "developer") {
        const txt = extractPlainTextContent(msg.content);
        if (txt) systemParts.push(txt);
        continue;
      }

      if (msg.role === "user") {
        if (Array.isArray(msg.content)) {
          const parts = msg.content.map((c: any) => {
            if (c?.type === "text") return { type: "input_text", text: c.text ?? "" };
            if (c?.type === "image_url") {
              return {
                type: "input_image",
                image_url: c.image_url?.url || "",
                ...(c.image_url?.detail ? { detail: c.image_url.detail } : {}),
              };
            }
            return c;
          });
          inputItems.push({ type: "message", role: "user", content: parts });
        } else {
          inputItems.push({
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: String(msg.content ?? "") }],
          });
        }
      } else if (msg.role === "assistant") {
        const text = extractPlainTextContent(msg.content);
        if (text) {
          inputItems.push({
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text }],
          });
        }
        if (Array.isArray(msg.tool_calls)) {
          for (const tc of msg.tool_calls) {
            if (!tc?.function?.name) continue;
            inputItems.push({
              type: "function_call",
              call_id: tc.id || `call_${Date.now()}`,
              name: tc.function.name,
              arguments:
                typeof tc.function.arguments === "string"
                  ? tc.function.arguments
                  : JSON.stringify(tc.function.arguments ?? {}),
            });
          }
        }
      } else if (msg.role === "tool") {
        inputItems.push({
          type: "function_call_output",
          call_id: msg.tool_call_id || "",
          output: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? ""),
        });
      }
    }

    if (systemParts.length > 0) {
      payload.instructions = systemParts.join("\n\n");
    }
    payload.input = inputItems;
  }

  if (Array.isArray(body?.tools) && body.tools.length > 0) {
    payload.tools = body.tools.map((t: any) => {
      if (t?.type === "function" && t.function) {
        return {
          type: "function",
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        };
      }
      return t;
    });
  }

  if (body?.tool_choice !== undefined) {
    payload.tool_choice = body.tool_choice;
  }

  const maxTokens = body?.max_output_tokens ?? body?.max_tokens;
  if (maxTokens !== undefined) payload.max_output_tokens = maxTokens;
  if (body?.temperature !== undefined) payload.temperature = body.temperature;
  if (body?.top_p !== undefined) payload.top_p = body.top_p;

  return payload;
}

export function responsesApiToOpenAiResponse(data: any, model: string): any {
  const output: any[] = Array.isArray(data?.output) ? data.output : [];
  let contentText = "";
  let reasoningText = "";
  const toolCalls: any[] = [];

  for (const item of output) {
    if (!item) continue;
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (part?.type === "output_text" || part?.type === "text") {
          contentText += part.text || "";
        }
      }
    } else if (item.type === "reasoning") {
      const parts = Array.isArray(item.summary) ? item.summary : Array.isArray(item.content) ? item.content : [];
      for (const part of parts) {
        if (part?.text) reasoningText += part.text;
      }
    } else if (item.type === "function_call") {
      toolCalls.push({
        id: item.call_id || item.id || `call_${Date.now()}`,
        type: "function",
        function: {
          name: item.name || "",
          arguments: typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments ?? {}),
        },
      });
    }
  }

  const usage = data?.usage || {};
  const promptTokens = usage.input_tokens ?? 0;
  const completionTokens = usage.output_tokens ?? 0;

  return {
    id: data?.id ? `chatcmpl-${data.id}` : `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: data?.created_at || Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: contentText || null,
          ...(reasoningText ? { reasoning_content: reasoningText } : {}),
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}
