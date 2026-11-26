process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { CodexProvider } from "../src/providers/runtime/codex/provider.js";
import { handleFallbackChat } from "../src/providers/composite/combo/fallbackStrategy.js";
import { convertResponsesApiFormat } from "../src/core/adapters/responsesAdapter.js";
import type { ProviderRequestContext } from "../src/providers/core/types.js";

function makeContext(overrides: Partial<ProviderRequestContext> = {}): ProviderRequestContext {
  return {
    requestId: "req_codex_test",
    startTime: Date.now(),
    clientFormat: "responses",
    targetFormat: "openai-responses",
    targetModel: "gpt-6.1-sol",
    rawModel: "gpt-6.1-sol",
    body: {},
    req: { headers: {}, path: "/v1/responses", method: "POST" } as any,
    account: {
      id: "acc_codex_1",
      name: "loveme05ye@gmail.com",
      rawApiKey: JSON.stringify({
        accessToken: "codex_access_tok",
        refreshToken: "codex_refresh_tok",
        expiresAt: Date.now() + 3600_000,
      }),
      providerSpecificData: { chatgptAccountId: "acct_org_123" },
    } as any,
    provider: {
      id: "codex",
      name: "OpenAI Codex",
      baseUrl: "https://chatgpt.com/backend-api/codex/responses",
      format: "openai-responses",
    } as any,
    clientTool: "kiro",
    rtkStats: { compressedTokens: 0, tokensSaved: 0 },
    ...overrides,
  };
}

function makeMockResponse() {
  const chunks: string[] = [];
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let jsonPayload: any = null;
  const res: any = {
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    setHeader(k: string, v: string) {
      headers[k.toLowerCase()] = v;
      return res;
    },
    flushHeaders() {
      res.headersSent = true;
    },
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(payload: any) {
      res.headersSent = true;
      res.writableEnded = true;
      jsonPayload = payload;
      return res;
    },
    write(chunk: string) {
      res.headersSent = true;
      chunks.push(String(chunk));
      return true;
    },
    end() {
      res.writableEnded = true;
      return res;
    },
    once() {
      return res;
    },
    removeListener() {
      return res;
    },
    _getChunks: () => chunks,
    _getHeaders: () => headers,
    _getStatus: () => statusCode,
    _getJson: () => jsonPayload,
  };
  return res;
}

function sseStream(events: Array<{ event?: string; data: any }>): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const payload = events
    .map((ev) => {
      const dataStr = typeof ev.data === "string" ? ev.data : JSON.stringify(ev.data);
      return ev.event ? `event: ${ev.event}\ndata: ${dataStr}\n\n` : `data: ${dataStr}\n\n`;
    })
    .join("");
  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(payload));
      controller.close();
    },
  });
}

