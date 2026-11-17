process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { convertResponsesApiFormat } from "../src/core/adapters/responsesAdapter.js";
import { translateAnthropicToOpenAi } from "../src/core/adapters/anthropic/requestAnthropicToOpenAi.js";
import { repairPartialToolResponses } from "../src/core/adapters/helpers/toolResponseRepair.js";
import {
  isZeroContentResponse,
  handleFallbackChat,
} from "../src/providers/composite/combo/fallbackStrategy.js";
import {
  applyAntigravityPromptRewrites,
  isBare429PromptRejection,
  moveSystemInstructionToFirstUserTurn,
} from "../src/providers/runtime/antigravity/schema.js";
import {
  getKiroCreateResponseMode,
  isKiroUserRateExceeded,
  buildKiroCreateResponseUrl,
  buildKiroCreateResponsePayload,
  responsesApiToOpenAiResponse,
  executeKiroCreateResponse,
} from "../src/providers/runtime/kiro/createResponse.js";

// 1. PR #5706: Responses tool-output images
test("PR #5706 - convertResponsesApiFormat splits input_image from function_call_output into user message after contiguous tool messages", () => {
  const payload = {
    model: "gpt-5",
    input: [
      { type: "message", role: "user", content: [{ type: "input_text", text: "Take a screenshot" }] },
      { type: "function_call", call_id: "call_1", name: "screenshot", arguments: "{}" },
      { type: "function_call", call_id: "call_2", name: "get_title", arguments: "{}" },
      {
        type: "function_call_output",
        call_id: "call_1",
        output: [
          { type: "input_text", text: "Captured" },
          { type: "input_image", image_url: "data:image/png;base64,AAAA", detail: "high" },
        ],
      },
      {
        type: "function_call_output",
        call_id: "call_2",
        output: "Dashboard",
      },
    ],
  };

  const converted = convertResponsesApiFormat(payload);
  assert.equal(converted.messages.length, 5);
  assert.equal(converted.messages[0].role, "user");
  assert.equal(converted.messages[1].role, "assistant");
  assert.equal(converted.messages[1].tool_calls.length, 2);
  assert.equal(converted.messages[2].role, "tool");
  assert.equal(converted.messages[2].tool_call_id, "call_1");
  assert.equal(converted.messages[2].content, "Captured");
  assert.equal(converted.messages[3].role, "tool");
  assert.equal(converted.messages[3].tool_call_id, "call_2");
  assert.equal(converted.messages[3].content, "Dashboard");
  assert.equal(converted.messages[4].role, "user");
  assert.ok(Array.isArray(converted.messages[4].content));
  assert.equal(converted.messages[4].content[1].type, "image_url");
  assert.equal(converted.messages[4].content[1].image_url.url, "data:image/png;base64,AAAA");
  assert.equal(converted.messages[4].content[1].image_url.detail, "high");
});

test("PR #5706 - image-only function_call_output uses placeholder text in tool message", () => {
  const payload = {
    model: "gpt-5",
    input: [
      { type: "function_call", call_id: "call_img", name: "snap", arguments: "{}" },
      {
        type: "function_call_output",
        call_id: "call_img",
        output: [{ type: "input_image", image_url: "data:image/png;base64,BBBB" }],
      },
    ],
  };

  const converted = convertResponsesApiFormat(payload);
  assert.equal(converted.messages[1].role, "tool");
  assert.equal(converted.messages[1].content, "[Image returned]");
  assert.equal(converted.messages[2].role, "user");
  assert.equal(converted.messages[2].content[1].image_url.url, "data:image/png;base64,BBBB");
});

// 2. PR #5636: Translator tool_choice & partial parallel tool batch
test("PR #5636 - translateAnthropicToOpenAi maps tool_choice variants", () => {
  const base = {
    model: "claude-sonnet-4-5",
    messages: [{ role: "user", content: "hi" }],
    tools: [{ name: "read_file", description: "Read", input_schema: { type: "object", properties: {} } }],
  };

  assert.equal(translateAnthropicToOpenAi({ ...base, tool_choice: { type: "none" } }).tool_choice, "none");
  assert.equal(translateAnthropicToOpenAi({ ...base, tool_choice: { type: "auto" } }).tool_choice, "auto");
  assert.equal(translateAnthropicToOpenAi({ ...base, tool_choice: { type: "any" } }).tool_choice, "required");
  assert.deepEqual(
    translateAnthropicToOpenAi({ ...base, tool_choice: { type: "tool", name: "read_file" } }).tool_choice,
    { type: "function", function: { name: "read_file" } }
  );
});

