import test from "node:test";
import assert from "node:assert/strict";
import {
  generateHashed64Hex,
  generateSessionId,
  generateCursorChecksum,
  buildCursorHeaders,
} from "../src/providers/runtime/cursor/cursorChecksum.js";
import {
  WIRE_TYPE,
  encodeVarint,
  decodeVarint,
  encodeField,
  decodeField,
  decodeMessage,
  wrapConnectRPCFrame,
  parseConnectRPCFrame,
  encodeAgentValue,
  decodeAgentValue,
  agentString,
  agentMessage,
  concatBuffers,
} from "../src/providers/runtime/cursor/cursorWire.js";
import {
  encodeMcpToolDefinition,
  encodeMcpTools,
  decodeMcpArgs,
  isAgentCapableRequest,
  buildAgentRunFrame,
  tailOnlyCursorMessages,
  createRequestContextResponse,
  rejectExecRequest,
  encodeKvClientMessage,
} from "../src/providers/runtime/cursor/cursorProtobuf.js";
import {
  parseCursorUsableModels,
  parseCursorAvailableModels,
  mergeCursorModelFlags,
  resolveAutoModelSelection,
} from "../src/providers/runtime/cursor/cursorModels.js";
import { CursorProvider } from "../src/providers/runtime/cursor/provider.js";

test("Cursor Checksum - Hashing and Session ID generation", () => {
  const hash = generateHashed64Hex("test-token");
  assert.equal(typeof hash, "string");
  assert.equal(hash.length, 64);

  const sessionId = generateSessionId("test-token");
  assert.equal(typeof sessionId, "string");
  // RFC 4122 UUID v5: xxxxxxxx-xxxx-5xxx-[89ab]xxx-xxxxxxxxxxxx
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assert.ok(uuidRegex.test(sessionId), `Session ID ${sessionId} should match UUID v5 pattern`);
});

test("Cursor Checksum - Jyh Cipher Checksum and Headers", () => {
  const machineId = "machine_test_12345";
  const checksum = generateCursorChecksum(machineId);
  assert.equal(typeof checksum, "string");
  assert.ok(checksum.endsWith(machineId), "Checksum should end with machineId");

  const headers = buildCursorHeaders("token_abc::clean_token_123", machineId, true);
  assert.equal(headers.authorization, "Bearer clean_token_123");
  assert.equal(headers["connect-protocol-version"], "1");
  assert.equal(headers["content-type"], "application/connect+proto");
  assert.equal(headers["x-ghost-mode"], "true");
  assert.ok(headers["x-cursor-checksum"].endsWith(machineId));
  assert.ok(headers["x-session-id"]);
});

test("Cursor Wire - Varint, Field, and Framing Codec", () => {
  const [val1] = decodeVarint(encodeVarint(300), 0);
  assert.equal(val1, 300);

  const [val2] = decodeVarint(encodeVarint(0), 0);
  assert.equal(val2, 0);

  const strField = encodeField(1, WIRE_TYPE.LEN, "hello cursor");
  const [fieldNum, wireType, decodedVal] = decodeField(strField, 0);
  assert.equal(fieldNum, 1);
  assert.equal(wireType, WIRE_TYPE.LEN);
  assert.equal(Buffer.from(decodedVal as Uint8Array).toString("utf8"), "hello cursor");

  const numField = encodeField(2, WIRE_TYPE.VARINT, 42);
  const msg = decodeMessage(concatBuffers(strField, numField));
  assert.equal(msg.get(1)?.length, 1);
  assert.equal(msg.get(2)?.length, 1);
  assert.equal(msg.get(2)![0].value, 42);

  const rawPayload = new TextEncoder().encode("rpc-payload-bytes");
  const framed = wrapConnectRPCFrame(rawPayload, false);
  assert.equal(framed.length, 5 + rawPayload.length);
  assert.equal(framed[0], 0); // No compression

  const parsed = parseConnectRPCFrame(framed);
  assert.ok(parsed);
  assert.equal(parsed.flags, 0);
  assert.equal(parsed.length, rawPayload.length);
  assert.equal(new TextDecoder().decode(parsed.payload), "rpc-payload-bytes");
});

test("Cursor Wire - google.protobuf.Value encoding and decoding", () => {
  assert.equal(decodeAgentValue(encodeAgentValue(null)), null);
  assert.equal(decodeAgentValue(encodeAgentValue(true)), true);
  assert.equal(decodeAgentValue(encodeAgentValue(false)), false);
  assert.equal(decodeAgentValue(encodeAgentValue(123.45)), 123.45);
  assert.equal(decodeAgentValue(encodeAgentValue("sample-string")), "sample-string");

  const list = [1, "two", true];
  assert.deepEqual(decodeAgentValue(encodeAgentValue(list)), list);

  const obj = { str: "value", num: 99 };
  assert.deepEqual(decodeAgentValue(encodeAgentValue(obj)), obj);
});

