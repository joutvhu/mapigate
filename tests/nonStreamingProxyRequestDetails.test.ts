import test from "node:test";
import assert from "node:assert/strict";
import { handleProxyRequest } from "../src/server/proxy/chatProxy.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import { RequestDetailsRepository, flushRequestDetailsBuffer } from "../src/storage/repositories/requestDetailsRepo.js";
import type { Request, Response } from "express";

test("Proxy - Non-streaming request details persistence with full headers, tokens, and cost", async () => {
  const providerId = `test_prov_nonstream_${Date.now()}`;
  const accountId = `test_acc_nonstream_${Date.now()}`;
  const testModel = "gpt-4o-mini";

  // 1. Setup Provider & Account
  ProviderRepository.saveProvider({
    id: providerId,
    name: "Test Non-Streaming Provider",
    baseUrl: "https://api.test-provider.com/v1",
    format: "openai",
    isActive: true,
    priority: 1,
    models: [testModel],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  ProviderRepository.addAccount({
    id: accountId,
    providerId,
    name: "Primary Test Account",
    rawApiKey: "sk-test-secret-key-12345",
    isActive: true,
  });

  // 2. Mock global fetch
  const originalFetch = globalThis.fetch;
  const mockUpstreamResponse = {
    id: "chatcmpl-test-123",
    object: "chat.completion",
    created: 1700000000,
    model: testModel,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: "Hello! This is a non-streaming test response.",
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 42,
      completion_tokens: 18,
      total_tokens: 60,
      prompt_tokens_details: {
        cached_tokens: 10,
      },
      completion_tokens_details: {
        reasoning_tokens: 4,
      },
    },
  };

  const upstreamHeaders = new Headers({
    "content-type": "application/json",
    "x-request-id": "upstream-req-xyz-987",
    "x-ratelimit-remaining": "999",
    "server": "test-ai-gateway",
  });

  globalThis.fetch = (async (url: any, init: any) => {
    return {
      ok: true,
      status: 200,
      headers: upstreamHeaders,
      text: async () => JSON.stringify(mockUpstreamResponse),
      json: async () => mockUpstreamResponse,
    } as any;
  }) as typeof fetch;

  try {
    // 3. Prepare mock Express Request & Response
    const reqHeaders: Record<string, string> = {
      "content-type": "application/json",
      "user-agent": "test-coding-agent/1.0",
      "x-client-tool": "cursor",
      "authorization": "Bearer secret-bearer-token",
    };

    const reqBody = {
      model: `${providerId}/${testModel}`,
      messages: [{ role: "user", content: "Say hello non-streaming" }],
      stream: false,
    };

    const mockReq = {
      headers: reqHeaders,
      body: reqBody,
    } as unknown as Request;

    let responseStatusCode = 0;
    let responseJson: any = null;
    let responseHeadersSent = false;

    const mockRes = {
      get headersSent() {
        return responseHeadersSent;
      },
      status(code: number) {
        responseStatusCode = code;
        return this;
      },
      json(data: any) {
        responseJson = data;
        responseHeadersSent = true;
        return this;
      },
      send(data: any) {
        responseJson = data;
        responseHeadersSent = true;
        return this;
      },
      setHeader() {},
      write() {},
      end() {
        responseHeadersSent = true;
      },
    } as unknown as Response;

    // 4. Execute non-streaming request
    await handleProxyRequest(mockReq, mockRes, "openai");

    assert.equal(responseStatusCode, 200);
    assert.deepEqual(responseJson, mockUpstreamResponse);

    // 5. Verify RequestDetail persistence
    flushRequestDetailsBuffer();

    const list = RequestDetailsRepository.getRequestDetails({
      provider: providerId,
      pageSize: 5,
    });

    assert.ok(list.details.length >= 1, "Should have saved at least 1 request detail");
    const detail = list.details[0];

    assert.equal(detail.provider, providerId);
    assert.equal(detail.model, testModel);
    assert.equal(detail.status, 200);
    assert.equal(detail.clientTool, "cursor");

    // Token counts verification
    assert.equal(detail.tokens?.promptTokens, 42);
    assert.equal(detail.tokens?.completionTokens, 18);
    assert.equal(detail.tokens?.cachedTokens, 10);

    // Latency verification
    assert.ok(typeof detail.latency?.totalMs === "number");
    assert.ok(typeof detail.latency?.ttftMs === "number");
    assert.equal(detail.latency?.totalMs, detail.latency?.ttftMs);

    // Request headers & body
    assert.ok(detail.request?.headers);
    assert.equal(detail.request.headers["x-client-tool"], "cursor");
    assert.equal(detail.request.headers["authorization"], "[REDACTED]");
    assert.deepEqual(detail.request.body, reqBody);

    // Provider request
    assert.ok(detail.providerRequest?.url);
    assert.ok(detail.providerRequest?.headers);
    assert.equal(
      detail.providerRequest.headers["Authorization"] || detail.providerRequest.headers["authorization"],
      "[REDACTED]"
    );

    // Provider response headers & body
    assert.ok(detail.providerResponse);
    assert.equal(detail.providerResponse.status, 200);
    assert.equal(detail.providerResponse.headers?.["x-request-id"], "upstream-req-xyz-987");
    assert.deepEqual(detail.providerResponse.body, mockUpstreamResponse);

    // Client response headers & body
    assert.ok(detail.response);
    assert.equal(detail.response.status, 200);
    assert.equal(detail.response.headers?.["content-type"], "application/json");
    assert.deepEqual(detail.response.body, mockUpstreamResponse);
  } finally {
    globalThis.fetch = originalFetch;
    ProviderRepository.deleteAccount(accountId);
    ProviderRepository.deleteProvider(providerId);
  }
});

test("Proxy - Non-streaming request details persists raw text when upstream returns non-JSON", async () => {
  const providerId = `test_prov_rawtext_${Date.now()}`;
  const accountId = `test_acc_rawtext_${Date.now()}`;
  const testModel = "deepseek-coder";

  ProviderRepository.saveProvider({
    id: providerId,
    name: "Raw Text Provider",
    baseUrl: "https://api.rawtext.com/v1",
    format: "openai",
    isActive: true,
    priority: 1,
    models: [testModel],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  ProviderRepository.addAccount({
    id: accountId,
    providerId,
    name: "Raw Text Account",
    rawApiKey: "sk-raw-key",
    isActive: true,
  });

  const originalFetch = globalThis.fetch;
  const rawOutput = "Plain text completion from mock model";

  globalThis.fetch = (async () => {
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/plain", "x-provider": "raw-service" }),
      text: async () => rawOutput,
    } as any;
  }) as typeof fetch;

  try {
    const mockReq = {
      headers: { "user-agent": "cline/2.0" },
      body: {
        model: `${providerId}/${testModel}`,
        messages: [{ role: "user", content: "Generate plain text" }],
        stream: false,
      },
    } as unknown as Request;

    let responseData: any = null;
    const mockRes = {
      headersSent: false,
      status() { return this; },
      json(data: any) { responseData = data; return this; },
      send(data: any) { responseData = data; return this; },
      setHeader() {},
      write() {},
      end() {},
    } as unknown as Response;

    await handleProxyRequest(mockReq, mockRes, "openai");
    assert.equal(responseData, rawOutput);

    flushRequestDetailsBuffer();

    const list = RequestDetailsRepository.getRequestDetails({
      provider: providerId,
      pageSize: 5,
    });

    assert.ok(list.details.length >= 1);
    const detail = list.details[0];
    assert.equal(detail.status, 200);
    assert.equal(detail.response?.body, rawOutput);
    assert.equal(detail.response?.headers?.["content-type"], "text/plain");
    assert.equal(detail.providerResponse?.headers?.["x-provider"], "raw-service");
  } finally {
    globalThis.fetch = originalFetch;
    ProviderRepository.deleteAccount(accountId);
    ProviderRepository.deleteProvider(providerId);
  }
});
