import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRegistry } from "../src/providers/core/registry.js";
import { metadata } from "../src/providers/catalog/tinyfish/metadata.js";
import { TinyfishProvider } from "../src/providers/catalog/tinyfish/provider.js";

test("TinyFish Provider - metadata and registry resolution", () => {
  const instance = ProviderRegistry.get("tinyfish");
  assert.ok(instance, "Must resolve tinyfish provider instance");
  assert.equal(instance.id, "tinyfish");
  assert.equal(metadata.name, "TinyFish");
  assert.equal(metadata.category, "apikey");
  assert.equal(metadata.authType, "apikey");
  assert.equal(metadata.baseUrl, "https://api.search.tinyfish.ai");
  assert.equal(metadata.validateUrl, "https://api.search.tinyfish.ai/usage?limit=1");
  assert.ok(metadata.models.length >= 2, "Must contain default TinyFish models");
});

test("TinyFish Provider - probeModels verifies API key using X-API-Key header", async () => {
  const provider = new TinyfishProvider();
  const origFetch = global.fetch;

  let capturedHeaders: Record<string, string> = {};
  let capturedUrl = "";

  try {
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedHeaders = (init?.headers as Record<string, string>) || {};

      if (capturedHeaders["X-API-Key"] === "valid-tf-key") {
        return new Response(JSON.stringify({ usage: { total: 10 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: { message: "Invalid API Key" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    };

    // 1. Successful probe with valid key
    const successRes = await provider.probeModels({
      apiKey: "valid-tf-key",
      timeoutMs: 3000,
    });

    assert.equal(successRes?.success, true);
    assert.equal(capturedUrl, "https://api.search.tinyfish.ai/usage?limit=1");
    assert.equal(capturedHeaders["X-API-Key"], "valid-tf-key");
    assert.equal(capturedHeaders["Authorization"], undefined);
    assert.ok((successRes?.count || 0) >= 2);

    // 2. Failed probe with invalid key (HTTP 401)
    const failRes = await provider.probeModels({
      apiKey: "bad-key",
      timeoutMs: 3000,
    });

    assert.equal(failRes?.success, false);
    assert.ok(failRes?.authError?.includes("HTTP 401"));

    // 3. Missing API key
    const noKeyRes = await provider.probeModels({
      apiKey: "",
    });
    assert.equal(noKeyRes?.success, false);
    assert.ok(noKeyRes?.error?.includes("TinyFish API key is required"));
  } finally {
    global.fetch = origFetch;
  }
});

test("TinyFish Provider - buildHeaders uses X-API-Key instead of Authorization Bearer", async () => {
  const provider = new TinyfishProvider();
  const headers = await provider.buildHeaders({
    account: {
      id: "acc_1",
      name: "TF Test",
      rawApiKey: "test-secret-key",
      providerId: "tinyfish",
      isActive: true,
      priority: 1,
      createdAt: "",
      updatedAt: "",
    },
    req: {} as any,
    targetModel: "tinyfish/search",
    clientFormat: "openai",
    targetFormat: "openai",
    body: {},
    requestId: "req_1",
    startTime: Date.now(),
    clientTool: "test",
    rawModel: "tinyfish/search",
    rtkStats: { compressedTokens: 0, tokensSaved: 0 },
  });

  assert.equal(headers["X-API-Key"], "test-secret-key");
  assert.equal(headers["Authorization"], undefined, "Must strip standard Authorization Bearer header");
});