test("PR #5636 - repairPartialToolResponses inserts placeholder for missing parallel tool response", () => {
  const messages = [
    { role: "user", content: "run both" },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "call_A", type: "function", function: { name: "a", arguments: "{}" } },
        { id: "call_B", type: "function", function: { name: "b", arguments: "{}" } },
      ],
    },
    { role: "tool", tool_call_id: "call_A", content: "ok A" },
    { role: "user", content: "next" },
  ];

  const repaired = repairPartialToolResponses(messages);
  assert.equal(repaired.length, 5);
  assert.equal(repaired[2].tool_call_id, "call_A");
  assert.equal(repaired[3].role, "tool");
  assert.equal(repaired[3].tool_call_id, "call_B");
  assert.equal(repaired[4].role, "user");
});

// 3. PR #5646: Combo 200-with-no-content failover
test("PR #5646 - isZeroContentResponse detects empty 200s across formats and respects reasoning & content_filter", () => {
  assert.equal(isZeroContentResponse({}), true);
  assert.equal(isZeroContentResponse({ text: "" }), true);
  assert.equal(isZeroContentResponse({ choices: [] }), true);
  assert.equal(isZeroContentResponse({ choices: [{ message: { role: "assistant", content: "" } }] }), true);
  assert.equal(isZeroContentResponse({ type: "message", content: [] }), true);
  assert.equal(isZeroContentResponse({ candidates: [{ content: { parts: [] } }] }), true);
  assert.equal(isZeroContentResponse({ object: "response", output: [] }), true);

  // Reasoning counts as content
  assert.equal(
    isZeroContentResponse({ choices: [{ message: { role: "assistant", content: "", reasoning_content: "thinking..." } }] }),
    false
  );
  assert.equal(
    isZeroContentResponse({ type: "message", content: [{ type: "thinking", thinking: "hmm" }] }),
    false
  );

  // content_filter is non-retryable (not zero-content)
  assert.equal(
    isZeroContentResponse({ choices: [{ message: { role: "assistant", content: "" }, finish_reason: "content_filter" }] }),
    false
  );
  assert.equal(
    isZeroContentResponse({ type: "message", content: [], stop_reason: "content_filter" }),
    false
  );
});

test("PR #5646 - handleFallbackChat fails over when first model returns 200 with zero content", async () => {
  const calls: string[] = [];
  const result = await handleFallbackChat({
    body: { messages: [{ role: "user", content: "hi" }] },
    models: ["providerA/model1", "providerB/model2"],
    comboName: "test-zero-content",
    comboStrategy: "fallback",
    handleSingleModel: async (_body, modelStr) => {
      calls.push(modelStr);
      if (modelStr === "providerA/model1") {
        return { ok: true, status: 200, json: { choices: [{ message: { role: "assistant", content: "" } }] } };
      }
      return { ok: true, status: 200, json: { choices: [{ message: { role: "assistant", content: "Hello!" } }] } };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.modelUsed, "providerB/model2");
  assert.deepEqual(calls, ["providerA/model1", "providerB/model2"]);
});

// 4. PR #5703: Antigravity fake-quota 429 & Hermes/OpenClaw prompt rewrites
test("PR #5703 - applyAntigravityPromptRewrites rewrites Hermes and OpenClaw markers", () => {
  const input =
    "You are a personal assistant running inside OpenClaw. Install skills from clawhub. " +
    "Also Hermes Agent by Nous Research at ~/.hermes and hermes-agent.";
  const rewritten = applyAntigravityPromptRewrites(input);
  assert.ok(!/openclaw/i.test(rewritten));
  assert.ok(!/clawhub/i.test(rewritten));
  assert.ok(!/Hermes Agent/i.test(rewritten));
  assert.ok(!/Nous Research/i.test(rewritten));
  assert.ok(!/hermes-agent/i.test(rewritten));
  assert.ok(!/\.hermes\b/i.test(rewritten));
});

test("PR #5703 - isBare429PromptRejection distinguishes bare 429 from real quota 429", () => {
  const bare429 = JSON.stringify({
    error: {
      code: 429,
      message: "Resource has been exhausted (e.g. check quota).",
      status: "RESOURCE_EXHAUSTED",
    },
  });
  const realQuota429 = JSON.stringify({
    error: {
      code: 429,
      message: "Resource has been exhausted (e.g. check quota).",
      status: "RESOURCE_EXHAUSTED",
      details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "30s" }],
    },
  });

  assert.equal(isBare429PromptRejection(429, bare429), true);
  assert.equal(isBare429PromptRejection(429, realQuota429), false);
  assert.equal(isBare429PromptRejection(500, bare429), false);
});

