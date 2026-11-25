process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRegistry } from "../src/providers/core/registry.js";
import { OpenCodeProvider } from "../src/providers/runtime/opencode/provider.js";
import { isResponsesModel } from "../src/providers/runtime/opencode/types.js";
import { GrokSubscriptionProvider } from "../src/providers/runtime/grok-cli/provider.js";
import { PerplexityProvider } from "../src/providers/catalog/perplexity/provider.js";
import { OllamaProvider } from "../src/providers/runtime/ollama/provider.js";
import { CommandcodeProvider } from "../src/providers/catalog/commandcode/provider.js";
import {
  createOpenAiClientStreamWriter,
  formatOpenAiResponseForClient,
} from "../src/providers/core/base/customExecutionHelper.js";
import type { ProviderRequestContext } from "../src/providers/core/types.js";

function makeContext(overrides: Partial<ProviderRequestContext> = {}): ProviderRequestContext {
  return {
    requestId: "req_proto_test",
    startTime: Date.now(),
    clientFormat: "responses",
    targetFormat: "openai-responses",
    targetModel: "test-model",
    rawModel: "test-model",
    body: { model: "test-model", messages: [{ role: "user", content: "Hello" }], stream: true },
    req: { headers: {}, path: "/v1/responses", method: "POST" } as any,
    account: { id: "acc_1", name: "Test Account", rawApiKey: "tok_test" } as any,
    provider: { id: "test", name: "Test Provider" } as any,
    clientTool: "kiro",
    rtkStats: { compressedTokens: 0, tokensSaved: 0 },
    ...overrides,
  };
}

