// Standard CRC32 polynomial 0xEDB88320 (IEEE 802.3, same as AWS EventStream)
const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

export function crc32(buf: Buffer | Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface KiroState {
  modelId: string | null;
  conversationId: string;
  toolCallInit: Record<number, { id: string; name: string }>;
  hasToolCalls: boolean;
  finishSent: boolean;
  usage: any | null;
  inThink: boolean;
  thinkBuf: string;
  initialSent: boolean;
}

export function initKiroState(modelId?: string, conversationId?: string): KiroState {
  return {
    modelId: modelId || null,
    conversationId: conversationId || "",
    toolCallInit: {},
    hasToolCalls: false,
    finishSent: false,
    usage: null,
    inThink: false,
    thinkBuf: "",
    initialSent: false,
  };
}

export function encodeHeader(name: string, value: string): Buffer {
  const nameBuf = Buffer.from(name, "utf8");
  const valueBuf = Buffer.from(value, "utf8");
  const buf = Buffer.alloc(1 + nameBuf.length + 1 + 2 + valueBuf.length);
  let o = 0;
  buf[o++] = nameBuf.length;
  nameBuf.copy(buf, o);
  o += nameBuf.length;
  buf[o++] = 7; // String type
  buf.writeUInt16BE(valueBuf.length, o);
  o += 2;
  valueBuf.copy(buf, o);
  return buf;
}

export function buildEventStreamFrame(
  eventType: string,
  payload: any,
  contentType = "application/json"
): Buffer {
  const payloadBuf = Buffer.from(
    typeof payload === "string" ? payload : JSON.stringify(payload),
    "utf8"
  );

  const headersBuf = Buffer.concat([
    encodeHeader(":message-type", "event"),
    encodeHeader(":event-type", eventType),
    encodeHeader(":content-type", contentType),
  ]);
  const headersLen = headersBuf.length;
  const totalLen = 4 + 4 + 4 + headersLen + payloadBuf.length + 4;

  const frame = Buffer.alloc(totalLen);
  frame.writeUInt32BE(totalLen, 0);
  frame.writeUInt32BE(headersLen, 4);
  frame.writeUInt32BE(crc32(frame.subarray(0, 8)), 8); // Prelude CRC
  headersBuf.copy(frame, 12);
  payloadBuf.copy(frame, 12 + headersLen);
  frame.writeUInt32BE(crc32(frame.subarray(0, totalLen - 4)), totalLen - 4); // Message CRC

  return frame;
}

export function buildInitialResponseFrame(conversationId = ""): Buffer {
  return buildEventStreamFrame(
    "initial-response",
    { conversationId: conversationId || "" },
    "application/x-amz-json-1.0"
  );
}

export function withInitialFrame(state: KiroState, frames: Buffer | Buffer[] | null): Buffer | Buffer[] | null {
  const list = frames == null ? [] : Array.isArray(frames) ? frames : [frames];
  if (state.initialSent) {
    return list.length === 0 ? null : list.length === 1 ? list[0] : list;
  }
  state.initialSent = true;
  const out = [buildInitialResponseFrame(""), ...list];
  return out.length === 1 ? out[0] : out;
}

export function isBinaryEventStream(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 12) return false;
  const totalLen = buffer.readUInt32BE(0);
  const headersLen = buffer.readUInt32BE(4);
  return totalLen > 12 && totalLen < 1000000 && headersLen < totalLen - 12;
}