test("PR #5703 - moveSystemInstructionToFirstUserTurn moves system parts to front of first user turn", () => {
  const envelope = {
    request: {
      systemInstruction: { role: "user", parts: [{ text: "System rule" }] },
      contents: [{ role: "user", parts: [{ text: "User question" }] }],
    },
  };
  const retried = moveSystemInstructionToFirstUserTurn(envelope);
  assert.equal(retried.request.systemInstruction, undefined);
  assert.deepEqual(retried.request.contents[0].parts, [
    { text: "System rule" },
    { text: "User question" },
  ]);
});

// 5. PR #5716: Kiro CreateResponse /v1/responses fallback
test("PR #5716 - Kiro CreateResponse helpers, mode env, and format-aware execution", async () => {
  const prevMode = process.env.MAPIGATE_KIRO_CREATE_RESPONSE;
  try {
    delete process.env.MAPIGATE_KIRO_CREATE_RESPONSE;
    assert.equal(getKiroCreateResponseMode(), "auto");
    process.env.MAPIGATE_KIRO_CREATE_RESPONSE = "always";
    assert.equal(getKiroCreateResponseMode(), "always");
    process.env.MAPIGATE_KIRO_CREATE_RESPONSE = "off";
    assert.equal(getKiroCreateResponseMode(), "off");
  } finally {
    if (prevMode === undefined) delete process.env.MAPIGATE_KIRO_CREATE_RESPONSE;
    else process.env.MAPIGATE_KIRO_CREATE_RESPONSE = prevMode;
  }

  assert.equal(isKiroUserRateExceeded(429, '{"reason":"USER_REQUEST_RATE_EXCEEDED"}'), true);
  assert.equal(isKiroUserRateExceeded(429, "other error"), false);
  assert.equal(buildKiroCreateResponseUrl("us-east-1"), "https://runtime.us-east-1.kiro.dev/v1/responses");

  const payload = buildKiroCreateResponsePayload(
    {
      messages: [
        { role: "system", content: "Be concise" },
        { role: "user", content: "Hi" },
      ],
      max_tokens: 100,
    },
    "claude-sonnet-4-5",
    false
  );
  assert.equal(payload.instructions, "Be concise");
  assert.equal(payload.input.length, 1);
  assert.equal(payload.max_output_tokens, 100);

  const openAi = responsesApiToOpenAiResponse(
    {
      id: "resp_1",
      output: [{ type: "message", content: [{ type: "output_text", text: "Hello from Kiro" }] }],
      usage: { input_tokens: 5, output_tokens: 3 },
    },
    "claude-sonnet-4-5"
  );
  assert.equal(openAi.choices[0].message.content, "Hello from Kiro");

  // Test 429 burst retry + anthropic clientFormat translation
  let attempts = 0;
  let sentStatus = 0;
  let sentBody: any = null;
  const mockRes: any = {
    status(code: number) {
      sentStatus = code;
      return this;
    },
    json(body: any) {
      sentBody = body;
      return this;
    },
  };

  const result = await executeKiroCreateResponse({
    context: {
      req: { headers: {}, body: {} } as any,
      res: mockRes,
      targetModel: "claude-sonnet-4-5",
      clientFormat: "anthropic",
      targetFormat: "kiro",
      body: { messages: [{ role: "user", content: "Hi" }], stream: false },
      requestId: "req_test_1",
      startTime: Date.now(),
      clientTool: "claude",
      rawModel: "claude-sonnet-4-5",
      rtkStats: { compressedTokens: 0, tokensSaved: 0 },
    },
    upstreamModel: "claude-sonnet-4-5",
    region: "us-east-1",
    headers: { Authorization: "Bearer test" },
    effectiveProxy: "",
    isStreaming: false,
    retryDelayMs: 0,
    fetchFn: async () => {
      attempts++;
      if (attempts === 1) {
        return new Response("rate limited", { status: 429 });
      }
      return new Response(
        JSON.stringify({
          id: "resp_ok",
          output: [{ type: "message", content: [{ type: "output_text", text: "Recovered" }] }],
          usage: { input_tokens: 10, output_tokens: 4 },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    },
  });

  assert.equal(attempts, 2);
  assert.equal(result.ok, true);
  assert.equal(sentStatus, 200);
  assert.equal(sentBody.type, "message");
  assert.equal(sentBody.content[0].text, "Recovered");
});
