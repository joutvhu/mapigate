import { COMMAND_CODE_WORKING_DIR, toCommandCodeSessionUuid } from "./headers.js";

const COMMAND_CODE_MAX_TOKENS = 64000;

function flattenText(content: any): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const p of content) {
      if (typeof p === "string") parts.push(p);
      else if (p && typeof p === "object" && typeof p.text === "string") parts.push(p.text);
    }
    return parts.join("\n");
  }
  return String(content);
}

function toNativeImageBlock(part: any): any | null {
  if (!part || typeof part !== "object") return null;
  if (part.type === "image_url") {
    const url = typeof part.image_url === "string" ? part.image_url : part.image_url?.url;
    if (typeof url !== "string" || !url.startsWith("data:")) return null;
    const match = url.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) return null;
    return { type: "image", image: url, mimeType: match[1], mediaType: match[1] };
  }
  if (part.type === "image") {
    if (typeof part.image === "string" && part.image.startsWith("data:")) {
      const match = part.image.match(/^data:([^;]+);base64,/);
      const mime = part.mimeType || match?.[1] || "image/png";
      return { type: "image", image: part.image, mimeType: mime, mediaType: mime };
    }
    if (part.source?.type === "base64" && typeof part.source.data === "string") {
      const mime = part.source.media_type || "image/png";
      return {
        type: "image",
        image: `data:${mime};base64,${part.source.data}`,
        mimeType: mime,
        mediaType: mime,
      };
    }
  }
  return null;
}

function toContentBlocks(content: any): any[] {
  if (content == null) return [{ type: "text", text: "" }];
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (Array.isArray(content)) {
    const blocks: any[] = [];
    for (const part of content) {
      if (typeof part === "string") {
        blocks.push({ type: "text", text: part });
      } else if (part && typeof part === "object") {
        if (part.type === "text" && typeof part.text === "string") {
          blocks.push({ type: "text", text: part.text });
        } else {
          const img = toNativeImageBlock(part);
          if (img) blocks.push(img);
          else if (typeof part.text === "string") blocks.push({ type: "text", text: part.text });
        }
      }
    }
    return blocks.length ? blocks : [{ type: "text", text: "" }];
  }
  return [{ type: "text", text: String(content) }];
}

function safeParseJson(s: any): any {
  if (s == null) return {};
  if (typeof s !== "string") return s;
  const trimmed = s.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" ? parsed : { value: parsed };
  } catch {
    return { raw: s };
  }
}

export function buildCommandCodePayload(model: string, body: any, sessionId?: string): any {
  const sourceMessages = Array.isArray(body?.messages) ? body.messages : [];
  const out: any[] = [];
  const systemTexts: string[] = [];

  const toolCallIdToName = new Map<string, string>();
  for (const m of sourceMessages) {
    if (m?.role === "assistant" && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        const name = tc?.function?.name || tc?.name;
        if (tc?.id && name) toolCallIdToName.set(tc.id, name);
      }
    }
  }

  for (const m of sourceMessages) {
    if (!m) continue;
    if (m.role === "system" || m.role === "developer") {
      const t = flattenText(m.content);
      if (t) systemTexts.push(t);
      continue;
    }
    if (m.role === "tool") {
      const value = typeof m.content === "string" ? m.content : flattenText(m.content);
      const isError = Boolean(m.is_error || m.status === "error");
      const toolName = m.name || (m.tool_call_id ? toolCallIdToName.get(m.tool_call_id) : null) || "unknown";
      out.push({
        role: "tool",
        content: [{
          type: "tool-result",
          toolCallId: m.tool_call_id || "",
          toolName,
          output: { type: isError ? "error-text" : "text", value },
        }],
      });
      continue;
    }
    if (m.role === "assistant") {
      const blocks: any[] = [];
      const rc = m.reasoning_content || m.thought || m.reasoning;
      if (rc && typeof rc === "string" && rc.trim()) {
        blocks.push({ type: "reasoning", text: rc });
      }
      const text = flattenText(m.content);
      if (text) blocks.push({ type: "text", text });
      if (Array.isArray(m.tool_calls)) {
        for (const tc of m.tool_calls) {
          const fn = tc.function || {};
          blocks.push({
            type: "tool-call",
            toolCallId: tc.id || "",
            toolName: fn.name || tc.name || "",
            input: safeParseJson(fn.arguments ?? tc.input),
          });
        }
      }
      out.push({ role: "assistant", content: blocks.length ? blocks : [{ type: "text", text: "" }] });
      continue;
    }
    out.push({ role: "user", content: toContentBlocks(m.content) });
  }

  const tools = Array.isArray(body?.tools)
    ? body.tools
        .map((t: any) => {
          if (!t) return null;
          if (t.type === "function" && t.function) {
            return {
              name: t.function.name,
              description: t.function.description,
              input_schema: t.function.parameters || { type: "object" },
            };
          }
          if (t.name && (t.input_schema || t.parameters)) {
            return { name: t.name, description: t.description, input_schema: t.input_schema || t.parameters };
          }
          return null;
        })
        .filter(Boolean)
    : undefined;

  const params: Record<string, any> = {
    model,
    messages: out,
    stream: true,
    max_tokens: body?.max_tokens ?? body?.max_output_tokens ?? COMMAND_CODE_MAX_TOKENS,
    temperature: body?.temperature ?? 0.3,
  };
  if (systemTexts.length > 0) params.system = systemTexts.join("\n\n");
  if (tools && tools.length > 0) params.tools = tools;
  if (body?.top_p != null) params.top_p = body.top_p;

  const effort =
    body?.reasoning_effort ??
    body?.output_config?.effort ??
    (typeof body?.reasoning === "object" ? body.reasoning?.effort : null);
  if (effort && typeof effort === "string") {
    params.reasoning_effort = effort;
  }

  return {
    threadId: toCommandCodeSessionUuid(sessionId),
    memory: null,
    taste: null,
    skills: null,
    permissionMode: "standard",
    config: {
      workingDir: COMMAND_CODE_WORKING_DIR,
      date: new Date().toISOString().slice(0, 10),
      environment: process.platform,
      structure: [],
      isGitRepo: false,
      currentBranch: "",
      mainBranch: "",
      gitStatus: "",
      recentCommits: [],
    },
    params,
  };
}

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
      const { message } = parseCommandCodeError(event);
      throw new Error(`[CommandCode error: ${message}]`);
    }
    default:
      return [];
  }
}
