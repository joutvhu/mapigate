import crypto from "node:crypto";

export const WS_IDE_NAME = "windsurf";
export const WS_IDE_VERSION = "3.14.0";
export const WS_EXT_VERSION = "3.14.0";
export const WS_LOCALE = "en-US";

export const TEXT_ENC = new TextEncoder();
export const TEXT_DEC = new TextDecoder();

export function encodeVarint(value: number): Uint8Array {
  const bytes: number[] = [];
  let v = value >>> 0;
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v & 0x7f);
  return new Uint8Array(bytes);
}

export function concatBytes(arrays: Uint8Array<any>[]): Uint8Array<any> {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

export function encodeField(fieldNum: number, payload: Uint8Array): Uint8Array {
  const tag = encodeVarint((fieldNum << 3) | 2);
  const len = encodeVarint(payload.length);
  return concatBytes([tag, len, payload]);
}

export function encodeString(fieldNum: number, value: string): Uint8Array {
  return encodeField(fieldNum, TEXT_ENC.encode(value));
}

export function encodeMessage(fieldNum: number, msg: Uint8Array): Uint8Array {
  return encodeField(fieldNum, msg);
}

export function buildMetadata(apiKey: string, sessionId: string): Uint8Array {
  return concatBytes([
    encodeString(1, apiKey),
    encodeString(2, WS_IDE_NAME),
    encodeString(3, WS_IDE_VERSION),
    encodeString(4, WS_EXT_VERSION),
    encodeString(5, sessionId),
    encodeString(6, WS_LOCALE),
  ]);
}

export function buildChatMessage(role: string, content: string): Uint8Array {
  return concatBytes([encodeString(1, role), encodeString(2, content)]);
}

export function buildGetChatMessageRequest(apiKey: string, model: string, messages: any[]): Uint8Array {
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

export function grpcWebFrame(payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(5 + payload.length);
  frame[0] = 0x00;
  const view = new DataView(frame.buffer);
  view.setUint32(1, payload.length, false);
  frame.set(payload, 5);
  return frame;
}

export function readVarint(buf: Uint8Array, offset: number): [number, number] {
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

export function decodeStringField(buf: Uint8Array, targetField: number): string | null {
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

export interface WindsurfChunk {
  kind: "content" | "done" | "error" | "unknown";
  text?: string;
  message?: string;
}

export function decodeCompletionChunk(buf: Uint8Array): WindsurfChunk {
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
