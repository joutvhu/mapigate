import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";

export const OPENCODE_GO_RESPONSES_URL = "https://opencode.ai/inference/go/openai/v1/responses";
const MAX_TOOL_NAME_LEN = 128;
const MAX_CALL_ID_LEN = 64;

const RESPONSES_ONLY_MODELS = new Set([
  "grok-4.7",
  "grok-4.6",
  "grok-4.5",
  "gpt-5.6-luna",
  "gpt-6-luna",
  "muse-spark-1.2-contributor",
  "muse-spark-1.3-contributor",
]);

export function isOpenCodeGoResponsesModel(model?: string): boolean {
  if (!model) return false;
  const clean = model.replace(/\([^()]+\)\s*$/, "").trim().toLowerCase();
  return (
    RESPONSES_ONLY_MODELS.has(clean) ||
    clean.startsWith("muse-spark-") ||
    clean.startsWith("grok-4.") ||
    clean.startsWith("gpt-6-luna") ||
    clean.startsWith("gpt-5.6-luna")
  );
}

function clampCallId(id: unknown): string {
  const str = typeof id === "string" && id.trim() ? id.trim() : `call_${Date.now()}`;
  return str.slice(0, MAX_CALL_ID_LEN);
}

function coerceOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (output == null) return "";
  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
}

function coerceArgs(args: unknown): string {
  if (typeof args === "string") return args || "{}";
  if (args == null) return "{}";
  try {
    return JSON.stringify(args);
  } catch {
    return "{}";
  }
}

function normalizeTools(tools: any[]): any[] {
  const out: any[] = [];
  for (const tool of tools) {
    if (!tool || typeof tool !== "object" || Array.isArray(tool)) continue;
    const fn = tool.function && typeof tool.function === "object" && !Array.isArray(tool.function) ? tool.function : null;
    const name = String(typeof tool.name === "string" ? tool.name : fn?.name || "").trim();
    if (!name) continue;
    const description = typeof tool.description === "string" ? tool.description : fn?.description;
    const parameters =
      tool.parameters && typeof tool.parameters === "object" && !Array.isArray(tool.parameters)
        ? { ...tool.parameters }
        : fn?.parameters && typeof fn.parameters === "object" && !Array.isArray(fn.parameters)
        ? { ...fn.parameters }
        : { type: "object", properties: {} };
    if (parameters.type === "object" && !parameters.properties) {
      parameters.properties = {};
    }
    out.push({
      type: "function",
      name: name.slice(0, MAX_TOOL_NAME_LEN),
      ...(description ? { description } : {}),
      parameters,
    });
  }
  return out;
}

function messagesToResponsesInput(messages: any[]): { instructions?: string; input: any[] } {
  const sysParts: string[] = [];
  const input: any[] = [];

  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    if (msg.role === "system" || msg.role === "developer") {
      const text =
        typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
          ? msg.content.map((c: any) => (typeof c === "string" ? c : c?.text || "")).filter(Boolean).join("\n")
          : "";
      if (text) sysParts.push(text);
      continue;
    }

    if (msg.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: clampCallId(msg.tool_call_id),
        output: coerceOutput(msg.content),
      });
      continue;
    }

    if (msg.role === "assistant") {
      const text =
        typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
          ? msg.content.map((c: any) => (typeof c === "string" ? c : c?.text || "")).filter(Boolean).join("\n")
          : "";
      if (text) {
        input.push({ type: "message", role: "assistant", content: [{ type: "output_text", text }] });
      }
      if (Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          const fn = tc?.function || {};
          const name = String(fn.name || tc?.name || "").trim();
          if (!name) continue;
          input.push({
            type: "function_call",
            call_id: clampCallId(tc.id),
            name: name.slice(0, MAX_TOOL_NAME_LEN),
            arguments: coerceArgs(fn.arguments ?? tc.arguments),
          });
        }
      }
      continue;
    }

    const parts: any[] = [];
    if (typeof msg.content === "string") {
      if (msg.content) parts.push({ type: "input_text", text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (typeof part === "string") {
          parts.push({ type: "input_text", text: part });
        } else if (part?.type === "text" || part?.type === "input_text") {
          if (part.text) parts.push({ type: "input_text", text: part.text });
        } else if (part?.type === "image_url" && part.image_url?.url) {
          parts.push({ type: "input_image", image_url: part.image_url.url });
        } else if (part?.type === "input_image") {
          parts.push(part);
        }
      }
    }
    if (parts.length > 0) {
      input.push({ type: "message", role: "user", content: parts });
    }
  }

  return {
    instructions: sysParts.length > 0 ? sysParts.join("\n\n") : undefined,
    input,
  };
}

