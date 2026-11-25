import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import { extractSessionId } from "../../../server/proxy/executorHelpers.js";
import type { ProviderRequestContext } from "../types.js";

const THINKING_SUFFIX_RE = /^(.*?)\((none|minimal|low|medium|high|xhigh)\)$/i;
const VALID_REASONING_EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh"]);
const MAX_CALL_ID_LEN = 64;

export interface ResponsesPayloadOptions {
  defaultInstructions?: string;
  forceStoreFalse?: boolean;
  omitStore?: boolean;
  forceStream?: boolean;
  allowMaxOutputTokens?: boolean;
  allowSamplingParams?: boolean;
  stripGptTemperature?: boolean;
  includePromptCacheKey?: boolean;
  maxToolNameLen?: number;
}

function clampCallId(id: unknown): string {
  const str = typeof id === "string" && id.trim() ? id.trim() : `call_${Date.now()}`;
  return str.slice(0, MAX_CALL_ID_LEN);
}

function coerceString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value == null) return fallback;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part: any) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object") {
        if (typeof part.text === "string") return part.text;
        if (typeof part.content === "string") return part.content;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function convertUserOrDeveloperParts(content: unknown): any[] {
  if (typeof content === "string") {
    return content ? [{ type: "input_text", text: content }] : [];
  }
  if (!Array.isArray(content)) return [];
  const parts: any[] = [];
  for (const part of content) {
    if (typeof part === "string") {
      if (part) parts.push({ type: "input_text", text: part });
    } else if (part?.type === "text" || part?.type === "input_text") {
      if (typeof part.text === "string" && part.text) {
        parts.push({ type: "input_text", text: part.text });
      }
    } else if (part?.type === "image_url" && part.image_url?.url) {
      parts.push({ type: "input_image", image_url: part.image_url.url });
    } else if (part?.type === "input_image") {
      parts.push(part);
    }
  }
  return parts;
}

function convertToolOutputParts(output: unknown): { output: string; images: any[] } {
  if (typeof output === "string") {
    return { output, images: [] };
  }
  if (Array.isArray(output)) {
    const textParts: string[] = [];
    const images: any[] = [];
    for (const part of output) {
      if (!part) continue;
      if (typeof part === "string") {
        textParts.push(part);
      } else if (part.type === "input_image") {
        const url = part.image_url || part.file_id || "";
        if (url) images.push({ type: "input_image", image_url: url });
      } else if (part.type === "image_url" && part.image_url?.url) {
        images.push({ type: "input_image", image_url: part.image_url.url });
      } else if (part.type === "input_text" || part.type === "output_text" || part.type === "text") {
        if (part.text) textParts.push(part.text);
      } else {
        textParts.push(coerceString(part));
      }
    }
    return {
      output: textParts.filter(Boolean).join("\n") || (images.length > 0 ? "[Image returned]" : ""),
      images,
    };
  }
  return { output: coerceString(output, ""), images: [] };
}

function messagesToResponsesInput(messages: any[]): { instructions?: string; input: any[] } {
  const sysParts: string[] = [];
  const input: any[] = [];

  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;

    if (msg.role === "system") {
      const text = extractTextFromContent(msg.content);
      if (text.trim()) sysParts.push(text);
      continue;
    }

    if (msg.role === "tool") {
      const { output, images } = convertToolOutputParts(msg.content);
      input.push({
        type: "function_call_output",
        call_id: clampCallId(msg.tool_call_id),
        output,
      });
      if (images.length > 0) {
        input.push({
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: msg.tool_call_id ? `[Image from tool result ${msg.tool_call_id}]` : "[Image from tool result]" },
            ...images,
          ],
        });
      }
      continue;
    }

    if (msg.role === "assistant") {
      const text = extractTextFromContent(msg.content);
      if (text) {
        input.push({
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text }],
        });
      }
      if (Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          const fn = tc?.function || {};
          const name = String(fn.name || tc?.name || "").trim();
          if (!name) continue;
          input.push({
            type: "function_call",
            call_id: clampCallId(tc.id),
            name,
            arguments: coerceString(fn.arguments ?? tc.arguments, "{}") || "{}",
          });
        }
      }
      continue;
    }

    const role = msg.role === "developer" ? "developer" : "user";
    const parts = convertUserOrDeveloperParts(msg.content);
    if (parts.length > 0) {
      input.push({ type: "message", role, content: parts });
    }
  }

  return {
    instructions: sysParts.length > 0 ? sysParts.join("\n\n") : undefined,
    input,
  };
}

