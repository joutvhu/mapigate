import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderRequestContext, SingleModelHandler, ModelCallResult } from "../../core/types.js";
import { metadata } from "./metadata.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import {
  createResponsesStreamState,
  openAiChunkToResponsesEvents,
  finalizeResponsesStream,
} from "../../../core/adapters/responsesAdapter.js";
import { ResponseLogger } from "../../../server/proxy/responseLogger.js";
import {
  buildGetChatMessageRequest,
  grpcWebFrame,
  concatBytes,
  decodeCompletionChunk,
} from "./proto.js";

export class WindsurfProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public async execute(
    context: ProviderRequestContext,
    _dispatchSingleModel: SingleModelHandler
  ): Promise<ModelCallResult> {
    const { body, targetModel, isPanel, res, clientFormat, requestId } = context;
    const isStreaming = body.stream !== false && !isPanel;
    const apiKey = context.account?.rawApiKey || "";

    const protoPayload = buildGetChatMessageRequest(apiKey, targetModel, body.messages || []);
    const requestBytes = grpcWebFrame(protoPayload);

    const targetUrl =
      context.provider?.baseUrl ||
      metadata.baseUrl ||
      "https://server.codeium.com/exa.language_server_pb.LanguageServerService/GetChatMessage";

    const fetchRes = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/grpc-web+proto",
        Accept: "application/grpc-web+proto",
        "X-Grpc-Web": "1",
        Authorization: `Bearer ${apiKey}`,
      },
      body: requestBytes,
    });

    if (!fetchRes.ok) {
      const errText = await fetchRes.text();
      return { ok: false, status: fetchRes.status, error: `Windsurf gRPC request failed: ${errText}` };
    }

    if (!fetchRes.body) {
      return { ok: false, status: 502, error: "Windsurf empty response stream" };
    }

    const responseId = `chatcmpl-ws-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);
    let fullText = "";

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

      const reader = fetchRes.body.getReader();
      let rawBuf: Uint8Array<any> = new Uint8Array(0);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          rawBuf = concatBytes([rawBuf, value]);

          while (rawBuf.length >= 5) {
            const flags = rawBuf[0];
            const view = new DataView(rawBuf.buffer, rawBuf.byteOffset, 5);
            const frameLen = view.getUint32(1, false);
            if (rawBuf.length < 5 + frameLen) break;

            const framePayload = rawBuf.subarray(5, 5 + frameLen);
            rawBuf = rawBuf.subarray(5 + frameLen);

            if ((flags & 0x80) !== 0) continue; // trailers frame

            const chunk = decodeCompletionChunk(framePayload);
            if (chunk.kind === "content" && chunk.text) {
              fullText += chunk.text;
              emit({
                id: responseId,
                object: "chat.completion.chunk",
                created,
                model: targetModel,
                choices: [{ index: 0, delta: { content: chunk.text }, finish_reason: null }],
              });
            } else if (chunk.kind === "error") {
              const errMsg = chunk.message || "Windsurf upstream error";
              emit({
                id: responseId,
                object: "chat.completion.chunk",
                created,
                model: targetModel,
                choices: [{ index: 0, delta: { content: `\n[Error: ${errMsg}]` }, finish_reason: "error" }],
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
              return { ok: false, status: 500, error: errMsg };
            } else if (chunk.kind === "done") {
              break;
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
        providerId: "windsurf",
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
    const reader = fetchRes.body.getReader();
    let rawBuf: Uint8Array<any> = new Uint8Array(0);
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        rawBuf = concatBytes([rawBuf, value]);

        while (rawBuf.length >= 5) {
          const flags = rawBuf[0];
          const view = new DataView(rawBuf.buffer, rawBuf.byteOffset, 5);
          const frameLen = view.getUint32(1, false);
          if (rawBuf.length < 5 + frameLen) break;

          const framePayload = rawBuf.subarray(5, 5 + frameLen);
          rawBuf = rawBuf.subarray(5 + frameLen);

          if ((flags & 0x80) !== 0) continue;

          const chunk = decodeCompletionChunk(framePayload);
          if (chunk.kind === "content" && chunk.text) {
            fullText += chunk.text;
          } else if (chunk.kind === "error") {
            return { ok: false, status: 500, error: chunk.message || "Windsurf upstream error" };
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
        providerId: "windsurf",
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

export default WindsurfProvider;
