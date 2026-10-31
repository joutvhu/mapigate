process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { ensureFreshCredentials, isTokenExpired } from "../src/core/usage/tokenHelper.js";
import { kimiOAuthHandler } from "../src/providers/runtime/kimi/routes.js";
import { clineOAuthHandler } from "../src/providers/runtime/cline/routes.js";
import { OAuthHandlerRegistry } from "../src/providers/core/oauthRegistry.js";

OAuthHandlerRegistry.register("kimi", kimiOAuthHandler);
OAuthHandlerRegistry.register("cline", clineOAuthHandler);

test("Token Helper - isTokenExpired checks expiration with safety window", () => {
  const now = Date.now();
  assert.equal(isTokenExpired(now - 1000), true, "past timestamp is expired");
  assert.equal(isTokenExpired(now + 30_000), true, "within 60s safety buffer is expired");
  assert.equal(isTokenExpired(now + 120_000), false, "future timestamp is valid");
});

test("Token Helper - ensureFreshCredentials refreshes Kimi token", async () => {
  const origFetch = globalThis.fetch;
  let sentBody = "";
  try {
    globalThis.fetch = async (input: any, init?: any) => {
      const url = String(input);
      if (url.includes("/api/oauth/token")) {
        sentBody = String(init?.body);
        return new Response(
          JSON.stringify({
            access_token: "new-kimi-acc-token",
            refresh_token: "new-kimi-ref-token",
            expires_in: 3600,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const res = await ensureFreshCredentials(
      "acc_test_kimi",
      "kimi",
      JSON.stringify({ accessToken: "old-acc", refreshToken: "old-ref", expiresAt: Date.now() - 5000 }),
      { refreshToken: "old-ref", expiresAt: Date.now() - 5000 },
      true
    );

    assert.equal(res.accessToken, "new-kimi-acc-token");
    assert.equal(res.refreshToken, "new-kimi-ref-token");
    assert.ok(sentBody.includes("grant_type=refresh_token"));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("Token Helper - ensureFreshCredentials refreshes Cline WorkOS token", async () => {
  const origFetch = globalThis.fetch;
  let sentPayload: any = null;
  try {
    globalThis.fetch = async (input: any, init?: any) => {
      const url = String(input);
      if (url.includes("workos.com/user_management/authenticate")) {
        sentPayload = JSON.parse(init?.body);
        return new Response(
          JSON.stringify({
            access_token: "new-cline-acc-token",
            refresh_token: "new-cline-ref-token",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const res = await ensureFreshCredentials(
      "acc_test_cline",
      "cline",
      JSON.stringify({ accessToken: "old-cline-acc", refreshToken: "old-cline-ref", expiresAt: Date.now() - 5000 }),
      { refreshToken: "old-cline-ref", expiresAt: Date.now() - 5000 },
      true
    );

    assert.equal(res.accessToken, "new-cline-acc-token");
    assert.equal(res.refreshToken, "new-cline-ref-token");
    assert.equal(sentPayload?.grant_type, "refresh_token");
  } finally {
    globalThis.fetch = origFetch;
  }
});
