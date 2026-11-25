import type { IProvider, ModelCallResult, ProviderRequestContext } from "../../core/types.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import { executeUpstreamFetch } from "../../../server/proxy/proxyDispatcher.js";
import { ResponseLogger } from "../../../server/proxy/responseLogger.js";
import { SettingsRepository } from "../../../storage/repositories/settingsRepo.js";
import { formatDoneLine, logger, LogSymbol } from "../../../shared/logger.js";
import { sanitizeErrorMessage } from "../../../shared/utils/errorSanitizer.js";
import {
  createOpenAiClientStreamWriter,
  formatOpenAiResponseForClient,
} from "../../core/base/customExecutionHelper.js";

function toOllamaMessages(messages: any[]): any[] {
  const out: any[] = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    const role = msg.role === "developer" ? "system" : msg.role || "user";
    let content = "";
    const images: string[] = [];

    if (typeof msg.content === "string") {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      const texts: string[] = [];
      for (const part of msg.content) {
        if (typeof part === "string") texts.push(part);
        else if (part?.type === "text" || part?.type === "input_text") {
          if (part.text) texts.push(part.text);
        } else if (part?.type === "image_url" && typeof part.image_url?.url === "string") {
          const url = part.image_url.url;
          const b64 = url.match(/^data:[^;]+;base64,(.+)$/);
          images.push(b64 ? b64[1] : url);
        }
      }
      content = texts.join("\n");
    }

    const mapped: Record<string, any> = { role, content };
    if (images.length > 0) mapped.images = images;
    if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      mapped.tool_calls = msg.tool_calls.map((tc: any) => {
        let argsObj: any = {};
        const rawArgs = tc?.function?.arguments ?? tc?.arguments;
        if (typeof rawArgs === "string") {
          try {
            argsObj = JSON.parse(rawArgs || "{}");
          } catch {
            argsObj = { raw: rawArgs };
          }
        } else if (rawArgs && typeof rawArgs === "object") {
          argsObj = rawArgs;
        }
        return {
          type: "function",
          function: {
            name: tc?.function?.name || tc?.name || "",
            arguments: argsObj,
          },
        };
      });
    }
    if (role === "tool" && msg.tool_call_id) {
      mapped.tool_call_id = msg.tool_call_id;
    }
    out.push(mapped);
  }
  return out;
}

function normalizeOllamaToolCalls(rawCalls: any[]): any[] {
  return rawCalls.map((tc, idx) => {
    const fn = tc?.function || {};
    const args = fn.arguments;
    return {
      index: idx,
      id: tc?.id || `call_ollama_${Date.now()}_${idx}`,
      type: "function",
      function: {
        name: fn.name || tc?.name || "",
        arguments: typeof args === "string" ? args : JSON.stringify(args ?? {}),
      },
    };
  });
}

