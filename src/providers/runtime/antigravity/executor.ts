import crypto from "node:crypto";
import type { ProviderRequestContext, ModelCallResult } from "../../core/types.js";
import { executeUpstreamFetch } from "../../../server/proxy/proxyDispatcher.js";
import { ResponseLogger } from "../../../server/proxy/responseLogger.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import {
  createResponsesStreamState,
  openAiChunkToResponsesEvents,
  finalizeResponsesStream,
  convertOpenAiResponseToResponsesApi,
} from "../../../core/adapters/responsesAdapter.js";
import { logger, LogSymbol, formatDoneLine } from "../../../shared/logger.js";
import { ProviderRepository } from "../../../storage/repositories/providerRepo.js";
import { loadCodeAssist, refreshGoogleOAuthToken } from "./routes.js";
import { models } from "./models.js";
import {
  cleanJSONSchemaForAntigravity,
  normalizeGeminiContents,
  isGemini4Model,
  sanitizeGeminiFunctionName,
  convertOpenAIContentToParts,
  tryParseJSON,
  mapFinishReason,
  DEFAULT_THINKING_AG_SIGNATURE,
  DEFAULT_THINKING_GEMINI_CLI_SIGNATURE,
  getDefaultThinkingSignature,
  createToolCallIdUniquifier,
  sanitizeFunctionResponsePayload,
  toNumericSessionId,
  resolveSessionId,
  ANTIGRAVITY_PROMPT_REWRITES,
  buildIdeRequestId,
  ANTIGRAVITY_REQUEST_BLACKLIST,
  stripBlacklisted,
} from "./schema.js";

export { ANTIGRAVITY_REQUEST_BLACKLIST, stripBlacklisted };
import {
  storeGeminiThoughtSignature,
  getGeminiThoughtSignatureSync,
} from "./thoughtSignatureStore.js";
import { sanitizeToolArguments } from "../../../shared/utils/toolArgsSanitizer.js";
import { recordLoopTurnResult } from "../../../core/router/loopGuard.js";

interface AntigravityAccountCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  projectId?: string;
}

function resolveAccountCredentials(context: ProviderRequestContext): AntigravityAccountCredentials | null {
  const account = context.account;
  const rawKey = account?.rawApiKey || (account as any)?.apiKey || (context.provider as any)?.apiKey || "";
  const psd = ((account?.providerSpecificData || {}) as any);

  let accessToken = rawKey;
  let refreshToken = psd.refreshToken || psd.refresh_token;
  let expiresAt = psd.expiresAt || psd.expires_at;
  let projectId = psd.projectId || psd.project_id;

  if (rawKey.startsWith("{")) {
    try {
      const parsed = JSON.parse(rawKey);
      accessToken = parsed.accessToken || parsed.access_token || accessToken;
      refreshToken = parsed.refreshToken || parsed.refresh_token || refreshToken;
      expiresAt = parsed.expiresAt || parsed.expires_at || expiresAt;
      projectId = parsed.projectId || parsed.project_id || projectId;
    } catch {}
  }

  if (!accessToken) return null;

  return {
    accessToken,
    refreshToken,
    expiresAt,
    projectId,
  };
}