function normalizeToolChoice(rawChoice: any, tools: any[]): any {
  if (rawChoice === undefined || rawChoice === null) return undefined;
  if (typeof rawChoice === "string") {
    return rawChoice;
  }
  if (typeof rawChoice === "object" && !Array.isArray(rawChoice)) {
    if (rawChoice.type === "auto" || rawChoice.type === "required" || rawChoice.type === "none") {
      return rawChoice.type;
    }
    const rawName =
      typeof rawChoice.name === "string"
        ? rawChoice.name
        : typeof rawChoice.function?.name === "string"
        ? rawChoice.function.name
        : "";
    const clampedName = rawName.trim().slice(0, MAX_TOOL_NAME_LEN);
    if (!clampedName) return undefined;
    if (!tools.some((t) => t.name === clampedName)) return undefined;
    return { type: "function", name: clampedName };
  }
  return undefined;
}

function mapResponseFormatToText(baseBody: any): Record<string, any> | undefined {
  let textObj =
    baseBody.text && typeof baseBody.text === "object" && !Array.isArray(baseBody.text)
      ? { ...baseBody.text }
      : undefined;

  const rf = baseBody.response_format;
  if (rf && typeof rf === "object" && !Array.isArray(rf)) {
    let format: Record<string, any> | undefined;
    if (rf.type === "json_object") {
      format = { type: "json_object" };
    } else if (rf.type === "text") {
      format = { type: "text" };
    } else if (rf.type === "json_schema") {
      const js = rf.json_schema && typeof rf.json_schema === "object" ? rf.json_schema : rf;
      format = {
        type: "json_schema",
        name: typeof js.name === "string" && js.name.trim() ? js.name.trim() : "response_schema",
        ...(js.schema && typeof js.schema === "object" ? { schema: js.schema } : {}),
        ...(js.strict !== undefined ? { strict: Boolean(js.strict) } : {}),
        ...(typeof js.description === "string" && js.description ? { description: js.description } : {}),
      };
    }
    if (format) {
      textObj = { ...(textObj || {}), format };
    }
  }

  return textObj;
}

export function buildOpenCodeGoResponsesPayload(rawBody: any, model: string, clientFormat: string): any {
  const baseBody =
    clientFormat === "anthropic" ? AnthropicAdapter.anthropicToOpenAi(rawBody) : { ...(rawBody || {}) };

  let input: any[] = [];
  let instructions: string | undefined = typeof baseBody.instructions === "string" ? baseBody.instructions : undefined;

  if (Array.isArray(baseBody.input)) {
    input = baseBody.input
      .filter((item: any) => !(item && typeof item === "object" && item.type === "reasoning"))
      .map((item: any) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return item;
        const copy = { ...item };
        delete copy.encrypted_content;
        delete copy.reasoning_encrypted_content;
        if (copy.type === "function_call") {
          if (!copy.name || typeof copy.name !== "string" || !copy.name.trim()) return null;
          copy.name = copy.name.trim().slice(0, MAX_TOOL_NAME_LEN);
          copy.call_id = clampCallId(copy.call_id);
          copy.arguments = coerceArgs(copy.arguments);
        } else if (copy.type === "function_call_output") {
          copy.call_id = clampCallId(copy.call_id);
          copy.output = coerceOutput(copy.output);
        }
        return copy;
      })
      .filter(Boolean);
  } else if (typeof baseBody.input === "string") {
    input = [{ type: "message", role: "user", content: [{ type: "input_text", text: baseBody.input || "..." }] }];
  } else if (Array.isArray(baseBody.messages)) {
    const converted = messagesToResponsesInput(baseBody.messages);
    input = converted.input;
    if (!instructions && converted.instructions) instructions = converted.instructions;
  }

  if (input.length === 0) {
    input = [{ type: "message", role: "user", content: [{ type: "input_text", text: "..." }] }];
  }

  const out: Record<string, any> = { model, input, stream: true, store: false };
  if (instructions) out.instructions = instructions;

  const maxOut = baseBody.max_output_tokens ?? baseBody.max_completion_tokens ?? baseBody.max_tokens;
  if (maxOut !== undefined) out.max_output_tokens = maxOut;
  if (baseBody.temperature !== undefined && !/^gpt-/i.test(model)) {
    out.temperature = baseBody.temperature;
  }
  if (baseBody.top_p !== undefined) out.top_p = baseBody.top_p;

  const textConfig = mapResponseFormatToText(baseBody);
  if (textConfig) out.text = textConfig;

  if (baseBody.reasoning && typeof baseBody.reasoning === "object" && !Array.isArray(baseBody.reasoning)) {
    out.reasoning = { summary: "auto", ...baseBody.reasoning };
  } else if (baseBody.reasoning_effort !== undefined) {
    out.reasoning = { effort: baseBody.reasoning_effort, summary: "auto" };
  }

  if (Array.isArray(baseBody.tools) && baseBody.tools.length > 0) {
    const tools = normalizeTools(baseBody.tools);
    if (tools.length > 0) {
      out.tools = tools;
      const normalizedChoice = normalizeToolChoice(baseBody.tool_choice, tools);
      if (normalizedChoice !== undefined) {
        out.tool_choice = normalizedChoice;
      }
    }
  }

  return out;
}
