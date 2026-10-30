import test from "node:test";
import assert from "node:assert/strict";
import { pipeSseStream } from "../src/server/proxy/streaming/sseStreamer.js";
import { handleStreamingResponse } from "../src/server/proxy/responseHandlers.js";
import type { ProviderRequestContext, IProvider } from "../src/providers/core/types.js";

// Mock express response object
function createMockResponse() {
  const headers: Record<string, string> = {};
  const chunks: string[] = [];
  return {
    headers,
    chunks,
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
      this.headersSent = true;
    },
    flushHeaders() {
      this.headersSent = true;
    },
    write(data: string) {
      this.headersSent = true;
      chunks.push(data);
      return true;
    },
    end() {
      this.writableEnded = true;
    },
    once() {},
    removeListener() {},
  } as any;
}

test("First-chunk buffering - pipeSseStream throws on empty immediate stream without sending headers", async () => {
  const mockRes = createMockResponse();
  const emptyStream = new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
  const upstreamRes = new Response(emptyStream, { status: 200 });

  const context: ProviderRequestContext = {
    req: {} as any,
    res: mockRes,
    targetModel: "gpt-4o",
    clientFormat: "openai",
    targetFormat: "openai",
    body: { stream: true },
    is1mContext: false,
    reqTag: "TEST",
    requestId: "req-1",
    startTime: Date.now(),
    clientTool: "test",
    rawModel: "gpt-4o",
    rtkStats: { compressedTokens: 0, tokensSaved: 0 },
  };

  const dummyProvider: IProvider = {
    id: "test",
    name: "Test",
    buildUrl: () => "http://test",
    buildHeaders: () => ({}),
    transformRequestBody: (ctx) => ctx.body,
  };

  await assert.rejects(
    async () => {
      await pipeSseStream(upstreamRes, mockRes, context, dummyProvider);
    },
    /ended immediately/
  );

  // Invariant: Headers must NOT be sent if first chunk failed
  assert.equal(mockRes.headersSent, false, "Headers must not be sent on empty stream");
  assert.equal(mockRes.chunks.length, 0, "No chunks should be written to client");
});

test("First-chunk buffering - handleStreamingResponse catches initial error and returns ok:false with headersSent:false", async () => {
  const mockRes = createMockResponse();
  const errorStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"error": {"message": "Rate limit reached", "code": "rate_limit_exceeded"}}\n\n'));
      controller.close();
    },
  });
  const upstreamRes = new Response(errorStream, { status: 200 });

  const context: ProviderRequestContext = {
    req: { path: "/v1/chat/completions" } as any,
    res: mockRes,
    targetModel: "claude-3-7-sonnet",
    clientFormat: "openai",
    targetFormat: "openai",
    body: { stream: true },
    is1mContext: false,
    reqTag: "TEST",
    requestId: "req-2",
    startTime: Date.now(),
    clientTool: "test",
    rawModel: "claude-3-7-sonnet",
    rtkStats: { compressedTokens: 0, tokensSaved: 0 },
  };

  const dummyProvider: IProvider = {
    id: "test",
    name: "Test",
    buildUrl: () => "http://test",
    buildHeaders: () => ({}),
    transformRequestBody: (ctx) => ctx.body,
  };

  const result = await handleStreamingResponse(
    upstreamRes,
    mockRes,
    context,
    dummyProvider,
    { upstreamUrl: "http://test", outgoingHeaders: {}, upstreamBody: {} }
  );

  assert.equal(result.ok, false, "handleStreamingResponse should return ok:false on initial stream error");
  assert.equal(result.status, 429, "Extracted rate limit status should be 429");
  assert.equal(mockRes.headersSent, false, "Headers must remain unsent to enable combo fallback");
});