function makeMockResponse() {
  const chunks: string[] = [];
  let statusCode = 200;
  let jsonPayload: any = null;
  const res: any = {
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    setHeader() {
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
    _getStatus: () => statusCode,
    _getJson: () => jsonPayload,
  };
  return res;
}

function textStream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

test("opencode: shouldExecute + transforms Responses payload and executes Responses SSE", async () => {
  const opencode = new OpenCodeProvider();
  assert.equal(isResponsesModel("muse-spark-1.2-contributor-free"), true);
  assert.equal(isResponsesModel("muse-spark-1.3-contributor-free"), true);

  const respCtx = makeContext({
    targetModel: "muse-spark-1.3-contributor-free",
    provider: { id: "opencode", name: "OpenCode Free", baseUrl: "https://opencode.ai", format: "openai" } as any,
    body: {
      model: "muse-spark-1.3-contributor-free",
      temperature: 0.7,
      max_tokens: 2048,
      messages: [
        { role: "system", content: "Sys" },
        { role: "user", content: "Hi" },
      ],
      stream: true,
    },
  });
  assert.equal(opencode.shouldExecute(respCtx), true);
  assert.equal(opencode.resolveTargetFormat("muse-spark-1.3-contributor-free", "responses"), "openai-responses");

  const payload = opencode.transformRequestBody(respCtx);
  assert.equal(payload.store, false);
  assert.ok(String(payload.instructions).startsWith("Sys"));
  assert.equal(payload.max_output_tokens, 2048);
  assert.equal("messages" in payload, false);

  const chatCtx = makeContext({ ...respCtx, targetModel: "jev-1.13-free" });
  assert.equal(opencode.shouldExecute(chatCtx), false);

  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      textStream([
        `event: response.created\ndata: ${JSON.stringify({ type: "response.created", response: { id: "resp_oc" } })}\n\n`,
        `event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: "Zen OK" })}\n\n`,
        `event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: { id: "resp_oc", status: "completed" } })}\n\n`,
      ]),
      { status: 200, headers: { "content-type": "text/event-stream" } }
    )) as typeof fetch;

  try {
    const res = makeMockResponse();
    const out = await opencode.execute({ ...respCtx, res });
    assert.equal(out.ok, true);
    assert.ok(res._getChunks().join("").includes("Zen OK"));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("grok-cli: OAuth mode sends Responses payload and Cookie mode executes Grok Web NDJSON", async () => {
  const grokCli = new GrokSubscriptionProvider();
  const oauthCtx = makeContext({
    targetModel: "grok-4.20",
    provider: { id: "grok-cli", name: "SuperGrok", baseUrl: "https://cli-chat-proxy.grok.com/v1/responses", format: "openai-responses" } as any,
    account: { id: "acc_oauth", name: "OAuth", rawApiKey: "oauth_tok", providerSpecificData: { authType: "oauth" } } as any,
  });

  const payload = grokCli.transformRequestBody(oauthCtx);
  assert.equal(payload.store, false);
  assert.ok(Array.isArray(payload.input));
  assert.equal("messages" in payload, false);

  const origFetch = globalThis.fetch;
  let capturedUrl = "";
  globalThis.fetch = (async (url: any) => {
    capturedUrl = String(url);
    return new Response(
      textStream([
        JSON.stringify({ result: { response: { token: "Grok cookie hi" } } }) + "\n",
      ]),
      { status: 200, headers: { "content-type": "application/x-ndjson" } }
    );
  }) as typeof fetch;

  try {
    const cookieRes = makeMockResponse();
    const cookieCtx = makeContext({
      clientFormat: "responses",
      targetModel: "grok-4",
      provider: { id: "grok-cli", name: "SuperGrok" } as any,
      account: { id: "acc_cookie", name: "Cookie", rawApiKey: "sso=abc123", providerSpecificData: { authType: "cookie" } } as any,
      res: cookieRes,
    });
    const out = await grokCli.execute(cookieCtx);
    assert.equal(out.ok, true);
    assert.equal(capturedUrl, "https://grok.com/rest/app-chat/conversations/new");
    const written = cookieRes._getChunks().join("");
    assert.ok(written.includes("event: response.output_text.delta"));
    assert.ok(written.includes("Grok cookie hi"));
    assert.ok(written.includes("event: response.completed"));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("perplexity: registered provider converts /v1/agent & /v1/responses payloads and handles JSON responses", async () => {
  const registered = ProviderRegistry.get("perplexity");
  assert.ok(registered instanceof PerplexityProvider);

  const pplx = new PerplexityProvider();
  const agentCtx = makeContext({
    targetModel: "sonar-pro",
    provider: { id: "perplexity", name: "Perplexity", baseUrl: "https://api.perplexity.ai/v1/agent", format: "openai" } as any,
    body: {
      model: "sonar-pro",
      messages: [
        { role: "system", content: "Be concise" },
        { role: "user", content: "What is Mapigate?" },
      ],
      stream: false,
    },
  });
  assert.equal(pplx.shouldExecute(agentCtx), true);

  const payload = pplx.transformRequestBody(agentCtx);
  assert.equal(payload.instructions, "Be concise");
  assert.ok(Array.isArray(payload.input));
  assert.equal("store" in payload, false);
  assert.equal("messages" in payload, false);

  const chatCtx = makeContext({
    ...agentCtx,
    provider: { id: "perplexity", name: "Perplexity", baseUrl: "https://api.perplexity.ai/chat/completions", format: "openai" } as any,
  });
  assert.equal(pplx.shouldExecute(chatCtx), false);

  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        id: "resp_pplx_1",
        object: "response",
        status: "completed",
        output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "AI gateway" }] }],
        usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )) as typeof fetch;

  try {
    const res = makeMockResponse();
    const out = await pplx.execute({ ...agentCtx, res });
    assert.equal(out.ok, true);
    assert.equal(res._getJson().object, "response");
    assert.equal(res._getJson().output[0].content[0].text, "AI gateway");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("ollama: executes native /api/chat NDJSON stream and translates to Responses API", async () => {
  const ollama = new OllamaProvider();
  const nativeCtx = makeContext({
    clientFormat: "responses",
    targetModel: "qwen3:32b",
    provider: { id: "ollama", name: "Ollama", baseUrl: "http://localhost:11434/api/chat", format: "openai" } as any,
    body: { model: "qwen3:32b", messages: [{ role: "user", content: "Hi" }], stream: true },
  });

  assert.equal(ollama.buildUrl(nativeCtx), "http://localhost:11434/api/chat");
  assert.equal(ollama.shouldExecute(nativeCtx), true);

  const openAiCompatCtx = makeContext({
    ...nativeCtx,
    provider: { id: "ollama", name: "Ollama", baseUrl: "http://localhost:11434/v1/chat/completions", format: "openai" } as any,
  });
  assert.equal(ollama.shouldExecute(openAiCompatCtx), false);

  const origFetch = globalThis.fetch;
  let capturedBody: any = null;
  globalThis.fetch = (async (_url: any, init: any) => {
    capturedBody = JSON.parse(String(init.body));
    return new Response(
      textStream([
        JSON.stringify({ message: { role: "assistant", thinking: "plan", content: "" }, done: false }) + "\n",
        JSON.stringify({ message: { role: "assistant", content: "Done" }, done: false }) + "\n",
        JSON.stringify({ done: true, prompt_eval_count: 8, eval_count: 3 }) + "\n",
      ]),
      { status: 200, headers: { "content-type": "application/x-ndjson" } }
    );
  }) as typeof fetch;

  try {
    const res = makeMockResponse();
    const out = await ollama.execute({ ...nativeCtx, res });
    assert.equal(out.ok, true);
    assert.equal("stream_options" in capturedBody, false);
    assert.equal(capturedBody.stream, true);
    const written = res._getChunks().join("");
    assert.ok(written.includes("event: response.reasoning_summary_text.delta"));
    assert.ok(written.includes("event: response.output_text.delta"));
    assert.ok(written.includes("event: response.completed"));
    assert.ok(written.includes("data: [DONE]"));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("custom execution helper and commandcode support clientFormat='responses'", async () => {
  const res = makeMockResponse();
  const writer = createOpenAiClientStreamWriter(res, "responses", "req_helper", "test-model");
  writer.writeChunk({
    id: "chatcmpl-1",
    object: "chat.completion.chunk",
    created: 1,
    model: "test-model",
    choices: [{ index: 0, delta: { role: "assistant", content: "Chunk text" }, finish_reason: null }],
  });
  writer.finalize("stop", { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 });
  const streamOut = res._getChunks().join("");
  assert.ok(streamOut.includes("event: response.created"));
  assert.ok(streamOut.includes("event: response.output_text.delta"));
  assert.ok(streamOut.includes("Chunk text"));
  assert.ok(streamOut.includes("event: response.completed"));
  assert.ok(streamOut.includes("data: [DONE]"));

  const nonStreamOut = formatOpenAiResponseForClient(
    {
      id: "chatcmpl-2",
      object: "chat.completion",
      created: 1,
      model: "test-model",
      choices: [{ index: 0, message: { role: "assistant", content: "Plain" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
    },
    "responses",
    "req_helper"
  );
  assert.equal(nonStreamOut.object, "response");
  assert.equal(nonStreamOut.output[0].content[0].text, "Plain");

  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      textStream([
        `data: ${JSON.stringify({ type: "text-delta", text: "CC OK" })}\n\n`,
        `data: ${JSON.stringify({ type: "finish", finishReason: "stop" })}\n\n`,
        "data: [DONE]\n\n",
      ]),
      { status: 200, headers: { "content-type": "text/event-stream" } }
    )) as typeof fetch;

  try {
    const cc = new CommandcodeProvider();
    const ccRes = makeMockResponse();
    const out = await cc.execute(
      makeContext({
        clientFormat: "responses",
        targetModel: "deepseek/deepseek-v4-pro",
        provider: { id: "commandcode", name: "Command Code", baseUrl: "https://api.commandcode.ai/alpha/generate" } as any,
        body: { model: "deepseek/deepseek-v4-pro", messages: [{ role: "user", content: "hi" }], stream: false },
        res: ccRes,
      })
    );
    assert.equal(out.ok, true);
    assert.equal(ccRes._getJson().object, "response");
    assert.equal(ccRes._getJson().output[0].content[0].text, "CC OK");
  } finally {
    globalThis.fetch = origFetch;
  }
});
