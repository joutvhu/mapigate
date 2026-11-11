import type { ProviderRequestContext, ModelCallResult } from "../../core/types.js";
import { executeUpstreamFetch } from "../../../server/proxy/proxyDispatcher.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import {
  createResponsesStreamState,
  openAiChunkToResponsesEvents,
  finalizeResponsesStream,
  convertOpenAiResponseToResponsesApi,
} from "../../../core/adapters/responsesAdapter.js";
import { decodeEventStreamChunk } from "../bedrock/eventStream.js";
import { extractTokenFromAccount } from "../../core/base/tokenExtractor.js";
import { buildKiroPayload } from "./converter.js";
import { normalizeKiroUpstreamModelId, resolveKiroServiceRegion } from "./models.js";
import { refreshKiroToken } from "./auth.js";
import { resolveDefaultProfileArn } from "./quota.js";
import { ResponseLogger } from "../../../server/proxy/responseLogger.js";
import { logger, LogSymbol, formatDoneLine } from "../../../shared/logger.js";

interface BufferedToolCall {
  id: string;
  name: string;
  inputChunks: string[];
  inputObject?: any;
}

function serializeToolInput(tool: BufferedToolCall): string {
  if (tool.inputObject && typeof tool.inputObject === "object") {
    try {
      return JSON.stringify(tool.inputObject);
    } catch {
      return "{}";
    }
  }
  if (tool.inputChunks.length > 0) {
    const raw = tool.inputChunks.join("").trim();
    if (raw) {
      try {
        JSON.parse(raw);
        return raw;
      } catch {
        return raw;
      }
    }
  }
  return "{}";
}

