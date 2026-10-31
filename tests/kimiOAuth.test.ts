process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { kimiOAuthHandler } from "../src/providers/runtime/kimi/routes.js";
import { ProviderRegistry } from "../src/providers/core/registry.js";

test("Kimi OAuth Handler - deviceCode requests code and builds complete verification URI", async () => {
  const origFetch = globalThis.fetch;
  let sentUrl = "";
  try {
    globalThis.fetch = async (input: any) => {
      sentUrl = String(input);
      const isCn = sentUrl.includes("auth.kimi.com");
      const base = isCn ? "https://www.kimi.com/code/authorize_device" : "https://www.kimi.ai/code/authorize_device";
      if (sentUrl.includes("/device_authorization")) {
        return new Response(
          JSON.stringify({
            device_code: "kimi_dev_123",
            user_code: "KIMI-456",
            verification_uri: base,
            verification_uri_complete: `${base}?user_code=KIMI-456`,
            expires_in: 1800,
            interval: 5,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    // 1. Default (International - kimi.ai)
    const resIntl = await kimiOAuthHandler.deviceCode!();
    assert.equal(resIntl.device_code, "kimi_dev_123");
    assert.equal(resIntl.user_code, "KIMI-456");
    assert.ok(sentUrl.includes("auth.kimi.ai"));
    assert.ok(resIntl.verification_uri_complete?.includes("https://www.kimi.ai/code/authorize_device"));

    // 2. China region (kimi.com)
    const resCn = await kimiOAuthHandler.deviceCode!({ region: "cn" });
    assert.ok(sentUrl.includes("auth.kimi.com"));
    assert.ok(resCn.verification_uri_complete?.includes("https://www.kimi.com/code/authorize_device"));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("MoonshotProvider - probeModels verifies API key", async () => {
  const { MoonshotProvider } = await import("../src/providers/catalog/moonshot/provider.js");
  const provider = new MoonshotProvider();

  // 1. Missing token
  const noToken = await provider.probeModels({} as any);
  assert.equal(noToken?.success, false);
  assert.ok(noToken?.error?.includes("required"));

  // 2. Valid token mock
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input: any) => {
      const url = String(input);
      if (url.includes("/v1/models")) {
        return new Response(
          JSON.stringify({
            data: [{ id: "kimi-k2.6" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const res = await provider.probeModels({
      apiKey: "sk-test-moonshot-key",
    } as any);

    assert.equal(res?.success, true);
    assert.ok((res?.count || 0) > 0);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("KimiProvider - probeModels verifies credentials", async () => {
  const provider = ProviderRegistry.get("kimi");

  // 1. Missing token
  const noToken = await provider.probeModels!({} as any);
  assert.equal(noToken?.success, false);
  assert.ok(noToken?.error?.includes("required"));

  // 2. Valid token mock
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input: any) => {
      const url = String(input);
      if (url.includes("/usages")) {
        return new Response(
          JSON.stringify({
            usage: { limit: 100, used: 20, remaining: 80 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const res = await provider.probeModels!({
      apiKey: "test-kimi-token",
    } as any);

    assert.equal(res?.success, true);
    assert.ok((res?.count || 0) > 0);
  } finally {
    globalThis.fetch = origFetch;
  }
});