function normalizeToolsForResponses(tools: any[], maxToolNameLen?: number): any[] {
  const out: any[] = [];
  for (const tool of tools) {
    if (!tool || typeof tool !== "object" || Array.isArray(tool)) continue;
    const fn =
      tool.function && typeof tool.function === "object" && !Array.isArray(tool.function)
        ? tool.function
        : null;
    if (!fn && tool.type && tool.type !== "function" && !tool.name) {
      out.push({ ...tool });
      continue;
    }
    const rawName = String(typeof tool.name === "string" ? tool.name : fn?.name || "").trim();
    if (!rawName) continue;
    const name = maxToolNameLen ? rawName.slice(0, maxToolNameLen) : rawName;
    const description = typeof tool.description === "string" ? tool.description : fn?.description;
    const rawParams =
      tool.parameters && typeof tool.parameters === "object" && !Array.isArray(tool.parameters)
        ? { ...tool.parameters }
        : fn?.parameters && typeof fn.parameters === "object" && !Array.isArray(fn.parameters)
        ? { ...fn.parameters }
        : { type: "object", properties: {} };
    if (rawParams.type === "object" && !rawParams.properties) {
      rawParams.properties = {};
    }
    const strict = tool.strict !== undefined ? tool.strict : fn?.strict;
    out.push({
      type: "function",
      name,
      ...(description ? { description } : {}),
      parameters: rawParams,
      ...(strict !== undefined ? { strict: Boolean(strict) } : {}),
    });
  }
  return out;
}

