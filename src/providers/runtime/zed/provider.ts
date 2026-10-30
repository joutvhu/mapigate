import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type {
  ProviderRequestContext,
  SingleModelHandler,
  ModelCallResult,
  ProviderProbeContext,
  ProviderProbeResult,
} from "../../core/types.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import { metadata } from "./metadata.js";
import { getZedUsage } from "./quota.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import {
  createResponsesStreamState,
  openAiChunkToResponsesEvents,
  finalizeResponsesStream,
} from "../../../core/adapters/responsesAdapter.js";
import { ResponseLogger } from "../../../server/proxy/responseLogger.js";

const llmTokenCache = new Map<string, { token: string; expiresAt: number }>();

function normalizeZedProvider(model: string): string {
  const m = String(model || "").toLowerCase();
  if (m.includes("claude")) return "anthropic";
  if (m.includes("gemini")) return "google";
  if (m.includes("grok") || m.includes("xai")) return "x_ai";
  return "open_ai";
}

async function fetchZedLlmToken(credentials: { accessToken: string; userId: string; systemId?: string; organizationId?: string }): Promise<string> {
  const cacheKey = `${credentials.userId}:${credentials.organizationId || "default"}`;
  const cached = llmTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `${credentials.userId} ${credentials.accessToken}`,
  };

  const body: any = {};
  if (credentials.organizationId) body.organization_id = credentials.organizationId;

  const res = await fetch("https://cloud.zed.dev/client/llm_tokens", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Zed LLM token exchange failed (${res.status}): ${errText}`);
  }

  const data: any = await res.json();
  const token = typeof data?.token === "string" ? data.token : data?.token?.[0] || data?.token?.value;
  if (!token) throw new Error("Zed did not return an LLM token");

  llmTokenCache.set(cacheKey, { token, expiresAt: Date.now() + 45 * 60 * 1000 });
  return token;
}

export class ZedProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getZedUsage(context.account.rawApiKey, context.account.providerSpecificData);
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const token = (context.account?.rawApiKey || context.apiKey || "").trim();
    if (!token) {
      return {
        success: false,
        error: "Zed access token is required (sign in via OAuth).",
      };
    }

    const psd = ((context.account?.providerSpecificData || context.providerSpecificData || {}) as any);
    const userId = psd.userId || psd.user_id || "";
    const timeoutMs = context.timeoutMs || 8000;

    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: userId ? `${userId} ${token}` : `Bearer ${token}`,
      ...(context.customHeaders || {}),
    };

    try {
      const res = await fetch("https://cloud.zed.dev/client/users/me", {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.ok || res.status === 200) {
        return {
          success: true,
          endpointUrl: "https://cloud.zed.dev",
          models: metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
          count: metadata.models.length,
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          error: `Authentication failed (HTTP ${res.status}): Invalid or expired Zed token`,
          authError: "Invalid or expired Zed token",
        };
      }

      const errText = await res.text().catch(() => "");
      return {
        success: false,
        error: `Endpoint returned HTTP ${res.status}: ${errText.slice(0, 100)}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Failed to connect to Zed: ${msg}`,
      };
    }
  }

  public async execute(
    context: ProviderRequestContext,
    _dispatchSingleModel: SingleModelHandler
  ): Promise<ModelCallResult> {
    const { body, targetModel, isPanel, res, clientFormat, requestId } = context;
    const isStreaming = body.stream !== false && !isPanel;
    const psd = context.account?.providerSpecificData || {};
    const userId = psd.userId || "";
    const accessToken = context.account?.rawApiKey || "";

    if (!userId || !accessToken) {
      return { ok: false, status: 401, error: "Zed userId or accessToken missing" };
    }

    let llmToken: string;
    try {
      llmToken = await fetchZedLlmToken({
        userId,
        accessToken,
        systemId: psd.systemId,
        organizationId: psd.organizationId,
      });
    } catch (err: any) {
      return { ok: false, status: 401, error: err.message };
    }

    const providerKey = normalizeZedProvider(targetModel);
    const payload = {
      thread_id: body.thread_id || undefined,
      prompt_id: body.prompt_id || undefined,
      provider: providerKey,
      model: targetModel,
      provider_request: { ...(body || {}), model: targetModel, stream: isStreaming },
    };

    const completionRes = await fetch("https://cloud.zed.dev/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson, text/event-stream, */*",
        "User-Agent": "Mapigate/zed",
        Authorization: `Bearer ${llmToken}`,
        "x-zed-client-supports-status-messages": "true",
        "x-zed-client-supports-stream-ended-request-completion-status": "true",
      },
      body: JSON.stringify(payload),
    });

    if (!completionRes.ok) {
      if (completionRes.status === 401) {
        const cacheKey = `${userId}:${psd.organizationId || "default"}`;
        llmTokenCache.delete(cacheKey);
      }
      const errText = await completionRes.text();
      return { ok: false, status: completionRes.status, error: `Zed completion failed: ${errText}` };
    }

    if (!completionRes.body) {
      return { ok: false, status: 502, error: "Zed empty completion response body" };
    }

    const responseId = `chatcmpl-zed-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);
    let accumulatedContent = "";

    if (isStreaming && res) {
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
          for (const ev of events) {
            res.write(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`);
          }
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

      emit({
        id: responseId,
        object: "chat.completion.chunk",
        created,
        model: targetModel,
        choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
      });

      const reader = completionRes.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            if (line === "[DONE]" || line === "data: [DONE]") break;

            let chunkObj: any = null;
            try {
              chunkObj = JSON.parse(line.startsWith("data:") ? line.slice(5).trim() : line);
            } catch {
              continue;
            }

            const textDelta =
              chunkObj?.choices?.[0]?.delta?.content ||
              chunkObj?.delta?.text ||
              chunkObj?.event?.delta?.text ||
              chunkObj?.event?.choices?.[0]?.delta?.content ||
              "";

            if (textDelta) {
              accumulatedContent += textDelta;
              emit({
                id: responseId,
                object: "chat.completion.chunk",
                created,
                model: targetModel,
                choices: [{ index: 0, delta: { content: textDelta }, finish_reason: null }],
              });
            }
          }
        }
      } catch {}

      emit({
        id: responseId,
        object: "chat.completion.chunk",
        created,
        model: targetModel,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      });

      if (clientFormat === "responses" && responsesState) {
        const finalEvents = finalizeResponsesStream(responsesState);
        for (const ev of finalEvents) {
          res.write(`event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`);
        }
        res.write("data: [DONE]\n\n");
      } else if (clientFormat === "anthropic") {
        res.write(`event: message_stop\ndata: {"type":"message_stop"}\n\n`);
      } else {
        res.write("data: [DONE]\n\n");
      }
      res.end();

      const durationMs = Date.now() - context.startTime;
      const completionTokens = Math.ceil(accumulatedContent.length / 4);
      const promptTokens = context.rtkStats?.compressedTokens || 0;
      ResponseLogger.logSuccess({
        requestId: context.requestId,
        startTime: context.startTime,
        durationMs,
        clientTool: context.clientTool || "generic",
        rawModel: context.rawModel || targetModel,
        targetModel,
        providerId: "zed",
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

      return { ok: true, status: 200, modelUsed: targetModel };
    }

    // Non-streaming / isPanel
    const reader = completionRes.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line || line === "[DONE]" || line === "data: [DONE]") continue;
          let chunkObj: any = null;
          try {
            chunkObj = JSON.parse(line.startsWith("data:") ? line.slice(5).trim() : line);
          } catch {
            continue;
          }
          const textDelta =
            chunkObj?.choices?.[0]?.delta?.content ||
            chunkObj?.delta?.text ||
            chunkObj?.event?.delta?.text ||
            chunkObj?.event?.choices?.[0]?.delta?.content ||
            "";
          if (textDelta) accumulatedContent += textDelta;
        }
      }
    } catch {}

    const json = {
      id: responseId,
      object: "chat.completion",
      created,
      model: targetModel,
      choices: [{ index: 0, message: { role: "assistant", content: accumulatedContent }, finish_reason: "stop" }],
    };

    const durationMs = Date.now() - context.startTime;
    const completionTokens = Math.ceil(accumulatedContent.length / 4);
    const promptTokens = context.rtkStats?.compressedTokens || 0;
    if (!isPanel) {
      ResponseLogger.logSuccess({
        requestId: context.requestId,
        startTime: context.startTime,
        durationMs,
        clientTool: context.clientTool || "generic",
        rawModel: context.rawModel || targetModel,
        targetModel,
        providerId: "zed",
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
          headers: { "content-type": "application/json" },
          body: json,
        },
      });
    }

    return { ok: true, status: 200, json, logged: !isPanel, modelUsed: targetModel };
  }
}

export default ZedProvider;
