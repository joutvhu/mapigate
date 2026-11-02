process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRegistry } from "../src/providers/core/registry.js";
import { metadata as minimaxMetadata } from "../src/providers/runtime/minimax/metadata.js";
import { metadata as minimaxCodeMetadata } from "../src/providers/runtime/minimax-code/metadata.js";

test("MiniMax Unified Providers - Clean separation of OAuth Code Agent and Direct API Key", () => {
  // 1. Direct API Key Provider (MiniMax)
  const minimaxInstance = ProviderRegistry.get("minimax");
  assert.ok(minimaxInstance, "Must resolve minimax provider");
  assert.equal(minimaxInstance.id, "minimax");
  assert.equal(minimaxMetadata.name, "MiniMax");
  assert.equal(minimaxMetadata.category, "apikey");
  assert.ok(minimaxMetadata.regions && minimaxMetadata.regions.length === 2);
  assert.equal(minimaxMetadata.defaultRegion, "global");

  for (const alias of ["minimax-cn", "minimax-coding"]) {
    const resolved = ProviderRegistry.resolveCanonicalId(alias);
    assert.equal(resolved, "minimax", `Alias '${alias}' must resolve to 'minimax'`);
    const inst = ProviderRegistry.get(alias);
    assert.equal(inst.id, "minimax");
  }

  // 2. OAuth Device Code Provider (MiniMax Code)
  const mcodeInstance = ProviderRegistry.get("minimax-code");
  assert.ok(mcodeInstance, "Must resolve minimax-code provider");
  assert.equal(mcodeInstance.id, "minimax-code");
  assert.equal(minimaxCodeMetadata.name, "MiniMax Code");
  assert.equal(minimaxCodeMetadata.category, "oauth");
  assert.ok(minimaxCodeMetadata.regions && minimaxCodeMetadata.regions.length === 2);
  assert.equal(minimaxCodeMetadata.defaultRegion, "global");

  for (const alias of ["minimax-code-global", "mmg", "mcode"]) {
    const resolved = ProviderRegistry.resolveCanonicalId(alias);
    assert.equal(resolved, "minimax-code", `Alias '${alias}' must resolve to 'minimax-code'`);
    const inst = ProviderRegistry.get(alias);
    assert.equal(inst.id, "minimax-code");
  }
});

test("MiniMax Code Provider - probeModels handles live models and HTTP 402 gracefully", async () => {
  const mcodeInstance = ProviderRegistry.get("minimax-code");
  assert.ok(mcodeInstance);

  const origFetch = global.fetch;
  try {
    // Test 1: HTTP 402 insufficient balance should be treated as successful auth with models scanned
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = String(input);
      if (urlStr.includes("/mavis/api/v1/models")) {
        return new Response(
          JSON.stringify({
            version: "1.0",
            providers: [
              {
                providerId: "minimax",
                config: {
                  models: {
                    "MiniMax-M3.1-Flash": {
                      name: "M3.1-Flash (Free)",
                      limit: { context: 512000, output: 128000 },
                      reasoning: true,
                    },
                    "MiniMax-M3": {
                      name: "M3",
                      limit: { context: 512000, output: 128000 },
                      reasoning: true,
                    },
                  },
                  model_order: ["MiniMax-M3.1-Flash", "MiniMax-M3"],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (urlStr.includes("/mavis/api/v1/llm/v1/messages")) {
        // Assert probe used MiniMax-M3.1-Flash
        const body = JSON.parse(String(init?.body || "{}"));
        assert.equal(body.model, "MiniMax-M3.1-Flash");

        return new Response(
          JSON.stringify({
            type: "error",
            error: { type: "insufficient_balance_error", message: "insufficient balance (1008)" },
          }),
          { status: 402, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response("Not found", { status: 404 });
    };

    const res = await mcodeInstance.probeModels?.({
      apiKey: "test-oauth-token",
    });

    assert.ok(res);
    assert.equal(res.success, true);
    assert.ok(res.models && res.models.length >= 2);
    assert.equal(res.models[0].id, "MiniMax-M3.1-Flash");
  } finally {
    global.fetch = origFetch;
  }
});

test("MiniMax Code Provider - probeModels reports invalid token on 401", async () => {
  const mcodeInstance = ProviderRegistry.get("minimax-code");
  assert.ok(mcodeInstance);

  const origFetch = global.fetch;
  try {
    global.fetch = async (input: RequestInfo | URL) => {
      const urlStr = String(input);
      if (urlStr.includes("/mavis/api/v1/models")) {
        return new Response(JSON.stringify({ providers: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ code: 401, message: "auth failed" }), { status: 401 });
    };

    const res = await mcodeInstance.probeModels?.({
      apiKey: "bad-token",
    });

    assert.ok(res);
    assert.equal(res.success, false);
    assert.match(res.authError || "", /Invalid or expired token/);
  } finally {
    global.fetch = origFetch;
  }
});

test("MiniMax Code - ensureFreshCredentials refreshes expired token with refresh_token", async () => {
  const { ensureFreshCredentials } = await import("../src/core/usage/tokenHelper.js");
  const { ProviderRepository } = await import("../src/storage/repositories/providerRepo.js");
  const { registerRoutes } = await import("../src/providers/runtime/minimax/routes.js");
  registerRoutes();

  const origFetch = global.fetch;
  const testAccId = "test_acc_minimax_refresh";
  try {
    ProviderRepository.ensureProviderExists("minimax-code");
    ProviderRepository.addAccount({
      id: testAccId,
      providerId: "minimax-code",
      name: "MiniMax Test Refresh",
      rawApiKey: "expired_access_token",
      providerSpecificData: {
        refreshToken: "valid_refresh_token_123",
        expiresAt: Date.now() - 100000,
        tokenExpiresAt: Date.now() - 100000,
        region: "global",
      },
    });

    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = String(input);
      if (urlStr.includes("account.minimax.io/oauth2/token")) {
        const bodyStr = String(init?.body || "");
        assert.ok(bodyStr.includes("grant_type=refresh_token"));
        assert.ok(bodyStr.includes("refresh_token=valid_refresh_token_123"));
        return new Response(
          JSON.stringify({
            access_token: "new_refreshed_access_token_456",
            refresh_token: "rotated_refresh_token_789",
            expires_in: 3600,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const fresh = await ensureFreshCredentials(
      testAccId,
      "minimax-code",
      "expired_access_token",
      {
        refreshToken: "valid_refresh_token_123",
        expiresAt: Date.now() - 100000,
        region: "global",
      }
    );

    assert.equal(fresh.accessToken, "new_refreshed_access_token_456");
    assert.equal(fresh.refreshToken, "rotated_refresh_token_789");

    const inDb = ProviderRepository.getAccountById(testAccId);
    assert.ok(inDb);
    assert.equal(inDb.rawApiKey, "new_refreshed_access_token_456");
    assert.equal(inDb.providerSpecificData?.refreshToken, "rotated_refresh_token_789");
  } finally {
    global.fetch = origFetch;
    try {
      ProviderRepository.deleteAccount(testAccId);
    } catch {}
  }
});