test("Cursor Protobuf - MCP Tools and Agent Run Frame", () => {
  const tool = {
    name: "calculator",
    description: "Performs calculation",
    parameters: { type: "object", properties: { expression: { type: "string" } } },
  };

  const mcpBytes = encodeMcpTools([tool]);
  assert.ok(mcpBytes.length > 0);

  const messages = [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello Cursor" },
  ];

  assert.equal(isAgentCapableRequest({ messages }), true);

  const runFrame = buildAgentRunFrame(messages, "claude-3.5-sonnet", [tool], "medium");
  assert.ok(runFrame.length > 5);
  // First 5 bytes are ConnectRPC frame header
  const parsed = parseConnectRPCFrame(runFrame);
  assert.ok(parsed);
  assert.ok(parsed.length > 0);
});

test("Cursor Protobuf - Context ACK, Reject and KV messages", () => {
  const execMsg = decodeMessage(
    concatBuffers(
      encodeField(1, WIRE_TYPE.VARINT, 101),
      encodeField(15, WIRE_TYPE.LEN, "exec_101"),
      encodeField(10, WIRE_TYPE.LEN, new Uint8Array(0))
    )
  );
  const ack = createRequestContextResponse(execMsg);
  assert.ok(ack.length > 5);

  const probeMsg = decodeMessage(
    concatBuffers(
      encodeField(1, WIRE_TYPE.VARINT, 102),
      encodeField(15, WIRE_TYPE.LEN, "exec_102"),
      encodeField(3, WIRE_TYPE.LEN, new Uint8Array(0))
    )
  );
  const rejection = rejectExecRequest(probeMsg);
  assert.ok(rejection);
  assert.ok(rejection.length > 5);

  const kvAck = encodeKvClientMessage(55, 2, new Uint8Array(0));
  assert.ok(kvAck.length > 5);
});

test("Cursor Protobuf - Long Session Tail Trimming", () => {
  const msgs = Array.from({ length: 90 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `Message ${i}`,
  }));
  const trimmed = tailOnlyCursorMessages(msgs);
  assert.ok(trimmed.length < msgs.length);
  assert.ok(trimmed.some((m) => m.role === "system" && m.content.includes("[mapigate]")));
});

test("Cursor Models - Usable and Available Models Decoding", () => {
  // Mock GetUsableModelsResponse: field 1 has ModelDetails
  const detail = concatBuffers(
    agentString(1, "claude-3.5-sonnet"),
    agentString(4, "Claude 3.5 Sonnet")
  );
  const usablePayload = concatBuffers(agentMessage(1, detail));
  const usable = parseCursorUsableModels(usablePayload);
  assert.equal(usable.length, 1);
  assert.equal(usable[0].id, "claude-3.5-sonnet");
  assert.equal(usable[0].name, "Claude 3.5 Sonnet");

  // Mock AvailableModels: field 2 has model flags
  const availEntry = concatBuffers(
    agentString(1, "claude-3.5-sonnet"),
    encodeField(2, WIRE_TYPE.VARINT, 1), // defaultOn
    encodeField(5, WIRE_TYPE.VARINT, 1)  // supportsAgent
  );
  const availPayload = concatBuffers(agentMessage(2, availEntry));
  const available = parseCursorAvailableModels(availPayload);
  assert.equal(available.length, 1);
  assert.equal(available[0].id, "claude-3.5-sonnet");
  assert.equal(available[0].defaultOn, true);
  assert.equal(available[0].supportsAgent, true);

  const merged = mergeCursorModelFlags(usable, availPayload);
  assert.equal(merged[0].defaultOn, true);
  assert.equal(merged[0].supportsAgent, true);

  const auto = resolveAutoModelSelection(merged);
  assert.ok(auto);
  assert.equal(auto.modelId, "claude-3.5-sonnet");
});

test("Cursor Provider - Class instantiation and probeModels validation", async () => {
  const provider = new CursorProvider();
  assert.equal(provider.id, "cursor");
  assert.equal(provider.name, "Cursor IDE");

  const resultNoToken = await provider.probeModels({});
  assert.ok(resultNoToken);
  assert.equal(resultNoToken.success, false);
  assert.ok(resultNoToken.error?.includes("token is required"));
});
