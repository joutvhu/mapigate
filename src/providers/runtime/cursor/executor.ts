import type { ProviderRequestContext, ModelCallResult } from "../../core/types.js";
import { buildCursorHeaders } from "./cursorChecksum.js";
import { buildAgentRunFrame, tailOnlyCursorMessages } from "./cursorProtobuf.js";
import { resolveCursorModels, resolveAutoModelSelection } from "./cursorModels.js";
import {
  AGENT_RUN_URL,
  TAIL_ONLY_THRESHOLD,
  isComposerModel,
  openAgentHttp2Stream,
  type AgentSession,
} from "./cursorSession.js";
import {
  type CursorStreamEvent,
  runSessionLoop,
  streamCursorSse,
} from "./cursorStreamer.js";

export { type CursorStreamEvent } from "./cursorStreamer.js";

export async function executeCursor(context: ProviderRequestContext): Promise<ModelCallResult> {
  const { body, targetModel, isPanel, res } = context;
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

  return streamCursorSse({ context, responseId, created, runWithRetry });
}
