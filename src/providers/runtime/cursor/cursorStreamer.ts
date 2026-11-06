import crypto from "node:crypto";
import type { ProviderRequestContext, ModelCallResult } from "../../core/types.js";
import {
  decodeAgentFrames,
  decodeMessage,
  extractAgentString,
  agentMessage,
  createRequestContextResponse,
  rejectExecRequest,
  encodeKvClientMessage,
  decodeMcpArgs,
} from "./cursorProtobuf.js";
import {
  visibleComposerContentFromThinking,
  type AgentSession,
} from "./cursorSession.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import {
  createResponsesStreamState,
  openAiChunkToResponsesEvents,
  finalizeResponsesStream,
} from "../../../core/adapters/responsesAdapter.js";
import { ResponseLogger } from "../../../server/proxy/responseLogger.js";

export type CursorStreamEvent =
  | { type: "text" | "thinking" | "error"; value: string }
  | { type: "tool_call"; value: { id: string; name: string; arguments: string } }
  | { type: "done"; finishReason?: string };

export function parseServerUpdates(
  serverMessage: any,
  session: AgentSession,
  composer: boolean,
  thinkingAcc: { val: string },
  emitted: { text: boolean; visible: number },
  onEvent: (ev: CursorStreamEvent) => void,
  finishTurn: () => void
): void {
  if (serverMessage.has(1)) {
    const update = decodeMessage(serverMessage.get(1)![0].value);
    if (update.has(1)) {
      const textDelta = extractAgentString(decodeMessage(update.get(1)![0].value), 1);
      if (textDelta) {
        emitted.text = true;
        onEvent({ type: "text", value: textDelta });
      }
    }
    if (update.has(4)) {
      const thinkingDelta = extractAgentString(decodeMessage(update.get(4)![0].value), 1);
      if (thinkingDelta) {
        thinkingAcc.val += thinkingDelta;
        if (composer) {
          const visible = visibleComposerContentFromThinking(thinkingAcc.val);
          if (visible.length > emitted.visible) {
            const delta = visible.slice(emitted.visible);
            emitted.visible = visible.length;
            emitted.text = true;
            onEvent({ type: "text", value: delta });
          }
        }
      }
    }
    if (update.has(14)) finishTurn();
  }

  if (serverMessage.has(4)) {
    const kv = decodeMessage(serverMessage.get(4)![0].value);
    const kvId = kv.get(1)?.[0]?.value || 0;
    const metadata = kv.get(4)?.[0]?.value || null;
    if (kv.has(2)) {
      session.write(encodeKvClientMessage(kvId, 2, agentMessage(1, new Uint8Array()), metadata));
    } else if (kv.has(3)) {
      session.write(encodeKvClientMessage(kvId, 3, new Uint8Array(), metadata));
    }
  }

  if (serverMessage.has(2)) {
    const execRequest = decodeMessage(serverMessage.get(2)![0].value);
    if (execRequest.has(10)) {
      session.write(createRequestContextResponse(execRequest));
    } else if (execRequest.has(11)) {
      const mcp = decodeMcpArgs(execRequest.get(11)![0].value);
      const name = mcp.toolName || mcp.name;
      if (name) {
        onEvent({
          type: "tool_call",
          value: {
            id: mcp.toolCallId || `call_${crypto.randomUUID()}`,
            name,
            arguments: JSON.stringify(mcp.args || {}),
          },
        });
        onEvent({ type: "done", finishReason: "tool_calls" });
      } else {
        onEvent({ type: "error", value: "Cursor AgentService requested an unsupported IDE tool" });
      }
    } else {
      const rejection = rejectExecRequest(execRequest);
      if (rejection) session.write(rejection);
      else onEvent({ type: "error", value: "Cursor AgentService requested an unsupported IDE tool" });
    }
  }
}

export async function runSessionLoop(
  session: AgentSession,
  composer: boolean,
  onEvent: (ev: CursorStreamEvent) => void
): Promise<{ sawContent: boolean }> {
  let pending: Buffer<any> = Buffer.alloc(0);
  let finished = false;
  const thinkingAcc = { val: "" };
  const emitted = { text: false, visible: 0 };

  const finishTurn = () => {
    if (!emitted.text && thinkingAcc.val) {
      const fallback = composer ? visibleComposerContentFromThinking(thinkingAcc.val) : thinkingAcc.val.trim();
      if (fallback) {
        emitted.text = true;
        onEvent({ type: "text", value: fallback });
      }
    }
    finished = true;
    if (emitted.text) onEvent({ type: "done" });
    else onEvent({ type: "error", value: "Cursor AgentService returned an empty turn" });
  };

  try {
    while (!finished) {
      const { done, value } = await session.read();
      if (done) break;
      pending = Buffer.concat([pending, Buffer.from(value!)]);
      pending = decodeAgentFrames(pending, (payload) => {
        if (finished) return;
        const msg = decodeMessage(payload);
        parseServerUpdates(msg, session, composer, thinkingAcc, emitted, onEvent, finishTurn);
      });
    }
    if (!finished) finishTurn();
  } finally {
    try { session.end(); } catch {}
    try { session.close(); } catch {}
  }

  return { sawContent: emitted.text };
}

