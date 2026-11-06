import zlib from "node:zlib";

export const WIRE_TYPE = {
  VARINT: 0,
  FIXED64: 1,
  LEN: 2,
  FIXED32: 5,
} as const;

export const COMPRESS_FLAG = {
  NONE: 0x00,
  GZIP: 0x01,
  TRAILER: 0x02,
  GZIP_TRAILER: 0x03,
} as const;

export function concatBuffers(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export function encodeVarint(value: number): Uint8Array {
  const bytes: number[] = [];
  let v = value;
  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v & 0x7f);
  return new Uint8Array(bytes);
}

export function decodeVarint(buffer: Uint8Array, offset: number): [number, number] {
  let result = 0;
  let shift = 0;
  let pos = offset;

  while (pos < buffer.length) {
    const b = buffer[pos];
    result |= (b & 0x7f) << shift;
    pos++;
    if (!(b & 0x80)) break;
    shift += 7;
  }

  return [result, pos];
}

export function encodeField(fieldNum: number, wireType: number, value: Uint8Array | string | number | boolean): Uint8Array {
  const tag = (fieldNum << 3) | wireType;
  const tagBytes = encodeVarint(tag);

  if (wireType === WIRE_TYPE.VARINT) {
    const num = typeof value === "boolean" ? (value ? 1 : 0) : Number(value);
    return concatBuffers(tagBytes, encodeVarint(num));
  }

  if (wireType === WIRE_TYPE.LEN) {
    let dataBytes: Uint8Array;
    if (typeof value === "string") {
      dataBytes = new TextEncoder().encode(value);
    } else if (value instanceof Uint8Array) {
      dataBytes = value;
    } else if (Buffer.isBuffer(value)) {
      dataBytes = new Uint8Array(value);
    } else {
      dataBytes = new Uint8Array(0);
    }
    const lengthBytes = encodeVarint(dataBytes.length);
    return concatBuffers(tagBytes, lengthBytes, dataBytes);
  }

  if (wireType === WIRE_TYPE.FIXED64) {
    const buf = Buffer.alloc(8);
    buf.writeDoubleLE(Number(value));
    return concatBuffers(tagBytes, buf);
  }

  return new Uint8Array(0);
}

export function decodeField(
  buffer: Uint8Array,
  offset: number
): [number | null, number | null, Uint8Array | number | null, number] {
  if (offset >= buffer.length) return [null, null, null, offset];

  const [tag, pos1] = decodeVarint(buffer, offset);
  const fieldNum = tag >> 3;
  const wireType = tag & 0x07;

  let value: Uint8Array | number | null;
  let pos = pos1;

  if (wireType === WIRE_TYPE.VARINT) {
    [value, pos] = decodeVarint(buffer, pos);
  } else if (wireType === WIRE_TYPE.LEN) {
    const [length, pos2] = decodeVarint(buffer, pos);
    value = buffer.subarray(pos2, pos2 + length);
    pos = pos2 + length;
  } else if (wireType === WIRE_TYPE.FIXED64) {
    value = buffer.subarray(pos, pos + 8);
    pos += 8;
  } else if (wireType === WIRE_TYPE.FIXED32) {
    value = buffer.subarray(pos, pos + 4);
    pos += 4;
  } else {
    value = null;
  }

  return [fieldNum, wireType, value, pos];
}

export type DecodedFields = Map<number, Array<{ wireType: number; value: any }>>;

export function decodeMessage(data: Uint8Array): DecodedFields {
  const fields: DecodedFields = new Map();
  let pos = 0;

  while (pos < data.length) {
    const [fieldNum, wireType, value, newPos] = decodeField(data, pos);
    if (fieldNum === null || wireType === null) break;

    let arr = fields.get(fieldNum);
    if (!arr) {
      arr = [];
      fields.set(fieldNum, arr);
    }
    arr.push({ wireType, value });
    pos = newPos;
  }

  return fields;
}

export function wrapConnectRPCFrame(payload: Uint8Array, compress = false): Uint8Array {
  let finalPayload = payload;
  let flags = 0x00;

  if (compress) {
    finalPayload = new Uint8Array(zlib.gzipSync(Buffer.from(payload)));
    flags = 0x01;
  }

  const frame = new Uint8Array(5 + finalPayload.length);
  frame[0] = flags;
  frame[1] = (finalPayload.length >> 24) & 0xff;
  frame[2] = (finalPayload.length >> 16) & 0xff;
  frame[3] = (finalPayload.length >> 8) & 0xff;
  frame[4] = finalPayload.length & 0xff;
  frame.set(finalPayload, 5);

  return frame;
}

export function parseConnectRPCFrame(buffer: Uint8Array): {
  flags: number;
  length: number;
  payload: Uint8Array;
  consumed: number;
} | null {
  if (buffer.length < 5) return null;
  const flags = buffer[0];
  const length = (buffer[1] << 24) | (buffer[2] << 16) | (buffer[3] << 8) | buffer[4];
  if (buffer.length < 5 + length) return null;

  let payload = buffer.subarray(5, 5 + length);
  if (flags === 0x01) {
    try {
      payload = new Uint8Array(zlib.gunzipSync(Buffer.from(payload)));
    } catch {}
  }

  return { flags, length, payload, consumed: 5 + length };
}

