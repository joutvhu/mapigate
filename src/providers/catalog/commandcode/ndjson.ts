export interface CommandCodeStreamState {
  responseId: string;
  created: number;
  model: string;
  chunkIndex: number;
  toolIndex: number;
  toolIndexById: Map<string, number>;
  finishReason: string | null;
  usage: any;
}

export function createCommandCodeStreamState(model: string, requestId?: string): CommandCodeStreamState {
  return {
    responseId: `chatcmpl-${requestId || Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    model: model || "commandcode",
    chunkIndex: 0,
    toolIndex: 0,
    toolIndexById: new Map(),
    finishReason: null,
    usage: null,
  };
}

function mapFinishReason(reason?: string | null): string {
  if (reason === "tool-calls" || reason === "tool_calls") return "tool_calls";
  if (reason === "length" || reason === "max_tokens") return "length";
  return "stop";
}

function makeChunk(state: CommandCodeStreamState, delta: any, finishReason: string | null = null): any {
  return {
    id: state.responseId,
    object: "chat.completion.chunk",
    created: state.created,
    model: state.model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

export function parseCommandCodeError(event: any): { statusCode: number; message: string } {
  const errVal = event?.error ?? event?.message ?? "CommandCode upstream error";
  const message =
    typeof errVal === "object" && errVal !== null
      ? errVal.message || errVal.error || JSON.stringify(errVal)
      : String(errVal);
  let statusCode = Number(errVal?.statusCode || errVal?.status || event?.statusCode || 0);
  if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599) {
    const lower = message.toLowerCase();
    if (lower.includes("rate limit") || lower.includes("too many requests")) statusCode = 429;
    else if (lower.includes("unauthorized") || lower.includes("invalid api key")) statusCode = 401;
    else if (lower.includes("payment required") || lower.includes("billing") || lower.includes("insufficient credits")) statusCode = 402;
    else if (lower.includes("quota") || lower.includes("forbidden")) statusCode = 403;
    else statusCode = 503;
  }
  return { statusCode, message };
}

export class CommandCodeUpstreamError extends Error {
  public readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(`[CommandCode error: ${message}]`);
    this.statusCode = statusCode;
  }
}

export function commandCodeLineToOpenAiChunks(line: string, state: CommandCodeStreamState): any[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  const json = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
  if (!json || json === "[DONE]") return [];

  let event: any;
  try {
    event = JSON.parse(json);
  } catch {
    return [];
  }
  if (!event || typeof event !== "object" || !event.type) return [];
  if (event.model && !state.model) state.model = event.model;

  switch (event.type) {
    case "text-delta": {
      const text = event.text || event.delta || "";
      if (!text) return [];
      const delta = state.chunkIndex === 0 ? { role: "assistant", content: text } : { content: text };
      state.chunkIndex++;
      return [makeChunk(state, delta)];
    }
    case "reasoning-delta": {
      const text = event.text || "";
      if (!text) return [];
      const delta = state.chunkIndex === 0
        ? { role: "assistant", reasoning_content: text }
        : { reasoning_content: text };
      state.chunkIndex++;
      return [makeChunk(state, delta)];
    }
    case "tool-input-start": {
      const id = event.id || event.toolCallId || `call_${state.toolIndex}`;
      let idx = state.toolIndexById.get(id);
      if (idx == null) {
        idx = state.toolIndex++;
        state.toolIndexById.set(id, idx);
      }
      const delta = {
        ...(state.chunkIndex === 0 ? { role: "assistant" } : {}),
        tool_calls: [{ index: idx, id, type: "function", function: { name: event.toolName || "", arguments: "" } }],
      };
      state.chunkIndex++;
      return [makeChunk(state, delta)];
    }
    case "tool-input-delta": {
      const id = event.id || event.toolCallId;
      const idx = state.toolIndexById.get(id);
      if (idx == null) return [];
      return [makeChunk(state, { tool_calls: [{ index: idx, function: { arguments: event.delta || event.inputTextDelta || "" } }] })];
    }
    case "tool-call": {
      const id = event.toolCallId;
      if (state.toolIndexById.has(id)) return [];
      const idx = state.toolIndex++;
      state.toolIndexById.set(id, idx);
      const argsStr = typeof event.input === "string" ? event.input : JSON.stringify(event.input ?? {});
      const delta = {
        ...(state.chunkIndex === 0 ? { role: "assistant" } : {}),
        tool_calls: [{ index: idx, id, type: "function", function: { name: event.toolName || "", arguments: argsStr } }],
      };
      state.chunkIndex++;
      return [makeChunk(state, delta)];
    }
    case "finish-step":
      state.finishReason = mapFinishReason(event.finishReason);
      if (event.usage) state.usage = event.usage;
      return [];
    case "finish": {
      const finishReason = state.finishReason || mapFinishReason(event.finishReason || "stop");
      const chunk = makeChunk(state, {}, finishReason);
      const raw = event.totalUsage || state.usage;
      if (raw && typeof raw === "object") {
        const input = Number(raw.inputTokens) || 0;
        const output = Number(raw.outputTokens) || 0;
        const total = typeof raw.totalTokens === "number" ? raw.totalTokens : input + output;
        const cached = Number(raw.inputTokenDetails?.cacheReadTokens) || 0;
        const cacheCreate = Number(raw.inputTokenDetails?.cacheWriteTokens) || 0;
        chunk.usage = {
          prompt_tokens: input,
          completion_tokens: output,
          total_tokens: total,
          ...(cached > 0 ? { prompt_tokens_details: { cached_tokens: cached } } : {}),
          ...(cacheCreate > 0 ? { cache_creation_input_tokens: cacheCreate } : {}),
        };
      }
      return [chunk];
    }
    case "error": {
      const { statusCode, message } = parseCommandCodeError(event);
      throw new CommandCodeUpstreamError(statusCode, message);
    }
    default:
      return [];
  }
}