export async function executeOllamaNativeChat(
  context: ProviderRequestContext,
  provider: IProvider
): Promise<ModelCallResult> {
  const { req, res, clientFormat, isPanel, requestId, targetModel, rawModel, clientTool, rtkStats, is1mContext, startTime, account, reqTag = "OLLAMA" } = context;
  if (!res) return { ok: false, status: 500, error: "Response object is required" };

  const baseBody =
    clientFormat === "anthropic"
      ? AnthropicAdapter.anthropicToOpenAi(context.body)
      : { ...(context.body || {}) };
  const upstreamModel =
    typeof (provider as any).resolveUpstreamModelId === "function"
      ? (provider as any).resolveUpstreamModelId(context)
      : context.targetModel;
  const isStreaming = baseBody.stream !== false && !isPanel;

  const ollamaOptions: Record<string, any> = {};
  if (baseBody.temperature !== undefined) ollamaOptions.temperature = baseBody.temperature;
  if (baseBody.top_p !== undefined) ollamaOptions.top_p = baseBody.top_p;
  if (baseBody.max_tokens !== undefined) ollamaOptions.num_predict = baseBody.max_tokens;
  if (baseBody.stop !== undefined) ollamaOptions.stop = baseBody.stop;

  const payload: Record<string, any> = {
    model: upstreamModel,
    messages: toOllamaMessages(Array.isArray(baseBody.messages) ? baseBody.messages : []),
    stream: isStreaming,
    ...(Array.isArray(baseBody.tools) && baseBody.tools.length > 0 ? { tools: baseBody.tools } : {}),
    ...(Object.keys(ollamaOptions).length > 0 ? { options: ollamaOptions } : {}),
  };

  const upstreamUrl = provider.buildUrl(context);
  const headers = await provider.buildHeaders(context);
  const globalSettings = SettingsRepository.getEndpointSettings();
  if (globalSettings.customHeaders) {
    for (const [k, v] of Object.entries(globalSettings.customHeaders)) {
      if (!headers[k]) headers[k] = v;
    }
  }
  const effectiveProxy =
    (context.provider?.proxyUrl && context.provider.proxyUrl.trim()) ||
    (globalSettings.proxyUrl && globalSettings.proxyUrl.trim()) ||
    "";

  const upstreamRes = await executeUpstreamFetch(
    upstreamUrl,
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: context.abortController?.signal,
    },
    effectiveProxy
  );

  if (!upstreamRes.ok) {
    const errText = await upstreamRes.text().catch(() => "");
    return {
      ok: false,
      status: upstreamRes.status,
      error: sanitizeErrorMessage(errText || `Ollama /api/chat failed (${upstreamRes.status})`),
      accountName: account?.name || account?.id,
    };
  }

  const created = Math.floor(Date.now() / 1000);
  const responseId = `chatcmpl-${requestId}`;

  if (!isStreaming) {
    const data: any = await upstreamRes.json();
    const msg = data?.message || {};
    const toolCalls = Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0
      ? normalizeOllamaToolCalls(msg.tool_calls).map(({ index: _i, ...tc }) => tc)
      : undefined;
    const promptTokens = Number(data?.prompt_eval_count ?? rtkStats?.compressedTokens ?? 0);
    const completionTokens = Number(data?.eval_count ?? Math.ceil((msg.content || "").length / 4));
    const openAiResp: any = {
      id: responseId,
      object: "chat.completion",
      created,
      model: targetModel,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: msg.content || null,
            ...(msg.thinking ? { reasoning_content: msg.thinking } : {}),
            ...(toolCalls ? { tool_calls: toolCalls } : {}),
          },
          finish_reason: toolCalls ? "tool_calls" : "stop",
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
    };

    if (isPanel) {
      return { ok: true, status: 200, json: openAiResp, text: msg.content || "", logged: false, modelUsed: targetModel };
    }

    const clientBody = formatOpenAiResponseForClient(openAiResp, clientFormat, requestId);
    res.status(200).json(clientBody);
    const durationMs = Date.now() - startTime;
    const cost = ResponseLogger.logSuccess({
      requestId,
      startTime,
      durationMs,
      clientTool,
      rawModel,
      targetModel,
      providerId: provider.id,
      accountId: account?.id,
      accountName: account?.name,
      apiKeyId: context.apiKeyId,
      apiKeyName: context.apiKeyName,
      promptTokens,
      completionTokens,
      cachedTokens: 0,
      cacheCreationTokens: 0,
      reasoningTokens: 0,
      tokensSavedByRtk: rtkStats?.tokensSaved || 0,
      is1mContext,
      requestHeaders: (req?.headers as Record<string, string>) || {},
      requestBody: req?.body,
      clientResponse: { status: 200, headers: { "content-type": "application/json" }, body: clientBody },
    });
    logger.line(reqTag, LogSymbol.USAGE, `${provider.id}/${targetModel} · ${formatDoneLine({ durationMs, promptTokens, completionTokens, tokensSaved: rtkStats?.tokensSaved || 0, cost })}`);
    return { ok: true, status: 200, json: clientBody, text: msg.content || "", logged: true, modelUsed: targetModel };
  }

  const reader = upstreamRes.body?.getReader();
  if (!reader) return { ok: false, status: 502, error: "Empty response stream from Ollama" };

  const writer = createOpenAiClientStreamWriter(res, clientFormat, requestId, targetModel, context.body?.tools);
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let sentRole = false;
  let sawToolCalls = false;
  let promptTokens = rtkStats?.compressedTokens || 0;
  let completionTokens = 0;

  const processNdjsonLine = (rawLine: string) => {
    const line = rawLine.trim();
    if (!line) return;
    let obj: any;
    try {
      obj = JSON.parse(line);
    } catch {
      return;
    }

    const msg = obj?.message || {};
    const delta: Record<string, any> = {};
    if (!sentRole) {
      delta.role = "assistant";
      sentRole = true;
    }
    if (typeof msg.thinking === "string" && msg.thinking) {
      delta.reasoning_content = msg.thinking;
    }
    if (typeof msg.content === "string" && msg.content) {
      fullText += msg.content;
      delta.content = msg.content;
    }
    if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      sawToolCalls = true;
      delta.tool_calls = normalizeOllamaToolCalls(msg.tool_calls);
    }

    if (Object.keys(delta).length > 1 || (Object.keys(delta).length === 1 && !delta.role)) {
      writer.writeChunk({
        id: responseId,
        object: "chat.completion.chunk",
        created,
        model: targetModel,
        choices: [{ index: 0, delta, finish_reason: null }],
      });
    }

    if (obj?.done) {
      if (obj.prompt_eval_count !== undefined) promptTokens = Number(obj.prompt_eval_count) || promptTokens;
      if (obj.eval_count !== undefined) completionTokens = Number(obj.eval_count) || 0;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) processNdjsonLine(line);
  }
  if (buffer.trim()) processNdjsonLine(buffer);

  if (completionTokens === 0 && fullText) {
    completionTokens = Math.max(1, Math.ceil(fullText.length / 4));
  }
  const usage = {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
  writer.finalize(sawToolCalls ? "tool_calls" : "stop", usage);

  const durationMs = Date.now() - startTime;
  const cost = ResponseLogger.logSuccess({
    requestId,
    startTime,
    durationMs,
    clientTool,
    rawModel,
    targetModel,
    providerId: provider.id,
    accountId: account?.id,
    accountName: account?.name,
    apiKeyId: context.apiKeyId,
    apiKeyName: context.apiKeyName,
    promptTokens,
    completionTokens,
    cachedTokens: 0,
    cacheCreationTokens: 0,
    reasoningTokens: 0,
    tokensSavedByRtk: rtkStats?.tokensSaved || 0,
    is1mContext,
    requestHeaders: (req?.headers as Record<string, string>) || {},
    requestBody: req?.body,
    clientResponse: { status: 200, headers: { "content-type": "text/event-stream" }, body: { text: "Stream completed" } },
  });
  logger.line(reqTag, LogSymbol.USAGE, `${provider.id}/${targetModel} · ${formatDoneLine({ durationMs, promptTokens, completionTokens, tokensSaved: rtkStats?.tokensSaved || 0, cost })}`);

  return { ok: true, status: 200, logged: true, modelUsed: targetModel, text: fullText };
}