export async function executeKiro(
  context: ProviderRequestContext,
  _providerInstance: any
): Promise<ModelCallResult> {
  const { req, res, clientFormat, isPanel, startTime, requestId, reqTag = "KIRO" } = context;
  if (!res) {
    return { ok: false, status: 500, error: "Response object is required for Kiro execution" };
  }

  const rawModel = context.targetModel || "claude-sonnet-5.5";
  const targetModel = context.targetModel || rawModel;
  const upstreamModel = normalizeKiroUpstreamModelId(rawModel);
  const body = context.body || req?.body || {};
  const isStreaming = body.stream !== false && !isPanel;

  const psd = (context.account?.providerSpecificData || {}) as Record<string, any>;
  const authMethod = psd.authMethod || "builder-id";
  const region = psd.region || "us-east-1";
  const profileArn = (psd.profileArn || "").trim();

  // 1. Build Payload
  const upstreamPayload = buildKiroPayload(body, upstreamModel, context.account, requestId);

  // 2. Build Headers
  const bearerToken = extractTokenFromAccount(context.account);
  const provCustomHeaders = (context.provider as any)?.customHeaders || {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/vnd.amazon.eventstream",
    "User-Agent": "aws-sdk-js/3.0.0 KiroIDE/1.4.154 KAS/0.66.92-hotfix.5 os/win32 md/appVersion-1.4.154",
    "x-amz-user-agent": "aws-sdk-js/3.0.0 KiroIDE/1.4.154 KAS/0.66.92-hotfix.5 os/win32 md/appVersion-1.4.154",
    "x-amzn-kiro-agent-mode": "spec",
    "x-amzn-codewhisperer-machine-id": "kiro-desktop",
    ...provCustomHeaders,
  };

  if (bearerToken) {
    headers["Authorization"] = bearerToken.startsWith("Bearer ") ? bearerToken : `Bearer ${bearerToken}`;
    headers["x-amz-sso-bearer"] = bearerToken.replace(/^Bearer\s+/i, "");
  }

  if (authMethod === "api-key" || authMethod === "api_key") {
    headers["tokentype"] = "API_KEY";
  } else if (authMethod === "external_idp") {
    headers["TokenType"] = "EXTERNAL_IDP";
  }

  const effectiveProfileArn = profileArn || resolveDefaultProfileArn(authMethod);
  if (effectiveProfileArn) {
    headers["x-amzn-codewhisperer-profile-arn"] = effectiveProfileArn;
  }

  // 3. Resolve Target Endpoint URL
  const accountBase = (psd.baseUrl || "").trim();
  const providerBase = (context.provider?.baseUrl || "").trim();
  let targetUrl = accountBase || providerBase;
  if (!targetUrl) {
    if (authMethod === "external_idp") {
      const cwRegion = resolveKiroServiceRegion("codewhisperer", region);
      targetUrl = `https://codewhisperer.${cwRegion}.amazonaws.com/generateAssistantResponse`;
    } else if (authMethod === "api-key" || authMethod === "api_key") {
      const qRegion = resolveKiroServiceRegion("q", region);
      targetUrl = `https://q.${qRegion}.amazonaws.com/generateAssistantResponse`;
    } else {
      const runtimeRegion = resolveKiroServiceRegion("runtime", region);
      targetUrl = `https://runtime.${runtimeRegion}.kiro.dev/generateAssistantResponse`;
    }
  }

  if (targetUrl.includes("://codewhisperer.")) {
    headers["X-Amz-Target"] = "AmazonCodeWhispererStreamingService.GenerateAssistantResponse";
  }

  const effectiveProxy = (context.provider?.proxyUrl && context.provider.proxyUrl.trim()) || "";

  // 4. Dispatch Upstream
  let upstreamRes = await executeUpstreamFetch(
    targetUrl,
    { method: "POST", headers, body: JSON.stringify(upstreamPayload) },
    effectiveProxy
  );

  // Auto-refresh token and retry on 401 or 403
  if (!upstreamRes.ok && (upstreamRes.status === 401 || upstreamRes.status === 403)) {
    const refreshedToken = await refreshKiroToken(context.account);
    if (refreshedToken) {
      headers["Authorization"] = `Bearer ${refreshedToken}`;
      headers["x-amz-sso-bearer"] = refreshedToken.replace(/^Bearer\s+/i, "");
      upstreamRes = await executeUpstreamFetch(
        targetUrl,
        { method: "POST", headers, body: JSON.stringify(upstreamPayload) },
        effectiveProxy
      );
    }
  }

  if (!upstreamRes.ok) {
    const errText = await upstreamRes.text().catch(() => "");
    return {
      ok: false,
      status: upstreamRes.status,
      error: errText || `AWS CodeWhisperer request failed with status ${upstreamRes.status}`,
    };
  }

  const responseId = `chatcmpl-${requestId}`;
  const created = Math.floor(Date.now() / 1000);

  // 5. Streaming Response Path
  if (isStreaming) {
    if (!res.headersSent) {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
    }

    const reader = upstreamRes.body?.getReader();
    if (!reader) {
      return { ok: false, status: 502, error: "Empty stream body from AWS CodeWhisperer" };
    }

    let residualBuffer: any = new Uint8Array(0);
    const responsesState = clientFormat === "responses" ? createResponsesStreamState(requestId) : undefined;
    const anthropicState = clientFormat === "anthropic" ? AnthropicAdapter.createStreamState(`msg_${requestId}`) : undefined;

    let fullText = "";
    let clientDisconnected = false;
    const bufferedTools = new Map<string, BufferedToolCall>();
    let sawToolUse = false;
    let lastToolId = "";

    const onClose = () => {
      clientDisconnected = true;
      reader.cancel().catch(() => {});
    };
    if (typeof res?.once === "function") {
      res.once("close", onClose);
    }

    const writeChunkToClient = (openAiChunk: any) => {
      if (clientDisconnected || res?.writableEnded || res?.destroyed) return;
      if (clientFormat === "responses" && responsesState) {
        const responsesEvents = openAiChunkToResponsesEvents(openAiChunk, responsesState);
        for (const ev of responsesEvents) {
          res.write(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`);
        }
      } else if (clientFormat === "anthropic" && anthropicState) {
        const events = AnthropicAdapter.openAiChunkToAnthropicEvent(openAiChunk, `msg_${requestId}`, anthropicState);
        for (const ev of events) res.write(ev);
      } else {
        res.write(`data: ${JSON.stringify(openAiChunk)}\n\n`);
      }
    };

    const emitAssembledTools = () => {
      if (bufferedTools.size === 0) return;
      let toolIdx = 0;
      for (const tool of bufferedTools.values()) {
        const argsStr = serializeToolInput(tool);
        // Chunk 1: Init tool call (name + id, arguments: "")
        writeChunkToClient({
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
                    index: toolIdx,
                    id: tool.id,
                    type: "function",
                    function: {
                      name: tool.name,
                      arguments: "",
                    },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        });

        // Chunk 2: Full arguments
        writeChunkToClient({
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
                    index: toolIdx,
                    function: {
                      arguments: argsStr,
                    },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        });
        toolIdx++;
      }
      bufferedTools.clear();
    };

    try {
      while (true) {
        if (clientDisconnected || res?.writableEnded || res?.destroyed) break;

        const { done, value } = await reader.read();
        if (done || clientDisconnected) break;
        if (!value) continue;

        const { frames, remainder } = decodeEventStreamChunk(value, residualBuffer);
        residualBuffer = remainder || new Uint8Array(0);

        for (const frame of frames) {
          if (clientDisconnected || res?.writableEnded || res?.destroyed) break;

          const eventType = frame.headers[":event-type"] || frame.headers["event-type"] || "";
          const payload = frame.payload || {};

          let deltaText: string | null = null;
          let deltaReasoning: string | null = null;

          if (eventType === "assistantResponseEvent" || payload.content) {
            deltaText = payload.content || "";
            fullText += deltaText;
          } else if (eventType === "reasoningContentEvent") {
            deltaReasoning = payload.content || payload.text || "";
          } else if (eventType === "toolUseEvent") {
            sawToolUse = true;
            const values = Array.isArray(payload) ? payload : [payload];
            for (const val of values) {
              if (!val) continue;
              const toolId = val.toolUseId || lastToolId || `call_${Date.now()}_${bufferedTools.size + 1}`;
              lastToolId = toolId;
              let tool = bufferedTools.get(toolId);
              if (!tool) {
                tool = { id: toolId, name: (val.name || "").trim(), inputChunks: [] };
                bufferedTools.set(toolId, tool);
              } else if (!tool.name && val.name) {
                tool.name = val.name.trim();
              }
              if (val.input !== undefined && val.input !== null) {
                if (typeof val.input === "string") {
                  tool.inputChunks.push(val.input);
                } else if (typeof val.input === "object") {
                  tool.inputObject = val.input;
                }
              }
            }
          }

          if (deltaText || deltaReasoning) {
            writeChunkToClient({
              id: responseId,
              object: "chat.completion.chunk",
              created,
              model: rawModel,
              choices: [
                {
                  index: 0,
                  delta: {
                    ...(deltaText ? { content: deltaText } : {}),
                    ...(deltaReasoning ? { reasoning_content: deltaReasoning } : {}),
                  },
                  finish_reason: null,
                },
              ],
            });
          }
        }
      }

      // Finalize Stream
      if (!clientDisconnected && !res?.writableEnded && !res?.destroyed) {
        emitAssembledTools();

        const finishReason = sawToolUse ? "tool_calls" : "stop";
        writeChunkToClient({
          id: responseId,
          object: "chat.completion.chunk",
          created,
          model: rawModel,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: finishReason,
            },
          ],
        });

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
      }

      const durationMs = Date.now() - startTime;
      const charCount = fullText.length;
      const completionTokens = Math.ceil(charCount / 4);
      const promptTokens = context.rtkStats?.compressedTokens || 0;
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
          headers: { "content-type": "text/event-stream" },
          body: { text: "Stream completed" },
        },
      });

      const doneMsg = formatDoneLine({
        durationMs,
        promptTokens,
        completionTokens,
        tokensSaved: context.rtkStats?.tokensSaved || 0,
        cost: calculatedCost,
      });
      logger.line(
        reqTag,
        LogSymbol.SUCCESS,
        `kiro/${targetModel} · ${doneMsg}`
      );

      return { ok: true, status: 200, modelUsed: targetModel };
    } catch (streamErr: any) {
      if (!res.headersSent) {
        return { ok: false, status: 502, error: streamErr.message };
      }
      res.end();
      return { ok: false, status: 502, error: streamErr.message };
    } finally {
      if (typeof res?.removeListener === "function") {
        res.removeListener("close", onClose);
      }
    }
  }

  // 6. Non-Streaming Response Path
  const reader = upstreamRes.body?.getReader();
  if (!reader) {
    return { ok: false, status: 502, error: "Empty stream body from AWS CodeWhisperer" };
  }

  let fullContent = "";
  let residualBuffer: any = new Uint8Array(0);
  const bufferedTools = new Map<string, BufferedToolCall>();
  let lastToolId = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    const { frames, remainder } = decodeEventStreamChunk(value, residualBuffer);
    residualBuffer = remainder || new Uint8Array(0);

    for (const frame of frames) {
      const eventType = frame.headers[":event-type"] || frame.headers["event-type"] || "";
      const payload = frame.payload || {};
      if (eventType === "assistantResponseEvent" || payload.content) {
        fullContent += payload.content || "";
      } else if (eventType === "toolUseEvent") {
        const values = Array.isArray(payload) ? payload : [payload];
        for (const val of values) {
          if (!val) continue;
          const toolId = val.toolUseId || lastToolId || `call_${Date.now()}_${bufferedTools.size + 1}`;
          lastToolId = toolId;
          let tool = bufferedTools.get(toolId);
          if (!tool) {
            tool = { id: toolId, name: (val.name || "").trim(), inputChunks: [] };
            bufferedTools.set(toolId, tool);
          } else if (!tool.name && val.name) {
            tool.name = val.name.trim();
          }
          if (val.input !== undefined && val.input !== null) {
            if (typeof val.input === "string") {
              tool.inputChunks.push(val.input);
            } else if (typeof val.input === "object") {
              tool.inputObject = val.input;
            }
          }
        }
      }
    }
  }

  const assembledTools: any[] = [];
  for (const tool of bufferedTools.values()) {
    assembledTools.push({
      id: tool.id,
      type: "function",
      function: {
        name: tool.name,
        arguments: serializeToolInput(tool),
      },
    });
  }

  const hasTools = assembledTools.length > 0;
  const responseJson = {
    id: responseId,
    object: "chat.completion",
    created,
    model: rawModel,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: fullContent || null,
          ...(hasTools ? { tool_calls: assembledTools } : {}),
        },
        finish_reason: hasTools ? "tool_calls" : "stop",
      },
    ],
  };

  const durationMs = Date.now() - startTime;
  const completionTokens = Math.ceil((fullContent || "").length / 4);
  const promptTokens = context.rtkStats?.compressedTokens || 0;
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
      body: responseJson,
    },
  });

  const doneMsg = formatDoneLine({
    durationMs,
    promptTokens,
    completionTokens,
    tokensSaved: context.rtkStats?.tokensSaved || 0,
    cost: calculatedCost,
  });
  logger.line(reqTag, LogSymbol.SUCCESS, `kiro/${targetModel} · ${doneMsg}`);

  let clientResponseBody: any = responseJson;
  if (clientFormat === "responses") {
    clientResponseBody = convertOpenAiResponseToResponsesApi(responseJson);
  } else if (clientFormat === "anthropic") {
    clientResponseBody = AnthropicAdapter.openAiResponseToAnthropic(responseJson, requestId);
  }

  res.status(200).json(clientResponseBody);
  return { ok: true, status: 200, json: clientResponseBody, logged: true, modelUsed: targetModel };
}