function normalizeToolChoiceForResponses(rawChoice: any, tools: any[]): any {
  if (rawChoice === undefined || rawChoice === null) return undefined;
  if (typeof rawChoice === "string") return rawChoice;
  if (typeof rawChoice === "object" && !Array.isArray(rawChoice)) {
    if (rawChoice.type === "auto" || rawChoice.type === "required" || rawChoice.type === "none") {
      return rawChoice.type;
    }
    const name = String(
      typeof rawChoice.name === "string"
        ? rawChoice.name
        : typeof rawChoice.function?.name === "string"
        ? rawChoice.function.name
        : ""
    ).trim();
    if (!name) return undefined;
    if (!tools.some((t) => t.name === name)) return undefined;
    return { type: "function", name };
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

export function buildResponsesRequestPayload(
  context: ProviderRequestContext,
  upstreamModel: string,
  options: ResponsesPayloadOptions = {}
): Record<string, any> {
  const rawBody = context.body || {};
  const hasNativeInput = Array.isArray(rawBody.input);
  const baseBody =
    context.clientFormat === "anthropic" && !hasNativeInput
      ? AnthropicAdapter.anthropicToOpenAi(rawBody)
      : { ...rawBody };

  const suffixMatch = (upstreamModel || context.targetModel || "").match(THINKING_SUFFIX_RE);
  const cleanModel = suffixMatch ? suffixMatch[1] : upstreamModel || context.targetModel;
  const suffixEffort = suffixMatch ? suffixMatch[2].toLowerCase() : undefined;

  let input: any[] = [];
  let instructions =
    typeof baseBody.instructions === "string" && baseBody.instructions.trim()
      ? baseBody.instructions
      : undefined;

  if (Array.isArray(baseBody.input)) {
    input = baseBody.input
      .map((item: any) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return item;
        const copy = { ...item };
        if (copy.type === "function_call") {
          if (!copy.name || typeof copy.name !== "string" || !copy.name.trim()) return null;
          copy.name = copy.name.trim();
          copy.call_id = clampCallId(copy.call_id);
          copy.arguments = coerceString(copy.arguments, "{}") || "{}";
        } else if (copy.type === "function_call_output") {
          copy.call_id = clampCallId(copy.call_id);
          copy.output = convertToolOutputParts(copy.output).output;
        }
        return copy;
      })
      .filter(Boolean);
  } else if (typeof baseBody.input === "string") {
    input = [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: baseBody.input.trim() || "..." }],
      },
    ];
  } else if (Array.isArray(baseBody.messages)) {
    const converted = messagesToResponsesInput(baseBody.messages);
    input = converted.input;
    if (!instructions && converted.instructions) {
      instructions = converted.instructions;
    }
  }

  if (input.length === 0) {
    input = [{ type: "message", role: "user", content: [{ type: "input_text", text: "..." }] }];
  }

  const resolvedStream = options.forceStream
    ? true
    : context.isPanel
    ? false
    : baseBody.stream !== false;

  const out: Record<string, any> = {
    model: cleanModel,
    input,
    stream: resolvedStream,
  };

  if (!options.omitStore) {
    out.store = options.forceStoreFalse !== false ? false : Boolean(baseBody.store);
  }

  const finalInstructions = instructions || options.defaultInstructions;
  if (finalInstructions) {
    out.instructions = finalInstructions;
  }

  if (options.allowMaxOutputTokens) {
    const maxOut = baseBody.max_output_tokens ?? baseBody.max_completion_tokens ?? baseBody.max_tokens;
    if (maxOut !== undefined) out.max_output_tokens = maxOut;
  }

  if (options.allowSamplingParams) {
    const isGpt = /^(?:gpt-|o[134](?:-|$)|codex)/i.test(cleanModel);
    if (baseBody.temperature !== undefined && !(options.stripGptTemperature && isGpt)) {
      out.temperature = baseBody.temperature;
    }
    if (baseBody.top_p !== undefined && !(options.stripGptTemperature && isGpt)) {
      out.top_p = baseBody.top_p;
    }
  }

  if (typeof baseBody.parallel_tool_calls === "boolean") {
    out.parallel_tool_calls = baseBody.parallel_tool_calls;
  }

  const textConfig = mapResponseFormatToText(baseBody);
  if (textConfig) {
    out.text = textConfig;
  }

  if (baseBody.reasoning && typeof baseBody.reasoning === "object" && !Array.isArray(baseBody.reasoning)) {
    out.reasoning = { summary: "auto", ...baseBody.reasoning };
  } else {
    const effort =
      typeof baseBody.reasoning_effort === "string"
        ? baseBody.reasoning_effort.toLowerCase().trim()
        : suffixEffort;
    if (effort && VALID_REASONING_EFFORTS.has(effort)) {
      out.reasoning = { effort, summary: "auto" };
    }
  }

  if (Array.isArray(baseBody.tools) && baseBody.tools.length > 0) {
    const tools = normalizeToolsForResponses(baseBody.tools, options.maxToolNameLen);
    if (tools.length > 0) {
      out.tools = tools;
      const normalizedChoice = normalizeToolChoiceForResponses(baseBody.tool_choice, tools);
      if (normalizedChoice !== undefined) {
        out.tool_choice = normalizedChoice;
      }
    }
  }

  if (options.includePromptCacheKey) {
    const cacheKey =
      typeof baseBody.prompt_cache_key === "string" && baseBody.prompt_cache_key.trim()
        ? baseBody.prompt_cache_key.trim()
        : extractSessionId(context.req, baseBody);
    if (cacheKey) {
      out.prompt_cache_key = cacheKey;
    }
  }

  return out;
}
