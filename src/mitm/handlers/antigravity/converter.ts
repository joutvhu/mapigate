export interface GeminiFunctionCall {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
}

export interface GeminiFunctionResponse {
  id?: string;
  name: string;
  response?: unknown;
}

export interface GeminiInlineData {
  mimeType?: string;
  data?: string;
}

export interface GeminiPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  thought_signature?: string;
  functionCall?: GeminiFunctionCall;
  functionResponse?: GeminiFunctionResponse;
  inlineData?: GeminiInlineData;
}

export interface GeminiContent {
  role?: string;
  parts?: GeminiPart[];
}

export interface GeminiGenerationConfig {
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
}

export interface GeminiFunctionDeclaration {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  parametersJsonSchema?: Record<string, unknown>;
}

export interface GeminiTool {
  functionDeclarations?: GeminiFunctionDeclaration[];
}

export interface GeminiToolConfig {
  functionCallingConfig?: {
    mode?: string;
    allowedFunctionNames?: string[];
  };
}

export interface GeminiRequestBody {
  systemInstruction?: GeminiContent;
  contents?: GeminiContent[];
  generationConfig?: GeminiGenerationConfig;
  tools?: GeminiTool[];
  toolConfig?: GeminiToolConfig;
  request?: GeminiRequestBody;
  [key: string]: unknown;
}

export interface OpenAIChatToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<Record<string, unknown>> | null;
  tool_calls?: OpenAIChatToolCall[];
  tool_call_id?: string;
}

export interface OpenAIChatTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface OpenAIChatBody {
  model: string;
  messages: OpenAIChatMessage[];
  stream: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string[];
  tools?: OpenAIChatTool[];
  tool_choice?: unknown;
}

export interface GeminiStreamState {
  toolCalls: Map<number, { id: string; name: string; arguments: string }>;
}

export function createGeminiStreamState(): GeminiStreamState {
  return { toolCalls: new Map() };
}

/**
 * Unwrap CloudCode-PA request envelope (`.request`) if present;
 * otherwise return top-level Gemini request body.
 */
export function resolveGeminiSource(body: GeminiRequestBody): GeminiRequestBody {
  const inner = body?.request;
  if (
    inner &&
    typeof inner === "object" &&
    ("contents" in inner || "systemInstruction" in inner || "generationConfig" in inner || "tools" in inner)
  ) {
    return inner;
  }
  return body;
}

export function joinPartsText(parts?: GeminiPart[]): string {
  return (parts || [])
    .filter((p) => !p.thought)
    .map((p) => p.text)
    .filter((t): t is string => Boolean(t))
    .join("\n");
}

function serializeFunctionResponse(response: unknown): string {
  if (response == null) return "";
  if (typeof response === "string") return response;
  if (typeof response === "object" && !Array.isArray(response)) {
    const obj = response as Record<string, unknown>;
    if ("result" in obj && Object.keys(obj).length === 1) {
      return typeof obj.result === "string" ? obj.result : JSON.stringify(obj.result ?? "");
    }
  }
  return JSON.stringify(response);
}

function parseToolArguments(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return { value: parsed };
    } catch {
      return { raw: trimmed };
    }
  }
  return {};
}

/**
 * Convert Gemini GenerateContent body to OpenAI Chat Completions body.
 */
