import test from "node:test";
import assert from "node:assert/strict";
import { buildOpenCodeGoResponsesPayload } from "../src/providers/catalog/opencode-go/responsesPayload.js";
import {
  stripForeignEncryptedReasoning,
  stripStoredItemReferences,
} from "../src/providers/runtime/codex/schemaSanitizer.js";
import { GitHubProvider } from "../src/providers/runtime/github/provider.js";
import { MistralProvider } from "../src/providers/catalog/mistral/provider.js";
import { BaiduProvider } from "../src/providers/catalog/baidu/provider.js";
import { AlibabaProvider } from "../src/providers/runtime/alicode/provider.js";
import {
  parseServerUpdates,
  runSessionLoop,
  type CursorStreamEvent,
} from "../src/providers/runtime/cursor/cursorStreamer.js";
import { agentMessage } from "../src/providers/runtime/cursor/cursorProtobuf.js";

function makeAgentFrame(payload: Uint8Array): Buffer {
  const header = Buffer.alloc(5);
  header[0] = 0;
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, Buffer.from(payload)]);
}
import { KimiProvider } from "../src/providers/runtime/kimi/provider.js";
import { translateOpenAiToAnthropic } from "../src/core/adapters/anthropic/requestOpenAiToAnthropic.js";
import type { ProviderRequestContext } from "../src/providers/core/types.js";

function makeContext(overrides: Partial<ProviderRequestContext>): ProviderRequestContext {
  return {
    requestId: "req_test",
    startTime: Date.now(),
    clientFormat: "openai",
    targetFormat: "openai",
    targetModel: "test-model",
    rawModel: "test-model",
    body: {},
    account: { id: "acc_1", name: "Test", rawApiKey: "sk-test" } as any,
    provider: { id: "test", name: "Test" } as any,
    ...overrides,
  };
}

test("PR #5647 + #5719 + #4547: opencode-go drops temperature for gpt-*, hardens tool_choice, maps response_format", () => {
  const longName = "a".repeat(150);
  const gptPayload = buildOpenCodeGoResponsesPayload(
    {
      model: "gpt-6-luna",
      temperature: 0.7,
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", function: { name: longName, parameters: { type: "object" } } }],
      tool_choice: { type: "function", function: { name: longName } },
      response_format: {
        type: "json_schema",
        json_schema: { name: "my_schema", strict: true, schema: { type: "object" } },
      },
    },
    "gpt-6-luna",
    "openai"
  );

  assert.equal("temperature" in gptPayload, false);
  assert.deepEqual(gptPayload.tool_choice, { type: "function", name: "a".repeat(128) });
  assert.deepEqual(gptPayload.text, {
    format: { type: "json_schema", name: "my_schema", schema: { type: "object" }, strict: true },
  });

  const shorthandPayload = buildOpenCodeGoResponsesPayload(
    {
      model: "muse-spark-1.3-contributor",
      temperature: 0.4,
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", function: { name: "read_file", parameters: { type: "object" } } }],
      tool_choice: { type: "required" },
      response_format: { type: "json_object" },
    },
    "muse-spark-1.3-contributor",
    "openai"
  );

  assert.equal(shorthandPayload.temperature, 0.4);
  assert.equal(shorthandPayload.tool_choice, "required");
  assert.deepEqual(shorthandPayload.text, { format: { type: "json_object" } });

  const danglingPayload = buildOpenCodeGoResponsesPayload(
    {
      model: "gpt-5.6-luna",
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", function: { name: "read_file", parameters: { type: "object" } } }],
      tool_choice: { type: "function", name: "non_existent_tool" },
    },
    "gpt-5.6-luna",
    "openai"
  );

  assert.equal("tool_choice" in danglingPayload, false);
});

test("PR #5141: codex drops foreign encrypted reasoning items before stripStoredItemReferences", () => {
  const body = {
    input: [
      {
        type: "reasoning",
        id: "rs_12345678-1234-1234-1234-123456789abc",
        encrypted_content: "grok_sealed_blob",
      },
      {
        type: "reasoning",
        id: "rs_abc123",
        encrypted_content: "not_fernet_prefix",
      },
      {
        type: "reasoning",
        id: "rs_valid123",
        encrypted_content: "gAAAAABvalidOpenAiFernetToken",
      },
      {
        type: "message",
        role: "user",
        content: "hello",
      },
    ],
  };

  stripForeignEncryptedReasoning(body);
  assert.equal(body.input.length, 2);
  assert.equal(body.input[0].encrypted_content, "gAAAAABvalidOpenAiFernetToken");

  stripStoredItemReferences(body);
  assert.equal(body.input.length, 2);
  assert.equal("id" in body.input[0], false);
});

test("PR #4706: github Copilot strips temperature for gpt-5.4+ and gpt-6* models", () => {
  const provider = new GitHubProvider();

  const stripped54 = provider.transformRequestBody(
    makeContext({
      targetModel: "gpt-5.4",
      body: { model: "gpt-5.4", temperature: 0.5, messages: [{ role: "user", content: "hi" }] },
    })
  );
  assert.equal("temperature" in stripped54, false);

  const stripped6 = provider.transformRequestBody(
    makeContext({
      targetModel: "openai/gpt-6-mini",
      body: { model: "openai/gpt-6-mini", temperature: 0.2, messages: [{ role: "user", content: "hi" }] },
    })
  );
  assert.equal("temperature" in stripped6, false);

  const kept53 = provider.transformRequestBody(
    makeContext({
      targetModel: "gpt-5.3",
      body: { model: "gpt-5.3", temperature: 0.5, messages: [{ role: "user", content: "hi" }] },
    })
  );
  assert.equal(kept53.temperature, 0.5);
});

