import crypto from "node:crypto";
import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderRequestContext, SingleModelHandler, ModelCallResult } from "../../core/types.js";
import { metadata } from "./metadata.js";

const WS_IDE_NAME = "windsurf";
const WS_IDE_VERSION = "3.14.0";
const WS_EXT_VERSION = "3.14.0";
const WS_LOCALE = "en-US";

const TEXT_ENC = new TextEncoder();
const TEXT_DEC = new TextDecoder();

function encodeVarint(value: number): Uint8Array {
  const bytes: number[] = [];
  let v = value >>> 0;
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v & 0x7f);
  return new Uint8Array(bytes);
}

function concatBytes(arrays: Uint8Array<any>[]): Uint8Array<any> {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function encodeField(fieldNum: number, payload: Uint8Array): Uint8Array {
  const tag = encodeVarint((fieldNum << 3) | 2);
  const len = encodeVarint(payload.length);
  return concatBytes([tag, len, payload]);
}

function encodeString(fieldNum: number, value: string): Uint8Array {
  return encodeField(fieldNum, TEXT_ENC.encode(value));
}

function encodeMessage(fieldNum: number, msg: Uint8Array): Uint8Array {
  return encodeField(fieldNum, msg);
}

function buildMetadata(apiKey: string, sessionId: string): Uint8Array {
  return concatBytes([
    encodeString(1, apiKey),
    encodeString(2, WS_IDE_NAME),
    encodeString(3, WS_IDE_VERSION),
    encodeString(4, WS_EXT_VERSION),
    encodeString(5, sessionId),
    encodeString(6, WS_LOCALE),
  ]);
}

function buildChatMessage(role: string, content: string): Uint8Array {
  return concatBytes([encodeString(1, role), encodeString(2, content)]);
}

function buildGetChatMessageRequest(apiKey: string, model: string, messages: any[]): Uint8Array {
  const sessionId = crypto.randomUUID();
  const cascadeId = crypto.randomUUID();

  const parts = [
    encodeMessage(1, buildMetadata(apiKey, sessionId)),
    encodeString(2, cascadeId),
    encodeMessage(3, encodeString(1, model)),
  ];

  for (const m of messages) {
    const role = String(m.role || "user");
    let content = "";
    if (typeof m.content === "string") content = m.content;
    else if (Array.isArray(m.content)) {
      content = m.content.map((c: any) => (typeof c === "string" ? c : c?.text || "")).join("");
    }
    parts.push(encodeMessage(4, buildChatMessage(role, content)));
  }

  return concatBytes(parts);
}

function grpcWebFrame(payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(5 + payload.length);
  frame[0] = 0x00;
  const view = new DataView(frame.buffer);
  view.setUint32(1, payload.length, false);
  frame.set(payload, 5);
  return frame;
}

function readVarint(buf: Uint8Array, offset: number): [number, number] {
  let result = 0;
  let shift = 0;
  while (offset < buf.length) {
    const b = buf[offset++];
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return [result >>> 0, offset];
}

function decodeStringField(buf: Uint8Array, targetField: number): string | null {
  let offset = 0;
  while (offset < buf.length) {
    let tag: number;
    [tag, offset] = readVarint(buf, offset);
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x07;
    if (wireType === 2) {
      let len: number;
      [len, offset] = readVarint(buf, offset);
      const payload = buf.subarray(offset, offset + len);
      offset += len;
      if (fieldNum === targetField) return TEXT_DEC.decode(payload);
    } else if (wireType === 0) {
      let v: number;
      [v, offset] = readVarint(buf, offset);
    } else if (wireType === 1) {
      offset += 8;
    } else if (wireType === 5) {
      offset += 4;
    } else {
      break;
    }
  }
  return null;
}

function decodeCompletionChunk(buf: Uint8Array): { kind: string; text?: string; message?: string } {
  let offset = 0;
  while (offset < buf.length) {
    let tag: number;
    [tag, offset] = readVarint(buf, offset);
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x07;

    if (wireType === 2) {
      let len: number;
      [len, offset] = readVarint(buf, offset);
      const payload = buf.subarray(offset, offset + len);
      offset += len;

      if (fieldNum === 1) {
        const text = decodeStringField(payload, 1);
        if (text !== null) return { kind: "content", text };
      } else if (fieldNum === 3) {
        return { kind: "done" };
      } else if (fieldNum === 4) {
        const msg = decodeStringField(payload, 1);
        return { kind: "error", message: msg ?? "unknown windsurf error" };
      }
    } else if (wireType === 0) {
      let v: number;
      [v, offset] = readVarint(buf, offset);
    } else if (wireType === 1) {
      offset += 8;
    } else if (wireType === 5) {
      offset += 4;
    } else {
      break;
    }
  }
  return { kind: "unknown" };
}

export class WindsurfProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public async execute(
    context: ProviderRequestContext,
    _dispatchSingleModel: SingleModelHandler
  ): Promise<ModelCallResult> {
    const { body, targetModel, isPanel, res } = context;
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

      const emit = (obj: any) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
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
      res.write("data: [DONE]\n\n");
      res.end();

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

    return { ok: true, status: 200, json, modelUsed: targetModel };
  }
}

export default WindsurfProvider;
