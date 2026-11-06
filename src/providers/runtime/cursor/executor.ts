import crypto from "node:crypto";
import type { ProviderRequestContext, ModelCallResult } from "../../core/types.js";
import { buildCursorHeaders } from "./cursorChecksum.js";
import {
  buildAgentRunFrame,
  decodeAgentFrames,
  decodeMessage,
  extractAgentString,
  agentMessage,
  createRequestContextResponse,
  rejectExecRequest,
  encodeKvClientMessage,
  tailOnlyCursorMessages,
  decodeMcpArgs,
} from "./cursorProtobuf.js";
import { resolveCursorModels, resolveAutoModelSelection } from "./cursorModels.js";
import {
  AGENT_RUN_URL,
  TAIL_ONLY_THRESHOLD,
  isComposerModel,
  visibleComposerContentFromThinking,
  openAgentHttp2Stream,
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
  | { type: "text"; value: string }
  | { type: "thinking"; value: string }
  | { type: "tool_call"; value: { id: string; name: string; arguments: string } }
  | { type: "done"; finishReason?: string }
  | { type: "error"; value: string };

function parseServerUpdates(
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

async function runSessionLoop(
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

export async function executeCursor(context: ProviderRequestContext): Promise<ModelCallResult> {
  const { body, targetModel, isPanel, res, clientFormat, requestId } = context;
  const isStreaming = body.stream !== false && !isPanel;
  const rawToken = context.account?.rawApiKey || (context.account as any)?.apiKey || "";
  const psd = (context.account?.providerSpecificData || {}) as Record<string, any>;
  const cleanToken = rawToken.includes("::") ? rawToken.split("::")[1] : rawToken;
  const machineId = psd.machineId || null;

  if (!cleanToken) {
    return { ok: false, status: 401, error: "Cursor access token is required" };
  }

  const headers = buildCursorHeaders(cleanToken, machineId, psd.ghostMode !== false);
  const originalMessages = body.messages || [];
  let workingMessages = originalMessages;
  const tools = body.tools || [];
  let runModel = targetModel;

  if (targetModel === "default" || targetModel === "auto") {
    const catalog = await resolveCursorModels({ accessToken: cleanToken, machineId: machineId || undefined });
    const selection = resolveAutoModelSelection(catalog?.models || []);
    if (selection) runModel = selection.modelId;
  }

  const openSession = (msgs: any[]) => {
    const sess = openAgentHttp2Stream(AGENT_RUN_URL, headers, context.abortController?.signal);
    sess.write(buildAgentRunFrame(msgs, runModel, tools, body.reasoning_effort || body.reasoning?.effort));
    return sess;
  };

  let session: AgentSession;
  try {
    session = openSession(workingMessages);
  } catch (err: any) {
    return { ok: false, status: 500, error: `Cursor AgentService connection error: ${err.message}` };
  }

  const responseHeaders = await session.responseHeaders.catch((err) => {
    session.close();
    throw err;
  });

  const status = Number(responseHeaders[":status"] || 0);
  if (status !== 200) {
    let errorText = "";
    try {
      while (true) {
        const { done, value } = await session.read();
        if (done) break;
        errorText += Buffer.from(value || []).toString("utf8");
      }
    } catch {}
    session.close();
    return { ok: false, status: status || 500, error: `Cursor AgentService returned ${status}: ${errorText || "Request failed"}` };
  }

  const responseId = `chatcmpl-msg_${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const composer = isComposerModel(runModel);

  const runWithRetry = async (onEvent: (ev: CursorStreamEvent) => void) => {
    let outputStarted = false;
    const wrapped = (ev: CursorStreamEvent) => {
      if (ev.type === "text" || ev.type === "thinking" || ev.type === "tool_call") outputStarted = true;
      onEvent(ev);
    };

    let turnError: CursorStreamEvent | null = null;
    const result = await runSessionLoop(session, composer, (ev) => {
      if (ev.type === "error") turnError = ev;
      else wrapped(ev);
    });

    if (turnError && originalMessages.length >= TAIL_ONLY_THRESHOLD && !outputStarted && !context.abortController?.signal?.aborted) {
      workingMessages = tailOnlyCursorMessages(originalMessages);
      session = openSession(workingMessages);
      const retryHdrs = await session.responseHeaders;
      if (Number(retryHdrs[":status"] || 0) === 200) {
        return runSessionLoop(session, composer, wrapped);
      }
    }
    if (turnError) wrapped(turnError);
    return result;
  };

  if (!isStreaming || !res) {
    let fullText = "";
    let reasoning = "";
    let agentError: string | null = null;
    const toolCalls: any[] = [];
    let finishReason = "stop";

    await runWithRetry((ev) => {
      if (ev.type === "text") fullText += ev.value;
      else if (ev.type === "thinking") reasoning += ev.value;
      else if (ev.type === "tool_call") {
        toolCalls.push({ id: ev.value.id, type: "function", function: { name: ev.value.name, arguments: ev.value.arguments } });
        finishReason = "tool_calls";
      } else if (ev.type === "error") agentError = ev.value;
      else if (ev.type === "done" && ev.finishReason) finishReason = ev.finishReason;
    });

    if (agentError) return { ok: false, status: 400, error: agentError };

    const message: Record<string, any> = {
      role: "assistant",
      content: fullText || null,
      ...(reasoning ? { reasoning_content: reasoning } : {}),
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    };

    return {
      ok: true,
      status: 200,
      modelUsed: targetModel,
      json: {
        id: responseId,
        object: "chat.completion",
        created,
        model: targetModel,
        choices: [{ index: 0, message, finish_reason: finishReason }],
      },
    };
  }

  // Streaming SSE
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
  } else if (clientFormat === "anthropic") {
    res.write(`event: message_stop\ndata: {"type":"message_stop"}\n\n`);
  } else {
    res.write("data: [DONE]\n\n");
  }
  res.end();

  const durationMs = Date.now() - context.startTime;
  const completionTokens = Math.ceil(fullStreamText.length / 4);
  const promptTokens = context.rtkStats?.compressedTokens || 0;

  ResponseLogger.logSuccess({
    requestId: context.requestId,
    startTime: context.startTime,
    durationMs,
    clientTool: context.clientTool || "generic",
    rawModel: context.rawModel || targetModel,
    targetModel,
    providerId: "cursor",
    accountId: context.account?.id,
    accountName: context.account?.name,
    apiKeyId: context.apiKeyId,
    apiKeyName: context.apiKeyName,
    promptTokens,
    completionTokens,
    cachedTokens: 0,
    cacheCreationTokens: 0,
    reasoningTokens: 0,
    tokensSavedByRtk: context.rtkStats?.tokensSaved || 0,
    is1mContext: context.is1mContext,
    requestHeaders: (context.req?.headers as Record<string, string>) || {},
    requestBody: context.req?.body || body,
    clientResponse: {
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body: { text: "Stream completed" },
    },
  });

  return { ok: true, status: 200, modelUsed: targetModel, isStream: true };
}
