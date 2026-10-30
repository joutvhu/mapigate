import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type {
  ProviderRequestContext,
  SingleModelHandler,
  ModelCallResult,
  ProviderProbeContext,
  ProviderProbeResult,
} from "../../core/types.js";
import { metadata } from "./metadata.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import {
  createResponsesStreamState,
  openAiChunkToResponsesEvents,
  finalizeResponsesStream,
} from "../../../core/adapters/responsesAdapter.js";
import { ResponseLogger } from "../../../server/proxy/responseLogger.js";

const TRAE_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

function flattenQuery(messages: any[]): string {
  const parts: string[] = [];
  for (const m of messages || []) {
    let content = "";
    if (typeof m.content === "string") content = m.content;
    else if (Array.isArray(m.content)) {
      content = m.content
        .map((p: any) => {
          if (typeof p === "string") return p;
          if (p && typeof p === "object") return String(p.text ?? "");
          return "";
        })
        .join("");
    }
    if (m.role === "system") parts.push(`[System]\n${content}`);
    else if (m.role === "assistant") parts.push(`[Assistant]\n${content}`);
    else parts.push(content);
  }
  return JSON.stringify([{ type: "text", data: { content: parts.join("\n\n") } }]);
}

export class TraeProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const token = (context.account?.rawApiKey || context.apiKey || "").trim();
    if (!token) {
      return {
        success: false,
        error: "Trae Cloud-IDE token is required (sign in via OAuth).",
      };
    }

    const timeoutMs = context.timeoutMs || 8000;
    try {
      const userRes = await fetch("https://api.marscode.com/cloudide/api/v3/trae/GetUserInfo", {
        headers: {
          Accept: "application/json",
          Authorization: `Cloud-IDE-JWT ${token}`,
          "x-cloudide-token": token,
          ...(context.customHeaders || {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (userRes.ok || userRes.status === 200) {
        return {
          success: true,
          endpointUrl: "https://api.marscode.com/cloudide/api/v3/trae",
          models: metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
          count: metadata.models.length,
        };
      }

      if (userRes.status === 401 || userRes.status === 403) {
        return {
          success: false,
          error: `Authentication failed (HTTP ${userRes.status}): Invalid or expired Trae token`,
          authError: "Invalid or expired Trae token",
        };
      }

      const errText = await userRes.text().catch(() => "");
      return {
        success: false,
        error: `Endpoint returned HTTP ${userRes.status}: ${errText.slice(0, 100)}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Failed to connect to Trae: ${msg}`,
      };
    }
  }

  private base(context: ProviderRequestContext): string {
    return (context.provider?.baseUrl || metadata.baseUrl || "https://core-normal.trae.ai/api/remote/v1").replace(/\/$/, "");
  }

  private buildTraeHeaders(context: ProviderRequestContext, stream = true): Record<string, string> {
    const token = context.account?.rawApiKey || "";
    const psd = context.account?.providerSpecificData || {};
    return {
      Authorization: `Cloud-IDE-JWT ${token}`,
      "Content-Type": "application/json",
      "X-Trae-Client-Type": "web",
      "X-Preferenced-Language": psd.appLanguage || "en",
      "x-user-region": psd.userRegion || "US",
      Referer: "https://solo.trae.ai/",
      "User-Agent": TRAE_UA,
      Accept: stream ? "text/event-stream" : "application/json",
    };
  }

  private resolveMode(model: string): { mode: string; strategy: string; modelName: string } {
    const m = (model || "").trim().toLowerCase();
    if (m === "work" || m === "auto-work" || m === "solo-work") {
      return { mode: "work", strategy: "auto", modelName: "" };
    }
    const auto = !m || m === "auto";
    return { mode: "code", strategy: auto ? "auto" : "manual", modelName: auto ? "" : model };
  }

  private commonParams(psd: any, mode: string, sessionId?: string): string {
    const cp: any = {
      language: "en-us",
      app_language: psd.appLanguage || "en",
      quality: "stable",
      app_version: psd.appVersion || "1.0.0.1229",
      web_id: psd.webId || "",
      user_identity: psd.userIdentity || "Free",
      is_freshman: "0",
      biz_user_id: psd.bizUserId || "",
      user_unique_id: psd.userUniqueId || "",
      scope: psd.scope || "marscode-us",
      tenant: psd.tenant || "marscode",
      region: psd.region || "US-East",
      aiRegion: psd.aiRegion || psd.region || "US-East",
      is_privacy_mode: 0,
      privacy_mode: "off",
      solo_chat_mode: mode,
    };
    if (sessionId) cp.biz_session_id = sessionId;
    return JSON.stringify(cp);
  }

  public async execute(
    context: ProviderRequestContext,
    _dispatchSingleModel: SingleModelHandler
  ): Promise<ModelCallResult> {
    const { body, targetModel, isPanel, res, clientFormat, requestId } = context;
    const isStreaming = body.stream !== false && !isPanel;
    const headers = this.buildTraeHeaders(context, isStreaming);
    const psd = context.account?.providerSpecificData || {};
    const query = flattenQuery(body.messages || []);
    const { mode, strategy, modelName } = this.resolveMode(targetModel);

    const sessionPayload = {
      mode,
      environment_id: "default",
      initial_message: {
        chat_session_id: "",
        content: [],
        query,
        model_name: modelName,
        agent_type: "solo_agent_remote",
        model_selection_strategy: strategy,
        common_params: this.commonParams(psd, mode),
      },
      env: "remote",
      auto_create_project: false,
      origin: "web",
    };

    const sessionRes = await fetch(`${this.base(context)}/chat_sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify(sessionPayload),
    });

    if (!sessionRes.ok) {
      const errText = await sessionRes.text();
      return { ok: false, status: sessionRes.status, error: `Trae createSession failed: ${errText}` };
    }

    const sessionJson: any = await sessionRes.json();
    if (sessionJson?.code !== 0 || !sessionJson?.data?.chat_session_id) {
      return { ok: false, status: 502, error: `Trae error: ${JSON.stringify(sessionJson)}` };
    }

    const sessionId = sessionJson.data.chat_session_id;
    const messageId = sessionJson.data.message_id;

    const eventsUrl = `${this.base(context)}/chat_sessions/${sessionId}/events?reply_to_message_id=${encodeURIComponent(messageId)}`;
    const eventsRes = await fetch(eventsUrl, { method: "GET", headers });
    if (!eventsRes.ok || !eventsRes.body) {
      return { ok: false, status: eventsRes.status, error: "Trae events stream failed" };
    }

    const responseId = `chatcmpl-trae-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);
    const order: string[] = [];
    const thoughts: Record<string, string> = {};
    let sent = 0;
    let fullText = "";

    const renderNewText = (data: any): string => {
      const pid = data.id;
      if (!pid) return "";
      if (!(pid in thoughts)) order.push(pid);
      const t = data.thought || "";
      if (t.length >= (thoughts[pid] || "").length) thoughts[pid] = t;
      const full = order.map((i) => thoughts[i]).join("");
      const piece = full.slice(sent);
      sent = full.length;
      fullText = full;
      return piece;
    };

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

      const reader = eventsRes.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let ev: string | null = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).replace(/\r$/, "");
            buf = buf.slice(nl + 1);
            if (line.startsWith("event:")) {
              ev = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              const payload = line.slice(5).trim();
              let data: any;
              try { data = JSON.parse(payload); } catch { data = { _raw: payload }; }
              if (ev === "plan_item") {
                const piece = renderNewText(data);
                if (piece) {
                  emit({
                    id: responseId,
                    object: "chat.completion.chunk",
                    created,
                    model: targetModel,
                    choices: [{ index: 0, delta: { content: piece }, finish_reason: null }],
                  });
                }
              }
              if (ev === "done") break;
            } else if (line === "") {
              ev = null;
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
      const completionTokens = Math.ceil(fullText.length / 4);
      const promptTokens = context.rtkStats?.compressedTokens || 0;
      ResponseLogger.logSuccess({
        requestId: context.requestId,
        startTime: context.startTime,
        durationMs,
        clientTool: context.clientTool || "generic",
        rawModel: context.rawModel || targetModel,
        targetModel,
        providerId: "trae",
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
    const reader = eventsRes.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let ev: string | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).replace(/\r$/, "");
          buf = buf.slice(nl + 1);
          if (line.startsWith("event:")) {
            ev = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const payload = line.slice(5).trim();
            let data: any;
            try { data = JSON.parse(payload); } catch { data = { _raw: payload }; }
            if (ev === "plan_item") renderNewText(data);
            if (ev === "done") break;
          } else if (line === "") {
            ev = null;
          }
        }
      }
    } catch {}

    const json = {
      id: responseId,
      object: "chat.completion",
      created,
      model: targetModel,
      choices: [{ index: 0, message: { role: "assistant", content: fullText }, finish_reason: "stop" }],
    };

    const durationMs = Date.now() - context.startTime;
    const completionTokens = Math.ceil(fullText.length / 4);
    const promptTokens = context.rtkStats?.compressedTokens || 0;
    if (!isPanel) {
      ResponseLogger.logSuccess({
        requestId: context.requestId,
        startTime: context.startTime,
        durationMs,
        clientTool: context.clientTool || "generic",
        rawModel: context.rawModel || targetModel,
        targetModel,
        providerId: "trae",
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

export default TraeProvider;
