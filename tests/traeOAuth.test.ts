process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { traeOAuthHandler } from "../src/providers/runtime/trae/routes.js";

test("Trae OAuth Handler - authorize builds valid authUrl with 127.0.0.1/authorize callback", async () => {
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input: any) => {
      const url = String(input);
      if (url.includes("/GetLoginGuidance")) {
        return new Response(JSON.stringify({ Result: { LoginHost: "www.trae.ai" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    };

    const res = await traeOAuthHandler.authorize?.({
      provider: "trae",
      redirectUri: "http://localhost:20128/callback",
      appPort: "20128",
    });

    assert.ok(res);
    assert.ok(res.authUrl.includes("https://www.trae.ai/authorization"));
    // Trae strict regex validation: /^http:\/\/127\.0\.0\.1:(\d+)\/authorize$/
    assert.ok(res.authUrl.includes("auth_callback_url=http%3A%2F%2F127.0.0.1%3A20128%2Fauthorize"));
    assert.equal(res.redirectUri, "http://127.0.0.1:20128/authorize");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("Trae OAuth Handler - exchange token from callback query", async () => {
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input: any) => {
      const url = String(input);
      if (url.includes("/ExchangeToken")) {
        return new Response(
          JSON.stringify({
            Result: {
              AccessToken: "trae-live-jwt-token-12345",
              RefreshToken: "trae-refresh-token-xyz",
              ExpiresAt: 1800000000,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/GetUserInfo")) {
        return new Response(
          JSON.stringify({
            Result: {
              Name: "Trae Developer",
              Email: "dev@trae.ai",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const callbackUrl = "http://127.0.0.1:20128/authorize?isRedirect=true&refreshToken=rf_12345&loginHost=api.marscode.com";
    const res = await traeOAuthHandler.exchange?.({
      provider: "trae",
      code: callbackUrl,
      redirectUri: "http://127.0.0.1:20128/authorize",
    });

    assert.ok(res);
    assert.equal(res.success, true);
    assert.ok(res.account?.id);
    assert.equal(res.account?.name, "Trae Developer");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("TraeProvider - probeModels verifies credentials via GetUserInfo", async () => {
  const { TraeProvider } = await import("../src/providers/runtime/trae/provider.js");
  const provider = new TraeProvider();

  // 1. Missing token
  const noToken = await provider.probeModels({} as any);
  assert.equal(noToken?.success, false);
  assert.ok(noToken?.error?.includes("required"));

  // 2. Valid token mock
  const origFetch = globalThis.fetch;
  let sentAuthHeader = "";
  try {
    globalThis.fetch = async (input: any, init?: any) => {
      const url = String(input);
      sentAuthHeader = init?.headers?.Authorization || "";
      if (url.includes("/GetUserInfo")) {
        return new Response(
          JSON.stringify({ Result: { Name: "Trae Active User", Email: "user@trae.ai" } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const res = await provider.probeModels({
      apiKey: "cloud_ide_jwt_sample_token",
    } as any);

    assert.equal(res?.success, true);
    assert.equal(sentAuthHeader, "Cloud-IDE-JWT cloud_ide_jwt_sample_token");
    assert.ok((res?.count || 0) > 0);
  } finally {
    globalThis.fetch = origFetch;
  }
});
