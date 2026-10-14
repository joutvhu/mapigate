export interface GeminiPart {
  text?: string;
  thought?: boolean;
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

export interface GeminiRequestBody {
  systemInstruction?: GeminiContent;
  contents?: GeminiContent[];
  generationConfig?: GeminiGenerationConfig;
  request?: GeminiRequestBody;
  [key: string]: unknown;
}

export interface OpenAIChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenAIChatBody {
  model: string;
  messages: OpenAIChatMessage[];
  stream: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string[];
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
    ("contents" in inner || "systemInstruction" in inner || "generationConfig" in inner)
  ) {
    return inner;
  }
  return body;
}

export function joinPartsText(parts?: GeminiPart[]): string {
  return (parts || [])
    .map((p) => p.text)
    .filter((t): t is string => Boolean(t))
    .join("\n");
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

  // Chat turns
  for (const content of src.contents || []) {
    const role: OpenAIChatMessage["role"] = content.role === "model" ? "assistant" : "user";
    messages.push({ role, content: joinPartsText(content.parts) });
  }

  const openaiBody: OpenAIChatBody = {
    model,
    messages,
    stream: !!stream,
  };

  const cfg = src.generationConfig || {};
  if (cfg.maxOutputTokens != null) openaiBody.max_tokens = cfg.maxOutputTokens;
  if (cfg.temperature != null) openaiBody.temperature = cfg.temperature;
  if (cfg.topP != null) openaiBody.top_p = cfg.topP;
  if (cfg.stopSequences?.length) openaiBody.stop = cfg.stopSequences;

  return openaiBody;
}

export function mapFinishReason(reason?: string | null): string | undefined {
  if (!reason) return undefined;
  if (reason === "stop") return "STOP";
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
  } else if (parts.length === 0) {
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

/**
 * Convert OpenAI streaming SSE chunk into Gemini streaming candidates chunk.
 */
export function convertOpenAIToGeminiChunk(openaiChunk: any): Record<string, unknown> | null {
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

  const finishReason = mapFinishReason(choice.finish_reason);
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
