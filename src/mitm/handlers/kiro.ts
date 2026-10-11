import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchRouter, pipeSSE, pipeTransformedEventStream } from "./base.js";

// Standard CRC32 polynomial 0xEDB88320 (IEEE 802.3, same as AWS EventStream)
const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

export function crc32(buf: Buffer | Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface KiroState {
  modelId: string | null;
  toolCallInit: Record<number, { id: string; name: string }>;
  hasToolCalls: boolean;
  finishSent: boolean;
  usage: any | null;
  inThink: boolean;
  thinkBuf: string;
  initialSent: boolean;
}

export function initKiroState(modelId?: string): KiroState {
  return {
    modelId: modelId || null,
    toolCallInit: {},
    hasToolCalls: false,
    finishSent: false,
    usage: null,
    inThink: false,
    thinkBuf: "",
    initialSent: false,
  };
}

export function encodeHeader(name: string, value: string): Buffer {
  const nameBuf = Buffer.from(name, "utf8");
  const valueBuf = Buffer.from(value, "utf8");
  const buf = Buffer.alloc(1 + nameBuf.length + 1 + 2 + valueBuf.length);
  let o = 0;
  buf[o++] = nameBuf.length;
  nameBuf.copy(buf, o);
  o += nameBuf.length;
  buf[o++] = 7; // String type
  buf.writeUInt16BE(valueBuf.length, o);
  o += 2;
  valueBuf.copy(buf, o);
  return buf;
}

export function buildEventStreamFrame(
  eventType: string,
  payload: any,
  contentType = "application/json"
): Buffer {
  const payloadBuf = Buffer.from(
    typeof payload === "string" ? payload : JSON.stringify(payload),
    "utf8"
  );

  const headersBuf = Buffer.concat([
    encodeHeader(":message-type", "event"),
    encodeHeader(":event-type", eventType),
    encodeHeader(":content-type", contentType),
  ]);
  const headersLen = headersBuf.length;
  const totalLen = 4 + 4 + 4 + headersLen + payloadBuf.length + 4;

  const frame = Buffer.alloc(totalLen);
  frame.writeUInt32BE(totalLen, 0);
  frame.writeUInt32BE(headersLen, 4);
  frame.writeUInt32BE(crc32(frame.subarray(0, 8)), 8); // Prelude CRC
  headersBuf.copy(frame, 12);
  payloadBuf.copy(frame, 12 + headersLen);
  frame.writeUInt32BE(crc32(frame.subarray(0, totalLen - 4)), totalLen - 4); // Message CRC

  return frame;
}

function buildInitialResponseFrame(conversationId = ""): Buffer {
  return buildEventStreamFrame(
    "initial-response",
    { conversationId: conversationId || "" },
    "application/x-amz-json-1.0"
  );
}

function withInitialFrame(state: KiroState, frames: Buffer | Buffer[] | null): Buffer | Buffer[] | null {
  const list = frames == null ? [] : Array.isArray(frames) ? frames : [frames];
  if (state.initialSent) {
    return list.length === 0 ? null : list.length === 1 ? list[0] : list;
  }
  state.initialSent = true;
  const out = [buildInitialResponseFrame(""), ...list];
  return out.length === 1 ? out[0] : out;
}

function extractThinking(text: string, state: KiroState): { thinking: string | null; text: string | null } {
  if (!text) return { thinking: null, text: null };

  let working = text;
  if (state.inThink && state.thinkBuf) {
    working = state.thinkBuf + working;
    state.thinkBuf = "";
    state.inThink = false;
  }

  const startMatch = working.match(/<thinking>|<think>/i);
  if (!startMatch) {
    return { thinking: null, text: working };
  }

  const tag = startMatch[0].toLowerCase();
  const closeTag = tag === "<think>" ? "</think>" : "</thinking>";
  const startIdx = startMatch.index ?? 0;
  const endIdx = working.indexOf(closeTag, startIdx + tag.length);

  if (endIdx === -1) {
    state.inThink = true;
    state.thinkBuf = working.slice(startIdx);
    const before = working.slice(0, startIdx).trim();
    return { thinking: null, text: before || null };
  }

  const thinking = working.slice(startIdx + tag.length, endIdx);
  const before = working.slice(0, startIdx).trim();
  const after = working.slice(endIdx + closeTag.length).trim();
  const rest = [before, after].filter(Boolean).join("");

  return {
    thinking: thinking || null,
    text: rest || null,
  };
}

function safeArgsString(value: any): string {
  if (typeof value === "string") return value;
  if (value == null) return "{}";
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

function convertUserInputMessage(uim: any): any[] {
  const out: any[] = [];
  const toolResults = uim.userInputMessageContext?.toolResults || [];

  for (const tr of toolResults) {
    const text = (tr.content || []).map((c: any) => c.text || "").join("\n");
    out.push({
      role: "tool",
      tool_call_id: tr.toolUseId || "",
      content: text,
    });
  }

  const text = (uim.content || "").trim();
  if (text || toolResults.length === 0) {
    out.push({ role: "user", content: text });
  }

  return out;
}

function convertAssistantResponseMessage(arm: any): any {
  const toolUses = arm.toolUses || [];
  if (toolUses.length > 0) {
    return {
      role: "assistant",
      content: arm.content || null,
      tool_calls: toolUses.map((tu: any) => ({
        id: tu.toolUseId || `call_${Date.now()}`,
        type: "function",
        function: {
          name: tu.name || "",
          arguments: safeArgsString(tu.input),
        },
      })),
    };
  }
  return { role: "assistant", content: arm.content || "" };
}

function codeWhispererToMessages(body: any): any[] {
  const cs = body.conversationState || {};
  const history = cs.history || [];
  const currentMsg = cs.currentMessage;
  const messages: any[] = [];

  for (const item of history) {
    if (item.userInputMessage) {
      messages.push(...convertUserInputMessage(item.userInputMessage));
    } else if (item.assistantResponseMessage) {
      messages.push(convertAssistantResponseMessage(item.assistantResponseMessage));
    }
  }

  if (currentMsg?.userInputMessage) {
    messages.push(...convertUserInputMessage(currentMsg.userInputMessage));
  }

  return messages;
}

function extractTools(body: any): any[] {
  const cs = body.conversationState || {};
  const fromCurrent = cs.currentMessage?.userInputMessage?.userInputMessageContext?.tools || [];
  const fromHistory = cs.history?.find((h: any) => h.userInputMessage?.userInputMessageContext?.tools)
    ?.userInputMessage?.userInputMessageContext?.tools || [];
  const cwTools = fromCurrent.length > 0 ? fromCurrent : fromHistory;

  if (!cwTools.length) return [];

  return cwTools.map((item: any) => {
    const spec = item.toolSpecification || item;
    return {
      type: "function",
      function: {
        name: spec.name || "",
        description: spec.description || `Tool: ${spec.name || "unknown"}`,
        parameters: spec.inputSchema?.json || { type: "object", properties: {}, required: [] },
      },
    };
  });
}

function emitFinish(state: KiroState): Buffer[] | null {
  const frames: Buffer[] = [];
  if (state.hasToolCalls) {
    for (const idx of Object.keys(state.toolCallInit).sort()) {
      const tc = state.toolCallInit[Number(idx)];
      frames.push(
        buildEventStreamFrame("toolUseEvent", {
          name: tc.name,
          stop: true,
          toolUseId: tc.id,
        })
      );
    }
  } else {
    frames.push(buildEventStreamFrame("messageStopEvent", {}));
  }
  state.finishSent = true;

  if (state.usage) {
    frames.push(
      buildEventStreamFrame("usageEvent", {
        inputTokens: state.usage.prompt_tokens || 0,
        outputTokens: state.usage.completion_tokens || 0,
      })
    );
  }

  state.toolCallInit = {};
  return frames.length > 0 ? frames : null;
}

export function convertOpenAIToKiro(chunk: any | null, state: KiroState): Buffer | Buffer[] | null {
  if (!chunk) {
    if (state.finishSent) return null;
    if (state.inThink && state.thinkBuf) {
      state.inThink = false;
      const thinking = state.thinkBuf;
      state.thinkBuf = "";
      return withInitialFrame(
        state,
        buildEventStreamFrame("reasoningContentEvent", {
          content: thinking,
          modelId: state.modelId || "kiro-unknown",
        })
      );
    }
    return withInitialFrame(state, buildEventStreamFrame("messageStopEvent", {}));
  }

  const frames: Buffer[] = [];
  const choice = chunk.choices?.[0];
  const delta = choice?.delta || {};

  if (!state.modelId && chunk.model) {
    state.modelId = chunk.model;
  }
  const modelId = state.modelId || "unknown";

  if (chunk.usage) {
    state.usage = chunk.usage;
  }

  if (delta.tool_calls) {
    state.hasToolCalls = true;
    for (const tc of delta.tool_calls) {
      const idx = tc.index ?? 0;
      if (tc.id && tc.function?.name && !state.toolCallInit[idx]) {
        state.toolCallInit[idx] = { id: tc.id, name: tc.function.name };
        frames.push(
          buildEventStreamFrame("toolUseEvent", {
            name: tc.function.name,
            toolUseId: tc.id,
          })
        );
      }

      if (tc.function?.arguments) {
        const init = state.toolCallInit[idx];
        frames.push(
          buildEventStreamFrame("toolUseEvent", {
            input: tc.function.arguments,
            name: init?.name || tc.function?.name || "",
            toolUseId: init?.id || tc.id || "",
          })
        );
      }
    }
  }

  if (delta.reasoning_content) {
    frames.push(
      buildEventStreamFrame("reasoningContentEvent", {
        content: delta.reasoning_content,
        modelId,
      })
    );
  }

  if (delta.content) {
    const { thinking, text } = extractThinking(delta.content, state);
    if (thinking) {
      frames.push(
        buildEventStreamFrame("reasoningContentEvent", {
          content: thinking,
          modelId,
        })
      );
    }
    if (text) {
      frames.push(
        buildEventStreamFrame("assistantResponseEvent", {
          content: text,
          modelId,
        })
      );
    }
  }

  if (choice?.finish_reason) {
    const finishFrames = emitFinish(state);
    if (finishFrames) {
      frames.push(...finishFrames);
    }
  }

  if (frames.length === 0) {
    if (!state.initialSent) return withInitialFrame(state, null);
    return null;
  }
  return withInitialFrame(state, frames.length === 1 ? frames[0] : frames);
}

export function isBinaryEventStream(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 12) return false;
  const totalLen = buffer.readUInt32BE(0);
  const headersLen = buffer.readUInt32BE(4);
  return totalLen > 12 && totalLen < 1000000 && headersLen < totalLen - 12;
}

export async function interceptKiro(
  req: IncomingMessage,
  res: ServerResponse,
  bodyBuffer: Buffer,
  mappedModel: string
): Promise<void> {
  try {
    if (isBinaryEventStream(bodyBuffer)) {
      throw new Error(`Binary EventStream format detected (${bodyBuffer.length}B)`);
    }

    const isResponsesApi =
      (req.url && req.url.includes("/responses")) ||
      String(req.headers?.["x-amz-target"] || "").includes("CreateResponse");

    if (isResponsesApi) {
      const body = JSON.parse(bodyBuffer.toString("utf-8"));
      if (mappedModel) {
        body.model = mappedModel;
      }
      const routerRes = await fetchRouter(body, "/v1/responses", req.headers);
      await pipeSSE(routerRes, res);
      return;
    }

    const body = JSON.parse(bodyBuffer.toString("utf-8"));
    const messages = codeWhispererToMessages(body);
    if (messages.length === 0) {
      throw new Error("codeWhispererToMessages produced 0 messages");
    }

    const tools = extractTools(body);
    const openaiBody = {
      model: mappedModel,
      messages,
      stream: true,
      ...(tools.length > 0 && { tools, tool_choice: "auto" }),
    };

    const routerRes = await fetchRouter(openaiBody, "/v1/chat/completions", req.headers);
    const state = initKiroState(mappedModel);

    await pipeTransformedEventStream(routerRes, res, convertOpenAIToKiro, state);
  } catch (error: any) {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    res.end(
      JSON.stringify({
        error: {
          message: error.message,
          type: "mitm_error",
          handler: "kiro",
        },
      })
    );
  }
}
