import { test } from "node:test";
import assert from "node:assert/strict";
import {
  signAwsSigv4Request,
  AWS_SIGV4,
  escapeUri,
} from "../src/providers/bedrock/auth.js";
import {
  signAwsSigv4Request as facadeSign,
} from "../src/core/auth/awsSigv4.js";
import {
  crc32,
  parseEventFrame,
  decodeEventStreamChunk,
} from "../src/providers/bedrock/eventStream.js";
import {
  crc32 as facadeCrc32,
  decodeEventStreamChunk as facadeDecode,
} from "../src/core/adapters/awsEventStream.js";

test("Bedrock Auth - AWS SigV4 signs request and generates Authorization header", () => {
  const result = signAwsSigv4Request({
    method: "POST",
    url: "https://bedrock-runtime.us-east-1.amazonaws.com/model/anthropic.claude-3-5-sonnet/invoke",
    region: "us-east-1",
    service: "bedrock",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "Hello" }),
    date: new Date("2025-01-01T00:00:00Z"),
  });

  assert.ok(result.Authorization);
  assert.match(result.Authorization, /^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/20250101\/us-east-1\/bedrock\/aws4_request/);
  assert.match(result.Authorization, /SignedHeaders=content-type;host;x-amz-date/);
  assert.match(result.Authorization, /Signature=[0-9a-f]{64}/);
  assert.equal(result["x-amz-date"], "20250101T000000Z");
});

test("Bedrock Auth - facade exports identical signer function", () => {
  assert.equal(signAwsSigv4Request, facadeSign);
  assert.equal(escapeUri("foo bar"), "foo%20bar");
});

test("Bedrock EventStream - CRC32 calculation matches known values", () => {
  const testData = new TextEncoder().encode("123456789");
  assert.equal(crc32(testData), 0xcbf43926);
  assert.equal(facadeCrc32(testData), 0xcbf43926);
});

test("Bedrock EventStream - decodes valid empty and payload frames", () => {
  // Construct a minimal valid EventStream frame
  // Frame layout: [totalLength u32][headersLength u32][preludeCrc u32][headers][payload][messageCrc u32]
  // With 0 headers and payload JSON {"bytes":"dGVzdA=="}
  const payloadStr = JSON.stringify({ bytes: "dGVzdA==" });
  const payloadBytes = new TextEncoder().encode(payloadStr);
  const totalLength = 16 + payloadBytes.length; // 12 prelude + 0 headers + payload + 4 messageCrc
  const buffer = new Uint8Array(totalLength);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, totalLength, false);
  view.setUint32(4, 0, false); // headersLength = 0
  view.setUint32(8, crc32(buffer.subarray(0, 8)), false); // preludeCrc

  buffer.set(payloadBytes, 12);
  view.setUint32(totalLength - 4, crc32(buffer.subarray(0, totalLength - 4)), false); // messageCrc

  const parsed = parseEventFrame(buffer);
  assert.deepEqual(parsed.payload, { bytes: "dGVzdA==" });

  const chunkResult = decodeEventStreamChunk(buffer);
  assert.equal(chunkResult.frames.length, 1);
  assert.deepEqual(chunkResult.frames[0].payload, { bytes: "dGVzdA==" });
  assert.equal(chunkResult.remainder.byteLength, 0);

  const facadeChunkResult = facadeDecode(buffer);
  assert.equal(facadeChunkResult.frames.length, 1);
});