test("PR #4143: mistral/baidu/alicode strip top-level thinking and mistral normalizes chunked content", () => {
  const mistral = new MistralProvider();
  const baidu = new BaiduProvider();
  const alicode = new AlibabaProvider();

  for (const prov of [mistral, baidu, alicode]) {
    const out = prov.transformRequestBody(
      makeContext({
        targetModel: "test-model",
        body: {
          model: "test-model",
          thinking: { type: "enabled", budget_tokens: 2048 },
          messages: [{ role: "user", content: "hi" }],
        },
      })
    );
    assert.equal("thinking" in out, false);
  }

  const chunk = {
    id: "cmpl_1",
    choices: [
      {
        index: 0,
        delta: {
          content: [
            { type: "thinking", thinking: [{ type: "text", text: "step 1 " }] },
            { type: "text", text: "final answer" },
          ],
        },
      },
    ],
  };

  const normalized = mistral.transformResponseChunk(chunk, makeContext({}));
  assert.equal(normalized.choices[0].delta.reasoning_content, "step 1 ");
  assert.equal(normalized.choices[0].delta.content, "final answer");
});

test("PR #5069: cursor emits thinking_delta for non-composer models and errors on empty turn", async () => {
  const innerUpdate = agentMessage(4, agentMessage(1, "pondering..."));
  const thinkingUpdate = agentMessage(1, innerUpdate);
  const events: CursorStreamEvent[] = [];
  const emitted = { text: false, thinking: false, toolCall: false, visible: 0 };

  parseServerUpdates(
    new Map([[1, [{ value: innerUpdate }]]]) as any,
    { write() {} } as any,
    false,
    { val: "" },
    emitted,
    (ev) => events.push(ev),
    () => {}
  );

  assert.deepEqual(events, [{ type: "thinking", value: "pondering..." }]);
  assert.equal(emitted.thinking, true);

  // Empty turn test
  const emptyEvents: CursorStreamEvent[] = [];
  const emptySession = {
    read: async () => ({ done: true, value: undefined }),
    write: () => {},
    end: () => {},
    close: () => {},
    responseHeaders: Promise.resolve({ ":status": "200" }),
  } as any;

  const res = await runSessionLoop(emptySession, false, (ev) => emptyEvents.push(ev));
  assert.equal(res.sawContent, false);
  assert.deepEqual(emptyEvents, [{ type: "error", value: "Cursor AgentService returned an empty turn" }]);

  // Non-empty thinking turn via frame
  const frame = makeAgentFrame(thinkingUpdate);
  let readCount = 0;
  const thinkingEvents: CursorStreamEvent[] = [];
  const thinkingSession = {
    read: async () => {
      if (readCount++ === 0) return { done: false, value: frame };
      return { done: true, value: undefined };
    },
    write: () => {},
    end: () => {},
    close: () => {},
    responseHeaders: Promise.resolve({ ":status": "200" }),
  } as any;

  const thinkingRes = await runSessionLoop(thinkingSession, false, (ev) => thinkingEvents.push(ev));
  assert.equal(thinkingRes.sawContent, true);
  assert.equal(thinkingEvents.some((e) => e.type === "thinking" && e.value === "pondering..."), true);
  assert.equal(thinkingEvents.some((e) => e.type === "done"), true);
});

test("PR #4612: kimi hoists tool_addition into tools[], removes beta blocks, drops empty turns, and clones body", () => {
  const kimi = new KimiProvider();
  const originalBody = {
    model: "kimi-k2.5",
    tools: [{ name: "existing_tool", input_schema: { type: "object" }, defer_loading: true }],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "tool_addition",
            name: "mcp_search",
            description: "Search MCP",
            input_schema: { type: "object", properties: { q: { type: "string" } } },
          },
          {
            type: "tool_addition",
            name: "existing_tool",
            input_schema: { type: "object" },
          },
        ],
      },
      {
        role: "assistant",
        content: [{ type: "tool_reference", tool_name: "mcp_search" }],
      },
      {
        role: "user",
        content: [{ type: "text", text: "Run search" }],
      },
    ],
  };

  const transformed = kimi.transformRequestBody(
    makeContext({
      clientFormat: "anthropic",
      targetFormat: "claude",
      targetModel: "kimi-k2.5",
      body: originalBody,
    })
  );

  // Original body must remain untouched for combo fallback
  assert.equal(originalBody.messages.length, 3);
  assert.equal(originalBody.tools.length, 1);
  assert.equal(originalBody.tools[0].defer_loading, true);

  // Transformed body has hoisted deduplicated tools and dropped emptied turns
  assert.equal(transformed.tools.length, 2);
  assert.equal(transformed.tools[0].name, "existing_tool");
  assert.equal("defer_loading" in transformed.tools[0], false);
  assert.equal(transformed.tools[1].name, "mcp_search");
  assert.equal(transformed.messages.length, 1);
  assert.equal(transformed.messages[0].content[0].text, "Run search");
});

test("PR #4464: translateOpenAiToAnthropic always emits is_error boolean on tool_result", () => {
  const result = translateOpenAiToAnthropic({
    model: "claude-sonnet-4-5",
    messages: [
      { role: "user", content: "run tool" },
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "call_1", type: "function", function: { name: "bash", arguments: "{}" } }],
      },
      { role: "tool", tool_call_id: "call_1", content: "ok" },
      { role: "tool", tool_call_id: "call_2", content: "failed", is_error: true },
    ],
  });

  const toolMsg = result.messages.find((m: any) => m.role === "user" && Array.isArray(m.content));
  assert.ok(toolMsg);
  assert.equal(toolMsg.content[0].is_error, false);
  assert.equal(toolMsg.content[1].is_error, true);
});
