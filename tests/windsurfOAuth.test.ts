process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { windsurfOAuthHandler } from "../src/providers/runtime/windsurf/routes.js";

test("Windsurf OAuth Handler - authorize provides direct show-auth-code url", async () => {
  const authRes = await windsurfOAuthHandler.authorize?.({
    provider: "windsurf",
    redirectUri: "http://localhost:20127/callback",
    state: "test-state",
  });

  assert.ok(authRes);
  assert.equal(authRes.authUrl, "https://app.devin.ai/auth/windsurf/show-auth-code");
  assert.equal(authRes.flowType, "authorization_code");
});

test("Windsurf OAuth Handler - exchange direct API key", async () => {
  const result = await windsurfOAuthHandler.exchange?.({
    provider: "windsurf",
    code: "sk-ws-test-apikey-12345",
    redirectUri: "http://localhost:20127/callback",
  });

  assert.ok(result);
  assert.equal(result.success, true);
  assert.ok(result.account?.id);
  assert.equal(result.account?.providerId, "windsurf");
});

test("Windsurf OAuth Handler - exchange Devin auth code", async () => {
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input: any, init?: any) => {
      const url = String(input);
      if (url.includes("/ExchangeDevinCode")) {
        return new Response(
          JSON.stringify({
            sessionToken: "session_tok_abc123",
            auth1Token: "auth1_tok_xyz789",
            primaryOrgId: "org-devin-test",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const result = await windsurfOAuthHandler.exchange?.({
      provider: "windsurf",
      code: "devin-auth-code-999",
      redirectUri: "http://localhost:20127/callback",
    });

    assert.ok(result);
    assert.equal(result.success, true);
    assert.ok(result.account?.id);
    assert.equal(result.account?.name, "org-devin-test");
  } finally {
    globalThis.fetch = origFetch;
  }
});
