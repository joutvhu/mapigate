process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { museOAuthHandler } from "../src/providers/catalog/muse/routes.js";
import { MuseProvider } from "../src/providers/catalog/muse/provider.js";

test("Muse OAuth Handler - deviceCode requests code and builds verification URI", async () => {
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input: any) => {
      const url = String(input);
      if (url.includes("/device/authorization/")) {
        return new Response(
          JSON.stringify({
            device_code: "muse_dev_123",
            user_code: "ABCD-WXYZ",
            verification_uri: "https://auth.meta.com/oauth/device/",
            verification_uri_complete: "https://auth.meta.com/oauth/device/?code=ABCD-WXYZ",
            expires_in: 600,
            interval: 5,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const res = await museOAuthHandler.deviceCode!();
    assert.equal(res.device_code, "muse_dev_123");
    assert.equal(res.user_code, "ABCD-WXYZ");
    assert.ok(res.verification_uri_complete?.includes("code=ABCD-WXYZ"));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("Muse OAuth Handler - poll handles pending and mints key on success", async () => {
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input: any) => {
      const url = String(input);
      if (url.includes("/device/token/")) {
        return new Response(
          JSON.stringify({
            access_token: "meta_access_tok_123",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/muse-code/key")) {
        return new Response(
          JSON.stringify({
            api_key: "LLM|sample-muse-model-api-key",
            is_subs_active: true,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const res = await museOAuthHandler.poll!({
      deviceCode: "muse_dev_123",
    });

    assert.equal(res.ok, true);
    assert.equal(res.success, true);
    assert.ok(res.account?.id);
    assert.equal(res.account?.providerId, "muse");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("Muse OAuth Handler - exchange supports manual API key", async () => {
  const res = await museOAuthHandler.exchange!({
    provider: "muse",
    code: "LLM|manual-model-key",
  });
  assert.equal(res.success, true);
  assert.ok(res.account?.id);
  assert.equal(res.account?.providerId, "muse");
});

test("MuseProvider - probeModels verifies key against /v1/models", async () => {
  const provider = new MuseProvider();

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
          JSON.stringify({ data: [{ id: "muse-spark-1.3" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const res = await provider.probeModels({
      apiKey: "LLM|valid-muse-key",
    } as any);

    assert.equal(res?.success, true);
    assert.ok((res?.count || 0) > 0);
  } finally {
    globalThis.fetch = origFetch;
  }
});