export function decodeAgentFrames(buffer: Buffer<any>, onFrame: (payload: Buffer<any>) => void): Buffer<any> {
  let pending: Buffer<any> = Buffer.from(buffer || []);
  while (pending.length >= 5) {
    const flags = pending[0];
    const length = pending.readUInt32BE(1);
    if (pending.length < 5 + length) break;
    let payload = pending.subarray(5, 5 + length);
    pending = pending.subarray(5 + length);
    if (flags & COMPRESS_FLAG.GZIP) {
      try {
        payload = zlib.gunzipSync(payload);
      } catch {}
    }
    if (!(flags & COMPRESS_FLAG.TRAILER)) onFrame(payload);
  }
  return pending;
}

export const agentString = (field: number, value: string): Uint8Array =>
  encodeField(field, WIRE_TYPE.LEN, value);
export const agentMessage = (field: number, value: Uint8Array): Uint8Array =>
  encodeField(field, WIRE_TYPE.LEN, value);
export const agentBool = (field: number, value: boolean): Uint8Array =>
  encodeField(field, WIRE_TYPE.VARINT, value ? 1 : 0);

export function extractAgentString(message: DecodedFields | undefined, field: number): string {
  const value = message?.get(field)?.[0]?.value;
  return value ? Buffer.from(value).toString("utf8") : "";
}

// google.protobuf.Value encoding and decoding
const PB_VALUE = { NULL: 1, NUMBER: 2, STRING: 3, BOOL: 4, STRUCT: 5, LIST: 6 } as const;
const PB_STRUCT_FIELDS = 1;
const PB_MAP_KEY = 1;
const PB_MAP_VALUE = 2;
const PB_LIST_VALUES = 1;

export function encodeAgentValue(value: unknown): Uint8Array {
  if (value === null || value === undefined) {
    return encodeField(PB_VALUE.NULL, WIRE_TYPE.VARINT, 0);
  }
  if (typeof value === "boolean") {
    return encodeField(PB_VALUE.BOOL, WIRE_TYPE.VARINT, value ? 1 : 0);
  }
  if (typeof value === "number") {
    return encodeField(PB_VALUE.NUMBER, WIRE_TYPE.FIXED64, value);
  }
  if (typeof value === "string") {
    return encodeField(PB_VALUE.STRING, WIRE_TYPE.LEN, value);
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => encodeField(PB_LIST_VALUES, WIRE_TYPE.LEN, encodeAgentValue(item)));
    return encodeField(PB_VALUE.LIST, WIRE_TYPE.LEN, concatBuffers(...items));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, val]) =>
      encodeField(
        PB_STRUCT_FIELDS,
        WIRE_TYPE.LEN,
        concatBuffers(
          encodeField(PB_MAP_KEY, WIRE_TYPE.LEN, key),
          encodeField(PB_MAP_VALUE, WIRE_TYPE.LEN, encodeAgentValue(val))
        )
      )
    );
    return encodeField(PB_VALUE.STRUCT, WIRE_TYPE.LEN, concatBuffers(...entries));
  }
  return encodeField(PB_VALUE.STRING, WIRE_TYPE.LEN, String(value));
}

export function decodeAgentValue(bytes: Uint8Array): unknown {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const fields = decodeMessage(buf);
  if (fields.has(PB_VALUE.NULL)) return null;
  if (fields.has(PB_VALUE.BOOL)) return fields.get(PB_VALUE.BOOL)![0].value !== 0;
  if (fields.has(PB_VALUE.NUMBER)) {
    const raw = Buffer.from(fields.get(PB_VALUE.NUMBER)![0].value);
    return raw.readDoubleLE(0);
  }
  if (fields.has(PB_VALUE.STRING)) {
    return Buffer.from(fields.get(PB_VALUE.STRING)![0].value).toString("utf8");
  }
  if (fields.has(PB_VALUE.STRUCT)) {
    const result: Record<string, unknown> = {};
    for (const entry of decodeMessage(Buffer.from(fields.get(PB_VALUE.STRUCT)![0].value)).get(PB_STRUCT_FIELDS) || []) {
      const pair = decodeMessage(Buffer.from(entry.value));
      const keyBuf = pair.get(PB_MAP_KEY)?.[0]?.value;
      const key = keyBuf ? Buffer.from(keyBuf).toString("utf8") : "";
      if (key) {
        result[key] = decodeAgentValue(pair.get(PB_MAP_VALUE)?.[0]?.value);
      }
    }
    return result;
  }
  if (fields.has(PB_VALUE.LIST)) {
    return (decodeMessage(Buffer.from(fields.get(PB_VALUE.LIST)![0].value)).get(PB_LIST_VALUES) || []).map((item) =>
      decodeAgentValue(item.value)
    );
  }
  return null;
}