export function convertGeminiToOpenAI(
  geminiBody: GeminiRequestBody,
  model: string,
  stream: boolean
): OpenAIChatBody {
  const src = resolveGeminiSource(geminiBody);
  const messages: OpenAIChatMessage[] = [];

  // System instruction
  if (src.systemInstruction) {
    const systemText = joinPartsText(src.systemInstruction.parts);
    if (systemText) messages.push({ role: "system", content: systemText });
  }

  const pendingCallIdsByName = new Map<string, string[]>();

  // Chat turns
  const contents = src.contents || [];
  for (let turnIdx = 0; turnIdx < contents.length; turnIdx++) {
    const content = contents[turnIdx];
    const parts = content.parts || [];

    if (content.role === "model") {
      const textContent = joinPartsText(parts);
      const toolCalls: OpenAIChatToolCall[] = [];

      for (let partIdx = 0; partIdx < parts.length; partIdx++) {
        const fc = parts[partIdx]?.functionCall;
        if (!fc?.name) continue;
        const callId = fc.id || `call_${turnIdx}_${partIdx}_${fc.name}`;
        const queue = pendingCallIdsByName.get(fc.name) || [];
        queue.push(callId);
        pendingCallIdsByName.set(fc.name, queue);

        toolCalls.push({
          id: callId,
          type: "function",
          function: {
            name: fc.name,
            arguments: JSON.stringify(fc.args ?? {}),
          },
        });
      }

      if (toolCalls.length > 0) {
        messages.push({
          role: "assistant",
          content: textContent || null,
          tool_calls: toolCalls,
        });
      } else {
        messages.push({ role: "assistant", content: textContent });
      }
      continue;
    }

    // User / tool response turn
    const fnResponses = parts.filter((p) => p.functionResponse);
    for (const part of fnResponses) {
      const fr = part.functionResponse!;
      const queue = fr.name ? pendingCallIdsByName.get(fr.name) : undefined;
      const callId = fr.id || queue?.shift() || `call_${fr.name || "tool"}`;
      messages.push({
        role: "tool",
        tool_call_id: callId,
        content: serializeFunctionResponse(fr.response),
      });
    }

    const nonFnParts = parts.filter((p) => !p.functionResponse && !p.thought);
    const hasInlineData = nonFnParts.some((p) => p.inlineData?.data);

    if (hasInlineData) {
      const contentBlocks: Array<Record<string, unknown>> = [];
      for (const p of nonFnParts) {
        if (p.text) {
          contentBlocks.push({ type: "text", text: p.text });
        } else if (p.inlineData?.data) {
          const mime = p.inlineData.mimeType || "image/png";
          contentBlocks.push({
            type: "image_url",
            image_url: { url: `data:${mime};base64,${p.inlineData.data}` },
          });
        }
      }
      if (contentBlocks.length > 0) {
        messages.push({ role: "user", content: contentBlocks });
      }
    } else {
      const userText = joinPartsText(nonFnParts);
      if (userText || fnResponses.length === 0) {
        messages.push({ role: "user", content: userText });
      }
    }
  }

  const openaiBody: OpenAIChatBody = {
    model,
    messages,
    stream: !!stream,
  };

  // Tools
  if (Array.isArray(src.tools) && src.tools.length > 0) {
    const openaiTools: OpenAIChatTool[] = [];
    for (const tool of src.tools) {
      for (const decl of tool.functionDeclarations || []) {
        if (!decl?.name) continue;
        openaiTools.push({
          type: "function",
          function: {
            name: decl.name,
            ...(decl.description ? { description: decl.description } : {}),
            parameters: decl.parameters || decl.parametersJsonSchema || { type: "object", properties: {} },
          },
        });
      }
    }
    if (openaiTools.length > 0) {
      openaiBody.tools = openaiTools;
    }
  }

  // Tool choice
  const fcMode = src.toolConfig?.functionCallingConfig?.mode?.toUpperCase();
  const allowedNames = src.toolConfig?.functionCallingConfig?.allowedFunctionNames;
  if (fcMode === "NONE") {
    openaiBody.tool_choice = "none";
  } else if (fcMode === "ANY") {
    if (Array.isArray(allowedNames) && allowedNames.length === 1) {
      openaiBody.tool_choice = { type: "function", function: { name: allowedNames[0] } };
    } else {
      openaiBody.tool_choice = "required";
    }
  } else if (fcMode === "AUTO") {
    openaiBody.tool_choice = "auto";
  }

  const cfg = src.generationConfig || {};
  if (cfg.maxOutputTokens != null) openaiBody.max_tokens = cfg.maxOutputTokens;
  if (cfg.temperature != null) openaiBody.temperature = cfg.temperature;
  if (cfg.topP != null) openaiBody.top_p = cfg.topP;
  if (cfg.stopSequences?.length) openaiBody.stop = cfg.stopSequences;

  return openaiBody;
}

export function mapFinishReason(reason?: string | null): string | undefined {
  if (!reason) return undefined;
  if (reason === "stop" || reason === "tool_calls") return "STOP";
  if (reason === "length") return "MAX_TOKENS";
  if (reason === "content_filter") return "SAFETY";
  return "STOP";
}

/**
 * Convert OpenAI Chat Completion JSON response into Gemini GenerateContent response.
 */
