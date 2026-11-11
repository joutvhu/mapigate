import type { ModelCallResult, ProviderRequestContext } from "../../core/types.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import { executeUpstreamFetch } from "../../../server/proxy/proxyDispatcher.js";
import { ResponseLogger } from "../../../server/proxy/responseLogger.js";
import { logger, LogSymbol, formatDoneLine } from "../../../shared/logger.js";

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
    let parameters =
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

export function buildOpenCodeGoResponsesPayload(
  rawBody: any,
  model: string,
  clientFormat: string
): any {
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

  const out: Record<string, any> = {
    model,
    input,
    stream: true,
    store: false,
  };
  if (instructions) out.instructions = instructions;

  const maxOut = baseBody.max_output_tokens ?? baseBody.max_completion_tokens ?? baseBody.max_tokens;
  if (maxOut !== undefined) out.max_output_tokens = maxOut;
  if (baseBody.temperature !== undefined) out.temperature = baseBody.temperature;
  if (baseBody.top_p !== undefined) out.top_p = baseBody.top_p;

  if (baseBody.reasoning && typeof baseBody.reasoning === "object" && !Array.isArray(baseBody.reasoning)) {
    out.reasoning = { summary: "auto", ...baseBody.reasoning };
  } else if (baseBody.reasoning_effort !== undefined) {
    out.reasoning = { effort: baseBody.reasoning_effort, summary: "auto" };
  }

  if (Array.isArray(baseBody.tools) && baseBody.tools.length > 0) {
    const tools = normalizeTools(baseBody.tools);
    if (tools.length > 0) {
      out.tools = tools;
      if (baseBody.tool_choice !== undefined) {
        if (typeof baseBody.tool_choice === "object" && baseBody.tool_choice?.function?.name) {
          out.tool_choice = { type: "function", name: baseBody.tool_choice.function.name };
        } else {
          out.tool_choice = baseBody.tool_choice;
        }
      }
    }
  }

  return out;
}