export interface CursorSseOptions {
  context: ProviderRequestContext;
  responseId: string;
  created: number;
  runWithRetry: (onEvent: (ev: CursorStreamEvent) => void) => Promise<{ sawContent: boolean }>;
}

export async function streamCursorSse(options: CursorSseOptions): Promise<ModelCallResult> {
  const { context, responseId, created, runWithRetry } = options;
  const { res, clientFormat, requestId, targetModel, body } = context;
  if (!res) return { ok: false, status: 500, error: "Response writer unavailable" };

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const anthropicState =
    clientFormat === "anthropic" ? AnthropicAdapter.createStreamState(`msg_${requestId}`, body.tools) : undefined;
  const responsesState =
    clientFormat === "responses" ? createResponsesStreamState(requestId) : undefined;

  const emit = (obj: any) => {
    if (clientFormat === "responses" && responsesState) {
      const events = openAiChunkToResponsesEvents(obj, responsesState);
      for (const ev of events) res.write(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`);
    } else if (clientFormat === "anthropic" && anthropicState) {
      const events = AnthropicAdapter.openAiChunkToAnthropicEvent(obj, `msg_${requestId}`, anthropicState);
      for (const ev of events) res.write(ev);
    } else {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    }
  };

  if (clientFormat === "anthropic") {
    res.write(
      `event: message_start\ndata: ${JSON.stringify({
        type: "message_start",
        message: { id: `msg_${requestId}`, type: "message", role: "assistant", model: targetModel, content: [] },
      })}\n\n`
    );
  }

  emit({
    id: responseId,
    object: "chat.completion.chunk",
    created,
    model: targetModel,
    choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
  });

  let fullStreamText = "";
  await runWithRetry((ev) => {
    if (ev.type === "text") {
      fullStreamText += ev.value;
      emit({
        id: responseId,
        object: "chat.completion.chunk",
        created,
        model: targetModel,
        choices: [{ index: 0, delta: { content: ev.value }, finish_reason: null }],
      });
    } else if (ev.type === "thinking") {
      emit({
        id: responseId,
        object: "chat.completion.chunk",
        created,
        model: targetModel,
        choices: [{ index: 0, delta: { reasoning_content: ev.value }, finish_reason: null }],
      });
    } else if (ev.type === "tool_call") {
      emit({
        id: responseId,
        object: "chat.completion.chunk",
        created,
        model: targetModel,
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{
              index: 0,
              id: ev.value.id,
              type: "function",
              function: { name: ev.value.name, arguments: ev.value.arguments },
            }],
          },
          finish_reason: null,
        }],
      });
    } else if (ev.type === "error") {
      res.write(`data: ${JSON.stringify({ error: { message: ev.value, type: "api_error" } })}\n\n`);
    } else if (ev.type === "done") {
      emit({
        id: responseId,
        object: "chat.completion.chunk",
        created,
        model: targetModel,
        choices: [{ index: 0, delta: {}, finish_reason: ev.finishReason || "stop" }],
      });
    }
  });

  if (clientFormat === "responses" && responsesState) {
    const finalEvents = finalizeResponsesStream(responsesState);
    for (const ev of finalEvents) res.write(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`);
    res.write("data: [DONE]\n\n");
  } else if (clientFormat === "anthropic" && anthropicState) {
    const finalEvents = AnthropicAdapter.finalizeStream(anthropicState);
    for (const ev of finalEvents) res.write(ev);
  } else {
    res.write("data: [DONE]\n\n");
  }
  res.end();

  const durationMs = Date.now() - context.startTime;
  const completionTokens = Math.ceil(fullStreamText.length / 4);
  const promptTokens = context.rtkStats?.compressedTokens || 0;

  ResponseLogger.logSuccess({
    requestId: context.requestId, startTime: context.startTime, durationMs,
    clientTool: context.clientTool || "generic",
    rawModel: context.rawModel || targetModel, targetModel, providerId: "cursor",
    accountId: context.account?.id, accountName: context.account?.name,
    apiKeyId: context.apiKeyId, apiKeyName: context.apiKeyName,
    promptTokens, completionTokens, cachedTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0,
    tokensSavedByRtk: context.rtkStats?.tokensSaved || 0, is1mContext: context.is1mContext,
    requestHeaders: (context.req?.headers as Record<string, string>) || {},
    requestBody: context.req?.body || body,
    clientResponse: { status: 200, headers: { "content-type": "text/event-stream" }, body: { text: "Stream completed" } },
  });

  return { ok: true, status: 200, modelUsed: targetModel, isStream: true };
}