test("CodexProvider converts Kiro /v1/responses body (post convertResponsesApiFormat) into strict Codex Responses payload with store=false", () => {
  const kiroRawBody = {
    model: "gpt-6.1-sol",
    instructions: "You are Kiro, an AI coding assistant.",
    store: false,
    stream: true,
    temperature: 0.2,
    max_output_tokens: 8192,
    previous_response_id: "resp_prev_123",
    reasoning: { effort: "high", summary: "auto" },
    metadata: { "kiro:conversation_id": "conv-kiro-abc" },
    tools: [
      {
        type: "function",
        name: "read_file",
        description: "Read a file",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              pattern: "^[^\\p{Cc}]+$",
            },
          },
          required: ["path"],
        },
      },
    ],
    tool_choice: { type: "function", name: "read_file" },
    input: [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Check package.json" }],
      },
      {
        type: "function_call",
        id: "fc_123",
        call_id: "call_1",
        name: "read_file",
        arguments: '{"path":"package.json"}',
      },
      {
        type: "function_call_output",
        call_id: "call_1",
        output: '{"name":"mapigate"}',
      },
    ],
  };

  // Simulate src/server/index.ts POST /v1/responses pre-conversion
  const normalizedForPipeline = convertResponsesApiFormat(kiroRawBody);
  assert.equal(normalizedForPipeline.store, undefined);
  assert.equal(normalizedForPipeline.reasoning_effort, "high");

  const provider = new CodexProvider();
  const payload = provider.transformRequestBody(
    makeContext({
      body: normalizedForPipeline,
      req: { headers: { "x-session-id": "conv-kiro-abc" }, path: "/v1/responses", method: "POST" } as any,
    })
  );

  assert.equal(payload.model, "gpt-6.1-sol");
  assert.equal(payload.store, false);
  assert.equal(payload.stream, true);
  assert.equal(payload.instructions, "You are Kiro, an AI coding assistant.");
  assert.equal(payload.prompt_cache_key, "conv-kiro-abc");
  assert.deepEqual(payload.reasoning, { effort: "high", summary: "auto" });
  assert.deepEqual(payload.tool_choice, { type: "function", name: "read_file" });

  // Unsupported fields must be stripped
  assert.equal("messages" in payload, false);
  assert.equal("max_tokens" in payload, false);
  assert.equal("max_output_tokens" in payload, false);
  assert.equal("temperature" in payload, false);
  assert.equal("top_p" in payload, false);
  assert.equal("previous_response_id" in payload, false);

  // Input items converted cleanly
  assert.equal(payload.input.length, 3);
  assert.deepEqual(payload.input[0], {
    type: "message",
    role: "user",
    content: [{ type: "input_text", text: "Check package.json" }],
  });
  assert.deepEqual(payload.input[1], {
    type: "function_call",
    call_id: "call_1",
    name: "read_file",
    arguments: '{"path":"package.json"}',
  });
  assert.deepEqual(payload.input[2], {
    type: "function_call_output",
    call_id: "call_1",
    output: '{"name":"mapigate"}',
  });

  // Tool schema unicode property escape stripped
  assert.equal(payload.tools.length, 1);
  assert.equal(payload.tools[0].type, "function");
  assert.equal(payload.tools[0].name, "read_file");
  assert.equal(payload.tools[0].parameters.properties.path.pattern, undefined);
});

test("CodexProvider converts Anthropic messages and model thinking suffix with fallback instructions", () => {
  const provider = new CodexProvider();
  const payload = provider.transformRequestBody(
    makeContext({
      clientFormat: "anthropic",
      targetModel: "gpt-6.1-sol(medium)",
      body: {
        model: "gpt-6.1-sol(medium)",
        max_tokens: 4096,
        temperature: 0.5,
        messages: [{ role: "user", content: "Hello Codex" }],
      },
    })
  );

  assert.equal(payload.model, "gpt-6.1-sol");
  assert.equal(payload.store, false);
  assert.equal(payload.stream, true);
  assert.ok(typeof payload.instructions === "string" && payload.instructions.length > 0);
  assert.deepEqual(payload.reasoning, { effort: "medium", summary: "auto" });
  assert.equal(payload.input.length, 1);
  assert.equal(payload.input[0].role, "user");
});

