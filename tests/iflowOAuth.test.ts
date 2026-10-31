process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { iflowOAuthHandler } from "../src/providers/catalog/iflow/routes.js";
import { IflowProvider } from "../src/providers/catalog/iflow/provider.js";

test("iFlow OAuth Handler - authorize builds valid authUrl", async () => {
  const res = await iflowOAuthHandler.authorize!({
    provider: "iflow",
    redirectUri: "http://localhost:20127/callback",
    state: "test-state",
  });

  assert.ok(res);
  assert.ok(res.authUrl.includes("https://iflow.cn/oauth"));
  assert.ok(res.authUrl.includes("client_id="));
  assert.ok(res.authUrl.includes("redirect="));
});

test("iFlow OAuth Handler - exchange fetches tokens and apiKey via getUserInfo", async () => {
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input: any) => {
      const url = String(input);
      if (url.includes("/oauth/token")) {
        return new Response(
          JSON.stringify({
            access_token: "mock-iflow-acc",
            refresh_token: "mock-iflow-ref",
            expires_in: 86400,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/api/oauth/getUserInfo")) {
        return new Response(
          JSON.stringify({
            success: true,
            code: "200",
            data: {
              userId: "10015799173",
              userName: "Giáo Hồ",
              email: "loveme05ye@gmail.com",
              apiKey: "sk-874bccd59af2bf03b33f2d490ffb52df",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const res = await iflowOAuthHandler.exchange!({
      provider: "iflow",
      code: "test-auth-code",
      redirectUri: "http://localhost:20127/callback",
    });

    assert.equal(res.success, true);
    assert.ok(res.account?.id);
    assert.equal(res.account?.name, "Giáo Hồ");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("IflowProvider - probeModels verifies credentials via getUserInfo", async () => {
  const provider = new IflowProvider();

  // 1. Missing token
  const noToken = await provider.probeModels({} as any);
  assert.equal(noToken?.success, false);
  assert.ok(noToken?.error?.includes("required"));

  // 2. Valid token mock
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input: any) => {
      const url = String(input);
      if (url.includes("/api/oauth/getUserInfo")) {
        return new Response(
          JSON.stringify({
            success: true,
            code: "200",
            data: {
              userId: "10015799173",
              userName: "Giáo Hồ",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const res = await provider.probeModels({
      account: {
        rawApiKey: "sk-874bccd59af2bf03b33f2d490ffb52df",
        providerSpecificData: {
          accessToken: "mock-access-token",
        },
      },
    } as any);

    assert.equal(res?.success, true);
    assert.ok((res?.count || 0) > 0);
  } finally {
    globalThis.fetch = origFetch;
  }
});
