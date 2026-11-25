import type { ModelCallResult, ProviderRequestContext } from "../../core/types.js";
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

function extractPromptForGrokWeb(messages: any[]): string {
  if (!Array.isArray(messages) || messages.length === 0) return "";
  const parts: string[] = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    const role = String(msg.role || "user").toUpperCase();
    let text = "";
    if (typeof msg.content === "string") {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      text = msg.content
        .map((c: any) => (typeof c === "string" ? c : c?.text || ""))
        .filter(Boolean)
        .join("\n");
    }
    if (text) parts.push(`${role}: ${text}`);
  }
  return parts.join("\n\n");
}

export async function executeGrokWebCookie(context: ProviderRequestContext): Promise<ModelCallResult> {
  const { req, res, clientFormat, isPanel, requestId, targetModel, rawModel, clientTool, rtkStats, is1mContext, startTime, account, reqTag = "GROK" } = context;
  if (!res) return { ok: false, status: 500, error: "Response object is required" };

  const token = (account?.rawApiKey || "").trim();
  if (!token) {
    return { ok: false, status: 401, error: "Grok web cookie is required" };
  }

  const rawBody = context.body || req?.body || {};
  const openAiBody =
    clientFormat === "anthropic" ? AnthropicAdapter.anthropicToOpenAi(rawBody) : rawBody;
  const isStreaming = rawBody.stream !== false && !isPanel;

  const payload = {
    temporary: false,
    modelName: targetModel,
    message: extractPromptForGrokWeb(openAiBody.messages || []),
    fileAttachments: [],
    imageAttachments: [],
    disableSearch: false,
    enableImageGeneration: true,
    returnImageBytes: false,
    enableImageStreaming: true,
    imageGenerationCount: 2,
    forceConcise: false,
    toolOverrides: {},
    enableSideBySide: true,
    sendFinalMetadata: true,
    isReasoning: false,
    disableTextFollowUps: false,
  };

  const globalSettings = SettingsRepository.getEndpointSettings();
  const effectiveProxy =
    (context.provider?.proxyUrl && context.provider.proxyUrl.trim()) ||
    (globalSettings.proxyUrl && globalSettings.proxyUrl.trim()) ||
    "";

  const upstreamRes = await executeUpstreamFetch(
    "https://grok.com/rest/app-chat/conversations/new",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: token,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ...(context.provider?.customHeaders || {}),
      },
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
      error: sanitizeErrorMessage(errText || `Grok Web request failed (${upstreamRes.status})`),
      accountName: account?.name || account?.id,
    };
  }

  const reader = upstreamRes.body?.getReader();
  if (!reader) return { ok: false, status: 502, error: "Empty response stream from Grok Web" };

  const responseId = `chatcmpl-${requestId}`;
  const created = Math.floor(Date.now() / 1000);
  const streamWriter = isStreaming
    ? createOpenAiClientStreamWriter(res, clientFormat, requestId, targetModel, rawBody.tools)
    : undefined;

  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let sentRole = false;

  const processLine = (rawLine: string) => {
    const line = rawLine.trim();
    if (!line) return;
    try {
      const parsed = JSON.parse(line);
      const tokenChunk = parsed?.result?.response?.token;
      if (typeof tokenChunk === "string" && tokenChunk) {
        fullText += tokenChunk;
        if (streamWriter) {
          const delta: any = { content: tokenChunk };
          if (!sentRole) {
            delta.role = "assistant";
            sentRole = true;
          }
          streamWriter.writeChunk({
            id: responseId,
            object: "chat.completion.chunk",
            created,
            model: targetModel,
            choices: [{ index: 0, delta, finish_reason: null }],
          });
        }
      }
      const finalMsg = parsed?.result?.response?.modelResponse?.message;
      if (!fullText && typeof finalMsg === "string" && finalMsg) {
        fullText = finalMsg;
        if (streamWriter) {
          const delta: any = { content: finalMsg };
          if (!sentRole) {
            delta.role = "assistant";
            sentRole = true;
          }
          streamWriter.writeChunk({
            id: responseId,
            object: "chat.completion.chunk",
            created,
            model: targetModel,
            choices: [{ index: 0, delta, finish_reason: null }],
          });
        }
      }
    } catch {}
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) processLine(line);
  }
  if (buffer.trim()) processLine(buffer);

  const inTok = rtkStats?.compressedTokens || 0;
  const outTok = Math.max(1, Math.ceil(fullText.length / 4));
  const usage = { prompt_tokens: inTok, completion_tokens: outTok, total_tokens: inTok + outTok };

  if (isStreaming && streamWriter) {
    streamWriter.finalize("stop", usage);
    const durationMs = Date.now() - startTime;
    const cost = ResponseLogger.logSuccess({
      requestId,
      startTime,
      durationMs,
      clientTool: clientTool || "generic",
      rawModel: rawModel || targetModel,
      targetModel,
      providerId: context.provider?.id || "grok-cli",
      accountId: account?.id,
      accountName: account?.name,
      apiKeyId: context.apiKeyId,
      apiKeyName: context.apiKeyName,
      promptTokens: inTok,
      completionTokens: outTok,
      cachedTokens: 0,
      cacheCreationTokens: 0,
      reasoningTokens: 0,
      tokensSavedByRtk: rtkStats?.tokensSaved || 0,
      is1mContext,
      requestHeaders: (req?.headers as Record<string, string>) || {},
      requestBody: req?.body,
      clientResponse: { status: 200, headers: { "content-type": "text/event-stream" }, body: { text: "Stream completed" } },
    });
    logger.line(reqTag, LogSymbol.SUCCESS, `${context.provider?.id || "grok-cli"}/${targetModel} · ${formatDoneLine({ durationMs, promptTokens: inTok, completionTokens: outTok, tokensSaved: rtkStats?.tokensSaved || 0, cost })}`);
    return { ok: true, status: 200, logged: true, modelUsed: targetModel, text: fullText };
  }

  const openAiResp = {
    id: responseId,
    object: "chat.completion",
    created,
    model: targetModel,
    choices: [{ index: 0, message: { role: "assistant", content: fullText }, finish_reason: "stop" }],
    usage,
  };

  if (isPanel) {
    return { ok: true, status: 200, json: openAiResp, text: fullText, logged: false, modelUsed: targetModel };
  }

  const outBody = formatOpenAiResponseForClient(openAiResp, clientFormat, requestId);
  res.status(200).json(outBody);
  const durationMs = Date.now() - startTime;
  const cost = ResponseLogger.logSuccess({
    requestId,
    startTime,
    durationMs,
    clientTool: clientTool || "generic",
    rawModel: rawModel || targetModel,
    targetModel,
    providerId: context.provider?.id || "grok-cli",
    accountId: account?.id,
    accountName: account?.name,
    apiKeyId: context.apiKeyId,
    apiKeyName: context.apiKeyName,
    promptTokens: inTok,
    completionTokens: outTok,
    cachedTokens: 0,
    cacheCreationTokens: 0,
    reasoningTokens: 0,
    tokensSavedByRtk: rtkStats?.tokensSaved || 0,
    is1mContext,
    requestHeaders: (req?.headers as Record<string, string>) || {},
    requestBody: req?.body,
    clientResponse: { status: 200, headers: { "content-type": "application/json" }, body: outBody },
  });
  logger.line(reqTag, LogSymbol.SUCCESS, `${context.provider?.id || "grok-cli"}/${targetModel} · ${formatDoneLine({ durationMs, promptTokens: inTok, completionTokens: outTok, tokensSaved: rtkStats?.tokensSaved || 0, cost })}`);
  return { ok: true, status: 200, json: outBody, text: fullText, logged: true, modelUsed: targetModel };
}