export async function executeOpenCodeGoResponses(
  context: ProviderRequestContext,
  targetUrl: string,
  headers: Record<string, string>
): Promise<ModelCallResult> {
  const { req, res, clientFormat, isPanel, startTime, requestId, targetModel, reqTag = "OCG" } = context;
  if (!res) return { ok: false, status: 500, error: "Response object is required" };

  const rawBody = context.body || req?.body || {};
  const isStreaming = rawBody.stream !== false && !isPanel;
  const payload = buildOpenCodeGoResponsesPayload(rawBody, targetModel, clientFormat);
  const proxyUrl = (context.provider?.proxyUrl || "").trim();

  const abortController = new AbortController();
  const onClose = () => abortController.abort();
  if (typeof res?.once === "function") res.once("close", onClose);

  try {
    const upstreamRes = await executeUpstreamFetch(
      targetUrl,
      { method: "POST", headers, body: JSON.stringify(payload), signal: abortController.signal },
      proxyUrl
    );

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text().catch(() => "");
      return { ok: false, status: upstreamRes.status, error: errText || `OpenCode Go responses failed (${upstreamRes.status})` };
    }

    const reader = upstreamRes.body?.getReader();
    if (!reader) return { ok: false, status: 502, error: "Empty response stream from OpenCode Go" };

    const decoder = new TextDecoder();
    const responseId = `chatcmpl-${requestId}`;
    const created = Math.floor(Date.now() / 1000);
    const anthropicState =
      isStreaming && clientFormat === "anthropic"
        ? AnthropicAdapter.createStreamState(`msg_${requestId}`, rawBody.tools)
        : undefined;

    let headersSent = false;
    const ensureSseHeaders = () => {
      if (headersSent || res.writableEnded || res.destroyed) return;
      headersSent = true;
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
      if (clientFormat === "anthropic" && anthropicState && !anthropicState.messageStartSent) {
        anthropicState.messageStartSent = true;
        res.write(
          `event: message_start\ndata: ${JSON.stringify({
            type: "message_start",
            message: { id: `msg_${requestId}`, type: "message", role: "assistant", model: targetModel, content: [] },
          })}\n\n`
        );
      }
    };

    const emitOpenAiChunk = (chunk: any) => {
      if (!isStreaming || res.writableEnded || res.destroyed) return;
      ensureSseHeaders();
      if (clientFormat === "anthropic" && anthropicState) {
        for (const ev of AnthropicAdapter.openAiChunkToAnthropicEvent(chunk, `msg_${requestId}`, anthropicState)) {
          res.write(ev);
        }
      } else {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    };

    let buffer = "";
    let fullText = "";
    let reasoningText = "";
    let sentRole = false;
    let toolIdx = 0;
    const toolIndexByItemId = new Map<string, number>();
    const toolMetaByItemId = new Map<string, { id: string; name: string; args: string }>();
    let completedResponse: any = null;
    let usage: any = undefined;

    const handleEvent = (ev: any) => {
      const t = ev?.type;
      if (!t) return;

      if (t === "response.output_text.delta" && typeof ev.delta === "string") {
        fullText += ev.delta;
        const delta: any = { content: ev.delta };
        if (!sentRole) { delta.role = "assistant"; sentRole = true; }
        emitOpenAiChunk({ id: responseId, object: "chat.completion.chunk", created, model: targetModel, choices: [{ index: 0, delta, finish_reason: null }] });
      } else if (t === "response.reasoning_summary_text.delta" && typeof ev.delta === "string") {
        reasoningText += ev.delta;
        const delta: any = { reasoning_content: ev.delta };
        if (!sentRole) { delta.role = "assistant"; sentRole = true; }
        emitOpenAiChunk({ id: responseId, object: "chat.completion.chunk", created, model: targetModel, choices: [{ index: 0, delta, finish_reason: null }] });
      } else if (t === "response.output_item.added" && ev.item?.type === "function_call") {
        const itemId = ev.item.id || `item_${toolIdx}`;
        const callId = ev.item.call_id || itemId;
        const name = ev.item.name || "";
        const idx = toolIndexByItemId.has(itemId) ? toolIndexByItemId.get(itemId)! : toolIdx++;
        toolIndexByItemId.set(itemId, idx);
        toolMetaByItemId.set(itemId, { id: callId, name, args: "" });
        const delta: any = {
          tool_calls: [{ index: idx, id: callId, type: "function", function: { name, arguments: "" } }],
        };
        if (!sentRole) { delta.role = "assistant"; sentRole = true; }
        emitOpenAiChunk({ id: responseId, object: "chat.completion.chunk", created, model: targetModel, choices: [{ index: 0, delta, finish_reason: null }] });
      } else if (t === "response.function_call_arguments.delta" && typeof ev.delta === "string") {
        const itemId = ev.item_id;
        const idx = toolIndexByItemId.get(itemId);
        if (idx !== undefined) {
          const meta = toolMetaByItemId.get(itemId);
          if (meta) meta.args += ev.delta;
          emitOpenAiChunk({
            id: responseId,
            object: "chat.completion.chunk",
            created,
            model: targetModel,
            choices: [{ index: 0, delta: { tool_calls: [{ index: idx, function: { arguments: ev.delta } }] }, finish_reason: null }],
          });
        }
      } else if (t === "response.completed") {
        completedResponse = ev.response || ev;
        const u = completedResponse?.usage;
        if (u) {
          const inTok = u.input_tokens ?? 0;
          const outTok = u.output_tokens ?? 0;
          usage = { prompt_tokens: inTok, completion_tokens: outTok, total_tokens: inTok + outTok };
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunkStr = decoder.decode(value, { stream: true });
      if (isStreaming && clientFormat === "responses") {
        ensureSseHeaders();
        if (!res.writableEnded && !res.destroyed) res.write(chunkStr);
      }
      buffer += chunkStr;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const dataStr = line.slice(5).trim();
        if (!dataStr || dataStr === "[DONE]") continue;
        try {
          handleEvent(JSON.parse(dataStr));
        } catch {}
      }
    }
    if (buffer.trim().startsWith("data:")) {
      const dataStr = buffer.trim().slice(5).trim();
      if (dataStr && dataStr !== "[DONE]") {
        try {
          handleEvent(JSON.parse(dataStr));
        } catch {}
      }
    }

    if (isStreaming) {
      if (clientFormat === "responses") {
        if (!res.writableEnded && !res.destroyed) res.end();
      } else {
        const finishReason = toolMetaByItemId.size > 0 ? "tool_calls" : "stop";
        emitOpenAiChunk({
          id: responseId,
          object: "chat.completion.chunk",
          created,
          model: targetModel,
          choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
          ...(usage ? { usage } : {}),
        });
        if (!res.writableEnded && !res.destroyed) {
          if (clientFormat === "anthropic" && anthropicState) {
            for (const ev of AnthropicAdapter.finalizeStream(anthropicState)) res.write(ev);
          } else {
            res.write("data: [DONE]\n\n");
          }
          res.end();
        }
      }
      const durationMs = Date.now() - startTime;
      const inTok = usage?.prompt_tokens || context.rtkStats?.compressedTokens || 0;
      const outTok = usage?.completion_tokens || Math.ceil(fullText.length / 4);
      const calculatedCost = ResponseLogger.logSuccess({
        requestId,
        startTime,
        durationMs,
        clientTool: context.clientTool || "generic",
        rawModel: context.rawModel || targetModel,
        targetModel,
        providerId: "opencode-go",
        accountId: context.account?.id,
        accountName: context.account?.name,
        apiKeyId: context.apiKeyId,
        apiKeyName: context.apiKeyName,
        promptTokens: inTok,
        completionTokens: outTok,
        cachedTokens: 0,
        cacheCreationTokens: 0,
        reasoningTokens: 0,
        tokensSavedByRtk: context.rtkStats?.tokensSaved || 0,
        is1mContext: context.is1mContext,
        requestHeaders: req?.headers as Record<string, string>,
        requestBody: req?.body,
        clientResponse: {
          status: 200,
          headers: { "content-type": "text/event-stream" },
          body: { text: "Stream completed" },
        },
      });
      const doneMsg = formatDoneLine({
        durationMs,
        promptTokens: inTok,
        completionTokens: outTok,
        tokensSaved: context.rtkStats?.tokensSaved || 0,
        cost: calculatedCost,
      });
      logger.line(reqTag, LogSymbol.SUCCESS, `opencode-go/${targetModel} · ${doneMsg}`);
      return { ok: true, status: 200, modelUsed: targetModel, text: fullText };
    }

    if (clientFormat === "responses" && completedResponse) {
      res.status(200).json(completedResponse);
      return { ok: true, status: 200, modelUsed: targetModel, text: fullText };
    }

    const toolCalls = Array.from(toolMetaByItemId.values()).map((tc) => ({
      id: tc.id,
      type: "function",
      function: { name: tc.name, arguments: tc.args || "{}" },
    }));
    const openAiResp: any = {
      id: responseId,
      object: "chat.completion",
      created,
      model: targetModel,
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: fullText || null,
          ...(reasoningText ? { reasoning_content: reasoningText } : {}),
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
      }],
      ...(usage ? { usage } : {}),
    };

    if (clientFormat === "anthropic") {
      res.status(200).json(AnthropicAdapter.openAiResponseToAnthropic(openAiResp));
    } else {
      res.status(200).json(openAiResp);
    }

    return { ok: true, status: 200, modelUsed: targetModel, text: fullText };
  } finally {
    if (typeof res?.removeListener === "function") res.removeListener("close", onClose);
  }
}
