import crypto from "node:crypto";
import type { ProviderRequestContext, ModelCallResult } from "../../core/types.js";
import { executeUpstreamFetch } from "../../../server/proxy/proxyDispatcher.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import {
  createResponsesStreamState,
  openAiChunkToResponsesEvents,
  finalizeResponsesStream,
} from "../../../core/adapters/responsesAdapter.js";
import { decodeEventStreamChunk } from "../bedrock/eventStream.js";
import { extractTokenFromAccount } from "../../core/base/baseProvider.js";
import { buildKiroPayload } from "./converter.js";
import { normalizeKiroUpstreamModelId } from "./provider.js";
import { refreshKiroToken } from "./auth.js";
import { logger, LogSymbol, formatDoneLine } from "../../../shared/logger.js";

export async function executeKiro(
  context: ProviderRequestContext,
  _providerInstance: any
): Promise<ModelCallResult> {
  const { req, res, clientFormat, isPanel, startTime, requestId, reqTag = "KIRO" } = context;
  if (!res) {
    return { ok: false, status: 500, error: "Response object is required for Kiro execution" };
  }

  const rawModel = context.targetModel || "claude-sonnet-5.5";
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
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/vnd.amazon.eventstream",
    "User-Agent": "AWS-SDK-JS/3.0.0 kiro-ide/1.0.0",
    "x-amz-user-agent": "aws-sdk-js/3.0.0 kiro-ide/1.0.0",
    "x-amzn-kiro-agent-mode": "spec",
    "x-amzn-codewhisperer-machine-id": "kiro-desktop",
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

  if (profileArn) {
    headers["x-amzn-codewhisperer-profile-arn"] = profileArn;
  }

  // 3. Resolve Target Endpoint URL
  const accountBase = (psd.baseUrl || "").trim();
  let targetUrl = accountBase;
  if (!targetUrl) {
    if (authMethod === "external_idp") {
      targetUrl = `https://codewhisperer.${region}.amazonaws.com/generateAssistantResponse`;
    } else if (authMethod === "api-key" || authMethod === "api_key") {
      targetUrl = `https://q.${region}.amazonaws.com/generateAssistantResponse`;
    } else {
      targetUrl = `https://codewhisperer.${region}.amazonaws.com/generateAssistantResponse`;
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
    const onClose = () => {
      clientDisconnected = true;
      reader.cancel().catch(() => {});
    };
    if (typeof res?.once === "function") {
      res.once("close", onClose);
    }

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
          let deltaToolCalls: any[] | null = null;

          if (eventType === "assistantResponseEvent" || payload.content) {
            deltaText = payload.content || "";
            fullText += deltaText;
          } else if (eventType === "reasoningContentEvent") {
            deltaReasoning = payload.content || "";
          } else if (eventType === "toolUseEvent") {
            let inputArgs = "{}";
            try {
              inputArgs = typeof payload.input === "string" ? payload.input : JSON.stringify(payload.input || {});
            } catch {
              inputArgs = "{}";
            }
            deltaToolCalls = [
              {
                index: 0,
                id: payload.toolUseId || crypto.randomUUID(),
                type: "function",
                function: {
                  name: payload.name || "",
                  arguments: inputArgs,
                },
              },
            ];
          }

          if (!deltaText && !deltaReasoning && !deltaToolCalls) continue;

          const openAiChunk = {
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
                  ...(deltaToolCalls ? { tool_calls: deltaToolCalls } : {}),
                },
                finish_reason: null,
              },
            ],
          };

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
        }
      }

      // Finalize Stream
      if (!clientDisconnected && !res?.writableEnded && !res?.destroyed) {
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
      const doneMsg = formatDoneLine({
        durationMs,
        promptTokens: 0,
        completionTokens: Math.ceil(charCount / 4),
      });
      logger.line(
        reqTag,
        LogSymbol.SUCCESS,
        doneMsg
      );

      return { ok: true, status: 200 };
    } catch (streamErr: any) {
      if (!res.headersSent) {
        return { ok: false, status: 502, error: streamErr.message };
      }
      res.end();
      return { ok: false, status: 502, error: streamErr.message };
    }
  }

  // 6. Non-Streaming Response Path
  const reader = upstreamRes.body?.getReader();
  if (!reader) {
    return { ok: false, status: 502, error: "Empty stream body from AWS CodeWhisperer" };
  }

  let fullContent = "";
  let residualBuffer: any = new Uint8Array(0);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    const { frames, remainder } = decodeEventStreamChunk(value, residualBuffer);
    residualBuffer = remainder || new Uint8Array(0);

    for (const frame of frames) {
      const payload = frame.payload || {};
      if (payload.content) {
        fullContent += payload.content;
      }
    }
  }

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
          content: fullContent,
        },
        finish_reason: "stop",
      },
    ],
  };

  res.status(200).json(responseJson);
  return { ok: true, status: 200 };
}
