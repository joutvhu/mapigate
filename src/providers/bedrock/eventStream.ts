/**
 * AWS EventStream binary framing: CRC32 and single-frame decoding.
 * Frame layout: [totalLength u32][headersLength u32][preludeCrc u32][headers][payload][messageCrc u32]
 */

export const AWS_EVENTSTREAM_LIMITS = {
  maxMessageBytes: 24 * 1024 * 1024,
  maxHeadersBytes: 128 * 1024,
};

const decoder = new TextDecoder();

const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) {
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return value >>> 0;
});

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ParsedEventFrame {
  headers: Record<string, any>;
  payload: any | null;
}

/**
 * Decode one complete frame. Throws on integrity failure.
 */
export function parseEventFrame(
  data: Uint8Array,
  limits = AWS_EVENTSTREAM_LIMITS
): ParsedEventFrame {
  const maxMessageBytes = limits.maxMessageBytes;
  const maxHeadersBytes = limits.maxHeadersBytes;

  if (!(data instanceof Uint8Array) || data.byteLength < 16) {
    throw new Error("AWS EventStream frame is shorter than 16 bytes");
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const totalLength = view.getUint32(0, false);
  const headersLength = view.getUint32(4, false);
  if (totalLength !== data.byteLength) {
    throw new Error("AWS EventStream frame length does not match its prelude");
  }
  if (
    totalLength > maxMessageBytes ||
    headersLength > maxHeadersBytes ||
    headersLength > totalLength - 16
  ) {
    throw new Error("AWS EventStream frame bounds are invalid");
  }
  if (view.getUint32(8, false) !== crc32(data.subarray(0, 8))) {
    throw new Error("AWS EventStream prelude CRC mismatch");
  }
  if (
    view.getUint32(totalLength - 4, false) !==
    crc32(data.subarray(0, totalLength - 4))
  ) {
    throw new Error("AWS EventStream message CRC mismatch");
  }

  const headers: Record<string, any> = Object.create(null);
  const names = new Set<string>();
  let offset = 12;
  const headerEnd = offset + headersLength;
  const requireBytes = (count: number) => {
    if (offset + count > headerEnd) {
      throw new Error("AWS EventStream header exceeds its declared bounds");
    }
  };

  while (offset < headerEnd) {
    requireBytes(1);
    const nameLength = data[offset++];
    requireBytes(nameLength + 1);
    const name = decoder.decode(data.subarray(offset, offset + nameLength));
    offset += nameLength;
    if (names.has(name)) {
      throw new Error(`AWS EventStream contains duplicate header: ${name}`);
    }
    names.add(name);
    const type = data[offset++];

    if (type === 0 || type === 1) {
      headers[name] = type === 0;
    } else if (type === 2) {
      requireBytes(1);
      headers[name] = view.getInt8(offset);
      offset += 1;
    } else if (type === 3) {
      requireBytes(2);
      headers[name] = view.getInt16(offset, false);
      offset += 2;
    } else if (type === 4) {
      requireBytes(4);
      headers[name] = view.getInt32(offset, false);
      offset += 4;
    } else if (type === 5 || type === 8) {
      requireBytes(8);
      offset += 8;
    } else if (type === 6 || type === 7) {
      requireBytes(2);
      const valueLength = view.getUint16(offset, false);
      offset += 2;
      requireBytes(valueLength);
      const bytes = data.subarray(offset, offset + valueLength);
      headers[name] = type === 7 ? decoder.decode(bytes) : bytes;
      offset += valueLength;
    } else if (type === 9) {
      requireBytes(16);
      offset += 16;
    } else {
      throw new Error(`AWS EventStream header ${name} has unknown type ${type}`);
    }
  }

  const payloadBytes = data.subarray(headerEnd, totalLength - 4);
  if (payloadBytes.byteLength === 0) return { headers, payload: null };
  const payloadText = decoder.decode(payloadBytes);
  if (!payloadText.trim()) return { headers, payload: null };
  try {
    return { headers, payload: JSON.parse(payloadText) };
  } catch (error: any) {
    throw new Error(
      `AWS EventStream payload is not valid JSON (${error.message})`
    );
  }
}

/**
 * Split binary buffer into frames and decode them.
 * Bedrock chunk payload is: { bytes: "<base64 of SSE chunk or json>" }
 */
export function decodeEventStreamChunk(
  chunk: Uint8Array,
  residualBuffer?: Uint8Array
): { frames: ParsedEventFrame[]; remainder: Uint8Array } {
  let combined: Uint8Array;
  if (residualBuffer && residualBuffer.byteLength > 0) {
    combined = new Uint8Array(residualBuffer.byteLength + chunk.byteLength);
    combined.set(residualBuffer, 0);
    combined.set(chunk, residualBuffer.byteLength);
  } else {
    combined = chunk;
  }

  const frames: ParsedEventFrame[] = [];
  let offset = 0;

  while (offset + 16 <= combined.byteLength) {
    const view = new DataView(combined.buffer, combined.byteOffset + offset, combined.byteLength - offset);
    const totalLength = view.getUint32(0, false);
    if (totalLength < 16 || totalLength > AWS_EVENTSTREAM_LIMITS.maxMessageBytes) {
      // Invalid frame length, cannot proceed
      break;
    }
    if (offset + totalLength > combined.byteLength) {
      // Incomplete frame, wait for more data
      break;
    }

    const frameData = combined.subarray(offset, offset + totalLength);
    try {
      const parsed = parseEventFrame(frameData);
      frames.push(parsed);
    } catch {
      // Failed frame
    }
    offset += totalLength;
  }

  const remainder = combined.subarray(offset);
  return { frames, remainder };
}
