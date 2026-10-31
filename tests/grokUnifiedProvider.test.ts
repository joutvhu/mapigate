process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRegistry } from "../src/providers/core/registry.js";
import { metadata as supergrokMetadata } from "../src/providers/runtime/grok-cli/metadata.js";
import { metadata as grokMetadata } from "../src/providers/runtime/grok/metadata.js";

test("Grok Providers - Separation of Developer API and SuperGrok Subscription", () => {
  // 1. Official Developer API (xAI Grok)
  const xaiInstance = ProviderRegistry.get("grok");
  assert.ok(xaiInstance, "Must resolve grok instance");
  assert.equal(xaiInstance.id, "grok");
  assert.equal(grokMetadata.baseUrl, "https://api.x.ai/v1/chat/completions");

  const xaiAlias = ProviderRegistry.resolveCanonicalId("xai");
  assert.equal(xaiAlias, "grok", "'xai' alias must resolve to official 'grok'");

  // 2. SuperGrok (grok.com) Subscription Provider
  const subInstance = ProviderRegistry.get("grok-cli");
  assert.ok(subInstance, "Must resolve grok-cli subscription instance");
  assert.equal(subInstance.id, "grok-cli");
  assert.equal(supergrokMetadata.name, "SuperGrok (grok.com)");

  // 3. Aliases resolution for SuperGrok
  for (const alias of ["grok-web", "grok-build", "gb", "gcli", "gw", "supergrok"]) {
    const resolved = ProviderRegistry.resolveCanonicalId(alias);
    assert.equal(resolved, "grok-cli", `Alias '${alias}' must resolve to 'grok-cli'`);
    const instance = ProviderRegistry.get(alias);
    assert.equal(instance.id, "grok-cli", `Provider instance for alias '${alias}' must be grok-cli`);
  }

  // 4. Verify distinct endpoints
  assert.ok(supergrokMetadata.baseUrls.includes("https://cli-chat-proxy.grok.com/v1/responses"));
  assert.ok(supergrokMetadata.baseUrls.includes("https://grok.com/rest/app-chat/conversations/new"));
  assert.notEqual(supergrokMetadata.baseUrl, grokMetadata.baseUrl);
});

test("Grok OAuth Handler - deviceCode uses real public client_id and scopes", async () => {
  const { grokOAuthHandler } = await import("../src/providers/runtime/grok/routes.js");

  const origFetch = globalThis.fetch;
  let sentBody: any = null;
  try {
    globalThis.fetch = async (input: any, init?: any) => {
      sentBody = new URLSearchParams(init?.body);
      return new Response(
        JSON.stringify({
          device_code: "dev_code_123",
          user_code: "ABCD-EFGH",
          verification_uri: "https://accounts.x.ai/oauth2/device",
          verification_uri_complete: "https://accounts.x.ai/oauth2/device?user_code=ABCD-EFGH",
          expires_in: 1800,
          interval: 5,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const res = await grokOAuthHandler.deviceCode!();
    assert.equal(res.device_code, "dev_code_123");
    assert.equal(res.user_code, "ABCD-EFGH");
    assert.equal(sentBody.get("client_id"), "b1a00492-073a-47ea-816f-4c329264a828");
    assert.ok(sentBody.get("scope").includes("grok-cli:access"));
    assert.equal(sentBody.get("referrer"), "grok-build");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("Grok OAuth Handler - exchange supports manual token", async () => {
  const { grokOAuthHandler } = await import("../src/providers/runtime/grok/routes.js");
  const res = await grokOAuthHandler.exchange!({
    provider: "grok",
    code: "xai-test-manual-key",
  });
  assert.equal(res.success, true);
  assert.ok(res.account?.id);
  assert.equal(res.account?.providerId, "grok");
});
