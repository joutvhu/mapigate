process.env.NODE_ENV = "test";

import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GeminiProvider } from "../src/providers/runtime/gemini/provider.js";
import { GeminiCliProvider } from "../src/providers/runtime/gemini-cli/provider.js";
import { metadata as geminiMeta } from "../src/providers/runtime/gemini/metadata.js";
import { metadata as geminiCliMeta } from "../src/providers/runtime/gemini-cli/metadata.js";
import { ProviderRegistry } from "../src/providers/core/registry.js";

describe("Google Gemini (AI Studio) & Gemini CLI Providers Separation", () => {
  it("gemini provider points to official Google AI Studio OpenAI-compatible endpoint", () => {
    assert.equal(geminiMeta.id, "gemini");
    assert.equal(geminiMeta.format, "openai");
    assert.equal(geminiMeta.authType, "apikey");
    assert.equal(geminiMeta.baseUrl, "https://generativelanguage.googleapis.com/v1beta/openai");
    assert.equal(geminiMeta.validateUrl, "https://generativelanguage.googleapis.com/v1beta/openai/models");
    assert.equal(geminiMeta.notice?.apiKeyUrl, "https://aistudio.google.com/app/apikey");

    const providerInstance = new GeminiProvider();
    assert.equal(providerInstance.id, "gemini");
    assert.equal(providerInstance.defaultFormat, "openai");
    assert.equal(providerInstance.supportsQuota(), true);
  });

  it("gemini provider constructs proper OpenAI chat completions upstream URL", () => {
    const providerInstance = new GeminiProvider();
    const mockContext: any = {
      provider: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
      account: { rawApiKey: "AIzaSyFakeKey123" },
      targetModel: "gemini-2.5-flash",
      clientFormat: "openai",
    };

    const url = providerInstance.buildUrl(mockContext);
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
  });

  it("gemini-cli provider remains dedicated for Google Cloud Code OAuth flow", () => {
    assert.equal(geminiCliMeta.id, "gemini-cli");
    assert.equal(geminiCliMeta.baseUrl, "https://cloudcode-pa.googleapis.com/v1internal");
    assert.ok(geminiCliMeta.oauth?.authorizeUrl.includes("accounts.google.com"));

    const cliInstance = new GeminiCliProvider();
    assert.equal(cliInstance.id, "gemini-cli");
    assert.equal(cliInstance.supportsQuota(), true);
  });

  it("ProviderRegistry correctly resolves both distinct runtime providers", () => {
    const provGemini = ProviderRegistry.get("gemini");
    assert.ok(provGemini);
    assert.equal(provGemini.id, "gemini");
    assert.equal(provGemini.defaultFormat, "openai");

    const provGeminiCli = ProviderRegistry.get("gemini-cli");
    assert.ok(provGeminiCli);
    assert.equal(provGeminiCli.id, "gemini-cli");
  });
});

  it("gemini provider formats authorization header as Bearer token for OpenAI compatibility", async () => {
    const providerInstance = new GeminiProvider();
    const mockContext: any = {
      provider: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
      account: { rawApiKey: "AIzaSyTestApiKey456" },
      targetModel: "gemini-2.5-pro",
      clientFormat: "openai",
      req: { headers: {} },
    };

    const headers = await providerInstance.buildHeaders(mockContext);
    assert.equal(headers["Authorization"], "Bearer AIzaSyTestApiKey456");
    assert.equal(headers["Content-Type"], "application/json");
  });

  it("gemini provider probeModels successfully parses models from OpenAI compatible response", async () => {
    const providerInstance = new GeminiProvider();
    const origFetch = global.fetch;

    global.fetch = async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes("openai/models")) {
        assert.equal(init?.headers?.Authorization, "Bearer AIzaSyValidKey");
        return new Response(
          JSON.stringify({
            data: [
              { id: "gemini-2.5-pro", object: "model" },
              { id: "gemini-2.5-flash", object: "model" },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    try {
      const result = await providerInstance.probeModels({
        apiKey: "AIzaSyValidKey",
        timeoutMs: 3000,
      });

      assert.ok(result);
      assert.equal(result.success, true);
      assert.equal(result.count, 2);
      assert.ok(result.models?.some((m) => m.id === "gemini-2.5-pro"));
      assert.ok(result.models?.some((m) => m.id === "gemini-2.5-flash"));
    } finally {
      global.fetch = origFetch;
    }
  });

  it("gemini-cli getGeminiCliUsage parses weekly and session summary quotas without 403", async () => {
    const { getGeminiCliUsage } = await import("../src/providers/runtime/gemini-cli/quota.js");

    const mockFetch: typeof fetch = (async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes("loadCodeAssist")) {
        return new Response(
          JSON.stringify({
            cloudaicompanionProject: "mock-proj-123",
            currentTier: { name: "Google AI Free" },
            paidTier: { id: "g1-pro-tier", name: "Google AI Pro" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (urlStr.includes("retrieveUserQuotaSummary")) {
        return new Response(
          JSON.stringify({
            groups: [
              {
                displayName: "Gemini",
                buckets: [
                  { window: "WEEKLY", remainingFraction: 0.85, resetTime: "2026-10-30T00:00:00Z" },
                  { window: "5h", remainingFraction: 0.95, resetTime: "2026-10-25T12:00:00Z" },
                ],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    }) as any;

    const res = await getGeminiCliUsage("mock-access-token", {}, { fetchFn: mockFetch, force: true });
    assert.equal(res.plan, "Google AI Free");
    assert.ok(res.quotas);
    assert.ok(res.quotas.gemini_weekly);
    assert.equal(res.quotas.gemini_weekly.remainingPercentage, 85);
    assert.ok(res.quotas.gemini_session);
    assert.equal(res.quotas.gemini_session.remainingPercentage, 95);
  });

  it("gemini provider transformRequestBody strips unknown fields rejected by Google Protobuf JSON parser", () => {
    const providerInstance = new GeminiProvider();
    const transformed = providerInstance.transformRequestBody({
      provider: { id: "gemini" },
      account: { rawApiKey: "AIzaSyTest" },
      targetModel: "gemini-2.5-pro",
      clientFormat: "responses",
      body: {
        model: "gemini-4-carbon",
        origin: "AI_EDITOR",
        profileArn: "arn:aws:codewhisperer:us-east-1:123456:profile/abc",
        metadata: { "kiro:conversation_id": "conv-123" },
        store: false,
        previous_response_id: "resp_123",
        presence_penalty: 0.1,
        frequency_penalty: 0.2,
        parallel_tool_calls: true,
        messages: [
          {
            role: "user",
            content: "Hello",
            id: "msg_123",
            thinking_signature: "sig_abc",
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "read_file",
              description: "Read a file",
              strict: true,
              parameters: {
                type: "object",
                properties: { path: { type: "string" } },
              },
            },
          },
        ],
        tool_choice: "auto",
        temperature: 0.2,
        max_tokens: 4096,
        stream: true,
        reasoning_effort: "medium",
      },
    } as any);

    assert.equal(transformed.model, "gemini-2.5-pro");
    assert.equal(transformed.origin, undefined);
    assert.equal(transformed.profileArn, undefined);
    assert.equal(transformed.metadata, undefined);
    assert.equal(transformed.store, undefined);
    assert.equal(transformed.previous_response_id, undefined);
    assert.equal(transformed.presence_penalty, undefined);
    assert.equal(transformed.frequency_penalty, undefined);
    assert.equal(transformed.parallel_tool_calls, undefined);

    assert.deepEqual(transformed.messages, [{ role: "user", content: "Hello" }]);
    assert.equal(transformed.tools.length, 1);
    assert.equal(transformed.tools[0].function.name, "read_file");
    assert.equal(transformed.tools[0].function.strict, undefined);
    assert.equal(transformed.tool_choice, "auto");
    assert.equal(transformed.temperature, 0.2);
    assert.equal(transformed.max_tokens, 4096);
    assert.equal(transformed.stream, true);
    assert.equal(transformed.reasoning_effort, "medium");
  });