export async function executeAntigravity(
  context: ProviderRequestContext,
  providerInstance: any
): Promise<ModelCallResult> {
  const { req, res, targetModel, clientFormat, isPanel, startTime, requestId, reqTag = "AG" } = context;
  if (!res) {
    return { ok: false, status: 500, error: "Response object is required for Antigravity execution" };
  }
  const body = context.body || req?.body || {};
  const isStreaming = body.stream !== false && !isPanel;

  // 1. Resolve Account Credentials
  let creds = resolveAccountCredentials(context);
  if (!creds || !creds.accessToken) {
    return {
      ok: false,
      status: 401,
      error: "No active Antigravity access token found. Please connect an Antigravity account.",
    };
  }

  // Refresh token proactively if nearing expiry (within 5 minutes)
  if (creds.refreshToken && creds.expiresAt && Date.now() >= creds.expiresAt - 300_000) {
    try {
      const refreshed = await refreshGoogleOAuthToken(creds.refreshToken);
      if (refreshed?.accessToken) {
        creds.accessToken = refreshed.accessToken;
        creds.refreshToken = refreshed.refreshToken || creds.refreshToken;
        creds.expiresAt = Date.now() + (refreshed.expiresIn || 3600) * 1000;
        context.account!.rawApiKey = creds.accessToken;
        context.account!.providerSpecificData = {
          ...(context.account!.providerSpecificData || {}),
          refreshToken: creds.refreshToken,
          expiresAt: creds.expiresAt,
          projectId: creds.projectId,
        };
        ProviderRepository.updateAccount(context.account!.id, {
          rawApiKey: JSON.stringify(creds),
          providerSpecificData: context.account!.providerSpecificData,
        });
      }
    } catch {}
  }

  // Ensure Project ID exists
  let projectId = creds.projectId;
  if (!projectId) {
    try {
      const assist = await loadCodeAssist(creds.accessToken);
      if (assist?.projectId) {
        projectId = assist.projectId;
        creds.projectId = projectId;
        context.account!.providerSpecificData = {
          ...(context.account!.providerSpecificData || {}),
          projectId,
          tierId: assist.tierId,
        };
        ProviderRepository.updateAccount(context.account!.id, {
          providerSpecificData: context.account!.providerSpecificData,
        });
      }
    } catch {}
  }
  if (!projectId) {
    projectId = "cloudaicompanion-default";
  }

  // 2. Resolve Target Model and Thinking Override
  const cleanModelName = (targetModel || "gemini-3.8-flash").replace(/^(antigravity|ag)\//, "");
  const modelEntry = models.find((m) => m.id === cleanModelName);
  const rawUpstream = modelEntry?.upstreamModelId || cleanModelName;

  const match = rawUpstream.match(/^(.*)\(([^()]+)\)\s*$/);
  const upstreamModel = match ? match[1].trim() : rawUpstream;
  const thinkingLevel = match ? match[2].trim() : undefined;

  // 3. Build Google Cloud Code PA Request Envelope
  const rawSessionId = resolveSessionId(req, body, context.account?.name || "local");
  const sessionId = toNumericSessionId(rawSessionId);

  const rawMessages: any[] = Array.isArray(body.messages) ? body.messages : [];
  const messages: any[] = rawMessages;
  let systemText: string | undefined;

  const systemMsg = messages.find((m) => m.role === "system");
  if (systemMsg) {
    systemText = typeof systemMsg.content === "string" ? systemMsg.content : JSON.stringify(systemMsg.content);
  } else if (typeof body.system === "string") {
    systemText = body.system;
  }
  if (systemText) {
    for (const { from, to } of ANTIGRAVITY_PROMPT_REWRITES) {
      systemText = typeof to === "function" ? systemText.replaceAll(from as any, to as any) : systemText.replaceAll(from as any, to);
    }
  }

  // Pre-build tool responses FIFO queue keyed by tool_call_id
  const toolResponses: Record<string, any[]> = {};
  for (const msg of messages) {
    if (msg.role === "tool" && msg.tool_call_id) {
      (toolResponses[msg.tool_call_id] ||= []).push(msg.content);
    }
  }
  const toolResponseCursor: Record<string, number> = {};

  const tcID2Name: Record<string, string> = {};
  for (const m of messages) {
    if (m.role === "assistant" && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        if (tc?.id && tc.function?.name) {
          tcID2Name[tc.id] = tc.function.name;
        }
      }
    }
  }

  const uniquifier = createToolCallIdUniquifier();
  const rawContents: any[] = [];

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === "system") continue;

    if (m.role === "user") {
      const parts = convertOpenAIContentToParts(m.content);
      if (parts.length > 0) {
        rawContents.push({ role: "user", parts });
      }
    } else if (m.role === "assistant") {
      const parts: any[] = [];
      const hasToolCalls = Array.isArray(m.tool_calls) && m.tool_calls.length > 0;

      // Note: Strip thought-only parts from historical assistant turns (Gemini rejects or loops on them)
      if (m.content) {
        const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        if (text) parts.push({ text });
      }

      if (hasToolCalls) {
        const toolCallIds: Array<{ origId: string; emitId: string; name: string }> = [];
        let firstFunctionCallSeen = false;

        for (const tc of m.tool_calls) {
          if (tc.type !== "function" || !tc.function) continue;
          const rawArgs = tryParseJSON(tc.function.arguments);
          const args = sanitizeToolArguments(rawArgs || tc.function.arguments);
          const origId = tc.id || `call_${Date.now()}`;
          const emitId = uniquifier.next(origId);

          const cachedSig = getGeminiThoughtSignatureSync(origId, sessionId, targetModel);
          const fallbackSig = getDefaultThinkingSignature(targetModel || upstreamModel);
          const callSig = cachedSig || (!firstFunctionCallSeen ? fallbackSig : undefined);
          firstFunctionCallSeen = true;

          const part: any = {
            functionCall: {
              id: emitId,
              name: sanitizeGeminiFunctionName(tc.function.name),
              args,
            },
          };
          if (callSig) {
            part.thoughtSignature = callSig;
          }
          parts.push(part);
          toolCallIds.push({ origId, emitId, name: tc.function.name });
        }

        if (parts.length > 0) {
          rawContents.push({ role: "model", parts });
        }

        // Pair tool responses immediately with the calling function calls
        const isIntermediate = i < messages.length - 1;
        const hasActualResponses = toolCallIds.some(
          ({ origId }) => (toolResponseCursor[origId] || 0) < (toolResponses[origId]?.length ?? 0)
        );

        if (hasActualResponses || isIntermediate) {
          const toolParts: any[] = [];
          for (const { origId, emitId, name: callName } of toolCallIds) {
            const queue = toolResponses[origId];
            const cursor = toolResponseCursor[origId] || 0;
            let resp: any = "";
            if (queue && cursor < queue.length) {
              resp = queue[cursor];
              toolResponseCursor[origId] = cursor + 1;
            }

            let name = callName || tcID2Name[origId];
            if (!name) {
              const idParts = String(origId).split("-");
              if (idParts.length > 2) {
                name = idParts.slice(0, -2).join("-");
              } else {
                name = origId || "tool";
              }
            }

            let parsedResp = tryParseJSON(resp);
            if (parsedResp === null || typeof parsedResp !== "object") {
              parsedResp = { result: resp ?? "" };
            }

            toolParts.push({
              functionResponse: {
                id: emitId,
                name: sanitizeGeminiFunctionName(name),
                response: { result: sanitizeFunctionResponsePayload(parsedResp) },
              },
            });
          }

          if (toolParts.length > 0) {
            rawContents.push({ role: "user", parts: toolParts });
          }
        }
      } else if (parts.length > 0) {
        rawContents.push({ role: "model", parts });
      }
    }
    // Note: msg.role === "tool" is ignored here as all tool results are consumed
    // in strict FIFO pairing with their initiating assistant function calls.
  }

  const isG4 = isGemini4Model(targetModel) || isGemini4Model(upstreamModel);
  const contents = normalizeGeminiContents(rawContents, upstreamModel || targetModel);

  // Tools declaration
  let tools: any[] | undefined;
  if (Array.isArray(body.tools) && body.tools.length > 0) {
    const declarations: any[] = [];
    for (const t of body.tools) {
      if (t.name && (t.input_schema || t.parameters)) {
        declarations.push({
          name: sanitizeGeminiFunctionName(t.name),
          description: t.description || "",
          parameters: cleanJSONSchemaForAntigravity(t.input_schema || t.parameters || { type: "object", properties: {} }),
        });
      } else if (t.type === "function" && t.function) {
        declarations.push({
          name: sanitizeGeminiFunctionName(t.function.name),
          description: t.function.description || "",
          parameters: cleanJSONSchemaForAntigravity(t.function.parameters || { type: "object", properties: {} }),
        });
      } else if (t.function?.name) {
        declarations.push({
          name: sanitizeGeminiFunctionName(t.function.name),
          description: t.function.description || "",
          parameters: cleanJSONSchemaForAntigravity(t.function.parameters || { type: "object", properties: {} }),
        });
      }
    }
    if (declarations.length > 0) {
      tools = [{ functionDeclarations: declarations }];
    }
  }

  const generationConfig: any = {};
  if (!isG4) {
    if (body.temperature != null) generationConfig.temperature = body.temperature;
    if (body.top_p != null) generationConfig.topP = body.top_p;
    if (body.top_k != null) generationConfig.topK = body.top_k;
  }
  const floorTokens = thinkingLevel?.toLowerCase() === "high" ? 65535 : 16384;
  generationConfig.maxOutputTokens = Math.max(body.max_tokens || 0, floorTokens);
  stripBlacklisted(generationConfig);

  const ideRequestId = buildIdeRequestId({
    sessionId: String(sessionId),
    model: upstreamModel,
    contentCount: contents.length,
    requestType: "agent",
  });

  const envelope = {
    project: projectId,
    model: upstreamModel,
    userAgent: "antigravity",
    requestId: ideRequestId,
    request: {
      contents,
      ...(systemText ? { systemInstruction: { role: "user", parts: [{ text: systemText }] } } : {}),
      generationConfig,
      ...(tools ? { tools, toolConfig: { functionCallingConfig: { mode: "VALIDATED" } } } : {}),
      sessionId,
    },
  };

  // 4. Endpoint URL and Headers
  const baseUrl = (context.provider?.baseUrl || "https://daily-cloudcode-pa.googleapis.com").replace(/\/+$/, "");
  const targetUrl = `${baseUrl}/v1internal:${isStreaming ? "streamGenerateContent?alt=sse" : "generateContent"}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${creds.accessToken}`,
    "User-Agent": "antigravity/ide/2.22.0 darwin/arm64",
    Accept: isStreaming ? "text/event-stream" : "application/json",
    "x-request-source": "local",
  };

  const effectiveProxy = (context.provider?.proxyUrl && context.provider.proxyUrl.trim()) || "";

  // 5. Upstream Dispatch
  let upstreamRes = await executeUpstreamFetch(
    targetUrl,
    { method: "POST", headers, body: JSON.stringify(envelope) },
    effectiveProxy
  );

  // 401 Auth Retry
  if (!upstreamRes.ok && upstreamRes.status === 401 && providerInstance.handleAuthRefresh) {
    const refreshed = await providerInstance.handleAuthRefresh(context, 401);
    if (refreshed) {
      const refreshedCreds = resolveAccountCredentials(context);
      if (refreshedCreds?.accessToken) {
        headers.Authorization = `Bearer ${refreshedCreds.accessToken}`;
        upstreamRes = await executeUpstreamFetch(
          targetUrl,
          { method: "POST", headers, body: JSON.stringify(envelope) },
          effectiveProxy
        );
      }
    }
  }

  if (!upstreamRes.ok) {
    const errText = await upstreamRes.text().catch(() => "");
    return {
      ok: false,
      status: upstreamRes.status,
      error: errText || `Google Antigravity request failed with status ${upstreamRes.status}`,
    };
  }

  const responseId = `chatcmpl-${requestId}`;
  const created = Math.floor(Date.now() / 1000);

  // 6. Non-Streaming Response Path
  if (!isStreaming) {
    const rawText = await upstreamRes.text();
    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      return { ok: false, status: 502, error: "Failed to parse Google Antigravity JSON response" };
    }

    const responseObj = data.response || data;
    const candidate = responseObj?.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    let fullText = "";
    let reasoningText = "";
    const toolCalls: any[] = [];
    let currentThoughtSignature: string | null = null;

    for (const part of parts) {
      const sig = part.thoughtSignature || (part as any).thought_signature;
      if (sig) {
        currentThoughtSignature = sig;
      }
    }

    for (const part of parts) {
      if (part.thought) {
        if (part.text) {
          reasoningText += part.text;
        }
      } else if (part.text) {
        fullText += part.text;
      } else if (part.functionCall) {
        const rawArgs = part.functionCall.args || {};
        const cleanedArgs = sanitizeToolArguments(rawArgs);
        const toolCall = {
          id: part.functionCall.id || `call_${Date.now()}`,
          type: "function",
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(cleanedArgs),
          },
        };
        toolCalls.push(toolCall);
        const sig = part.thoughtSignature || (part as any).thought_signature || currentThoughtSignature;
        if (sig) {
          storeGeminiThoughtSignature(toolCall.id, sig, sessionId, targetModel);
          currentThoughtSignature = null;
        }
        const argsStr = JSON.stringify(cleanedArgs);
        const argsPreview = argsStr.length > 100 ? argsStr.slice(0, 100) + "..." : argsStr;
        logger.line(reqTag, "🛠️", `Tool invoked: ${part.functionCall.name}(${argsPreview}) [${toolCall.id}]`);
      }
    }

    const rawFinishReason = mapFinishReason(candidate?.finishReason);
    const finishReason = toolCalls.length > 0 && rawFinishReason === "stop" ? "tool_calls" : rawFinishReason;
    const usage = responseObj?.usageMetadata || {};
    const promptTokens = usage.promptTokenCount || 0;
    const completionTokens = usage.candidatesTokenCount || 0;

    const openAiResponse = {
      id: responseId,
      object: "chat.completion",
      created,
      model: targetModel,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: fullText || null,
            ...(reasoningText ? { reasoning_content: reasoningText } : {}),
            ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
          },
          finish_reason: finishReason,
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
    };

    if (clientFormat === "responses") {
      const responsesRes = convertOpenAiResponseToResponsesApi(openAiResponse);
      res.status(200).json(responsesRes);
    } else if (clientFormat === "anthropic") {
      const contentBlocks: any[] = [];
      if (reasoningText) contentBlocks.push({ type: "thinking", thinking: reasoningText });
      if (fullText) contentBlocks.push({ type: "text", text: fullText });
      for (const tc of toolCalls) {
        contentBlocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function?.name,
          input: tryParseJSON(tc.function?.arguments),
        });
      }

      const anthropicRes = {
        id: `msg_${requestId}`,
        type: "message",
        role: "assistant",
        model: targetModel,
        content: contentBlocks,
        stop_reason: toolCalls.length > 0 ? "tool_use" : (finishReason === "length" ? "max_tokens" : "end_turn"),
        usage: { input_tokens: promptTokens, output_tokens: completionTokens },
      };
      res.status(200).json(anthropicRes);
    } else {
      res.status(200).json(openAiResponse);
    }

    const durationMs = Date.now() - startTime;
    const calculatedCost = ResponseLogger.logSuccess({
      requestId,
      startTime,
      durationMs,
      clientTool: context.clientTool || "generic",
      rawModel: context.rawModel || targetModel,
      targetModel,
      providerId: "antigravity",
      accountId: context.account?.id,
      accountName: context.account?.name,
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
    logger.line(reqTag, LogSymbol.USAGE, `antigravity/${targetModel} · ${doneMsg}`);

    if (context.loopSignature) {
      const toolCalls = openAiResponse?.choices?.[0]?.message?.tool_calls?.map((tc: any) => ({
        name: tc.function?.name || tc.name,
        arguments: tc.function?.arguments || tc.arguments,
      }));
      recordLoopTurnResult(context.loopSignature, completionTokens, toolCalls);
    }

    return { ok: true, status: 200, json: openAiResponse, modelUsed: targetModel };
  }

  // 7. Streaming Response Path
  if (!upstreamRes.body) {
    return { ok: false, status: 502, error: "Empty stream body from Google Antigravity" };
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const reader = upstreamRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let ttftMs = 0;
  let hasSentInitial = false;
  let geminiToolCallCount = 0;
  let currentThoughtSignature: string | null = null;
  const collectedToolCalls: Array<{ name: string; arguments?: any }> = [];

  const anthropicState =
    clientFormat === "anthropic" ? AnthropicAdapter.createStreamState(`msg_${requestId}`, body.tools) : undefined;
  const responsesState =
    clientFormat === "responses" ? createResponsesStreamState(requestId) : undefined;

  if (clientFormat === "anthropic") {
    res.write(
      `event: message_start\ndata: ${JSON.stringify({
        type: "message_start",
        message: {
          id: `msg_${requestId}`,
          type: "message",
          role: "assistant",
          model: targetModel,
          content: [],
        },
      })}\n\n`
    );
  }

  const writeChunk = (chunk: any) => {
    if (clientFormat === "responses" && responsesState) {
      const events = openAiChunkToResponsesEvents(chunk, responsesState);
      for (const ev of events) {
        res.write(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`);
      }
    } else if (clientFormat === "anthropic" && anthropicState) {
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

      if (!ttftMs) {
        ttftMs = Date.now() - startTime;
        logger.line(reqTag, LogSymbol.STREAM, `TTFT ${ttftMs}ms · streaming chunks...`);
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr || jsonStr === "[DONE]") continue;

        let parsed: any;
        try {
          parsed = JSON.parse(jsonStr);
        } catch {
          continue;
        }

        const respObj = parsed.response || parsed;
        const candidate = respObj?.candidates?.[0];
        if (!candidate) continue;

        const rawFinishReason = candidate.finishReason ? mapFinishReason(candidate.finishReason) : null;

        if (respObj?.usageMetadata) {
          promptTokens = respObj.usageMetadata.promptTokenCount || promptTokens;
          completionTokens = respObj.usageMetadata.candidatesTokenCount || completionTokens;
        }

        if (!hasSentInitial) {
          hasSentInitial = true;
          writeChunk({
            id: responseId,
            object: "chat.completion.chunk",
            created,
            model: targetModel,
            choices: [
              {
                index: 0,
                delta: { role: "assistant" },
                finish_reason: null,
              },
            ],
          });
        }

        const parts = candidate.content?.parts || [];
        for (const part of parts) {
          const sig = part.thoughtSignature || (part as any).thought_signature;
          if (sig) {
            currentThoughtSignature = sig;
          }
        }

        for (const part of parts) {
          if (part.thought) {
            if (part.text && part.text.length > 0) {
              const chunk = {
                id: responseId,
                object: "chat.completion.chunk",
                created,
                model: targetModel,
                choices: [
                  {
                    index: 0,
                    delta: { reasoning_content: part.text },
                    finish_reason: null,
                  },
                ],
              };
              writeChunk(chunk);
            }
          } else if (part.text) {
            const chunk = {
              id: responseId,
              object: "chat.completion.chunk",
              created,
              model: targetModel,
              choices: [
                {
                  index: 0,
                  delta: { content: part.text },
                  finish_reason: null,
                },
              ],
            };
            writeChunk(chunk);
          } else if (part.functionCall) {
            const rawArgs = part.functionCall.args || {};
            const cleanedArgs = sanitizeToolArguments(rawArgs);
            collectedToolCalls.push({
              name: part.functionCall.name,
              arguments: cleanedArgs,
            });
            const toolCall = {
              id: part.functionCall.id || `call_${Date.now()}`,
              index: geminiToolCallCount,
              type: "function",
              function: {
                name: part.functionCall.name,
                arguments: JSON.stringify(cleanedArgs),
              },
            };
            geminiToolCallCount++;
            const sig = part.thoughtSignature || (part as any).thought_signature || currentThoughtSignature;
            if (sig) {
              storeGeminiThoughtSignature(toolCall.id, sig, sessionId, targetModel);
              currentThoughtSignature = null;
            }
            const argsStr = JSON.stringify(cleanedArgs);
            const argsPreview = argsStr.length > 100 ? argsStr.slice(0, 100) + "..." : argsStr;
            logger.line(reqTag, "🛠️", `Tool invoked: ${part.functionCall.name}(${argsPreview}) [${toolCall.id}]`);
            const chunk = {
              id: responseId,
              object: "chat.completion.chunk",
              created,
              model: targetModel,
              choices: [
                {
                  index: 0,
                  delta: { tool_calls: [toolCall] },
                  finish_reason: null,
                },
              ],
            };
            writeChunk(chunk);
          }
        }

        if (rawFinishReason) {
          const finishReason = geminiToolCallCount > 0 && rawFinishReason === "stop" ? "tool_calls" : rawFinishReason;
          const finishChunk = {
            id: responseId,
            object: "chat.completion.chunk",
            created,
            model: targetModel,
            choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
            usage: {
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: promptTokens + completionTokens,
            },
          };
          writeChunk(finishChunk);
        }
      }
    }
  } catch (err: any) {
    logger.warn("ANTIGRAVITY", `Stream read error: ${err.message}`);
  }

  if (clientFormat === "responses" && responsesState) {
    const finalEvents = finalizeResponsesStream(responsesState);
    for (const ev of finalEvents) {
      res.write(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`);
    }
  } else if (clientFormat === "anthropic" && anthropicState) {
    const finalEvents = AnthropicAdapter.finalizeStream(anthropicState);
    for (const ev of finalEvents) res.write(ev);
  } else {
    res.write("data: [DONE]\n\n");
  }
  res.end();

  const durationMs = Date.now() - startTime;
  const calculatedCost = ResponseLogger.logSuccess({
    requestId,
    startTime,
    durationMs,
    clientTool: context.clientTool || "generic",
    rawModel: context.rawModel || targetModel,
    targetModel,
    providerId: "antigravity",
    accountId: context.account?.id,
    accountName: context.account?.name,
    promptTokens,
    completionTokens,
    cachedTokens: 0,
    cacheCreationTokens: 0,
    reasoningTokens: 0,
    tokensSavedByRtk: context.rtkStats?.tokensSaved || 0,
    is1mContext: context.is1mContext,
    ttftMs,
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
  logger.line(reqTag, LogSymbol.USAGE, `antigravity/${targetModel} · ${doneMsg}`);

  if (context.loopSignature) {
    recordLoopTurnResult(context.loopSignature, completionTokens, collectedToolCalls);
  }

  return { ok: true, status: 200, isStream: true, modelUsed: targetModel };
}