test("CodexProvider.execute forwards Responses SSE stream for clientFormat='responses' with store=false", async () => {
  const origFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedBody: any = null;
  let capturedHeaders: Record<string, string> = {};

  globalThis.fetch = (async (url: any, init: any) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(String(init.body));
    capturedHeaders = init.headers as Record<string, string>;
    return new Response(
      sseStream([
        { event: "response.created", data: { type: "response.created", response: { id: "resp_1", status: "in_progress" } } },
        { event: "response.output_text.delta", data: { type: "response.output_text.delta", delta: "OK from Codex" } },
        {
          event: "response.completed",
          data: {
            type: "response.completed",
            response: {
              id: "resp_1",
              object: "response",
              status: "completed",
              output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "OK from Codex" }] }],
              usage: { input_tokens: 12, output_tokens: 4, total_tokens: 16 },
            },
          },
        },
        { data: "[DONE]" },
      ]),
      { status: 200, headers: { "content-type": "text/event-stream" } }
    );
  }) as typeof fetch;

  try {
    const provider = new CodexProvider();
    const res = makeMockResponse();
    const kiroConverted = convertResponsesApiFormat({
      model: "gpt-6.1-sol",
      instructions: "System rules",
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "Hi" }] }],
      stream: true,
    });

    const result = await provider.execute(
      makeContext({
        clientFormat: "responses",
        body: kiroConverted,
        res,
      })
    );

    assert.equal(result.ok, true);
    assert.equal(capturedUrl, "https://chatgpt.com/backend-api/codex/responses");
    assert.equal(capturedBody.store, false);
    assert.equal(capturedBody.stream, true);
    assert.equal(capturedBody.instructions, "System rules");
    assert.equal(capturedHeaders["chatgpt-account-id"], "acct_org_123");

    const written = res._getChunks().join("");
    assert.ok(written.includes("event: response.output_text.delta"));
    assert.ok(written.includes("OK from Codex"));
    assert.ok(written.includes("data: [DONE]"));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("CodexProvider.execute translates Responses SSE stream to OpenAI and Anthropic formats and handles non-streaming/panel", async () => {
  const origFetch = globalThis.fetch;
  const capturedBodies: any[] = [];

  globalThis.fetch = (async (_url: any, init: any) => {
    capturedBodies.push(JSON.parse(String(init.body)));
    return new Response(
      sseStream([
        { event: "response.created", data: { type: "response.created", response: { id: "resp_2" } } },
        { event: "response.output_text.delta", data: { type: "response.output_text.delta", delta: "Hello" } },
        {
          event: "response.output_item.added",
          data: {
            type: "response.output_item.added",
            item: { id: "fc_1", call_id: "call_abc", type: "function_call", name: "run_cmd" },
          },
        },
        {
          event: "response.function_call_arguments.delta",
          data: { type: "response.function_call_arguments.delta", item_id: "fc_1", delta: '{"cmd":"ls"}' },
        },
        {
          event: "response.completed",
          data: {
            type: "response.completed",
            response: {
              id: "resp_2",
              status: "completed",
              usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
            },
          },
        },
      ]),
      { status: 200, headers: { "content-type": "text/event-stream" } }
    );
  }) as typeof fetch;

  try {
    const provider = new CodexProvider();

    // 1. OpenAI streaming
    const openAiRes = makeMockResponse();
    const r1 = await provider.execute(
      makeContext({
        clientFormat: "openai",
        body: { model: "gpt-6.1-sol", messages: [{ role: "user", content: "hi" }], stream: true },
        res: openAiRes,
      })
    );
    assert.equal(r1.ok, true);
    const openAiOutput = openAiRes._getChunks().join("");
    assert.ok(openAiOutput.includes('"chat.completion.chunk"'));
    assert.ok(openAiOutput.includes('"content":"Hello"'));
    assert.ok(openAiOutput.includes('"name":"run_cmd"'));
    assert.ok(openAiOutput.includes("data: [DONE]"));

    // 2. Anthropic streaming
    const anthRes = makeMockResponse();
    const r2 = await provider.execute(
      makeContext({
        clientFormat: "anthropic",
        body: { model: "gpt-6.1-sol", messages: [{ role: "user", content: "hi" }], stream: true },
        res: anthRes,
      })
    );
    assert.equal(r2.ok, true);
    const anthOutput = anthRes._getChunks().join("");
    assert.ok(anthOutput.includes("event: message_start"));
    assert.ok(anthOutput.includes("event: content_block_delta"));
    assert.ok(anthOutput.includes("event: message_stop"));

    // 3. Non-streaming client request still sends stream=true to Codex upstream and returns JSON
    const nonStreamRes = makeMockResponse();
    const r3 = await provider.execute(
      makeContext({
        clientFormat: "openai",
        body: { model: "gpt-6.1-sol", messages: [{ role: "user", content: "hi" }], stream: false },
        res: nonStreamRes,
      })
    );
    assert.equal(r3.ok, true);
    assert.equal(capturedBodies[2].stream, true);
    assert.equal(capturedBodies[2].store, false);
    const jsonOut = nonStreamRes._getJson();
    assert.equal(jsonOut.object, "chat.completion");
    assert.equal(jsonOut.choices[0].message.content, "Hello");
    assert.equal(jsonOut.choices[0].message.tool_calls[0].function.name, "run_cmd");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("CodexProvider.execute returns ok=false without sending headers on initial SSE error event", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response(
      sseStream([
        { event: "error", data: { type: "error", error: { message: "Rate limit exceeded", status: 429 } } },
      ]),
      { status: 200, headers: { "content-type": "text/event-stream" } }
    );
  }) as typeof fetch;

  try {
    const provider = new CodexProvider();
    const res = makeMockResponse();
    const result = await provider.execute(
      makeContext({
        clientFormat: "responses",
        body: { model: "gpt-6.1-sol", messages: [{ role: "user", content: "hi" }], stream: true },
        res,
      })
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 429);
    assert.equal(res.headersSent, false);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("CodexProvider.execute inside combo does not misclassify tool-call-only SSE stream as HTTP 200 zero content", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response(
      sseStream([
        { event: "response.created", data: { type: "response.created", response: { id: "resp_tool_only" } } },
        {
          event: "response.reasoning_summary_text.delta",
          data: { type: "response.reasoning_summary_text.delta", delta: "Inspecting workspace..." },
        },
        {
          event: "response.output_item.added",
          data: {
            type: "response.output_item.added",
            item: { id: "fc_tool_1", call_id: "call_tool_1", type: "function_call", name: "read_file" },
          },
        },
        {
          event: "response.function_call_arguments.delta",
          data: { type: "response.function_call_arguments.delta", item_id: "fc_tool_1", delta: '{"path":"src/index.ts"}' },
        },
        {
          event: "response.completed",
          data: {
            type: "response.completed",
            response: {
              id: "resp_tool_only",
              object: "response",
              status: "completed",
              output: [
                {
                  type: "function_call",
                  id: "fc_tool_1",
                  call_id: "call_tool_1",
                  name: "read_file",
                  arguments: '{"path":"src/index.ts"}',
                },
              ],
              usage: { input_tokens: 120, output_tokens: 24, total_tokens: 144 },
            },
          },
        },
        { data: "[DONE]" },
      ]),
      { status: 200, headers: { "content-type": "text/event-stream" } }
    );
  }) as typeof fetch;

  try {
    const provider = new CodexProvider();
    const res = makeMockResponse();
    const result = await handleFallbackChat({
      body: { model: "gpt-6.2-sol", messages: [{ role: "user", content: "read index" }], stream: true },
      models: ["codex/gpt-6.2-sol(xhigh)"],
      comboName: "gpt-6.2-sol",
      comboStrategy: "fallback",
      handleSingleModel: async (mBody) =>
        provider.execute(
          makeContext({
            clientFormat: "openai",
            targetModel: "gpt-6.2-sol",
            targetEffort: "xhigh",
            body: mBody,
            res,
          })
        ),
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.isStream, true);
    const written = res._getChunks().join("");
    assert.ok(written.includes('"name":"read_file"'));
    assert.ok(written.includes("data: [DONE]"));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("CodexProvider.execute fails cleanly before sending headers when SSE stream has empty output, allowing combo failover", async () => {
  const origFetch = globalThis.fetch;
  let attempt = 0;
  globalThis.fetch = (async () => {
    attempt++;
    if (attempt === 1) {
      return new Response(
        sseStream([
          { event: "response.created", data: { type: "response.created", response: { id: "resp_empty", status: "in_progress" } } },
          {
            event: "response.completed",
            data: {
              type: "response.completed",
              response: { id: "resp_empty", object: "response", status: "completed", output: [] },
            },
          },
          { data: "[DONE]" },
        ]),
        { status: 200, headers: { "content-type": "text/event-stream" } }
      );
    }
    return new Response(
      sseStream([
        { event: "response.created", data: { type: "response.created", response: { id: "resp_ok" } } },
        { event: "response.output_text.delta", data: { type: "response.output_text.delta", delta: "Fallback OK" } },
        {
          event: "response.completed",
          data: {
            type: "response.completed",
            response: {
              id: "resp_ok",
              object: "response",
              status: "completed",
              output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Fallback OK" }] }],
            },
          },
        },
        { data: "[DONE]" },
      ]),
      { status: 200, headers: { "content-type": "text/event-stream" } }
    );
  }) as typeof fetch;

  try {
    const provider = new CodexProvider();
    const res = makeMockResponse();
    const result = await handleFallbackChat({
      body: { model: "gpt-6.2-sol", messages: [{ role: "user", content: "hi" }], stream: true },
      models: ["codex/gpt-6.2-sol(xhigh)", "codex/gpt-6.1-sol(high)"],
      comboName: "gpt-6.2-sol",
      comboStrategy: "fallback",
      handleSingleModel: async (mBody, mStr) =>
        provider.execute(
          makeContext({
            clientFormat: "responses",
            targetModel: mStr.includes("6.2") ? "gpt-6.2-sol" : "gpt-6.1-sol",
            body: mBody,
            res,
          })
        ),
    });

    assert.equal(attempt, 2);
    assert.equal(result.ok, true);
    assert.equal(result.modelUsed, "codex/gpt-6.1-sol(high)");
    const written = res._getChunks().join("");
    assert.ok(written.includes("Fallback OK"));
    assert.ok(!written.includes("resp_empty"));
  } finally {
    globalThis.fetch = origFetch;
  }
});
