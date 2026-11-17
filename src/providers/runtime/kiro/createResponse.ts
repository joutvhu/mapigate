import type { ProviderRequestContext, ModelCallResult } from "../../core/types.js";
import { executeUpstreamFetch } from "../../../server/proxy/proxyDispatcher.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import { resolveKiroServiceRegion } from "./models.js";
import { ResponseLogger } from "../../../server/proxy/responseLogger.js";
import { logger, LogSymbol, formatDoneLine } from "../../../shared/logger.js";
import { extractPlainTextContent } from "../../../shared/utils/extractText.js";

export type KiroCreateResponseMode = "auto" | "always" | "off";

export function getKiroCreateResponseMode(): KiroCreateResponseMode {
  const raw = (process.env.MAPIGATE_KIRO_CREATE_RESPONSE || "auto").trim().toLowerCase();
  if (raw === "always") return "always";
  if (raw === "off" || raw === "false" || raw === "0") return "off";
  return "auto";
}

export function isKiroUserRateExceeded(status: number, errText: string): boolean {
  return status === 429 && typeof errText === "string" && errText.includes("USER_REQUEST_RATE_EXCEEDED");
}

export function buildKiroCreateResponseUrl(region: string): string {
  const runtimeRegion = resolveKiroServiceRegion("runtime", region || "us-east-1");
  return `https://runtime.${runtimeRegion}.kiro.dev/v1/responses`;
}

export function buildKiroCreateResponsePayload(
  body: any,
  upstreamModel: string,
  isStreaming: boolean
): Record<string, any> {
  const payload: Record<string, any> = {
    model: upstreamModel,
    stream: isStreaming,
  };

  if (Array.isArray(body?.input)) {
    payload.input = body.input;
    if (body.instructions) payload.instructions = body.instructions;
  } else if (Array.isArray(body?.messages)) {
    const systemParts: string[] = [];
    const inputItems: any[] = [];

    for (const msg of body.messages) {
      if (!msg) continue;
      if (msg.role === "system" || msg.role === "developer") {
        const txt = extractPlainTextContent(msg.content);
        if (txt) systemParts.push(txt);
        continue;
      }

      if (msg.role === "user") {
        if (Array.isArray(msg.content)) {
          const parts = msg.content.map((c: any) => {
            if (c?.type === "text") return { type: "input_text", text: c.text ?? "" };
            if (c?.type === "image_url") {
              return {
                type: "input_image",
                image_url: c.image_url?.url || "",
                ...(c.image_url?.detail ? { detail: c.image_url.detail } : {}),
              };
            }
            return c;
          });
          inputItems.push({ type: "message", role: "user", content: parts });
        } else {
          inputItems.push({
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: String(msg.content ?? "") }],
          });
        }
      } else if (msg.role === "assistant") {
        const text = extractPlainTextContent(msg.content);
        if (text) {
          inputItems.push({
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text }],
          });
        }
        if (Array.isArray(msg.tool_calls)) {
          for (const tc of msg.tool_calls) {
            if (!tc?.function?.name) continue;
            inputItems.push({
              type: "function_call",
              call_id: tc.id || `call_${Date.now()}`,
              name: tc.function.name,
              arguments:
                typeof tc.function.arguments === "string"
                  ? tc.function.arguments
                  : JSON.stringify(tc.function.arguments ?? {}),
            });
          }
        }
      } else if (msg.role === "tool") {
        inputItems.push({
          type: "function_call_output",
          call_id: msg.tool_call_id || "",
          output: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? ""),
        });
      }
    }

    if (systemParts.length > 0) {
      payload.instructions = systemParts.join("\n\n");
    }
    payload.input = inputItems;
  }

  if (Array.isArray(body?.tools) && body.tools.length > 0) {
    payload.tools = body.tools.map((t: any) => {
      if (t?.type === "function" && t.function) {
        return {
          type: "function",
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        };
      }
      return t;
    });
  }

  const maxTokens = body?.max_output_tokens ?? body?.max_tokens;
  if (maxTokens !== undefined) payload.max_output_tokens = maxTokens;
  if (body?.temperature !== undefined) payload.temperature = body.temperature;
  if (body?.top_p !== undefined) payload.top_p = body.top_p;

  return payload;
}

