process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRegistry } from "../src/providers/core/registry.js";
import { metadata } from "../src/providers/catalog/gitlab/metadata.js";
import { OAuthHandlerRegistry } from "../src/providers/core/oauthRegistry.js";
import { isOAuthProvider } from "../src/web/src/constants/providersData.js";

test("GitLab is an API key provider, not an OAuth one", () => {
  assert.equal(metadata.category, "apikey");
  assert.deepEqual(metadata.authModes, ["apikey"]);
  assert.equal((metadata as any).oauth, undefined);
  assert.equal(isOAuthProvider(metadata as any), false, "must not be grouped with OAuth providers");
  assert.ok(ProviderRegistry.get("gitlab"), "gitlab must still be registered as a provider");
});

test("GitLab has no specialized OAuth handler registered", async () => {
  // Registration happens through the generated routes registry; load it the way the server does.
  const { Router } = await import("express");
  const { registerAllProviderRoutes } = await import("../src/providers/generated/routesRegistry.generated.js");
  registerAllProviderRoutes(Router());
  assert.equal(OAuthHandlerRegistry.getAll().has("gitlab"), false);
});

test("GitLabProvider - probeModels requires a token", async () => {
  const provider = ProviderRegistry.get("gitlab");
  const res = await provider.probeModels!({} as any);
  assert.equal(res?.success, false);
  assert.ok(res?.error?.includes("required"));
});

test("GitLabProvider - probeModels checks /api/v4/user on the instance origin, not the chat URL", async () => {
  const provider = ProviderRegistry.get("gitlab");
  const origFetch = globalThis.fetch;
  let calledUrl = "";
  let headers: any = {};
  try {
    globalThis.fetch = async (input: any, init?: any) => {
      calledUrl = String(input);
      headers = init?.headers || {};
      return new Response(JSON.stringify({ id: 1 }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    // modelScanner passes the chat-completions URL as baseUrl; it must not be used to build the check URL.
    const res = await provider.probeModels!({
      apiKey: "glpat-active-token",
      baseUrl: "https://gitlab.com/api/v4/chat/completions",
    } as any);

    assert.equal(res?.success, true);
    assert.equal(calledUrl, "https://gitlab.com/api/v4/user");
    assert.equal(headers["Private-Token"], "glpat-active-token");
    assert.ok((res?.count || 0) > 0);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("GitLabProvider - probeModels reports rejected tokens as auth errors", async () => {
  const provider = ProviderRegistry.get("gitlab");
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('{"message":"401 Unauthorized"}', { status: 401 });
    const res = await provider.probeModels!({ apiKey: "glpat-bad" } as any);
    assert.equal(res?.success, false);
    assert.ok(res?.authError, "401 must be flagged as an auth error");
  } finally {
    globalThis.fetch = origFetch;
  }
});
