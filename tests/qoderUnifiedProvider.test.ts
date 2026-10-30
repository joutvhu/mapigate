process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRegistry } from "../src/providers/core/registry.js";
import { metadata as qoderMetadata } from "../src/providers/runtime/qoder/metadata.js";
import { getRegistryProvider } from "../src/shared/constants/providerRegistry.js";

test("Qoder Unified Provider - Regions and Aliases Resolution", () => {
  // 1. Canonical provider resolution
  const qd = ProviderRegistry.get("qoder");
  assert.ok(qd, "ProviderRegistry must resolve qoder");
  assert.equal(qd.id, "qoder");
  assert.equal(qoderMetadata.name, "Qoder");
  assert.equal(qoderMetadata.category, "oauth");

  // 2. Regions verification
  assert.ok(qoderMetadata.regions && qoderMetadata.regions.length === 2);
  assert.equal(qoderMetadata.defaultRegion, "intl");
  assert.equal(qoderMetadata.regions[0].id, "intl");
  assert.equal(qoderMetadata.regions[1].id, "cn");

  // 3. Aliases resolution
  for (const alias of ["qoder-cn", "qdcn"]) {
    const canonical = ProviderRegistry.resolveCanonicalId(alias);
    assert.equal(canonical, "qoder", `Alias '${alias}' must resolve to 'qoder'`);
    const inst = ProviderRegistry.get(alias);
    assert.equal(inst.id, "qoder");
    const meta = getRegistryProvider(alias);
    assert.ok(meta, `Metadata for alias '${alias}' must exist`);
    assert.equal(meta?.id, "qoder");
  }
});

test("Qoder OAuth Handler - deviceCode and poll flow", async () => {
  const { qoderOAuthHandler } = await import("../src/providers/runtime/qoder/routes.js");

  // 1. Device code generation
  const devRes = await qoderOAuthHandler.deviceCode?.({ provider: "qoder", region: "intl" });
  assert.ok(devRes, "deviceCode must return result");
  assert.ok(devRes.device_code, "device_code must exist");
  assert.ok(devRes.codeVerifier, "codeVerifier must exist");
  assert.ok(devRes.verification_uri_complete?.includes("https://qoder.com/device/selectAccounts"));
  assert.ok(devRes.verification_uri_complete?.includes("challenge_method=S256"));

  // 2. Poll pending (mocking global fetch)
  const origFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestedMethod = "";
  let requestedHeaders: Record<string, string> = {};

  try {
    globalThis.fetch = async (input: any, init?: any) => {
      requestedUrl = String(input);
      requestedMethod = init?.method || "GET";
      requestedHeaders = init?.headers || {};
      return new Response(JSON.stringify({ errorCode: "NotFound", errorMessage: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    };

    const pollPending = await qoderOAuthHandler.poll?.({
      deviceCode: devRes.device_code,
      codeVerifier: devRes.codeVerifier,
      region: "intl",
    });

    assert.equal(requestedMethod, "GET", "Qoder poll must use GET method");
    assert.ok(requestedUrl.includes("https://openapi.qoder.sh/api/v1/deviceToken/poll"), "Must hit openapi.qoder.sh");
    assert.ok(requestedUrl.includes(`nonce=${encodeURIComponent(devRes.device_code!)}`), "Must pass nonce in query");
    assert.ok(requestedUrl.includes(`verifier=${encodeURIComponent(devRes.codeVerifier!)}`), "Must pass verifier in query");
    assert.ok(requestedUrl.includes("challenge_method=S256"), "Must pass challenge_method=S256");
    assert.equal(requestedHeaders["User-Agent"], "Go-http-client/2.0", "Must send Go-http-client/2.0 User-Agent");
    assert.equal(pollPending?.ok, false);
    assert.equal(pollPending?.error, "authorization_pending");

    // 3. Poll authorized success
    globalThis.fetch = async (input: any, init?: any) => {
      const url = String(input);
      if (url.includes("/api/v1/deviceToken/poll")) {
        return new Response(
          JSON.stringify({
            token: "dt-mock-token-12345",
            user_id: "user-999",
            refresh_token: "rf-123",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/api/v1/userinfo")) {
        return new Response(
          JSON.stringify({
            name: "Test Qoder User",
            email: "test@qoder.sh",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const pollSuccess = await qoderOAuthHandler.poll?.({
      deviceCode: devRes.device_code,
      codeVerifier: devRes.codeVerifier,
      region: "intl",
    });

    assert.equal(pollSuccess?.ok, true);
    assert.equal(pollSuccess?.success, true);
    assert.ok(pollSuccess?.account?.id);
    assert.equal(pollSuccess?.account?.name, "Test Qoder User");

    // 4. Exchange manual token
    const exchangeRes = await qoderOAuthHandler.exchange?.({
      provider: "qoder",
      code: "dt-manual-token-777",
      redirectUri: "http://localhost/callback",
    });
    assert.equal(exchangeRes?.success, true);
    assert.ok(exchangeRes?.account?.id);
    assert.equal(exchangeRes?.account?.name, "Test Qoder User");
  } finally {
    globalThis.fetch = origFetch;
  }
});