export function responsesApiToOpenAiResponse(data: any, model: string): any {
  const output: any[] = Array.isArray(data?.output) ? data.output : [];
  let contentText = "";
  let reasoningText = "";
  const toolCalls: any[] = [];

  for (const item of output) {
    if (!item) continue;
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (part?.type === "output_text" || part?.type === "text") {
          contentText += part.text || "";
        }
      }
    } else if (item.type === "reasoning") {
      const parts = Array.isArray(item.summary) ? item.summary : Array.isArray(item.content) ? item.content : [];
      for (const part of parts) {
        if (part?.text) reasoningText += part.text;
      }
    } else if (item.type === "function_call") {
      toolCalls.push({
        id: item.call_id || item.id || `call_${Date.now()}`,
        type: "function",
        function: {
          name: item.name || "",
          arguments: typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments ?? {}),
        },
      });
    }
  }

  const usage = data?.usage || {};
  const promptTokens = usage.input_tokens ?? 0;
  const completionTokens = usage.output_tokens ?? 0;

  return {
    id: data?.id ? `chatcmpl-${data.id}` : `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: data?.created_at || Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: contentText || null,
          ...(reasoningText ? { reasoning_content: reasoningText } : {}),
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

export interface ExecuteKiroCreateResponseOptions {
  context: ProviderRequestContext;
  upstreamModel: string;
  region: string;
  headers: Record<string, string>;
  effectiveProxy: string;
  isStreaming: boolean;
  fetchFn?: typeof executeUpstreamFetch;
  retryDelayMs?: number;
}

export async function executeKiroCreateResponse(
  opts: ExecuteKiroCreateResponseOptions
): Promise<ModelCallResult> {
  const {
    context,
    upstreamModel,
    region,
    headers,
    effectiveProxy,
    isStreaming,
    fetchFn = executeUpstreamFetch,
    retryDelayMs = 1500,
  } = opts;

  const { req, res, clientFormat, startTime, requestId, reqTag = "KIRO" } = context;
  if (!res) {
    return { ok: false, status: 500, error: "Response object is required for Kiro CreateResponse" };
  }

  const rawModel = context.targetModel || upstreamModel;
  const targetModel = context.targetModel || rawModel;
  const body = context.body || req?.body || {};

  const url = buildKiroCreateResponseUrl(region);
  const payload = buildKiroCreateResponsePayload(body, upstreamModel, isStreaming);

  const reqHeaders: Record<string, string> = {
    ...headers,
    "Content-Type": "application/json",
    Accept: isStreaming ? "text/event-stream" : "application/json",
  };
  delete reqHeaders["X-Amz-Target"];

  let upstreamRes = await fetchFn(
    url,
    { method: "POST", headers: reqHeaders, body: JSON.stringify(payload) },
    effectiveProxy
  );

  // 1 retry after 1500ms if /v1/responses also returns 429 burst limit
  if (!upstreamRes.ok && upstreamRes.status === 429) {
    logger.warn("KIRO", `/v1/responses returned 429; retrying once after ${retryDelayMs}ms`);
    if (retryDelayMs > 0) {
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
    upstreamRes = await fetchFn(
      url,
      { method: "POST", headers: reqHeaders, body: JSON.stringify(payload) },
      effectiveProxy
    );
  }

  if (!upstreamRes.ok) {
    const errText = await upstreamRes.text().catch(() => "");
    return {
      ok: false,
      status: upstreamRes.status,
      error: errText || `Kiro /v1/responses failed with status ${upstreamRes.status}`,
    };
  }

  const responseId = `chatcmpl-${requestId}`;
  const created = Math.floor(Date.now() / 1000);

  if (isStreaming) {
    if (!res.headersSent) {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
    }

    const reader = upstreamRes.body?.getReader();
    if (!reader) {
      return { ok: false, status: 502, error: "Empty stream body from Kiro /v1/responses" };
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    let promptTokens = context.rtkStats?.compressedTokens || 0;
    let completionTokens = 0;
    let sawToolUse = false;
    let toolIdxCounter = 0;
    const itemIdToToolIdx = new Map<string, number>();

    const anthropicState =
      clientFormat === "anthropic" ? AnthropicAdapter.createStreamState(`msg_${requestId}`) : undefined;

    const writeOpenAiOrAnthropicChunk = (chunk: any) => {
      if (clientFormat === "anthropic" && anthropicState) {
        const events = AnthropicAdapter.openAiChunkToAnthropicEvent(chunk, `msg_${requestId}`, anthropicState);
        for (const ev of events) res.write(ev);
      } else {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        const decoded = decoder.decode(value, { stream: true });
        if (clientFormat === "responses") {
          res.write(decoded);
        }

        buffer += decoded;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;

          let ev: any;
          try {
            ev = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") {
            fullText += ev.delta;
            if (clientFormat !== "responses") {
              writeOpenAiOrAnthropicChunk({
                id: responseId,
                object: "chat.completion.chunk",
                created,
                model: rawModel,
                choices: [{ index: 0, delta: { content: ev.delta }, finish_reason: null }],
              });
            }
          } else if (ev.type === "response.reasoning_summary_text.delta" && typeof ev.delta === "string") {
            if (clientFormat !== "responses") {
              writeOpenAiOrAnthropicChunk({
                id: responseId,
                object: "chat.completion.chunk",
                created,
                model: rawModel,
                choices: [{ index: 0, delta: { reasoning_content: ev.delta }, finish_reason: null }],
              });
            }
          } else if (ev.type === "response.output_item.added" && ev.item?.type === "function_call") {
            sawToolUse = true;
            const idx = toolIdxCounter++;
            if (ev.item.id) itemIdToToolIdx.set(ev.item.id, idx);
            if (clientFormat !== "responses") {
              writeOpenAiOrAnthropicChunk({
                id: responseId,
                object: "chat.completion.chunk",
                created,
                model: rawModel,
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index: idx,
                          id: ev.item.call_id || ev.item.id || `call_${Date.now()}_${idx}`,
                          type: "function",
                          function: { name: ev.item.name || "", arguments: "" },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              });
            }
          } else if (ev.type === "response.function_call_arguments.delta" && typeof ev.delta === "string") {
            const idx = (ev.item_id && itemIdToToolIdx.get(ev.item_id)) ?? 0;
            if (clientFormat !== "responses") {
              writeOpenAiOrAnthropicChunk({
                id: responseId,
                object: "chat.completion.chunk",
                created,
                model: rawModel,
                choices: [
                  {
                    index: 0,
                    delta: { tool_calls: [{ index: idx, function: { arguments: ev.delta } }] },
                    finish_reason: null,
                  },
                ],
              });
            }
          } else if (ev.type === "response.completed") {
            const u = ev.response?.usage;
            if (u) {
              if (typeof u.input_tokens === "number") promptTokens = u.input_tokens;
              if (typeof u.output_tokens === "number") completionTokens = u.output_tokens;
            }
          }
        }
      }

      if (clientFormat !== "responses") {
        writeOpenAiOrAnthropicChunk({
          id: responseId,
          object: "chat.completion.chunk",
          created,
          model: rawModel,
          choices: [{ index: 0, delta: {}, finish_reason: sawToolUse ? "tool_calls" : "stop" }],
        });
        if (clientFormat === "anthropic" && anthropicState) {
          const finalEvents = AnthropicAdapter.finalizeStream(anthropicState);
          for (const ev of finalEvents) res.write(ev);
        } else {
          res.write("data: [DONE]\n\n");
        }
      }
      res.end();
    } catch (streamErr: any) {
      if (!res.headersSent) {
        return { ok: false, status: 502, error: streamErr.message };
      }
      res.end();
      return { ok: false, status: 502, error: streamErr.message };
    }

    const durationMs = Date.now() - startTime;
    if (!completionTokens) completionTokens = Math.ceil(fullText.length / 4);
    const calculatedCost = ResponseLogger.logSuccess({
      requestId,
      startTime,
      durationMs,
      clientTool: context.clientTool || "generic",
      rawModel: context.rawModel || targetModel,
      targetModel,
      providerId: "kiro",
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
      requestHeaders: req.headers as Record<string, string>,
      requestBody: req.body,
    });
    const doneMsg = formatDoneLine({
      durationMs,
      promptTokens,
      completionTokens,
      tokensSaved: context.rtkStats?.tokensSaved || 0,
      cost: calculatedCost,
    });
    logger.line(reqTag, LogSymbol.SUCCESS, `kiro/${targetModel} (responses) · ${doneMsg}`);

    return { ok: true, status: 200, isStream: true, modelUsed: targetModel };
  }

  // Non-streaming path
  const rawText = await upstreamRes.text();
  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    return { ok: false, status: 502, error: "Failed to parse Kiro /v1/responses JSON response" };
  }

  const openAiJson = responsesApiToOpenAiResponse(data, rawModel);
  let clientResponseBody: any = openAiJson;
  if (clientFormat === "responses") {
    clientResponseBody = data;
  } else if (clientFormat === "anthropic") {
    clientResponseBody = AnthropicAdapter.openAiResponseToAnthropic(openAiJson, requestId);
  }

  const durationMs = Date.now() - startTime;
  const promptTokens = openAiJson.usage?.prompt_tokens || context.rtkStats?.compressedTokens || 0;
  const completionTokens = openAiJson.usage?.completion_tokens || 0;
  const calculatedCost = ResponseLogger.logSuccess({
    requestId,
    startTime,
    durationMs,
    clientTool: context.clientTool || "generic",
    rawModel: context.rawModel || targetModel,
    targetModel,
    providerId: "kiro",
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
    requestHeaders: req.headers as Record<string, string>,
    requestBody: req.body,
    clientResponse: {
      status: 200,
      headers: { "content-type": "application/json" },
      body: clientResponseBody,
    },
  });
  const doneMsg = formatDoneLine({
    durationMs,
    promptTokens,
    completionTokens,
    tokensSaved: context.rtkStats?.tokensSaved || 0,
    cost: calculatedCost,
  });
  logger.line(reqTag, LogSymbol.SUCCESS, `kiro/${targetModel} (responses) · ${doneMsg}`);

  res.status(200).json(clientResponseBody);
  return { ok: true, status: 200, json: clientResponseBody, logged: true, modelUsed: targetModel };
}