export function convertOpenAIToGeminiResponse(openaiRes: any): Record<string, unknown> {
  const choice = openaiRes?.choices?.[0] || {};
  const message = choice.message || {};
  const parts: GeminiPart[] = [];

  if (message.reasoning_content || message.reasoning) {
    parts.push({
      text: message.reasoning_content || message.reasoning,
      thought: true,
    });
  }
  if (message.content != null && message.content !== "") {
    parts.push({ text: message.content });
  }
  if (Array.isArray(message.tool_calls)) {
    for (const tc of message.tool_calls) {
      if (!tc?.function?.name) continue;
      parts.push({
        functionCall: {
          ...(tc.id ? { id: tc.id } : {}),
          name: tc.function.name,
          args: parseToolArguments(tc.function.arguments),
        },
      });
    }
  }
  if (parts.length === 0) {
    parts.push({ text: "" });
  }

  const finishReason = mapFinishReason(choice.finish_reason);
  const candidate: Record<string, unknown> = {
    content: {
      role: "model",
      parts,
    },
  };
  if (finishReason) {
    candidate.finishReason = finishReason;
  }

  const candidates = [candidate];
  const result: Record<string, unknown> = {
    response: {
      candidates,
    },
    candidates,
  };

  if (openaiRes?.usage) {
    const usage = {
      promptTokenCount: openaiRes.usage.prompt_tokens || 0,
      candidatesTokenCount: openaiRes.usage.completion_tokens || 0,
      totalTokenCount: openaiRes.usage.total_tokens || 0,
    };
    (result.response as Record<string, unknown>).usageMetadata = usage;
    result.usageMetadata = usage;
  }

  return result;
}

function flushAccumulatedToolCalls(state: GeminiStreamState): GeminiPart[] {
  if (state.toolCalls.size === 0) return [];
  const parts: GeminiPart[] = [];
  const sortedIndices = Array.from(state.toolCalls.keys()).sort((a, b) => a - b);
  for (const idx of sortedIndices) {
    const tc = state.toolCalls.get(idx)!;
    if (!tc.name) continue;
    parts.push({
      functionCall: {
        ...(tc.id ? { id: tc.id } : {}),
        name: tc.name,
        args: parseToolArguments(tc.arguments),
      },
    });
  }
  state.toolCalls.clear();
  return parts;
}

export function flushGeminiStreamToolCalls(state: GeminiStreamState): Record<string, unknown> | null {
  const parts = flushAccumulatedToolCalls(state);
  if (parts.length === 0) return null;
  const candidate: Record<string, unknown> = {
    content: {
      role: "model",
      parts,
    },
    finishReason: "STOP",
  };
  return {
    response: { candidates: [candidate] },
    candidates: [candidate],
  };
}

/**
 * Convert OpenAI streaming SSE chunk into Gemini streaming candidates chunk.
 */
export function convertOpenAIToGeminiChunk(
  openaiChunk: any,
  state?: GeminiStreamState
): Record<string, unknown> | null {
  if (!openaiChunk?.choices || openaiChunk.choices.length === 0) {
    if (openaiChunk?.usage) {
      const usage = {
        promptTokenCount: openaiChunk.usage.prompt_tokens || 0,
        candidatesTokenCount: openaiChunk.usage.completion_tokens || 0,
        totalTokenCount: openaiChunk.usage.total_tokens || 0,
      };
      return {
        response: { usageMetadata: usage },
        usageMetadata: usage,
      };
    }
    return null;
  }

  const choice = openaiChunk.choices[0];
  const delta = choice.delta || {};
  const parts: GeminiPart[] = [];

  if (delta.reasoning_content || delta.reasoning) {
    parts.push({
      text: delta.reasoning_content || delta.reasoning,
      thought: true,
    });
  }
  if (delta.content != null && delta.content !== "") {
    parts.push({ text: delta.content });
  }

  if (Array.isArray(delta.tool_calls)) {
    if (state) {
      for (const tc of delta.tool_calls) {
        const idx = typeof tc.index === "number" ? tc.index : 0;
        const existing = state.toolCalls.get(idx) || { id: "", name: "", arguments: "" };
        if (tc.id) existing.id = tc.id;
        if (tc.function?.name) existing.name += tc.function.name;
        if (typeof tc.function?.arguments === "string") existing.arguments += tc.function.arguments;
        state.toolCalls.set(idx, existing);
      }
    } else {
      for (const tc of delta.tool_calls) {
        if (!tc?.function?.name) continue;
        parts.push({
          functionCall: {
            ...(tc.id ? { id: tc.id } : {}),
            name: tc.function.name,
            args: parseToolArguments(tc.function.arguments),
          },
        });
      }
    }
  }

  const finishReason = mapFinishReason(choice.finish_reason);
  if (finishReason && state) {
    parts.push(...flushAccumulatedToolCalls(state));
  }

  if (parts.length === 0 && !finishReason) {
    return null;
  }

  const candidate: Record<string, unknown> = {
    content: {
      role: "model",
      parts: parts.length > 0 ? parts : [{ text: "" }],
    },
  };
  if (finishReason) {
    candidate.finishReason = finishReason;
  }

  return {
    response: {
      candidates: [candidate],
    },
    candidates: [candidate],
  };
}
